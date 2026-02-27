/**
 * WhatsApp Service - Multi-Session Support (Max 5 accounts)
 * Supports multiple WhatsApp sessions with random selection for sending
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

// ===== MULTI-SESSION STATE =====
const MAX_SESSIONS = 5;
const sessions = new Map(); // sessionId -> { sock, qrCode, status, info, isConnecting }
const reconnectTimeouts = new Map(); // sessionId -> timeout handle (untuk cancel)
let io = null;

// Auto-reconnect: delay bertahap (max 2 menit) agar tidak spam reconnect
const RECONNECT_DELAYS = [5000, 15000, 30000, 60000, 120000];

// Logger
const logger = pino({ level: 'silent' });

// Base session path
const BASE_SESSION_PATH = path.resolve(config.whatsapp.sessionPath);

// ===== UTILITY FUNCTIONS =====
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getSessionPath = (sessionId) => {
  return path.join(BASE_SESSION_PATH, sessionId);
};

const hasSessionFiles = (sessionId) => {
  const credsPath = path.join(getSessionPath(sessionId), 'creds.json');
  return fs.existsSync(credsPath);
};

const getSessionState = (sessionId) => {
  return sessions.get(sessionId) || {
    sock: null,
    qrCode: null,
    status: 'disconnected',
    info: null,
    isConnecting: false
  };
};

const setSessionState = (sessionId, state) => {
  const current = getSessionState(sessionId);
  sessions.set(sessionId, { ...current, ...state });
};

/**
 * Cleanup socket safely
 */
const cleanupSocket = (sessionId) => {
  const session = sessions.get(sessionId);
  if (session?.sock) {
    console.log(`📱 [${sessionId}] Cleaning up socket...`);
    try {
      session.sock.ev.removeAllListeners();
      session.sock.end();
    } catch (e) {
      // Ignore
    }
    setSessionState(sessionId, { sock: null });
  }
};

/**
 * Emit status to frontend
 */
const emitStatus = (sessionId = null) => {
  if (!io) return;
  
  if (sessionId) {
    const state = getSessionState(sessionId);
    io.emit('whatsapp:status', {
      sessionId,
      status: state.status,
      qr: state.qrCode,
      phone: state.info?.phone,
      name: state.info?.name,
      isConnecting: state.isConnecting
    });
  }
  
  // Always emit all sessions status
  io.emit('whatsapp:all-sessions', getAllSessionsStatus());
};

/**
 * Update session status in database
 */
const updateSessionStatus = async (sessionId, status, info = null) => {
  try {
    let session = await WhatsAppSession.findOne({ where: { session_id: sessionId } });
    if (!session) {
      session = await WhatsAppSession.create({ 
        session_id: sessionId,
        label: `WhatsApp ${sessionId.replace('wa_', '')}`
      });
    }
    
    const updateData = { status };
    if (status === 'connected' && info) {
      updateData.phone_number = info.phone;
      updateData.name = info.name;
      updateData.last_connected = new Date();
    }
    await session.update(updateData);
  } catch (error) {
    console.error(`[${sessionId}] Failed to update session status:`, error.message);
  }
};

/**
 * Clear session files
 */
const clearSession = (sessionId) => {
  try {
    const sessionPath = getSessionPath(sessionId);
    console.log(`📱 [${sessionId}] Clearing session files...`);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`[${sessionId}] Failed to clear session:`, error.message);
  }
};

/**
 * Jadwalkan auto-reconnect (untuk connection lost / timeout, bukan logout/conflict)
 */
const scheduleReconnect = (sessionId, attemptIndex = 0) => {
  if (reconnectTimeouts.has(sessionId)) {
    clearTimeout(reconnectTimeouts.get(sessionId));
    reconnectTimeouts.delete(sessionId);
  }
  if (!hasSessionFiles(sessionId)) return;
  const delayMs = RECONNECT_DELAYS[Math.min(attemptIndex, RECONNECT_DELAYS.length - 1)];
  console.log(`📱 [${sessionId}] Auto-reconnect in ${delayMs / 1000}s (attempt ${attemptIndex + 1})...`);
  const timeoutId = setTimeout(async () => {
    reconnectTimeouts.delete(sessionId);
    const state = getSessionState(sessionId);
    if (state.status === 'connected' || state.isConnecting) return;
    try {
      await initSession(sessionId, io, true);
    } catch (e) {
      console.error(`📱 [${sessionId}] Reconnect failed:`, e.message);
      scheduleReconnect(sessionId, attemptIndex + 1);
    }
  }, delayMs);
  reconnectTimeouts.set(sessionId, timeoutId);
};

/**
 * Batalkan jadwal reconnect (misal user logout manual)
 */
const cancelReconnect = (sessionId) => {
  if (reconnectTimeouts.has(sessionId)) {
    clearTimeout(reconnectTimeouts.get(sessionId));
    reconnectTimeouts.delete(sessionId);
  }
};

// ===== MAIN FUNCTIONS =====

/**
 * Initialize a WhatsApp session
 */
const initSession = async (sessionId, socketIo, forceNew = false) => {
  io = socketIo;
  
  const state = getSessionState(sessionId);
  
  // If already connected, return existing socket
  if (state.sock && state.status === 'connected') {
    console.log(`📱 [${sessionId}] Already connected`);
    emitStatus(sessionId);
    return state.sock;
  }
  
  // If currently connecting, wait
  if (state.isConnecting) {
    console.log(`📱 [${sessionId}] Already connecting, please wait...`);
    emitStatus(sessionId);
    return null;
  }
  
  // If forceNew, cleanup first
  if (forceNew) {
    cleanupSocket(sessionId);
  }
  
  // Start connecting
  setSessionState(sessionId, { isConnecting: true, status: 'connecting' });
  console.log(`📱 [${sessionId}] Starting connection...`);
  emitStatus(sessionId);
  
  try {
    const sessionPath = getSessionPath(sessionId);
    
    // Ensure session directory exists
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // Get WA version
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 [${sessionId}] Using WA version: ${version.join('.')}`);
    
    // Load auth state
    const authState = await useMultiFileAuthState(sessionPath);
    
    console.log(`📱 [${sessionId}] Has existing session:`, !!authState.state.creds?.me);
    
    // Create socket
    const sock = makeWASocket({
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
    
    setSessionState(sessionId, { sock });
    
    // Credential update handler
    sock.ev.on('creds.update', async () => {
      try {
        await authState.saveCreds();
        console.log(`📱 [${sessionId}] Credentials saved`);
      } catch (err) {
        console.error(`📱 [${sessionId}] Failed to save credentials:`, err.message);
      }
    });
    
    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      
      // QR Code
      if (qr) {
        console.log(`📱 [${sessionId}] QR Code generated`);
        try {
          const qrDataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
          setSessionState(sessionId, { qrCode: qrDataUrl, status: 'qr_ready' });
        } catch (e) {
          console.error(`[${sessionId}] QR conversion error:`, e.message);
        }
        emitStatus(sessionId);
        await updateSessionStatus(sessionId, 'qr_ready');
      }
      
      // Connecting
      if (connection === 'connecting') {
        console.log(`📱 [${sessionId}] Connecting...`);
        setSessionState(sessionId, { status: 'connecting' });
        emitStatus(sessionId);
        await updateSessionStatus(sessionId, 'connecting');
      }
      
      // Connected
      if (connection === 'open') {
        console.log(`📱 [${sessionId}] Connection opened!`);
        setSessionState(sessionId, { isConnecting: false });
        
        const user = sock?.user;
        let info = null;
        if (user?.id) {
          info = {
            phone: user.id.split(':')[0] || user.id.split('@')[0],
            name: user.name || 'Unknown'
          };
          console.log(`📱 [${sessionId}] ✅ Connected as: ${info.name} (+${info.phone})`);
        }
        
        setSessionState(sessionId, { 
          status: 'connected', 
          qrCode: null, 
          info 
        });
        emitStatus(sessionId);
        await updateSessionStatus(sessionId, 'connected', info);
      }
      
      // Disconnected
      if (connection === 'close') {
        const reason = DisconnectReason[statusCode] || statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        
        console.log(`📱 [${sessionId}] Disconnected - reason: ${reason} (${statusCode})`);
        
        setSessionState(sessionId, { 
          isConnecting: false, 
          status: 'disconnected', 
          qrCode: null 
        });
        emitStatus(sessionId);
        
        // Check for conflict
        const isConflict = errorMsg.toLowerCase().includes('conflict') || 
                          errorMsg.toLowerCase().includes('replaced') ||
                          statusCode === 440;
        
        if (isConflict) {
          console.log(`📱 [${sessionId}] ⚠️ CONFLICT detected!`);
          setSessionState(sessionId, { sock: null });
          await updateSessionStatus(sessionId, 'disconnected');
          
          if (io) {
            io.emit('wa-error', {
              sessionId,
              type: 'conflict',
              message: `[${sessionId}] Conflict detected! Pastikan tidak ada WhatsApp Web lain yang aktif.`
            });
          }
          return;
        }
        
        // Handle disconnect reasons
        switch (statusCode) {
          case DisconnectReason.loggedOut:
          case 401:
            console.log(`📱 [${sessionId}] User logged out - clearing session`);
            clearSession(sessionId);
            setSessionState(sessionId, { info: null, sock: null });
            await updateSessionStatus(sessionId, 'disconnected');
            break;
            
          case DisconnectReason.restartRequired:
          case 515:
            console.log(`📱 [${sessionId}] Restart required (normal after QR scan)`);
            cleanupSocket(sessionId);
            await delay(2000);
            if (hasSessionFiles(sessionId)) {
              console.log(`📱 [${sessionId}] Reconnecting with saved session...`);
              setSessionState(sessionId, { isConnecting: false });
              await initSession(sessionId, io, true);
            }
            break;

          case 408:  // connectionLost / timedOut
          case 428:  // connectionClosed
          case 503:  // unavailableService
            // Koneksi putus (timeout / network / server) — coba reconnect otomatis
            console.log(`📱 [${sessionId}] Connection lost (${reason}), will auto-reconnect...`);
            setSessionState(sessionId, { sock: null });
            await updateSessionStatus(sessionId, 'disconnected');
            scheduleReconnect(sessionId, 0);
            break;
            
          default:
            // Unknown/other disconnect — tetap coba reconnect jika punya creds (kurangi "logout sendiri")
            console.log(`📱 [${sessionId}] Disconnected (${reason}). Will try auto-reconnect if session exists.`);
            setSessionState(sessionId, { sock: null });
            await updateSessionStatus(sessionId, 'disconnected');
            if (hasSessionFiles(sessionId)) {
              scheduleReconnect(sessionId, 0);
            }
        }
      }
    });
    
    // Ignore history sync
    sock.ev.on('messaging-history.set', () => {
      console.log(`📱 [${sessionId}] History sync received (ignored)`);
    });
    
    return sock;
    
  } catch (error) {
    console.error(`❌ [${sessionId}] Init error:`, error);
    setSessionState(sessionId, { 
      isConnecting: false, 
      status: 'disconnected' 
    });
    cleanupSocket(sessionId);
    emitStatus(sessionId);
    throw error;
  }
};

/**
 * Get all sessions status
 */
const getAllSessionsStatus = () => {
  const result = [];
  
  for (let i = 1; i <= MAX_SESSIONS; i++) {
    const sessionId = `wa_${i}`;
    const state = getSessionState(sessionId);
    result.push({
      sessionId,
      status: state.status,
      qr: state.qrCode,
      phone: state.info?.phone,
      name: state.info?.name,
      isConnecting: state.isConnecting
    });
  }
  
  return result;
};

/**
 * Get status of a specific session
 */
const getSessionStatus = (sessionId) => {
  const state = getSessionState(sessionId);
  return {
    sessionId,
    status: state.status,
    qr: state.qrCode,
    phone: state.info?.phone,
    name: state.info?.name,
    isConnecting: state.isConnecting
  };
};

/**
 * Get any connected session status (for backward compatibility)
 */
const getWhatsAppStatus = () => {
  // Find any connected session
  for (const [sessionId, state] of sessions) {
    if (state.status === 'connected') {
      return {
        status: 'connected',
        qr: null,
        phone: state.info?.phone,
        name: state.info?.name,
        sessionId
      };
    }
  }
  
  // No connected session
  return {
    status: 'disconnected',
    qr: null,
    phone: null,
    name: null,
    sessionId: null
  };
};

/**
 * Get random connected session for sending
 */
const getRandomConnectedSession = () => {
  const connected = [];
  
  for (const [sessionId, state] of sessions) {
    if (state.status === 'connected' && state.sock) {
      connected.push({ sessionId, ...state });
    }
  }
  
  if (connected.length === 0) return null;
  
  const randomIndex = Math.floor(Math.random() * connected.length);
  return connected[randomIndex];
};

/**
 * Disconnect a session
 */
const disconnectSession = async (sessionId) => {
  console.log(`📱 [${sessionId}] Disconnecting...`);
  cancelReconnect(sessionId);
  const state = getSessionState(sessionId);
  setSessionState(sessionId, { isConnecting: false });
  
  if (state.sock) {
    try {
      await state.sock.logout();
    } catch (e) {
      console.log(`📱 [${sessionId}] Logout warning:`, e.message);
    }
  }
  
  setSessionState(sessionId, { 
    status: 'disconnected', 
    qrCode: null, 
    info: null 
  });
  clearSession(sessionId);
  cleanupSocket(sessionId);
  await updateSessionStatus(sessionId, 'disconnected');
  emitStatus(sessionId);
};

/**
 * Refresh/reconnect a session
 */
const refreshSession = async (sessionId, socketIo) => {
  console.log(`📱 [${sessionId}] Refreshing session...`);
  setSessionState(sessionId, { isConnecting: false });
  cleanupSocket(sessionId);
  await initSession(sessionId, socketIo, true);
};

/**
 * Check if phone is registered on WhatsApp (using random connected session)
 */
const checkWhatsAppRegistration = async (phone) => {
  const session = getRandomConnectedSession();
  
  if (!session) {
    throw new Error('No WhatsApp session connected');
  }
  
  try {
    const jid = phoneToJid(phone);
    const [result] = await session.sock.onWhatsApp(jid);
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
 * Send text message using random connected session
 */
const sendMessage = async (jid, message) => {
  const session = getRandomConnectedSession();
  
  if (!session) {
    throw new Error('No WhatsApp session connected');
  }
  
  try {
    console.log(`📤 [${session.sessionId}] Sending to ${jid}`);
    const result = await session.sock.sendMessage(jid, { text: message });
    return {
      success: true,
      messageId: result?.key?.id,
      sessionId: session.sessionId
    };
  } catch (error) {
    console.error(`Send error to ${jid}:`, error.message);
    throw error;
  }
};

/**
 * Send message using specific session
 */
const sendMessageWithSession = async (sessionId, jid, message) => {
  const state = getSessionState(sessionId);
  
  if (state.status !== 'connected' || !state.sock) {
    throw new Error(`Session ${sessionId} is not connected`);
  }
  
  try {
    console.log(`📤 [${sessionId}] Sending to ${jid}`);
    const result = await state.sock.sendMessage(jid, { text: message });
    return {
      success: true,
      messageId: result?.key?.id,
      sessionId
    };
  } catch (error) {
    console.error(`[${sessionId}] Send error to ${jid}:`, error.message);
    throw error;
  }
};

/**
 * Increment message counter for a session
 */
const incrementMessageCounter = async (sessionId = null) => {
  try {
    // If no sessionId provided, use first connected session
    if (!sessionId) {
      const session = getRandomConnectedSession();
      sessionId = session?.sessionId || 'wa_1';
    }
    
    let session = await WhatsAppSession.findOne({ where: { session_id: sessionId } });
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

/**
 * Get total daily message count across all sessions
 */
const getDailyMessageCount = async () => {
  try {
    const allSessions = await WhatsAppSession.findAll();
    let total = 0;
    
    for (const session of allSessions) {
      session.checkAndResetDailyCounter();
      await session.save();
      total += session.messages_sent_today;
    }
    
    return total;
  } catch (error) {
    console.error('Failed to get counter:', error);
    return 0;
  }
};

/**
 * Initialize all sessions from database on server start
 */
const initAllSessions = async (socketIo) => {
  io = socketIo;
  
  console.log('📱 Initializing all WhatsApp sessions...');
  
  try {
    // Get all sessions from database
    const dbSessions = await WhatsAppSession.findAll({
      where: { is_active: true }
    });
    
    for (const dbSession of dbSessions) {
      const sessionId = dbSession.session_id;
      
      // Check if session files exist
      if (hasSessionFiles(sessionId)) {
        console.log(`📱 [${sessionId}] Found existing session, reconnecting...`);
        try {
          await initSession(sessionId, socketIo, false);
        } catch (e) {
          console.error(`📱 [${sessionId}] Failed to reconnect:`, e.message);
        }
      }
    }
    
    console.log('📱 All sessions initialization complete');
  } catch (error) {
    console.error('Failed to init all sessions:', error);
  }
};

/**
 * Get connected sessions count
 */
const getConnectedSessionsCount = () => {
  let count = 0;
  for (const [, state] of sessions) {
    if (state.status === 'connected') count++;
  }
  return count;
};

// ===== BACKWARD COMPATIBILITY =====
// These functions maintain compatibility with existing code

/**
 * @deprecated Use initSession instead
 */
const initWhatsApp = async (socketIo, forceNew = false) => {
  // For backward compatibility, use wa_1 as default
  return await initSession('wa_1', socketIo, forceNew);
};

/**
 * @deprecated Use disconnectSession instead
 */
const disconnectWhatsApp = async () => {
  // Disconnect all sessions
  for (let i = 1; i <= MAX_SESSIONS; i++) {
    const sessionId = `wa_${i}`;
    const state = getSessionState(sessionId);
    if (state.status !== 'disconnected') {
      await disconnectSession(sessionId);
    }
  }
};

/**
 * @deprecated Use getSessionStatus instead
 */
const getSocket = () => {
  const session = getRandomConnectedSession();
  return session?.sock || null;
};

module.exports = {
  // Session management
  initSession,
  disconnectSession,
  refreshSession,
  initAllSessions,
  
  // Status
  getSessionStatus,
  getAllSessionsStatus,
  getWhatsAppStatus,
  getRandomConnectedSession,
  getConnectedSessionsCount,
  
  // Messaging
  checkWhatsAppRegistration,
  sendMessage,
  sendMessageWithSession,
  
  // Counters
  incrementMessageCounter,
  getDailyMessageCount,
  
  // Constants
  MAX_SESSIONS,
  
  // Backward compatibility
  initWhatsApp,
  disconnectWhatsApp,
  getSocket
};
