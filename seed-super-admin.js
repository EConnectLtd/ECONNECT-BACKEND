/**
 * 🌱 SUPER ADMIN SEED SCRIPT
 * Creates Super Admin: Nixon Martin
 * 
 * HOW TO RUN:
 * 1. Make sure your MongoDB is running
 * 2. Run: node seed-super-admin.js
 * 3. Copy the generated password
 * 4. Login with: nixon.martin@econnect.co.tz or +255712000001
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================
// CONFIGURATION
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 
                    process.env.DATABASE_URL || 
                    'mongodb://localhost:27017/econnect';

// ============================================
// USER SCHEMA (FROM PART 1)
// ============================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: [
      'student',
      'entrepreneur',
      'teacher',
      'headmaster',
      'staff',
      'district_official',
      'regional_official',
      'national_official',
      'tamisemi',
      'super_admin',
      'nonstudent',
    ],
    required: true,
  },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  phoneNumber: { type: String, unique: true, sparse: true, trim: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
  regionName: { type: String, trim: true },
  districtName: { type: String, trim: true },
  wardName: { type: String, trim: true },

  // 🆕 PHASE 2: NEW STATUS SYSTEM
  accountStatus: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'inactive',
    required: true,
    index: true,
  },
  
  paymentStatus: {
    type: String,
    enum: ['paid', 'partial_paid', 'no_payment', 'overdue'],
    default: 'no_payment',
    required: true,
    index: true,
  },

  // Backward compatibility
  isActive: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  
  profileImage: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date,
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  address: String,
  emergencyContact: String,

  // Security
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
});

// Pre-save middleware to sync accountStatus with isActive
userSchema.pre('save', async function () {
  if (this.isModified('accountStatus')) {
    this.isActive = (this.accountStatus === 'active');
  }
});

const User = mongoose.model('User', userSchema);

// ============================================
// SEED FUNCTION
// ============================================
async function seedSuperAdmin() {
  try {
    console.log('\n🌱 ========================================');
    console.log('🌱  SEEDING SUPER ADMIN: NIXON MARTIN');
    console.log('🌱 ========================================\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');

    // Check if super admin already exists
    const existingUser = await User.findOne({
      $or: [
        { email: 'ceo@econnect.co.tz' },
        { username: 'nixon.martin' },
        { phoneNumber: '0758061582' },
      ],
    });

    if (existingUser) {
      console.log('⚠️  Super Admin already exists!');
      console.log('📧 Email:', existingUser.email);
      console.log('👤 Username:', existingUser.username);
      console.log('📱 Phone:', existingUser.phoneNumber);
      console.log('🔑 Role:', existingUser.role);
      console.log('✅ Account Status:', existingUser.accountStatus);
      console.log('💰 Payment Status:', existingUser.paymentStatus);
      console.log('\n💡 If you need to reset the password, delete this user first.');
      process.exit(0);
    }

    // Generate secure password
    const rawPassword = 'NixonM@rtin#2026$TZ!'; // Strong password with special chars
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Create super admin
    console.log('👤 Creating Super Admin user...');
    const superAdmin = new User({
      // Basic Info
      username: 'nixon.martin',
      email: 'ceo@econnect.co.tz',
      phoneNumber: '0758061582',
      password: hashedPassword,
      role: 'super_admin',
      
      // Name
      firstName: 'Nixon',
      lastName: 'Martin',
      
      // 🆕 PHASE 2: ACTIVE STATUS (Super Admin doesn't need payment)
      accountStatus: 'active',
      paymentStatus: 'paid', // Set to paid so no payment flags appear
      isActive: true,
      
      // Verification
      isEmailVerified: true,
      isPhoneVerified: true,
      
      // Additional Info
      gender: 'male',
      dateOfBirth: new Date('1990-01-15'),
      address: 'Dar es Salaam, Tanzania',
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
    });

    await superAdmin.save();

    console.log('✅ Super Admin created successfully!\n');

    // Display credentials
    console.log('🎉 ========================================');
    console.log('🎉  SUPER ADMIN CREDENTIALS');
    console.log('🎉 ========================================\n');
    console.log('👤 Name:        Nixon Martin');
    console.log('📧 Email:       ceo@econnect.co.tz');
    console.log('📱 Phone:       0758061582');
    console.log('👤 Username:    nixon.martin');
    console.log('🔑 Password:    ' + rawPassword);
    console.log('🔐 Role:        super_admin');
    console.log('✅ Status:      ' + superAdmin.accountStatus);
    console.log('💰 Payment:     ' + superAdmin.paymentStatus);
    console.log('\n📝 LOGIN OPTIONS:');
    console.log('   • Use email:    ceo@econnect.co.tz');
    console.log('   • Use phone:    0758061582');
    console.log('   • Use username: nixon.martin');
    console.log('\n🔒 IMPORTANT: Save these credentials securely!');
    console.log('🎯 You can change the password after first login.\n');

    console.log('🎊 ========================================');
    console.log('🎊  SEED COMPLETE!');
    console.log('🎊 ========================================\n');

  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌  SEED FAILED');
    console.error('❌ ========================================\n');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('📡 MongoDB connection closed.');
    process.exit(0);
  }
}

// ============================================
// RUN SEED
// ============================================
seedSuperAdmin();