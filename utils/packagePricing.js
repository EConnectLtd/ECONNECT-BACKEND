// ==========================================
// PACKAGE PRICING - BACKEND VERSION
// ==========================================
// ✅ Centralized pricing for students and entrepreneurs
// ✅ UPDATED: 2026-01-31 - NEW PRICING WITH EDUCATION LEVEL SUPPORT
// ✅ Single source of truth for ALL fees (registration + monthly)
// ==========================================

/**
 * CTM Club Fees (Variable based on institution type AND education level)
 * ✅ UPDATED: January 31, 2026 - NEW PRICING STRUCTURE
 * 
 * Primary/Secondary Schools:
 *   - Government: TZS 3,000/year
 *   - Private: TZS 10,000/year
 * 
 * Colleges/Universities:
 *   - Government: TZS 10,000/year
 *   - Private: TZS 10,000/year
 * 
 * Certificate Fee: TZS 0 (entered manually in payment modal)
 */
const CTM_CLUB_FEES = {
  government: {
    primary_secondary: {
      annual: 3000,
      certificate: 0, // ✅ Manual entry in payment modal
      total: 3000,
    },
    college_university: {
      annual: 10000,
      certificate: 0, // ✅ Manual entry in payment modal
      total: 10000,
    },
  },
  private: {
    primary_secondary: {
      annual: 10000,
      certificate: 0, // ✅ Manual entry in payment modal
      total: 10000,
    },
    college_university: {
      annual: 10000,
      certificate: 0, // ✅ Manual entry in payment modal
      total: 10000,
    },
  },
};

/**
 * Student Package Pricing
 * ✅ UPDATED: January 29, 2026 - CORRECT PRICING
 * 
 * CTM Club (Annual): 
 *   - Government: TZS 11,000/year
 *   - Private: TZS 15,000/year
 * 
 * Silver Package (Monthly): TZS 20,000/month
 * Gold Package (Monthly): TZS 40,000/month
 * Platinum Package (Monthly): TZS 80,000/month
 */
const STUDENT_PACKAGES = {
  normal: {
    registrationFee: 11000, // Government: 11k, Private: 15k (calculated dynamically)
    monthlyFee: null, // No monthly billing
    annualFee: 11000, // ✅ ANNUAL RENEWAL FEE (same as registration)
    billingCycle: 'annual', // ✅ Renews every 12 months
    description: 'CTM Club at School/University',
  },
  'ctm-club': {
    registrationFee: 11000, // Legacy alias for normal
    monthlyFee: null,
    annualFee: 11000,
    billingCycle: 'annual',
    description: 'CTM Club Membership',
  },
  silver: {
    registrationFee: 20000, // ✅ First month (no separate registration fee)
    monthlyFee: 20000, // ✅ CORRECT: TZS 20,000/month
    annualFee: null,
    billingCycle: 'monthly',
    description: 'Silver Package - Monthly Subscription',
  },
  gold: {
    registrationFee: 40000, // ✅ First month
    monthlyFee: 40000, // ✅ CORRECT: TZS 40,000/month
    annualFee: null,
    billingCycle: 'monthly',
    description: 'Gold Package - Monthly Subscription',
  },
  platinum: {
    registrationFee: 80000, // ✅ First month
    monthlyFee: 80000, // ✅ CORRECT: TZS 80,000/month
    annualFee: null,
    billingCycle: 'monthly',
    description: 'Platinum Package - Monthly Subscription',
  },
};

/**
 * Entrepreneur Package Pricing
 * ✅ UPDATED: January 29, 2026 - CORRECT PRICING
 * 
 * Silver Package:
 *   - Registration: TZS 30,000 (one-time)
 *   - Monthly: TZS 50,000
 * 
 * Gold Package:
 *   - Registration: TZS 100,000 (one-time)
 *   - Monthly: TZS 150,000
 * 
 * Platinum Package:
 *   - Registration: TZS 200,000 (one-time)
 *   - Monthly: TZS 300,000
 */
const ENTREPRENEUR_PACKAGES = {
  silver: {
    name: 'Silver Package',
    registrationFee: 30000, // ✅ CORRECT: One-time registration
    monthlyFee: 50000, // ✅ CORRECT: Monthly recurring fee
    totalFirstMonth: 80000, // Registration (30k) + first month (50k)
    description: 'Silver Package - Monthly Subscription',
  },
  gold: {
    name: 'Gold Package',
    registrationFee: 100000, // ✅ CORRECT: One-time registration
    monthlyFee: 150000, // ✅ CORRECT: Monthly recurring fee
    totalFirstMonth: 250000, // Registration (100k) + first month (150k)
    description: 'Gold Package - Monthly Subscription',
  },
  platinum: {
    name: 'Platinum Package',
    registrationFee: 200000, // ✅ CORRECT: One-time registration
    monthlyFee: 300000, // ✅ CORRECT: Monthly recurring fee
    totalFirstMonth: 500000, // Registration (200k) + first month (300k)
    description: 'Platinum Package - Monthly Subscription',
  },
};

// ==========================================
// REGISTRATION FEE FUNCTIONS
// ==========================================

/**
 * Get CTM Club fees based on institution type and education level
 * @param {string} institutionType - 'government' or 'private'
 * @param {string} educationLevel - 'primary_secondary' or 'college_university'
 * @returns {object} Fee breakdown
 */
function getCtmClubFees(institutionType = 'government', educationLevel = 'primary_secondary') {
  return CTM_CLUB_FEES[institutionType]?.[educationLevel] || CTM_CLUB_FEES.government.primary_secondary;
}

/**
 * Get required registration fee for a student
 * ✅ UPDATED: January 31, 2026 - NEW PRICING WITH EDUCATION LEVEL SUPPORT
 * 
 * CTM Club Pricing:
 * - Primary/Secondary (Government): TZS 3,000/year
 * - Primary/Secondary (Private): TZS 10,000/year
 * - College/University (Government): TZS 10,000/year
 * - College/University (Private): TZS 10,000/year
 * 
 * @param {string} registrationType - Student's registration type
 * @param {string} institutionType - Institution type (government or private)
 * @param {string} educationLevel - Education level (primary, secondary, college, university)
 * @returns {number} Required fee
 */
function getStudentRegistrationFee(registrationType, institutionType = 'government', educationLevel = null) {
  if (!registrationType) {
    // Default to CTM Club government primary/secondary pricing
    const isHigherEducation = educationLevel?.toLowerCase() === 'college' || educationLevel?.toLowerCase() === 'university';
    
    if (isHigherEducation) {
      return 10000; // Always 10k for colleges/universities
    }
    
    return institutionType === 'private' ? 10000 : 3000;
  }

  // Normalize the registration type
  const normalizedType = registrationType
    .toLowerCase()
    .replace('_registration', '')
    .replace('-', '_');

  // ✅ Handle CTM Club (normal) - variable pricing based on institution AND education level
  if (normalizedType === 'ctm_club' || normalizedType === 'normal') {
    // Check if college/university level
    const isHigherEducation = educationLevel?.toLowerCase() === 'college' || educationLevel?.toLowerCase() === 'university';
    
    // Colleges/Universities: Always TZS 10,000 (both government and private)
    if (isHigherEducation) {
      return 10000;
    }
    
    // Primary/Secondary: Government = TZS 3,000, Private = TZS 10,000
    return institutionType === 'private' ? 10000 : 3000;
  }

  // Handle student packages (fixed pricing)
  const packageData = STUDENT_PACKAGES[normalizedType];
  if (packageData) {
    return packageData.registrationFee;
  }

  // Default to CTM Club government primary/secondary pricing
  return 3000;
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
// ✅ MONTHLY BILLING FUNCTIONS
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
 * ✅ UPDATED: January 29, 2026 - CORRECT MONTHLY PRICING
 * @param {string} registrationType - 'silver', 'gold', or 'platinum'
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

  return null; // CTM Club (normal) is annual, not monthly
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

  const monthlyPackages = ['silver', 'gold', 'platinum'];
  const normalizedType = packageType.toLowerCase().replace('_registration', '');

  return monthlyPackages.includes(normalizedType);
}

// ==========================================
// ✅ ANNUAL BILLING FUNCTIONS
// ==========================================

/**
 * Get annual renewal fee for students
 * ✅ UPDATED: January 31, 2026 - NEW PRICING WITH EDUCATION LEVEL SUPPORT
 * ✅ CTM Club (normal) renews annually
 * 
 * CTM Club Pricing:
 * - Primary/Secondary (Government): TZS 3,000/year
 * - Primary/Secondary (Private): TZS 10,000/year
 * - College/University (Government): TZS 10,000/year
 * - College/University (Private): TZS 10,000/year
 * 
 * @param {string} registrationType - Student's registration type
 * @param {string} institutionType - Institution type (government or private)
 * @param {string} educationLevel - Education level (primary, secondary, college, university)
 * @returns {number|null} Annual fee or null if not annual billing
 */
function getStudentAnnualFee(registrationType, institutionType = 'government', educationLevel = null) {
  if (!registrationType) return null;

  const normalizedType = registrationType
    .toLowerCase()
    .replace('_registration', '')
    .replace('-', '_');

  const packageData = STUDENT_PACKAGES[normalizedType];

  // ✅ CTM Club packages have annual billing
  if (packageData && packageData.annualFee) {
    // Check if college/university level
    const isHigherEducation = educationLevel?.toLowerCase() === 'college' || educationLevel?.toLowerCase() === 'university';
    
    // Colleges/Universities: Always TZS 10,000 (both government and private)
    if (isHigherEducation) {
      return 10000;
    }
    
    // Primary/Secondary: Government = TZS 3,000, Private = TZS 10,000
    return institutionType === 'private' ? 10000 : 3000;
  }

  return null; // Silver/Gold/Platinum don't have annual billing (monthly instead)
}

/**
 * Get annual fee for any user type
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role (student, entrepreneur, nonstudent)
 * @param {string} institutionType - Institution type (for students)
 * @returns {number|null} Annual fee or null if not applicable
 */
function getAnnualFee(packageType, role, institutionType = 'government') {
  if (!packageType || !role) return null;

  if (role === 'student') {
    return getStudentAnnualFee(packageType, institutionType);
  }

  // Entrepreneurs don't have annual billing (monthly instead)
  return null;
}

/**
 * Check if a package has annual billing
 * ✅ CTM Club (normal) renews annually
 * @param {string} packageType - Package/registration type
 * @returns {boolean} True if annual billing applies
 */
function hasAnnualBilling(packageType) {
  if (!packageType) return false;

  const annualPackages = ['normal', 'ctm-club', 'ctm_club'];
  const normalizedType = packageType.toLowerCase().replace('_registration', '');

  return annualPackages.includes(normalizedType);
}

/**
 * Get billing cycle for a package
 * @param {string} packageType - Package/registration type
 * @returns {string} 'monthly', 'annual', or 'one-time'
 */
function getBillingCycle(packageType) {
  if (!packageType) return 'one-time';

  const normalizedType = packageType.toLowerCase().replace('_registration', '');

  // Check student packages first
  const studentPkg = STUDENT_PACKAGES[normalizedType];
  if (studentPkg && studentPkg.billingCycle) {
    return studentPkg.billingCycle;
  }

  // Check if it's a monthly package
  if (hasMonthlyBilling(packageType)) {
    return 'monthly';
  }

  // Check if it's an annual package
  if (hasAnnualBilling(packageType)) {
    return 'annual';
  }

  return 'one-time';
}

/**
 * Get recurring fee for a package (monthly or annual)
 * ✅ Used by billing service to generate invoices
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @param {string} institutionType - Institution type (for students)
 * @returns {number|null} Recurring fee amount or null
 */
function getRecurringFee(packageType, role, institutionType = 'government') {
  if (!packageType || !role) return null;

  // Check for monthly fee first
  const monthlyFee = getMonthlyFee(packageType, role);
  if (monthlyFee) return monthlyFee;

  // Check for annual fee
  const annualFee = getAnnualFee(packageType, role, institutionType);
  if (annualFee) return annualFee;

  return null; // No recurring fees
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
 * Get package description
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @returns {string} Package description
 */
function getPackageDescription(packageType, role) {
  if (!packageType) return 'No package selected';

  const normalizedType = packageType.toLowerCase().replace('_registration', '');

  if (role === 'student') {
    const pkg = STUDENT_PACKAGES[normalizedType];
    return pkg ? pkg.description : 'Student Package';
  } else if (role === 'entrepreneur' || role === 'nonstudent') {
    const pkg = ENTREPRENEUR_PACKAGES[normalizedType];
    return pkg ? pkg.description : 'Entrepreneur Package';
  }

  return 'Package';
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
    annualFee: getAnnualFee(packageType, role, institutionType),
    hasAnnualBilling: hasAnnualBilling(packageType),
    billingCycle: getBillingCycle(packageType),
    recurringFee: getRecurringFee(packageType, role, institutionType),
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

  // ✅ Monthly Billing Functions
  getEntrepreneurMonthlyFee,
  getStudentMonthlyFee,
  getMonthlyFee,
  hasMonthlyBilling,

  // ✅ Annual Billing Functions
  getStudentAnnualFee,
  getAnnualFee,
  hasAnnualBilling,
  getBillingCycle,
  getRecurringFee,

  // Utility Functions
  formatTZS,
  getPackageDetails,
  getPackageDescription,
};