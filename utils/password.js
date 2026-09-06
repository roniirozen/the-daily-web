const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');

  const derivedKey = await scryptAsync(
    password,
    salt,
    64
  );

  return {
    salt,
    hash: derivedKey.toString('hex')
  };
}

async function verifyPassword(password, salt, storedHash) {
  const derivedKey = await scryptAsync(
    password,
    salt,
    64
  );

  const storedHashBuffer = Buffer.from(
    storedHash,
    'hex'
  );

  if (storedHashBuffer.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    storedHashBuffer,
    derivedKey
  );
}

module.exports = {
  hashPassword,
  verifyPassword
};