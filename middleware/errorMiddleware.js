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

function wantsJson(req) {
  return req.path.startsWith('/api/') || Boolean(req.is('json')) ||
    req.accepts(['html', 'json']) === 'json';
}

// Only a page on this site may be offered as the way back.
function sameSiteReferrer(req) {
  try {
    const referrer = new URL(req.get('referer'));
    return referrer.host === req.get('host') ? referrer.pathname + referrer.search : null;
  } catch {
    return null;
  }
}

// API callers receive JSON. Browsers receive a styled page with a way back.
function respond(req, res, status, message) {
  if (wantsJson(req)) return res.status(status).json({ message });
  return res.status(status).render('error', {
    status, message, currentUser: res.locals.currentUser || null, backUrl: sameSiteReferrer(req)
  });
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

  // The response has already started, so it can only be closed.
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

// Also log 5xx responses that controllers send themselves.
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

module.exports = { notFound, errorHandler, logServerResponses, respond, wantsJson };
