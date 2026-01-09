const { MessageTemplate } = require('../models');
const { Op } = require('sequelize');

class TemplateController {
  // Get all templates
  async getAll(req, res) {
    try {
      const { search, category } = req.query;

      const where = { is_active: true };

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { content: { [Op.like]: `%${search}%` } }
        ];
      }

      if (category) {
        where.category = category;
      }

      const templates = await MessageTemplate.findAll({
        where,
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: templates
      });

    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get templates'
      });
    }
  }

  // Get single template
  async getOne(req, res) {
    try {
      const { id } = req.params;

      const template = await MessageTemplate.findByPk(id);

      if (!template || !template.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      res.json({
        success: true,
        data: template
      });

    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get template'
      });
    }
  }

  // Create template
  async create(req, res) {
    try {
      const { name, content, category } = req.body;

      if (!name || !content) {
        return res.status(400).json({
          success: false,
          message: 'Name and content are required'
        });
      }

      const template = await MessageTemplate.create({
        name,
        content,
        category
      });

      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        data: template
      });

    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create template'
      });
    }
  }

  // Update template
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, content, category } = req.body;

      const template = await MessageTemplate.findByPk(id);

      if (!template || !template.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      await template.update({
        name: name || template.name,
        content: content || template.content,
        category: category !== undefined ? category : template.category
      });

      res.json({
        success: true,
        message: 'Template updated successfully',
        data: template
      });

    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update template'
      });
    }
  }

  // Delete template (soft delete)
  async delete(req, res) {
    try {
      const { id } = req.params;

      const template = await MessageTemplate.findByPk(id);

      if (!template || !template.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      await template.update({ is_active: false });

      res.json({
        success: true,
        message: 'Template deleted successfully'
      });

    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete template'
      });
    }
  }

  // Preview template with sample data
  async preview(req, res) {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required'
        });
      }

      // Sample data for preview
      const sampleContact = {
        name: 'John Doe',
        phone: '628123456789'
      };
      const sampleGroup = 'Pelanggan';

      let preview = content;
      preview = preview.replace(/\{\{nama\}\}/gi, sampleContact.name);
      preview = preview.replace(/\{\{no_hp\}\}/gi, sampleContact.phone);
      preview = preview.replace(/\{\{group\}\}/gi, sampleGroup);

      res.json({
        success: true,
        data: {
          original: content,
          preview,
          variables: {
            nama: sampleContact.name,
            no_hp: sampleContact.phone,
            group: sampleGroup
          }
        }
      });

    } catch (error) {
      console.error('Preview template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to preview template'
      });
    }
  }
}

module.exports = new TemplateController();
