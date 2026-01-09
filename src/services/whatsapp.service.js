/**
 * WhatsApp Service - Baileys v7 Integration
 * FIXED: Proper singleton pattern, no auto-reconnect on conflict
 */

const { 
  makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const config = require('../config');
const { WhatsAppSession } = require('../models');
const { phoneToJid } = require('../utils/phone.util');

// ===== SINGLETON STATE =====
let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';
let connectionInfo = null;
let io = null;
let isConnecting = false;  // Flag to prevent multiple connect calls
let saveCreds = null;

// Logger
const logger = pino({ level: 'silent' });

// Session path
const SESSION_PATH = path.resolve(config.whatsapp.sessionPath);

// ===== UTILITY FUNCTIONS =====

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const hasSessionFiles = () => {
  const credsPath = path.join(SESSION_PATH, 'creds.json');
  return fs.existsSync(credsPath);
};

/**
 * Cleanup socket safely - ONLY removes listeners and nullifies
 */
const cleanupSocket = () => {
  if (sock) {
    console.log('📱 Cleaning up socket...');
    try {
      sock.ev.removeAllListeners();
      sock.end();
    } catch (e) {
      // Ignore
    }
    sock = null;
  }
};

const emitStatus = () => {
  if (io) {
    io.emit('whatsapp:status', {
      status: connectionStatus,
      qr: qrCode,
      ...connectionInfo
    });
  }
};

const updateSessionStatus = async (status, info = null) => {
  try {
    let session = await WhatsAppSession.findOne({ where: { session_id: 'default' } });
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
    console.error('Failed to update session status:', error.message);
  }
};

/**
 * Clear session files - ONLY called on explicit logout or when user requests
 */
const clearSession = () => {
  try {
    console.log('📱 Clearing session files...');
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_PATH, { recursive: true });
  } catch (error) {
    console.error('Failed to clear session:', error.message);
  }
};

// ===== MAIN FUNCTIONS =====

/**
 * Initialize WhatsApp connection - SINGLETON
 * Will return existing socket if already connected/connecting
 */
const initWhatsApp = async (socketIo, forceNew = false) => {
  io = socketIo;

  // ===== SINGLETON CHECK =====
  // If already connected, just return
  if (sock && connectionStatus === 'connected') {
    console.log('📱 Already connected, returning existing socket');
    emitStatus();
    return sock;
  }

  // If currently connecting, don't create new socket
  if (isConnecting) {
    console.log('📱 Already connecting, please wait...');
    emitStatus();
    return null;
  }

  // If forceNew, cleanup first
  if (forceNew) {
    cleanupSocket();
  }

  // If socket exists but not connected, check if we should reuse
  if (sock && !forceNew) {
    console.log('📱 Socket exists, checking status...');
    emitStatus();
    return sock;
  }

  // ===== START CONNECTING =====
  isConnecting = true;
  console.log('📱 Starting WhatsApp connection...');

  try {
    // Ensure session directory exists
    if (!fs.existsSync(SESSION_PATH)) {
      fs.mkdirSync(SESSION_PATH, { recursive: true });
    }

    // Get WA version
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 Using WA version: ${version.join('.')}`);

    // Load auth state
    const authState = await useMultiFileAuthState(SESSION_PATH);
    saveCreds = authState.saveCreds;
    
    console.log('📱 Auth state loaded, has existing session:', !!authState.state.creds?.me);

    // Create socket
    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: true,
      browser: Browsers.windows('Chrome'),
      auth: {
        creds: authState.state.creds,
        keys: makeCacheableSignalKeyStore(authState.state.keys, logger)
      },
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      qrTimeout: 40000,
      getMessage: async () => ({ conversation: '' })
    });

    // ===== CREDENTIAL UPDATE HANDLER =====
    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        console.log('📱 Credentials saved');
      } catch (err) {
        console.error('📱 Failed to save credentials:', err.message);
      }
    });

    // ===== CONNECTION UPDATE HANDLER =====
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      // ----- QR CODE -----
      if (qr) {
        console.log('📱 QR Code generated');
        connectionStatus = 'qr_ready';
        try {
          qrCode = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        } catch (e) {
          console.error('QR conversion error:', e.message);
        }
        emitStatus();
        await updateSessionStatus('qr_ready');
      }

      // ----- CONNECTING -----
      if (connection === 'connecting') {
        console.log('📱 Connecting...');
        connectionStatus = 'connecting';
        emitStatus();
        await updateSessionStatus('connecting');
      }

      // ----- CONNECTED -----
      if (connection === 'open') {
        console.log('📱 Connection opened!');
        isConnecting = false;
        
        const user = sock?.user;
        if (user?.id) {
          connectionInfo = {
            phone: user.id.split(':')[0] || user.id.split('@')[0],
            name: user.name || 'Unknown'
          };
          console.log(`📱 ✅ Connected as: ${connectionInfo.name} (+${connectionInfo.phone})`);
        }
        
        connectionStatus = 'connected';
        qrCode = null;
        emitStatus();
        await updateSessionStatus('connected', connectionInfo);
      }

      // ----- DISCONNECTED -----
      if (connection === 'close') {
        const reason = DisconnectReason[statusCode] || statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        
        console.log(`📱 Disconnected - reason: ${reason} (${statusCode})`);
        if (errorMsg) console.log(`📱 Error: ${errorMsg}`);

        isConnecting = false;
        connectionStatus = 'disconnected';
        qrCode = null;
        
        emitStatus();

        // ===== CHECK FOR CONFLICT FIRST (before switch) =====
        // This is important because 401 = DisconnectReason.loggedOut
        // but we need to handle conflict differently
        const isConflict = errorMsg.toLowerCase().includes('conflict') || 
                          errorMsg.toLowerCase().includes('replaced') ||
                          statusCode === 440;
        
        if (isConflict) {
          console.log('📱 ⚠️ CONFLICT/REPLACED detected!');
          console.log('📱 Error message:', errorMsg);
          console.log('📱 ====================================');
          console.log('📱 JANGAN CLEAR SESSION - ini bukan logout!');
          console.log('📱 Kemungkinan penyebab:');
          console.log('📱 1. Ada WhatsApp Web lain yang aktif');
          console.log('📱 2. Baileys membuat socket duplikat');
          console.log('📱 ====================================');
          
          // DO NOT clear session
          sock = null;
          await updateSessionStatus('disconnected');
          
          if (io) {
            io.emit('wa-error', {
              type: 'conflict',
              message: 'Conflict detected! Pastikan tidak ada WhatsApp Web lain yang aktif. Tunggu 2 menit, lalu coba lagi.'
            });
          }
          return; // EXIT - don't process switch
        }

        // Handle other disconnect reasons
        switch (statusCode) {
          case DisconnectReason.loggedOut:
          case 401:
            // Real logout (no conflict) - clear session
            console.log('📱 User logged out - clearing session');
            clearSession();
            connectionInfo = null;
            sock = null;
            await updateSessionStatus('disconnected');
            break;

          case DisconnectReason.restartRequired:
          case 515:
            // Restart required after QR scan - NORMAL
            console.log('📱 Restart required (normal after QR scan)');
            cleanupSocket();
            
            // Wait for creds to save
            await delay(2000);
            
            // Auto reconnect with saved session
            if (hasSessionFiles()) {
              console.log('📱 Reconnecting with saved session...');
              isConnecting = false; // Reset flag
              await initWhatsApp(io, true);
            }
            break;

          default:
            // Other errors - just cleanup, don't auto-reconnect
            console.log('📱 Connection lost. Click "Scan QR" to reconnect.');
            sock = null;
            await updateSessionStatus('disconnected');
        }
      }
    });

    // Ignore history sync
    sock.ev.on('messaging-history.set', () => {
      console.log('📱 History sync received (ignored)');
    });

    return sock;

  } catch (error) {
    console.error('❌ WhatsApp init error:', error);
    isConnecting = false;
    connectionStatus = 'disconnected';
    cleanupSocket();
    emitStatus();
    throw error;
  }
};

/**
 * Get current status - READ ONLY, does not create socket
 */
const getWhatsAppStatus = () => ({
  status: connectionStatus,
  qr: qrCode,
  phone: connectionInfo?.phone,
  name: connectionInfo?.name,
  isConnecting
});

/**
 * Disconnect and clear session - explicit user action
 */
const disconnectWhatsApp = async () => {
  console.log('📱 Disconnecting...');
  isConnecting = false;
  
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      console.log('📱 Logout warning:', e.message);
    }
  }
  
  connectionStatus = 'disconnected';
  qrCode = null;
  connectionInfo = null;
  clearSession();
  cleanupSocket();
  await updateSessionStatus('disconnected');
  emitStatus();
};

/**
 * Refresh/reconnect - user triggered
 */
const refreshSession = async (socketIo) => {
  console.log('📱 Refreshing session...');
  isConnecting = false;
  cleanupSocket();
  // Don't clear session - try to reconnect with existing
  await initWhatsApp(socketIo, true);
};

/**
 * Check if phone is registered on WhatsApp
 */
const checkWhatsAppRegistration = async (phone) => {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error(`WhatsApp not connected (status: ${connectionStatus})`);
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
    console.error(`Send error to ${jid}:`, error.message);
    throw error;
  }
};

const getSocket = () => sock;

const incrementMessageCounter = async () => {
  try {
    let session = await WhatsAppSession.findOne({ where: { session_id: 'default' } });
    if (session) {
      session.checkAndResetDailyCounter();
      session.messages_sent_today++;
      await session.save();
      return session.messages_sent_today;
    }
    return 0;
  } catch (error) {
    console.error('Failed to increment counter:', error);
    return 0;
  }
};

const getDailyMessageCount = async () => {
  try {
    let session = await WhatsAppSession.findOne({ where: { session_id: 'default' } });
    if (session) {
      session.checkAndResetDailyCounter();
      await session.save();
      return session.messages_sent_today;
    }
    return 0;
  } catch (error) {
    console.error('Failed to get counter:', error);
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
