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

// Minimum delay antar pesan (anti-ban: hindari kirim terlalu rapat)
const MIN_DELAY_BETWEEN_MESSAGES_MS = 60 * 1000; // 1 menit

/**
 * Get blast delay based on interval + random delay
 * @param {number} intervalMinutes - Base interval in minutes
 * @returns {number} - Total delay in milliseconds (minimum 1 menit)
 */
const getBlastDelay = (intervalMinutes) => {
  const baseDelay = Math.max(intervalMinutes || 0, 0) * 60 * 1000;
  const randomDelay = getRandomDelay(
    config.whatsapp.randomDelayMin,
    config.whatsapp.randomDelayMax
  );
  const total = baseDelay + randomDelay;
  return Math.max(total, MIN_DELAY_BETWEEN_MESSAGES_MS);
};

// Zero-width characters untuk variasi halus (kurang terdeteksi WA)
const ZERO_WIDTH_SPACE = '\u200B';
const ZERO_WIDTH_NBSP = '\u200C';

/**
 * Add slight message variation (anti-ban): spasi/emoji di akhir + kadang sisip zero-width
 * @param {string} message - Original message
 * @returns {string} - Message with slight variation
 */
const addMessageVariation = (message) => {
  const suffixVariations = [
    '',
    ' ',
    '  ',
    ' 🙏',
    ' ✨',
    ' 👋',
    '\n',
    '\n\n'
  ];
  let result = message + suffixVariations[Math.floor(Math.random() * suffixVariations.length)];
  // 30% tambah satu zero-width di posisi acak (variasi halus)
  if (result.length > 2 && Math.random() < 0.3) {
    const pos = Math.floor(Math.random() * (result.length - 1)) + 1;
    const zw = Math.random() < 0.5 ? ZERO_WIDTH_SPACE : ZERO_WIDTH_NBSP;
    result = result.slice(0, pos) + zw + result.slice(pos);
  }
  return result;
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

/**
 * Tanggal hari ini dalam zona waktu server (atau TZ/APP_TIMEZONE) format YYYY-MM-DD
 * Dipakai untuk reset counter harian & last_message_date agar konsisten dengan jam kirim.
 */
const getTodayLocalDateString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Cek apakah sekarang dalam jam yang diizinkan untuk kirim (pakai waktu server / TZ)
 * @returns {{ allowed: boolean, message: string }}
 */
const getSendHoursStatus = () => {
  const start = config.whatsapp.sendHourStart;
  const end = config.whatsapp.sendHourEnd;
  if (start == null && end == null) {
    return { allowed: true, message: '' };
  }
  const now = new Date();
  const hour = now.getHours();
  let allowed = true;
  if (start != null && hour < start) {
    allowed = false;
  }
  if (end != null && hour > end) {
    allowed = false;
  }
  const startStr = start != null ? `${String(start).padStart(2, '0')}:00` : '00:00';
  const endStr = end != null ? `${String(end).padStart(2, '0')}:59` : '23:59';
  const tzNote = config.timezone ? ` (${config.timezone})` : ' (waktu server)';
  const message = `Jam kirim hanya ${startStr}-${endStr}${tzNote}.`;
  return { allowed, message };
};

module.exports = {
  getRandomDelay,
  getBlastDelay,
  addMessageVariation,
  sleep,
  formatDuration,
  getTodayLocalDateString,
  getSendHoursStatus
};
