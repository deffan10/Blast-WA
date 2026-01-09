const express = require('express');
const router = express.Router();
const contactGroupController = require('../controllers/contactGroup.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', contactGroupController.getAll);
router.get('/:id', contactGroupController.getOne);
router.post('/', contactGroupController.create);
router.put('/:id', contactGroupController.update);
router.delete('/:id', contactGroupController.delete);

module.exports = router;
