const config = require('../config');
const { Contact, BlastCampaign, BlastLog, MessageTemplate, ContactGroup } = require('../models');
const { 
  checkWhatsAppRegistration, 
  sendMessage, 
  getWhatsAppStatus,
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

  for (const log of pendingLogs) {
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

    // Check WhatsApp connection
    const waStatus = getWhatsAppStatus();
    if (waStatus.status !== 'connected') {
      console.log('WhatsApp disconnected, pausing campaign...');
      await campaign.update({ status: 'paused', error_message: 'WhatsApp disconnected' });
      emitCampaignUpdate(campaign);
      break;
    }

    // Check daily limit
    const dailyCount = await getDailyMessageCount();
    if (dailyCount >= config.whatsapp.maxMessagesPerDay) {
      console.log('Daily message limit reached, stopping campaign...');
      await campaign.update({ 
        status: 'paused', 
        error_message: `Daily limit reached (${config.whatsapp.maxMessagesPerDay} messages)` 
      });
      emitCampaignUpdate(campaign);
      break;
    }

    // Get contact info
    const contact = await Contact.findByPk(log.contact_id, {
      include: [{ model: ContactGroup, as: 'group' }]
    });

    if (!contact || contact.wa_status !== 'registered') {
      // Skip unregistered contacts
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
      
      // Add slight variation for anti-ban
      message = addMessageVariation(message);

      // Get JID
      const jid = contact.wa_jid || phoneToJid(contact.phone_normalized);

      // Send message
      const result = await sendMessage(jid, message);

      // Update log
      await log.update({
        status: 'sent',
        message_content: message,
        wa_message_id: result.messageId,
        sent_at: new Date()
      });

      // Update campaign counters
      campaign.sent_count++;
      await campaign.save();

      // Increment daily counter
      await incrementMessageCounter();

      // Reset error counter
      consecutiveErrors = 0;

      // Emit updates
      emitLogUpdate(log);
      emitCampaignUpdate(campaign);

      console.log(`✅ Message sent to ${contact.phone_normalized}`);

    } catch (error) {
      console.error(`❌ Failed to send to ${contact.phone_normalized}:`, error.message);

      // Update log
      await log.update({
        status: 'failed',
        error_message: error.message
      });

      campaign.failed_count++;
      await campaign.save();

      consecutiveErrors++;

      emitLogUpdate(log);
      emitCampaignUpdate(campaign);

      // Stop if too many consecutive errors (anti-ban)
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`Too many consecutive errors (${consecutiveErrors}), stopping campaign...`);
        await campaign.update({ 
          status: 'stopped', 
          error_message: `Stopped due to ${consecutiveErrors} consecutive errors`,
          completed_at: new Date()
        });
        emitCampaignUpdate(campaign);
        break;
      }
    }

    // Delay before next message
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
