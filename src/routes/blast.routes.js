const express = require('express');
const router = express.Router();
const blastController = require('../controllers/blast.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/process-status', blastController.getProcessStatus);
router.post('/clear-queue', blastController.clearQueue);
router.get('/campaigns', blastController.getCampaigns);
router.get('/campaigns/:id', blastController.getCampaign);
router.get('/campaigns/:id/logs', blastController.getCampaignLogs);
router.post('/campaigns', blastController.createCampaign);
router.post('/campaigns/:id/pause', blastController.pauseCampaign);
router.post('/campaigns/:id/resume', blastController.resumeCampaign);
router.post('/campaigns/:id/stop', blastController.stopCampaign);
router.patch('/campaigns/:id/interval', blastController.updateInterval);
router.delete('/campaigns/:id', blastController.deleteCampaign);

module.exports = router;
