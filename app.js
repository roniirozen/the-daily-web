const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const indexRoutes = require('./routes');
const publicRoutes = require('./routes/publicRoutes');
const authRoutes = require('./routes/authRoutes');
const reporterRoutes = require('./routes/reporterRoutes');
const editorRoutes = require('./routes/editorRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const feedRoutes = require('./routes/feedRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const { loadCurrentUser } = require('./middleware/authMiddleware');
const { notFound, errorHandler, logServerResponses } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(logServerResponses);
app.use(loadCurrentUser);
app.use('/', indexRoutes);
app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/reporter', reporterRoutes);
app.use('/editor/analytics', analyticsRoutes);
app.use('/editor', editorRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/weather', weatherRoutes);

app.use(notFound);
app.use(errorHandler);

async function startServer() {
  logger.info('Application starting', { port: PORT });
  await connectDB();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(PORT);
    listener.once('error', reject);
    listener.once('listening', () => {
      listener.removeListener('error', reject);
      resolve(listener);
    });
  });
  server.on('error', error => logger.error('HTTP server error', { error }));
  logger.info('HTTP server listening', { port: server.address().port });
  return server;
}

if (require.main === module) {
  startServer().catch(async error => {
    logger.error('Application startup failed', { error });
    process.exitCode = 1;
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      logger.error('MongoDB cleanup failed', { error: disconnectError });
    }
  });
}

module.exports = { app, startServer };
