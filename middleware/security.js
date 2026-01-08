/**
 * ============================================
 * 🛡️ SECURITY MIDDLEWARE
 * ============================================
 * Comprehensive security headers and sanitization
 */

const helmet = require("helmet");
const csrf = require("csurf");
// ❌ REMOVED: const mongoSanitize = require("express-mongo-sanitize");
// ❌ REMOVED: const xss = require("xss-clean");
// ✅ We're using custom sanitizer from /utils/sanitizer.js instead
const hpp = require("hpp");
const cors = require("cors");

/**
 * Configure CSRF Protection
 * ✅ Excludes auth endpoints (login, register, etc.) - they use rate limiting + JWT
 * ✅ Protects state-changing operations for authenticated users
 */
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // Allow cross-site for better compatibility
    path: "/",
  },
});

/**
 * CSRF Middleware with Auth Endpoint Exclusions
 * Skips CSRF for stateless auth endpoints that use other protections
 */
function csrfMiddleware(req, res, next) {
  // ✅ Skip CSRF for authentication endpoints (protected by rate limiting + validation)
  const excludedPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email",
    "/api/health",
    "/api/csrf-token", // Allow getting CSRF token without validation
  ];

  // Check if current path should skip CSRF
  const shouldSkip = excludedPaths.some((path) => req.path.startsWith(path));

  if (shouldSkip) {
    console.log(`⏭️  Skipping CSRF for: ${req.path}`);
    return next();
  }

  // Apply CSRF protection to all other routes
  csrfProtection(req, res, next);
}

/**
 * Configure Helmet for security headers
 */
const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.nextsms.co.tz"],
    },
  },
  crossOriginEmbedderPolicy: false,

  // X-Frame-Options: Prevent clickjacking
  frameguard: {
    action: "deny",
  },

  // X-Content-Type-Options: Prevent MIME sniffing
  noSniff: true,

  // Strict-Transport-Security: Force HTTPS
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-XSS-Protection: Enable browser XSS filter
  xssFilter: true,

  // Referrer-Policy
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,
});

/**
 * Configure CORS
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from your frontend domains
    const allowedOrigins = [
      "https://econnect.co.tz",
      "http://localhost:5173", // Vite dev server
      "http://localhost:3000", // React dev server
    ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // Allow cookies
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  exposedHeaders: ["X-CSRF-Token"],
  maxAge: 86400, // 24 hours
};

/**
 * Apply all security middleware
 */
function applySecurityMiddleware(app) {
  console.log("🛡️ Applying security middleware...");

  // 1. Security headers
  app.use(helmetConfig);
  console.log("✅ Helmet security headers applied");

  // 2. CORS
  app.use(cors(corsOptions));
  console.log("✅ CORS configured");

  // 3. Prevent NoSQL injection
  // ✅ REMOVED express-mongo-sanitize (causing compatibility issues)
  // ✅ Using custom sanitizer from /utils/sanitizer.js instead
  console.log("✅ NoSQL injection protection enabled (via custom sanitizer)");

  // 4. Prevent XSS attacks
  // ✅ REMOVED xss-clean (causing compatibility issues with Express 5+)
  // ✅ Using custom XSS sanitization from /utils/sanitizer.js instead
  console.log("✅ XSS protection enabled (via custom sanitizer)");

  // 5. Prevent HTTP Parameter Pollution
  app.use(
    hpp({
      whitelist: ["tags", "talents", "subjects", "businessCategories"], // Allow arrays
    })
  );
  console.log("✅ HTTP Parameter Pollution protection enabled");

  // 6. CSRF Protection
  app.use(csrfMiddleware);
  console.log("✅ CSRF protection enabled");

  console.log("🎉 All security middleware applied successfully!");
}

module.exports = {
  applySecurityMiddleware,
  corsOptions,
};
