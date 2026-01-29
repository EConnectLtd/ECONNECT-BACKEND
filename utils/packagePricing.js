// ==========================================
// PACKAGE PRICING - BACKEND VERSION
// ==========================================
// ✅ Centralized pricing for students and entrepreneurs
// ✅ UPDATED: 2026-01-29 - Correct pricing from requirements
// ✅ Single source of truth for ALL fees (registration + monthly)
// ==========================================

/**
 * CTM Club Fees (Variable based on institution type)
 * ✅ UPDATED: January 29, 2026 - CORRECT PRICING
 * Government: Annual 3,000 + Certificate 8,000 = Total 11,000
 * Private: Annual 10,000 + Certificate 5,000 = Total 15,000
 */
const CTM_CLUB_FEES = {
  government: {
    annual: 3000,
    certificate: 8000,
    total: 11000,
  },
  private: {
    annual: 10000,
    certificate: 5000,
    total: 15000,
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
    billingCycle: "annual", // ✅ Renews every 12 months
    description: "CTM Club at School/University",
  },
  "ctm-club": {
    registrationFee: 11000, // Legacy alias for normal
    monthlyFee: null,
    annualFee: 11000,
    billingCycle: "annual",
    description: "CTM Club Membership",
  },
  silver: {
    registrationFee: 20000, // ✅ First month (no separate registration fee)
    monthlyFee: 20000, // ✅ CORRECT: TZS 20,000/month
    annualFee: null,
    billingCycle: "monthly",
    description: "Silver Package - Monthly Subscription",
  },
  gold: {
    registrationFee: 40000, // ✅ First month
    monthlyFee: 40000, // ✅ CORRECT: TZS 40,000/month
    annualFee: null,
    billingCycle: "monthly",
    description: "Gold Package - Monthly Subscription",
  },
  platinum: {
    registrationFee: 80000, // ✅ First month
    monthlyFee: 80000, // ✅ CORRECT: TZS 80,000/month
    annualFee: null,
    billingCycle: "monthly",
    description: "Platinum Package - Monthly Subscription",
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
    name: "Silver Package",
    registrationFee: 30000, // ✅ CORRECT: One-time registration
    monthlyFee: 50000, // ✅ CORRECT: Monthly recurring fee
    totalFirstMonth: 80000, // Registration (30k) + first month (50k)
    description: "Silver Package - Monthly Subscription",
  },
  gold: {
    name: "Gold Package",
    registrationFee: 100000, // ✅ CORRECT: One-time registration
    monthlyFee: 150000, // ✅ CORRECT: Monthly recurring fee
    totalFirstMonth: 250000, // Registration (100k) + first month (150k)
    description: "Gold Package - Monthly Subscription",
  },
  platinum: {
    name: "Platinum Package",
    registrationFee: 200000, // ✅ CORRECT: One-time registration
    monthlyFee: 300000, // ✅ CORRECT: Monthly recurring fee
    totalFirstMonth: 500000, // Registration (200k) + first month (300k)
    description: "Platinum Package - Monthly Subscription",
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
function getCtmClubFees(institutionType = "government") {
  return CTM_CLUB_FEES[institutionType] || CTM_CLUB_FEES.government;
}

/**
 * Get required registration fee for a student
 * ✅ UPDATED: January 29, 2026 - CORRECT PRICING
 * @param {string} registrationType - Student's registration type
 * @param {string} institutionType - Institution type (government or private)
 * @returns {number} Required fee
 */
function getStudentRegistrationFee(
  registrationType,
  institutionType = "government",
) {
  if (!registrationType) {
    // Default to CTM Club government pricing
    return institutionType === "private" ? 15000 : 11000;
  }

  // Normalize the registration type
  const normalizedType = registrationType
    .toLowerCase()
    .replace("_registration", "")
    .replace("-", "_");

  // Handle CTM Club (normal) - variable pricing based on institution
  if (normalizedType === "ctm_club" || normalizedType === "normal") {
    return institutionType === "private" ? 15000 : 11000;
  }

  // Handle student packages (fixed pricing)
  const packageData = STUDENT_PACKAGES[normalizedType];
  if (packageData) {
    return packageData.registrationFee;
  }

  // Default to CTM Club government pricing
  return institutionType === "private" ? 15000 : 11000;
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
    .replace("_registration", "")
    .replace("-", "_");

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

  if (role === "student") {
    return getStudentMonthlyFee(packageType);
  } else if (role === "entrepreneur" || role === "nonstudent") {
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

  const monthlyPackages = ["silver", "gold", "platinum"];
  const normalizedType = packageType.toLowerCase().replace("_registration", "");

  return monthlyPackages.includes(normalizedType);
}

// ==========================================
// ✅ ANNUAL BILLING FUNCTIONS
// ==========================================

/**
 * Get annual renewal fee for students
 * ✅ CTM Club (normal) renews annually
 * @param {string} registrationType - Student's registration type
 * @param {string} institutionType - Institution type (government or private)
 * @returns {number|null} Annual fee or null if not annual billing
 */
function getStudentAnnualFee(registrationType, institutionType = "government") {
  if (!registrationType) return null;

  const normalizedType = registrationType
    .toLowerCase()
    .replace("_registration", "")
    .replace("-", "_");

  const packageData = STUDENT_PACKAGES[normalizedType];

  // CTM Club packages have annual billing
  if (packageData && packageData.annualFee) {
    // Return based on institution type
    return institutionType === "private" ? 15000 : 11000;
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
function getAnnualFee(packageType, role, institutionType = "government") {
  if (!packageType || !role) return null;

  if (role === "student") {
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

  const annualPackages = ["normal", "ctm-club", "ctm_club"];
  const normalizedType = packageType.toLowerCase().replace("_registration", "");

  return annualPackages.includes(normalizedType);
}

/**
 * Get billing cycle for a package
 * @param {string} packageType - Package/registration type
 * @returns {string} 'monthly', 'annual', or 'one-time'
 */
function getBillingCycle(packageType) {
  if (!packageType) return "one-time";

  const normalizedType = packageType.toLowerCase().replace("_registration", "");

  // Check student packages first
  const studentPkg = STUDENT_PACKAGES[normalizedType];
  if (studentPkg && studentPkg.billingCycle) {
    return studentPkg.billingCycle;
  }

  // Check if it's a monthly package
  if (hasMonthlyBilling(packageType)) {
    return "monthly";
  }

  // Check if it's an annual package
  if (hasAnnualBilling(packageType)) {
    return "annual";
  }

  return "one-time";
}

/**
 * Get recurring fee for a package (monthly or annual)
 * ✅ Used by billing service to generate invoices
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @param {string} institutionType - Institution type (for students)
 * @returns {number|null} Recurring fee amount or null
 */
function getRecurringFee(packageType, role, institutionType = "government") {
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
function getRequiredTotal(
  role,
  registrationType,
  institutionType = "government",
) {
  if (role === "entrepreneur" || role === "nonstudent") {
    // Entrepreneurs: registration fee only (monthly fees are separate)
    return getEntrepreneurRegistrationFee(registrationType, false);
  } else if (role === "student") {
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
  if (!packageType) return "No package selected";

  const normalizedType = packageType.toLowerCase().replace("_registration", "");

  if (role === "student") {
    const pkg = STUDENT_PACKAGES[normalizedType];
    return pkg ? pkg.description : "Student Package";
  } else if (role === "entrepreneur" || role === "nonstudent") {
    const pkg = ENTREPRENEUR_PACKAGES[normalizedType];
    return pkg ? pkg.description : "Entrepreneur Package";
  }

  return "Package";
}

/**
 * Get all package details for a user
 * ✅ Comprehensive package information
 * @param {string} packageType - Package/registration type
 * @param {string} role - User role
 * @param {string} institutionType - Institution type (for students)
 * @returns {object} Complete package details
 */
function getPackageDetails(packageType, role, institutionType = "government") {
  const normalizedType = packageType
    ? packageType.toLowerCase().replace("_registration", "")
    : "normal";

  return {
    packageType: normalizedType,
    role,
    registrationFee:
      role === "student"
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
