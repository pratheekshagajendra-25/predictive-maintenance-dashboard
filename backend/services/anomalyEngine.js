export class AnomalyEngine {
  /**
   * Analyzes a machine reading against configured thresholds and returns anomaly classification.
   * 
   * A reading outside any configured safe range is classified as an ANOMALY.
   */
  static analyze(reading, thresholds = {}) {
    const breaches = [];
    let anomalyScore = 0.0;
    let isAnomaly = false;
    let severity = 'INFO';

    const temp = Number(reading.temperature ?? reading.machine_temperature ?? 0);
    const ambTemp = Number(reading.ambient_temperature ?? 0);
    const vibration = Number(reading.vibration ?? 0);
    const rpm = Number(reading.rpm ?? 0);
    const pressure = Number(reading.pressure ?? 0);
    const current = Number(reading.current ?? 0);
    const voltage = Number(reading.voltage ?? 0);

    // Thresholds
    const tempMin = Number(thresholds.machine_temp_min ?? thresholds.normal_range_low ?? 20.0);
    const tempMax = Number(thresholds.machine_temp_max ?? thresholds.normal_range_high ?? 55.0);
    const tempWarn = Number(thresholds.machine_temp_warning ?? 52.0);
    const tempCrit = Number(thresholds.machine_temp_critical ?? 55.0);

    const vibMin = Number(thresholds.vibration_min ?? 0.1);
    const vibMax = Number(thresholds.vibration_max ?? 4.5);
    const vibWarn = Number(thresholds.vibration_warning ?? 3.5);
    const vibCrit = Number(thresholds.vibration_critical ?? 4.5);

    const rpmMin = Number(thresholds.rpm_min ?? 800.0);
    const rpmMax = Number(thresholds.rpm_max ?? 3200.0);
    const rpmWarn = Number(thresholds.rpm_warning ?? 3000.0);
    const rpmCrit = Number(thresholds.rpm_critical ?? 3200.0);

    const pressMin = Number(thresholds.pressure_min ?? 1.0);
    const pressMax = Number(thresholds.pressure_max ?? 8.0);
    const pressWarn = Number(thresholds.pressure_warning ?? 7.0);
    const pressCrit = Number(thresholds.pressure_critical ?? 8.0);

    const ambMin = Number(thresholds.ambient_temp_min ?? 15.0);
    const ambMax = Number(thresholds.ambient_temp_max ?? 42.0);

    const curMin = Number(thresholds.current_min ?? 2.0);
    const curMax = Number(thresholds.current_max ?? 25.0);

    const voltMin = Number(thresholds.voltage_min ?? 200.0);
    const voltMax = Number(thresholds.voltage_max ?? 250.0);

    // 1. Check Temperature
    if (temp > 0) {
      if (temp >= tempCrit) {
        isAnomaly = true;
        severity = 'CRITICAL';
        breaches.push({
          parameter: 'Temperature',
          value: temp,
          unit: '°C',
          limitType: 'Critical High',
          normalRange: `${tempMin}°C - ${tempMax}°C`,
          threshold: tempCrit,
          deviation: +(temp - tempCrit).toFixed(2),
          reason: `Machine Temperature ${temp.toFixed(2)}°C exceeds critical threshold of ${tempCrit}°C`
        });
        anomalyScore = Math.max(anomalyScore, 0.85 + Math.min(0.14, (temp - tempCrit) / 20));
      } else if (temp >= tempWarn || temp > tempMax) {
        isAnomaly = true;
        if (severity !== 'CRITICAL') severity = 'WARNING';
        breaches.push({
          parameter: 'Temperature',
          value: temp,
          unit: '°C',
          limitType: 'Warning High',
          normalRange: `${tempMin}°C - ${tempMax}°C`,
          threshold: tempWarn,
          deviation: +(temp - tempMax).toFixed(2),
          reason: `Machine Temperature ${temp.toFixed(2)}°C exceeds normal upper limit of ${tempMax}°C`
        });
        anomalyScore = Math.max(anomalyScore, 0.65 + Math.min(0.19, (temp - tempMax) / 10));
      } else if (temp < tempMin) {
        isAnomaly = true;
        if (severity !== 'CRITICAL') severity = 'WARNING';
        breaches.push({
          parameter: 'Temperature',
          value: temp,
          unit: '°C',
          limitType: 'Low',
          normalRange: `${tempMin}°C - ${tempMax}°C`,
          threshold: tempMin,
          deviation: +(tempMin - temp).toFixed(2),
          reason: `Machine Temperature ${temp.toFixed(2)}°C is below normal lower limit of ${tempMin}°C`
        });
        anomalyScore = Math.max(anomalyScore, 0.60);
      }
    }

    // 2. Check Vibration
    if (vibration > 0) {
      if (vibration >= vibCrit) {
        isAnomaly = true;
        severity = 'CRITICAL';
        breaches.push({
          parameter: 'Vibration',
          value: vibration,
          unit: 'mm/s',
          limitType: 'Critical High',
          normalRange: `${vibMin} - ${vibMax} mm/s`,
          threshold: vibCrit,
          deviation: +(vibration - vibCrit).toFixed(2),
          reason: `Vibration ${vibration.toFixed(2)} mm/s exceeds critical limit of ${vibCrit} mm/s`
        });
        anomalyScore = Math.max(anomalyScore, 0.88);
      } else if (vibration > vibMax || vibration >= vibWarn) {
        isAnomaly = true;
        if (severity !== 'CRITICAL') severity = 'WARNING';
        breaches.push({
          parameter: 'Vibration',
          value: vibration,
          unit: 'mm/s',
          limitType: 'Warning High',
          normalRange: `${vibMin} - ${vibMax} mm/s`,
          threshold: vibWarn,
          deviation: +(vibration - vibMax).toFixed(2),
          reason: `Vibration ${vibration.toFixed(2)} mm/s is above safe range`
        });
        anomalyScore = Math.max(anomalyScore, 0.70);
      } else if (vibration < vibMin) {
        isAnomaly = true;
        breaches.push({
          parameter: 'Vibration',
          value: vibration,
          unit: 'mm/s',
          limitType: 'Low',
          normalRange: `${vibMin} - ${vibMax} mm/s`,
          threshold: vibMin,
          deviation: +(vibMin - vibration).toFixed(2),
          reason: `Vibration ${vibration.toFixed(2)} mm/s is abnormally low`
        });
        anomalyScore = Math.max(anomalyScore, 0.55);
      }
    }

    // 3. Check RPM
    if (rpm > 0) {
      if (rpm >= rpmCrit || rpm < rpmMin * 0.7) {
        isAnomaly = true;
        severity = 'CRITICAL';
        breaches.push({
          parameter: 'RPM',
          value: rpm,
          unit: 'RPM',
          limitType: rpm >= rpmCrit ? 'Critical High' : 'Critical Stall',
          normalRange: `${rpmMin} - ${rpmMax} RPM`,
          threshold: rpm >= rpmCrit ? rpmCrit : rpmMin,
          deviation: rpm >= rpmCrit ? +(rpm - rpmCrit).toFixed(1) : +(rpmMin - rpm).toFixed(1),
          reason: `RPM ${rpm} is outside critical boundaries`
        });
        anomalyScore = Math.max(anomalyScore, 0.90);
      } else if (rpm > rpmMax || rpm < rpmMin) {
        isAnomaly = true;
        if (severity !== 'CRITICAL') severity = 'WARNING';
        breaches.push({
          parameter: 'RPM',
          value: rpm,
          unit: 'RPM',
          limitType: rpm > rpmMax ? 'Over-speed' : 'Under-speed',
          normalRange: `${rpmMin} - ${rpmMax} RPM`,
          threshold: rpm > rpmMax ? rpmMax : rpmMin,
          deviation: rpm > rpmMax ? +(rpm - rpmMax).toFixed(1) : +(rpmMin - rpm).toFixed(1),
          reason: `RPM ${rpm} is outside safe operating range (${rpmMin}-${rpmMax})`
        });
        anomalyScore = Math.max(anomalyScore, 0.68);
      }
    }

    // 4. Check Pressure
    if (pressure > 0) {
      if (pressure >= pressCrit || pressure < pressMin * 0.5) {
        isAnomaly = true;
        severity = 'CRITICAL';
        breaches.push({
          parameter: 'Pressure',
          value: pressure,
          unit: 'bar',
          limitType: pressure >= pressCrit ? 'Overpressure' : 'Pressure Loss',
          normalRange: `${pressMin} - ${pressMax} bar`,
          threshold: pressure >= pressCrit ? pressCrit : pressMin,
          deviation: pressure >= pressCrit ? +(pressure - pressCrit).toFixed(2) : +(pressMin - pressure).toFixed(2),
          reason: `Hydraulic pressure ${pressure.toFixed(2)} bar breached critical limit`
        });
        anomalyScore = Math.max(anomalyScore, 0.86);
      } else if (pressure > pressMax || pressure < pressMin) {
        isAnomaly = true;
        if (severity !== 'CRITICAL') severity = 'WARNING';
        breaches.push({
          parameter: 'Pressure',
          value: pressure,
          unit: 'bar',
          limitType: 'Out of Range',
          normalRange: `${pressMin} - ${pressMax} bar`,
          threshold: pressure > pressMax ? pressMax : pressMin,
          deviation: pressure > pressMax ? +(pressure - pressMax).toFixed(2) : +(pressMin - pressure).toFixed(2),
          reason: `Pressure ${pressure.toFixed(2)} bar outside normal bounds`
        });
        anomalyScore = Math.max(anomalyScore, 0.65);
      }
    }

    // 5. Ambient Temp
    if (ambTemp > 0 && (ambTemp > ambMax || ambTemp < ambMin)) {
      breaches.push({
        parameter: 'Ambient Temperature',
        value: ambTemp,
        unit: '°C',
        limitType: ambTemp > ambMax ? 'High' : 'Low',
        normalRange: `${ambMin}°C - ${ambMax}°C`,
        threshold: ambTemp > ambMax ? ambMax : ambMin,
        deviation: ambTemp > ambMax ? +(ambTemp - ambMax).toFixed(2) : +(ambMin - ambTemp).toFixed(2),
        reason: `Ambient Temperature ${ambTemp.toFixed(2)}°C outside environmental bounds`
      });
      anomalyScore = Math.max(anomalyScore, 0.50);
    }

    // Check if reading was already flagged externally (e.g. from dataset or ML)
    if (reading.anomaly_flag === 1) {
      isAnomaly = true;
      anomalyScore = Math.max(anomalyScore, Number(reading.anomaly_score || 0.75));
      if (severity === 'INFO') severity = 'CRITICAL';
    }

    // Final condition
    let condition = 'Normal';
    if (isAnomaly) {
      condition = severity === 'CRITICAL' ? 'Critical' : 'Warning';
    }

    anomalyScore = Math.min(1.0, Math.max(0.0, Math.round(anomalyScore * 10000) / 10000));

    return {
      isAnomaly,
      condition,
      severity,
      anomalyScore,
      breaches,
      primaryBreach: breaches[0] || null,
      detectionMethod: breaches.length > 0 ? 'Rule-Based Threshold Engine' : 'Normal Operating Bounds'
    };
  }
}
