const { User } = require('../models');
const config = require('../config');

const seedAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({
      where: { email: config.admin.email }
    });

    if (!existingAdmin) {
      await User.create({
        name: 'Administrator',
        email: config.admin.email,
        password: config.admin.password,
        role: 'admin',
        is_active: true
      });
      console.log('✅ Default admin user created');
      console.log(`   Email: ${config.admin.email}`);
      console.log(`   Password: ${config.admin.password}`);
    } else {
      console.log('ℹ️  Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
  }
};

module.exports = { seedAdmin };
