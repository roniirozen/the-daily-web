const { STATUS_CODES } = require('node:http');
const logger = require('../utils/logger');

const unavailableErrors = new Set([
  'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
  'MongooseServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError',
  'MongoPoolClearedError'
]);

function errorStatus(error) {
  if (error.type === 'entity.too.large' || error.type === 'parameters.too.many') return 413;
  if (error.type === 'entity.parse.failed' || error.name === 'ValidationError' ||
      error.name === 'CastError') return 400;
  if (error.code === 11000 || error.name === 'VersionError' ||
      error.name === 'DocumentNotFoundError') return 409;
  if (unavailableErrors.has(error.name)) return 503;

  const status = error.statusCode || error.status;
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : 500;
}

function respond(req, res, status, message) {
  const wantsJson = req.path.startsWith('/api/') || req.is('json') ||
    req.accepts(['html', 'json']) === 'json';
  if (wantsJson) return res.status(status).json({ message });
  return res.status(status).type('text').send(message);
}

function notFound(req, res) {
  return respond(req, res, 404, 'Page not found');
}

function errorHandler(error, req, res, next) {
  const status = errorStatus(error);
  const log = status >= 500 ? logger.error : logger.warn;
  res.locals.errorLogged = true;
  log('Request failed', {
    status, method: req.method, route: req.route?.path || req.baseUrl || '/', error
  });

  // A response already in flight cannot be replaced. Close it without passing
  // raw error messages to Express's default console logger or writing twice.
  if (res.headersSent) return res.destroy();

  const messages = {
    400: 'Invalid request input',
    404: 'Page not found',
    409: 'The request conflicts with the current data',
    413: 'Request body is too large',
    500: 'Internal server error',
    503: 'Service temporarily unavailable'
  };
  return respond(req, res, status, messages[status] || STATUS_CODES[status] || 'Request failed');
}

// Some existing controllers handle service failures themselves. Record their
// 5xx responses too, without changing those controllers or logging any body.
function logServerResponses(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 500 && !res.locals.errorLogged) {
      logger.error('Request completed with server error', {
        status: res.statusCode, method: req.method, route: req.route?.path || '/'
      });
    }
  });
  next();
}

module.exports = { notFound, errorHandler, logServerResponses };
