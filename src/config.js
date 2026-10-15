// Central place for thresholds and settings so they are easy to change and explain.
module.exports = {
  SLOW_MS: 3000,        // response time above this is a warning
  CRITICAL_MS: 5000,    // response time above this is critical
  LLM_TIMEOUT_MS: 10000,
  PORT: process.env.PORT || 3000
};
