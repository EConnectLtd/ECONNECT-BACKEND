// ==========================================
// PACKAGE PRICING - BACKEND VERSION
// ==========================================
// ✅ Centralized pricing for students and entrepreneurs
// ✅ UPDATED: 2026-01-19 to match frontend exactly
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
 * Backend registration fees: { normal: 15000, premier: 70000, silver: 49000, diamond: 55000 }
 */
const STUDENT_PACKAGES = {
  normal: 15000,           // Normal registration (default)
  'ctm-club': 15000,       // CTM Club (variable: 8000 or 15000 depending on institution)
  premier: 70000,          // Premier registration (monthly billing)
  silver: 49000,           // Silver registration (one-time)
  diamond: 55000,          // Diamond registration (monthly billing)
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
    registrationFee: 30000,   // ✅ One-time registration
    monthlyFee: 50000,        // ✅ Monthly fee
    totalFirstMonth: 80000,   // Registration + first month
  },
  gold: {
    name: 'Gold Package',
    registrationFee: 100000,  // ✅ One-time registration
    monthlyFee: 150000,       // ✅ Monthly fee
    totalFirstMonth: 250000,  // Registration + first month
  },
  platinum: {
    name: 'Platinum Package',
    registrationFee: 200000,  // ✅ One-time registration
    monthlyFee: 300000,       // ✅ Monthly fee
    totalFirstMonth: 500000,  // Registration + first month
  },
};

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
 * @param {string} registrationType - Student's registration type
 * @param {string} institutionType - Institution type (for CTM Club)
 * @returns {number} Required fee
 */
function getStudentRegistrationFee(registrationType, institutionType = 'government') {
  if (!registrationType) return 15000;

  // Normalize the registration type
  const normalizedType = registrationType
    .toLowerCase()
    .replace('_registration', '')
    .replace('-', '_');

  // Handle CTM Club separately (variable pricing)
  if (normalizedType === 'ctm_club' || normalizedType === 'normal') {
    return getCtmClubFees(institutionType).total;
  }

  // Return from STUDENT_PACKAGES or default
  return STUDENT_PACKAGES[normalizedType] || 15000;
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

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Constants
  CTM_CLUB_FEES,
  STUDENT_PACKAGES,
  ENTREPRENEUR_PACKAGES,
  
  // Functions
  getCtmClubFees,
  getStudentRegistrationFee,
  getEntrepreneurPackage,
  getEntrepreneurRegistrationFee,
  getRequiredTotal,
  formatTZS,
};
