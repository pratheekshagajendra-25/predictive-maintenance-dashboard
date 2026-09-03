export class HealthScoreEngine {
  /**
   * Calculates a continuous, dynamic Machine Health Score (0.0 to 100.0)
   * based on parameter deviations, operating bands, and anomaly severity.
   * 
   * Strict Rule:
   * 0 <= healthScore <= 100
   * 
   * Tiers:
   * 85 - 100 = HEALTHY / EXCELLENT
   * 70 - 84.9 = GOOD
   * 50 - 69.9 = WARNING
   * 0 - 49.9  = CRITICAL
   */
  static calculate(reading, thresholds = {}, recentAnomalies = 0) {
    let score = 100.0;

    const temp = Number(reading.temperature ?? reading.machine_temperature ?? 0);
    const ambTemp = Number(reading.ambient_temperature ?? 0);
    const vibration = Number(reading.vibration ?? 0);
    const rpm = Number(reading.rpm ?? 0);
    const pressure = Number(reading.pressure ?? 0);

    const tempNormLow = Number(thresholds.normal_range_low ?? 34.0);
    const tempNormHigh = Number(thresholds.normal_range_high ?? 49.0);
    const tempWarn = Number(thresholds.machine_temp_warning ?? 52.0);
    const tempCrit = Number(thresholds.machine_temp_critical ?? 55.0);

    const vibNormMin = Number(thresholds.vibration_min ?? 0.1);
    const vibNormMax = Number(thresholds.vibration_max ?? 4.5);
    const vibWarn = Number(thresholds.vibration_warning ?? 3.5);
    const vibCrit = Number(thresholds.vibration_critical ?? 4.5);

    const rpmNormMin = Number(thresholds.rpm_min ?? 800);
    const rpmNormMax = Number(thresholds.rpm_max ?? 3200);
    const rpmWarn = Number(thresholds.rpm_warning ?? 3000);
    const rpmCrit = Number(thresholds.rpm_critical ?? 3200);

    const pressNormMin = Number(thresholds.pressure_min ?? 1.0);
    const pressNormMax = Number(thresholds.pressure_max ?? 8.0);
    const pressWarn = Number(thresholds.pressure_warning ?? 7.0);
    const pressCrit = Number(thresholds.pressure_critical ?? 8.0);

    // 1. Temperature deductions
    if (temp > 0) {
      if (temp >= tempCrit) {
        score -= 40.0 + Math.min(30, (temp - tempCrit) * 1.5);
      } else if (temp >= tempWarn) {
        score -= 20.0 + Math.min(15, (temp - tempWarn) * 4);
      } else if (temp > tempNormHigh) {
        score -= 5.0 + ((temp - tempNormHigh) / (tempWarn - tempNormHigh)) * 10.0;
      } else if (temp >= tempNormLow) {
        // Smooth gradient within normal band
        const optimalTemp = (tempNormLow + tempNormHigh) / 2;
        const dist = Math.abs(temp - optimalTemp) / ((tempNormHigh - tempNormLow) / 2);
        score -= dist * 4.0;
      } else {
        score -= 4.0;
      }
    }

    // 2. Vibration deductions
    if (vibration > 0) {
      if (vibration >= vibCrit) {
        score -= 35.0 + Math.min(25, (vibration - vibCrit) * 3);
      } else if (vibration >= vibWarn) {
        score -= 18.0 + ((vibration - vibWarn) / (vibCrit - vibWarn)) * 12.0;
      } else if (vibration > vibNormMin) {
        // Gradient within safe vibration band (0.1 - 3.5)
        const vibRatio = Math.max(0, (vibration - 1.0) / 2.5);
        score -= vibRatio * 5.0;
      }
    }

    // 3. RPM deductions
    if (rpm > 0) {
      if (rpm >= rpmCrit || rpm < rpmNormMin * 0.7) {
        score -= 30.0 + Math.min(20, Math.max(0, (rpm - rpmCrit) * 0.03));
      } else if (rpm >= rpmWarn) {
        score -= 15.0 + ((rpm - rpmWarn) / (rpmCrit - rpmWarn)) * 10.0;
      } else {
        const optimalRpm = 1800;
        const dist = Math.abs(rpm - optimalRpm) / 1200;
        score -= dist * 4.0;
      }
    }

    // 4. Pressure deductions
    if (pressure > 0) {
      if (pressure >= pressCrit || pressure < pressNormMin * 0.5) {
        score -= 25.0 + Math.min(20, Math.max(0, (pressure - pressCrit) * 3));
      } else if (pressure >= pressWarn) {
        score -= 12.0 + ((pressure - pressWarn) / (pressCrit - pressWarn)) * 8.0;
      } else {
        const optimalPress = 4.0;
        const dist = Math.abs(pressure - optimalPress) / 3.0;
        score -= dist * 3.0;
      }
    }

    // 5. Anomaly penalty
    const anomalyScore = Number(reading.anomaly_score ?? reading.anomalyScore ?? 0);
    if (reading.anomaly_flag === 1 || reading.anomalyFlag === 1 || anomalyScore > 0) {
      const penalty = anomalyScore > 0 ? (20.0 + anomalyScore * 25.0) : 25.0;
      score -= penalty;
    }

    // 6. Recent anomaly pressure
    if (recentAnomalies > 0) {
      score -= Math.min(15, recentAnomalies * 3);
    }

    // Strict Clamping: 0 <= healthScore <= 100
    score = Math.max(0.0, Math.min(100.0, Math.round(score * 10) / 10));

    let status = 'HEALTHY';
    if (score >= 85) {
      status = 'HEALTHY';
    } else if (score >= 70) {
      status = 'GOOD';
    } else if (score >= 50) {
      status = 'WARNING';
    } else {
      status = 'CRITICAL';
    }

    return {
      healthScore: score,
      status
    };
  }
}
