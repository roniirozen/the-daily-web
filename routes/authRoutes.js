const express = require('express');

const authController =
  require('../controllers/authController');

const {
  loadCurrentUser
} = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/login',
  loadCurrentUser,
  authController.getLogin
);

router.post(
  '/login',
  authController.login
);

router.post(
  '/logout',
  authController.logout
);

module.exports = router;