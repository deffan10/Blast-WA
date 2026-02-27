const { Op } = require('sequelize');
const { 
  BlastCampaign, 
  BlastLog, 
  Contact, 
  ContactGroup, 
  MessageTemplate 
} = require('../models');
const { addToBlastQueue, pauseBlastQueue, resumeBlastQueue, stopBlastQueue, getQueueStats } = require('../services/queue.service');
const { getWhatsAppStatus } = require('../services/whatsapp.service');

class BlastController {
  // Get all campaigns
  async getCampaigns(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (status) {
        where.status = status;
      }

      const { rows: campaigns, count: total } = await BlastCampaign.findAndCountAll({
        where,
        include: [
          { model: MessageTemplate, as: 'template', attributes: ['id', 'name'] },
          { model: ContactGroup, as: 'group', attributes: ['id', 'name'] }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: {
          campaigns,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get campaigns'
      });
    }
  }

  // Get single campaign with logs
  async getCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BlastCampaign.findByPk(id, {
        include: [
          { model: MessageTemplate, as: 'template' },
          { model: ContactGroup, as: 'group' }
        ]
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      res.json({
        success: true,
        data: campaign
      });

    } catch (error) {
      console.error('Get campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get campaign'
      });
    }
  }

  // Get campaign logs
  async getCampaignLogs(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50, status } = req.query;
      const offset = (page - 1) * limit;

      const where = { campaign_id: id };
      if (status) {
        where.status = status;
      }

      const { rows: logs, count: total } = await BlastLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get campaign logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get campaign logs'
      });
    }
  }

  // Create and start blast campaign
  async createCampaign(req, res) {
    try {
      const { name, template_id, group_id, interval_minutes = 5, sender_session_id } = req.body;

      // Validate inputs
      if (!name || !template_id) {
        return res.status(400).json({
          success: false,
          message: 'Name and template are required'
        });
      }

      // Cek koneksi WhatsApp: minimal satu akun connected
      const { WhatsAppSession } = require('../models');
      const connectedSessions = await WhatsAppSession.findAll({
        where: { status: 'connected', is_active: true }
      });
      if (connectedSessions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'WhatsApp is not connected. Please scan QR code first.'
        });
      }
      // Jika pengirim spesifik dipilih, pastikan session tersebut connected
      if (sender_session_id) {
        const sessionConnected = connectedSessions.some(s => s.session_id === sender_session_id);
        if (!sessionConnected) {
          return res.status(400).json({
            success: false,
            message: 'Akun WhatsApp yang dipilih tidak terhubung. Pilih akun lain atau Semua WhatsApp.'
          });
        }
      }

      // Validate template
      const template = await MessageTemplate.findByPk(template_id);
      if (!template || !template.is_active) {
        return res.status(400).json({
          success: false,
          message: 'Invalid template'
        });
      }

      // Validate group if provided
      if (group_id) {
        const group = await ContactGroup.findByPk(group_id);
        if (!group || !group.is_active) {
          return res.status(400).json({
            success: false,
            message: 'Invalid group'
          });
        }
      }

      // Get target contacts
      const contactWhere = {
        is_active: true,
        wa_status: 'registered' // Only registered WA numbers
      };

      if (group_id) {
        contactWhere.group_id = group_id;
      }

      const contacts = await Contact.findAll({
        where: contactWhere,
        include: [{
          model: ContactGroup,
          as: 'group',
          attributes: ['name']
        }]
      });

      if (contacts.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No eligible contacts found (must have registered WhatsApp)'
        });
      }

      // Create campaign
      const campaign = await BlastCampaign.create({
        name,
        template_id,
        group_id: group_id || null,
        interval_minutes,
        sender_session_id: sender_session_id || null,
        total_contacts: contacts.length,
        status: 'queued'
      });

      // Create log entries for all contacts
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const contact of contacts) {
        // Check if already sent today
        const alreadySent = await BlastLog.findOne({
          where: {
            contact_id: contact.id,
            status: 'sent',
            sent_at: { [Op.gte]: today }
          }
        });

        await BlastLog.create({
          campaign_id: campaign.id,
          contact_id: contact.id,
          phone: contact.phone_normalized,
          name: contact.name,
          status: alreadySent ? 'skipped' : 'pending',
          skip_reason: alreadySent ? 'already_sent_today' : null
        });

        if (alreadySent) {
          campaign.skipped_count++;
        }
      }

      await campaign.save();

      // Add to blast queue
      addToBlastQueue(campaign.id);

      res.status(201).json({
        success: true,
        message: `Campaign created. ${contacts.length} contacts queued for blast.`,
        data: campaign
      });

    } catch (error) {
      console.error('Create campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create campaign'
      });
    }
  }

  // Pause campaign
  async pauseCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BlastCampaign.findByPk(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      if (campaign.status !== 'running' && campaign.status !== 'queued') {
        return res.status(400).json({
          success: false,
          message: 'Campaign is not running'
        });
      }

      pauseBlastQueue(campaign.id);
      await campaign.update({ status: 'paused' });

      res.json({
        success: true,
        message: 'Campaign paused',
        data: campaign
      });

    } catch (error) {
      console.error('Pause campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pause campaign'
      });
    }
  }

  // Resume campaign
  async resumeCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BlastCampaign.findByPk(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      if (campaign.status !== 'paused') {
        return res.status(400).json({
          success: false,
          message: 'Campaign is not paused'
        });
      }


      // Check if at least one WhatsApp session is connected
      const { WhatsAppSession } = require('../models');
      const connectedSessions = await WhatsAppSession.findAll({
        where: { status: 'connected', is_active: true }
      });
      if (connectedSessions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tidak ada WhatsApp session yang terhubung'
        });
      }

      resumeBlastQueue(campaign.id);
      await campaign.update({ status: 'running' });

      res.json({
        success: true,
        message: 'Campaign resumed',
        data: campaign
      });

    } catch (error) {
      console.error('Resume campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resume campaign'
      });
    }
  }

  // Stop campaign
  async stopCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BlastCampaign.findByPk(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      if (!['running', 'queued', 'paused'].includes(campaign.status)) {
        return res.status(400).json({
          success: false,
          message: 'Campaign cannot be stopped'
        });
      }

      stopBlastQueue(campaign.id);
      
      // Update remaining pending logs to skipped
      await BlastLog.update(
        { status: 'skipped', skip_reason: 'campaign_stopped' },
        { 
          where: { 
            campaign_id: id, 
            status: 'pending' 
          } 
        }
      );

      await campaign.update({ 
        status: 'stopped',
        completed_at: new Date()
      });

      res.json({
        success: true,
        message: 'Campaign stopped',
        data: campaign
      });

    } catch (error) {
      console.error('Stop campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop campaign'
      });
    }
  }

  // Update interval
  async updateInterval(req, res) {
    try {
      const { id } = req.params;
      const { interval_minutes } = req.body;

      if (!interval_minutes || interval_minutes < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid interval value'
        });
      }

      const campaign = await BlastCampaign.findByPk(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      if (!['running', 'queued', 'paused'].includes(campaign.status)) {
        return res.status(400).json({
          success: false,
          message: 'Only running, queued, or paused campaigns can be edited'
        });
      }

      await campaign.update({ interval_minutes });

      console.log(`Campaign ${id} interval updated to ${interval_minutes} minutes`);

      res.json({
        success: true,
        message: `Interval updated to ${interval_minutes} minutes`,
        data: campaign
      });

    } catch (error) {
      console.error('Update interval error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update interval'
      });
    }
  }

  // Update pengirim WA (untuk campaign yang running/queued/paused — misal akun kena ban)
  async updateSender(req, res) {
    try {
      const { id } = req.params;
      const { sender_session_id } = req.body;

      const campaign = await BlastCampaign.findByPk(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }
      if (!['running', 'queued', 'paused'].includes(campaign.status)) {
        return res.status(400).json({
          success: false,
          message: 'Hanya campaign yang berjalan/dijeda bisa diubah pengirimnya'
        });
      }

      const { WhatsAppSession } = require('../models');
      const connectedSessions = await WhatsAppSession.findAll({
        where: { status: 'connected', is_active: true }
      });
      if (sender_session_id) {
        const ok = connectedSessions.some(s => s.session_id === sender_session_id);
        if (!ok) {
          return res.status(400).json({
            success: false,
            message: 'Akun WhatsApp yang dipilih tidak terhubung. Pilih akun lain atau Semua WhatsApp.'
          });
        }
      }

      await campaign.update({ sender_session_id: sender_session_id || null });
      console.log(`Campaign ${id} pengirim diubah ke: ${sender_session_id || 'Semua WA'}`);

      res.json({
        success: true,
        message: sender_session_id ? 'Pengirim WA campaign diubah' : 'Campaign akan kirim dari Semua WhatsApp',
        data: campaign
      });
    } catch (error) {
      console.error('Update sender error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update sender'
      });
    }
  }

  // Bypass: tandai semua log yang belum terkirim (pending/failed/skipped) sebagai sent — biar campaign dianggap selesai
  async bypassCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BlastCampaign.findByPk(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      if (['running', 'queued', 'paused'].includes(campaign.status)) {
        stopBlastQueue(campaign.id);
      }

      const [bypassedCount] = await BlastLog.update(
        { status: 'sent', sent_at: new Date() },
        {
          where: {
            campaign_id: id,
            status: { [Op.in]: ['pending', 'failed', 'skipped'] }
          }
        }
      );

      if (bypassedCount > 0) {
        const { sequelize } = require('../config/database');
        const counts = await BlastLog.findAll({
          attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
          where: { campaign_id: id },
          group: ['status'],
          raw: true
        });
        const sent = counts.find(r => r.status === 'sent')?.cnt || 0;
        const failed = counts.find(r => r.status === 'failed')?.cnt || 0;
        const skipped = counts.find(r => r.status === 'skipped')?.cnt || 0;
        await campaign.update({
          sent_count: parseInt(sent, 10),
          failed_count: parseInt(failed, 10),
          skipped_count: parseInt(skipped, 10),
          status: 'completed',
          completed_at: new Date()
        });
      }

      res.json({
        success: true,
        message: bypassedCount > 0
          ? `${bypassedCount} kontak ditandai terkirim. Campaign selesai.`
          : 'Tidak ada log yang perlu di-bypass (semua sudah terkirim).',
        data: await BlastCampaign.findByPk(id)
      });

    } catch (error) {
      console.error('Bypass campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bypass campaign'
      });
    }
  }

  // Delete campaign
  async deleteCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await BlastCampaign.findByPk(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      // Stop if running
      if (['running', 'queued', 'paused'].includes(campaign.status)) {
        stopBlastQueue(campaign.id);
      }

      // Delete logs
      await BlastLog.destroy({ where: { campaign_id: id } });

      // Delete campaign
      await campaign.destroy();

      res.json({
        success: true,
        message: 'Campaign deleted'
      });

    } catch (error) {
      console.error('Delete campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete campaign'
      });
    }
  }

  // Get blast process status
  async getProcessStatus(req, res) {
    try {
      // Get queue stats
      const queueStats = await getQueueStats();

      // Get active/running campaigns
      const activeCampaigns = await BlastCampaign.findAll({
        where: {
          status: ['running', 'queued', 'paused']
        },
        include: [
          { model: MessageTemplate, as: 'template', attributes: ['id', 'name'] },
          { model: ContactGroup, as: 'group', attributes: ['id', 'name'] }
        ],
        order: [['created_at', 'DESC']]
      });

      // Get pending logs (belum terkirim)
      const pendingLogs = await BlastLog.findAll({
        where: {
          status: 'pending'
        },
        include: [
          { model: Contact, as: 'contact', attributes: ['id', 'name', 'phone'] },
          { model: BlastCampaign, as: 'campaign', attributes: ['id', 'name'] }
        ],
        order: [['id', 'ASC']],
        limit: 20
      });

      // Get WA status
      const waStatus = getWhatsAppStatus();

      res.json({
        success: true,
        data: {
          queueStats,
          activeCampaigns,
          pendingLogs,
          waStatus: {
            status: waStatus.status,
            phone: waStatus.phone
          }
        }
      });

    } catch (error) {
      console.error('Get process status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get process status'
      });
    }
  }

  // Clear all pending/queued items
  async clearQueue(req, res) {
    try {
      // Stop all running campaigns
      const runningCampaigns = await BlastCampaign.findAll({
        where: { status: ['running', 'queued', 'paused'] }
      });

      for (const campaign of runningCampaigns) {
        stopBlastQueue(campaign.id);
        await campaign.update({ status: 'stopped' });
      }

      // Delete pending logs
      const deletedLogs = await BlastLog.destroy({
        where: { status: 'pending' }
      });

      res.json({
        success: true,
        message: `Cleared ${runningCampaigns.length} campaigns and ${deletedLogs} pending messages`
      });

    } catch (error) {
      console.error('Clear queue error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear queue'
      });
    }
  }
}

module.exports = new BlastController();
