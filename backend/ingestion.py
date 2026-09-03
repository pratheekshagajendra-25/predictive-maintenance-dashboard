import os
import json
import datetime
import pandas as pd
from config import Config
from database import get_db_connection, log_system_event
from statistics_engine import StatisticsEngine

# In-memory analytical cache for fast query serving
METADATA_CACHE = {
    "model_performance": [],
    "feature_importance": [],
    "anomaly_summary": {},
    "data_dictionary": [],
    "shap_summary": [],
    "dataset_statistics": {}
}

def load_excel_dataset():
    excel_path = Config.EXCEL_PATH
    if not os.path.exists(excel_path):
        print(f"Warning: Excel dataset not found at {excel_path}")
        return None

    try:
        xl = pd.ExcelFile(excel_path)
        print(f"Loading workbook: {excel_path} (Sheets: {xl.sheet_names})")

        # 1. Cleaned_Data
        cleaned_df = xl.parse("Cleaned_Data")
        print(f"Cleaned_Data parsed: {cleaned_df.shape}")

        # 2. Model_Performance
        if "Model_Performance" in xl.sheet_names:
            mp_df = xl.parse("Model_Performance")
            METADATA_CACHE["model_performance"] = mp_df.to_dict(orient="records")

        # 3. Feature_Importance
        if "Feature_Importance" in xl.sheet_names:
            fi_df = xl.parse("Feature_Importance")
            METADATA_CACHE["feature_importance"] = fi_df.to_dict(orient="records")

        # 4. Anomaly_Summary
        if "Anomaly_Summary" in xl.sheet_names:
            as_df = xl.parse("Anomaly_Summary")
            METADATA_CACHE["anomaly_summary"] = dict(zip(as_df["Metric"].astype(str), as_df["Value"]))

        # 5. Data_Dictionary
        if "Data_Dictionary" in xl.sheet_names:
            dd_df = xl.parse("Data_Dictionary")
            METADATA_CACHE["data_dictionary"] = dd_df.to_dict(orient="records")

        # 6. SHAP Analysis
        if "SHAP_Analysis" in xl.sheet_names:
            shap_raw = xl.parse("SHAP_Analysis", skiprows=2)
            shap_cols = [
                'entry_id', 'created_at', 'SHAP_Temperature', 'SHAP_Ambient_Temperature',
                'SHAP_Temperature_Difference', 'SHAP_Rolling_Mean_10', 'SHAP_Rolling_Median_10',
                'SHAP_Rolling_Std_10', 'SHAP_Rate_Of_Change', 'SHAP_Deviation_From_Normal',
                'SHAP_Hour', 'SHAP_Minute', 'SHAP_Day', 'SHAP_DayOfWeek', 'RF_Probability', 'Final_Prediction'
            ]
            shap_df = shap_raw.iloc[1:].copy()
            shap_df.columns = shap_cols[:len(shap_df.columns)]
            # Clean numeric cols
            for col in shap_df.columns:
                if col.startswith("SHAP_") or col in ["RF_Probability", "entry_id"]:
                    shap_df[col] = pd.to_numeric(shap_df[col], errors="coerce")
            
            # Store summary of mean absolute SHAP per feature
            shap_feature_cols = [c for c in shap_df.columns if c.startswith("SHAP_")]
            mean_abs_shap = shap_df[shap_feature_cols].abs().mean().sort_values(ascending=False)
            METADATA_CACHE["shap_summary"] = [
                {"feature": col.replace("SHAP_", ""), "mean_shap_value": round(float(val), 5)}
                for col, val in mean_abs_shap.items()
            ]

        # Compute dynamic dataset statistics
        dataset_stats = StatisticsEngine.compute_full_dataset_analytics(cleaned_df)
        METADATA_CACHE["dataset_statistics"] = dataset_stats

        # Ingest into SQLite if table is empty
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM readings;")
        count = cursor.fetchone()[0]

        if count == 0:
            print("Populating SQLite database with 3,150 historical records...")
            records_to_insert = []
            for _, row in cleaned_df.iterrows():
                dt_str = str(row["created_at"])
                try:
                    ts = pd.to_datetime(row["created_at"]).timestamp()
                except Exception:
                    ts = 0.0

                records_to_insert.append((
                    int(row.get("entry_id", 0)),
                    dt_str,
                    float(row.get("Temperature", 0.0)),
                    float(row.get("Ambient_Temperature", 0.0)),
                    float(row.get("Temperature_Difference", 0.0)),
                    float(row.get("Rolling_Mean_10", 0.0)),
                    float(row.get("Rolling_Median_10", 0.0)),
                    float(row.get("Rolling_Std_10", 0.0)),
                    float(row.get("Rate_Of_Change", 0.0)),
                    str(row.get("Temperature_Trend", "Stable")),
                    float(row.get("Deviation_From_Normal", 0.0)),
                    float(row.get("Local_Z_Score", 0.0)),
                    str(row.get("Condition", "Normal")),
                    int(row.get("Anomaly_Flag", 0)),
                    float(row.get("Anomaly_Score", 0.0)),
                    int(row.get("RF_Prediction", 0)),
                    float(row.get("RF_Probability", 0.0)),
                    int(row.get("XGB_Prediction", 0)),
                    float(row.get("XGB_Probability", 0.0)),
                    int(row.get("SVC_Prediction", 0)),
                    float(row.get("SVC_Probability", 0.0)),
                    int(row.get("IsolationForest_Prediction", 1)),
                    float(row.get("IsolationForest_Score", 0.0)),
                    str(row.get("Final_Prediction", "Normal")),
                    float(row.get("Final_Confidence", 100.0)),
                    0, # is_live = 0 for historical data
                    ts
                ))

            cursor.executemany("""
            INSERT INTO readings (
                entry_id, created_at, temperature, ambient_temperature, temperature_difference,
                rolling_mean_10, rolling_median_10, rolling_std_10, rate_of_change, temperature_trend,
                deviation_from_normal, local_z_score, condition, anomaly_flag, anomaly_score,
                rf_prediction, rf_probability, xgb_prediction, xgb_probability, svc_prediction,
                svc_probability, isolation_forest_prediction, isolation_forest_score,
                final_prediction, final_confidence, is_live, created_timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, records_to_insert)

            # Insert default calculated thresholds
            mach_stats = dataset_stats["machine_temperature"]
            amb_stats = dataset_stats["ambient_temperature"]
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            cursor.execute("DELETE FROM threshold_config;")
            cursor.execute("""
            INSERT INTO threshold_config (
                machine_temp_warning, machine_temp_critical, ambient_temp_warning,
                ambient_temp_critical, normal_range_low, normal_range_high,
                consecutive_anomaly_threshold, is_active, updated_by, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 3, 1, 'CALCULATED_DEFAULT', ?);
            """, (
                mach_stats["warning_threshold"],
                mach_stats["critical_threshold"],
                amb_stats["warning_threshold"],
                amb_stats["critical_threshold"],
                mach_stats["normal_range_low"],
                mach_stats["normal_range_high"],
                now_iso
            ))

            conn.commit()
            print(f"Successfully inserted {len(records_to_insert)} readings into SQLite.")
            log_system_event("INFO", "INGESTION", f"Loaded {len(records_to_insert)} records from Excel dataset.")
        else:
            print(f"Database already contains {count} records. Ingestion step skipped.")

        conn.close()
        return cleaned_df

    except Exception as e:
        print(f"Error ingesting Excel dataset: {e}")
        import traceback
        traceback.print_exc()
        log_system_event("ERROR", "INGESTION", f"Failed to ingest dataset: {str(e)}")
        return None
