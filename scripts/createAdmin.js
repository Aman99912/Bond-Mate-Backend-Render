/**
 * Script to create first admin user
 * Run: node scripts/createAdmin.js
 * 
 * Or use Postman:
 * POST /api/admin/admins
 * Headers: Authorization: Bearer <super_admin_token>
 * Body: {
 *   "name": "Super Admin",
 *   "email": "admin@bondmate.com",
 *   "password": "Admin@123",
 *   "role": "super_admin",
 *   "permissions": ["*"]
 * }
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import Admin model - using dynamic import for ES modules
let Admin;

const createFirstAdmin = async () => {
  try {
    // Import Admin model after dotenv is loaded
    const AdminModule = await import('../src/models/Admin.ts');
    Admin = AdminModule.default;
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bond-mate';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if any admin exists
    const existingAdmin = await Admin.findOne();
    if (existingAdmin) {
      console.log('⚠️  Admin already exists. Cannot create first admin.');
      console.log('   Use POST /api/admin/admins endpoint with super_admin token to create more admins.');
      process.exit(0);
    }

    // Create first super admin
    const adminData = {
      name: process.env.ADMIN_NAME || 'Super Admin',
      email: process.env.ADMIN_EMAIL || 'admin@bondmate.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@123456',
      role: 'super_admin',
      permissions: ['*'], // All permissions
      isActive: true,
    };

    const admin = await Admin.create(adminData);
    console.log('✅ First admin created successfully!');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log('\n⚠️  IMPORTANT: Change the default password after first login!');
    console.log('   You can create more admins via: POST /api/admin/admins');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

// Run the script
createFirstAdmin();

