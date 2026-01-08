/**
 * ============================================
 * 📝 SECURITY LOGGING UTILITY
 * ============================================
 * Log security events for monitoring and auditing
 */

const fs = require("fs");
const path = require("path");

// Log directory
const LOG_DIR = path.join(__dirname, "../logs");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file paths
const SECURITY_LOG = path.join(LOG_DIR, "security.log");
const ERROR_LOG = path.join(LOG_DIR, "error.log");
const ACCESS_LOG = path.join(LOG_DIR, "access.log");

/**
 * Write to log file
 */
function writeToLog(filePath, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(filePath, logMessage, (err) => {
    if (err) console.error("Failed to write to log:", err);
  });
}

/**
 * Log security events
 */
function logSecurityEvent(event, details = {}) {
  const message = `🛡️ SECURITY: ${event} | ${JSON.stringify(details)}`;
  console.warn(message);
  writeToLog(SECURITY_LOG, message);
}

/**
 * Log errors
 */
function logError(error, context = {}) {
  const message = `❌ ERROR: ${error.message} | ${JSON.stringify(context)}`;
  console.error(message);
  writeToLog(ERROR_LOG, message);
}

/**
 * Log access (API requests)
 */
function logAccess(req) {
  const message = `${req.method} ${req.path} | IP: ${req.ip} | User: ${
    req.user?.phone || "Anonymous"
  }`;
  writeToLog(ACCESS_LOG, message);
}

/**
 * Access logging middleware
 */
function accessLogger(req, res, next) {
  // Log after response is sent
  res.on("finish", () => {
    logAccess(req);
  });

  next();
}

/**
 * Log suspicious activity
 */
function logSuspiciousActivity(type, req, details = {}) {
  logSecurityEvent(type, {
    ip: req.ip,
    path: req.path,
    method: req.method,
    user: req.user?.phone || "Anonymous",
    ...details,
  });
}

module.exports = {
  logSecurityEvent,
  logError,
  logAccess,
  accessLogger,
  logSuspiciousActivity,
};
