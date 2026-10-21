// The server, the demo seed and the demo verification all use this database
// unless MONGO_URI names another one, so seeded data appears in the app.
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/web-daily-demo';

module.exports = {
  DEFAULT_MONGO_URI,
  MONGO_URI: process.env.MONGO_URI || DEFAULT_MONGO_URI
};
