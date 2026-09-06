const User = require('../models/User');
const Session = require('../models/Session');
const logger = require('../utils/logger');

const {
  verifyPassword
} = require('../utils/password');

const {
  COOKIE_NAME,
  createSessionToken,
  hashSessionToken,
  readCookie
} = require('../utils/sessionToken');

// Fixed dummy values are not an account. They make unknown usernames perform
// the same scrypt derivation as an incorrect password for an existing user.
const DUMMY_PASSWORD_SALT = '00000000000000000000000000000000';
const DUMMY_PASSWORD_HASH = '0'.repeat(128);

const SESSION_DURATION_MS =
  7 * 24 * 60 * 60 * 1000;

exports.getLogin = (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === 'editor') {
      return res.redirect('/editor');
    }

    return res.redirect('/reporter');
  }

  res.render('auth/login', {
    pageTitle: 'Login',
    errorMessage: null
  });
};

exports.login = async (req, res, next) => {
  try {
    const username =
      String(req.body?.username || '')
        .trim()
        .toLowerCase();

    const password =
      String(req.body?.password || '');

    if (!username || !password) {
      logger.warn('Login failed', { reason: 'missing_credentials' });
      return res.status(400).render(
        'auth/login',
        {
          pageTitle: 'Login',
          errorMessage:
            'Username and password are required.'
        }
      );
    }

    const user = await User.findOne({
      username
    });

    const passwordIsValid = await verifyPassword(
      password,
      user ? user.passwordSalt : DUMMY_PASSWORD_SALT,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH
    );

    if (!user || !passwordIsValid) {
      logger.warn('Login failed', { reason: 'invalid_credentials' });
      return res.status(401).render(
        'auth/login',
        {
          pageTitle: 'Login',
          errorMessage:
            'Invalid username or password.'
        }
      );
    }

    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MS
    );

    await Session.create({
      user: user._id,
      tokenHash,
      expiresAt
    });

    res.cookie(
      COOKIE_NAME,
      token,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure:
          process.env.NODE_ENV === 'production',
        maxAge: SESSION_DURATION_MS
      }
    );

    logger.info('Login succeeded', { userId: user._id.toString(), role: user.role });

    if (user.role === 'editor') {
      return res.redirect('/editor');
    }

    res.redirect('/reporter');
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const token = readCookie(
      req,
      COOKIE_NAME
    );

    if (token) {
      const tokenHash =
        hashSessionToken(token);

      await Session.deleteOne({
        tokenHash
      });
    }

    res.clearCookie(COOKIE_NAME);
    logger.info('Logout completed', { userId: req.currentUser?._id.toString() });

    res.redirect('/');
  } catch (error) {
    next(error);
  }
};
