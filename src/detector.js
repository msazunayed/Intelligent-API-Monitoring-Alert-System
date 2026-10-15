const { SLOW_MS, CRITICAL_MS } = require('./config');

// Pure function: takes one API record, returns a list of anomalies.
function detect(entry) {
  const anomalies = [];
  const { response_time_ms, status_code, records_returned } = entry;

  // Response time
  if (typeof response_time_ms === 'number' && response_time_ms > SLOW_MS) {
    anomalies.push({
      type: 'HIGH_RESPONSE_TIME',
      severity: response_time_ms > CRITICAL_MS ? 'critical' : 'warning',
      detail: `Response took ${response_time_ms}ms (threshold ${SLOW_MS}ms)`
    });
  }

  // HTTP status
  if (typeof status_code === 'number') {
    if (status_code >= 500) {
      anomalies.push({ type: 'SERVER_ERROR', severity: 'critical', detail: `HTTP status ${status_code}` });
    } else if (status_code >= 400) {
      anomalies.push({ type: 'CLIENT_ERROR', severity: 'warning', detail: `HTTP status ${status_code}` });
    }
  }

  // Data validation
  if (records_returned === undefined || records_returned === null || records_returned === 0) {
    anomalies.push({
      type: 'NO_RECORDS',
      severity: 'warning',
      detail: 'Returned 0 or missing records'
    });
  }

  return anomalies;
}

module.exports = { detect };
