/**
 * ============================================
 * 🧹 INPUT SANITIZATION UTILITIES
 * ============================================
 * Clean user input to prevent XSS and injection attacks
 */

/**
 * Sanitize string input
 */
function sanitizeString(input) {
  if (typeof input !== "string") return input;

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, "");

  // Remove script tags
  sanitized = sanitized.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitize object recursively
 */
function sanitizeObject(obj) {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] =
        typeof obj[key] === "string"
          ? sanitizeString(obj[key])
          : sanitizeObject(obj[key]);
    }
  }

  return sanitized;
}

/**
 * Sanitize request body middleware
 */
function sanitizeRequestBody(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  next();
}

/**
 * Sanitize query parameters middleware
 */
function sanitizeQueryParams(req, res, next) {
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
}

/**
 * Apply sanitization middleware
 */
function applySanitization(app) {
  console.log("🧹 Applying input sanitization...");

  app.use(sanitizeRequestBody);
  app.use(sanitizeQueryParams);

  console.log("✅ Input sanitization enabled");
}

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeRequestBody,
  sanitizeQueryParams,
  applySanitization,
};
