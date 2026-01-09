const { 
  makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidUser
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const config = require('../config');
const { WhatsAppSession } = require('../models');
const { phoneToJid } = require('../utils/phone.util');

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let connectionInfo = null;
let io = null;

// Logger
const logger = pino({ level: 'silent' });

// Session path
const SESSION_PATH = path.resolve(config.whatsapp.sessionPath);

/**
 * Initialize WhatsApp connection
 */
const initWhatsApp = async (socketIo) => {
  io = socketIo;

  try {
    // Ensure session directory exists
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true });
    }

    // Get latest version
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 Using WA version: ${version.join('.')}`);

    // Load auth state
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

    // Create socket
    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: true
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code generated
      if (qr) {
        console.log('📱 QR Code generated');
        connectionStatus = 'qr_ready';
        
        // Convert QR to data URL
        qrCode = await qrcode.toDataURL(qr);
        
        // Emit to frontend
        emitStatus();
        
        // Update database
        await updateSessionStatus('qr_ready');
      }

      // Connection state changed
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = DisconnectReason[statusCode] || 'unknown';
        
        console.log(`📱 Connection closed. Reason: ${reason} (${statusCode})`);
        
        connectionStatus = 'disconnected';
        qrCode = null;
        connectionInfo = null;
        emitStatus();

        // Handle different disconnect reasons
        if (statusCode === DisconnectReason.loggedOut) {
          // Session logged out, clear session
          console.log('📱 Logged out, clearing session...');
          clearSession();
          await updateSessionStatus('disconnected');
        } else if (statusCode !== DisconnectReason.connectionClosed) {
          // Auto reconnect for other reasons
          console.log('📱 Attempting to reconnect...');
          setTimeout(() => {
            initWhatsApp(io);
          }, 5000);
        }
      }

      if (connection === 'connecting') {
        console.log('📱 Connecting...');
        connectionStatus = 'connecting';
        emitStatus();
        await updateSessionStatus('connecting');
      }

      if (connection === 'open') {
        console.log('📱 Connected!');
        connectionStatus = 'connected';
        qrCode = null;
        
        // Get connection info
        const user = sock.user;
        connectionInfo = {
          phone: user?.id?.split(':')[0] || user?.id?.split('@')[0],
          name: user?.name || 'Unknown'
        };
        
        emitStatus();
        
        // Update database
        await updateSessionStatus('connected', connectionInfo);
      }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle messages (optional, for logging)
    sock.ev.on('messages.upsert', async ({ messages }) => {
      // Log incoming messages if needed
    });

  } catch (error) {
    console.error('❌ WhatsApp init error:', error);
    connectionStatus = 'disconnected';
    emitStatus();
    throw error;
  }
};

/**
 * Emit current status to all connected clients
 */
const emitStatus = () => {
  if (io) {
    io.emit('whatsapp:status', {
      status: connectionStatus,
      qr: qrCode,
      ...connectionInfo
    });
  }
};

/**
 * Update session status in database
 */
const updateSessionStatus = async (status, info = null) => {
  try {
    let session = await WhatsAppSession.findOne({ 
      where: { session_id: 'default' } 
    });

    if (!session) {
      session = await WhatsAppSession.create({ session_id: 'default' });
    }

    const updateData = { status };
    
    if (status === 'connected' && info) {
      updateData.phone_number = info.phone;
      updateData.name = info.name;
      updateData.last_connected = new Date();
    }

    await session.update(updateData);
  } catch (error) {
    console.error('Failed to update session status:', error);
  }
};

/**
 * Clear session files
 */
const clearSession = () => {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      fs.mkdirSync(SESSION_PATH, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
};

/**
 * Get current WhatsApp status
 */
const getWhatsAppStatus = () => {
  return {
    status: connectionStatus,
    qr: qrCode,
    phone: connectionInfo?.phone,
    name: connectionInfo?.name
  };
};

/**
 * Disconnect WhatsApp
 */
const disconnectWhatsApp = async () => {
  try {
    if (sock) {
      await sock.logout();
    }
    connectionStatus = 'disconnected';
    qrCode = null;
    connectionInfo = null;
    clearSession();
    await updateSessionStatus('disconnected');
    emitStatus();
  } catch (error) {
    console.error('Disconnect error:', error);
    // Force cleanup
    sock = null;
    connectionStatus = 'disconnected';
    clearSession();
    emitStatus();
  }
};

/**
 * Refresh session (reconnect)
 */
const refreshSession = async (socketIo) => {
  if (sock) {
    try {
      sock.end();
    } catch (e) {}
    sock = null;
  }
  await initWhatsApp(socketIo);
};

/**
 * Check if phone number is registered on WhatsApp
 * @param {string} phone - Normalized phone number (628xxx)
 * @returns {Object} - { registered: boolean, jid: string|null }
 */
const checkWhatsAppRegistration = async (phone) => {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp is not connected');
  }

  try {
    const jid = phoneToJid(phone);
    const [result] = await sock.onWhatsApp(jid);
    
    return {
      registered: result?.exists || false,
      jid: result?.jid || null
    };
  } catch (error) {
    console.error(`WA check error for ${phone}:`, error.message);
    throw error;
  }
};

/**
 * Send text message
 * @param {string} jid - WhatsApp JID
 * @param {string} message - Message text
 * @returns {Object} - Message key/ID
 */
const sendMessage = async (jid, message) => {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp is not connected');
  }

  try {
    const result = await sock.sendMessage(jid, { text: message });
    return {
      success: true,
      messageId: result?.key?.id
    };
  } catch (error) {
    console.error(`Send message error to ${jid}:`, error.message);
    throw error;
  }
};

/**
 * Get socket instance
 */
const getSocket = () => sock;

/**
 * Increment daily message counter
 */
const incrementMessageCounter = async () => {
  try {
    let session = await WhatsAppSession.findOne({ 
      where: { session_id: 'default' } 
    });

    if (session) {
      session.checkAndResetDailyCounter();
      session.messages_sent_today++;
      await session.save();
      return session.messages_sent_today;
    }
    return 0;
  } catch (error) {
    console.error('Failed to increment message counter:', error);
    return 0;
  }
};

/**
 * Get daily message count
 */
const getDailyMessageCount = async () => {
  try {
    let session = await WhatsAppSession.findOne({ 
      where: { session_id: 'default' } 
    });

    if (session) {
      session.checkAndResetDailyCounter();
      await session.save();
      return session.messages_sent_today;
    }
    return 0;
  } catch (error) {
    console.error('Failed to get message count:', error);
    return 0;
  }
};

module.exports = {
  initWhatsApp,
  getWhatsAppStatus,
  disconnectWhatsApp,
  refreshSession,
  checkWhatsAppRegistration,
  sendMessage,
  getSocket,
  incrementMessageCounter,
  getDailyMessageCount
};
