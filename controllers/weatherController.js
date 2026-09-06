const weatherService = require('../services/weatherService');
const logger = require('../utils/logger');

exports.getWeather = async (req, res, next) => {
  try {
    const weather = await weatherService.getWeather();
    return res.json(weather);
  } catch (error) {
    logger.error('Weather service unavailable', { error, route: '/api/weather' });
    res.locals.errorLogged = true;
    return res.status(503).json({ message: 'Weather is temporarily unavailable.' });
  }
};
