const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BlastLog = sequelize.define('BlastLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  campaign_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'blast_campaigns',
      key: 'id'
    }
  },
  contact_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'contacts',
      key: 'id'
    }
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  message_content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Actual message sent (after variable replacement)'
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'failed', 'skipped'),
    defaultValue: 'pending'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  skip_reason: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Reason for skipping: not_registered, already_sent_today, etc.'
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  wa_message_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'WhatsApp message ID for tracking'
  },
  sent_via: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'WhatsApp session ID that sent this message (wa_1, wa_2, etc.)'
  }
}, {
  tableName: 'blast_logs',
  indexes: [
    { fields: ['campaign_id'] },
    { fields: ['contact_id'] },
    { fields: ['status'] },
    { fields: ['sent_at'] },
    { fields: ['phone', 'sent_at'] }
  ]
});

module.exports = BlastLog;
