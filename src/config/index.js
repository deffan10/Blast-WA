require('dotenv').config();

// Production security checks
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default-secret-key') {
    console.error('❌ FATAL: JWT_SECRET must be set in production!');
    process.exit(1);
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123') {
    console.warn('⚠️ WARNING: Change default admin password in production!');
  }
}

module.exports = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Timezone untuk jam kirim & tanggal "hari ini" (contoh: Asia/Jakarta). Kosong = pakai waktu server.
  timezone: process.env.APP_TIMEZONE || process.env.TZ || '',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    name: process.env.DB_NAME || 'blast_wa',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // Redis (for Bull Queue)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },

  // WhatsApp Settings
  whatsapp: {
    sessionPath: process.env.WA_SESSION_PATH || './wa_sessions',
    // Batas pesan: jika limitPerAccount=true (default), 100 = per akun WA. Jika false, 100 = total dibagi rata.
    maxMessagesPerDay: parseInt(process.env.MAX_MESSAGES_PER_DAY) || 100,
    limitPerAccount: process.env.LIMIT_PER_ACCOUNT !== 'false', // true = 100 per akun, false = 100 total dibagi
    minDelaySeconds: parseInt(process.env.MIN_DELAY_SECONDS) || 300, // 5 menit
    maxDelaySeconds: parseInt(process.env.MAX_DELAY_SECONDS) || 900, // 15 menit
    randomDelayMin: parseInt(process.env.RANDOM_DELAY_MIN) || 30,
    randomDelayMax: parseInt(process.env.RANDOM_DELAY_MAX) || 90,
    // Jeda antar campaign (detik) saat multi campaign — kurangi risiko ban
    delayBetweenCampaignsSeconds: parseInt(process.env.DELAY_BETWEEN_CAMPAIGNS_SECONDS) || 30,
    // Jam kirim: hanya kirim dalam rentang jam ini (0-23). Kosongkan = tidak dibatasi.
    // Contoh: SEND_HOUR_START=8, SEND_HOUR_END=22 = kirim hanya 08:00-22:59, stop sebelum tengah malam.
    sendHourStart: process.env.SEND_HOUR_START !== undefined && process.env.SEND_HOUR_START !== '' ? parseInt(process.env.SEND_HOUR_START, 10) : null,
    sendHourEnd: process.env.SEND_HOUR_END !== undefined && process.env.SEND_HOUR_END !== '' ? parseInt(process.env.SEND_HOUR_END, 10) : null
  },

  // Admin Default
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@blasta.com',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }
};
