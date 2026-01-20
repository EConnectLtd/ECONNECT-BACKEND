// ============================================
// 🔄 DATA MIGRATION SCRIPT
// Payment Status System Migration
// ============================================
// PURPOSE: Migrate existing data to new 3-status + 4-payment-status system
// RUN THIS ONCE after deploying the backend fix
// ============================================

const mongoose = require('mongoose');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================

const MONGODB_URI = process.env.MONGODB_URI || 'your-mongodb-connection-string';
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set to 'false' to actually apply changes

console.log('\n╔════════════════════════════════════════════╗');
console.log('║  PAYMENT STATUS MIGRATION SCRIPT          ║');
console.log('╚════════════════════════════════════════════╝\n');
console.log(`📊 Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✍️  LIVE (will modify database)'}`);
console.log(`🔗 Database: ${MONGODB_URI.substring(0, 50)}...`);
console.log('');

// ============================================
// MONGOOSE SCHEMAS (Simplified for migration)
// ============================================

const userSchema = new mongoose.Schema({
  username: String,
  role: String,
  accountStatus: String,  // New: active, inactive, suspended
  paymentStatus: String,  // New: paid, partial_paid, no_payment, overdue
  isActive: Boolean,      // Legacy
  payment_verified_by: mongoose.Schema.Types.ObjectId,
  payment_verified_at: Date,
  payment_date: Date,
}, { strict: false });

const paymentHistorySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  status: String,
  paymentDate: Date,
  verifiedAt: Date,
  verifiedBy: mongoose.Schema.Types.ObjectId,
}, { strict: false });

const User = mongoose.model('User', userSchema);
const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);

// ============================================
// HELPER FUNCTION - Calculate Registration Fee Paid
// ============================================

async function calculateRegistrationFeePaid(userId) {
  try {
    // ✅ CORRECTED: Use "pending" not "partial"
    const paidPayments = await PaymentHistory.find({
      userId,
      status: { $in: ["verified", "pending"] }
    });

    const total = paidPayments.reduce((sum, payment) => sum + payment.amount, 0);
    return total;
  } catch (error) {
    console.error(`❌ Error calculating fee for user ${userId}:`, error.message);
    return 0;
  }
}

// ============================================
// HELPER FUNCTION - Get Required Fee
// ============================================

function getRequiredRegistrationFee(user) {
  const role = user.role;
  const registrationType = (user.registration_type || user.registrationType || '').toLowerCase();
  const institutionType = (user.institutionType || user.institution_type || 'government').toLowerCase();

  // Entrepreneur packages
  if (role === 'entrepreneur' || role === 'nonstudent') {
    const entrepreneurFees = {
      silver: 30000,
      gold: 100000,
      platinum: 200000,
    };
    return entrepreneurFees[registrationType] || 30000;
  }

  // Student packages
  if (role === 'student') {
    // CTM Club packages
    if (registrationType === 'normal' || registrationType === 'ctm_club') {
      return institutionType === 'private' ? 35000 : 15000;
    }

    // Non-CTM packages
    const studentFees = {
      premier: 70000,
      silver: 49000,
      diamond: 55000,
    };
    return studentFees[registrationType] || 15000;
  }

  // Other roles don't require payment
  return 0;
}

// ============================================
// MIGRATION LOGIC
// ============================================

async function migratePaymentStatus() {
  const stats = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byRole: {},
    byStatus: {
      active_paid: 0,
      active_partial_paid: 0,
      inactive_no_payment: 0,
      suspended_overdue: 0,
    },
  };

  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all users
    console.log('📊 Fetching all users...');
    const users = await User.find({});
    stats.total = users.length;
    console.log(`✅ Found ${stats.total} users\n`);

    console.log('🔄 Starting migration...\n');
    console.log('─'.repeat(80));

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const userNum = i + 1;

      try {
        // Track role distribution
        stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;

        // ============================================
        // DETERMINE NEW STATUS VALUES
        // ============================================

        let newAccountStatus;
        let newPaymentStatus;
        let shouldUpdate = false;

        // Check if user already has new status fields
        if (user.accountStatus && user.paymentStatus) {
          console.log(`⏭️  [${userNum}/${stats.total}] ${user.username} (${user.role}) - Already migrated`);
          stats.skipped++;
          continue;
        }

        // ============================================
        // ROLES THAT DON'T REQUIRE PAYMENT
        // ============================================
        
        const rolesRequiringPayment = ['student', 'entrepreneur', 'nonstudent'];
        const requiresPayment = rolesRequiringPayment.includes(user.role);

        if (!requiresPayment) {
          // Teachers, headmasters, etc. - no payment needed
          if (user.isActive) {
            newAccountStatus = 'active';
            newPaymentStatus = 'no_payment';
            stats.byStatus.active_paid++;
          } else {
            newAccountStatus = 'inactive';
            newPaymentStatus = 'no_payment';
            stats.byStatus.inactive_no_payment++;
          }
          shouldUpdate = true;
        } 
        
        // ============================================
        // ROLES THAT REQUIRE PAYMENT
        // ============================================
        
        else {
          // Calculate payment totals
          const totalPaid = await calculateRegistrationFeePaid(user._id);
          const totalRequired = getRequiredRegistrationFee(user);

          console.log(`   💰 Payment: ${totalPaid.toLocaleString()}/${totalRequired.toLocaleString()} TZS`);

          // Determine payment status
          if (totalPaid >= totalRequired) {
            // FULLY PAID
            newAccountStatus = 'active';
            newPaymentStatus = 'paid';
            stats.byStatus.active_paid++;
          } else if (totalPaid > 0) {
            // PARTIALLY PAID
            newAccountStatus = 'active';  // ✅ Partial payment ACTIVATES user
            newPaymentStatus = 'partial_paid';
            stats.byStatus.active_partial_paid++;
          } else {
            // NO PAYMENT
            newAccountStatus = 'inactive';
            newPaymentStatus = 'no_payment';
            stats.byStatus.inactive_no_payment++;
          }

          // Check if overdue (if payment_date exists and is > 30 days old)
          if (user.payment_date && totalPaid < totalRequired) {
            const daysSincePayment = Math.floor((Date.now() - new Date(user.payment_date)) / (1000 * 60 * 60 * 24));
            if (daysSincePayment > 30) {
              newAccountStatus = 'suspended';
              newPaymentStatus = 'overdue';
              stats.byStatus.suspended_overdue++;
            }
          }

          shouldUpdate = true;
        }

        // ============================================
        // APPLY UPDATE
        // ============================================

        if (shouldUpdate) {
          console.log(`✅ [${userNum}/${stats.total}] ${user.username} (${user.role})`);
          console.log(`   📍 Status: ${newAccountStatus} | Payment: ${newPaymentStatus}`);

          if (!DRY_RUN) {
            await User.findByIdAndUpdate(user._id, {
              accountStatus: newAccountStatus,
              paymentStatus: newPaymentStatus,
              isActive: newAccountStatus === 'active',  // Sync legacy field
              updatedAt: new Date(),
            });
            stats.updated++;
          } else {
            stats.updated++;
          }
        }

      } catch (userError) {
        console.error(`❌ [${userNum}/${stats.total}] Error processing ${user.username}:`, userError.message);
        stats.errors++;
      }
    }

    console.log('\n' + '─'.repeat(80));
    console.log('\n✅ MIGRATION COMPLETE!\n');

    // ============================================
    // DISPLAY SUMMARY
    // ============================================

    console.log('╔════════════════════════════════════════════╗');
    console.log('║           MIGRATION SUMMARY                ║');
    console.log('╚════════════════════════════════════════════╝\n');

    console.log(`📊 Total Users:           ${stats.total}`);
    console.log(`✅ Updated:               ${stats.updated}`);
    console.log(`⏭️  Skipped (already OK):  ${stats.skipped}`);
    console.log(`❌ Errors:                ${stats.errors}`);
    console.log('');

    console.log('📈 BY ROLE:');
    Object.entries(stats.byRole).forEach(([role, count]) => {
      console.log(`   - ${role.padEnd(20)}: ${count}`);
    });
    console.log('');

    console.log('🎯 BY NEW STATUS:');
    console.log(`   - Active + Paid:          ${stats.byStatus.active_paid}`);
    console.log(`   - Active + Partial Paid:  ${stats.byStatus.active_partial_paid}`);
    console.log(`   - Inactive + No Payment:  ${stats.byStatus.inactive_no_payment}`);
    console.log(`   - Suspended + Overdue:    ${stats.byStatus.suspended_overdue}`);
    console.log('');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes were made to the database');
      console.log('💡 To apply changes, run with: DRY_RUN=false node migrate-payment-status.js');
    } else {
      console.log('✅ Database updated successfully!');
    }

    console.log('\n' + '═'.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// ============================================
// RUN MIGRATION
// ============================================

migratePaymentStatus()
  .then(() => {
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });

// ============================================
// 📝 USAGE INSTRUCTIONS
// ============================================

/*
HOW TO RUN THIS SCRIPT:

1. DRY RUN (preview changes without modifying database):
   $ DRY_RUN=true node scripts/migrate-payment-status.js

2. LIVE RUN (apply changes to database):
   $ DRY_RUN=false node scripts/migrate-payment-status.js

WHAT THIS SCRIPT DOES:

1. Connects to your MongoDB database
2. Fetches all users
3. For each user:
   - Calculates total paid from PaymentHistory (using FIXED calculation)
   - Determines required registration fee based on role/package
   - Sets accountStatus: active, inactive, or suspended
   - Sets paymentStatus: paid, partial_paid, no_payment, or overdue
   - Syncs legacy isActive field for backward compatibility
4. Displays summary statistics

SAFETY:
- Always run DRY_RUN=true FIRST to preview changes
- Review the output carefully
- Only run with DRY_RUN=false when you're confident

PREREQUISITES:
- Node.js installed
- MongoDB connection string in .env file
- mongoose package installed (npm install mongoose)
*/
