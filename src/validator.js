// Validates one incoming API record before it is analysed.
// Returns { valid: true, entry } or { valid: false, error }.
function validate(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, error: 'Entry must be a JSON object' };
  }
  if (typeof entry.api_name !== 'string' || entry.api_name.trim() === '') {
    return { valid: false, error: 'api_name is required and must be a non-empty string' };
  }
  if (entry.response_time_ms !== undefined && typeof entry.response_time_ms !== 'number') {
    return { valid: false, error: 'response_time_ms must be a number' };
  }
  if (entry.status_code !== undefined && typeof entry.status_code !== 'number') {
    return { valid: false, error: 'status_code must be a number' };
  }
  if (entry.records_returned !== undefined && entry.records_returned !== null &&
      typeof entry.records_returned !== 'number') {
    return { valid: false, error: 'records_returned must be a number or null' };
  }
  return { valid: true, entry };
}

module.exports = { validate };
