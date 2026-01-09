const { Contact, ContactGroup } = require('../models');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const fs = require('fs');
const { normalizePhoneNumber } = require('../utils/phone.util');
const { addToValidationQueue } = require('../services/queue.service');

class ContactController {
  // Get all contacts with pagination and filters
  async getAll(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        search, 
        group_id, 
        wa_status 
      } = req.query;

      const offset = (page - 1) * limit;

      // Build where clause
      const where = { is_active: true };

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } }
        ];
      }

      if (group_id) {
        where.group_id = group_id;
      }

      if (wa_status) {
        where.wa_status = wa_status;
      }

      const { rows: contacts, count: total } = await Contact.findAndCountAll({
        where,
        include: [{
          model: ContactGroup,
          as: 'group',
          attributes: ['id', 'name', 'color']
        }],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: {
          contacts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get contacts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get contacts'
      });
    }
  }

  // Get single contact
  async getOne(req, res) {
    try {
      const { id } = req.params;

      const contact = await Contact.findByPk(id, {
        include: [{
          model: ContactGroup,
          as: 'group',
          attributes: ['id', 'name', 'color']
        }]
      });

      if (!contact || !contact.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      res.json({
        success: true,
        data: contact
      });

    } catch (error) {
      console.error('Get contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get contact'
      });
    }
  }

  // Create contact
  async create(req, res) {
    try {
      const { name, phone, group_id, notes } = req.body;

      if (!name || !phone) {
        return res.status(400).json({
          success: false,
          message: 'Name and phone are required'
        });
      }

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phone);

      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format'
        });
      }

      // Check if phone already exists
      const existing = await Contact.findOne({
        where: { phone_normalized: normalizedPhone }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Phone number already exists'
        });
      }

      // Validate group if provided
      if (group_id) {
        const group = await ContactGroup.findByPk(group_id);
        if (!group || !group.is_active) {
          return res.status(400).json({
            success: false,
            message: 'Invalid group'
          });
        }
      }

      const contact = await Contact.create({
        name,
        phone,
        phone_normalized: normalizedPhone,
        group_id: group_id || null,
        notes
      });

      // Add to validation queue
      addToValidationQueue(contact.id);

      // Fetch with group
      const contactWithGroup = await Contact.findByPk(contact.id, {
        include: [{
          model: ContactGroup,
          as: 'group',
          attributes: ['id', 'name', 'color']
        }]
      });

      res.status(201).json({
        success: true,
        message: 'Contact created successfully. WhatsApp validation queued.',
        data: contactWithGroup
      });

    } catch (error) {
      console.error('Create contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create contact'
      });
    }
  }

  // Update contact
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, phone, group_id, notes } = req.body;

      const contact = await Contact.findByPk(id);

      if (!contact || !contact.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      // If phone changed, normalize and check uniqueness
      let normalizedPhone = contact.phone_normalized;
      if (phone && phone !== contact.phone) {
        normalizedPhone = normalizePhoneNumber(phone);

        if (!normalizedPhone) {
          return res.status(400).json({
            success: false,
            message: 'Invalid phone number format'
          });
        }

        const existing = await Contact.findOne({
          where: { 
            phone_normalized: normalizedPhone,
            id: { [Op.ne]: id }
          }
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: 'Phone number already exists'
          });
        }
      }

      // Validate group if provided
      if (group_id) {
        const group = await ContactGroup.findByPk(group_id);
        if (!group || !group.is_active) {
          return res.status(400).json({
            success: false,
            message: 'Invalid group'
          });
        }
      }

      await contact.update({
        name: name || contact.name,
        phone: phone || contact.phone,
        phone_normalized: normalizedPhone,
        group_id: group_id !== undefined ? group_id : contact.group_id,
        notes: notes !== undefined ? notes : contact.notes,
        // Reset WA status if phone changed
        wa_status: phone && phone !== contact.phone ? 'unknown' : contact.wa_status
      });

      // Re-validate if phone changed
      if (phone && phone !== contact.phone) {
        addToValidationQueue(contact.id);
      }

      // Fetch with group
      const contactWithGroup = await Contact.findByPk(contact.id, {
        include: [{
          model: ContactGroup,
          as: 'group',
          attributes: ['id', 'name', 'color']
        }]
      });

      res.json({
        success: true,
        message: 'Contact updated successfully',
        data: contactWithGroup
      });

    } catch (error) {
      console.error('Update contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update contact'
      });
    }
  }

  // Delete contact (soft delete)
  async delete(req, res) {
    try {
      const { id } = req.params;

      const contact = await Contact.findByPk(id);

      if (!contact || !contact.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      await contact.update({ is_active: false });

      res.json({
        success: true,
        message: 'Contact deleted successfully'
      });

    } catch (error) {
      console.error('Delete contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete contact'
      });
    }
  }

  // Bulk delete contacts
  async bulkDelete(req, res) {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Contact IDs are required'
        });
      }

      await Contact.update(
        { is_active: false },
        { where: { id: { [Op.in]: ids } } }
      );

      res.json({
        success: true,
        message: `${ids.length} contacts deleted successfully`
      });

    } catch (error) {
      console.error('Bulk delete contacts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete contacts'
      });
    }
  }

  // Import contacts from Excel
  async importExcel(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload an Excel file'
        });
      }

      const { group_id } = req.body;

      // Validate group if provided
      if (group_id) {
        const group = await ContactGroup.findByPk(group_id);
        if (!group || !group.is_active) {
          return res.status(400).json({
            success: false,
            message: 'Invalid group'
          });
        }
      }

      // Read Excel file using ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(req.file.path);
      const worksheet = workbook.worksheets[0];
      
      // Convert to JSON-like format
      const data = [];
      const headers = [];
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // First row is headers
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value?.toString().toLowerCase().trim() || '';
          });
        } else {
          const rowData = {};
          row.eachCell((cell, colNumber) => {
            if (headers[colNumber]) {
              rowData[headers[colNumber]] = cell.value;
            }
          });
          if (Object.keys(rowData).length > 0) {
            data.push(rowData);
          }
        }
      });

      // Delete uploaded file
      fs.unlinkSync(req.file.path);

      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Excel file is empty'
        });
      }

      const results = {
        total: data.length,
        success: 0,
        skipped: 0,
        errors: []
      };

      const contactsToValidate = [];

      for (const row of data) {
        try {
          // Get name and phone from various column names
          const name = row.nama || row.name || row.Nama || row.Name || '';
          const phone = row.no_hp || row.phone || row.No_HP || row.Phone || row.nomor || row.Nomor || '';
          const rowGroup = row.group || row.Group || row.grup || row.Grup || '';

          if (!name || !phone) {
            results.skipped++;
            results.errors.push(`Row skipped: missing name or phone`);
            continue;
          }

          // Normalize phone
          const normalizedPhone = normalizePhoneNumber(phone.toString());

          if (!normalizedPhone) {
            results.skipped++;
            results.errors.push(`Invalid phone: ${phone}`);
            continue;
          }

          // Check if exists
          const existing = await Contact.findOne({
            where: { phone_normalized: normalizedPhone }
          });

          if (existing) {
            // Update existing contact if inactive
            if (!existing.is_active) {
              await existing.update({
                name,
                is_active: true,
                group_id: group_id || existing.group_id
              });
              contactsToValidate.push(existing.id);
              results.success++;
            } else {
              results.skipped++;
              results.errors.push(`Phone exists: ${phone}`);
            }
            continue;
          }

          // Determine group_id
          let contactGroupId = group_id || null;

          // If group name provided in Excel, find or create
          if (rowGroup && !group_id) {
            let existingGroup = await ContactGroup.findOne({
              where: { name: { [Op.like]: rowGroup } }
            });

            if (!existingGroup) {
              existingGroup = await ContactGroup.create({
                name: rowGroup,
                color: '#' + Math.floor(Math.random()*16777215).toString(16)
              });
            }
            contactGroupId = existingGroup.id;
          }

          // Create contact
          const contact = await Contact.create({
            name,
            phone: phone.toString(),
            phone_normalized: normalizedPhone,
            group_id: contactGroupId
          });

          contactsToValidate.push(contact.id);
          results.success++;

        } catch (err) {
          results.skipped++;
          results.errors.push(`Error: ${err.message}`);
        }
      }

      // Queue validation for all new contacts
      for (const contactId of contactsToValidate) {
        addToValidationQueue(contactId);
      }

      res.json({
        success: true,
        message: `Import completed. ${results.success} contacts imported, ${results.skipped} skipped.`,
        data: {
          ...results,
          validationQueued: contactsToValidate.length
        }
      });

    } catch (error) {
      console.error('Import Excel error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to import contacts'
      });
    }
  }

  // Validate single contact
  async validateContact(req, res) {
    try {
      const { id } = req.params;

      const contact = await Contact.findByPk(id);

      if (!contact || !contact.is_active) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }

      addToValidationQueue(contact.id);

      res.json({
        success: true,
        message: 'Contact queued for WhatsApp validation'
      });

    } catch (error) {
      console.error('Validate contact error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to queue validation'
      });
    }
  }

  // Validate all unknown contacts
  async validateAll(req, res) {
    try {
      const contacts = await Contact.findAll({
        where: {
          is_active: true,
          wa_status: 'unknown'
        }
      });

      for (const contact of contacts) {
        addToValidationQueue(contact.id);
      }

      res.json({
        success: true,
        message: `${contacts.length} contacts queued for WhatsApp validation`
      });

    } catch (error) {
      console.error('Validate all contacts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to queue validation'
      });
    }
  }
}

module.exports = new ContactController();
