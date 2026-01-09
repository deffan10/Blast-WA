const express = require('express');
const router = express.Router();
const templateController = require('../controllers/template.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', templateController.getAll);
router.get('/:id', templateController.getOne);
router.post('/', templateController.create);
router.put('/:id', templateController.update);
router.delete('/:id', templateController.delete);
router.post('/preview', templateController.preview);

module.exports = router;
