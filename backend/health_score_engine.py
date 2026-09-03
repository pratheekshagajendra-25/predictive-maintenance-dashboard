class HealthScoreEngine:
    @staticmethod
    def calculate_health_score(
        temperature,
        deviation_from_normal,
        warning_threshold,
        critical_threshold,
        anomaly_score,
        consecutive_anomalies,
        rate_of_change=0.0
    ):
        base_score = 100.0
        penalties = {}

        # 1. Deviation from Normal Operating Band (up to 30 pts)
        if deviation_from_normal > 0:
            dev_penalty = min(30.0, float(deviation_from_normal * 3.5))
        else:
            dev_penalty = 0.0
        penalties["deviation_penalty"] = round(dev_penalty, 2)

        # 2. Threshold Proximity Penalty (up to 35 pts)
        # Near warning (within 3°C below warning) already reduces health.
        if temperature >= critical_threshold:
            thresh_penalty = 35.0
        elif temperature >= warning_threshold:
            ratio = (temperature - warning_threshold) / max(0.1, (critical_threshold - warning_threshold))
            thresh_penalty = 15.0 + (ratio * 20.0)
        elif temperature >= (warning_threshold - 3.0):
            proximity = (temperature - (warning_threshold - 3.0)) / 3.0
            thresh_penalty = proximity * 12.0
        else:
            thresh_penalty = 0.0
        penalties["threshold_penalty"] = round(thresh_penalty, 2)

        # 3. ML Anomaly Score Penalty (up to 20 pts)
        # Baseline normal anomaly score is ~0.35-0.40
        if anomaly_score > 0.40:
            anom_penalty = min(20.0, (anomaly_score - 0.40) * 55.0)
        else:
            anom_penalty = 0.0
        penalties["anomaly_score_penalty"] = round(anom_penalty, 2)

        # 4. Consecutive Abnormal Readings Penalty (up to 35 pts)
        if consecutive_anomalies == 1:
            consec_penalty = 10.0
        elif consecutive_anomalies == 2:
            consec_penalty = 22.0
        elif consecutive_anomalies >= 3:
            consec_penalty = 35.0
        else:
            consec_penalty = 0.0
        penalties["consecutive_penalty"] = round(consec_penalty, 2)

        # 5. Dynamic Rate of Change Volatility Penalty (up to 10 pts)
        abs_roc = abs(rate_of_change)
        if abs_roc > 1.2:
            roc_penalty = min(10.0, (abs_roc - 1.2) * 4.0)
        else:
            roc_penalty = 0.0
        penalties["volatility_penalty"] = round(roc_penalty, 2)

        # Total Penalty Calculation
        total_penalty = sum(penalties.values())
        final_score = max(5.0, min(100.0, base_score - total_penalty))
        final_score = round(final_score, 1)

        # Health Classification
        if final_score >= 90.0:
            status = "Excellent"
            condition = "HEALTHY"
            color = "#10B981" # Emerald green
        elif final_score >= 75.0:
            status = "Good"
            condition = "HEALTHY"
            color = "#34D399" # Green
        elif final_score >= 50.0:
            status = "Warning"
            condition = "WARNING"
            color = "#F59E0B" # Amber
        else:
            status = "Poor / Critical"
            condition = "CRITICAL"
            color = "#EF4444" # Red

        return {
            "health_score": final_score,
            "status": status,
            "condition": condition,
            "color": color,
            "penalties": penalties,
            "formula_explanation": (
                "Health Score (0-100) = 100 - [Thermal Deviation Penalty] - "
                "[Threshold Proximity Penalty] - [ML Anomaly Score Penalty] - "
                "[Consecutive Anomaly Penalty] - [Thermal Volatility Penalty]"
            )
        }
