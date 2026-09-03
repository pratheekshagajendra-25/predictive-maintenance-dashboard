const BASE_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:5000/api' : '/api');

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('pm_auth_token');
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    const response = await fetch(url, config);

    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      localStorage.removeItem('pm_auth_token');
      localStorage.removeItem('pm_auth_user');
      window.dispatchEvent(new Event('pm_auth_expired'));
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = data.error || data.message || `HTTP error ${response.status}`;
      throw new Error(errMsg);
    }
    return data;
  } catch (error) {
    console.error(`API Request failed: ${endpoint}`, error);
    throw error;
  }
}

export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getMe: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  createUser: (userData) => request('/auth/users', { method: 'POST', body: JSON.stringify(userData) }),

  // Readings & Telemetry
  getLatestReading: () => request('/readings/latest'),
  getReadings: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/readings?${query}`);
  },
  getChartData: (range = '100') => request(`/readings/chart?range=${range}`),

  // Analytics & Statistics
  getStatistics: () => request('/statistics'),
  getAnomalies: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/anomalies?${query}`);
  },

  // Alerts
  getAlerts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/alerts?${query}`);
  },
  acknowledgeAlert: (alertId) => request(`/alerts/${alertId}/acknowledge`, { method: 'POST' }),
  resolveAlert: (alertId, notes) => request(`/alerts/${alertId}/resolve`, { method: 'POST', body: JSON.stringify({ notes }) }),

  // Health Score
  getHealth: () => request('/health'),

  // Thresholds
  getThresholds: () => request('/thresholds'),
  updateThresholds: (thresholds) => request('/thresholds', { method: 'PUT', body: JSON.stringify(thresholds) }),
  resetThresholds: () => request('/thresholds/reset', { method: 'POST' }),

  // Models & SHAP
  getModels: () => request('/models'),
  getShap: () => request('/shap'),
  explainReading: (temperature, ambient_temperature) => 
    request('/shap/explain', { method: 'POST', body: JSON.stringify({ temperature, ambient_temperature }) }),

  // ThingSpeak Configuration & Diagnostics
  getThingspeakConfig: () => request('/thingspeak/config'),
  updateThingspeakConfig: (config) => request('/thingspeak/config', { method: 'PUT', body: JSON.stringify(config) }),
  testThingspeakConnection: (channel_id, read_api_key) => 
    request('/thingspeak/test-connection', { method: 'POST', body: JSON.stringify({ channel_id, read_api_key }) }),
  refreshNow: () => request('/thingspeak/refresh-now', { method: 'POST' }),
  disconnectThingspeak: () => request('/thingspeak/disconnect', { method: 'POST' }),
  getThingspeakStatus: () => request('/thingspeak/status'),
  writeToThingspeak: (machine_temperature, ambient_temperature) =>
    request('/thingspeak/write-test', { method: 'POST', body: JSON.stringify({ machine_temperature, ambient_temperature }) }),

  // Readings & Ingestion
  postReading: (data) => request('/readings', { method: 'POST', body: JSON.stringify(data) }),

  // Email Configuration & Verification
  getEmailConfig: () => request('/smtp/config'),
  updateEmailConfig: (config) => request('/smtp/config', { method: 'POST', body: JSON.stringify(config) }),
  verifySmtpConfig: (config) => request('/smtp/verify', { method: 'POST', body: JSON.stringify(config) }),
  sendTestEmail: () => request('/smtp/test', { method: 'POST' }),

  // Dataset Management
  uploadDataset: (formData) => request('/dataset/upload-validate', { method: 'POST', body: formData }),
  uploadAndValidateDataset: (formData) => request('/dataset/upload-validate', { method: 'POST', body: formData }),
  importDataset: (tempFilePath, filename) => request('/dataset/import', { method: 'POST', body: JSON.stringify({ tempFilePath, filename }) }),
  getCurrentDataset: () => request('/dataset/current'),
  resetDataset: () => request('/dataset/reset', { method: 'POST' }),

  // Simulation / Test Alert
  testAlert: (data) => request('/simulate-alert-demo', { method: 'POST', body: JSON.stringify(data || {}) }),
  injectTestAnomaly: (data) => request('/simulate-alert-demo', { method: 'POST', body: JSON.stringify(data || {}) }),
  injectTestAnomalies: (_count) => request('/simulate-alert-demo', { method: 'POST' }),
  simulateAlertDemo: () => request('/simulate-alert-demo', { method: 'POST' }),
  pollNow: () => request('/thingspeak/refresh-now', { method: 'POST' }),

  // System Diagnostics
  getSystemHealth: () => request('/system/health'),
  getSystemLogs: (limit = 50) => request(`/system/logs?limit=${limit}`),
};
