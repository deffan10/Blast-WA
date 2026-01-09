const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MessageTemplate = sequelize.define('MessageTemplate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Message content with variables: {{nama}}, {{no_hp}}, {{group}}'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  usage_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'message_templates'
});

// Helper method to replace variables
MessageTemplate.prototype.renderMessage = function(contact, groupName = '') {
  let message = this.content;
  
  // Replace variables
  message = message.replace(/\{\{nama\}\}/gi, contact.name || '');
  message = message.replace(/\{\{no_hp\}\}/gi, contact.phone || '');
  message = message.replace(/\{\{group\}\}/gi, groupName || '');
  
  return message;
};

module.exports = MessageTemplate;
