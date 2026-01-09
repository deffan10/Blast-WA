const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const dashboardRoutes = require('./dashboard.routes');
const contactGroupRoutes = require('./contactGroup.routes');
const contactRoutes = require('./contact.routes');
const templateRoutes = require('./template.routes');
const blastRoutes = require('./blast.routes');
const whatsappRoutes = require('./whatsapp.routes');

// API routes
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/groups', contactGroupRoutes);
router.use('/contacts', contactRoutes);
router.use('/templates', templateRoutes);
router.use('/blast', blastRoutes);
router.use('/whatsapp', whatsappRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
