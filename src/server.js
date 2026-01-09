require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const config = require('./config');
const { sequelize, testConnection } = require('./config/database');
const routes = require('./routes');
const { initWhatsApp } = require('./services/whatsapp.service');
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
    // Check if there's existing session credentials
    const fs = require('fs');
    const sessionPath = path.resolve(config.whatsapp.sessionPath);
    const hasExistingSession = fs.existsSync(path.join(sessionPath, 'creds.json'));
    
    if (hasExistingSession) {
      console.log('📱 Found existing WhatsApp session, attempting to restore...');
      await initWhatsApp(io, false);
    } else {
      console.log('📱 No WhatsApp session found. Click "Scan QR" in dashboard to connect.');
    }

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
