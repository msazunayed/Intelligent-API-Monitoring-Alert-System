require('dotenv').config();
const express = require('express');
const path = require('path');
const { PORT } = require('./config');
const { validate } = require('./validator');
const { detect } = require('./detector');
const { generateAlert } = require('./llm');
const alertStore = require('./db');
const logger = require('./logger');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// POST /monitor: accepts one object or an array (batch).
app.post('/monitor', async (req, res, next) => {
  try {
    const body = req.body;
    if (body === undefined || body === null) {
      return res.status(400).json({ error: 'Request body must be JSON' });
    }

    const entries = Array.isArray(body) ? body : [body];
    const results = [];
    const rowsToStore = [];
    const typesByApi = new Map(); // issue types seen per API in this request

    for (const raw of entries) {
      const { valid, entry, error } = validate(raw);
      if (!valid) {
        results.push({ api_name: raw?.api_name ?? null, status: 'invalid', error });
        logger.warn('Invalid entry skipped', { error });
        continue;
      }

      const anomalies = detect(entry);

      if (!typesByApi.has(entry.api_name)) typesByApi.set(entry.api_name, new Set());
      for (const a of anomalies) typesByApi.get(entry.api_name).add(a.type);

      if (anomalies.length === 0) {
        results.push({ api_name: entry.api_name, status: 'healthy', anomalies: 0 });
        continue;
      }

      // One AI call per API record, shared by all its anomalies.
      const { message, source } = await generateAlert(entry, anomalies);

      for (const a of anomalies) {
        rowsToStore.push({
          api_name: entry.api_name,
          type: a.type,
          severity: a.severity,
          detail: a.detail,
          message,
          message_source: source
        });
      }

      results.push({ api_name: entry.api_name, status: 'anomaly', anomalies: anomalies.length });
      logger.info('Anomaly detected', { api: entry.api_name, types: anomalies.map(a => a.type) });
    }

    const { inserted, updated } = rowsToStore.length > 0
      ? alertStore.upsertAll(rowsToStore)
      : { inserted: 0, updated: 0 };

    // Auto-resolve: an active alert is closed when its API no longer shows that issue.
    let autoResolved = 0;
    for (const [api, types] of typesByApi) {
      const n = alertStore.resolveRecovered(api, [...types]);
      if (n > 0) logger.info('Alerts auto-resolved', { api, count: n });
      autoResolved += n;
    }

    res.json({
      processed: entries.length,
      stored_alerts: inserted,
      updated_alerts: updated,
      resolved_alerts: autoResolved,
      results
    });
  } catch (err) {
    next(err);
  }
});

// GET /alerts: all active anomalies.
app.get('/alerts', (req, res, next) => {
  try {
    res.json(alertStore.activeAlerts());
  } catch (err) {
    next(err);
  }
});

// POST /alerts/:id/resolve: mark an alert as resolved so it leaves the active list.
app.post('/alerts/:id/resolve', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid alert id' });
    if (!alertStore.resolve(id)) return res.status(404).json({ error: 'Active alert not found' });
    logger.info('Alert resolved', { id });
    res.json({ resolved: id });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Central error handler.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown.
process.on('SIGINT', () => {
  server.close(() => {
    alertStore.close();
    process.exit(0);
  });
});
