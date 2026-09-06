const crypto = require('crypto');

const COOKIE_NAME = 'session_token';

function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashSessionToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

function readCookie(req, cookieName) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie
      .slice(0, separatorIndex)
      .trim();

    const value = cookie
      .slice(separatorIndex + 1)
      .trim();

    if (name === cookieName) {
      try {
        return decodeURIComponent(value);
      } catch (error) {
        if (error instanceof URIError) return null;
        throw error;
      }
    }
  }

  return null;
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  hashSessionToken,
  readCookie
};
