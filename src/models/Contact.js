const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  phone_normalized: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Normalized phone number (628xxx format)'
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'contact_groups',
      key: 'id'
    }
  },
  wa_status: {
    type: DataTypes.ENUM('unknown', 'registered', 'not_registered'),
    defaultValue: 'unknown',
    comment: 'WhatsApp registration status'
  },
  wa_jid: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'WhatsApp JID for sending messages'
  },
  last_validated: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time WA status was validated'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'contacts',
  indexes: [
    { fields: ['phone_normalized'] },
    { fields: ['wa_status'] },
    { fields: ['group_id'] }
  ]
});

module.exports = Contact;
