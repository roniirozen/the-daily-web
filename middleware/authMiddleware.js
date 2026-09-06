const Session = require('../models/Session');
const logger = require('../utils/logger');

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

    /*
      This object is also provided so other parts
      of the project can easily access the logged-in user.
    */
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
      return res.status(401).send(
        'Authentication required'
      );
    }

    if (!allowedRoles.includes(req.currentUser.role)) {
      logger.warn('Access denied', {
        method: req.method, route: req.baseUrl || '/',
        userId: req.currentUser._id.toString(), role: req.currentUser.role
      });
      return res.status(403).send(
        'You do not have permission to access this resource'
      );
    }

    next();
  };
}

module.exports = {
  loadCurrentUser,
  requireAuthentication,
  requireRole
};
