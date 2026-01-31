// ============================================
// EDUCATION LEVEL HELPER - Derives education level from classLevel/gradeLevel
// ============================================

/**
 * Determines education level from classLevel/gradeLevel string
 * @param {string} classLevel - e.g., "Form 1", "Grade 7", "Year 1", "Bachelor"
 * @param {string} institutionType - "government" or "private"
 * @returns {string} - "primary", "secondary", "college", or "university"
 */
function getEducationLevelFromClass(classLevel, institutionType = "government") {
  if (!classLevel || typeof classLevel !== "string") {
    // Default fallback based on institution type
    return institutionType === "government" ? "secondary" : "secondary";
  }

  const classLower = classLevel.toLowerCase().trim();

  // ✅ PRIMARY LEVEL (Grades 1-7, Standard 1-7)
  const primaryPatterns = [
    /^grade [1-7]$/i,
    /^standard [1-7]$/i,
    /^std [1-7]$/i,
    /^darasa la [1-7]$/i,
    /^class [1-7]$/i,
  ];

  if (primaryPatterns.some((pattern) => pattern.test(classLower))) {
    return "primary";
  }

  // ✅ SECONDARY LEVEL (Forms 1-6, Grade 8-13, O-Level, A-Level)
  const secondaryPatterns = [
    /^form [1-6]$/i,
    /^grade (8|9|10|11|12|13)$/i,
    /^standard (8|9|10|11|12|13)$/i,
    /^o-?level$/i,
    /^a-?level$/i,
    /^ordinary level$/i,
    /^advanced level$/i,
  ];

  if (secondaryPatterns.some((pattern) => pattern.test(classLower))) {
    return "secondary";
  }

  // ✅ COLLEGE LEVEL (Certificate, Diploma, NTA Levels 4-6)
  const collegePatterns = [
    /certificate/i,
    /diploma/i,
    /^nta [4-6]$/i,
    /^level [4-6]$/i,
    /technical/i,
    /vocational/i,
  ];

  if (collegePatterns.some((pattern) => pattern.test(classLower))) {
    return "college";
  }

  // ✅ UNIVERSITY LEVEL (Bachelor, Master, PhD, Year 1-5)
  const universityPatterns = [
    /bachelor/i,
    /master/i,
    /phd/i,
    /doctorate/i,
    /^year [1-5]$/i,
    /^nta [7-9]$/i,
    /^level [7-9]$/i,
    /undergraduate/i,
    /postgraduate/i,
  ];

  if (universityPatterns.some((pattern) => pattern.test(classLower))) {
    return "university";
  }

  // ✅ DEFAULT FALLBACK
  // If none match, default to secondary (most common)
  console.warn(`⚠️  Unknown classLevel format: "${classLevel}" - defaulting to secondary`);
  return "secondary";
}

/**
 * Gets education level for a user object
 * @param {Object} user - User object with classLevel/gradeLevel
 * @param {string} user.classLevel - Primary class level field
 * @param {string} user.gradeLevel - Alternative grade level field
 * @param {string} user.institutionType - "government" or "private"
 * @returns {string} - "primary", "secondary", "college", or "university"
 */
function getUserEducationLevel(user) {
  if (!user) {
    console.warn("⚠️  getUserEducationLevel: No user provided - defaulting to secondary");
    return "secondary";
  }

  const classLevel = user.classLevel || user.gradeLevel;
  const institutionType = user.institutionType || "government";

  return getEducationLevelFromClass(classLevel, institutionType);
}

module.exports = {
  getEducationLevelFromClass,
  getUserEducationLevel,
};
