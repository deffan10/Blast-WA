require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const { sequelize, testConnection } = require('./config/database');
const routes = require('./routes');
const { initWhatsApp, initAllSessions } = require('./services/whatsapp.service');
const { initQueues } = require('./services/queue.service');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', routes);

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('📱 Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('📱 Client disconnected:', socket.id);
  });
});

// Initialize application
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();

    // Sync database models
    await sequelize.sync({ alter: true });
    console.log('✅ Database synced successfully.');

    // Seed admin user if not exists
    const { seedAdmin } = require('./seeders/admin.seeder');
    await seedAdmin();

    // Don't auto-init WhatsApp - let user click Scan QR
    // Check for existing session files and migrate if needed
    const fs = require('fs');
    const sessionPath = path.resolve(config.whatsapp.sessionPath);
    const oldCredsPath = path.join(sessionPath, 'creds.json');
    const newSessionPath = path.join(sessionPath, 'wa_1');
    
    // Migrate old session to wa_1 if exists
    if (fs.existsSync(oldCredsPath) && !fs.existsSync(path.join(newSessionPath, 'creds.json'))) {
      console.log('📱 Migrating old session to wa_1...');
      if (!fs.existsSync(newSessionPath)) {
        fs.mkdirSync(newSessionPath, { recursive: true });
      }
      // Move all session files to wa_1 folder
      const files = fs.readdirSync(sessionPath);
      for (const file of files) {
        if (file !== 'wa_1' && file !== 'wa_2' && file !== 'wa_3' && file !== 'wa_4' && file !== 'wa_5') {
          const srcPath = path.join(sessionPath, file);
          const destPath = path.join(newSessionPath, file);
          if (fs.statSync(srcPath).isFile()) {
            fs.renameSync(srcPath, destPath);
          }
        }
      }
      console.log('📱 Session migrated to wa_1 successfully');
    }
    
    // Initialize all active sessions
    await initAllSessions(io);

    // Initialize Queue system
    initQueues(io);

    // Start server
    server.listen(config.port, () => {
      console.log(`🚀 Server running on http://localhost:${config.port}`);
      console.log(`📊 Dashboard: http://localhost:${config.port}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, io };
