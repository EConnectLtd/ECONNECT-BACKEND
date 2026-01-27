// ==========================================
// PACKAGE PRICING - BACKEND VERSION
// ==========================================
// ✅ Centralized pricing for students and entrepreneurs
// ✅ UPDATED: 2026-01-26 - Added monthly billing functions
// ✅ Single source of truth for ALL fees (registration + monthly)
// ==========================================

/**
 * CTM Club Fees (Variable based on institution type)
 */
const CTM_CLUB_FEES = {
  government: {
    annual: 3000,
    certificate: 5000,
    total: 8000,
  },
  private: {
    annual: 10000,
    certificate: 5000,
    total: 15000,
  },
};

/**
 * Student Package Pricing
 * Includes both registration fees and monthly fees (where applicable)
 * ✅ UPDATED: January 28, 2025 - Match frontend exactly
 */
const STUDENT_PACKAGES = {
  normal: {
    registrationFee: 20000, // Government: 20k, Private: 25k (calculated dynamically)
    monthlyFee: null, // One-time only
    description: 'Normal Registration',
  },
  'ctm-club': {
    registrationFee: 20000, // Legacy alias for normal
    monthlyFee: null, // One-time only
    description: 'CTM Club Membership',
  },
  premier: {
    registrationFee: 50000, // Government: 50k, Private: 60k (first month included)
    monthlyFee: 70000, // Recurring monthly
    description: 'Premier CTM Membership',
  },
};

/**
 * Entrepreneur Package Pricing
 * ✅ CORRECT PRICES (UPDATED 2026-01-19):
 * - Silver: 30,000 registration + 50,000/month
 * - Gold: 100,000 registration + 150,000/month
 * - Platinum: 200,000 registration + 300,000/month
 */
const ENTREPRENEUR_PACKAGES = {
  silver: {
    name: 'Silver Package',
    registrationFee: 30000, // ✅ One-time registration
    monthlyFee: 50000, // ✅ Monthly recurring fee
    totalFirstMonth: 80000, // Registration + first month
    description: 'Silver Package - Monthly Subscription',
  },
  gold: {
    name: 'Gold Package',
    registrationFee: 100000, // ✅ One-time registration
    monthlyFee: 150000, // ✅ Monthly recurring fee
    totalFirstMonth: 250000, // Registration + first month
    description: 'Gold Package - Monthly Subscription',
  },
  platinum: {
    name: 'Platinum Package',
    registrationFee: 200000, // ✅ One-time registration
    monthlyFee: 300000, // ✅ Monthly recurring fee
    totalFirstMonth: 500000, // Registration + first month
    description: 'Platinum Package - Monthly Subscription',
  },
};

// ==========================================
// REGISTRATION FEE FUNCTIONS
// ==========================================

/**
 * Get CTM Club fees based on institution type
 * @param {string} institutionType - 'government' or 'private'
 * @returns {object} Fee breakdown
 */
function getCtmClubFees(institutionType = 'government') {
  return CTM_CLUB_FEES[institutionType] || CTM_CLUB_FEES.government;
}

/**
 * Get required registration fee for a student
 * ✅ UPDATED: January 28, 2025 - Match frontend exactly
 * @param {string} registrationType - Student's registration type
 * @param {string} institutionType - Institution type (government or private)
 * @returns {number} Required fee
 */
function getStudentRegistrationFee(registrationType, institutionType = 'government') {
  if (!registrationType) {
    // Default to normal government pricing
    return institutionType === 'private' ? 25000 : 20000;
  }

  // Normalize the registration type
  const normalizedType = registrationType
    .toLowerCase()
    .replace('_registration', '')
    .replace('-', '_');

  // Handle normal/ctm-club (variable pricing based on institution)
  if (normalizedType === 'ctm_club' || normalizedType === 'normal') {
    return institutionType === 'private' ? 25000 : 20000;
  }

  // Handle premier (variable pricing based on institution)
  if (normalizedType === 'premier') {
    return institutionType === 'private' ? 60000 : 50000;
  }

  // Default to normal government pricing
  return institutionType === 'private' ? 25000 : 20000;
}

/**
 * Get entrepreneur package details
 * @param {string} packageType - 'silver', 'gold', or 'platinum'
 * @returns {object} Package details with fees
 */
function getEntrepreneurPackage(packageType) {
  if (!packageType) return ENTREPRENEUR_PACKAGES.silver; // Default to silver

  const normalizedType = packageType.toLowerCase();
  return ENTREPRENEUR_PACKAGES[normalizedType] || ENTREPRENEUR_PACKAGES.silver;
}

/**
 * Get total required fee for entrepreneur registration
 * @param {string} packageType - 'silver', 'gold', or 'platinum'
 * @param {boolean} includeFirstMonth - Whether to include first month fee
 * @returns {number} Total fee required
 */
function getEntrepreneurRegistrationFee(packageType, includeFirstMonth = true) {
  const pkg = getEntrepreneurPackage(packageType);

  if (includeFirstMonth) {
    return pkg.totalFirstMonth;
  }

  return pkg.registrationFee;
}

// ==========================================
// ✅ NEW: MONTHLY BILLING FUNCTIONS
// ==========================================

/**
 * Get monthly subscription fee for entrepreneurs
 * @param {string} packageType - 'silver', 'gold', or 'platinum'
 * @returns {number|null} Monthly fee amount or null if not monthly
 */
function getEntrepreneurMonthlyFee(packageType) {
  if (!packageType) return null;

  const normalizedType = packageType.toLowerCase();
  const pkg = ENTREPRENEUR_PACKAGES[normalizedType];

  return pkg ? pkg.monthlyFee : null;
}

/**
 * Get monthly subscription fee for students
 * @param {string} registrationType - 'premier' or 'diamond'
 * @returns {number|null} Monthly fee or null if not monthly
 */
function getStudentMonthlyFee(registrationType) {
  if (!registrationType) return null;

  const normalizedType = registrationType
    .toLowerCase()
    .replace('_registration', '')
    .replace('-', '_');

  const packageData = STUDENT_PACKAGES[normalizedType];

  // Return monthly fee if it exists
  if (packageData && packageData.monthlyFee) {
    return packageData.monthlyFee;
  }

  // Backward compatibility: hardcoded values
  if (normalizedType === 'premier') return 70000;
  if (normalizedType === 'diamond') return 55000;

  return null; // Normal and Silver are one-time only
}

/**
 * Get monthly fee for any user type
 * ✅ PRIMARY FUNCTION for monthly billing service
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role (student, entrepreneur, nonstudent)
 * @returns {number|null} Monthly fee or null if not applicable
 */
function getMonthlyFee(packageType, role) {
  if (!packageType || !role) return null;

  if (role === 'student') {
    return getStudentMonthlyFee(packageType);
  } else if (role === 'entrepreneur' || role === 'nonstudent') {
    return getEntrepreneurMonthlyFee(packageType);
  }

  return null; // Other roles don't have monthly fees
}

/**
 * Check if a package has monthly billing
 * @param {string} packageType - Package/registration type
 * @returns {boolean} True if monthly billing applies
 */
function hasMonthlyBilling(packageType) {
  if (!packageType) return false;

  const monthlyPackages = ['premier', 'diamond', 'silver', 'gold', 'platinum'];
  const normalizedType = packageType.toLowerCase().replace('_registration', '');

  return monthlyPackages.includes(normalizedType);
}

/**
 * Get package description
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @returns {string} Package description
 */
function getPackageDescription(packageType, role) {
  if (!packageType) return 'Unknown Package';

  const normalizedType = packageType.toLowerCase().replace('_registration', '');

  if (role === 'student') {
    const pkg = STUDENT_PACKAGES[normalizedType];
    return pkg ? pkg.description : 'Student Package';
  } else if (role === 'entrepreneur' || role === 'nonstudent') {
    const pkg = ENTREPRENEUR_PACKAGES[normalizedType];
    return pkg ? pkg.description : 'Entrepreneur Package';
  }

  return 'Standard Package';
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Calculate required total based on user role and registration type
 * ✅ Used for payment validation and partial payment calculations
 * @param {string} role - User role (student, entrepreneur, nonstudent)
 * @param {string} registrationType - Registration type
 * @param {string} institutionType - Institution type (for students)
 * @returns {number} Total amount required
 */
function getRequiredTotal(role, registrationType, institutionType = 'government') {
  if (role === 'entrepreneur' || role === 'nonstudent') {
    // Entrepreneurs: registration fee only (monthly fees are separate)
    return getEntrepreneurRegistrationFee(registrationType, false);
  } else if (role === 'student') {
    return getStudentRegistrationFee(registrationType, institutionType);
  }

  // Default for other roles (teachers, staff, etc.)
  return 0;
}

/**
 * Format amount as TZS currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatTZS(amount) {
  return `TZS ${amount.toLocaleString()}`;
}

/**
 * Get all package details for a user
 * ✅ Comprehensive package information
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @param {string} institutionType - Institution type (for students)
 * @returns {object} Complete package details
 */
function getPackageDetails(packageType, role, institutionType = 'government') {
  const normalizedType = packageType ? packageType.toLowerCase().replace('_registration', '') : 'normal';

  return {
    packageType: normalizedType,
    role,
    registrationFee: role === 'student' 
      ? getStudentRegistrationFee(packageType, institutionType)
      : getEntrepreneurRegistrationFee(packageType, false),
    monthlyFee: getMonthlyFee(packageType, role),
    hasMonthlyBilling: hasMonthlyBilling(packageType),
    description: getPackageDescription(packageType, role),
    totalRequired: getRequiredTotal(role, packageType, institutionType),
  };
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Constants
  CTM_CLUB_FEES,
  STUDENT_PACKAGES,
  ENTREPRENEUR_PACKAGES,

  // Registration Fee Functions
  getCtmClubFees,
  getStudentRegistrationFee,
  getEntrepreneurPackage,
  getEntrepreneurRegistrationFee,
  getRequiredTotal,

  // ✅ NEW: Monthly Billing Functions
  getEntrepreneurMonthlyFee,
  getStudentMonthlyFee,
  getMonthlyFee,
  hasMonthlyBilling,
  getPackageDescription,
  getPackageDetails,

  // Utility Functions
  formatTZS,
};