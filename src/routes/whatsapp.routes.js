const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/status', whatsappController.getStatus);
router.post('/scan', whatsappController.scanQR);
router.post('/disconnect', whatsappController.disconnect);
router.post('/refresh', whatsappController.refresh);

module.exports = router;
