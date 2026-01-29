const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware);

// Backward compatible routes
router.get('/status', whatsappController.getStatus);
router.post('/scan', whatsappController.scanQR);
router.post('/disconnect', whatsappController.disconnect);
router.post('/refresh', whatsappController.refresh);

// Multi-session routes
router.get('/sessions', whatsappController.getAllSessions);
router.get('/sessions/:sessionId', whatsappController.getSessionStatus);
router.post('/sessions/:sessionId/init', whatsappController.initSession);
router.post('/sessions/:sessionId/disconnect', whatsappController.disconnectSession);
router.post('/sessions/:sessionId/refresh', whatsappController.refreshSession);
router.patch('/sessions/:sessionId/label', whatsappController.updateSessionLabel);
router.patch('/sessions/:sessionId/active', whatsappController.toggleSessionActive);

module.exports = router;
