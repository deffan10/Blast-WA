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
    defaultValue: 'default'
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

module.exports = WhatsAppSession;
