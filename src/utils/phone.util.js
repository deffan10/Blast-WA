/**
 * Normalize phone number to Indonesian format (628xxx)
 * @param {string} phone - Raw phone number
 * @returns {string|null} - Normalized phone number or null if invalid
 */
const normalizePhoneNumber = (phone) => {
  if (!phone) return null;

  // Remove all non-numeric characters except +
  let cleaned = phone.toString().replace(/[^\d+]/g, '');

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Handle various formats
  if (cleaned.startsWith('62')) {
    // Already in international format
    // Validate length (62 + 9-12 digits)
    if (cleaned.length >= 11 && cleaned.length <= 15) {
      return cleaned;
    }
  } else if (cleaned.startsWith('0')) {
    // Local format (08xxx)
    cleaned = '62' + cleaned.substring(1);
    if (cleaned.length >= 11 && cleaned.length <= 15) {
      return cleaned;
    }
  } else if (cleaned.startsWith('8')) {
    // Without leading 0 (8xxx)
    cleaned = '62' + cleaned;
    if (cleaned.length >= 11 && cleaned.length <= 15) {
      return cleaned;
    }
  }

  return null;
};

/**
 * Format phone number for display
 * @param {string} phone - Normalized phone number (628xxx)
 * @returns {string} - Formatted for display (+62 xxx-xxxx-xxxx)
 */
const formatPhoneDisplay = (phone) => {
  if (!phone) return '';

  // Format: +62 812-3456-7890
  const match = phone.match(/^62(\d{3})(\d{4})(\d+)$/);
  if (match) {
    return `+62 ${match[1]}-${match[2]}-${match[3]}`;
  }

  return `+${phone}`;
};

/**
 * Convert phone number to WhatsApp JID format
 * @param {string} phone - Normalized phone number (628xxx)
 * @returns {string} - WhatsApp JID (628xxx@s.whatsapp.net)
 */
const phoneToJid = (phone) => {
  if (!phone) return null;
  return `${phone}@s.whatsapp.net`;
};

/**
 * Extract phone number from WhatsApp JID
 * @param {string} jid - WhatsApp JID
 * @returns {string} - Phone number
 */
const jidToPhone = (jid) => {
  if (!jid) return null;
  return jid.split('@')[0];
};

module.exports = {
  normalizePhoneNumber,
  formatPhoneDisplay,
  phoneToJid,
  jidToPhone
};
