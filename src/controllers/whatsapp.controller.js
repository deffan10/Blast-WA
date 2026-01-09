const { 
  initWhatsApp, 
  getWhatsAppStatus, 
  disconnectWhatsApp,
  refreshSession
} = require('../services/whatsapp.service');

class WhatsAppController {
  // Get WhatsApp status
  async getStatus(req, res) {
    try {
      const status = getWhatsAppStatus();
      
      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Get WA status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get WhatsApp status'
      });
    }
  }

  // Initialize/Scan QR
  async scanQR(req, res) {
    try {
      const io = req.app.get('io');
      await initWhatsApp(io);

      res.json({
        success: true,
        message: 'WhatsApp initialization started. Watch for QR code.'
      });

    } catch (error) {
      console.error('Scan QR error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize WhatsApp'
      });
    }
  }

  // Disconnect WhatsApp
  async disconnect(req, res) {
    try {
      await disconnectWhatsApp();

      res.json({
        success: true,
        message: 'WhatsApp disconnected'
      });

    } catch (error) {
      console.error('Disconnect error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect WhatsApp'
      });
    }
  }

  // Refresh session
  async refresh(req, res) {
    try {
      const io = req.app.get('io');
      await refreshSession(io);

      res.json({
        success: true,
        message: 'Session refresh initiated'
      });

    } catch (error) {
      console.error('Refresh session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh session'
      });
    }
  }
}

module.exports = new WhatsAppController();
