// ==========================================
// MONTHLY & ANNUAL BILLING SERVICE
// ==========================================
// ✅ Handles both monthly (Premier, Entrepreneurs) and annual (CTM Club) billing
// ✅ Generates invoices automatically based on billing cycle
// ==========================================

const mongoose = require('mongoose');

// Import models (will be injected when service is initialized)
let User, Invoice, PaymentHistory, Notification, ActivityLog;

// Import pricing utilities
const {
  getBillingCycle,
  getRecurringFee,
  getStudentAnnualFee,
  getMonthlyFee,
  hasMonthlyBilling,
  hasAnnualBilling,
} = require('../utils/packagePricing');

// ==========================================
// INITIALIZE SERVICE (Call this after models are defined)
// ==========================================
function initialize(models) {
  User = models.User;
  Invoice = models.Invoice;
  PaymentHistory = models.PaymentHistory;
  Notification = models.Notification;
  ActivityLog = models.ActivityLog;
  
  console.log('✅ Monthly/Annual Billing Service initialized');
}

// ==========================================
// MAIN BILLING PROCESSOR
// ==========================================

/**
 * Process monthly and annual billing for all users
 * - CTM Club (normal): Annual billing every 12 months
 * - Premier: Monthly billing
 * - Entrepreneurs: Monthly billing
 * 
 * @returns {Promise<object>} Results summary
 */
async function processMonthlyBilling() {
  try {
    console.log('\n💰 ========================================');
    console.log('💰  MONTHLY/ANNUAL BILLING SERVICE');
    console.log('💰 ========================================\n');

    const today = new Date();
    const results = {
      success: true,
      processedAt: today,
      monthly: {
        checked: 0,
        invoicesCreated: 0,
        errors: 0,
      },
      annual: {
        checked: 0,
        invoicesCreated: 0,
        errors: 0,
      },
    };

    // ============================================
    // 1️⃣ PROCESS ANNUAL BILLING (CTM Club)
    // ============================================
    console.log('📅 Processing ANNUAL billing (CTM Club students)...\n');

    const annualUsers = await User.find({
      role: 'student',
      registrationType: { $in: ['normal', 'ctm-club'] },
      accountStatus: 'active',
    }).select('_id firstName lastName registrationType institutionType last_annual_invoice_date next_billing_date');

    console.log(`📊 Found ${annualUsers.length} CTM Club students\n`);
    results.annual.checked = annualUsers.length;

    for (const user of annualUsers) {
      try {
        // Calculate next billing date (12 months after registration or last payment)
        const lastInvoiceDate = user.last_annual_invoice_date || user.createdAt;
        const monthsSinceLastInvoice = Math.floor(
          (today - new Date(lastInvoiceDate)) / (1000 * 60 * 60 * 24 * 30)
        );

        // Generate invoice if 12+ months have passed
        if (monthsSinceLastInvoice >= 12) {
          const annualFee = getStudentAnnualFee(
            user.registrationType,
            user.institutionType || 'government'
          );

          if (annualFee && annualFee > 0) {
            // Check if invoice already exists for this period
            const existingInvoice = await Invoice.findOne({
              user_id: user._id,
              type: 'ctm_membership',
              createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) },
            });

            if (!existingInvoice) {
              // Create annual renewal invoice
              const invoiceNumber = `INV-ANNUAL-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

              await Invoice.create({
                user_id: user._id,
                invoiceNumber,
                type: 'ctm_membership',
                description: `CTM Club Annual Renewal - ${today.getFullYear()}`,
                amount: annualFee,
                currency: 'TZS',
                status: 'unpaid',
                dueDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days to pay
                academicYear: today.getFullYear().toString(),
              });

              // Update user's next billing date
              user.last_annual_invoice_date = today;
              user.next_billing_date = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
              await user.save();

              // Create notification
              if (Notification) {
                await Notification.create({
                  userId: user._id,
                  title: 'Annual Renewal Invoice',
                  message: `Your CTM Club annual renewal invoice of TZS ${annualFee.toLocaleString()} has been generated. Due in 30 days.`,
                  type: 'payment',
                  actionUrl: '/invoices',
                });
              }

              console.log(`✅ Annual invoice created: ${user.firstName} ${user.lastName} - TZS ${annualFee.toLocaleString()}`);
              results.annual.invoicesCreated++;
            } else {
              console.log(`⏭️  Invoice already exists for ${user.firstName} ${user.lastName}`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing annual billing for user ${user._id}:`, error.message);
        results.annual.errors++;
      }
    }

    // ============================================
    // 2️⃣ PROCESS MONTHLY BILLING (Premier & Entrepreneurs)
    // ============================================
    console.log('\n📅 Processing MONTHLY billing (Premier students & Entrepreneurs)...\n');

    const monthlyUsers = await User.find({
      $or: [
        { role: 'student', registrationType: 'premier', accountStatus: 'active' },
        { role: 'entrepreneur', accountStatus: 'active' },
      ],
    }).select('_id firstName lastName role registrationType last_monthly_invoice_date next_billing_date');

    console.log(`📊 Found ${monthlyUsers.length} users with monthly billing\n`);
    results.monthly.checked = monthlyUsers.length;

    for (const user of monthlyUsers) {
      try {
        // Calculate next billing date (1 month after last invoice)
        const lastInvoiceDate = user.last_monthly_invoice_date || user.createdAt;
        const daysSinceLastInvoice = Math.floor(
          (today - new Date(lastInvoiceDate)) / (1000 * 60 * 60 * 24)
        );

        // Generate invoice if 30+ days have passed
        if (daysSinceLastInvoice >= 30) {
          const monthlyFee = getMonthlyFee(user.registrationType, user.role);

          if (monthlyFee && monthlyFee > 0) {
            // Check if invoice already exists for this period
            const existingInvoice = await Invoice.findOne({
              user_id: user._id,
              type: 'monthly_fee',
              createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) },
            });

            if (!existingInvoice) {
              // Create monthly invoice
              const invoiceNumber = `INV-MONTHLY-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

              const invoiceType = user.role === 'student' ? 'ctm_membership' : 'monthly_fee';
              const description = user.role === 'student' 
                ? `Premier Monthly Fee - ${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
                : `Monthly Subscription - ${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

              await Invoice.create({
                user_id: user._id,
                invoiceNumber,
                type: invoiceType,
                description,
                amount: monthlyFee,
                currency: 'TZS',
                status: 'unpaid',
                dueDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days to pay
                academicYear: today.getFullYear().toString(),
              });

              // Update user's next billing date
              user.last_monthly_invoice_date = today;
              user.next_billing_date = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
              await user.save();

              // Create notification
              if (Notification) {
                await Notification.create({
                  userId: user._id,
                  title: 'Monthly Invoice Generated',
                  message: `Your monthly invoice of TZS ${monthlyFee.toLocaleString()} has been generated. Due in 7 days.`,
                  type: 'payment',
                  actionUrl: '/invoices',
                });
              }

              console.log(`✅ Monthly invoice created: ${user.firstName} ${user.lastName} (${user.role}) - TZS ${monthlyFee.toLocaleString()}`);
              results.monthly.invoicesCreated++;
            } else {
              console.log(`⏭️  Invoice already exists for ${user.firstName} ${user.lastName}`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing monthly billing for user ${user._id}:`, error.message);
        results.monthly.errors++;
      }
    }

    // ============================================
    // 3️⃣ SUMMARY
    // ============================================
    console.log('\n✅ ========================================');
    console.log('✅  BILLING SUMMARY');
    console.log('========================================');
    console.log(`📅 Annual Billing (CTM Club):`);
    console.log(`   - Checked: ${results.annual.checked} users`);
    console.log(`   - Invoices Created: ${results.annual.invoicesCreated}`);
    console.log(`   - Errors: ${results.annual.errors}`);
    console.log(`\n📅 Monthly Billing (Premier/Entrepreneurs):`);
    console.log(`   - Checked: ${results.monthly.checked} users`);
    console.log(`   - Invoices Created: ${results.monthly.invoicesCreated}`);
    console.log(`   - Errors: ${results.monthly.errors}`);
    console.log('========================================\n');

    return results;
  } catch (error) {
    console.error('❌ CRITICAL: Monthly/Annual billing service error:', error);
    throw error;
  }
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  initialize,
  processMonthlyBilling,
};
