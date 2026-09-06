const User = require('../models/User');
const Session = require('../models/Session');

const {
  verifyPassword
} = require('../utils/password');

const {
  COOKIE_NAME,
  createSessionToken,
  hashSessionToken,
  readCookie
} = require('../utils/sessionToken');

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
      String(req.body.username || '')
        .trim()
        .toLowerCase();

    const password =
      String(req.body.password || '');

    if (!username || !password) {
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

    if (!user) {
      return res.status(401).render(
        'auth/login',
        {
          pageTitle: 'Login',
          errorMessage:
            'Invalid username or password.'
        }
      );
    }

    const passwordIsValid =
      await verifyPassword(
        password,
        user.passwordSalt,
        user.passwordHash
      );

    if (!passwordIsValid) {
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

    res.redirect('/');
  } catch (error) {
    next(error);
  }
};