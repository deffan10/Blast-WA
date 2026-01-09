const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { uploadExcel } = require('../middleware/upload.middleware');

// Public route - no auth needed
router.get('/template', contactController.downloadTemplate);

// Protected routes
router.use(authMiddleware);

router.get('/', contactController.getAll);
router.get('/:id', contactController.getOne);
router.post('/', contactController.create);
router.put('/:id', contactController.update);
router.delete('/:id', contactController.delete);
router.post('/bulk-delete', contactController.bulkDelete);
router.post('/import', uploadExcel.single('file'), contactController.importExcel);
router.post('/:id/validate', contactController.validateContact);
router.post('/validate-all', contactController.validateAll);

module.exports = router;
