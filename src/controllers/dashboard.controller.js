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
const config = require('../config');

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

      // Get 5 recent campaigns (all status)
      const recentCampaigns = await BlastCampaign.findAll({
        include: [
          { model: MessageTemplate, as: 'template', attributes: ['name'] },
          { model: ContactGroup, as: 'group', attributes: ['name'] }
        ],
        order: [['created_at', 'DESC']],
        limit: 5
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
          recentCampaigns
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

  // Get recent activity with pagination
  async getRecentActivity(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const filter = req.query.filter || '';
      const offset = (page - 1) * limit;

      console.log('Activity filter received:', filter, 'Query:', req.query);

      // Build where clause based on filter
      let where = {};
      let order = [['created_at', 'DESC']];
      
      if (filter === 'pending') {
        where.status = 'pending';
      } else if (filter === 'sent') {
        where.status = 'sent';
      } else if (filter === 'failed') {
        where.status = 'failed';
      } else if (filter === 'skipped') {
        where.status = 'skipped';
      } else if (filter === 'pending_soon') {
        where.status = 'pending';
        order = [['scheduled_at', 'ASC']];
      } else if (filter === 'pending_later') {
        where.status = 'pending';
        order = [['scheduled_at', 'DESC']];
      }

      console.log('Where clause:', where, 'Order:', order);

      // Get total count with filter
      const totalLogs = await BlastLog.count({ where });
      
      console.log('Total logs with filter:', totalLogs);
      
      // Get paginated logs with campaign info
      const logs = await BlastLog.findAll({
        where,
        include: [
          { 
            model: BlastCampaign, 
            as: 'campaign', 
            attributes: ['name', 'interval_minutes', 'status'] 
          }
        ],
        order,
        limit,
        offset
      });

      // Calculate estimated send time for pending messages
      const logsWithTimeInfo = await Promise.all(logs.map(async (log) => {
        const logData = log.toJSON();
        
        if (logData.status === 'pending' && logData.campaign) {
          // Calculate queue position and estimated time
          const queuePosition = await BlastLog.count({
            where: {
              campaign_id: logData.campaign_id,
              status: 'pending',
              id: { [Op.lt]: logData.id }
            }
          });
          
          // Get the last sent message time for this campaign
          const lastSent = await BlastLog.findOne({
            where: {
              campaign_id: logData.campaign_id,
              status: 'sent'
            },
            order: [['sent_at', 'DESC']]
          });
          
          // Calculate estimated time
          const intervalMs = (logData.campaign.interval_minutes || 5) * 60 * 1000;
          const randomDelayMs = ((config.whatsapp.randomDelayMin || 30) + (config.whatsapp.randomDelayMax || 90)) / 2 * 1000;
          const avgDelayMs = intervalMs + randomDelayMs;
          
          let estimatedTime;
          if (lastSent && lastSent.sent_at) {
            estimatedTime = new Date(lastSent.sent_at.getTime() + (avgDelayMs * (queuePosition + 1)));
          } else {
            estimatedTime = new Date(Date.now() + (avgDelayMs * queuePosition));
          }
          
          logData.queuePosition = queuePosition + 1;
          logData.estimatedSendTime = estimatedTime;
          logData.timeLeftMs = Math.max(0, estimatedTime.getTime() - Date.now());
        }
        
        return logData;
      }));

      const totalPages = Math.ceil(totalLogs / limit);

      res.json({
        success: true,
        data: {
          logs: logsWithTimeInfo,
          pagination: {
            page,
            limit,
            totalLogs,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Recent activity error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get recent activity'
      });
    }
  }
}

module.exports = new DashboardController();
