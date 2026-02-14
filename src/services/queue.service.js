const config = require('../config');
const { Contact, BlastCampaign, BlastLog, MessageTemplate, ContactGroup } = require('../models');
const { 
  checkWhatsAppRegistration, 
  sendMessage, 
  getWhatsAppStatus,
  getRandomConnectedSession,
  getConnectedSessionsCount,
  incrementMessageCounter,
  getDailyMessageCount
} = require('./whatsapp.service');
const { phoneToJid } = require('../utils/phone.util');
const { getBlastDelay, addMessageVariation, sleep } = require('../utils/delay.util');

let io = null;

// Simple in-memory queues (no Redis dependency)
let validationQueue;
let blastQueue;

// Track active campaigns
const activeCampaigns = new Map();

/**
 * Initialize queues
 */
const initQueues = (socketIo) => {
  io = socketIo;

  // Use simple in-memory queues (more reliable, no Redis dependency)
  validationQueue = createInMemoryQueue('validation', processValidation);
  blastQueue = createInMemoryQueue('blast', processBlast);

  console.log('✅ Queue system initialized (in-memory)');
};

/**
 * Create in-memory queue with better error handling
 */
const createInMemoryQueue = (name, processor) => {
  const queue = [];
  let processing = false;

  const process = async () => {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
      const job = queue.shift();
      try {
        // Get the ID from data
        const id = job.data.contactId || job.data.campaignId;
        console.log(`🔄 Processing ${name} job: ${id}`);
        
        const result = await processor(id);
        
        console.log(`✅ ${name} job completed: ${id}`);
        if (job.resolve) job.resolve(result);
        
        // Emit update for validation
        if (name === 'validation' && job.data.contactId) {
          emitValidationUpdate(job.data.contactId, result);
        }
      } catch (error) {
        console.error(`❌ Queue ${name} error:`, error.message);
        if (job.reject) job.reject(error);
        
        // For validation errors, emit failed status
        if (name === 'validation' && job.data.contactId) {
          emitValidationUpdate(job.data.contactId, { 
            success: false, 
            error: error.message 
          });
        }
      }
      
      // Small delay between jobs
      await sleep(500);
    }

    processing = false;
  };

  return {
    add: (data, options = {}) => {
      return new Promise((resolve, reject) => {
        queue.push({ data, resolve, reject });
        // Start processing after delay
        setTimeout(process, options.delay || 100);
      });
    },
    getJobCounts: async () => ({ waiting: queue.length }),
    pause: async () => {},
    resume: async () => {},
    clean: async () => { queue.length = 0; }
  };
};

/**
 * Process WhatsApp validation
 */
const processValidation = async (contactId) => {
  const contact = await Contact.findByPk(contactId);
  
  if (!contact) {
    return { success: false, error: 'Contact not found' };
  }

  const waStatus = getWhatsAppStatus();
  console.log(`📱 Validating contact ${contactId}, WA status: ${waStatus.status}`);
  
  // Only allow validation when fully connected (not syncing or connecting)
  if (waStatus.status !== 'connected') {
    // Return error instead of throwing
    const statusMsg = waStatus.status === 'syncing' 
      ? 'WhatsApp sedang sinkronisasi dengan HP, tunggu beberapa detik...'
      : 'WhatsApp not connected';
    console.log(`⚠️ Cannot validate - WhatsApp status: ${waStatus.status}`);
    return { 
      success: false, 
      error: statusMsg,
      contactId: contactId
    };
  }

  try {
    console.log(`📱 Checking WA registration for: ${contact.phone_normalized}`);
    const result = await checkWhatsAppRegistration(contact.phone_normalized);
    
    console.log(`📱 Registration result:`, result);
    
    await contact.update({
      wa_status: result.registered ? 'registered' : 'not_registered',
      wa_jid: result.jid,
      last_validated: new Date()
    });

    return {
      success: true,
      contactId: contactId,
      registered: result.registered,
      jid: result.jid
    };

  } catch (error) {
    console.error(`❌ Validation error for ${contact.phone_normalized}:`, error.message);
    
    // Mark as unknown on error
    await contact.update({
      wa_status: 'unknown',
      last_validated: new Date()
    });

    return { 
      success: false, 
      error: error.message,
      contactId: contactId
    };
  }
};

/**
 * Process blast campaign
 */
const processBlast = async (campaignId) => {
  const campaign = await BlastCampaign.findByPk(campaignId, {
    include: [
      { model: MessageTemplate, as: 'template' },
      { model: ContactGroup, as: 'group' }
    ]
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Mark as running
  await campaign.update({ 
    status: 'running',
    started_at: campaign.started_at || new Date()
  });

  // Track this campaign
  activeCampaigns.set(campaignId, { paused: false, stopped: false });

  // Get pending logs
  const pendingLogs = await BlastLog.findAll({
    where: {
      campaign_id: campaignId,
      status: 'pending'
    },
    order: [['id', 'ASC']]
  });

  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  // --- NEW LOGIC: Distribute messages and enforce per-session daily limit ---
  const WhatsAppSession = require('../models').WhatsAppSession;
  const totalLimit = config.whatsapp.maxMessagesPerDay;
  for (const log of pendingLogs) {
    // Always fetch connected sessions fresh each loop
    const connectedSessions = await WhatsAppSession.findAll({
      where: { status: 'connected', is_active: true }
    });
    const sessionCount = connectedSessions.length;
      if (sessionCount === 0) {
        await campaign.update({ status: 'paused', error_message: 'No WhatsApp sessions connected' });
        emitCampaignUpdate(campaign);
        break;
      }
    const perSessionLimit = Math.floor(totalLimit / sessionCount);
    // Check if campaign was stopped or paused
    const campaignState = activeCampaigns.get(campaignId);
    if (!campaignState || campaignState.stopped) {
      console.log(`Campaign ${campaignId} stopped`);
      break;
    }
    while (campaignState?.paused) {
      await sleep(5000);
      const updatedState = activeCampaigns.get(campaignId);
      if (!updatedState || updatedState.stopped) break;
    }

    // Refresh session counters
    for (const session of connectedSessions) {
      session.checkAndResetDailyCounter();
      await session.save();
    }

    // Filter sessions under their daily limit
    const eligibleSessions = connectedSessions.filter(s => s.messages_sent_today < perSessionLimit);
    if (eligibleSessions.length === 0) {
      await campaign.update({
        status: 'paused',
        error_message: `All sessions reached daily limit (${perSessionLimit} per session)`
      });
      emitCampaignUpdate(campaign);
      break;
    }

    // Get contact info
    const contact = await Contact.findByPk(log.contact_id, {
      include: [{ model: ContactGroup, as: 'group' }]
    });
    if (!contact || contact.wa_status !== 'registered') {
      await log.update({
        status: 'skipped',
        skip_reason: contact ? 'not_registered' : 'contact_deleted'
      });
      campaign.skipped_count++;
      await campaign.save();
      emitLogUpdate(log);
      continue;
    }

    try {
      // Prepare message with variables
      let message = campaign.template.content;
      message = message.replace(/\{\{nama\}\}/gi, contact.name || '');
      message = message.replace(/\{\{no_hp\}\}/gi, contact.phone || '');
      message = message.replace(/\{\{group\}\}/gi, contact.group?.name || '');
      message = addMessageVariation(message);
      const jid = contact.wa_jid || phoneToJid(contact.phone_normalized);

      // Random eligible session
      const randomIdx = Math.floor(Math.random() * eligibleSessions.length);
      const session = eligibleSessions[randomIdx];
      // Send message using specific session
      const { sendMessageWithSession } = require('./whatsapp.service');
      const result = await sendMessageWithSession(session.session_id, jid, message);

      // Update log with session info
      await log.update({
        status: 'sent',
        message_content: message,
        wa_message_id: result.messageId,
        sent_at: new Date(),
        sent_via: result.sessionId || 'unknown'
      });
      campaign.sent_count++;
      await campaign.save();
      if (campaign.template) {
        await campaign.template.increment('usage_count');
      }
      // Increment daily counter for the session
      session.messages_sent_today++;
      session.last_message_date = new Date().toISOString().split('T')[0];
      await session.save();
      consecutiveErrors = 0;
      emitLogUpdate(log);
      emitCampaignUpdate(campaign);
      console.log(`✅ [${result.sessionId}] Message sent to ${contact.phone_normalized}`);
    } catch (error) {
      console.error(`❌ Failed to send to ${contact.phone_normalized}:`, error.message);
      await log.update({
        status: 'failed',
        error_message: error.message
      });
      campaign.failed_count++;
      await campaign.save();
      consecutiveErrors++;
      emitLogUpdate(log);
      emitCampaignUpdate(campaign);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          await campaign.update({
            status: 'paused',
            error_message: `Paused due to ${consecutiveErrors} consecutive errors`
          });
          emitCampaignUpdate(campaign);
          break;
        }
    }
    const delay = getBlastDelay(campaign.interval_minutes);
    console.log(`⏳ Waiting ${Math.round(delay / 1000)}s before next message...`);
    await sleep(delay);
  }

  // Campaign completed
  const remainingPending = await BlastLog.count({
    where: { campaign_id: campaignId, status: 'pending' }
  });

  if (remainingPending === 0 && campaign.status === 'running') {
    await campaign.update({
      status: 'completed',
      completed_at: new Date()
    });
    emitCampaignUpdate(campaign);
    console.log(`🎉 Campaign ${campaignId} completed!`);
  }

  // Clean up tracking
  activeCampaigns.delete(campaignId);

  return {
    success: true,
    sent: campaign.sent_count,
    failed: campaign.failed_count,
    skipped: campaign.skipped_count
  };
};

/**
 * Add contact to validation queue
 */
const addToValidationQueue = (contactId) => {
  if (validationQueue) {
    validationQueue.add(
      { contactId },
      { delay: Math.random() * 2000 } // Random delay to avoid bulk checks
    );
    console.log(`📋 Contact ${contactId} queued for validation`);
  }
};

/**
 * Add campaign to blast queue
 */
const addToBlastQueue = (campaignId) => {
  if (blastQueue) {
    blastQueue.add({ campaignId });
    console.log(`📋 Campaign ${campaignId} queued for blast`);
  }
};

/**
 * Pause blast queue for a campaign
 */
const pauseBlastQueue = (campaignId) => {
  const state = activeCampaigns.get(campaignId);
  if (state) {
    state.paused = true;
    console.log(`⏸️ Campaign ${campaignId} paused`);
  }
};

/**
 * Resume blast queue for a campaign
 */
const resumeBlastQueue = (campaignId) => {
  const state = activeCampaigns.get(campaignId);
  if (state) {
    state.paused = false;
    console.log(`▶️ Campaign ${campaignId} resumed`);
  } else {
    // Re-add to queue if not active
    addToBlastQueue(campaignId);
  }
};

/**
 * Stop blast queue for a campaign
 */
const stopBlastQueue = (campaignId) => {
  const state = activeCampaigns.get(campaignId);
  if (state) {
    state.stopped = true;
    console.log(`⏹️ Campaign ${campaignId} stopped`);
  }
};

/**
 * Emit validation update to clients
 */
const emitValidationUpdate = (contactId, result) => {
  if (io) {
    io.emit('contact:validated', { contactId, ...result });
  }
};

/**
 * Emit blast log update to clients
 */
const emitLogUpdate = (log) => {
  if (io) {
    io.emit('blast:log', log.toJSON());
  }
};

/**
 * Emit campaign update to clients
 */
const emitCampaignUpdate = (campaign) => {
  if (io) {
    io.emit('blast:campaign', campaign.toJSON());
  }
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  try {
    const validationCounts = validationQueue ? await validationQueue.getJobCounts() : {};
    const blastCounts = blastQueue ? await blastQueue.getJobCounts() : {};

    return {
      validation: validationCounts,
      blast: blastCounts,
      activeCampaigns: activeCampaigns.size
    };
  } catch (error) {
    return { error: error.message };
  }
};

module.exports = {
  initQueues,
  addToValidationQueue,
  addToBlastQueue,
  pauseBlastQueue,
  resumeBlastQueue,
  stopBlastQueue,
  getQueueStats
};
