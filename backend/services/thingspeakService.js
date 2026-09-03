import axios from 'axios';
import { getDb, logSystemEvent } from './db.js';
import { AnomalyEngine } from './anomalyEngine.js';
import { HealthScoreEngine } from './healthScoreEngine.js';
import { AlertEngine } from './alertEngine.js';

class ThingSpeakService {
  constructor() {
    this.pollTimer = null;
    this.lastEntryId = 0;
    this.lastSuccessfulFetch = null;
    this.lastReadingTimestamp = null;
    this.lastError = null;
    this.isPollingActive = false;
  }

  getConfig() {
    const db = getDb();
    const row = db.prepare('SELECT * FROM thingspeak_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();
    if (!row) {
      return {
        channel_id: '',
        read_api_key: '',
        write_api_key: '',
        poll_interval_sec: 30,
        freshness_limit_sec: 120,
        data_source: 'both',
        field_mapping: {
          field1: 'temperature',
          field2: 'ambient_temperature',
          field3: 'vibration',
          field4: 'rpm',
          field5: 'pressure'
        },
        is_enabled: 0
      };
    }

    let fieldMapping = {};
    try {
      fieldMapping = typeof row.field_mapping === 'string' ? JSON.parse(row.field_mapping) : row.field_mapping;
    } catch {
      fieldMapping = {
        field1: 'temperature',
        field2: 'ambient_temperature',
        field3: 'vibration',
        field4: 'rpm',
        field5: 'pressure'
      };
    }

    return {
      ...row,
      field_mapping: fieldMapping
    };
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const config = this.getConfig();
    if (!config.is_enabled || !config.channel_id) {
      this.isPollingActive = false;
      return;
    }

    const intervalMs = Math.max(5000, (config.poll_interval_sec || 30) * 1000);
    this.isPollingActive = true;
    this.pollTimer = setInterval(() => {
      this.fetchLatestFeeds().catch(e => console.error('[THINGSPEAK POLL ERROR]', e.message));
    }, intervalMs);

    // Initial fetch
    this.fetchLatestFeeds().catch(e => console.error('[THINGSPEAK INIT FETCH ERROR]', e.message));
    console.log(`[THINGSPEAK] Background poller started (Channel: ${config.channel_id}, Interval: ${intervalMs / 1000}s)`);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPollingActive = false;
    console.log('[THINGSPEAK] Poller stopped.');
  }

  async testConnection(channelId, apiKey = '') {
    if (!channelId) {
      return { success: false, error: 'Channel ID is required for test connection.' };
    }

    try {
      let url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?results=1`;
      if (apiKey && apiKey.trim()) {
        url += `&api_key=${apiKey.trim()}`;
      }

      const res = await axios.get(url, { timeout: 8000 });
      if (res.status === 200 && res.data && res.data.channel) {
        const feeds = res.data.feeds || [];
        const latestFeed = feeds[feeds.length - 1] || null;

        if (latestFeed) {
          this.lastSuccessfulFetch = new Date().toISOString();
          this.lastReadingTimestamp = latestFeed.created_at || this.lastSuccessfulFetch;
          this.lastEntryId = latestFeed.entry_id || this.lastEntryId;
          this.lastError = null;
        }

        return {
          success: true,
          channel: {
            id: res.data.channel.id,
            name: res.data.channel.name,
            description: res.data.channel.description,
            last_entry_id: res.data.channel.last_entry_id
          },
          latestFeed,
          message: `Successfully connected to ThingSpeak Channel "${res.data.channel.name || channelId}".`
        };
      }
      return { success: false, error: 'Invalid ThingSpeak API response structure.' };
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Connection failed.';
      this.lastError = msg;
      return { success: false, error: `ThingSpeak connection failed: ${msg}` };
    }
  }

  async fetchLatestFeeds(limit = 10) {
    const config = this.getConfig();
    if (!config.is_enabled || !config.channel_id) {
      return { success: false, error: 'ThingSpeak channel polling is disabled.' };
    }

    try {
      let url = `https://api.thingspeak.com/channels/${config.channel_id}/feeds.json?results=${limit}`;
      if (config.read_api_key && config.read_api_key.trim()) {
        url += `&api_key=${config.read_api_key.trim()}`;
      }

      const res = await axios.get(url, { timeout: 10000 });

      if (!res.data || !Array.isArray(res.data.feeds)) {
        this.lastError = 'No feed data received from ThingSpeak.';
        return { success: false, error: 'No feed data received.' };
      }

      const feeds = res.data.feeds;
      const db = getDb();
      const threshRow = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};

      let newCount = 0;
      for (const feed of feeds) {
        const entryId = feed.entry_id;
        if (!entryId) continue;

        // Check if reading already exists in database
        const exists = db.prepare('SELECT id FROM readings WHERE entry_id = ? AND is_live = 1').get(entryId);
        if (exists) continue;

        // Parse mapped fields
        const mapping = config.field_mapping || {};
        let temp = parseFloat(feed[this.getFieldName(mapping, 'temperature', 'field1')] || feed.field1) || 0;
        let ambTemp = parseFloat(feed[this.getFieldName(mapping, 'ambient_temperature', 'field2')] || feed.field2) || 0;
        let vibration = parseFloat(feed[this.getFieldName(mapping, 'vibration', 'field3')] || feed.field3) || 0;
        let rpm = parseFloat(feed[this.getFieldName(mapping, 'rpm', 'field4')] || feed.field4) || 0;
        let pressure = parseFloat(feed[this.getFieldName(mapping, 'pressure', 'field5')] || feed.field5) || 0;

        const rawReading = {
          machine_id: 'Machine-01',
          channel_id: String(config.channel_id),
          entry_id: entryId,
          created_at: feed.created_at || new Date().toISOString(),
          thingspeak_created_at: feed.created_at,
          temperature: temp,
          ambient_temperature: ambTemp,
          vibration,
          rpm,
          pressure,
          is_live: 1,
          data_source: 'THINGSPEAK_LIVE'
        };

        // 1. Anomaly detection
        const anomalyResult = AnomalyEngine.analyze(rawReading, threshRow);
        rawReading.anomaly_flag = anomalyResult.isAnomaly ? 1 : 0;
        rawReading.anomaly_score = anomalyResult.anomalyScore;
        rawReading.condition = anomalyResult.condition;
        rawReading.detection_method = anomalyResult.detectionMethod;

        // 2. Health scoring
        const healthResult = HealthScoreEngine.calculate(rawReading, threshRow);
        rawReading.health_score = healthResult.healthScore;
        rawReading.machine_status = healthResult.status;

        // 3. Insert reading into SQLite
        db.prepare(`
          INSERT INTO readings (
            machine_id, entry_id, created_at, thingspeak_created_at, fetch_timestamp,
            temperature, ambient_temperature, vibration, rpm, pressure,
            condition, anomaly_flag, anomaly_score, health_score,
            detection_method, is_live, data_source, created_timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rawReading.machine_id, rawReading.entry_id, rawReading.created_at, rawReading.thingspeak_created_at,
          new Date().toISOString(), rawReading.temperature, rawReading.ambient_temperature,
          rawReading.vibration, rawReading.rpm, rawReading.pressure,
          rawReading.condition, rawReading.anomaly_flag, rawReading.anomaly_score, rawReading.health_score,
          rawReading.detection_method, 1, 'THINGSPEAK_LIVE', Date.now() / 1000
        );

        // 4. Alert Processing: Exactly 1 Anomaly = Immediate Alert & Instant Email
        if (anomalyResult.isAnomaly) {
          await AlertEngine.processReading(rawReading, anomalyResult, threshRow, healthResult);
        }

        newCount++;
        this.lastEntryId = Math.max(this.lastEntryId, entryId);
        this.lastReadingTimestamp = feed.created_at || new Date().toISOString();
      }

      this.lastSuccessfulFetch = new Date().toISOString();
      this.lastError = null;

      return {
        success: true,
        newCount,
        lastEntryId: this.lastEntryId,
        timestamp: this.lastSuccessfulFetch,
        message: newCount > 0 ? `Ingested ${newCount} new ThingSpeak feeds.` : 'Channel is up to date.'
      };
    } catch (err) {
      this.lastError = `ThingSpeak connection failed: ${err.message}`;
      return { success: false, error: this.lastError };
    }
  }

  getFieldName(mapping, logicalName, defaultField) {
    for (const [fKey, lName] of Object.entries(mapping)) {
      if (lName === logicalName) return fKey;
    }
    return defaultField;
  }

  /**
   * Evaluates genuine ThingSpeak connection status.
   * LIVE ONLY when:
   * 1. Enabled & configured
   * 2. Polling active
   * 3. Successful fetch within freshness limit (120s)
   * 4. No connection error
   */
  getConnectionStatus() {
    const config = this.getConfig();
    if (!config.is_enabled || !config.channel_id) {
      return {
        connected: false,
        status: 'OFFLINE',
        source: 'THINGSPEAK',
        reason: 'ThingSpeak Not Connected',
        channelId: null,
        lastReading: null,
        lastSuccessfulFetch: null,
        lastEntryId: null,
        pollingActive: false
      };
    }

    if (!this.lastSuccessfulFetch) {
      return {
        connected: false,
        status: 'OFFLINE',
        source: 'THINGSPEAK',
        reason: this.lastError || 'ThingSpeak Not Connected',
        channelId: String(config.channel_id),
        lastReading: null,
        lastSuccessfulFetch: null,
        lastEntryId: this.lastEntryId || null,
        pollingActive: this.isPollingActive
      };
    }

    const freshnessLimitSec = config.freshness_limit_sec || 120;
    const fetchAgeSec = (Date.now() - new Date(this.lastSuccessfulFetch).getTime()) / 1000;

    if (fetchAgeSec > freshnessLimitSec || this.lastError) {
      return {
        connected: false,
        status: 'OFFLINE',
        source: 'THINGSPEAK',
        reason: this.lastError || `ThingSpeak connection stale (${Math.round(fetchAgeSec)}s ago)`,
        channelId: String(config.channel_id),
        lastReading: this.lastReadingTimestamp,
        lastSuccessfulFetch: this.lastSuccessfulFetch,
        lastEntryId: this.lastEntryId || null,
        pollingActive: this.isPollingActive
      };
    }

    return {
      connected: true,
      status: 'LIVE',
      source: 'THINGSPEAK',
      channelId: String(config.channel_id),
      lastReading: this.lastReadingTimestamp || this.lastSuccessfulFetch,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastEntryId: this.lastEntryId || null,
      pollingActive: this.isPollingActive
    };
  }
}

export const thingspeakService = new ThingSpeakService();
