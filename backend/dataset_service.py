import os
import json
import math
import datetime
import pandas as pd
import numpy as np
from database import get_db_connection, log_system_event
from statistics_engine import StatisticsEngine
from ml_engine import ml_engine
from ingestion import METADATA_CACHE

LAST_VALIDATION = {}
LAST_CLEANED_PATH = None


class DatasetService:
    @staticmethod
    def _read_file(file_path):
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in {".xlsx", ".xls", ".csv"}:
            raise ValueError(f"Unsupported file format '{ext}'. Upload .xlsx, .xls, or .csv.")
        sheet_names = []
        sheet_used = None
        if ext in {".xlsx", ".xls"}:
            xl = pd.ExcelFile(file_path)
            sheet_names = list(xl.sheet_names)
            sheet_used = "Cleaned_Data" if "Cleaned_Data" in sheet_names else sheet_names[0]
            df = xl.parse(sheet_used)
        else:
            df = pd.read_csv(file_path)
        return df, sheet_names, sheet_used, ext

    @staticmethod
    def _auto_map(columns):
        mapping = {
            "machine_temperature": None,
            "ambient_temperature": None,
            "timestamp": None,
            "target": None,
            "entry_id": None,
        }
        for col in columns:
            c = str(col).strip().lower().replace("-", " ").replace("_", " ")
            if mapping["machine_temperature"] is None and c in {
                "field1", "temperature", "machine temperature", "machine temp",
                "machine temp c", "machinetemp", "temp"
            }:
                mapping["machine_temperature"] = col
            elif mapping["ambient_temperature"] is None and c in {
                "field2", "ambient temperature", "ambient temp", "ambient",
                "ambient_temp", "ambienttemp"
            }:
                mapping["ambient_temperature"] = col
            elif mapping["timestamp"] is None and c in {
                "created at", "created_at", "timestamp", "time", "date", "datetime"
            }:
                mapping["timestamp"] = col
            elif mapping["target"] is None and c in {
                "anomaly flag", "anomaly_flag", "anomaly", "target", "label",
                "condition", "final prediction", "final_prediction"
            }:
                mapping["target"] = col
            elif mapping["entry_id"] is None and c in {
                "entry id", "entry_id", "id", "row id"
            }:
                mapping["entry_id"] = col
        return mapping

    @staticmethod
    def _missing_profile(df):
        rows = []
        n = len(df)
        for col in df.columns:
            s = df[col]
            nulls = int(s.isna().sum())
            blanks = 0
            if s.dtype == object or str(s.dtype).startswith("string"):
                blanks = int(s.astype(str).str.strip().isin(["", "nan", "None", "NULL", "null"]).sum())
            missing = max(nulls, blanks) if s.dtype == object else nulls
            rows.append({
                "column": str(col),
                "totalRows": n,
                "missingCount": int(missing),
                "missingPct": round((missing / n) * 100, 2) if n else 0.0,
                "dtype": str(s.dtype),
            })
        return rows

    @classmethod
    def inspect_and_validate_file(cls, file_path, original_filename="", column_mapping=None):
        try:
            df, sheet_names, sheet_used, ext = cls._read_file(file_path)
        except Exception as e:
            return {"success": False, "error": f"Dataset parsing error: {str(e)}"}

        original_rows = int(len(df))
        original_cols = int(df.shape[1])
        raw_cols = [str(c) for c in df.columns.tolist()]
        auto = cls._auto_map(raw_cols)
        mapping = {**auto, **(column_mapping or {})}

        issues = []
        warnings = []
        invalid_samples = []
        critical_fail = False

        if original_rows == 0:
            issues.append({"severity": "CRITICAL", "check": "row_count", "message": "File contains 0 data rows."})
            critical_fail = True
        if original_cols == 0:
            issues.append({"severity": "CRITICAL", "check": "column_count", "message": "File contains 0 columns."})
            critical_fail = True

        temp_col = mapping.get("machine_temperature")
        amb_col = mapping.get("ambient_temperature")
        time_col = mapping.get("timestamp")
        target_col = mapping.get("target")
        id_col = mapping.get("entry_id")

        if not temp_col or temp_col not in df.columns:
            issues.append({
                "severity": "CRITICAL",
                "check": "required_columns",
                "message": "Machine Temperature column was not identified. Map it before running ML."
            })
            critical_fail = True
            temp_col = None
        if not amb_col or amb_col not in df.columns:
            issues.append({
                "severity": "CRITICAL",
                "check": "required_columns",
                "message": "Ambient Temperature column was not identified. Map it before running ML."
            })
            critical_fail = True
            amb_col = None

        missing_profile = cls._missing_profile(df)
        missing_cells = int(df.isna().sum().sum())
        null_pct = round((missing_cells / max(1, original_rows * original_cols)) * 100, 2)

        dup_rows = int(df.duplicated().sum())
        dup_ts = 0
        if time_col and time_col in df.columns:
            dup_ts = int(df[time_col].duplicated().sum())
        dup_entry = 0
        if id_col and id_col in df.columns:
            dup_entry = int(df[id_col].duplicated().sum())

        if dup_rows:
            warnings.append({
                "severity": "WARNING",
                "check": "duplicate_rows",
                "message": f"{dup_rows} duplicate rows ({round(dup_rows / max(1, original_rows) * 100, 2)}%). Not deleted."
            })
        if dup_ts:
            warnings.append({
                "severity": "WARNING",
                "check": "duplicate_timestamps",
                "message": f"{dup_ts} duplicate timestamps. Not deleted."
            })
        if dup_entry:
            warnings.append({
                "severity": "WARNING",
                "check": "duplicate_entry_ids",
                "message": f"{dup_entry} duplicate Entry IDs. Not deleted."
            })

        invalid_numeric = {}
        inf_counts = {}
        outlier_info = {}
        constant_cols = []
        near_zero_var = []
        timestamp_issues = {}

        def numeric_audit(col, label):
            raw = df[col]
            coerced = pd.to_numeric(raw, errors="coerce")
            non_numeric = int(raw.notna() & coerced.isna() & ~raw.astype(str).str.strip().isin(["", "nan", "None", "NULL"]))
            infs = int(np.isinf(coerced.fillna(0)).sum()) if len(coerced) else 0
            invalid_numeric[label] = non_numeric
            inf_counts[label] = infs
            if non_numeric:
                bad_idx = raw.index[raw.notna() & coerced.isna()].tolist()[:20]
                for i in bad_idx:
                    invalid_samples.append({
                        "row": int(i) + 2,
                        "column": str(col),
                        "value": str(raw.iloc[i] if i < len(raw) else ""),
                        "problem": "Non-numeric value in numeric column"
                    })
                issues.append({
                    "severity": "WARNING",
                    "check": "invalid_numeric",
                    "message": f"{non_numeric} non-numeric values in {label}."
                })
            if infs:
                issues.append({
                    "severity": "WARNING",
                    "check": "infinite_values",
                    "message": f"{infs} infinite values in {label}."
                })
            clean = coerced.replace([np.inf, -np.inf], np.nan).dropna()
            if len(clean) >= 8:
                q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
                iqr = q3 - q1
                mean, std = float(clean.mean()), float(clean.std() or 0)
                iqr_mask = (clean < (q1 - 1.5 * iqr)) | (clean > (q3 + 1.5 * iqr))
                z_mask = ((clean - mean).abs() > (3 * std)) if std > 0 else pd.Series(False, index=clean.index)
                n_out = int((iqr_mask | z_mask).sum())
                outlier_info[label] = {
                    "potentialOutliers": n_out,
                    "method": "IQR 1.5 fence and |z| > 3",
                    "note": "Potential outliers are flagged only. They are not deleted because high temperature may be a real failure."
                }
            return coerced

        machine_num = ambient_num = None
        if temp_col:
            machine_num = numeric_audit(temp_col, "Machine Temperature")
            phys_bad = int(((machine_num < -30) | (machine_num > 150)).sum())
            if phys_bad:
                issues.append({
                    "severity": "WARNING",
                    "check": "machine_temp_validity",
                    "message": f"{phys_bad} Machine Temperature values outside physical range -30°C to 150°C."
                })
        if amb_col:
            ambient_num = numeric_audit(amb_col, "Ambient Temperature")
            phys_bad = int(((ambient_num < -40) | (ambient_num > 80)).sum())
            if phys_bad:
                issues.append({
                    "severity": "WARNING",
                    "check": "ambient_temp_validity",
                    "message": f"{phys_bad} Ambient Temperature values outside physical range -40°C to 80°C."
                })

        if time_col and time_col in df.columns:
            parsed = pd.to_datetime(df[time_col], errors="coerce")
            invalid_ts = int(parsed.isna().sum())
            timestamp_issues = {
                "invalidTimestamps": invalid_ts,
                "orderedAscending": bool(parsed.dropna().is_monotonic_increasing),
            }
            if invalid_ts:
                issues.append({
                    "severity": "WARNING",
                    "check": "invalid_timestamps",
                    "message": f"{invalid_ts} invalid timestamps."
                })
            if not timestamp_issues["orderedAscending"] and parsed.notna().sum() > 2:
                warnings.append({
                    "severity": "WARNING",
                    "check": "timestamp_ordering",
                    "message": "Timestamps are not strictly increasing. Chronological ML split will sort by time."
                })

        class_dist = None
        if target_col and target_col in df.columns:
            class_dist = df[target_col].value_counts(dropna=False).to_dict()
            class_dist = {str(k): int(v) for k, v in class_dist.items()}

        for col in df.columns:
            s = pd.to_numeric(df[col], errors="coerce")
            if s.notna().sum() >= 5 and float(s.std() or 0) == 0:
                constant_cols.append(str(col))
            elif s.notna().sum() >= 5 and float(s.std() or 0) < 1e-8:
                near_zero_var.append(str(col))

        leakage = []
        leak_names = {"anomaly_flag", "anomaly", "final_prediction", "condition", "rf_probability", "target"}
        for col in raw_cols:
            if str(col).strip().lower().replace(" ", "_") in leak_names and mapping.get("target") != col:
                leakage.append(str(col))

        valid_mask = pd.Series([True] * original_rows)
        if machine_num is not None:
            valid_mask &= machine_num.notna() & ~np.isinf(machine_num.fillna(0))
        if ambient_num is not None:
            valid_mask &= ambient_num.notna() & ~np.isinf(ambient_num.fillna(0))
        valid_rows = int(valid_mask.sum())
        invalid_rows = original_rows - valid_rows

        quality = 100.0
        if critical_fail:
            quality -= 40
        quality -= min(25.0, null_pct * 1.5)
        quality -= min(15.0, (dup_rows / max(1, original_rows)) * 50)
        quality -= min(15.0, sum(invalid_numeric.values()) * 0.5)
        if not time_col:
            quality -= 5
        quality = max(0.0, min(100.0, round(quality, 1)))

        if critical_fail or quality < 40 or valid_rows < 10:
            status = "DATASET INVALID"
            is_valid = False
        elif issues or warnings or quality < 85:
            status = "DATASET VALID WITH WARNINGS"
            is_valid = True
        else:
            status = "DATASET VALID"
            is_valid = True

        result = {
            "success": True,
            "filename": original_filename or os.path.basename(file_path),
            "fileFormat": ext,
            "readable": True,
            "rowCount": original_rows,
            "columnCount": original_cols,
            "sheetNames": sheet_names,
            "sheetUsed": sheet_used,
            "rawColumns": raw_cols,
            "suggestedMapping": auto,
            "columnMapping": mapping,
            "missingProfile": missing_profile,
            "missingCells": missing_cells,
            "nullPercentage": null_pct,
            "duplicateRows": dup_rows,
            "duplicateRowPct": round(dup_rows / max(1, original_rows) * 100, 2),
            "duplicateTimestamps": dup_ts,
            "duplicateEntryIds": dup_entry,
            "invalidNumeric": invalid_numeric,
            "infiniteValues": inf_counts,
            "invalidSamples": invalid_samples[:50],
            "outliers": outlier_info,
            "constantColumns": constant_cols,
            "nearZeroVarianceColumns": near_zero_var,
            "timestampIssues": timestamp_issues,
            "classDistribution": class_dist,
            "potentialLeakageColumns": leakage,
            "qualityScore": quality,
            "validationStatus": status,
            "isValidForImport": is_valid,
            "originalRows": original_rows,
            "validRows": valid_rows,
            "invalidRows": invalid_rows,
            "missingRows": int(df.isna().any(axis=1).sum()),
            "issues": [i["message"] if isinstance(i, dict) else i for i in issues + warnings],
            "issueDetails": issues + warnings,
            "mlGate": {
                "allowed": is_valid and not critical_fail,
                "message": (
                    "Validation passed. You may run statistics and ML."
                    if is_valid else
                    "Dataset validation failed. Fix the highlighted issues before running ML analysis."
                )
            },
            "tempFilePath": file_path,
        }
        LAST_VALIDATION.clear()
        LAST_VALIDATION.update(result)
        return result

    @classmethod
    def build_cleaned_frame(cls, file_path, column_mapping=None, drop_invalid=True):
        val = cls.inspect_and_validate_file(file_path, os.path.basename(file_path), column_mapping)
        if not val.get("success"):
            return None, val
        df, _, _, _ = cls._read_file(file_path)
        mapping = val["columnMapping"]
        mach_col = mapping.get("machine_temperature")
        amb_col = mapping.get("ambient_temperature")
        time_col = mapping.get("timestamp")
        id_col = mapping.get("entry_id")
        target_col = mapping.get("target")

        clean = pd.DataFrame(index=df.index)
        clean["Temperature"] = pd.to_numeric(df[mach_col], errors="coerce") if mach_col else np.nan
        clean["Ambient_Temperature"] = pd.to_numeric(df[amb_col], errors="coerce") if amb_col else np.nan
        if id_col and id_col in df.columns:
            clean["entry_id"] = pd.to_numeric(df[id_col], errors="coerce")
        else:
            clean["entry_id"] = np.arange(1, len(df) + 1)
        if time_col and time_col in df.columns:
            clean["created_at"] = pd.to_datetime(df[time_col], errors="coerce")
        else:
            clean["created_at"] = pd.NaT
        if target_col and target_col in df.columns:
            clean["_target_raw"] = df[target_col]
        else:
            clean["_target_raw"] = np.nan

        if drop_invalid:
            before = len(clean)
            clean = clean.replace([np.inf, -np.inf], np.nan)
            clean = clean.dropna(subset=["Temperature", "Ambient_Temperature"])
            dropped = before - len(clean)
        else:
            dropped = 0
        clean = clean.reset_index(drop=True)

        if clean["created_at"].isna().all():
            clean["created_at"] = pd.date_range(end=datetime.datetime.now(datetime.timezone.utc), periods=len(clean), freq="15s")
        else:
            clean = clean.sort_values("created_at").reset_index(drop=True)

        clean["Temperature_Difference"] = clean["Temperature"] - clean["Ambient_Temperature"]
        clean["Rolling_Mean_10"] = clean["Temperature"].rolling(10, min_periods=1).mean()
        clean["Rolling_Median_10"] = clean["Temperature"].rolling(10, min_periods=1).median()
        clean["Rolling_Std_10"] = clean["Temperature"].rolling(10, min_periods=1).std().fillna(0.1).clip(lower=0.05)
        clean["Rate_Of_Change"] = clean["Temperature"].diff().fillna(0.0)
        clean["Temperature_Trend"] = np.where(
            clean["Rate_Of_Change"] > 0.2, "Rising",
            np.where(clean["Rate_Of_Change"] < -0.2, "Falling", "Stable")
        )
        if len(clean):
            norm_low = float(clean["Temperature"].quantile(0.05))
            norm_high = float(clean["Temperature"].quantile(0.95))
        else:
            norm_low, norm_high = 0.0, 0.0
        clean["Deviation_From_Normal"] = np.maximum(0.0, clean["Temperature"] - norm_high) + np.maximum(0.0, norm_low - clean["Temperature"])
        clean["Local_Z_Score"] = (clean["Temperature"] - clean["Rolling_Mean_10"]) / clean["Rolling_Std_10"]

        ts = pd.to_datetime(clean["created_at"], utc=True, errors="coerce")
        clean["Hour"] = ts.dt.hour.fillna(0).astype(int)
        clean["Minute"] = ts.dt.minute.fillna(0).astype(int)
        clean["DayOfWeek"] = ts.dt.dayofweek.fillna(0).astype(int)

        if target_col and clean["_target_raw"].notna().any():
            aligned = clean["_target_raw"]
            mapped = aligned.astype(str).str.lower().isin(["1", "true", "anomaly", "yes"])
            numeric = pd.to_numeric(aligned, errors="coerce").fillna(0)
            clean["Anomaly_Flag"] = np.where(mapped | (numeric == 1), 1, 0).astype(int)
        else:
            clean["Anomaly_Flag"] = np.where(
                (clean["Local_Z_Score"].abs() > 2.8) | (clean["Deviation_From_Normal"] > 4.0), 1, 0
            ).astype(int)
        clean = clean.drop(columns=["_target_raw"])

        clean["Condition"] = np.where(clean["Anomaly_Flag"] == 1, "Anomaly", "Normal")
        clean["Anomaly_Score"] = np.where(clean["Anomaly_Flag"] == 1, 0.65, 0.35)
        clean["Final_Prediction"] = clean["Condition"]
        clean["Final_Confidence"] = np.nan
        val["cleanedRows"] = int(len(clean))
        val["droppedInvalidRows"] = int(dropped)
        val["cleaningNotes"] = [
            "Original uploaded file was not overwritten.",
            "Rows with invalid Machine or Ambient Temperature were excluded from the cleaned set only.",
            "Duplicate rows and potential outliers were retained unless they were non-numeric.",
            "No invented temperature values were filled in.",
        ]
        return clean, val

    @classmethod
    def import_validated_dataset(cls, file_path, original_filename="", column_mapping=None, run_ml=False):
        val = cls.inspect_and_validate_file(file_path, original_filename, column_mapping)
        if not val.get("success") or not val.get("isValidForImport"):
            return {
                "success": False,
                "error": "Dataset validation failed. Fix the highlighted issues before running ML analysis.",
                "validation": val,
            }
        try:
            clean_df, val = cls.build_cleaned_frame(file_path, column_mapping, drop_invalid=True)
            if clean_df is None or len(clean_df) == 0:
                return {"success": False, "error": "No valid rows remain after cleaning."}

            originals_dir = os.path.join(os.path.dirname(file_path), "originals")
            os.makedirs(originals_dir, exist_ok=True)
            original_keep = os.path.join(originals_dir, os.path.basename(file_path))
            if os.path.abspath(file_path) != os.path.abspath(original_keep):
                try:
                    import shutil
                    shutil.copy2(file_path, original_keep)
                except Exception:
                    original_keep = file_path

            cleaned_path = os.path.join(os.path.dirname(file_path), f"cleaned_{os.path.splitext(os.path.basename(file_path))[0]}.csv")
            clean_df.to_csv(cleaned_path, index=False)
            global LAST_CLEANED_PATH
            LAST_CLEANED_PATH = cleaned_path

            dataset_stats = StatisticsEngine.compute_full_dataset_analytics(clean_df)
            METADATA_CACHE["dataset_statistics"] = dataset_stats
            METADATA_CACHE["ml_gate_ready"] = True
            METADATA_CACHE["last_cleaned_path"] = cleaned_path
            METADATA_CACHE["last_dataset_name"] = original_filename

            ml_result = None
            if run_ml:
                ok = ml_engine.train_models(clean_df, dataset_name=original_filename or os.path.basename(file_path))
                ml_result = ml_engine.diagnostics
                if not ok:
                    return {
                        "success": True,
                        "importedRows": int(len(clean_df)),
                        "ml": {"status": "ERROR", "diagnostics": ml_result},
                        "message": "Dataset imported. ML training failed. See model diagnostics.",
                    }

            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM readings WHERE is_live = 0;")
            records = []
            for _, r in clean_df.iterrows():
                dt_str = str(r["created_at"])
                try:
                    ts = pd.to_datetime(r["created_at"]).timestamp()
                except Exception:
                    ts = 0.0
                records.append((
                    int(r["entry_id"]) if pd.notna(r["entry_id"]) else None,
                    dt_str, dt_str, dt_str,
                    float(r["Temperature"]), float(r["Ambient_Temperature"]),
                    float(r["Temperature_Difference"]), float(r["Rolling_Mean_10"]),
                    float(r["Rolling_Median_10"]), float(r["Rolling_Std_10"]),
                    float(r["Rate_Of_Change"]), str(r["Temperature_Trend"]),
                    float(r["Deviation_From_Normal"]), float(r["Local_Z_Score"]),
                    str(r["Condition"]), int(r["Anomaly_Flag"]), float(r["Anomaly_Score"]),
                    int(r["Anomaly_Flag"]), None, int(r["Anomaly_Flag"]), None,
                    int(r["Anomaly_Flag"]), None, int(r["Anomaly_Flag"]), float(r["Anomaly_Score"]),
                    str(r["Final_Prediction"]), None, 0, "HISTORICAL_DATASET", ts,
                    "HISTORICAL_DATASET", None
                ))
            cursor.executemany("""
            INSERT INTO readings (
                entry_id, created_at, thingspeak_created_at, fetch_timestamp, temperature, ambient_temperature,
                temperature_difference, rolling_mean_10, rolling_median_10, rolling_std_10, rate_of_change,
                temperature_trend, deviation_from_normal, local_z_score, condition, anomaly_flag,
                anomaly_score, rf_prediction, rf_probability, xgb_prediction, xgb_probability,
                svc_prediction, svc_probability, isolation_forest_prediction, isolation_forest_score,
                final_prediction, final_confidence, is_live, data_source, created_timestamp,
                detection_method, health_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, records)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            cursor.execute("UPDATE uploaded_datasets SET is_active = 0 WHERE is_active = 1;")
            cursor.execute("""
            INSERT INTO uploaded_datasets (
                filename, file_path, row_count, column_count, quality_score, mapping_info, validation_summary, is_active, uploaded_by, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'OPERATOR', ?);
            """, (
                original_filename or os.path.basename(file_path),
                original_keep,
                len(clean_df),
                len(clean_df.columns),
                val["qualityScore"],
                json.dumps(val["columnMapping"]),
                json.dumps(val.get("issueDetails", [])),
                now_iso
            ))
            conn.commit()
            conn.close()
            log_system_event("INFO", "DATASET_SERVICE", f"Imported {len(records)} cleaned records from {original_filename}")
            return {
                "success": True,
                "importedRows": len(records),
                "filename": original_filename or os.path.basename(file_path),
                "originalFilePath": original_keep,
                "cleanedFilePath": cleaned_path,
                "validation": val,
                "statistics": dataset_stats,
                "mlRan": bool(run_ml),
                "ml": ml_result,
                "message": (
                    f"Imported {len(records)} validated rows. Original file preserved. "
                    + ("ML training completed." if run_ml else "ML was not run. Use Run ML after reviewing validation.")
                )
            }
        except Exception as e:
            print(f"Error importing dataset: {e}")
            return {"success": False, "error": f"Import failed: {str(e)}"}

    @classmethod
    def run_ml_on_last_dataset(cls):
        if not METADATA_CACHE.get("ml_gate_ready"):
            return {
                "success": False,
                "error": "Dataset validation failed. Fix the highlighted issues before running ML analysis."
            }
        conn = get_db_connection()
        df = pd.read_sql_query(
            """
            SELECT temperature AS Temperature, ambient_temperature AS Ambient_Temperature,
                   temperature_difference AS Temperature_Difference, rolling_mean_10 AS Rolling_Mean_10,
                   rolling_median_10 AS Rolling_Median_10, rolling_std_10 AS Rolling_Std_10,
                   rate_of_change AS Rate_Of_Change, deviation_from_normal AS Deviation_From_Normal,
                   local_z_score AS Local_Z_Score, anomaly_flag AS Anomaly_Flag, created_at
            FROM readings WHERE is_live = 0 ORDER BY id ASC;
            """,
            conn
        )
        conn.close()
        if df.empty:
            return {"success": False, "error": "No validated historical dataset is loaded."}
        ts = pd.to_datetime(df["created_at"], utc=True, errors="coerce")
        df["Hour"] = ts.dt.hour.fillna(0).astype(int)
        df["Minute"] = ts.dt.minute.fillna(0).astype(int)
        df["DayOfWeek"] = ts.dt.dayofweek.fillna(0).astype(int)
        name = METADATA_CACHE.get("last_dataset_name", "validated_dataset")
        ok = ml_engine.train_models(df, dataset_name=name)
        return {
            "success": ok,
            "diagnostics": ml_engine.diagnostics,
            "error": None if ok else ml_engine.diagnostics.get("error"),
        }
