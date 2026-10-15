const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'alerts.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_name TEXT NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    detail TEXT,
    message TEXT,
    message_source TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, created_at);
`);

const insertAlert = db.prepare(`
  INSERT INTO alerts (api_name, type, severity, detail, message, message_source)
  VALUES (@api_name, @type, @severity, @detail, @message, @message_source)
`);

// Refresh an already-active alert with the latest reading instead of ignoring it.
const updateActive = db.prepare(`
  UPDATE alerts
  SET severity = @severity, detail = @detail, message = @message,
      message_source = @message_source, created_at = CURRENT_TIMESTAMP
  WHERE status = 'active' AND api_name = @api_name AND type = @type
`);

const resolveAlert = db.prepare(`UPDATE alerts SET status = 'resolved' WHERE id = ? AND status = 'active'`);

const activeAlerts = db.prepare(`
  SELECT id, api_name, type, severity, detail, message, message_source, status, created_at
  FROM alerts
  WHERE status = 'active'
  ORDER BY created_at DESC, id DESC
`);

// Resolve active alerts for an API whose issue type is not in `currentTypes`
// (the API has recovered from those issues). Empty list resolves all of them.
function resolveRecovered(apiName, currentTypes) {
  const marks = currentTypes.map(() => '?').join(', ');
  const sql = `UPDATE alerts SET status = 'resolved'
               WHERE status = 'active' AND api_name = ?` +
              (currentTypes.length ? ` AND type NOT IN (${marks})` : '');
  return db.prepare(sql).run(apiName, ...currentTypes).changes;
}

module.exports = {
  // Save alerts in one transaction. If an active alert already exists for the same API and
  // issue type, refresh it with the latest data instead of creating a duplicate.
  upsertAll: db.transaction(rows => {
    let inserted = 0, updated = 0;
    for (const row of rows) {
      if (updateActive.run(row).changes > 0) { updated++; continue; }
      insertAlert.run(row);
      inserted++;
    }
    return { inserted, updated };
  }),
  resolveRecovered,
  activeAlerts: () => activeAlerts.all(),
  resolve: id => resolveAlert.run(id).changes > 0,
  close: () => db.close()
};
