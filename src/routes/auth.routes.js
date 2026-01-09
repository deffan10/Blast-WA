const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// Public routes
router.post('/login', authController.login);

// Protected routes
router.get('/profile', authMiddleware, authController.profile);
router.post('/logout', authMiddleware, authController.logout);
router.put('/password', authMiddleware, authController.updatePassword);

module.exports = router;
