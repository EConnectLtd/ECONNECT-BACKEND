/**
 * ============================================
 * 🔐 CSRF PROTECTION MIDDLEWARE
 * ============================================
 * Verify CSRF tokens from frontend
 */

const crypto = require("crypto");

// Store valid tokens (in production, use Redis or database)
const validTokens = new Map();

// Token expiry time (24 hours)
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Generate a new CSRF token
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Store a CSRF token with expiry
 */
function storeCSRFToken(token) {
  const expiry = Date.now() + TOKEN_EXPIRY;
  validTokens.set(token, expiry);

  // Clean up expired tokens periodically
  cleanupExpiredTokens();
}

/**
 * Validate a CSRF token
 */
function validateCSRFToken(token) {
  if (!token) return false;

  const expiry = validTokens.get(token);
  if (!expiry) return false;

  // Check if token is expired
  if (Date.now() > expiry) {
    validTokens.delete(token);
    return false;
  }

  return true;
}

/**
 * Clean up expired tokens
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, expiry] of validTokens.entries()) {
    if (now > expiry) {
      validTokens.delete(token);
    }
  }
}

/**
 * CSRF protection middleware
 * Verifies CSRF token for mutating requests (POST, PUT, PATCH, DELETE)
 */
function csrfProtection(req, res, next) {
  // Skip CSRF check for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Get CSRF token from header
  const csrfToken = req.headers["x-csrf-token"];

  // Validate token
  if (!validateCSRFToken(csrfToken)) {
    console.warn(`🚨 Invalid CSRF token from IP: ${req.ip} on ${req.path}`);
    return res.status(403).json({
      success: false,
      error: "Invalid or expired CSRF token. Please refresh the page.",
    });
  }

  // Token is valid, proceed
  next();
}

/**
 * Endpoint to get a new CSRF token
 */
function getCsrfToken(req, res) {
  const token = generateCSRFToken();
  storeCSRFToken(token);

  res.json({
    success: true,
    csrfToken: token,
  });
}

/**
 * Apply CSRF protection to app
 */
function applyCSRFProtection(app) {
  console.log("🔐 Applying CSRF protection...");

  // Endpoint to get CSRF token
  app.get("/api/auth/csrf-token", getCsrfToken);

  // Apply CSRF verification to all mutating requests
  app.use("/api/", csrfProtection);

  console.log("✅ CSRF protection enabled");
}

module.exports = {
  applyCSRFProtection,
  csrfProtection,
  generateCSRFToken,
  validateCSRFToken,
  getCsrfToken,
};
