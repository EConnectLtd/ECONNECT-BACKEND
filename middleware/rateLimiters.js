/**
 * ============================================
 * ⏱️ RATE LIMITING MIDDLEWARE
 * ============================================
 * Prevent abuse, brute force, and DDoS attacks
 */

const rateLimit = require("express-rate-limit");

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after 15 minutes",
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      success: false,
      error: "Too many requests, please try again later",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

/**
 * Strict limiter for authentication endpoints
 * 5 login attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 login attempts
  skipSuccessfulRequests: true, // Don't count successful logins
  message: {
    success: false,
    error: "Too many login attempts, please try again after 15 minutes",
  },
  handler: (req, res) => {
    console.warn(`🚨 Multiple failed login attempts from IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: "Too many login attempts. Account temporarily locked.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

/**
 * Limiter for registration endpoints
 * 3 registrations per hour per IP
 */
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit to 3 registrations per hour
  message: {
    success: false,
    error: "Too many registration attempts, please try again after 1 hour",
  },
  handler: (req, res) => {
    console.warn(`⚠️ Suspicious registration activity from IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: "Registration limit exceeded. Please try again later.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

/**
 * Limiter for password reset
 * 3 password resets per hour per IP
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: "Too many password reset attempts",
  },
});

/**
 * Strict limiter for SMS sending
 * 10 SMS per hour per IP (prevent SMS spam)
 */
const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    error: "SMS limit exceeded. Please try again later.",
  },
  handler: (req, res) => {
    console.warn(`📱 SMS rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: "Too many SMS requests. Please try again after 1 hour.",
    });
  },
});

/**
 * Apply rate limiters to Express app
 */
function applyRateLimiters(app) {
  console.log("⏱️ Applying rate limiters...");

  // General API rate limiter (all routes)
  app.use("/api/", generalLimiter);
  console.log("✅ General rate limiter applied (100 req/15min)");

  // Authentication rate limiter
  app.use("/api/auth/login", authLimiter);
  console.log("✅ Auth rate limiter applied (5 attempts/15min)");

  // Registration rate limiter
  app.use("/api/auth/register", registrationLimiter);
  console.log("✅ Registration rate limiter applied (3 reg/hour)");

  // Password reset limiter
  app.use("/api/auth/reset-password", passwordResetLimiter);
  app.use("/api/auth/forgot-password", passwordResetLimiter);
  console.log("✅ Password reset limiter applied (3 resets/hour)");

  console.log("🎉 All rate limiters applied successfully!");
}

module.exports = {
  applyRateLimiters,
  generalLimiter,
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  smsLimiter,
};
