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
    maxMessagesPerDay: parseInt(process.env.MAX_MESSAGES_PER_DAY) || 100,
    minDelaySeconds: parseInt(process.env.MIN_DELAY_SECONDS) || 300, // 5 minutes
    maxDelaySeconds: parseInt(process.env.MAX_DELAY_SECONDS) || 900, // 15 minutes
    randomDelayMin: parseInt(process.env.RANDOM_DELAY_MIN) || 30,
    randomDelayMax: parseInt(process.env.RANDOM_DELAY_MAX) || 90
  },

  // Admin Default
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@blasta.com',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }
};
