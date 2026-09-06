const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const viewStatsController = require('../controllers/viewStatsController');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Integration: mount at /editor/analytics AFTER loadCurrentUser and body parsing.
// Identity and role come only from the existing server-loaded user.
router.use(requireRole('editor'));

router.get('/:id', analyticsController.getAnalyticsPage);
router.get('/:id/data', analyticsController.getAnalyticsData);
router.get('/:id/stats', viewStatsController.list);
router.post('/:id/stats', viewStatsController.create);
router.get('/:id/stats/:statId', viewStatsController.get);
router.patch('/:id/stats/:statId', viewStatsController.update);
router.delete('/:id/stats/:statId', viewStatsController.remove);

module.exports = router;
