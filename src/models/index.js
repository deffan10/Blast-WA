const User = require('./User');
const ContactGroup = require('./ContactGroup');
const Contact = require('./Contact');
const MessageTemplate = require('./MessageTemplate');
const BlastCampaign = require('./BlastCampaign');
const BlastLog = require('./BlastLog');
const WhatsAppSession = require('./WhatsAppSession');

// Define associations

// Contact belongs to ContactGroup
Contact.belongsTo(ContactGroup, {
  foreignKey: 'group_id',
  as: 'group'
});

ContactGroup.hasMany(Contact, {
  foreignKey: 'group_id',
  as: 'contacts'
});

// BlastCampaign belongs to MessageTemplate
BlastCampaign.belongsTo(MessageTemplate, {
  foreignKey: 'template_id',
  as: 'template'
});

MessageTemplate.hasMany(BlastCampaign, {
  foreignKey: 'template_id',
  as: 'campaigns'
});

// BlastCampaign belongs to ContactGroup
BlastCampaign.belongsTo(ContactGroup, {
  foreignKey: 'group_id',
  as: 'group'
});

ContactGroup.hasMany(BlastCampaign, {
  foreignKey: 'group_id',
  as: 'campaigns'
});

// BlastLog belongs to BlastCampaign
BlastLog.belongsTo(BlastCampaign, {
  foreignKey: 'campaign_id',
  as: 'campaign'
});

BlastCampaign.hasMany(BlastLog, {
  foreignKey: 'campaign_id',
  as: 'logs'
});

// BlastLog belongs to Contact
BlastLog.belongsTo(Contact, {
  foreignKey: 'contact_id',
  as: 'contact'
});

Contact.hasMany(BlastLog, {
  foreignKey: 'contact_id',
  as: 'logs'
});

module.exports = {
  User,
  ContactGroup,
  Contact,
  MessageTemplate,
  BlastCampaign,
  BlastLog,
  WhatsAppSession
};
