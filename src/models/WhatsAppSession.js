const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const WhatsAppSession = sequelize.define('WhatsAppSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  session_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Unique session identifier (wa_1, wa_2, etc.)'
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'User-friendly label for the session'
  },
  status: {
    type: DataTypes.ENUM('disconnected', 'connecting', 'qr_ready', 'connected'),
    defaultValue: 'disconnected'
  },
  phone_number: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'WhatsApp profile name'
  },
  last_connected: {
    type: DataTypes.DATE,
    allowNull: true
  },
  messages_sent_today: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_message_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this session should be used for sending'
  }
}, {
  tableName: 'whatsapp_sessions'
});

// Reset daily counter
WhatsAppSession.prototype.checkAndResetDailyCounter = function() {
  const today = new Date().toISOString().split('T')[0];
  if (this.last_message_date !== today) {
    this.messages_sent_today = 0;
    this.last_message_date = today;
  }
};

// Static method to get random connected session
WhatsAppSession.getRandomConnected = async function() {
  const sessions = await this.findAll({
    where: {
      status: 'connected',
      is_active: true
    }
  });
  
  if (sessions.length === 0) return null;
  
  // Random selection
  const randomIndex = Math.floor(Math.random() * sessions.length);
  return sessions[randomIndex];
};

// Static method to get all connected sessions
WhatsAppSession.getConnectedSessions = async function() {
  return await this.findAll({
    where: {
      status: 'connected',
      is_active: true
    }
  });
};

module.exports = WhatsAppSession;
