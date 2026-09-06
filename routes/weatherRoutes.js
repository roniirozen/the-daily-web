const express = require('express');
const weatherController = require('../controllers/weatherController');

const router = express.Router();

// Integration: mount at /api/weather. Public endpoint - no auth required.
router.get('/', weatherController.getWeather);

module.exports = router;
