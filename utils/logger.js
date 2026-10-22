const fs = require('node:fs');
const path = require('node:path');

const logDirectory = path.join(__dirname, '..', 'logs');
const contextFields = ['method', 'route', 'status', 'userId', 'role', 'reason', 'port'];

function errorDetails(error) {
  const details = { name: /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : 'Error' };
  if (typeof error.code === 'number' ||
      (typeof error.code === 'string' && /^[A-Z_0-9]{1,64}$/.test(error.code))) {
    details.code = error.code;
  }
  // Error messages may contain user input or secrets, so only the stack lines are logged.
  if (process.env.NODE_ENV !== 'production' && typeof error.stack === 'string') {
    const heading = error.message ? `${error.name}: ${error.message}` : error.name;
    // Remove the whole message first, in case it contains lines starting with "at".
    const locations = error.stack.startsWith(heading) ? error.stack.slice(heading.length) : '';
    details.stack = locations.split('\n').filter(line => /^\s+at /.test(line));
  }
  return details;
}

function write(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const data = {};
  // Only these known fields are written to the log file.
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
