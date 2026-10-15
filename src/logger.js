const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function write(level, message, meta) {
  const line = `${new Date().toISOString()} [${level}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  if (level === 'ERROR') console.error(line);
  else console.log(line);
  fs.appendFile(LOG_FILE, line + '\n', () => {});
}

module.exports = {
  info: (msg, meta) => write('INFO', msg, meta),
  warn: (msg, meta) => write('WARN', msg, meta),
  error: (msg, meta) => write('ERROR', msg, meta)
};
