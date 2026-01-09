const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BlastCampaign = sequelize.define('BlastCampaign', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  template_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'message_templates',
      key: 'id'
    }
  },
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'contact_groups',
      key: 'id'
    },
    comment: 'NULL means all contacts'
  },
  status: {
    type: DataTypes.ENUM('draft', 'queued', 'running', 'paused', 'completed', 'stopped', 'failed'),
    defaultValue: 'draft'
  },
  interval_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    comment: 'Delay between messages in minutes'
  },
  total_contacts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  sent_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  failed_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  skipped_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'blast_campaigns',
  indexes: [
    { fields: ['status'] },
    { fields: ['created_at'] }
  ]
});

module.exports = BlastCampaign;
