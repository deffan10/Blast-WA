const { Op } = require('sequelize');
const { 
  Contact, 
  ContactGroup, 
  BlastCampaign, 
  BlastLog, 
  MessageTemplate,
  WhatsAppSession 
} = require('../models');
const { getWhatsAppStatus } = require('../services/whatsapp.service');

class DashboardController {
  // Get dashboard statistics
  async getStats(req, res) {
    try {
      // Get WhatsApp status
      const waStatus = getWhatsAppStatus();

      // Get counts
      const [
        totalContacts,
        totalGroups,
        totalTemplates,
        registeredContacts,
        notRegisteredContacts
      ] = await Promise.all([
        Contact.count({ where: { is_active: true } }),
        ContactGroup.count({ where: { is_active: true } }),
        MessageTemplate.count({ where: { is_active: true } }),
        Contact.count({ where: { is_active: true, wa_status: 'registered' } }),
        Contact.count({ where: { is_active: true, wa_status: 'not_registered' } })
      ]);

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get blast statistics
      const [
        totalSent,
        totalFailed,
        totalSkipped,
        todaySent,
        todayFailed,
        todaySkipped
      ] = await Promise.all([
        BlastLog.count({ where: { status: 'sent' } }),
        BlastLog.count({ where: { status: 'failed' } }),
        BlastLog.count({ where: { status: 'skipped' } }),
        BlastLog.count({ 
          where: { 
            status: 'sent',
            sent_at: { [Op.gte]: today, [Op.lt]: tomorrow }
          } 
        }),
        BlastLog.count({ 
          where: { 
            status: 'failed',
            created_at: { [Op.gte]: today, [Op.lt]: tomorrow }
          } 
        }),
        BlastLog.count({ 
          where: { 
            status: 'skipped',
            created_at: { [Op.gte]: today, [Op.lt]: tomorrow }
          } 
        })
      ]);

      // Get active campaigns
      const activeCampaigns = await BlastCampaign.findAll({
        where: { status: ['queued', 'running'] },
        include: [
          { model: MessageTemplate, as: 'template', attributes: ['name'] },
          { model: ContactGroup, as: 'group', attributes: ['name'] }
        ],
        order: [['created_at', 'DESC']],
        limit: 5
      });

      // Get recent logs
      const recentLogs = await BlastLog.findAll({
        include: [
          { model: BlastCampaign, as: 'campaign', attributes: ['name'] }
        ],
        order: [['created_at', 'DESC']],
        limit: 10
      });

      // Get WhatsApp session info
      let waSession = await WhatsAppSession.findOne({ 
        where: { session_id: 'default' } 
      });

      res.json({
        success: true,
        data: {
          whatsapp: {
            status: waStatus.status,
            phone: waStatus.phone || (waSession?.phone_number),
            name: waStatus.name || (waSession?.name),
            messagesSentToday: waSession?.messages_sent_today || 0
          },
          contacts: {
            total: totalContacts,
            registered: registeredContacts,
            notRegistered: notRegisteredContacts,
            unknown: totalContacts - registeredContacts - notRegisteredContacts
          },
          groups: totalGroups,
          templates: totalTemplates,
          blast: {
            total: {
              sent: totalSent,
              failed: totalFailed,
              skipped: totalSkipped
            },
            today: {
              sent: todaySent,
              failed: todayFailed,
              skipped: todaySkipped
            }
          },
          activeCampaigns,
          recentLogs
        }
      });

    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get dashboard statistics'
      });
    }
  }
}

module.exports = new DashboardController();
