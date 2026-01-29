const { 
  initWhatsApp, 
  initSession,
  getWhatsAppStatus,
  getSessionStatus,
  getAllSessionsStatus,
  disconnectWhatsApp,
  disconnectSession,
  refreshSession,
  getConnectedSessionsCount,
  MAX_SESSIONS
} = require('../services/whatsapp.service');
const { WhatsAppSession } = require('../models');

class WhatsAppController {
  // Get WhatsApp status (backward compatible - returns any connected session)
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

  // Get all sessions status
  async getAllSessions(req, res) {
    try {
      const sessions = getAllSessionsStatus();
      
      // Try to get DB sessions, handle if columns don't exist yet
      let dbSessions = [];
      try {
        dbSessions = await WhatsAppSession.findAll();
      } catch (dbError) {
        console.log('DB query failed (migration may be needed):', dbError.message);
      }
      
      // Merge DB data with runtime status
      const merged = sessions.map(session => {
        const dbSession = dbSessions.find(db => db.session_id === session.sessionId);
        return {
          ...session,
          label: dbSession?.label || `WhatsApp ${session.sessionId.replace('wa_', '')}`,
          messages_sent_today: dbSession?.messages_sent_today || 0,
          is_active: dbSession?.is_active !== false
        };
      });
      
      res.json({
        success: true,
        data: {
          sessions: merged,
          connectedCount: getConnectedSessionsCount(),
          maxSessions: MAX_SESSIONS
        }
      });

    } catch (error) {
      console.error('Get all sessions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get sessions status'
      });
    }
  }

  // Get specific session status
  async getSessionStatus(req, res) {
    try {
      const { sessionId } = req.params;
      const status = getSessionStatus(sessionId);
      const dbSession = await WhatsAppSession.findOne({ where: { session_id: sessionId } });
      
      res.json({
        success: true,
        data: {
          ...status,
          label: dbSession?.label,
          messages_sent_today: dbSession?.messages_sent_today || 0,
          is_active: dbSession?.is_active !== false
        }
      });

    } catch (error) {
      console.error('Get session status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session status'
      });
    }
  }

  // Initialize/Scan QR (backward compatible - uses wa_1)
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

  // Initialize specific session
  async initSession(req, res) {
    try {
      const { sessionId } = req.params;
      
      // Validate session ID
      const sessionNum = parseInt(sessionId.replace('wa_', ''));
      if (isNaN(sessionNum) || sessionNum < 1 || sessionNum > MAX_SESSIONS) {
        return res.status(400).json({
          success: false,
          message: `Invalid session ID. Use wa_1 to wa_${MAX_SESSIONS}`
        });
      }
      
      const io = req.app.get('io');
      await initSession(sessionId, io);

      res.json({
        success: true,
        message: `Session ${sessionId} initialization started. Watch for QR code.`
      });

    } catch (error) {
      console.error('Init session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize session'
      });
    }
  }

  // Disconnect WhatsApp (backward compatible - disconnects all)
  async disconnect(req, res) {
    try {
      await disconnectWhatsApp();

      res.json({
        success: true,
        message: 'All WhatsApp sessions disconnected'
      });

    } catch (error) {
      console.error('Disconnect error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect WhatsApp'
      });
    }
  }

  // Disconnect specific session
  async disconnectSession(req, res) {
    try {
      const { sessionId } = req.params;
      await disconnectSession(sessionId);

      res.json({
        success: true,
        message: `Session ${sessionId} disconnected`
      });

    } catch (error) {
      console.error('Disconnect session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect session'
      });
    }
  }

  // Refresh session (backward compatible)
  async refresh(req, res) {
    try {
      const io = req.app.get('io');
      await refreshSession('wa_1', io);

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

  // Refresh specific session
  async refreshSession(req, res) {
    try {
      const { sessionId } = req.params;
      const io = req.app.get('io');
      await refreshSession(sessionId, io);

      res.json({
        success: true,
        message: `Session ${sessionId} refresh initiated`
      });

    } catch (error) {
      console.error('Refresh session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh session'
      });
    }
  }

  // Update session label
  async updateSessionLabel(req, res) {
    try {
      const { sessionId } = req.params;
      const { label } = req.body;
      
      let session = await WhatsAppSession.findOne({ where: { session_id: sessionId } });
      if (!session) {
        session = await WhatsAppSession.create({ 
          session_id: sessionId,
          label: label || `WhatsApp ${sessionId.replace('wa_', '')}`
        });
      } else {
        await session.update({ label });
      }

      res.json({
        success: true,
        message: 'Session label updated',
        data: session
      });

    } catch (error) {
      console.error('Update session label error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update session label'
      });
    }
  }

  // Toggle session active status
  async toggleSessionActive(req, res) {
    try {
      const { sessionId } = req.params;
      const { is_active } = req.body;
      
      let session = await WhatsAppSession.findOne({ where: { session_id: sessionId } });
      if (!session) {
        session = await WhatsAppSession.create({ 
          session_id: sessionId,
          is_active: is_active !== false
        });
      } else {
        await session.update({ is_active: is_active !== false });
      }

      res.json({
        success: true,
        message: `Session ${is_active ? 'activated' : 'deactivated'}`,
        data: session
      });

    } catch (error) {
      console.error('Toggle session active error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle session active status'
      });
    }
  }
}

module.exports = new WhatsAppController();
