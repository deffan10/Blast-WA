const config = require('../config');

/**
 * Get random delay in milliseconds
 * @param {number} minSeconds - Minimum delay in seconds
 * @param {number} maxSeconds - Maximum delay in seconds
 * @returns {number} - Random delay in milliseconds
 */
const getRandomDelay = (minSeconds, maxSeconds) => {
  const min = minSeconds * 1000;
  const max = maxSeconds * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Get blast delay based on interval + random delay
 * @param {number} intervalMinutes - Base interval in minutes
 * @returns {number} - Total delay in milliseconds
 */
const getBlastDelay = (intervalMinutes) => {
  const baseDelay = intervalMinutes * 60 * 1000;
  const randomDelay = getRandomDelay(
    config.whatsapp.randomDelayMin,
    config.whatsapp.randomDelayMax
  );
  return baseDelay + randomDelay;
};

/**
 * Add slight message variation (anti-ban)
 * @param {string} message - Original message
 * @returns {string} - Message with slight variation
 */
const addMessageVariation = (message) => {
  const variations = [
    '', // No change
    ' ', // Extra space at end
    '  ', // Double space at end
    ' 🙏', // Emoji
    ' ✨',
    ' 👋',
    '\n',
    '\n\n'
  ];

  const randomVariation = variations[Math.floor(Math.random() * variations.length)];
  return message + randomVariation;
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Format duration from milliseconds
 * @param {number} ms - Duration in milliseconds
 * @returns {string} - Formatted duration
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

module.exports = {
  getRandomDelay,
  getBlastDelay,
  addMessageVariation,
  sleep,
  formatDuration
};
