const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Integration: mount at /editor/analytics AFTER loadCurrentUser and body parsing.
// Identity and role come only from the existing server-loaded user.
router.use(requireRole('editor'));

router.get('/:id', analyticsController.getAnalyticsPage);
router.get('/:id/data', analyticsController.getAnalyticsData);

module.exports = router;
