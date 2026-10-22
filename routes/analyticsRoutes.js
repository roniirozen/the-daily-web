const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const viewStatsController = require('../controllers/viewStatsController');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireRole('editor'));

router.get('/:id', analyticsController.getAnalyticsPage);
router.get('/:id/data', analyticsController.getAnalyticsData);
router.get('/:id/stats', viewStatsController.list);
router.post('/:id/stats', viewStatsController.create);
router.get('/:id/stats/:statId', viewStatsController.get);
router.patch('/:id/stats/:statId', viewStatsController.update);
router.delete('/:id/stats/:statId', viewStatsController.remove);

module.exports = router;
