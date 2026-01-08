/**
 * ============================================
 * ❌ SECURE ERROR HANDLING MIDDLEWARE
 * ============================================
 * Handle errors securely without leaking sensitive information
 */

/**
 * Error logger
 */
function logError(err, req) {
  console.error("❌ Error occurred:");
  console.error("Path:", req.path);
  console.error("Method:", req.method);
  console.error("IP:", req.ip);
  console.error("User:", req.user?.phone || "Anonymous");
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);
}

/**
 * Development error response (detailed)
 */
function sendDevError(err, res) {
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message,
    stack: err.stack,
    details: err,
  });
}

/**
 * Production error response (secure, no sensitive info)
 */
function sendProdError(err, res) {
  // Operational errors: send message to client
  if (err.isOperational) {
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  } else {
    // Programming errors: don't leak details
    console.error("🚨 PROGRAMMING ERROR:", err);

    res.status(500).json({
      success: false,
      error: "Something went wrong. Please try again later.",
    });
  }
}

/**
 * Handle specific error types
 */
function handleError(err, req, res, next) {
  // Set default status code
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Log error
  logError(err, req);

  // MongoDB errors
  if (err.name === "CastError") {
    err.message = "Invalid ID format";
    err.statusCode = 400;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    err.message = `${field} already exists`;
    err.statusCode = 400;
  }

  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((el) => el.message);
    err.message = `Invalid input: ${errors.join(". ")}`;
    err.statusCode = 400;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    err.message = "Invalid token. Please log in again.";
    err.statusCode = 401;
  }

  if (err.name === "TokenExpiredError") {
    err.message = "Your session has expired. Please log in again.";
    err.statusCode = 401;
  }

  // Send error response
  if (process.env.NODE_ENV === "development") {
    sendDevError(err, res);
  } else {
    sendProdError(err, res);
  }
}

/**
 * Catch async errors
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Create operational error
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  const err = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(err);
}

/**
 * Apply error handling middleware
 */
function applyErrorHandlers(app) {
  console.log("❌ Applying error handlers...");

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(handleError);

  console.log("✅ Error handlers applied");
}

module.exports = {
  applyErrorHandlers,
  handleError,
  catchAsync,
  AppError,
  notFoundHandler,
};
