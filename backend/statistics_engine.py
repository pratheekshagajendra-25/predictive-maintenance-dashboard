import numpy as np
import pandas as pd
from scipy import stats

class StatisticsEngine:
    @staticmethod
    def calculate_series_statistics(series, name="Sensor"):
        clean_s = series.dropna()
        if len(clean_s) == 0:
            return {}

        mean_val = float(clean_s.mean())
        median_val = float(clean_s.median())
        std_val = float(clean_s.std())
        min_val = float(clean_s.min())
        max_val = float(clean_s.max())
        q1 = float(clean_s.quantile(0.25))
        q3 = float(clean_s.quantile(0.75))
        iqr = float(q3 - q1)
        p5 = float(clean_s.quantile(0.05))
        p95 = float(clean_s.quantile(0.95))

        # Mode calculation
        try:
            mode_res = stats.mode(np.round(clean_s, 1), keepdims=False)
            mode_val = float(mode_res.mode)
        except Exception:
            mode_val = round(median_val, 1)

        # Statistical Thresholds:
        # Normal Operating Range: 5th to 95th percentile
        # Warning Threshold: Q3 + 1.0 * IQR (or Mean + 2*Std)
        # Critical Threshold: Q3 + 1.5 * IQR (standard Tukey outlier fence)
        warning_threshold = float(round(q3 + 1.0 * iqr, 2))
        critical_threshold = float(round(q3 + 1.5 * iqr, 2))

        return {
            "name": name,
            "count": int(len(clean_s)),
            "mean": round(mean_val, 2),
            "median": round(median_val, 2),
            "mode": round(mode_val, 2),
            "std": round(std_val, 2),
            "variance": round(float(clean_s.var()), 2),
            "min": round(min_val, 2),
            "max": round(max_val, 2),
            "q1": round(q1, 2),
            "q3": round(q3, 2),
            "iqr": round(iqr, 2),
            "p5": round(p5, 2),
            "p95": round(p95, 2),
            "normal_range_low": round(p5, 2),
            "normal_range_high": round(p95, 2),
            "iqr_normal_low": round(max(0.0, q1 - 1.5 * iqr), 2),
            "iqr_normal_high": round(q3 + 1.5 * iqr, 2),
            "warning_threshold": warning_threshold,
            "critical_threshold": critical_threshold
        }

    @staticmethod
    def calculate_distribution_bins(series, num_bins=20):
        clean_s = series.dropna().to_numpy()
        if len(clean_s) == 0:
            return []
        counts, bin_edges = np.histogram(clean_s, bins=num_bins)
        distribution = []
        for i in range(len(counts)):
            distribution.append({
                "bin_start": round(float(bin_edges[i]), 1),
                "bin_end": round(float(bin_edges[i+1]), 1),
                "bin_label": f"{round(float(bin_edges[i]), 1)} - {round(float(bin_edges[i+1]), 1)}°C",
                "count": int(counts[i])
            })
        return distribution

    @classmethod
    def compute_full_dataset_analytics(cls, df):
        machine_stats = cls.calculate_series_statistics(df["Temperature"], "Machine Temperature")
        ambient_stats = cls.calculate_series_statistics(df["Ambient_Temperature"], "Ambient Temperature")
        
        diff_stats = cls.calculate_series_statistics(
            df["Temperature"] - df["Ambient_Temperature"], 
            "Temperature Difference"
        )

        total_obs = len(df)
        anomaly_count = int(df["Anomaly_Flag"].sum()) if "Anomaly_Flag" in df.columns else 0
        normal_count = total_obs - anomaly_count
        anomaly_rate = round((anomaly_count / total_obs) * 100, 2) if total_obs > 0 else 0.0

        # Histograms
        machine_dist = cls.calculate_distribution_bins(df["Temperature"], num_bins=18)
        ambient_dist = cls.calculate_distribution_bins(df["Ambient_Temperature"], num_bins=15)

        # Anomaly vs Normal Temperature Stats
        normal_df = df[df["Anomaly_Flag"] == 0] if "Anomaly_Flag" in df.columns else df
        anomaly_df = df[df["Anomaly_Flag"] == 1] if "Anomaly_Flag" in df.columns else pd.DataFrame()

        normal_temp_stats = cls.calculate_series_statistics(normal_df["Temperature"], "Normal Condition Machine Temp")
        anomaly_temp_stats = cls.calculate_series_statistics(anomaly_df["Temperature"], "Anomaly Condition Machine Temp") if len(anomaly_df) > 0 else {}

        # Hourly Statistics
        hourly_stats = []
        if "Hour" in df.columns:
            for hour, group in df.groupby("Hour"):
                hourly_stats.append({
                    "hour": int(hour),
                    "hour_label": f"{int(hour):02d}:00",
                    "mean_machine_temp": round(float(group["Temperature"].mean()), 2),
                    "mean_ambient_temp": round(float(group["Ambient_Temperature"].mean()), 2),
                    "anomalies": int(group["Anomaly_Flag"].sum()) if "Anomaly_Flag" in group.columns else 0,
                    "readings_count": int(len(group))
                })

        return {
            "machine_temperature": machine_stats,
            "ambient_temperature": ambient_stats,
            "temperature_difference": diff_stats,
            "total_observations": total_obs,
            "normal_observations": normal_count,
            "anomaly_observations": anomaly_count,
            "anomaly_percentage": anomaly_rate,
            "machine_distribution": machine_dist,
            "ambient_distribution": ambient_dist,
            "normal_temp_stats": normal_temp_stats,
            "anomaly_temp_stats": anomaly_temp_stats,
            "hourly_statistics": hourly_stats
        }
