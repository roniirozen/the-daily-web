const express = require('express');
const feedController = require('../controllers/feedController');

const router = express.Router();

// Integration: mount at /api/feed. Public endpoint - no auth required.
router.get('/', feedController.getFeed);

module.exports = router;
