const Session = require('../models/Session');
const logger = require('../utils/logger');
const { respond, wantsJson } = require('./errorMiddleware');

const {
  COOKIE_NAME,
  hashSessionToken,
  readCookie
} = require('../utils/sessionToken');

async function loadCurrentUser(req, res, next) {
  try {
    const token = readCookie(req, COOKIE_NAME);

    req.currentUser = null;
    req.session = null;
    res.locals.currentUser = null;

    if (!token) {
      return next();
    }

    const tokenHash = hashSessionToken(token);

    const session = await Session
      .findOne({
        tokenHash,
        expiresAt: {
          $gt: new Date()
        }
      })
      .populate('user');

    if (!session || !session.user) {
      logger.warn('Session rejected', { reason: 'invalid_or_expired_session' });
      return next();
    }

    req.currentUser = session.user;
    // Views receive only what the navigation needs, never password fields.
    res.locals.currentUser = { username: session.user.username, role: session.user.role };

    req.session = {
      user: {
        id: session.user._id.toString(),
        username: session.user.username,
        role: session.user.role
      }
    };

    next();
  } catch (error) {
    next(error);
  }
}

function requireAuthentication(req, res, next) {
  if (!req.currentUser) {
    logger.warn('Authentication required', { method: req.method, route: req.baseUrl || '/' });
    if (req.method !== 'GET') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  next();
}

function requireRole(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.currentUser) {
      logger.warn('Authentication required', { method: req.method, route: req.baseUrl || '/' });
      // A browser opening a protected page is sent to sign in, as in requireAuthentication.
      if (req.method === 'GET' && !wantsJson(req)) {
        return res.redirect('/login');
      }
      return respond(req, res, 401, 'Sign in with a Reporter or Editor account to continue.');
    }

    if (!allowedRoles.includes(req.currentUser.role)) {
      logger.warn('Access denied', {
        method: req.method, route: req.baseUrl || '/',
        userId: req.currentUser._id.toString(), role: req.currentUser.role
      });
      return respond(req, res, 403, 'Your account does not have permission to open this page.');
    }

    next();
  };
}

module.exports = {
  loadCurrentUser,
  requireAuthentication,
  requireRole
};
