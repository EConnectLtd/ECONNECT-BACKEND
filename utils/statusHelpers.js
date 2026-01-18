// ============================================
// STATUS HELPER FUNCTIONS - PHASE 2
// ============================================

/**
 * Format status counts from aggregation for easy frontend consumption
 */
function formatStatusCounts(aggregationResults) {
  const formatted = {
    byAccountStatus: {
      active: 0,
      inactive: 0,
      suspended: 0,
    },
    byPaymentStatus: {
      paid: 0,
      partial_paid: 0,
      no_payment: 0,
      overdue: 0,
    },
    combined: {},
  };

  aggregationResults.forEach((item) => {
    const accountStatus = item._id.accountStatus || 'unknown';
    const paymentStatus = item._id.paymentStatus || 'unknown';
    const count = item.count;

    // Count by account status
    if (formatted.byAccountStatus.hasOwnProperty(accountStatus)) {
      formatted.byAccountStatus[accountStatus] += count;
    }

    // Count by payment status
    if (formatted.byPaymentStatus.hasOwnProperty(paymentStatus)) {
      formatted.byPaymentStatus[paymentStatus] += count;
    }

    // Combined key for detailed breakdown
    const combinedKey = `${accountStatus}_${paymentStatus}`;
    formatted.combined[combinedKey] = count;
  });

  return formatted;
}

/**
 * Validate account status value
 */
function isValidAccountStatus(status) {
  const validStatuses = ['active', 'inactive', 'suspended'];
  return validStatuses.includes(status);
}

/**
 * Validate payment status value
 */
function isValidPaymentStatus(status) {
  const validStatuses = ['paid', 'partial_paid', 'no_payment', 'overdue'];
  return validStatuses.includes(status);
}

/**
 * Get user-friendly status label
 */
function getStatusLabel(accountStatus, paymentStatus) {
  const labels = {
    'active_paid': 'Active (Paid)',
    'active_partial_paid': 'Active (Partial Payment)',
    'active_no_payment': 'Active (No Payment Required)',
    'inactive_no_payment': 'Inactive (Awaiting Payment)',
    'inactive_partial_paid': 'Inactive (Partial Payment)',
    'inactive_overdue': 'Inactive (Payment Overdue)',
    'suspended_paid': 'Suspended (Paid)',
    'suspended_partial_paid': 'Suspended (Partial Payment)',
    'suspended_no_payment': 'Suspended',
  };

  const key = `${accountStatus}_${paymentStatus}`;
  return labels[key] || `${accountStatus} (${paymentStatus})`;
}

/**
 * Determine if user should be auto-activated based on payment
 */
function shouldAutoActivate(role, totalPaid, requiredAmount) {
  const rolesRequiringPayment = ['student', 'entrepreneur', 'nonstudent'];
  
  if (!rolesRequiringPayment.includes(role)) {
    return true; // Non-payment roles activate immediately
  }

  return totalPaid >= requiredAmount; // Payment roles need full payment
}

/**
 * Calculate payment status based on amounts
 */
function calculatePaymentStatus(totalPaid, requiredAmount, dueDate) {
  if (totalPaid === 0) {
    return 'no_payment';
  } else if (totalPaid >= requiredAmount) {
    return 'paid';
  } else if (dueDate && new Date() > new Date(dueDate)) {
    return 'overdue';
  } else {
    return 'partial_paid';
  }
}

/**
 * Get status color for badges
 */
function getStatusColor(accountStatus, paymentStatus) {
  if (accountStatus === 'active' && paymentStatus === 'paid') {
    return 'green';
  } else if (accountStatus === 'active' && paymentStatus === 'partial_paid') {
    return 'yellow';
  } else if (accountStatus === 'inactive') {
    return 'orange';
  } else if (accountStatus === 'suspended') {
    return 'red';
  } else if (paymentStatus === 'overdue') {
    return 'red';
  }
  return 'gray';
}

/**
 * Check if status transition is allowed
 */
function isValidStatusTransition(fromStatus, toStatus, reason) {
  const allowedTransitions = {
    'inactive': ['active', 'suspended'],
    'active': ['inactive', 'suspended'],
    'suspended': ['active', 'inactive'],
  };

  if (!allowedTransitions[fromStatus]) {
    return { allowed: false, reason: 'Invalid current status' };
  }

  if (!allowedTransitions[fromStatus].includes(toStatus)) {
    return { 
      allowed: false, 
      reason: `Cannot transition from ${fromStatus} to ${toStatus}` 
    };
  }

  return { allowed: true };
}

module.exports = {
  formatStatusCounts,
  isValidAccountStatus,
  isValidPaymentStatus,
  getStatusLabel,
  shouldAutoActivate,
  calculatePaymentStatus,
  getStatusColor,
  isValidStatusTransition,
};
