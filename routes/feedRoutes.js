const express = require('express');
const feedController = require('../controllers/feedController');

const router = express.Router();

router.get('/', feedController.getFeed);
router.post('/', feedController.getFeed);
router.get('/categories', feedController.getCategories);

module.exports = router;
