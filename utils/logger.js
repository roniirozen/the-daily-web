const fs = require('node:fs');
const path = require('node:path');

const logDirectory = path.join(__dirname, '..', 'logs');
const contextFields = ['method', 'route', 'status', 'userId', 'role', 'reason', 'port'];

function errorDetails(error) {
  const details = { name: error.name || 'Error' };
  if (typeof error.code === 'number' || /^[A-Z_0-9]+$/.test(error.code || '')) {
    details.code = error.code;
  }
  // Error messages can contain submitted values, tokens or database URLs.
  // Keep stack locations for debugging, without the message or nested causes.
  if (process.env.NODE_ENV !== 'production' && typeof error.stack === 'string') {
    details.stack = error.stack.split('\n').filter(line => /^\s+at /.test(line));
  }
  return details;
}

function write(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const data = {};
  // Only explicitly supported operational metadata can reach the log file.
  // Callers use fixed messages/reasons and route templates, never request data.
  for (const field of contextFields) {
    const value = context[field];
    if (typeof value === 'string' || typeof value === 'number') {
      data[field] = typeof value === 'string' ? value.slice(0, 200) : value;
    }
  }
  if (context.error instanceof Error) data.error = errorDetails(context.error);

  const entry = JSON.stringify({ timestamp, level, message, ...data });
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  output(entry);

  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(path.join(logDirectory, `${timestamp.slice(0, 10)}.log`), `${entry}\n`, {
      encoding: 'utf8', mode: 0o600
    });
  } catch (error) {
    // A full disk or unwritable folder must not break a request or recurse.
    console.error(JSON.stringify({
      timestamp, level: 'error', message: 'Could not write log file',
      error: errorDetails(error)
    }));
  }
}

module.exports = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context)
};
