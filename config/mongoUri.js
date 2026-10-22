// Used by the server and the seed scripts, unless MONGO_URI is set.
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/web-daily-demo';

module.exports = {
  DEFAULT_MONGO_URI,
  MONGO_URI: process.env.MONGO_URI || DEFAULT_MONGO_URI
};
