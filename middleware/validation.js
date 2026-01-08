/**
 * ============================================
 * ✅ INPUT VALIDATION MIDDLEWARE
 * ============================================
 * Validate all user inputs before processing
 */

const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose"); // ✅ ADDED

/**
 * Tanzania phone number validation regex
 * Supports: +255XXXXXXXXX, 0XXXXXXXXX, 255XXXXXXXXX
 */
const tanzaniaPhoneRegex = /^(\+255|0|255)[67]\d{8}$/;

/**
 * Normalize Tanzania phone number to +255 format
 */
function normalizeTanzaniaPhone(phone) {
  const cleaned = phone.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+255")) {
    return cleaned;
  } else if (cleaned.startsWith("0")) {
    return "+255" + cleaned.substring(1);
  } else if (cleaned.startsWith("255")) {
    return "+" + cleaned;
  }

  return cleaned;
}

/**
 * Custom validator for Tanzania phone numbers
 */
const isTanzaniaPhone = (phone) => {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return tanzaniaPhoneRegex.test(cleaned);
};

/**
 * Handle validation errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((err) => err.msg);
    console.warn(`⚠️ Validation failed: ${errorMessages.join(", ")}`);

    return res.status(400).json({
      success: false,
      error: errorMessages[0], // Return first error
      validation: errors.array(), // All validation errors
    });
  }

  next();
}

/**
 * ============================================
 * ✅ VALIDATE MONGODB OBJECTID
 * ============================================
 * @param {string} paramName - The name of the route parameter to validate
 * @returns {function} Express middleware function
 */
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${paramName}. Please provide a valid ID.`,
      });
    }

    next();
  };
};

/**
 * Registration validation rules
 */
const validateRegistration = [
  // Phone number
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .custom(isTanzaniaPhone)
    .withMessage(
      "Please enter a valid Tanzanian phone number (e.g., +255712345678)"
    )
    .customSanitizer(normalizeTanzaniaPhone),

  // Names
  body("names.first")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be 2-50 characters")
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage(
      "First name can only contain letters, spaces, hyphens, and apostrophes"
    ),

  body("names.middle")
    .trim()
    .notEmpty()
    .withMessage("Middle name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Middle name must be 2-50 characters")
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage(
      "Middle name can only contain letters, spaces, hyphens, and apostrophes"
    ),

  body("names.last")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be 2-50 characters")
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage(
      "Last name can only contain letters, spaces, hyphens, and apostrophes"
    ),

  // Email (optional but must be valid if provided)
  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address")
    .normalizeEmail(),

  // Gender
  body("gender")
    .notEmpty()
    .withMessage("Gender is required")
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender"),

  // Role
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(["student", "teacher", "entrepreneur", "headmaster", "staff"])
    .withMessage("Invalid role"),

  handleValidationErrors,
];

/**
 * Login validation rules
 */
const validateLogin = [
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .custom(isTanzaniaPhone)
    .withMessage("Please enter a valid Tanzanian phone number")
    .customSanitizer(normalizeTanzaniaPhone),

  body("password").notEmpty().withMessage("Password is required"),

  handleValidationErrors,
];

/**
 * Student-specific validation
 */
const validateStudentData = [
  body("student.class_level").notEmpty().withMessage("Class level is required"),

  body("student.institution_type")
    .notEmpty()
    .withMessage("Institution type is required")
    .isIn(["government", "private"])
    .withMessage("Invalid institution type"),

  body("student.registration_type")
    .optional()
    .isIn(["normal", "silver", "gold", "platinum"])
    .withMessage("Invalid registration type"),

  handleValidationErrors,
];

/**
 * Teacher-specific validation
 */
const validateTeacherData = [
  body("teacher.subjects")
    .isArray({ min: 1 })
    .withMessage("Please select at least one subject"),

  body("teacher.institution_type")
    .notEmpty()
    .withMessage("Institution type is required")
    .isIn(["government", "private"])
    .withMessage("Invalid institution type"),

  body("teacher.teaching_level")
    .notEmpty()
    .withMessage("Teaching level is required")
    .isIn(["primary", "secondary", "college", "university"])
    .withMessage("Invalid teaching level"),

  handleValidationErrors,
];

/**
 * Entrepreneur-specific validation
 */
const validateEntrepreneurData = [
  body("entrepreneur.business_name")
    .trim()
    .notEmpty()
    .withMessage("Business name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Business name must be 2-100 characters"),

  body("entrepreneur.business_status")
    .notEmpty()
    .withMessage("Business status is required")
    .isIn(["registered", "not_registered"])
    .withMessage("Invalid business status"),

  body("entrepreneur.business_website")
    .optional({ checkFalsy: true })
    .trim()
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Please enter a valid URL"),

  body("entrepreneur.business_categories")
    .isArray({ min: 1 })
    .withMessage("Please select at least one business category"),

  handleValidationErrors,
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateStudentData,
  validateTeacherData,
  validateEntrepreneurData,
  handleValidationErrors,
  normalizeTanzaniaPhone,
  isTanzaniaPhone,
  validateObjectId, // ✅ ADDED TO EXPORTS
};
