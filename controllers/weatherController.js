const weatherService = require('../services/weatherService');

exports.getWeather = async (req, res, next) => {
  try {
    const weather = await weatherService.getWeather();
    return res.json(weather);
  } catch (error) {
    console.error('Weather service unavailable:', error.message);
    return res.status(503).json({ message: 'Weather is temporarily unavailable.' });
  }
};
