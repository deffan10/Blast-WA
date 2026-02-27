const { ContactGroup, Contact } = require('../models');
const { Op } = require('sequelize');

class ContactGroupController {
  // Get all groups
  async getAll(req, res) {
    try {
      const groups = await ContactGroup.findAll({
        where: { is_active: true },
        include: [{
          model: Contact,
          as: 'contacts',
          attributes: ['id'],
          where: { is_active: true },
          required: false
        }],
        order: [['name', 'ASC']]
      });

      // Add contact count to each group
      const groupsWithCount = groups.map(group => ({
        ...group.toJSON(),
        contact_count: group.contacts?.length || 0
      }));

      res.json({
        success: true,
        data: groupsWithCount
      });

    } catch (error) {
      console.error('Get groups error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get groups'
      });
    }
  }

  // Get single group
  async getOne(req, res) {
    try {
      const { id } = req.params;

      const group = await ContactGroup.findByPk(id, {
        include: [{
          model: Contact,
          as: 'contacts',
          where: { is_active: true },
          required: false
        }]
      });

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      res.json({
        success: true,
        data: group
      });

    } catch (error) {
      console.error('Get group error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get group'
      });
    }
  }

  // Create group
  async create(req, res) {
    try {
      const { name, description, color } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Group name is required'
        });
      }

      // Check if name already exists
      const existing = await ContactGroup.findOne({ 
        where: { name: { [Op.like]: name } } 
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Group name already exists'
        });
      }

      const group = await ContactGroup.create({
        name,
        description,
        color: color || '#3B82F6'
      });

      res.status(201).json({
        success: true,
        message: 'Group created successfully',
        data: group
      });

    } catch (error) {
      console.error('Create group error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create group'
      });
    }
  }

  // Update group
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, description, color } = req.body;

      const group = await ContactGroup.findByPk(id);

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Check if new name already exists (excluding current)
      if (name && name !== group.name) {
        const existing = await ContactGroup.findOne({ 
          where: { 
            name: { [Op.like]: name },
            id: { [Op.ne]: id }
          } 
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Group name already exists'
          });
        }
      }

      await group.update({
        name: name || group.name,
        description: description !== undefined ? description : group.description,
        color: color || group.color
      });

      res.json({
        success: true,
        message: 'Group updated successfully',
        data: group
      });

    } catch (error) {
      console.error('Update group error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update group'
      });
    }
  }

  // Delete group (soft delete)
  async delete(req, res) {
    try {
      const { id } = req.params;

      const group = await ContactGroup.findByPk(id);

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Hapus kontak di dalam grup (soft delete agar konsisten dengan grup)
      const [contactCount] = await Contact.update(
        { is_active: false, group_id: null },
        { where: { group_id: id } }
      );

      // Soft delete grup
      await group.update({ is_active: false });

      res.json({
        success: true,
        message: contactCount > 0
          ? `Grup dan ${contactCount} kontak di dalamnya berhasil dihapus`
          : 'Group deleted successfully'
      });

    } catch (error) {
      console.error('Delete group error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete group'
      });
    }
  }
}

module.exports = new ContactGroupController();
