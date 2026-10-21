const express = require('express');
const editorController = require('../controllers/editorController');
const userAdminController = require('../controllers/userAdminController');
const { requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Integration: mount at /editor AFTER loadCurrentUser and body parsing.
// Identity and role come only from the existing server-loaded user.
router.use(requireRole('editor'));

router.get('/users', userAdminController.listUsers);
router.get('/users/new', userAdminController.getCreateUser);
router.post('/users', userAdminController.createUser);
router.get('/users/:id/edit', userAdminController.getEditUser);
router.patch('/users/:id', userAdminController.updateUser);
router.delete('/users/:id', userAdminController.deleteUser);

router.get('/', editorController.getDashboard);
router.get('/articles/:id', editorController.getReviewArticle);
// HTML forms reach PATCH and DELETE through middleware/methodOverride.js.
router.patch('/articles/:id', editorController.editArticle);
router.patch('/articles/:id/status', editorController.changeStatus);
router.delete('/articles/:id', editorController.deleteArticle);

module.exports = router;
