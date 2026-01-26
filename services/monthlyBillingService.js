// ============================================
// MONTHLY BILLING SERVICE
// ============================================
// Handles automated monthly billing for:
// - Premier Students (70,000 TZS/month)
// - Diamond Non-Students (55,000 TZS/month)
// - Silver/Gold/Platinum Entrepreneurs (50k/150k/300k per month)
// ✅ UPDATED: 2026-01-26 - Now imports from packagePricing.js
// ============================================

const mongoose = require('mongoose');
const User = mongoose.model('User');
const Invoice = mongoose.model('Invoice');
const PaymentReminder = mongoose.model('PaymentReminder');
const ActivityLog = mongoose.model('ActivityLog');
const { createNotification } = require('./notificationService');
const smsService = require('./smsService');

// ✅ Import from single source of truth
const packagePricing = require('../utils/packagePricing');

// ============================================
// CONFIGURATION
// ============================================

/**
 * Monthly billing configuration (descriptions and metadata only)
 * ✅ Amounts come from packagePricing.js
 */
const MONTHLY_BILLING_CONFIG = {
  premier: {
    role: 'student',
    description: 'Premier CTM Membership - Monthly Fee',
    type: 'ctm_membership',
  },
  diamond: {
    role: 'nonstudent',
    description: 'Diamond Registration - Monthly Fee',
    type: 'monthly_subscription',
  },
  silver: {
    role: 'entrepreneur',
    description: 'Silver Package - Monthly Subscription',
    type: 'monthly_subscription',
  },
  gold: {
    role: 'entrepreneur',
    description: 'Gold Package - Monthly Subscription',
    type: 'monthly_subscription',
  },
  platinum: {
    role: 'entrepreneur',
    description: 'Platinum Package - Monthly Subscription',
    type: 'monthly_subscription',
  },
};

const BILLING_CONFIG = {
  daysUntilDue: 7, // Users have 7 days to pay
  daysBeforeReminderFirst: 3, // First reminder at 3 days before due
  daysBeforeReminderSecond: 1, // Second reminder at 1 day before due
  gracePeriodDays: 3, // 3 days grace period after due date
  excludeFirstMonthDays: 30, // Don't bill if account < 30 days old
};

// ============================================
// HELPER: GET BILLING CONFIG WITH DYNAMIC AMOUNT
// ============================================

/**
 * Get complete billing configuration for a package
 * ✅ Merges static config with dynamic amount from packagePricing.js
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @returns {object|null} Complete billing config or null if not applicable
 */
function getBillingConfig(packageType, role) {
  if (!packageType || !role) return null;

  const staticConfig = MONTHLY_BILLING_CONFIG[packageType];
  if (!staticConfig) return null;

  // Verify role matches
  if (staticConfig.role !== role) return null;

  // ✅ Get amount from packagePricing (single source of truth)
  const amount = packagePricing.getMonthlyFee(packageType, role);
  if (!amount) return null;

  return {
    ...staticConfig,
    amount, // ✅ Dynamically loaded from packagePricing.js
    packageType,
  };
}

// ============================================
// MAIN BILLING FUNCTION
// ============================================

/**
 * Process monthly billing for all eligible users
 * @param {Object} options - Billing options
 * @param {Boolean} options.dryRun - If true, don't actually create invoices (test mode)
 * @param {Boolean} options.sendNotifications - If true, send SMS and in-app notifications
 * @param {String} options.billingMonth - Override billing month (format: "YYYY-MM")
 * @returns {Object} Billing results summary
 */
async function processMonthlyBilling(options = {}) {
  const { dryRun = false, sendNotifications = true, billingMonth = null } = options;

  console.log('\n💳 ========================================');
  console.log('💳  MONTHLY BILLING SERVICE');
  console.log('💳 ========================================');
  console.log(`📅 Billing Month: ${billingMonth || 'Current Month'}`);
  console.log(`🧪 Dry Run: ${dryRun ? 'YES (Test Mode)' : 'NO (Live Mode)'}`);
  console.log(`📧 Notifications: ${sendNotifications ? 'ENABLED' : 'DISABLED'}`);
  console.log('========================================\n');

  const results = {
    success: [],
    failed: [],
    skipped: [],
    stats: {
      total: 0,
      billed: 0,
      failed: 0,
      skipped: 0,
      totalAmount: 0,
      invoicesCreated: 0,
      notificationsSent: 0,
      smsSent: 0,
    },
    summary: {
      byPackage: {},
      byRole: {},
      errors: [],
    },
  };

  try {
    // ========================================
    // STEP 1: IDENTIFY ELIGIBLE USERS
    // ========================================

    console.log('📊 Step 1: Identifying eligible users...\n');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - BILLING_CONFIG.excludeFirstMonthDays);

    // Find users with monthly billing packages
    const monthlyPackages = ['premier', 'diamond', 'silver', 'gold', 'platinum'];

    const eligibleUsers = await User.find({
      registration_type: { $in: monthlyPackages },
      accountStatus: 'active', // Only bill active users
      createdAt: { $lt: thirtyDaysAgo }, // Exclude first month (already paid in registration)
    })
      .select('firstName lastName username email phoneNumber role registration_type schoolId createdAt')
      .populate('schoolId', 'name schoolCode')
      .lean();

    results.stats.total = eligibleUsers.length;

    console.log(`✅ Found ${eligibleUsers.length} eligible users for monthly billing\n`);

    if (eligibleUsers.length === 0) {
      console.log('ℹ️  No users to bill this month. Exiting.\n');
      return results;
    }

    // ========================================
    // STEP 2: GENERATE BILLING MONTH INFO
    // ========================================

    const now = new Date();
    const currentMonth = billingMonth ? new Date(billingMonth) : now;
    const billingYear = currentMonth.getFullYear();
    const billingMonthNum = currentMonth.getMonth() + 1;
    const billingMonthName = currentMonth.toLocaleString('default', { month: 'long' });

    console.log(`📅 Billing Period: ${billingMonthName} ${billingYear}\n`);

    // ========================================
    // STEP 3: PROCESS EACH USER
    // ========================================

    console.log('💰 Step 2: Processing monthly billing...\n');

    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];
      const recordNumber = i + 1;

      try {
        const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username;
        const packageType = user.registration_type;

        console.log(`[${recordNumber}/${eligibleUsers.length}] Processing: ${userName} (${packageType.toUpperCase()})`);

        // ========================================
        // CHECK 1: Get billing config with dynamic amount
        // ========================================

        const billingConfig = getBillingConfig(packageType, user.role);

        if (!billingConfig) {
          results.skipped.push({
            recordNumber,
            userId: user._id,
            userName,
            packageType,
            reason: `Package "${packageType}" not configured for monthly billing or role mismatch`,
          });
          results.stats.skipped++;
          console.log(`   ⏭️  SKIPPED: Package not configured or role mismatch\n`);
          continue;
        }

        console.log(`   💰 Monthly fee: TZS ${billingConfig.amount.toLocaleString()} (from packagePricing.js)`);

        // ========================================
        // CHECK 2: Check for existing invoice this month
        // ========================================

        const existingInvoice = await Invoice.findOne({
          user_id: user._id,
          type: billingConfig.type,
          academicYear: billingYear.toString(),
          'metadata.billingMonth': billingMonthNum,
          'metadata.billingYear': billingYear,
        });

        if (existingInvoice) {
          results.skipped.push({
            recordNumber,
            userId: user._id,
            userName,
            packageType,
            reason: `Already billed for ${billingMonthName} ${billingYear}`,
            existingInvoiceId: existingInvoice._id,
          });
          results.stats.skipped++;
          console.log(`   ⏭️  SKIPPED: Already billed this month (Invoice: ${existingInvoice.invoiceNumber})\n`);
          continue;
        }

        // ========================================
        // STEP 4: CREATE INVOICE (or simulate)
        // ========================================

        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + BILLING_CONFIG.daysUntilDue);

        const invoiceData = {
          user_id: user._id,
          schoolId: user.schoolId?._id,
          invoiceNumber,
          type: billingConfig.type,
          description: `${billingConfig.description} - ${billingMonthName} ${billingYear}`,
          amount: billingConfig.amount,
          currency: 'TZS',
          status: 'pending',
          dueDate,
          academicYear: billingYear.toString(),
          items: [
            {
              description: billingConfig.description,
              quantity: 1,
              unitPrice: billingConfig.amount,
              total: billingConfig.amount,
            },
          ],
          metadata: {
            billingType: 'monthly_recurring',
            billingMonth: billingMonthNum,
            billingYear: billingYear,
            billingMonthName: billingMonthName,
            packageType: packageType,
            generatedBy: 'monthly_billing_cron',
            generatedAt: new Date(),
          },
        };

        let invoice;

        if (dryRun) {
          // Test mode - don't actually create invoice
          console.log(`   🧪 DRY RUN: Would create invoice for TZS ${billingConfig.amount.toLocaleString()}`);
          invoice = { _id: 'dry-run-id', ...invoiceData };
        } else {
          // Live mode - create actual invoice
          invoice = await Invoice.create(invoiceData);
          results.stats.invoicesCreated++;
          console.log(`   ✅ Invoice created: ${invoice.invoiceNumber} - TZS ${billingConfig.amount.toLocaleString()}`);
        }

        // ========================================
        // STEP 5: SEND NOTIFICATIONS
        // ========================================

        if (sendNotifications && !dryRun) {
          // In-app notification
          try {
            await createNotification(
              user._id,
              `Monthly Payment Due - ${billingMonthName} 💳`,
              `Your monthly ${packageType.toUpperCase()} subscription fee of TZS ${billingConfig.amount.toLocaleString()} is now due. Please pay by ${dueDate.toLocaleDateString()} to avoid service interruption.`,
              'info',
              `/invoices/${invoice._id}`,
            );

            results.stats.notificationsSent++;
            console.log(`   📧 In-app notification sent`);
          } catch (notifError) {
            console.error(`   ⚠️  Notification failed:`, notifError.message);
          }

          // SMS notification
          if (user.phoneNumber && smsService) {
            try {
              const smsMessage = `Hello ${userName}! Your ${billingMonthName} ${packageType.toUpperCase()} subscription (TZS ${billingConfig.amount.toLocaleString()}) is due by ${dueDate.toLocaleDateString()}. Invoice: ${invoice.invoiceNumber}. Pay via Vodacom Lipa: 5130676 or CRDB: 0150814579600. Thank you!`;

              const smsResult = await smsService.sendSMS(user.phoneNumber, smsMessage, 'monthly_billing');

              if (smsResult.success) {
                results.stats.smsSent++;
                console.log(`   📱 SMS sent to ${user.phoneNumber}`);
              } else {
                console.error(`   ⚠️  SMS failed: ${smsResult.error}`);
              }
            } catch (smsError) {
              console.error(`   ⚠️  SMS error:`, smsError.message);
            }
          }
        }

        // ========================================
        // STEP 6: TRACK STATS
        // ========================================

        // By package type
        if (!results.summary.byPackage[packageType]) {
          results.summary.byPackage[packageType] = {
            count: 0,
            totalAmount: 0,
          };
        }
        results.summary.byPackage[packageType].count++;
        results.summary.byPackage[packageType].totalAmount += billingConfig.amount;

        // By role
        if (!results.summary.byRole[user.role]) {
          results.summary.byRole[user.role] = {
            count: 0,
            totalAmount: 0,
          };
        }
        results.summary.byRole[user.role].count++;
        results.summary.byRole[user.role].totalAmount += billingConfig.amount;

        // Add to success results
        results.success.push({
          recordNumber,
          userId: user._id,
          userName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          packageType,
          amount: billingConfig.amount,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          dueDate,
          schoolName: user.schoolId?.name || 'N/A',
        });

        results.stats.billed++;
        results.stats.totalAmount += billingConfig.amount;

        console.log(`   ✅ SUCCESS: Billed TZS ${billingConfig.amount.toLocaleString()}\n`);
      } catch (userError) {
        console.error(`   ❌ ERROR: ${userError.message}\n`);

        results.failed.push({
          recordNumber,
          userId: user._id,
          userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
          packageType: user.registration_type,
          error: userError.message,
        });

        results.stats.failed++;
        results.summary.errors.push({
          userId: user._id,
          error: userError.message,
          timestamp: new Date(),
        });
      }
    }

    // ========================================
    // STEP 7: LOG ACTIVITY
    // ========================================

    if (!dryRun) {
      await ActivityLog.create({
        userId: null, // System activity
        action: 'MONTHLY_BILLING_COMPLETED',
        description: `Monthly billing for ${billingMonthName} ${billingYear}: Billed ${results.stats.billed} users, TZS ${results.stats.totalAmount.toLocaleString()} total`,
        metadata: {
          billingMonth: billingMonthNum,
          billingYear: billingYear,
          billingMonthName: billingMonthName,
          totalUsers: results.stats.total,
          billed: results.stats.billed,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          totalAmount: results.stats.totalAmount,
          invoicesCreated: results.stats.invoicesCreated,
          byPackage: results.summary.byPackage,
          byRole: results.summary.byRole,
        },
        ipAddress: 'system',
        userAgent: 'monthly-billing-cron',
      });
    }

    // ========================================
    // FINAL SUMMARY
    // ========================================

    console.log('\n✅ ========================================');
    console.log('✅  MONTHLY BILLING COMPLETE');
    console.log('✅ ========================================');
    console.log(`📊 Total Users Processed: ${results.stats.total}`);
    console.log(`💰 Successfully Billed: ${results.stats.billed}`);
    console.log(`❌ Failed: ${results.stats.failed}`);
    console.log(`⏭️  Skipped: ${results.stats.skipped}`);
    console.log(`💵 Total Amount: TZS ${results.stats.totalAmount.toLocaleString()}`);
    console.log(`📄 Invoices Created: ${results.stats.invoicesCreated}`);
    console.log(`📧 Notifications Sent: ${results.stats.notificationsSent}`);
    console.log(`📱 SMS Sent: ${results.stats.smsSent}`);
    console.log('========================================\n');

    return results;
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌  MONTHLY BILLING FAILED');
    console.error('❌ ========================================');
    console.error(error);
    console.error('========================================\n');

    throw error;
  }
}

// ============================================
// UTILITY: GET MONTHLY FEE FOR USER
// ============================================

/**
 * Get monthly fee details for a user
 * ✅ Uses packagePricing.js as single source of truth
 * @param {Object} user - User object with registration_type and role
 * @returns {Object|null} Fee details or null if not applicable
 */
function getMonthlyFeeForUser(user) {
  if (!user || !user.registration_type || !user.role) return null;

  const billingConfig = getBillingConfig(user.registration_type, user.role);
  if (!billingConfig) return null;

  return {
    amount: billingConfig.amount,
    description: billingConfig.description,
    type: billingConfig.type,
    packageType: user.registration_type,
  };
}

// ============================================
// UTILITY: CHECK IF USER NEEDS MONTHLY BILLING
// ============================================

/**
 * Check if user is eligible for monthly billing
 * @param {Object} user - User object
 * @returns {Boolean} True if eligible for monthly billing
 */
function isEligibleForMonthlyBilling(user) {
  if (!user || !user.registration_type) return false;

  // Check if package has monthly billing
  if (!packagePricing.hasMonthlyBilling(user.registration_type)) {
    return false;
  }

  // Must be active
  if (user.accountStatus !== 'active') {
    return false;
  }

  // Check if account is older than 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - BILLING_CONFIG.excludeFirstMonthDays);

  if (new Date(user.createdAt) >= thirtyDaysAgo) {
    return false;
  }

  return true;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  processMonthlyBilling,
  getMonthlyFeeForUser,
  isEligibleForMonthlyBilling,
  getBillingConfig,
  MONTHLY_BILLING_CONFIG,
  BILLING_CONFIG,
};
