const dotenv = require("dotenv");
// Load environment variables
dotenv.config();

const express = require("express");
const mongoose = require("mongoose");

// Import security middleware
const { applySecurityMiddleware } = require("./middleware/security");
const {
  applyRateLimiters,
  generalLimiter,
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  smsLimiter,
} = require("./middleware/rateLimiters"); // ✅ Note: "rateLimiters" (plural)
const { applyErrorHandlers } = require("./middleware/errorHandler");
const { applySanitization } = require("./utils/sanitizer");
const { validateObjectId } = require("./middleware/validation");
const { accessLogger } = require("./utils/logger");
const {
  formatStatusCounts,
  isValidAccountStatus,
  isValidPaymentStatus,
  getStatusLabel,
  shouldAutoActivate,
  calculatePaymentStatus,
} = require("./utils/statusHelpers");
const {
  getStudentRegistrationFee,
  getEntrepreneurPackage,
  getEntrepreneurRegistrationFee,
  getRequiredTotal,
  ENTREPRENEUR_PACKAGES,
  STUDENT_PACKAGES,
  getMonthlyFee,
  getEntrepreneurMonthlyFee,
  getStudentMonthlyFee,
  hasMonthlyBilling,

  // ✅ ADD THESE NEW IMPORTS
  getStudentAnnualFee,
  getAnnualFee,
  hasAnnualBilling,
  getBillingCycle,
  getRecurringFee,

  getPackageDescription,
  getPackageDetails,
} = require("./utils/packagePricing");
const jobRetryService = require("./services/jobRetryService");
const monthlyBillingService = require("./services/monthlyBillingService");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult, param, query } = require("express-validator");
const compression = require("compression");
const cron = require("node-cron");

const smsService = require("./services/smsService");

// Initialize Express app
const app = express();
const server = http.createServer(app);
app.set("trust proxy", 1); // Trust only the first proxy (DigitalOcean LB)
// ============================================
// SOCKET.IO CONFIGURATION
// ============================================
const io = socketIO(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "https://econnect.co.tz",
          "https://www.econnect.co.tz",
        ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  },
});

app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      // Prevent billion laughs attack
      if (buf.length > 10 * 1024 * 1024) {
        throw new Error("Request entity too large");
      }
    },
  }),
);

// ============================================
// ERROR SANITIZATION HELPER
// ============================================
function sanitizeError(error) {
  if (process.env.NODE_ENV === "production") {
    return { message: error.message };
  }
  return {
    message: error.message,
    stack: error.stack,
    ...(error.code && { code: error.code }),
  };
}

// ============================================
// ✅ INVOICE STATUS VALIDATION HELPER
// ============================================

/**
 * Valid invoice statuses in the system
 * @constant {string[]}
 */
const VALID_INVOICE_STATUSES = [
  "pending", // Invoice created, payment not yet received
  "verification", // Payment proof submitted, awaiting admin verification
  "paid", // Payment verified and completed
  "partial_paid", // Partial payment received
  "overdue", // Payment past due date
  "cancelled", // Invoice cancelled by admin
];

/**
 * Validates if an invoice status is valid
 * @param {string} status - Status to validate
 * @returns {boolean}
 */
function isValidInvoiceStatus(status) {
  return VALID_INVOICE_STATUSES.includes(status);
}

/**
 * Get invoice status display name
 * @param {string} status - Status code
 * @returns {string}
 */
function getInvoiceStatusDisplay(status) {
  const statusMap = {
    pending: "Pending Payment",
    verification: "Under Verification",
    paid: "Paid",
    partial_paid: "Partially Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
  };
  return statusMap[status] || status;
}

console.log("✅ Invoice status helpers loaded");

// ============================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================

// Ensure upload directories exist
const uploadDirs = [
  "uploads/avatars",
  "uploads/covers",
  "uploads/pdfs",
  "uploads/certificates",
  "uploads/logos",
  "uploads/documents",
  "uploads/images",
  "uploads/payment-proofs",
];

uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    } catch (error) {
      console.error(`❌ Failed to create directory ${dir}:`, error.message);
    }
  }
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = "uploads/documents";

    if (file.fieldname === "avatar") uploadPath = "uploads/avatars";
    else if (file.fieldname === "cover") uploadPath = "uploads/covers";
    else if (file.fieldname === "pdf") uploadPath = "uploads/pdfs";
    else if (file.fieldname === "certificate")
      uploadPath = "uploads/certificates";
    else if (file.fieldname === "logo") uploadPath = "uploads/logos";
    else if (file.fieldname === "image") uploadPath = "uploads/images";
    else if (file.fieldname === "paymentProof")
      uploadPath = "uploads/payment-proofs";

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + crypto.randomInt(100000, 999999);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter for validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, DOCX are allowed.",
      ),
    );
  }
};

// Configure multer upload
const upload = multer({
  storage: storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 }, // 10MB default
  fileFilter: fileFilter,
});

// ============================================
// MIDDLEWARE
// ============================================

// ============================================
// 🛡️ SECURITY MIDDLEWARE (APPLY FIRST!)
// ============================================

console.log("\n🛡️ ========================================");
console.log("🛡️  APPLYING SECURITY MIDDLEWARE");
console.log("🛡️ ========================================\n");

// 1. Parse JSON (with size limit to prevent payload attacks)

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
console.log("✅ JSON parser configured (10mb limit)");

// 2. Access logging
app.use(accessLogger);
console.log("✅ Access logging enabled");

// 3. Security headers (Helmet)
applySecurityMiddleware(app);

// 4. Rate limiting
applyRateLimiters(app);

// 5. Input sanitization
applySanitization(app);

console.log("\n🎉 All security middleware applied!\n");

// Force HTTPS in production
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      res.redirect(`https://${req.header("host")}${req.url}`);
    } else {
      next();
    }
  });
}

// ============================================
// ADDITIONAL MIDDLEWARE
// ============================================

// Response Compression (Gzip) - Reduces response size by 70-90%
app.use(
  compression({
    level: 6,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);
console.log("✅ Compression middleware enabled");

// CORS Configuration (after security middleware)
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "https://econnectz.netlify.app",
          "https://econnect.co.tz",
          "https://www.econnect.co.tz",
        ],
    credentials: true,
  }),
);
console.log("✅ CORS configured");

// ============================================
// ✅ Security sanitization is now handled by:
// - /utils/sanitizer.js (input sanitization)
// - /middleware/security.js (helmet, CORS, etc.)
// ============================================

// Static Files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE CONNECTION
// ============================================
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";
const PORT = process.env.PORT || 4000;
const HOST = "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from environment variables");
}

// ✅ Fixed (Mongoose 6+) - Optimized Connection Pooling
mongoose
  .connect(MONGODB_URI, {
    // Connection timeout settings
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    // ✅ Connection pool for concurrent users (FIXED)
    maxPoolSize: 50, // Increased from 10 to 50
    minPoolSize: 10, // Increased from 2 to 10
    maxIdleTimeMS: 30000,
    // ✅ No keepAlive needed - Mongoose handles it automatically
  })
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Pool Size: 50 connections (supports concurrent users)`);
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    console.error("   Retrying in 5 seconds...");

    setTimeout(() => {
      mongoose.connect(MONGODB_URI).catch((e) => {
        console.error("❌ MongoDB Retry Failed:", e.message);
        process.exit(1);
      });
    }, 5000);
  }); // ✅ ADDED THIS CLOSING BRACE

// Monitor connection pool
mongoose.connection.on("connected", () => {
  console.log("✅ Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ Mongoose disconnected");
});

// Log pool stats every 5 minutes
setInterval(
  () => {
    const pool = mongoose.connection.db?.serverConfig?.s?.pool;
    if (pool) {
      console.log(
        `📊 DB Pool Stats: Available: ${pool.availableConnections}, In Use: ${pool.inUseConnections}`,
      );
    }
  },
  5 * 60 * 1000,
);

const publicRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
});

// ============================================================================
// PASSWORD AUTO-GENERATION HELPER
// ============================================================================

/**
 * Generate a secure 6-character alphanumeric password
 * @returns {string} A random 6-character password
 */
function generateRandomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = 8; // Increase to 8
  let password = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    password += chars[randomIndex];
  }

  return password;
}

// ============================================
// MONGODB SCHEMAS
// ============================================

// ============================================
// 🆕 PHASE 2: USER SCHEMA WITH NEW STATUS SYSTEM
// ============================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: [
      "student",
      "entrepreneur",
      "teacher",
      "headmaster",
      "staff",
      "district_official",
      "regional_official",
      "national_official",
      "tamisemi",
      "super_admin",
      "nonstudent",
    ],
    required: true,
  },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  phoneNumber: { type: String, unique: true, sparse: true, trim: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  regionName: { type: String, trim: true },
  districtName: { type: String, trim: true },
  wardName: { type: String, trim: true },

  // ============================================
  // 🆕 NEW STATUS SYSTEM (PHASE 2)
  // ============================================
  accountStatus: {
    type: String,
    enum: ["active", "inactive", "suspended"],
    default: "inactive",
    required: true,
    index: true,
  },

  paymentStatus: {
    type: String,
    enum: ["paid", "partial_paid", "no_payment", "overdue"],
    default: "no_payment",
    required: true,
    index: true,
  },

  // Billing tracking fields
  last_monthly_invoice_date: { type: Date },
  last_annual_invoice_date: { type: Date },
  next_billing_date: { type: Date },

  // ============================================
  // OLD FIELDS (KEPT FOR BACKWARD COMPATIBILITY)
  // ============================================
  isActive: { type: Boolean, default: false }, // Synced with accountStatus
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },

  profileImage: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date,
  dateOfBirth: Date,
  gender: { type: String, enum: ["male", "female", "other"] },
  address: String,
  emergencyContact: String,
  guardianName: String,
  guardianPhone: String,
  guardianRelationship: {
    type: String,
    enum: ["father", "mother", "guardian", "sibling", "other"],
  },
  course: String,
  nationalId: String,

  // Student-specific fields
  studentId: String,
  gradeLevel: String,
  enrollmentDate: Date,

  // Teacher-specific fields
  employeeId: String,
  subjects: [String],
  otherSubjects: String,

  // Business/Entrepreneur fields (biz object for backward compatibility)
  biz: {
    categories: [String],
    business_name: String,
    revenue: Number,
    description: String,
  },

  // Entrepreneur-specific fields
  businessName: String,
  businessType: String,
  businessStatus: String,
  businessWebsite: String,
  businessCategories: [String],
  businessRegistrationNumber: String,
  tinNumber: String,
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    sparse: true,
  },

  // Staff-specific fields
  staffPosition: String,
  department: String,
  salary: Number,
  hireDate: Date,

  // Guardian fields
  guardianEmail: String,
  guardianOccupation: String,
  guardianNationalId: String,

  // Parent/Guardian location fields
  parentRegionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  parentDistrictId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  parentWardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  parentAddress: String,
  parentLocation: {
    regionName: String,
    districtName: String,
    wardName: String,
  },

  // Student institution fields
  institutionType: { type: String, enum: ["government", "private"] },
  classLevel: String,

  registration_type: {
    type: String,
    enum: ["ctm-club", "silver", "gold", "platinum"],
    default: "ctm-club",
  },

  registrationType: {
    type: String,
    enum: ["ctm-club", "silver", "gold", "platinum"],
  },
  registration_date: Date,
  next_billing_date: Date,
  is_ctm_student: { type: Boolean, default: true },

  payment_date: Date,
  payment_verified_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  payment_verified_at: Date,

  // Security
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
});

// ============================================
// 🆕 PHASE 2: PRE-SAVE MIDDLEWARE FOR STATUS SYNC
// ============================================
userSchema.pre("save", async function () {
  try {
    // 1. Sync registrationType with registration_type
    if (this.registration_type && !this.registrationType) {
      this.registrationType = this.registration_type;
    } else if (this.registrationType && !this.registration_type) {
      this.registration_type = this.registrationType;
    }

    // Handle legacy "normal" value migration to "ctm-club"
    if (this.registration_type === "normal") {
      this.registration_type = "ctm-club";
      this.registrationType = "ctm-club";
    }

    // ============================================
    // 🆕 2. SYNC isActive WITH accountStatus
    // ============================================
    // If accountStatus changes, update isActive
    if (this.isModified("accountStatus")) {
      this.isActive = this.accountStatus === "active";
      console.log(
        `🔄 Synced isActive: ${this.isActive} from accountStatus: ${this.accountStatus}`,
      );
    }

    // If isActive changes manually (backward compatibility), update accountStatus
    if (this.isModified("isActive") && !this.isModified("accountStatus")) {
      if (this.isActive) {
        this.accountStatus = "active";
      } else {
        // Keep existing accountStatus if it's suspended, otherwise set to inactive
        if (this.accountStatus !== "suspended") {
          this.accountStatus = "inactive";
        }
      }
      console.log(
        `🔄 Synced accountStatus: ${this.accountStatus} from isActive: ${this.isActive}`,
      );
    }
  } catch (error) {
    console.error("❌ CRITICAL: userSchema pre-save error:", {
      error: error.message,
      stack: error.stack,
      userId: this._id,
      username: this.username,
    });
    throw error;
  }
});

// Add indexes for performance optimization
userSchema.index({ schoolId: 1, role: 1 });
userSchema.index({ regionId: 1, role: 1 });
userSchema.index({ districtId: 1, role: 1 });
userSchema.index({ isActive: 1, role: 1 });
userSchema.index({ accountStatus: 1, paymentStatus: 1, role: 1 }); // 🆕 NEW INDEX
userSchema.index({ registration_type: 1, next_billing_date: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });

const classLevelRequestSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  currentClassLevel: String,
  requestedClassLevel: { type: String, required: true },
  currentAcademicYear: String,
  requestedAcademicYear: { type: String, required: true },
  currentCourse: String,
  requestedCourse: String,
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  reviewComments: String,
  submittedAt: { type: Date, default: Date.now },
});

const ClassLevelRequest = mongoose.model(
  "ClassLevelRequest",
  classLevelRequestSchema,
);

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  schoolCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  type: {
    type: String,
    enum: [
      "primary",
      "secondary",
      "vocational training center",
      "technical college",
      "general college",
      "university",
      "university college",
      "non-university high learning institutions",
      "vocational",
      "special",
      "technical",
      "college",
      "tertiary",
    ],
    required: true,
  },
  ownership: {
    type: String,
    required: true,
    enum: ["government", "private"],
    default: "government",
  },
  regionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region",
    required: true,
    index: true,
  },
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "District",
    required: true,
    index: true,
  },
  wardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ward",
    required: true,
    index: true,
  },
  address: String,
  phoneNumber: String,
  email: { type: String, lowercase: true },
  principalName: String,
  establishedYear: Number,
  totalStudents: { type: Number, default: 0 },
  totalTeachers: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  logo: String,
  website: String,
  accreditationStatus: {
    type: String,
    enum: ["accredited", "provisional", "not_accredited"],
  },
  facilities: [String],
  coordinates: {
    latitude: Number,
    longitude: Number,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
schoolSchema.index({ name: "text", schoolCode: "text" });

// Region Schema
const regionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// District Schema
const districtSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  regionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region",
    required: true,
    index: true,
  },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Ward Schema
const wardSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "District",
    required: true,
    index: true,
  },
  population: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Talent Schema
const talentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  description: String,
  icon: String,
  requirements: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Subject Schema
const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, uppercase: true },
  description: String,
  category: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

subjectSchema.index({ name: 1, schoolId: 1 }, { unique: true });

const Subject = mongoose.model("Subject", subjectSchema);

// Student Talent Schema
const studentTalentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  talentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Talent",
    required: true,
    index: true,
  },
  proficiencyLevel: {
    type: String,
    enum: ["beginner", "intermediate", "advanced", "expert", "master"],
    default: "beginner",
  },
  yearsOfExperience: { type: Number, default: 0 },
  achievements: [String],
  awards: [
    {
      name: String,
      issuedBy: String,
      issuedDate: Date,
      description: String,
    },
  ],
  certifications: [
    {
      name: String,
      issuedBy: String,
      issuedDate: Date,
      expiryDate: Date,
      certificateUrl: String,
      certificateNumber: String,
    },
  ],
  portfolio: [
    {
      title: String,
      description: String,
      url: String,
      mediaType: String,
      createdDate: Date,
    },
  ],
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    index: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "graduated"],
    default: "active",
  },
  registeredAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

studentTalentSchema.index({ studentId: 1, talentId: 1 }, { unique: true });
studentTalentSchema.index({ schoolId: 1, status: 1 });
studentTalentSchema.index({ teacherId: 1 });
studentTalentSchema.index({ registeredAt: -1 });

// Book Schema (Books Store)
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true },
  isbn: { type: String, unique: true, sparse: true },
  category: { type: String, trim: true, index: true },
  description: { type: String },
  coverImage: String,
  pdfFile: String,
  price: { type: Number, default: 0, min: 0 },
  discountPrice: { type: Number, min: 0 },
  publisher: String,
  publishedDate: Date,
  language: { type: String, default: "Swahili" },
  pages: Number,
  rating: { type: Number, default: 0, min: 0, max: 5 },
  ratingsCount: { type: Number, default: 0 },
  reviews: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  soldCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  stockQuantity: { type: Number, default: 0 },
  format: { type: String, enum: ["pdf", "epub", "physical"], default: "pdf" },
  tags: [String],
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Add indexes for Book schema performance
bookSchema.index({ title: "text", author: "text", description: "text" }); // Text search
bookSchema.index({ category: 1, isActive: 1 }); // Category filtering
bookSchema.index({ price: 1 }); // Price sorting
bookSchema.index({ createdAt: -1 }); // Newest first
bookSchema.index({ soldCount: -1 }); // Best sellers
bookSchema.index({ rating: -1 }); // Top rated
bookSchema.index({ uploadedBy: 1 }); // User's books
bookSchema.index({ isActive: 1, isFeatured: 1 }); // Featured books

// Book Purchase Schema
const bookPurchaseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Book",
    required: true,
    index: true,
  },
  amount: { type: Number, required: true },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded", "cancelled"],
    default: "pending",
  },
  transactionId: String,
  downloadCount: { type: Number, default: 0 },
  lastDownloadDate: Date,
  purchasedAt: { type: Date, default: Date.now },
});

bookPurchaseSchema.index({ userId: 1, bookId: 1 });

// Event Schema
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  eventType: {
    type: String,
    enum: [
      "competition",
      "workshop",
      "exhibition",
      "conference",
      "talent_show",
      "seminar",
      "training",
      "festival",
      "other",
    ],
    required: true,
    index: true,
  },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true },
  location: String,
  venue: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  maxParticipants: Number,
  currentParticipants: { type: Number, default: 0 },
  registrationFee: { type: Number, default: 0 },
  registrationDeadline: Date,
  coverImage: String,
  bannerImage: String,
  status: {
    type: String,
    enum: ["draft", "published", "ongoing", "completed", "cancelled"],
    default: "draft",
    index: true,
  },
  isPublic: { type: Boolean, default: true },
  requirements: [String],
  prizes: [
    {
      position: String,
      description: String,
      amount: Number,
    },
  ],
  sponsors: [
    {
      name: String,
      logo: String,
      contribution: Number,
    },
  ],
  agenda: [
    {
      time: String,
      activity: String,
      speaker: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Event Registration Schema
const eventRegistrationSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  talentId: { type: mongoose.Schema.Types.ObjectId, ref: "Talent" },
  registrationStatus: {
    type: String,
    enum: ["pending", "approved", "rejected", "cancelled", "waitlisted"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "refunded", "waived"],
    default: "pending",
  },
  teamMembers: [
    {
      name: String,
      role: String,
      contactInfo: String,
    },
  ],
  notes: String,
  checkInStatus: { type: Boolean, default: false },
  checkInTime: Date,
  registeredAt: { type: Date, default: Date.now },
});

eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

// Business Schema (for Entrepreneurs)
const businessSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  businessType: { type: String, required: true, trim: true },
  registrationNumber: String,
  tinNumber: String,
  description: String,
  logo: String,
  bannerImage: String,
  address: String,
  phoneNumber: String,
  email: { type: String, lowercase: true },
  website: String,
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
  },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  category: { type: String, trim: true, index: true },
  subCategory: String,
  establishedDate: Date,
  employeesCount: Number,
  annualRevenue: Number,
  isVerified: { type: Boolean, default: false },
  verificationDocuments: [String],
  operatingHours: {
    monday: String,
    tuesday: String,
    wednesday: String,
    thursday: String,
    friday: String,
    saturday: String,
    sunday: String,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "suspended", "pending"],
    default: "pending",
  },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

businessSchema.index({ name: "text", description: "text" });

// Product/Service Schema (for Entrepreneurs)
const productSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  description: String,
  category: { type: String, trim: true },
  type: { type: String, enum: ["product", "service"], required: true },
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, min: 0 },
  images: [String],
  stockQuantity: { type: Number, default: 0 },
  sku: String,
  specifications: mongoose.Schema.Types.Mixed,
  tags: [String],
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewsCount: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ name: "text", description: "text" });

// Transaction Schema (AzamPay Integration)
const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  transactionType: {
    type: String,
    enum: [
      "book_purchase",
      "event_registration",
      "product_purchase",
      "service_payment",
      "subscription",
      "donation",
      "membership_fee",
      "certificate_fee",
      "other",
    ],
    required: true,
    index: true,
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "TZS" },
  paymentProvider: String,
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "refunded",
    ],
    default: "pending",
    index: true,
  },
  referenceId: { type: String, unique: true, index: true },
  providerReference: String,
  providerTransactionId: String,
  phoneNumber: String,
  description: String,
  metadata: mongoose.Schema.Types.Mixed,
  relatedEntityType: String,
  relatedEntityId: mongoose.Schema.Types.ObjectId,
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  completedAt: Date,
  failureReason: String,
  ipAddress: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now },
});

// Revenue Schema (Revenue Tracking)
const revenueSchema = new mongoose.Schema({
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction",
    required: true,
    index: true,
  },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: { type: Number, required: true },
  commission: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  netAmount: { type: Number, required: true },
  revenueType: {
    type: String,
    enum: [
      "book_sale",
      "event_fee",
      "product_sale",
      "service_fee",
      "subscription",
      "commission",
      "membership",
      "other",
    ],
    required: true,
    index: true,
  },
  revenueDate: { type: Date, default: Date.now, index: true },
  month: { type: Number, index: true },
  year: { type: Number, index: true },
  quarter: { type: Number, index: true },
  fiscalYear: Number,
  category: String,
  createdAt: { type: Date, default: Date.now },
});

// Performance Record Schema
const performanceRecordSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  talentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Talent",
    required: true,
    index: true,
  },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  assessmentType: {
    type: String,
    enum: [
      "practical",
      "theoretical",
      "project",
      "performance",
      "portfolio",
      "competition",
    ],
    default: "practical",
  },
  assessmentDate: { type: Date, required: true, index: true },
  score: { type: Number, min: 0, max: 100 },
  grade: String,
  comments: String,
  strengths: [String],
  areasForImprovement: [String],
  recommendations: String,
  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  attachments: [String],
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "info",
      "success",
      "warning",
      "error",
      "payment",
      "event",
      "message",
      "system",
      "achievement",
    ],
    default: "info",
  },
  priority: {
    type: String,
    enum: ["low", "normal", "high", "urgent"],
    default: "normal",
  },
  isRead: { type: Boolean, default: false, index: true },
  readAt: Date,
  actionUrl: String,
  actionLabel: String,
  metadata: mongoose.Schema.Types.Mixed,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  action: { type: String, required: true, index: true },
  description: String,
  entityType: String,
  entityId: mongoose.Schema.Types.ObjectId,
  ipAddress: String,
  userAgent: String,
  location: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, index: true },
});

// Message Schema (Real-time Messaging)
const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  conversationId: { type: String, index: true },
  content: { type: String, required: true },
  messageType: {
    type: String,
    enum: ["text", "image", "file", "audio", "video", "link"],
    default: "text",
  },
  attachmentUrl: String,
  attachmentName: String,
  attachmentSize: Number,
  isRead: { type: Boolean, default: false, index: true },
  readAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  reactions: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      emoji: String,
      createdAt: Date,
    },
  ],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  createdAt: { type: Date, default: Date.now, index: true },
});

// Group Schema
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  groupType: {
    type: String,
    enum: [
      "school",
      "talent",
      "event",
      "business",
      "class",
      "project",
      "general",
    ],
    required: true,
  },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  avatar: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isPrivate: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  settings: {
    allowMemberInvite: { type: Boolean, default: true },
    allowMemberPost: { type: Boolean, default: true },
    requireAdminApproval: { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Group Message Schema
const groupMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
    index: true,
  },
  content: { type: String, required: true },
  messageType: {
    type: String,
    enum: ["text", "image", "file", "audio", "video", "announcement"],
    default: "text",
  },
  attachmentUrl: String,
  attachmentName: String,
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isDeleted: { type: Boolean, default: false },
  reactions: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      emoji: String,
      createdAt: Date,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// Certificate Schema
const certificateSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  talentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Talent",
    required: true,
  },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  certificateNumber: { type: String, unique: true, required: true },
  certificateType: {
    type: String,
    enum: [
      "completion",
      "achievement",
      "participation",
      "excellence",
      "mastery",
    ],
    required: true,
  },
  title: String,
  description: String,
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  issuedDate: { type: Date, required: true },
  expiryDate: Date,
  certificateUrl: String,
  verificationCode: String,
  isVerified: { type: Boolean, default: true },
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

// ============================================
// GRADES SCHEMA
// ============================================
const gradeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  subject: { type: String, required: true, trim: true },
  examType: {
    type: String,
    enum: ["quiz", "midterm", "final", "assignment", "project", "test"],
    default: "test",
  },
  score: { type: Number, required: true, min: 0, max: 100 },
  grade: { type: String, trim: true }, // A, B, C, D, F
  totalMarks: { type: Number, default: 100 },
  obtainedMarks: { type: Number },
  term: { type: String, trim: true },
  academicYear: { type: String, trim: true },
  examDate: { type: Date },
  feedback: String,
  remarks: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Grade = mongoose.model("Grade", gradeSchema);

// ============================================
// ATTENDANCE SCHEMA
// ============================================
const attendanceRecordSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  date: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ["present", "absent", "late", "excused"],
    required: true,
  },
  subject: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  remarks: String,
  timeIn: Date,
  timeOut: Date,
  createdAt: { type: Date, default: Date.now },
});

attendanceRecordSchema.index({ studentId: 1, date: 1 });

const AttendanceRecord = mongoose.model(
  "AttendanceRecord",
  attendanceRecordSchema,
);

// ============================================
// ASSIGNMENT SCHEMA
// ============================================
const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  subject: { type: String, required: true, trim: true },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  classLevel: String,
  dueDate: { type: Date, required: true, index: true },
  totalMarks: { type: Number, default: 100 },
  attachments: [String],
  instructions: String,
  status: {
    type: String,
    enum: ["draft", "published", "closed"],
    default: "published",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Assignment = mongoose.model("Assignment", assignmentSchema);

// ============================================
// ASSIGNMENT SUBMISSION SCHEMA
// ============================================
const assignmentSubmissionSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment",
    required: true,
    index: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  content: String,
  attachments: [String],
  submittedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["submitted", "late", "graded"],
    default: "submitted",
  },
  score: Number,
  feedback: String,
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  gradedAt: Date,
});

assignmentSubmissionSchema.index(
  { assignmentId: 1, studentId: 1 },
  { unique: true },
);

const AssignmentSubmission = mongoose.model(
  "AssignmentSubmission",
  assignmentSubmissionSchema,
);

const invoiceSchema = new mongoose.Schema(
  {
    // ✅ FIXED: Changed from student_id to user_id (more generic)
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    // ✅ FIXED: Added 'registration' and 'monthly_fee' to type enum
    type: {
      type: String,
      enum: [
        "ctm_membership", // CTM Club annual fees
        "certificate", // CTM Certificates
        "school_fees", // School fees
        "event", // Event fees
        "registration", // ✅ ADDED: Registration fees (fixes entrepreneur registration error)
        "monthly_fee", // ✅ ADDED: Monthly subscription fees
        "other", // Other charges
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    // ✅ FIXED: Changed from 'Tsh' to 'TZS' (proper ISO format)
    currency: {
      type: String,
      default: "TZS",
    },
    // ✅ FIXED: Added 'unpaid' and 'partially_paid' to status enum
    status: {
      type: String,
      enum: [
        "paid", // Fully paid
        "unpaid", // Not paid yet
        "pending", // Awaiting payment
        "partially_paid", // Partially paid
        "overdue", // Past due date
        "cancelled", // Cancelled invoice
        "verification", // Payment under verification
      ],
      default: "unpaid", // ✅ CHANGED: Default to 'unpaid' instead of 'pending'
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: {
      type: Date,
    },
    academicYear: {
      type: String,
    },

    // Payment proof fields
    paymentProof: {
      fileName: String,
      originalName: String,
      filePath: String,
      fileSize: Number,
      mimeType: String,
      uploadedAt: Date,
      notes: String,
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      verifiedAt: Date,
      rejectionReason: String,
    },
  },
  {
    timestamps: true,
  },
);

const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = Invoice;

// ============================================
// PAYMENT HISTORY SCHEMA (PRODUCTION-READY)
// ============================================

const paymentHistorySchema = new mongoose.Schema(
  {
    // ============================================
    // USER & SCHOOL REFERENCES
    // ============================================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      description: "Reference to the user making the payment",
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: false,
      index: true,
      description: "Reference to the user's school (if applicable)",
    },

    // ============================================
    // TRANSACTION DETAILS
    // ============================================
    transactionType: {
      type: String,
      enum: [
        "registration_fee",
        "tuition_fee",
        "exam_fee",
        "ctm_membership",
        "book_purchase",
        "event_registration",
        "certification_fee",
        "other",
      ],
      required: true,
      default: "registration_fee",
      description: "Type of transaction/payment",
    },

    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
      description: "Payment amount in TZS",
    },

    currency: {
      type: String,
      default: "TZS",
      enum: ["TZS", "USD", "EUR"],
      description: "Currency code",
    },

    // ============================================
    // PAYMENT DATES
    // ============================================
    paymentDate: {
      type: Date,
      description:
        "Date when payment was made (optional - set after verification)",
    },

    nextPaymentDate: {
      type: Date,
      required: false,
      description: "Next payment due date (for installments/partial payments)",
    },

    dueDate: {
      type: Date,
      required: false,
      description: "Original due date for the payment",
    },

    // ============================================
    // PAYMENT STATUS
    // ============================================
    status: {
      type: String,
      enum: [
        "pending", // Payment recorded but not yet verified
        "submitted", // Payment proof submitted, awaiting review
        "verified", // Payment verified by admin
        "approved", // Payment approved and processed
        "rejected", // Payment rejected
        "failed", // Payment transaction failed
        "cancelled", // Payment cancelled
        "refunded", // Payment refunded
        "partially_paid", // Partial payment made
        "completed", // Payment fully completed
      ],
      default: "pending",
      required: true,
      description: "Current status of the payment",
    },

    // ============================================
    // INVOICE REFERENCE
    // ============================================
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: false,
      // ✅ NO index here - we define it separately below
      description: "Reference to related invoice",
    },

    // ============================================
    // PAYMENT BREAKDOWN (for partial payments)
    // ============================================
    totalAmount: {
      type: Number,
      required: false,
      description: "Total amount to be paid (if this is a partial payment)",
    },

    paidAmount: {
      type: Number,
      required: false,
      description: "Amount paid so far (including this payment)",
    },

    remainingAmount: {
      type: Number,
      required: false,
      description: "Remaining amount to be paid",
    },

    // ============================================
    // VERIFICATION & APPROVAL
    // ============================================
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      description: "Admin who verified the payment",
    },

    verifiedAt: {
      type: Date,
      required: false,
      description: "Date when payment was verified",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      description: "Admin who approved the payment",
    },

    approvedAt: {
      type: Date,
      required: false,
      description: "Date when payment was approved",
    },

    // ============================================
    // PAYMENT PROOF
    // ============================================
    paymentProof: {
      fileUrl: {
        type: String,
        required: false,
        description: "URL to payment receipt/proof document",
      },
      fileName: {
        type: String,
        required: false,
        description: "Original file name of payment proof",
      },
      fileType: {
        type: String,
        required: false,
        description: "MIME type of payment proof file",
      },
      uploadedAt: {
        type: Date,
        required: false,
        description: "Date when proof was uploaded",
      },
    },

    // ============================================
    // STATUS HISTORY (AUDIT TRAIL)
    // ============================================
    statusHistory: [
      {
        status: {
          type: String,
          required: true,
          enum: [
            "pending",
            "submitted",
            "verified",
            "approved",
            "rejected",
            "failed",
            "cancelled",
            "refunded",
            "partially_paid",
            "completed",
          ],
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
          description: "User who changed the status",
        },
        changedAt: {
          type: Date,
          default: Date.now,
          required: true,
        },
        reason: {
          type: String,
          required: false,
          trim: true,
          maxlength: 1000,
          description: "Reason for status change",
        },
        notes: {
          type: String,
          required: false,
          trim: true,
          maxlength: 2000,
          description: "Additional notes about the status change",
        },
      },
    ],

    // ============================================
    // ADDITIONAL INFORMATION
    // ============================================
    notes: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
      description: "Additional notes about the payment",
    },

    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
      description: "Payment description",
    },

    // ============================================
    // METADATA
    // ============================================
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      required: false,
      description: "Additional metadata (flexible key-value storage)",
    },

    // ============================================
    // RECONCILIATION
    // ============================================
    reconciled: {
      type: Boolean,
      default: false,
      description: "Whether payment has been reconciled with bank statement",
    },

    reconciledAt: {
      type: Date,
      required: false,
      description: "Date when payment was reconciled",
    },

    reconciledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      description: "User who reconciled the payment",
    },

    // ============================================
    // SOFT DELETE
    // ============================================
    isDeleted: {
      type: Boolean,
      default: false,
      description: "Soft delete flag",
    },

    deletedAt: {
      type: Date,
      required: false,
      description: "Date when payment record was deleted",
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      description: "User who deleted the payment record",
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    collection: "paymenthistories",
  },
);

// ============================================
// INDEXES FOR PERFORMANCE (NO DUPLICATES!)
// ============================================

// ✅ REMOVED DUPLICATE: Only one index per field/combination
paymentHistorySchema.index({ userId: 1, createdAt: -1 }); // User payment history
paymentHistorySchema.index({ status: 1, createdAt: -1 }); // Status filtering
paymentHistorySchema.index({ schoolId: 1, createdAt: -1 }); // School payments
paymentHistorySchema.index({ paymentDate: -1 }); // Date-based queries
paymentHistorySchema.index({ transactionType: 1, status: 1 }); // Transaction filtering
paymentHistorySchema.index({ isDeleted: 1, createdAt: -1 }); // Soft delete queries
// ✅ ONLY index on invoiceId (no duplicate in field definition)
paymentHistorySchema.index({ invoiceId: 1 }, { sparse: true });

paymentHistorySchema.index({ reconciled: 1, reconciledAt: -1 }); // Reconciliation queries
paymentHistorySchema.index({
  userId: 1,
  status: 1,
  paymentDate: -1,
}); // Combined query optimization

// ============================================
// VIRTUAL FIELDS
// ============================================
paymentHistorySchema.virtual("isPartialPayment").get(function () {
  return this.totalAmount && this.amount < this.totalAmount;
});

paymentHistorySchema.virtual("isFullyPaid").get(function () {
  return this.totalAmount && this.paidAmount >= this.totalAmount;
});

paymentHistorySchema.virtual("paymentProgress").get(function () {
  if (!this.totalAmount || this.totalAmount === 0) return 100;
  return Math.round((this.paidAmount / this.totalAmount) * 100);
});

// ✅ NEW: Virtual field for payment age
paymentHistorySchema.virtual("paymentAge").get(function () {
  if (!this.paymentDate) return null;
  const now = new Date();
  const diffTime = Math.abs(now - this.paymentDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// ✅ NEW: Virtual field for formatted amount
paymentHistorySchema.virtual("formattedAmount").get(function () {
  return `${this.currency} ${this.amount.toLocaleString()}`;
});

// Enable virtuals in JSON
paymentHistorySchema.set("toJSON", { virtuals: true });
paymentHistorySchema.set("toObject", { virtuals: true });

// ============================================
// INSTANCE METHODS
// ============================================

// Add status change to history
paymentHistorySchema.methods.changeStatus = function (
  newStatus,
  changedBy,
  reason = "",
  notes = "",
) {
  this.status = newStatus;

  this.statusHistory.push({
    status: newStatus,
    changedBy: changedBy,
    changedAt: new Date(),
    reason: reason,
    notes: notes,
  });

  // Update verification/approval fields
  if (newStatus === "verified") {
    this.verifiedBy = changedBy;
    this.verifiedAt = new Date();
  }

  if (newStatus === "approved") {
    this.approvedBy = changedBy;
    this.approvedAt = new Date();
  }

  return this.save();
};

// Mark as reconciled
paymentHistorySchema.methods.reconcile = function (reconciledBy) {
  this.reconciled = true;
  this.reconciledAt = new Date();
  this.reconciledBy = reconciledBy;
  return this.save();
};

// Soft delete
paymentHistorySchema.methods.softDelete = function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// ✅ NEW: Restore soft deleted payment
paymentHistorySchema.methods.restore = function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  return this.save();
};

// ============================================
// STATIC METHODS
// ============================================

// Get user payment summary
paymentHistorySchema.statics.getUserPaymentSummary = async function (userId) {
  // ✅ FIXED: Use 'new' keyword
  const summary = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  const total = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        totalPaid: {
          $sum: {
            $cond: [
              { $in: ["$status", ["approved", "completed", "verified"]] },
              "$amount",
              0,
            ],
          },
        },
        totalPending: {
          $sum: {
            $cond: [
              { $in: ["$status", ["pending", "submitted"]] },
              "$amount",
              0,
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    byStatus: summary,
    overall: total[0] || { totalPaid: 0, totalPending: 0, count: 0 },
  };
};

// Get payment statistics for a date range
paymentHistorySchema.statics.getPaymentStats = async function (
  startDate,
  endDate,
  filters = {},
) {
  const matchQuery = {
    isDeleted: false,
    paymentDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
    ...filters,
  };

  return await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          status: "$status",
          method: "$paymentMethod",
          type: "$transactionType",
        },
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        avgAmount: { $avg: "$amount" },
        minAmount: { $min: "$amount" },
        maxAmount: { $max: "$amount" },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);
};

// ✅ NEW: Get unreconciled payments
paymentHistorySchema.statics.getUnreconciledPayments = async function (
  schoolId = null,
) {
  const query = {
    reconciled: false,
    status: { $in: ["verified", "approved", "completed"] },
    isDeleted: false,
  };

  if (schoolId) {
    query.schoolId = new mongoose.Types.ObjectId(schoolId);
  }

  return await this.find(query)
    .populate("userId", "firstName lastName email")
    .populate("schoolId", "name schoolCode")
    .sort({ paymentDate: 1 });
};

// ✅ NEW: Get overdue payments (for installments)
paymentHistorySchema.statics.getOverduePayments = async function () {
  return await this.find({
    status: "partially_paid",
    nextPaymentDate: { $lt: new Date() },
    isDeleted: false,
  })
    .populate("userId", "firstName lastName email phoneNumber")
    .populate("schoolId", "name")
    .sort({ nextPaymentDate: 1 });
};

// ============================================
// PRE-SAVE MIDDLEWARE
// ============================================
paymentHistorySchema.pre("save", function () {
  // Calculate remaining amount if partial payment
  if (this.totalAmount && this.paidAmount) {
    this.remainingAmount = this.totalAmount - this.paidAmount;

    // Update status based on payment completion
    if (this.remainingAmount <= 0) {
      this.status = "completed";
    } else if (this.paidAmount > 0 && this.paidAmount < this.totalAmount) {
      this.status = "partially_paid";
    }
  }

  // Ensure at least one status history entry exists
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      reason: "Initial payment record created",
    });
  }

  // ✅ NEW: Validate payment amount doesn't exceed total
  if (this.totalAmount && this.amount > this.totalAmount) {
    return next(new Error("Payment amount cannot exceed total amount"));
  }
});

// ============================================
// QUERY HELPERS
// ============================================

// ✅ NEW: Query helper for active payments
paymentHistorySchema.query.active = function () {
  return this.where({ isDeleted: false });
};

// ✅ NEW: Query helper for verified payments
paymentHistorySchema.query.verified = function () {
  return this.where({ status: { $in: ["verified", "approved", "completed"] } });
};

// ✅ NEW: Query helper for pending payments
paymentHistorySchema.query.pending = function () {
  return this.where({ status: { $in: ["pending", "submitted"] } });
};

// ============================================
// EXPORT MODEL
// ============================================
const PaymentHistory = mongoose.model("PaymentHistory", paymentHistorySchema);

// ============================================
// PAYMENT REMINDER SCHEMA
// ============================================

const paymentReminderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
    },
    reminderType: {
      type: String,
      enum: ["first_reminder", "second_reminder", "final_notice", "overdue"],
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    sentVia: {
      type: String,
      enum: ["email", "sms", "notification", "all"],
      default: "notification",
    },
    dueDate: Date,
    amount: Number,
    message: String,
    opened: {
      type: Boolean,
      default: false,
    },
    openedAt: Date,
  },
  {
    timestamps: true,
  },
);

paymentReminderSchema.index({ userId: 1, sentAt: -1 });
paymentReminderSchema.index({ invoiceId: 1 });

const PaymentReminder = mongoose.model(
  "PaymentReminder",
  paymentReminderSchema,
);

const smsLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  phone: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ["password", "payment_confirmation", "payment_approval", "general"],
    required: true,
  },
  status: {
    type: String,
    enum: ["sent", "failed", "delivered", "pending"],
    default: "pending",
  },
  messageId: String,
  reference: String,
  errorMessage: String,
  sentAt: { type: Date, default: Date.now },
});

const SMSLog = mongoose.model("SMSLog", smsLogSchema);

// ============================================
// MODELS
// ============================================
const User = mongoose.model("User", userSchema);
const School = mongoose.model("School", schoolSchema);
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const Talent = mongoose.model("Talent", talentSchema);
const StudentTalent = mongoose.model("StudentTalent", studentTalentSchema);
const Book = mongoose.model("Book", bookSchema);
const BookPurchase = mongoose.model("BookPurchase", bookPurchaseSchema);
const Event = mongoose.model("Event", eventSchema);
const EventRegistration = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema,
);
const Business = mongoose.model("Business", businessSchema);
const Product = mongoose.model("Product", productSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);
const Revenue = mongoose.model("Revenue", revenueSchema);
const PerformanceRecord = mongoose.model(
  "PerformanceRecord",
  performanceRecordSchema,
);
const Notification = mongoose.model("Notification", notificationSchema);
const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
const Message = mongoose.model("Message", messageSchema);
const Group = mongoose.model("Group", groupSchema);
const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);
const Certificate = mongoose.model("Certificate", certificateSchema);

// ============================================
// NEW SCHEMAS FOR MISSING FEATURES
// ============================================

// Announcement Schema
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  priority: {
    type: String,
    enum: ["low", "normal", "high", "urgent"],
    default: "normal",
  },
  targetAudience: {
    type: String,
    enum: ["all", "students", "teachers", "parents", "staff", "entrepreneurs"],
    default: "all",
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    index: true,
  },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isActive: { type: Boolean, default: true },
  publishDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  attachments: [String],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

announcementSchema.index({ schoolId: 1, targetAudience: 1, publishDate: -1 });

// Timetable Schema
const timetableSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  classLevel: { type: String, required: true },
  academicYear: { type: String, required: true },
  term: { type: String },
  dayOfWeek: {
    type: String,
    enum: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ],
    required: true,
  },
  periods: [
    {
      periodNumber: { type: Number, required: true },
      subject: { type: String, required: true },
      teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      startTime: { type: String, required: true }, // "08:00"
      endTime: { type: String, required: true }, // "09:00"
      room: { type: String },
    },
  ],
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

timetableSchema.index({ schoolId: 1, classLevel: 1, academicYear: 1 });

// CTM Membership Schema
const ctmMembershipSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  membershipNumber: { type: String, unique: true, required: true },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "suspended", "expired"],
    default: "active",
  },
  joinDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  membershipType: {
    type: String,
    enum: ["basic", "premium", "gold", "platinum"],
    default: "basic",
  },
  talents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Talent" }],
  participationPoints: { type: Number, default: 0 },
  achievements: [
    {
      title: String,
      description: String,
      awardedDate: Date,
      category: String,
    },
  ],
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// CTM Activity Schema
const ctmActivitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  activityType: {
    type: String,
    enum: [
      "workshop",
      "competition",
      "exhibition",
      "training",
      "community_service",
      "performance",
      "other",
    ],
    required: true,
  },
  talentCategory: { type: String },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  date: { type: Date, required: true },
  duration: { type: Number }, // in hours
  location: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  maxParticipants: { type: Number },
  status: {
    type: String,
    enum: ["scheduled", "ongoing", "completed", "cancelled"],
    default: "scheduled",
  },
  points: { type: Number, default: 0 },
  attachments: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Award Schema
const awardSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: [
      "academic",
      "sports",
      "talent",
      "leadership",
      "community_service",
      "behavior",
      "attendance",
      "other",
    ],
    required: true,
  },
  awardLevel: {
    type: String,
    enum: ["school", "district", "regional", "national", "international"],
    default: "school",
  },
  awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  awardDate: { type: Date, required: true },
  certificateUrl: String,
  position: String, // "1st Place", "Gold Medal", etc.
  points: { type: Number, default: 0 },
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

// Student Ranking Schema
const rankingSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  academicYear: { type: String, required: true },
  term: { type: String },
  classLevel: { type: String, required: true },

  // Academic Rankings
  overallRank: { type: Number },
  classRank: { type: Number },
  averageScore: { type: Number },
  totalMarks: { type: Number },

  // Subject-wise rankings
  subjectRankings: [
    {
      subject: String,
      rank: Number,
      score: Number,
    },
  ],

  // Talent Rankings
  talentPoints: { type: Number, default: 0 },
  talentRank: { type: Number },

  // Overall Performance
  performanceGrade: {
    type: String,
    enum: ["A+", "A", "B+", "B", "C+", "C", "D+", "D", "F"],
  },

  // Metadata
  totalStudents: { type: Number }, // Total in class/school
  calculatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

rankingSchema.index({ schoolId: 1, academicYear: 1, classLevel: 1 });

// Terms & Conditions Schema
const termsAcceptanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  termsVersion: { type: String, required: true },
  acceptedTerms: { type: Boolean, required: true },
  acceptedPrivacy: { type: Boolean, required: true },
  acceptedAt: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String,
});

// Class Schema (for teachers)
const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  level: { type: String, required: true },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  academicYear: { type: String, required: true },
  term: { type: String },
  description: String,
  schedule: String,
  room: String,
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Exam Schema
const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  examDate: { type: Date, required: true },
  duration: { type: Number }, // in minutes
  totalMarks: { type: Number, required: true },
  passingMarks: { type: Number },
  examType: {
    type: String,
    enum: ["quiz", "midterm", "final", "mock", "practical"],
    default: "quiz",
  },
  instructions: String,
  status: {
    type: String,
    enum: ["scheduled", "ongoing", "completed", "cancelled"],
    default: "scheduled",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Work Report Schema (for Staff/TAMISEMI)
const workReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["daily", "weekly", "monthly", "quarterly", "annual"],
    required: true,
  },
  title: { type: String, required: true },
  period: { type: String, required: true }, // "2025-01", "Week 1", etc.
  achievements: { type: String, required: true },
  challenges: String,
  nextSteps: String,
  metrics: String,
  attachments: [String],
  status: {
    type: String,
    enum: ["draft", "submitted", "under_review", "approved", "rejected"],
    default: "draft",
  },
  submittedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  reviewComments: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Permission Request Schema (for Staff)
const permissionRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["leave", "cash", "travel", "equipment", "other"],
    required: true,
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  amount: String,
  startDate: Date,
  endDate: Date,
  reason: { type: String, required: true },
  attachments: [String],
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "cancelled"],
    default: "pending",
  },
  submittedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  reviewComments: String,
  createdAt: { type: Date, default: Date.now },
});

// Todo Schema (for Staff/Users)
const todoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: { type: String, required: true },
  description: String,
  dueDate: Date,
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  },
  category: String,
  completed: { type: Boolean, default: false },
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Create models
const Announcement = mongoose.model("Announcement", announcementSchema);
const Timetable = mongoose.model("Timetable", timetableSchema);
const CTMMembership = mongoose.model("CTMMembership", ctmMembershipSchema);
const CTMActivity = mongoose.model("CTMActivity", ctmActivitySchema);
const Award = mongoose.model("Award", awardSchema);
const Ranking = mongoose.model("Ranking", rankingSchema);
const TermsAcceptance = mongoose.model(
  "TermsAcceptance",
  termsAcceptanceSchema,
);
const Class = mongoose.model("Class", classSchema);
const Exam = mongoose.model("Exam", examSchema);
const WorkReport = mongoose.model("WorkReport", workReportSchema);
const PermissionRequest = mongoose.model(
  "PermissionRequest",
  permissionRequestSchema,
);
const Todo = mongoose.model("Todo", todoSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

// Hash password
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// Compare password
async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      regionId: user.regionId,
      districtId: user.districtId,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

// Generate unique reference ID
function generateReferenceId(prefix = "ECON") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================
// ACTIVITY LOGGING HELPER
// ============================================

/**
 * Log user activity to ActivityLog collection
 * @param {string} userId - User ID performing the action
 * @param {string} action - Action type (e.g., "USER_LOGIN", "PAYMENT_VERIFIED")
 * @param {string} description - Human-readable description
 * @param {Object} req - Express request object (for IP/user agent)
 * @param {Object} metadata - Additional metadata (optional)
 */
async function logActivity(
  userId,
  action,
  description,
  req = {},
  metadata = {},
) {
  try {
    await ActivityLog.create({
      userId,
      action,
      description,
      metadata,
      ipAddress: req.ip || req.connection?.remoteAddress || "unknown",
      userAgent:
        req.get?.("user-agent") || req.headers?.["user-agent"] || "unknown",
    });
  } catch (error) {
    // Don't fail the request if activity logging fails
    console.error("❌ Failed to log activity:", error.message);
  }
}

// Initialize after all models are defined
monthlyBillingService.initialize({
  User,
  Invoice,
  PaymentHistory,
  Notification,
  ActivityLog,
});

console.log("✅ Monthly/Annual Billing Service initialized");


// ============================================
// HELPER: Send Bulk Payment Reminders (for Cron Job)
// ============================================

/**
 * Send payment reminders to users with upcoming due payments
 * Used by automated cron job (runs daily at 9 AM)
 * @returns {Promise<object>} Results summary
 */
async function sendBulkPaymentReminders() {
  try {
    console.log("\n📧 ========================================");
    console.log("📧  BULK PAYMENT REMINDERS");
    console.log("📧 ========================================\n");

    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    // Find invoices due within 7 days
    const pendingInvoices = await Invoice.find({
      status: { $in: ["pending", "verification", "partial_paid"] },
      dueDate: { $gte: today, $lte: sevenDaysFromNow },
    }).populate("user_id", "firstName lastName phoneNumber email username");

    console.log(
      `📊 Found ${pendingInvoices.length} invoices due within 7 days`,
    );

    if (pendingInvoices.length === 0) {
      console.log("✅ No invoices require reminders\n");
      return {
        success: true,
        sentCount: 0,
        failedCount: 0,
        totalInvoices: 0,
        usersNotified: 0,
      };
    }

    let sentCount = 0;
    let failedCount = 0;

    // Group by user (one user may have multiple invoices)
    const userInvoicesMap = new Map();
    pendingInvoices.forEach((invoice) => {
      if (!invoice.user_id) return; // Skip if user was deleted

      const userId = invoice.user_id._id.toString();
      if (!userInvoicesMap.has(userId)) {
        userInvoicesMap.set(userId, {
          user: invoice.user_id,
          invoices: [],
        });
      }
      userInvoicesMap.get(userId).invoices.push(invoice);
    });

    console.log(`👥 Reminders needed for ${userInvoicesMap.size} users\n`);

    // Send reminders to each user
    for (const [userId, { user, invoices }] of userInvoicesMap) {
      try {
        const totalDue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
        const nearestInvoice = invoices.sort(
          (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
        )[0];
        const daysRemaining = Math.ceil(
          (new Date(nearestInvoice.dueDate) - today) / (1000 * 60 * 60 * 24),
        );

        const userName =
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          user.username;

        // Send in-app notification
        await createNotification(
          userId,
          "Payment Reminder ⏰",
          `You have ${invoices.length} pending invoice(s) totaling TZS ${totalDue.toLocaleString()}. Due in ${daysRemaining} day(s).`,
          "warning",
          "/payments",
        );

        // Optional: Send SMS if phone number exists
        if (user.phoneNumber && smsService) {
          try {
            const smsMessage = `Hello ${userName}! Payment reminder: TZS ${totalDue.toLocaleString()} due in ${daysRemaining} days. Pay via Vodacom Lipa: 5130676 or CRDB: 0150814579600. Thank you!`;

            await smsService.sendSMS(
              user.phoneNumber,
              smsMessage,
              "payment_reminder",
            );
            console.log(`📱 SMS sent to ${user.phoneNumber}`);
          } catch (smsError) {
            console.error(
              `⚠️  SMS failed for ${user.phoneNumber}:`,
              smsError.message,
            );
          }
        }

        sentCount++;
        console.log(
          `✅ Reminder sent to ${userName} (${daysRemaining} days, TZS ${totalDue.toLocaleString()})`,
        );
      } catch (error) {
        console.error(`❌ Failed to send reminder:`, error.message);
        failedCount++;
      }
    }

    console.log("\n✅ ========================================");
    console.log(
      `✅  REMINDERS COMPLETE: ${sentCount} sent, ${failedCount} failed`,
    );
    console.log("========================================\n");

    return {
      success: true,
      sentCount,
      failedCount,
      totalInvoices: pendingInvoices.length,
      usersNotified: userInvoicesMap.size,
    };
  } catch (error) {
    console.error("❌ Bulk payment reminders failed:", error);
    throw error;
  }
}

// Create notification
async function createNotification(
  userId,
  title,
  message,
  type = "info",
  actionUrl = null,
  metadata = {},
) {
  try {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      actionUrl,
      metadata,
    });

    // Emit real-time notification via Socket.io
    io.to(userId.toString()).emit("notification", notification);

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

// Calculate revenue split
function calculateRevenueSplit(amount, type = "default") {
  const commissionRates = {
    book_sale: 0.15, // 15% platform commission
    event_fee: 0.1, // 10% platform commission
    product_sale: 0.12, // 12% platform commission
    service_fee: 0.15, // 15% platform commission
    default: 0.1, // 10% default
  };

  const rate = commissionRates[type] || commissionRates.default;
  const commission = Math.round(amount * rate);
  const netAmount = amount - commission;

  return { commission, netAmount };
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ success: false, error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Role-based access control middleware
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to access this resource",
      });
    }
    next();
  };
};

// Multi-school data isolation middleware
const enforceSchoolIsolation = async (req, res, next) => {
  try {
    if (!req.user.schoolId) {
      return next();
    }

    // For headmasters and teachers, enforce school isolation
    if (["headmaster", "teacher", "staff"].includes(req.user.role)) {
      req.schoolFilter = { schoolId: req.user.schoolId };
    }

    // For district officials, enforce district isolation
    if (req.user.role === "district_official") {
      req.districtFilter = { districtId: req.user.districtId };
    }

    // For regional officials, enforce regional isolation
    if (req.user.role === "regional_official") {
      req.regionFilter = { regionId: req.user.regionId };
    }

    next();
  } catch (error) {
    console.error("School isolation error:", error);
    next();
  }
};
// Shorthand middleware for SuperAdmin authentication
const authenticateSuperAdmin = (req, res, next) => {
  authenticateToken(req, res, (err) => {
    if (err) return next(err);
    authorizeRoles("super_admin")(req, res, next);
  });
};
// ============================================
// SOCKET.IO REAL-TIME MESSAGING
// ============================================
io.on("connection", (socket) => {
  console.log("✅ Socket.io client connected:", socket.id);

  // Join user's personal room
  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their personal room`);
  });

  // Join group room
  socket.on("join_group", (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`User joined group: ${groupId}`);
  });

  // Leave group room
  socket.on("leave_group", (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`User left group: ${groupId}`);
  });

  // Send private message
  socket.on("send_message", async (data) => {
    try {
      const { senderId, recipientId, content, messageType, attachmentUrl } =
        data;

      const message = await Message.create({
        senderId,
        recipientId,
        content,
        messageType: messageType || "text",
        attachmentUrl,
        conversationId: [senderId, recipientId].sort().join("_"),
      });

      const populatedMessage = await Message.findById(message._id)
        .populate("senderId", "firstName lastName profileImage")
        .populate("recipientId", "firstName lastName profileImage");

      // Emit to recipient
      io.to(recipientId).emit("new_message", populatedMessage);

      // Emit back to sender for confirmation
      io.to(senderId).emit("message_sent", populatedMessage);

      // Create notification
      await createNotification(
        recipientId,
        "New Message",
        `You have a new message from ${data.senderName || "someone"}`,
        "message",
        `/messages/${senderId}`,
      );
    } catch (error) {
      console.error("❌ Message error:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Send group message
  socket.on("send_group_message", async (data) => {
    try {
      const { senderId, groupId, content, messageType, attachmentUrl } = data;

      const message = await GroupMessage.create({
        senderId,
        groupId,
        content,
        messageType: messageType || "text",
        attachmentUrl,
      });

      const populatedMessage = await GroupMessage.findById(
        message._id,
      ).populate("senderId", "firstName lastName profileImage");

      // Emit to all group members
      io.to(`group_${groupId}`).emit("new_group_message", populatedMessage);
    } catch (error) {
      console.error("❌ Group message error:", error);
      socket.emit("error", { message: "Failed to send group message" });
    }
  });

  // Mark message as read
  socket.on("mark_read", async (messageId) => {
    try {
      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          isRead: true,
          readAt: new Date(),
        },
        { new: true },
      );

      if (message) {
        io.to(message.senderId.toString()).emit("message_read", { messageId });
      }
    } catch (error) {
      console.error("❌ Mark read error:", error);
    }
  });

  // Typing indicator
  socket.on("typing", (data) => {
    const { userId, recipientId, isTyping } = data;
    io.to(recipientId).emit("user_typing", { userId, isTyping });
  });

  // Online status
  socket.on("online", (userId) => {
    socket.join("online_users");
    io.emit("user_online", { userId });
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket.io client disconnected:", socket.id);
  });
});

// ============================================
// API ROUTES START HERE
// ============================================

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ECONNECT Multi-School & Talent Management System API",
    version: "2.0.0",
    features: [
      "7+ User Roles",
      "Beem OTP & SMS",
      "AzamPay Payments",
      "Socket.io Messaging",
      "Multi-School Isolation",
      "File Uploads",
      "Events & Registration",
      "Revenue Tracking",
      "Books Store",
      "Business Management",
      "Comprehensive Analytics",
      "Registration Type System", // ✅ ADD THIS
      "Monthly Billing Automation", // ✅ ADD THIS
    ],
    documentation: "/api/docs",
    status: "operational",
  });
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const dbStatus =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    const [userCount, schoolCount, eventCount] = await Promise.all([
      User.countDocuments(),
      School.countDocuments(),
      Event.countDocuments(),
    ]);

    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        socketio: "active",
      },
      stats: {
        users: userCount,
        schools: schoolCount,
        events: eventCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: "unhealthy",
      error: error.message,
    });
  }
});

// ============================================
// REFRESH TOKEN ENDPOINT
// ============================================

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: "Refresh token is required",
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired refresh token",
      });
    }

    // Find user
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if user is active
    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        error: "Account is not active",
      });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }, // 24 hours
    );

    console.log(`✅ Token refreshed for user: ${user.username}`);

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        token: newAccessToken,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error refreshing token:", error);
    res.status(500).json({
      success: false,
      error: "Failed to refresh token",
    });
  }
});

// ============================================
// VALIDATION MIDDLEWARE HELPERS
// ============================================

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

async function calculateRegistrationFeePaid(userId) {
  try {
    // ✅ FIX: ONLY count verified/approved/completed payments (exclude pending invoices!)
    const paidPayments = await PaymentHistory.find({
      userId,
      status: { $in: ["verified", "approved", "completed"] }, // ✅ CORRECT
      transactionType: "registration_fee", // ✅ ADDED: Only registration payments
    });

    const total = paidPayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    console.log(
      `💰 User ${userId}: Calculated registration_fee_paid = ${total} TZS`,
    );

    return total;
  } catch (error) {
    console.error(
      `❌ Error calculating registration fee paid for user ${userId}:`,
      error,
    );
    return 0;
  }
}

// ============================================================================
// ✅ UPDATED REGISTRATION ENDPOINT WITH NEW SMS SERVICE
// ============================================================================

app.post(
  "/api/auth/register",
  authLimiter,
  [
    // ✅ Phone validation
    body("phone")
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Valid phone number is required"),

    // ✅ Names validation (nested fields)
    body("names.first")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("First name must be between 2 and 50 characters"),
    body("names.middle").optional().trim(),
    body("names.last")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("Last name must be between 2 and 50 characters"),

    // ✅ Role validation
    body("role")
      .isIn([
        "student",
        "teacher",
        "headmaster",
        "staff",
        "entrepreneur",
        "super_admin",
        "district_official",
        "regional_official",
        "national_official",
        "tamisemi",
      ])
      .withMessage("Invalid role"),

    // ✅ Email validation (optional)
    body("email")
      .optional({ nullable: true, checkFalsy: true })
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email address"),

    // ✅ Gender validation (optional)
    body("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Invalid gender"),

    // ✅ Location validation (optional)
    body("location.region").optional().trim().isString(),
    body("location.district").optional().trim().isString(),
    body("location.ward").optional().trim().isString(),

    // ✅ School ID validation
    body("school_id").optional().trim(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        phone,
        names,
        email,
        role,
        school_id,
        gender,
        accepted_terms,
        student,
        teacher,
        entrepreneur,
        location,
        payment,
      } = req.body;

      console.log("📥 Registration request received:", {
        phone,
        role,
        hasNames: !!names,
        hasLocation: !!location,
        school_id,
        hasTalents: !!student?.talents,
      });

      let smsResult = { success: false, error: "SMS not sent" };

      // Validation
      if (!phone || !names || !names.first || !names.last || !role) {
        return res.status(400).json({
          success: false,
          error: "Phone, names (first & last), and role are required",
        });
      }
      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { phoneNumber: phone },
          { username: phone },
          ...(email ? [{ email }] : []),
        ],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "Phone number or email already exists",
        });
      }

      // ✅ GENERATE SECURE PASSWORD
      // ✅ Use centralized function for consistency
      const generatedPassword = generateRandomPassword(); // Already defined!
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      // Build user object
      const userData = {
        username: phone,
        email: email || `${phone.replace(/[^0-9]/g, "")}@econnect.temp`,
        password: hashedPassword,
        role,
        firstName: names.first,
        middleName: names.middle || "",
        lastName: names.last,
        phoneNumber: phone,
        gender: gender || undefined,
        accountStatus: "inactive", // ✅ PHASE 2: Explicit status
        paymentStatus: "no_payment", // ✅ PHASE 2: Explicit payment status
        isActive: false, // Backward compatibility
        accepted_terms: accepted_terms || true,
      };

      // ✅ Add school if provided
      if (school_id) {
        const school = await School.findOne({
          $or: [
            { schoolCode: school_id },
            {
              _id: mongoose.Types.ObjectId.isValid(school_id)
                ? school_id
                : null,
            },
          ],
        });

        if (school) {
          userData.schoolId = school._id;
          console.log(`✅ Found school: ${school.name} (ID: ${school._id})`);
        } else {
          console.warn(`⚠️ School not found for ID: ${school_id}`);
        }
      }

      // ✅ Store location names directly from frontend
      if (location) {
        if (location.region) {
          userData.regionName = location.region;
          console.log(`✅ Stored region name: ${location.region}`);
        }

        if (location.district) {
          userData.districtName = location.district;
          console.log(`✅ Stored district name: ${location.district}`);
        }

        if (location.ward) {
          userData.wardName = location.ward;
          console.log(`✅ Stored ward name: ${location.ward}`);
        }

        // Optional: Still try to find ObjectIds for backward compatibility (non-blocking)
        try {
          if (location.region) {
            const region = await Region.findOne({ name: location.region });
            if (region) userData.regionId = region._id;
          }
          if (location.district) {
            const district = await District.findOne({
              name: location.district,
            });
            if (district) userData.districtId = district._id;
          }
          if (location.ward) {
            const ward = await Ward.findOne({ name: location.ward });
            if (ward) userData.wardId = ward._id;
          }
        } catch (err) {
          console.warn(
            "⚠️ Location ObjectId lookup failed (non-critical):",
            err.message,
          );
        }
      }

      // Add role-specific data
      if (role === "student" && student) {
        userData.classLevel = student.class_level || student.classLevel;
        userData.gradeLevel = student.class_level || student.classLevel;
        userData.course = student.course;
        userData.registration_type = student.registration_type;
        userData.is_ctm_student = student.is_ctm_student !== false;
        userData.registration_date = new Date();
        userData.registration_fee_paid = student.registration_fee_paid || 0;
        userData.institutionType = student.institution_type;

        // Guardian information
        if (student.guardian) {
          userData.guardianName = student.guardian.name;
          userData.guardianPhone = student.guardian.phone;
          userData.guardianRelationship = student.guardian.relationship;
          userData.guardianEmail = student.guardian.email;
          userData.guardianOccupation = student.guardian.occupation;
          userData.guardianNationalId = student.guardian.nationalId;
        }

        // Parent location information
        if (student.parent_location) {
          if (!userData.parentLocation) userData.parentLocation = {};

          if (student.parent_location.region) {
            userData.parentLocation.regionName = student.parent_location.region;
          }
          if (student.parent_location.district) {
            userData.parentLocation.districtName =
              student.parent_location.district;
          }
          if (student.parent_location.ward) {
            userData.parentLocation.wardName = student.parent_location.ward;
          }

          userData.parentAddress = student.parent_location.address;

          // Optional: Still try ObjectId lookups (non-blocking)
          try {
            if (student.parent_location.region) {
              const region = await Region.findOne({
                name: student.parent_location.region,
              });
              if (region) userData.parentRegionId = region._id;
            }
            if (student.parent_location.district) {
              const district = await District.findOne({
                name: student.parent_location.district,
              });
              if (district) userData.parentDistrictId = district._id;
            }
            if (student.parent_location.ward) {
              const ward = await Ward.findOne({
                name: student.parent_location.ward,
              });
              if (ward) userData.parentWardId = ward._id;
            }
          } catch (err) {
            console.warn(
              "⚠️ Parent location ObjectId lookup failed (non-critical)",
            );
          }
        }
      } else if (role === "teacher" && teacher) {
        userData.subjects = teacher.subjects || [];
        userData.otherSubjects =
          teacher.other_subjects || teacher.otherSubjects;
        userData.employeeId = teacher.employee_id;
        userData.institutionType = teacher.institution_type;
        userData.classLevel = teacher.teaching_level;

        console.log(
          `✅ Teacher subjects saved: ${userData.subjects.join(", ")}`,
        );
        if (userData.otherSubjects) {
          console.log(`✅ Other subjects: ${userData.otherSubjects}`);
        }
      } else if (role === "entrepreneur" && entrepreneur) {
        userData.businessName =
          entrepreneur.business_name || entrepreneur.company_name;
        userData.businessType = entrepreneur.business_type;
        userData.businessStatus = entrepreneur.business_status;
        userData.businessWebsite = entrepreneur.business_website;
        userData.businessCategories = entrepreneur.business_categories || [];

        // ✅ ADD THIS LINE:
        userData.registration_type = entrepreneur.registration_type || "silver"; // Default to silver

        userData.biz = {
          business_name:
            entrepreneur.business_name || entrepreneur.company_name,
          categories: entrepreneur.business_categories || [],
          description: entrepreneur.business_type || "Business",
          revenue: 0,
        };
      }

      // Create user
      const user = await User.create(userData);

      console.log("✅ User created successfully:", {
        id: user._id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
      });

      // ============================================
      // 🎯 SEND WELCOME SMS BASED ON ROLE
      // ============================================

      const userName = `${names.first} ${names.last}`;

      try {
        // ============================================================================
        // 1️⃣ STUDENT - Send welcome SMS
        // ============================================================================
        if (role === "student") {
          smsResult = await smsService.sendStudentWelcomeSMS(
            phone,
            userName,
            user._id.toString(),
          );

          if (smsResult.success) {
            console.log(`📱 Student welcome SMS sent to ${phone}`);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Student welcome SMS",
              type: "general",
              status: "sent",
              messageId: smsResult.messageId,
              reference: `student_welcome_${user._id}`,
            });
          } else {
            console.warn(`⚠️ Failed to send student SMS:`, smsResult.error);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Student welcome SMS (failed)",
              type: "general",
              status: "failed",
              errorMessage: smsResult.error || "Unknown error",
              reference: `student_welcome_${user._id}`,
            });
          }
        }

        // ============================================================================
        // 2️⃣ TEACHER - Send welcome SMS
        // ============================================================================
        if (role === "teacher") {
          smsResult = await smsService.sendTeacherWelcomeSMS(
            phone,
            userName,
            user._id.toString(),
          );

          if (smsResult.success) {
            console.log(`📱 Teacher welcome SMS sent to ${phone}`);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Teacher welcome SMS",
              type: "general",
              status: "sent",
              messageId: smsResult.messageId,
              reference: `teacher_welcome_${user._id}`,
            });
          } else {
            console.warn(`⚠️ Failed to send teacher SMS:`, smsResult.error);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Teacher welcome SMS (failed)",
              type: "general",
              status: "failed",
              errorMessage: smsResult.error || "Unknown error",
              reference: `teacher_welcome_${user._id}`,
            });
          }
        }

        // ============================================================================
        // 3️⃣ ENTREPRENEUR - Send welcome SMS
        // ============================================================================
        if (role === "entrepreneur") {
          smsResult = await smsService.sendEntrepreneurWelcomeSMS(
            phone,
            userName,
            user._id.toString(),
            entrepreneur?.registration_type ||
              user.registration_type ||
              "silver",
          );

          if (smsResult.success) {
            console.log(`📱 Entrepreneur welcome SMS sent to ${phone}`);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Entrepreneur welcome SMS",
              type: "general",
              status: "sent",
              messageId: smsResult.messageId,
              reference: `entrepreneur_welcome_${user._id}`,
            });
          } else {
            console.warn(
              `⚠️ Failed to send entrepreneur SMS:`,
              smsResult.error,
            );
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Entrepreneur welcome SMS (failed)",
              type: "general",
              status: "failed",
              errorMessage: smsResult.error || "Unknown error",
              reference: `entrepreneur_welcome_${user._id}`,
            });
          }
        }

        // ============================================================================
        // 4️⃣ NON-STUDENT - Send welcome SMS
        // ============================================================================
        if (role === "nonstudent") {
          smsResult = await smsService.sendNonStudentWelcomeSMS(
            phone,
            userName,
            user._id.toString(),
          );

          if (smsResult.success) {
            console.log(`📱 Non-student welcome SMS sent to ${phone}`);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Non-student welcome SMS",
              type: "general",
              status: "sent",
              messageId: smsResult.messageId,
              reference: `nonstudent_welcome_${user._id}`,
            });
          } else {
            console.warn(`⚠️ Failed to send non-student SMS:`, smsResult.error);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: "Non-student welcome SMS (failed)",
              type: "general",
              status: "failed",
              errorMessage: smsResult.error || "Unknown error",
              reference: `nonstudent_welcome_${user._id}`,
            });
          }
        }

        // ============================================================================
        // 5️⃣ OTHER ROLES (Headmaster, Staff, Officials) - Send welcome SMS
        // ============================================================================
        if (
          [
            "headmaster",
            "staff",
            "district_official",
            "regional_official",
            "national_official",
            "tamisemi",
          ].includes(role)
        ) {
          const smsMessage = `Karibu ECONNECT, ${userName}!\n\nUmefanikiwa kujisajili. Akaunti yako inasubiri idhini.\n\nUtapokea ujumbe baada ya kuidhinishwa.\n\nUna maswali? Piga simu: 0758061582\n\nAsante!`;

          smsResult = await smsService.sendSMS(
            phone,
            smsMessage,
            `${role}_welcome_${user._id}`,
          );

          if (smsResult.success) {
            console.log(`📱 ${role} welcome SMS sent to ${phone}`);
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: `${role} welcome SMS`,
              type: "general",
              status: "sent",
              messageId: smsResult.messageId,
              reference: `${role}_welcome_${user._id}`,
            });
          } else {
            await SMSLog.create({
              userId: user._id,
              phone: phone,
              message: `${role} welcome SMS (failed)`,
              type: "general",
              status: "failed",
              errorMessage: smsResult.error,
              reference: `${role}_welcome_${user._id}`,
            });
          }
        }
      } catch (smsError) {
        console.error("❌ SMS sending error:", smsError);
        // Don't fail registration if SMS fails - just log it
        smsResult = { success: false, error: smsError.message };
      }
      // ============================================================================
      // 🎯 SAVE TALENTS TO StudentTalent COLLECTION - FIXED WITH AUTO-CREATE
      // ============================================================================

      const talentsArray = student?.talents || entrepreneur?.talents || [];

      if (
        (role === "student" ||
          role === "entrepreneur" ||
          role === "nonstudent") &&
        talentsArray.length > 0
      ) {
        console.log(
          `🎯 Processing ${talentsArray.length} talents for ${role} ${user._id}`,
        );

        try {
          let savedTalentsCount = 0;

          for (const talentName of talentsArray) {
            // Skip empty talent names
            if (!talentName || talentName.trim() === "") {
              continue;
            }

            // ✅ Find talent by name (case-insensitive)
            let talent = await Talent.findOne({
              name: { $regex: new RegExp(`^${talentName.trim()}$`, "i") },
              isActive: true,
            });

            // ✅ AUTO-CREATE IF NOT FOUND
            if (!talent) {
              console.log(`🆕 Auto-creating talent: "${talentName}"`);

              talent = await Talent.create({
                name: talentName.trim(),
                category: "Other",
                description: `Auto-created from ${role} registration`,
                isActive: true,
                icon: "🎯",
              });

              console.log(
                `✅ Created new talent: ${talent.name} (${talent._id})`,
              );
            }

            // Check if already exists
            const exists = await StudentTalent.findOne({
              studentId: user._id,
              talentId: talent._id,
            });

            if (!exists) {
              await StudentTalent.create({
                studentId: user._id,
                talentId: talent._id,
                schoolId: user.schoolId,
                proficiencyLevel: "beginner",
                yearsOfExperience: 0,
                status: "active",
                registeredAt: new Date(),
                updatedAt: new Date(),
              });
              savedTalentsCount++;
              console.log(
                `✅ Created StudentTalent: ${talentName} for ${role} ${user._id}`,
              );
            } else {
              console.log(`⏭️ StudentTalent already exists: ${talentName}`);
            }
          }

          console.log(
            `✅ Successfully saved ${savedTalentsCount}/${talentsArray.length} talents for ${role} ${user._id}`,
          );
        } catch (talentError) {
          console.error(`❌ Error saving ${role} talents:`, talentError);
          // Don't fail registration if talents fail
        }
      } else {
        console.log(
          `ℹ️ No talents provided for ${role} ${user._id} - skipping (talents are optional)`,
        );
      }

      // ============================================================================
      // ✅ AUTO-GENERATE INVOICE if registration type requires payment
      // ============================================================================

      if (role === "student" && student?.registration_type) {
        // ✅ FIXED: Use centralized pricing from utils/packagePricing.js
        const registrationFee = getStudentRegistrationFee(
          student.registration_type,
          student.institution_type || "government",
        );

        if (registrationFee && registrationFee > 0) {
          const invoiceNumber = `INV-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)
            .toUpperCase()}`;

          const getPackageName = (type) => {
            const names = {
              normal: "CTM Club Membership",
              "ctm-club": "CTM Club Membership",
              silver: "EConnect Talent Hub - Silver Package",
              gold: "EConnect Talent Hub - Gold Package",
              platinum: "EConnect Talent Hub - Platinum Package",
            };
            return names[type] || type.toUpperCase();
          };

          const invoice = await Invoice.create({
            user_id: user._id,
            invoiceNumber,
            type: "ctm_membership",
            description: getPackageName(student.registration_type),
            amount: registrationFee, // ✅ CORRECT - Uses centralized pricing
            currency: "TZS",
            status: payment && payment.reference ? "verification" : "unpaid", // ✅ FIXED: "unpaid" instead of "pending"
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            academicYear: new Date().getFullYear().toString(),
            ...(payment &&
              payment.reference && {
                paymentProof: {
                  transactionReference: payment.reference,
                  status: "pending",
                  uploadedAt: new Date(),
                },
              }),
          });

          console.log(
            `💰 Invoice created: ${invoiceNumber} for ${registrationFee} TZS`,
          );

          console.log(
            `📊 PaymentHistory will be created when payment proof is submitted`,
          );

          // Set next billing date for monthly subscriptions (Silver, Gold, Platinum)
          if (
            ["silver", "gold", "platinum"].includes(student.registration_type)
          ) {
            user.next_billing_date = new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            );
            await user.save();
          }
        }
      }

      // ============================================================================
      // ✅ AUTO-GENERATE INVOICE FOR ENTREPRENEURS (INVOICE ONLY - NO PAYMENT HISTORY)
      // ============================================================================

      if (role === "entrepreneur" && entrepreneur?.registration_type) {
        // ✅ FIXED: Get ONLY registration fee (not including first month)
        const registrationFee = getEntrepreneurRegistrationFee(
          entrepreneur.registration_type,
          false, // ✅ false = registration fee only
        );

        if (registrationFee && registrationFee > 0) {
          const invoiceNumber = `INV-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)
            .toUpperCase()}`;

          const getEntrepreneurPackageName = (type) => {
            const names = {
              silver: "EConnect Entrepreneur - Silver Package",
              gold: "EConnect Entrepreneur - Gold Package",
              platinum: "EConnect Entrepreneur - Platinum Package",
            };
            return names[type] || type.toUpperCase();
          };

          const invoice = await Invoice.create({
            user_id: user._id,
            invoiceNumber,
            type: "registration",
            description: getEntrepreneurPackageName(
              entrepreneur.registration_type,
            ),
            amount: registrationFee,
            currency: "TZS",
            status: payment && payment.reference ? "verification" : "unpaid",
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            academicYear: new Date().getFullYear().toString(),
          });

          console.log(
            `💰 Entrepreneur invoice created: ${invoiceNumber} for ${registrationFee} TZS`,
          );

          // ✅ REMOVED: Do NOT create PaymentHistory here!
          // PaymentHistory will be created when entrepreneur submits payment proof
          console.log(
            `📊 PaymentHistory will be created when payment proof is submitted`,
          );
        }
      }

      // ============================================================================
      // ✅ SEND SUCCESS RESPONSE WITH AUTO-GENERATED PASSWORD
      // ============================================================================

      res.status(201).json({
        success: true,
        message: "Registration successful",
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            isActive: user.isActive,
          },
          generatedPassword: generatedPassword,
          smsStatus: smsResult?.success ? "sent" : "failed",
        },
      });
    } catch (error) {
      console.error("❌ Registration error:", error);
      res.status(500).json({
        success: false,
        error: "Registration failed",
        ...(process.env.NODE_ENV === "development" && { debug: error.message }),
      });
    }
  },
);

// ============================================
// ADMIN: VERIFY STUDENT PAYMENT
// ============================================

app.patch(
  "/api/admin/students/:studentId/verify-payment",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const { action, rejectionReason } = req.body;
      const adminId = req.user.id;

      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'Action must be either "approve" or "reject"',
        });
      }

      const student = await User.findById(studentId);

      if (!student || student.role !== "student") {
        return res.status(404).json({
          success: false,
          error: "Student not found",
        });
      }

      if (action === "approve") {
        student.payment_verified_by = adminId;
        student.payment_verified_at = new Date();
        student.accountStatus = "active"; // ✅ PHASE 2: Explicit activation
        student.isActive = true; // Backward compatibility

        await student.save();

        // Update invoice
        const invoice = await Invoice.findOneAndUpdate(
          { user_id: studentId, status: "verification" },
          {
            status: "paid",
            paidDate: new Date(),
            "paymentProof.status": "verified",
            "paymentProof.verifiedBy": adminId,
            "paymentProof.verifiedAt": new Date(),
          },
          { new: true },
        );

        // ✅ NEW: Update payment history
        if (invoice) {
          await PaymentHistory.findOneAndUpdate(
            { invoiceId: invoice._id, status: "submitted" },
            {
              status: "verified",
              verifiedAt: new Date(),
              verifiedBy: adminId,
              $push: {
                statusHistory: {
                  status: "verified",
                  changedBy: adminId,
                  changedAt: new Date(),
                  reason: "Payment verified by admin",
                },
              },
            },
          );
        }

        await createNotification(
          studentId,
          "Payment Verified",
          "Your payment has been verified. Your account is now active!",
          "success",
        );

        await logActivity(
          adminId,
          "PAYMENT_VERIFIED",
          `Verified payment for student ${student.firstName} ${student.lastName}`,
          req,
          {
            student_id: studentId,
            payment_reference: student.payment_reference,
            payment_method: student.payment_method,
          },
        );

        console.log(`✅ Payment verified for student: ${student.username}`);

        res.json({
          success: true,
          message: "Payment verified successfully",
          data: { student },
        });
      } else if (action === "reject") {
        if (!rejectionReason || !rejectionReason.trim()) {
          return res.status(400).json({
            success: false,
            error: "Rejection reason is required",
          });
        }

        student.payment_status = "rejected";
        student.payment_verified_by = adminId;
        student.payment_verified_at = new Date();
        student.accountStatus = "active"; // ✅ PHASE 2: Explicit activation
        student.isActive = true; // Backward compatibility

        await student.save();

        // Update invoice
        const invoice = await Invoice.findOneAndUpdate(
          { user_id: studentId, status: "verification" },
          {
            status: "pending",
            "paymentProof.status": "rejected",
            "paymentProof.verifiedBy": adminId,
            "paymentProof.verifiedAt": new Date(),
            "paymentProof.rejectionReason": rejectionReason.trim(),
          },
          { new: true },
        );

        // ✅ NEW: Update payment history
        if (invoice) {
          await PaymentHistory.findOneAndUpdate(
            { invoiceId: invoice._id, status: "submitted" },
            {
              status: "rejected",
              rejectedAt: new Date(),
              rejectedBy: adminId,
              rejectionReason: rejectionReason.trim(),
              $push: {
                statusHistory: {
                  status: "rejected",
                  changedBy: adminId,
                  changedAt: new Date(),
                  reason: rejectionReason.trim(),
                },
              },
            },
          );
        }

        await createNotification(
          studentId,
          "Payment Rejected",
          `Your payment was rejected: ${rejectionReason}. Please resubmit with correct information.`,
          "warning",
        );

        await logActivity(
          adminId,
          "PAYMENT_REJECTED",
          `Rejected payment for student ${student.firstName} ${student.lastName}`,
          req,
          {
            student_id: studentId,
            rejection_reason: rejectionReason.trim(),
          },
        );

        console.log(`❌ Payment rejected for student: ${student.username}`);

        res.json({
          success: true,
          message: "Payment proof rejected",
          data: { student, rejectionReason },
        });
      }
    } catch (error) {
      console.error("❌ Error verifying payment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to verify payment",
      });
    }
  },
);

// ============================================
// PAYMENT HISTORY ENDPOINTS
// ============================================

// GET Student Payment History
app.get(
  "/api/student/payment-history",
  authenticateToken,
  authorizeRoles("student", "entrepreneur"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const userId = req.user.id;

      const query = { userId };
      if (status) {
        query.status = status;
      }

      const paymentHistory = await PaymentHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("invoiceId", "invoiceNumber amount currency dueDate");

      const total = await PaymentHistory.countDocuments(query);

      // Get summary statistics
      const [totalPaid, totalPending, totalRejected] = await Promise.all([
        PaymentHistory.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              status: "verified",
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        PaymentHistory.countDocuments({
          userId,
          status: { $in: ["pending", "submitted"] },
        }),
        PaymentHistory.countDocuments({ userId, status: "rejected" }),
      ]);

      res.json({
        success: true,
        data: paymentHistory,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          summary: {
            totalPaid: totalPaid[0]?.total || 0,
            totalPending,
            totalRejected,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching payment history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment history",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Admin Payment History (All Students)
app.get(
  "/api/admin/payment-history",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        transactionType,
        startDate,
        endDate,
      } = req.query;
      const admin = await User.findById(req.user.id);

      const query = {};

      if (status) query.status = status;
      if (transactionType) query.transactionType = transactionType;

      // Date range filter
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Filter by school for headmasters
      if (req.user.role === "headmaster" && admin.schoolId) {
        const schoolStudents = await User.find({
          schoolId: admin.schoolId,
          role: "student",
        }).distinct("_id");

        query.userId = { $in: schoolStudents };
      }

      const paymentHistory = await PaymentHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("userId", "firstName lastName email username phoneNumber")
        .populate("invoiceId", "invoiceNumber amount currency dueDate");
      const total = await PaymentHistory.countDocuments(query);

      // Get summary statistics
      const summaryStats = await PaymentHistory.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      res.json({
        success: true,
        data: paymentHistory,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          summary: summaryStats,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching payment history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment history",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Payment History Details (Single Transaction)
app.get("/api/payment-history/:id", authenticateToken, async (req, res) => {
  try {
    const paymentHistory = await PaymentHistory.findById(req.params.id)
      .populate("userId", "firstName lastName email phoneNumber")
      .populate("invoiceId");

    if (!paymentHistory) {
      return res.status(404).json({
        success: false,
        error: "Payment history not found",
      });
    }

    // Check permissions
    const canView =
      req.user.role === "super_admin" ||
      paymentHistory.userId._id.toString() === req.user.id ||
      req.user.role === "headmaster" ||
      req.user.role === "national_official";

    if (!canView) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to view this payment history",
      });
    }

    res.json({
      success: true,
      data: paymentHistory,
    });
  } catch (error) {
    console.error("❌ Error fetching payment details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment details",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// ============================================
// ADMIN: GET PENDING PAYMENTS
// ============================================

app.get(
  "/api/admin/students/pending-payments",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const admin = await User.findById(req.user.id);

      const query = {
        role: "student",
        payment_status: "pending",
      };

      // Filter by school for headmasters
      if (req.user.role === "headmaster" && admin.schoolId) {
        query.schoolId = admin.schoolId;
      }

      const students = await User.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .select(
          "firstName lastName email username phoneNumber payment_method payment_reference registration_type createdAt schoolId",
        )
        .populate("schoolId", "name schoolCode");

      const total = await User.countDocuments(query);

      console.log(
        `✅ Admin fetched ${students.length} pending payments (total: ${total})`,
      );

      res.json({
        success: true,
        data: students,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching pending payments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch pending payments",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// PAYMENT REMINDER HELPER FUNCTIONS
// ============================================

// Helper: Send payment reminder
async function sendPaymentReminder(userId, invoiceId, reminderType) {
  try {
    const invoice = await Invoice.findById(invoiceId).populate(
      "student_id",
      "firstName lastName email phoneNumber",
    );

    if (!invoice) {
      console.error(`Invoice ${invoiceId} not found`);
      return { success: false, error: "Invoice not found" };
    }

    const student = invoice.student_id;
    const daysUntilDue = Math.ceil(
      (new Date(invoice.dueDate) - new Date()) / (1000 * 60 * 60 * 24),
    );

    let message = "";
    let title = "";

    switch (reminderType) {
      case "first_reminder":
        title = "Payment Reminder";
        message = `Your payment of ${invoice.amount.toLocaleString()} ${
          invoice.currency
        } for ${invoice.description} is due in ${daysUntilDue} days (${new Date(
          invoice.dueDate,
        ).toLocaleDateString()}). Please make payment to avoid service interruption.`;
        break;

      case "second_reminder":
        title = "Payment Reminder - Urgent";
        message = `REMINDER: Your payment of ${invoice.amount.toLocaleString()} ${
          invoice.currency
        } for ${
          invoice.description
        } is due in ${daysUntilDue} days. Please pay as soon as possible.`;
        break;

      case "final_notice":
        title = "Final Payment Notice";
        message = `FINAL NOTICE: Your payment of ${invoice.amount.toLocaleString()} ${
          invoice.currency
        } is due ${
          daysUntilDue > 0 ? `in ${daysUntilDue} days` : "TODAY"
        }. Failure to pay may result in account suspension.`;
        break;

      case "overdue":
        title = "Payment Overdue";
        message = `Your payment of ${invoice.amount.toLocaleString()} ${
          invoice.currency
        } is now OVERDUE by ${Math.abs(
          daysUntilDue,
        )} days. Please pay immediately to avoid account suspension.`;
        break;

      default:
        message = `Payment reminder for invoice ${invoice.invoiceNumber}`;
    }

    // Create notification
    await createNotification(
      userId,
      title,
      message,
      "warning",
      `/invoices/${invoiceId}`,
    );

    // Send SMS if available
    if (student.phoneNumber) {
      const smsMessage = `${title}: ${message.substring(
        0,
        150,
      )}... Reference: ${invoice.invoiceNumber}`;
      const smsResult = await smsService.sendSMS(
        student.phoneNumber,
        smsMessage,
        "payment_reminder",
      );

      if (smsResult.success) {
        await SMSLog.create({
          userId: userId,
          phone: student.phoneNumber,
          message: smsMessage,
          type: "payment_reminder",
          status: "sent",
          messageId: smsResult.messageId,
          reference: `reminder_${reminderType}_${invoiceId}`,
        });
      } else {
        await SMSLog.create({
          userId: userId,
          phone: student.phoneNumber,
          message: smsMessage,
          type: "payment_reminder",
          status: "failed",
          errorMessage: smsResult.error,
          reference: `reminder_${reminderType}_${invoiceId}`,
        });
      }
    }

    // Create reminder record
    await PaymentReminder.create({
      userId,
      invoiceId,
      reminderType,
      sentVia: student.phoneNumber ? "all" : "notification",
      dueDate: invoice.dueDate,
      amount: invoice.amount,
      message,
    });

    console.log(`📧 Payment reminder sent: ${reminderType} to user ${userId}`);

    return { success: true, message: "Reminder sent successfully" };
  } catch (error) {
    console.error("❌ Error sending payment reminder:", error);
    return { success: false, error: error.message };
  }
}

// Helper: Send bulk reminders for pending invoices
async function sendBulkPaymentReminders() {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    // Find pending invoices
    const pendingInvoices = await Invoice.find({
      status: { $in: ["pending", "verification"] },
      dueDate: { $exists: true },
    });

    let sentCount = 0;

    for (const invoice of pendingInvoices) {
      const dueDate = new Date(invoice.dueDate);

      // Check if reminder already sent today
      const reminderSentToday = await PaymentReminder.findOne({
        invoiceId: invoice._id,
        sentAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) },
      });

      if (reminderSentToday) {
        continue; // Skip if already sent today
      }

      let reminderType = null;

      if (dueDate < now) {
        // Overdue
        reminderType = "overdue";
      } else if (dueDate <= oneDayFromNow) {
        // 1 day before due
        reminderType = "final_notice";
      } else if (dueDate <= threeDaysFromNow) {
        // 3 days before due
        reminderType = "second_reminder";
      } else if (dueDate <= sevenDaysFromNow) {
        // 7 days before due
        reminderType = "first_reminder";
      }

      if (reminderType) {
        await sendPaymentReminder(
          invoice.student_id,
          invoice._id,
          reminderType,
        );
        sentCount++;
      }
    }

    console.log(`✅ Bulk payment reminders sent: ${sentCount} reminders`);

    return { success: true, sentCount };
  } catch (error) {
    console.error("❌ Error sending bulk reminders:", error);
    return { success: false, error: error.message };
  }
}

// ============================================
// PAYMENT REMINDER ENDPOINTS
// ============================================

// POST Send Manual Payment Reminder
app.post(
  "/api/admin/send-payment-reminder",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { userId, invoiceId, reminderType } = req.body;

      if (!userId || !invoiceId || !reminderType) {
        return res.status(400).json({
          success: false,
          error: "User ID, Invoice ID, and reminder type are required",
        });
      }

      const result = await sendPaymentReminder(userId, invoiceId, reminderType);

      await logActivity(
        req.user.id,
        "PAYMENT_REMINDER_SENT",
        `Sent ${reminderType} reminder to user ${userId}`,
        req,
        { userId, invoiceId, reminderType },
      );

      if (result.success) {
        res.json({
          success: true,
          message: "Payment reminder sent successfully",
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("❌ Error sending reminder:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send reminder",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// POST Send Bulk Payment Reminders (Manual Trigger)
app.post(
  "/api/admin/send-bulk-reminders",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const result = await sendBulkPaymentReminders();

      await logActivity(
        req.user.id,
        "BULK_REMINDERS_SENT",
        `Sent ${result.sentCount || 0} bulk payment reminders`,
        req,
      );

      res.json({
        success: true,
        message: `Sent ${result.sentCount || 0} payment reminders`,
        data: result,
      });
    } catch (error) {
      console.error("❌ Error sending bulk reminders:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send bulk reminders",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student Payment Reminders
app.get(
  "/api/student/payment-reminders",
  authenticateToken,
  authorizeRoles("student", "entrepreneur"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.user.id;

      const reminders = await PaymentReminder.find({ userId })
        .sort({ sentAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("invoiceId", "invoiceNumber amount currency dueDate status");

      const total = await PaymentReminder.countDocuments({ userId });

      res.json({
        success: true,
        data: reminders,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching reminders:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reminders",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// PATCH Mark Reminder as Opened
app.patch(
  "/api/payment-reminders/:id/mark-opened",
  authenticateToken,
  async (req, res) => {
    try {
      const reminder = await PaymentReminder.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { opened: true, openedAt: new Date() },
        { new: true },
      );

      if (!reminder) {
        return res.status(404).json({
          success: false,
          error: "Reminder not found",
        });
      }

      res.json({
        success: true,
        message: "Reminder marked as opened",
        data: reminder,
      });
    } catch (error) {
      console.error("❌ Error marking reminder as opened:", error);
      res.status(500).json({
        success: false,
        error: "Failed to mark reminder as opened",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Payment Reminder Statistics (Admin)
app.get(
  "/api/admin/payment-reminders/stats",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const [remindersByType, openRate, recentReminders] = await Promise.all([
        PaymentReminder.aggregate([
          {
            $group: {
              _id: "$reminderType",
              count: { $sum: 1 },
              opened: { $sum: { $cond: ["$opened", 1, 0] } },
            },
          },
        ]),
        PaymentReminder.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              opened: { $sum: { $cond: ["$opened", 1, 0] } },
            },
          },
        ]),
        PaymentReminder.find()
          .sort({ sentAt: -1 })
          .limit(10)
          .populate("userId", "firstName lastName email")
          .populate("invoiceId", "invoiceNumber amount"),
      ]);

      const openRatePercentage =
        openRate[0]?.total > 0
          ? ((openRate[0].opened / openRate[0].total) * 100).toFixed(2)
          : 0;

      res.json({
        success: true,
        data: {
          remindersByType,
          openRate: {
            total: openRate[0]?.total || 0,
            opened: openRate[0]?.opened || 0,
            percentage: openRatePercentage,
          },
          recentReminders,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching reminder stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch reminder statistics",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ========================================
// ✅ ENHANCED LOGIN ENDPOINT - ROLE-SPECIFIC ERROR MESSAGES
// Supports: Students (Secondary/University), Entrepreneurs, Teachers, Staff, Headmasters
// ========================================

// Login - Enhanced with detailed, role-specific error messages
app.post(
  "/api/auth/login",
  publicRateLimiter,
  [
    // Accept phone, email, or username
    body("username").optional().trim(),
    body("email").optional().trim().isEmail(),
    body("phone").optional().trim(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, email, phone, password } = req.body;

      // Flexible login identifier
      const identifier = username || email || phone;

      if (!identifier || !password) {
        return res.status(400).json({
          success: false,
          error: "Login credentials are required",
        });
      }

      // Find user by phone, email, or username
      const user = await User.findOne({
        $or: [
          { username: identifier },
          { email: identifier },
          { phoneNumber: identifier },
        ],
      }).populate("schoolId regionId districtId wardId");

      // Check if user exists
      if (!user) {
        return res.status(401).json({
          success: false,
          error:
            "Account not found. Please check your credentials or register.",
        });
      }

      // Check password
      if (!(await comparePassword(password, user.password))) {
        return res.status(401).json({
          success: false,
          error: "Incorrect password. Please try again.",
        });
      }

      // ========================================
      // CHECK IF ACCOUNT IS ACTIVE
      // ========================================
      if (user.accountStatus !== "active") {
        // Get user-friendly role name
        const roleName =
          {
            student:
              user.institutionType === "university"
                ? "University Student"
                : "Secondary Student",
            teacher: "Teacher",
            entrepreneur: "Entrepreneur",
            headmaster: "Headmaster",
            staff: "Staff Member",
            superadmin: "Administrator",
          }[user.role] || "User";

        // ========================================
        // 1. CHECK FOR PARTIAL PAYMENT SUSPENSION
        // ========================================
        const paymentHistory = await PaymentHistory.find({
          userId: user._id, // ✅ FIXED: Correct field name
          status: { $in: ["verified", "approved", "completed"] }, // ✅ FIXED: Phase 2 statuses
        });

        const totalPaid = paymentHistory.reduce(
          (sum, payment) => sum + (payment.amount || 0),
          0,
        );

        // Calculate required amount based on role and registration type
        let requiredAmount = 0;
        let packageName = "";

        if (user.role === "student") {
          const regType = user.registrationType || "normal";
          const institutionType =
            user.schoolId?.ownershipType ||
            user.schoolId?.institutionType ||
            user.institutionType ||
            "government";

          const isUniversity =
            user.institutionType === "university" ||
            user.schoolId?.institutionType === "university";

          // University students use different pricing
          if (isUniversity) {
            switch (regType.toLowerCase()) {
              case "ctm-club":
              case "normal":
                requiredAmount = 15000;
                packageName = "Normal Package";
                break;
              case "silver":
                requiredAmount = 20000;
                packageName = "Silver Package";
                break;
              case "gold":
                requiredAmount = 40000;
                packageName = "Gold Package";
                break;
              case "platinum":
                requiredAmount = 80000;
                packageName = "Platinum Package";
                break;
              default:
                requiredAmount = 15000;
                packageName = "Normal Package";
            }
          } else {
            // Secondary students
            switch (regType.toLowerCase()) {
              case "ctm-club":
              case "normal":
                requiredAmount = institutionType === "private" ? 15000 : 8000;
                packageName = "Normal Package";
                break;
              case "silver":
                requiredAmount = 20000;
                packageName = "Silver Package";
                break;
              case "gold":
                requiredAmount = 40000;
                packageName = "Gold Package";
                break;
              case "platinum":
                requiredAmount = 80000;
                packageName = "Platinum Package";
                break;
              default:
                requiredAmount = institutionType === "private" ? 15000 : 8000;
                packageName = "Normal Package";
            }
          }
        } else if (user.role === "entrepreneur") {
          const regType = user.registrationType || "silver";

          switch (regType.toLowerCase()) {
            case "silver":
              requiredAmount = 49000;
              packageName = "Silver Package";
              break;
            case "gold":
              requiredAmount = 120000;
              packageName = "Gold Package";
              break;
            case "platinum":
              requiredAmount = 550000;
              packageName = "Platinum Package";
              break;
            default:
              requiredAmount = 49000;
              packageName = "Silver Package";
          }
        } else if (user.role === "teacher") {
          // Teachers typically don't pay, but if they do:
          requiredAmount = 0; // Free for teachers
        }

        // Check if this is a partial payment suspension
        if (requiredAmount > 0 && totalPaid > 0 && totalPaid < requiredAmount) {
          const remainingBalance = requiredAmount - totalPaid;

          // Role-specific messages
          let contactInfo = "";
          let actionSteps = "";

          if (user.role === "student") {
            const isUniversity = user.institutionType === "university";
            contactInfo = isUniversity
              ? "your university administrator"
              : "your school headmaster or administrator";
            actionSteps = `1. Complete your payment of TZS ${remainingBalance.toLocaleString()}\n2. Contact ${contactInfo} to record the payment\n3. Your account will be activated once payment is verified`;
          } else if (user.role === "entrepreneur") {
            contactInfo = "ECONNECT support";
            actionSteps = `1. Complete your ${packageName} payment of TZS ${remainingBalance.toLocaleString()}\n2. Contact ${contactInfo} at support@econnect.co.tz\n3. Upload payment proof via your dashboard\n4. Your account will be activated within 24 hours of verification`;
          }

          return res.status(403).json({
            success: false,
            error: `Account suspended due to incomplete payment`,
            errorType: "PARTIAL_PAYMENT_SUSPENSION",
            details: {
              reason: "partial_payment",
              userRole: user.role,
              roleName,
              institutionType: user.institutionType,
              totalPaid,
              requiredAmount,
              remainingBalance,
              packageName,
              contactInfo,
              message: `Your ${roleName.toLowerCase()} account (${packageName}) is approved but suspended until full payment is received.\n\nPayment Status:\n• Paid: TZS ${totalPaid.toLocaleString()}\n• Required: TZS ${requiredAmount.toLocaleString()}\n• Balance: TZS ${remainingBalance.toLocaleString()}\n\nNext Steps:\n${actionSteps}`,
            },
          });
        }

        // ========================================
        // 2. CHECK FOR PENDING APPROVAL
        // ========================================
        if (!user.approvedBy && !user.approvedAt) {
          // Role-specific approval messages
          let approvalMessage = "";
          let approver = "";
          let timeline = "24-48 hours";

          if (user.role === "student") {
            const isUniversity = user.institutionType === "university";
            approver = isUniversity
              ? "university administrator"
              : "school headmaster";
            approvalMessage = `Your ${roleName.toLowerCase()} registration is under review by your ${approver}.`;
          } else if (user.role === "entrepreneur") {
            approver = "ECONNECT administrator";
            timeline = "48-72 hours";
            approvalMessage = `Your entrepreneur account is being reviewed by the ${approver}.`;
          } else if (user.role === "teacher") {
            approver = "school headmaster";
            approvalMessage = `Your teacher account is pending approval from your ${approver}.`;
          } else {
            approver = "administrator";
            approvalMessage = `Your ${roleName.toLowerCase()} account is pending approval.`;
          }

          return res.status(403).json({
            success: false,
            error: `Account pending ${approver} approval`,
            errorType: "PENDING_APPROVAL",
            details: {
              reason: "awaiting_approval",
              userRole: user.role,
              roleName,
              institutionType: user.institutionType,
              registrationType: user.registrationType, // ✅ ADD: Package information
              packageName, // ✅ ADD: Calculated package name
              requiredAmount, // ✅ ADD: Expected payment amount
              approver,
              timeline,
              message: `${approvalMessage}\n\nWhat happens next:\n✅ ${approver} will review your information\n✅ You'll be notified once approved (usually within ${timeline})\n✅ Login credentials confirmation will be sent via SMS\n\nPlease wait for approval notification.`,
            },
          });
        }

        // ========================================
        // 3. GENERIC SUSPENSION (was approved but later deactivated)
        // ========================================
        if (user.approvedBy) {
          // Role-specific suspension messages
          let suspensionMessage = "";
          let contactPerson = "";

          if (user.role === "student") {
            const isUniversity = user.institutionType === "university";
            contactPerson = isUniversity
              ? "university administrator"
              : "school headmaster";
            suspensionMessage = `Your ${roleName.toLowerCase()} account has been temporarily suspended.`;
          } else if (user.role === "entrepreneur") {
            contactPerson = "ECONNECT support team";
            suspensionMessage = `Your entrepreneur account has been temporarily suspended.`;
          } else if (user.role === "teacher") {
            contactPerson = "school headmaster";
            suspensionMessage = `Your teacher account has been temporarily suspended.`;
          } else {
            contactPerson = "administrator";
            suspensionMessage = `Your account has been temporarily suspended.`;
          }

          return res.status(403).json({
            success: false,
            error: "Account suspended. Please contact administrator",
            errorType: "ACCOUNT_SUSPENDED",
            details: {
              reason: "generic_suspension",
              userRole: user.role,
              roleName,
              institutionType: user.institutionType,
              contactPerson,
              message: `${suspensionMessage}\n\nThis may be due to:\n• Pending verification\n• Policy violation\n• Administrative review\n• End of school year/semester\n\nPlease contact your ${contactPerson} for details.\n\nECONNECT Support: support@econnect.co.tz`,
            },
          });
        }

        // ========================================
        // 4. NEVER APPROVED (deactivated during registration)
        // ========================================
        let notApprovedMessage = "";
        let whoApproves = "";

        if (user.role === "student") {
          const isUniversity = user.institutionType === "university";
          whoApproves = isUniversity
            ? "university administrator"
            : "school headmaster";
          notApprovedMessage = `Your ${roleName.toLowerCase()} account needs approval from your ${whoApproves} before you can login.`;
        } else if (user.role === "entrepreneur") {
          whoApproves = "ECONNECT administrator";
          notApprovedMessage = `Your entrepreneur account needs approval from the ${whoApproves}.`;
        } else if (user.role === "teacher") {
          whoApproves = "school headmaster";
          notApprovedMessage = `Your teacher account needs approval from your ${whoApproves}.`;
        } else {
          whoApproves = "administrator";
          notApprovedMessage = `Your account needs administrator approval.`;
        }

        return res.status(403).json({
          success: false,
          error: `Account not approved. Please contact ${whoApproves}`,
          errorType: "NOT_APPROVED",
          details: {
            reason: "not_approved",
            userRole: user.role,
            roleName,
            institutionType: user.institutionType,
            whoApproves,
            message: `${notApprovedMessage}\n\nPlease wait for approval notification via SMS or contact your ${whoApproves}.`,
          },
        });
      }

      // ========================================
      // SUCCESS: Account is active
      // ========================================
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = generateToken(user);

      // Log successful login
      await logActivity(user._id, "USER_LOGIN", `${user.role} logged in`, req);

      // Return success response with enhanced user data
      res.json({
        success: true,
        message: `Welcome back, ${user.firstName}!`,
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            schoolId: user.schoolId,
            regionId: user.regionId,
            districtId: user.districtId,
            wardId: user.wardId,
            profileImage: user.profileImage,
            isPhoneVerified: user.isPhoneVerified,
            isEmailVerified: user.isEmailVerified,
            lastLogin: user.lastLogin,
            registrationType: user.registrationType,
            institutionType: user.institutionType,
            approvedBy: user.approvedBy,
            approvedAt: user.approvedAt,
          },
          token,
        },
      });
    } catch (error) {
      console.error("❌ Login error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed. Please try again.",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Get current user profile
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("schoolId regionId districtId");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("❌ Error fetching user profile:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user profile",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Update user profile
app.put("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const allowedUpdates = [
      "firstName",
      "lastName",
      "phoneNumber",
      "address",
      "emergencyContact",
      "profileImage",
      "dateOfBirth",
      "gender",
    ];

    const updates = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    updates.updatedAt = new Date();

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    await logActivity(
      req.user.id,
      "PROFILE_UPDATED",
      "User updated their profile",
      req,
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update profile",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Change password
app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 8 characters long",
      });
    }

    const user = await User.findById(req.user.id);
    const isPasswordValid = await comparePassword(
      currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    await logActivity(
      req.user.id,
      "PASSWORD_CHANGED",
      "User changed their password",
      req,
    );

    await createNotification(
      req.user.id,
      "Password Changed",
      "Your password has been changed successfully",
      "success",
    );

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("❌ Error changing password:", error);
    res.status(500).json({
      success: false,
      error: "Failed to change password",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Forgot password - Request OTP
app.post(
  "/api/auth/forgot-password",
  publicRateLimiter,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email address"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        // Don't reveal if email exists
        return res.json({
          success: true,
          message: "If the email exists, you will receive a password reset OTP",
        });
      }

      if (!user.phoneNumber) {
        return res.status(400).json({
          success: false,
          error: "No phone number associated with this account",
        });
      }

      await sendOTP(user.phoneNumber, "password_reset");

      res.json({
        success: true,
        message: "Password reset OTP sent to your registered phone number",
      });
    } catch (error) {
      console.error("❌ Forgot password error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process request",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Reset password with OTP
app.post(
  "/api/auth/reset-password",
  publicRateLimiter,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email address"),
    body("otp")
      .notEmpty()
      .withMessage("OTP is required")
      .isLength({ min: 4, max: 6 })
      .withMessage("OTP must be between 4 and 6 characters"),
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      ),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      const verification = await verifyOTP(
        user.phoneNumber,
        otp,
        "password_reset",
      );

      if (!verification.success) {
        return res.status(400).json(verification);
      }

      user.password = await hashPassword(newPassword);
      await user.save();

      await logActivity(
        user._id,
        "PASSWORD_RESET",
        "Password reset via OTP",
        req,
      );

      await createNotification(
        user._id,
        "Password Reset",
        "Your password has been reset successfully",
        "success",
      );

      res.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      console.error("❌ Reset password error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reset password",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Logout
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    await logActivity(req.user.id, "USER_LOGOUT", "User logged out", req);

    // In a more advanced setup, you might want to blacklist the token

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET student registration type
app.get(
  "/api/student/registration-type",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const student = await User.findById(req.user.id).select(
        "registration_type is_ctm_student registration_date next_billing_date registration_fee_paid",
      );

      if (!student) {
        return res
          .status(404)
          .json({ success: false, error: "Student not found" });
      }

      // Get pricing info
      const registrationFees = {
        normal_registration: { amount: 15000, monthly: false },
        premier_registration: { amount: 70000, monthly: true },
        silver_registration: { amount: 49000, monthly: false },
        diamond_registration: { amount: 55000, monthly: true },
      };

      const typeInfo = registrationFees[student.registration_type] || null;

      res.json({
        success: true,
        data: {
          registration_type: student.registration_type,
          is_ctm_student: student.is_ctm_student,
          registration_date: student.registration_date,
          next_billing_date: student.next_billing_date,
          fee_paid: student.registration_fee_paid,
          type_info: typeInfo,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching registration type:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch registration type" });
    }
  },
);

// ============================================
// FILE UPLOAD ENDPOINTS
// ============================================

// Upload profile image
app.post(
  "/api/upload/avatar",
  authenticateToken,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      await User.findByIdAndUpdate(req.user.id, {
        profileImage: avatarUrl,
        updatedAt: new Date(),
      });

      await logActivity(
        req.user.id,
        "AVATAR_UPLOADED",
        "User uploaded profile image",
        req,
      );

      res.json({
        success: true,
        message: "Avatar uploaded successfully",
        data: { avatarUrl },
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({
        success: false,
        error: "Upload failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Upload book files (cover + PDF)
app.post(
  "/api/upload/book",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "entrepreneur"),
  upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const coverUrl = req.files["cover"]
        ? `/uploads/covers/${req.files["cover"][0].filename}`
        : null;
      const pdfUrl = req.files["pdf"]
        ? `/uploads/pdfs/${req.files["pdf"][0].filename}`
        : null;

      res.json({
        success: true,
        message: "Files uploaded successfully",
        data: { coverUrl, pdfUrl },
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({
        success: false,
        error: "Upload failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Upload certificate
app.post(
  "/api/upload/certificate",
  authenticateToken,
  upload.single("certificate"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      const certificateUrl = `/uploads/certificates/${req.file.filename}`;

      res.json({
        success: true,
        message: "Certificate uploaded successfully",
        data: { certificateUrl },
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({
        success: false,
        error: "Upload failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Upload business logo
app.post(
  "/api/upload/logo",
  authenticateToken,
  upload.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      const logoUrl = `/uploads/logos/${req.file.filename}`;

      res.json({
        success: true,
        message: "Logo uploaded successfully",
        data: { logoUrl },
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({
        success: false,
        error: "Upload failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Upload event image
app.post(
  "/api/upload/event-image",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      const imageUrl = `/uploads/images/${req.file.filename}`;

      res.json({
        success: true,
        message: "Image uploaded successfully",
        data: { imageUrl },
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      res.status(500).json({
        success: false,
        error: "Upload failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// LOCATION ENDPOINT PERFORMANCE TRACKING
// ============================================

// Add this before your location endpoints (around line 2720)
app.use("/api/locations/:type", (req, res, next) => {
  const start = Date.now();

  // Log on response finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `📊 Location API Usage: ${req.method} ${req.path} - ${duration}ms`,
    );

    // Optional: Track in database or analytics service
    // This helps you monitor the reduction in API calls after frontend optimization
  });

  next();
});

// ============================================
// LOCATION ENDPOINTS
// ============================================

// ✅ ADD THIS DEBUG ENDPOINT HERE
app.get("/api/debug/check-regions", async (req, res) => {
  try {
    const regions = await Region.find({}).select("name code").limit(20);
    const regionCount = await Region.countDocuments();

    console.log("📍 Regions in database:", regions);

    res.json({
      success: true,
      total: regionCount,
      data: regions,
      message: "Check console for details",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LOCATION ENDPOINTS - OPTIMIZED WITH CACHING
// ============================================

// GET all regions (OPTIMIZED - Frontend uses local utility now)
app.get("/api/locations/regions", async (req, res) => {
  try {
    // ✅ Log deprecated usage (optional monitoring)
    console.warn(
      "⚠️  DEPRECATED ENDPOINT CALLED: /api/locations/regions - Consider using frontend utility",
    );

    // ✅ Set aggressive cache headers (24 hours)
    res.set({
      "Cache-Control": "public, max-age=86400, s-maxage=86400", // 24 hours
      Expires: new Date(Date.now() + 86400000).toUTCString(),
      "X-Deprecated": "Use frontend locations utility for better performance",
    });

    const regions = await Region.find({ isActive: true })
      .sort({ name: 1 })
      .select("_id name code population area isActive createdAt")
      .lean(); // ✅ Use lean() for better performance (returns plain JS objects)

    console.log(`✅ Fetched ${regions.length} regions (cached response)`);

    res.json({
      success: true,
      data: regions,
      meta: {
        cached: true,
        cacheExpiry: "24 hours",
        recommendation: "Use frontend locations utility for instant loading",
      },
    });
  } catch (error) {
    console.error("❌ Error fetching regions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch regions",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET districts (OPTIMIZED - Frontend uses local utility now)
app.get("/api/locations/districts", async (req, res) => {
  try {
    const { region_id } = req.query;

    // ✅ Log deprecated usage
    console.warn(
      "⚠️  DEPRECATED ENDPOINT CALLED: /api/locations/districts - Consider using frontend utility",
    );

    // ✅ Set aggressive cache headers
    res.set({
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      Expires: new Date(Date.now() + 86400000).toUTCString(),
      "X-Deprecated": "Use frontend locations utility for better performance",
    });

    const query = { isActive: true };
    if (region_id) {
      query.regionId = region_id;
    }

    const districts = await District.find(query)
      .sort({ name: 1 })
      .select("_id name code regionId population area isActive createdAt")
      .populate("regionId", "name code")
      .lean(); // ✅ Better performance

    console.log(
      `✅ Fetched ${districts.length} districts${
        region_id ? ` for region ${region_id}` : ""
      } (cached response)`,
    );

    res.json({
      success: true,
      data: districts,
      meta: {
        cached: true,
        cacheExpiry: "24 hours",
        recommendation: "Use frontend locations utility for instant loading",
      },
    });
  } catch (error) {
    console.error("❌ Error fetching districts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch districts",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET wards (OPTIMIZED - Frontend uses local utility now)
app.get("/api/locations/wards", async (req, res) => {
  try {
    const { district_id } = req.query;

    // ✅ Log deprecated usage
    console.warn(
      "⚠️  DEPRECATED ENDPOINT CALLED: /api/locations/wards - Consider using frontend utility",
    );

    // ✅ Set aggressive cache headers
    res.set({
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      Expires: new Date(Date.now() + 86400000).toUTCString(),
      "X-Deprecated": "Use frontend locations utility for better performance",
    });

    const query = { isActive: true };
    if (district_id) {
      query.districtId = district_id;
    }

    const wards = await Ward.find(query)
      .sort({ name: 1 })
      .select("_id name code districtId population isActive createdAt")
      .populate("districtId", "name code")
      .lean(); // ✅ Better performance

    console.log(
      `✅ Fetched ${wards.length} wards${
        district_id ? ` for district ${district_id}` : ""
      } (cached response)`,
    );

    res.json({
      success: true,
      data: wards,
      meta: {
        cached: true,
        cacheExpiry: "24 hours",
        recommendation: "Use frontend locations utility for instant loading",
      },
    });
  } catch (error) {
    console.error("❌ Error fetching wards:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch wards",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// ============================================
// NEW: GET ALL LOCATIONS (Combined endpoint for initial sync)
// ============================================

app.get("/api/locations/all", async (req, res) => {
  try {
    console.log("📍 Fetching ALL location data (combined endpoint)");

    // ✅ Set aggressive cache headers
    res.set({
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      Expires: new Date(Date.now() + 86400000).toUTCString(),
    });

    // ✅ Fetch all location data in parallel
    const [regions, districts, wards] = await Promise.all([
      Region.find({ isActive: true })
        .sort({ name: 1 })
        .select("_id name code")
        .lean(),
      District.find({ isActive: true })
        .sort({ name: 1 })
        .select("_id name code regionId")
        .lean(),
      Ward.find({ isActive: true })
        .sort({ name: 1 })
        .select("_id name code districtId")
        .lean(),
    ]);

    // ✅ Return structured data
    res.json({
      success: true,
      data: {
        regions,
        districts,
        wards,
        stats: {
          totalRegions: regions.length,
          totalDistricts: districts.length,
          totalWards: wards.length,
        },
      },
      meta: {
        cached: true,
        cacheExpiry: "24 hours",
        generatedAt: new Date().toISOString(),
        note: "This endpoint provides all location data in a single request",
      },
    });

    console.log(
      `✅ Returned ALL locations: ${regions.length} regions, ${districts.length} districts, ${wards.length} wards`,
    );
  } catch (error) {
    console.error("❌ Error fetching all locations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch all locations",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE region (admin only)
app.post(
  "/api/locations/regions",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "tamisemi"),
  async (req, res) => {
    try {
      const region = await Region.create(req.body);

      await logActivity(
        req.user.id,
        "REGION_CREATED",
        `Created region: ${region.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Region created successfully",
        data: region,
      });
    } catch (error) {
      console.error("❌ Error creating region:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create region",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE district (admin only)
app.post(
  "/api/locations/districts",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "tamisemi"),
  async (req, res) => {
    try {
      const district = await District.create(req.body);

      await logActivity(
        req.user.id,
        "DISTRICT_CREATED",
        `Created district: ${district.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "District created successfully",
        data: district,
      });
    } catch (error) {
      console.error("❌ Error creating district:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create district",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE ward (admin only)
app.post(
  "/api/locations/wards",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "tamisemi"),
  async (req, res) => {
    try {
      const ward = await Ward.create(req.body);

      await logActivity(
        req.user.id,
        "WARD_CREATED",
        `Created ward: ${ward.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Ward created successfully",
        data: ward,
      });
    } catch (error) {
      console.error("❌ Error creating ward:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create ward",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// SCHOOL ENDPOINTS (with Multi-School Isolation)
// ============================================

// GET all schools (with caching)
app.get("/api/schools", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      q,
      type,
      regionId,
      districtId,
      wardId,
      isActive = true,
    } = req.query;

    const query = {};

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Text search
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { schoolCode: { $regex: q, $options: "i" } },
      ];
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by region
    if (regionId) {
      query.regionId = regionId;
    }

    // Filter by district
    if (districtId) {
      query.districtId = districtId;
    }

    // Filter by ward
    if (wardId) {
      query.wardId = wardId;
    }

    const schools = await School.find(query)
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select(
        "_id name schoolCode type ownership regionId districtId wardId address phoneNumber email principalName totalStudents totalTeachers logo isActive establishedYear",
      )
      .populate("regionId", "name code")
      .populate("districtId", "name code")
      .populate("wardId", "name code");

    const total = await School.countDocuments(query);

    console.log(`✅ Fetched ${schools.length} schools (total: ${total})`);

    res.json({
      success: true,
      data: schools,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching schools:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch schools",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET school by ID
app.get("/api/schools/:id", validateObjectId("id"), async (req, res) => {
  try {
    const school = await School.findById(req.params.id)
      .populate("regionId", "name code")
      .populate("districtId", "name code")
      .populate("wardId", "name code");

    if (!school) {
      return res.status(404).json({
        success: false,
        error: "School not found",
      });
    }

    // Get additional stats
    const [studentCount, teacherCount, talentCount] = await Promise.all([
      User.countDocuments({
        schoolId: school._id,
        role: "student",
        isActive: true,
      }),
      User.countDocuments({
        schoolId: school._id,
        role: "teacher",
        isActive: true,
      }),
      StudentTalent.countDocuments({ schoolId: school._id }),
    ]);

    const schoolData = school.toObject();
    schoolData.stats = {
      students: studentCount,
      teachers: teacherCount,
      talents: talentCount,
    };

    res.json({
      success: true,
      data: schoolData,
    });
  } catch (error) {
    console.error("❌ Error fetching school:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch school",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE new school (admin only)
app.post(
  "/api/schools",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "tamisemi"),
  async (req, res) => {
    try {
      const schoolData = { ...req.body };

      // ✅ ADDED: Convert location codes/names to ObjectIds
      if (schoolData.regionCode) {
        const region = await Region.findOne({
          $or: [
            { code: { $regex: new RegExp(`^${schoolData.regionCode}$`, "i") } },
            { name: { $regex: new RegExp(`^${schoolData.regionCode}$`, "i") } },
          ],
        });

        if (region) {
          schoolData.regionId = region._id;
          delete schoolData.regionCode;
          console.log(`✅ Found region: ${region.name} (${region.code})`);
        } else {
          console.warn(`⚠️ Region not found: ${schoolData.regionCode}`);
        }
      }

      if (schoolData.districtCode) {
        const district = await District.findOne({
          $or: [
            {
              code: { $regex: new RegExp(`^${schoolData.districtCode}$`, "i") },
            },
            {
              name: { $regex: new RegExp(`^${schoolData.districtCode}$`, "i") },
            },
          ],
        });

        if (district) {
          schoolData.districtId = district._id;
          delete schoolData.districtCode;
          console.log(`✅ Found district: ${district.name} (${district.code})`);
        } else {
          console.warn(`⚠️ District not found: ${schoolData.districtCode}`);
        }
      }

      if (schoolData.wardCode) {
        const ward = await Ward.findOne({
          $or: [
            { code: { $regex: new RegExp(`^${schoolData.wardCode}$`, "i") } },
            { name: { $regex: new RegExp(`^${schoolData.wardCode}$`, "i") } },
          ],
        });

        if (ward) {
          schoolData.wardId = ward._id;
          delete schoolData.wardCode;
          console.log(`✅ Found ward: ${ward.name} (${ward.code})`);
        }
      }

      // Create the school with ObjectIds
      const school = await School.create(schoolData);

      // Populate the references for the response
      await school.populate([
        { path: "regionId", select: "name code" },
        { path: "districtId", select: "name code" },
        { path: "wardId", select: "name code" },
      ]);

      await logActivity(
        req.user.id,
        "SCHOOL_CREATED",
        `Created school: ${school.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "School created successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error creating school:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create school",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);
// UPDATE school
app.put(
  "/api/schools/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "tamisemi",
    "headmaster",
  ),
  async (req, res) => {
    try {
      // If headmaster, verify they own this school
      if (
        req.user.role === "headmaster" &&
        req.user.schoolId.toString() !== req.params.id
      ) {
        return res.status(403).json({
          success: false,
          error: "You can only update your own school",
        });
      }

      const school = await School.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true },
      );

      if (!school) {
        return res.status(404).json({
          success: false,
          error: "School not found",
        });
      }

      await logActivity(
        req.user.id,
        "SCHOOL_UPDATED",
        `Updated school: ${school.name}`,
        req,
      );

      res.json({
        success: true,
        message: "School updated successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error updating school:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update school",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE school (soft delete)
app.delete(
  "/api/schools/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const school = await School.findByIdAndUpdate(
        req.params.id,
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );

      if (!school) {
        return res.status(404).json({
          success: false,
          error: "School not found",
        });
      }

      await logActivity(
        req.user.id,
        "SCHOOL_DELETED",
        `Deleted school: ${school.name}`,
        req,
      );

      res.json({
        success: true,
        message: "School deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting school:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete school",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// TALENT ENDPOINTS
// ============================================

// GET all talents
app.get("/api/talents", async (req, res) => {
  try {
    const { category, isActive = true } = req.query;

    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (category) {
      query.category = category;
    }

    const talents = await Talent.find(query)
      .sort({ category: 1, name: 1 })
      .select(
        "_id name category description icon requirements isActive createdAt",
      );

    console.log(`✅ Fetched ${talents.length} talents`);

    res.json({
      success: true,
      data: talents,
    });
  } catch (error) {
    console.error("❌ Error fetching talents:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch talents",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET talent by ID
app.get("/api/talents/:id", async (req, res) => {
  try {
    const talent = await Talent.findById(req.params.id);

    if (!talent) {
      return res.status(404).json({
        success: false,
        error: "Talent not found",
      });
    }

    // Get student count for this talent
    const studentCount = await StudentTalent.countDocuments({
      talentId: talent._id,
    });

    const talentData = talent.toObject();
    talentData.studentCount = studentCount;

    res.json({
      success: true,
      data: talentData,
    });
  } catch (error) {
    console.error("❌ Error fetching talent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch talent",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE new talent (admin only)
app.post(
  "/api/talents",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const { name, category, description, icon, requirements } = req.body;

      if (!name || !category) {
        return res.status(400).json({
          success: false,
          error: "Name and category are required",
        });
      }

      // Check if talent already exists
      const existingTalent = await Talent.findOne({ name, category });
      if (existingTalent) {
        return res.status(409).json({
          success: false,
          error: "Talent already exists in this category",
        });
      }

      const talent = await Talent.create({
        name,
        category,
        description,
        icon,
        requirements,
      });

      await logActivity(
        req.user.id,
        "TALENT_CREATED",
        `Created talent: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Talent created successfully",
        data: talent,
      });
    } catch (error) {
      console.error("❌ Error creating talent:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create talent",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE talent
app.put(
  "/api/talents/:id",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const talent = await Talent.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });

      if (!talent) {
        return res.status(404).json({
          success: false,
          error: "Talent not found",
        });
      }

      await logActivity(
        req.user.id,
        "TALENT_UPDATED",
        `Updated talent: ${talent.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Talent updated successfully",
        data: talent,
      });
    } catch (error) {
      console.error("❌ Error updating talent:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update talent",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE talent (soft delete)
app.delete(
  "/api/talents/:id",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const talent = await Talent.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true },
      );

      if (!talent) {
        return res.status(404).json({
          success: false,
          error: "Talent not found",
        });
      }

      await logActivity(
        req.user.id,
        "TALENT_DELETED",
        `Deleted talent: ${talent.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Talent deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting talent:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete talent",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// STUDENT TALENT REGISTRATION ENDPOINTS
// ============================================

// GET student talents (for a specific student)
app.get(
  "/api/students/:studentId/talents",
  authenticateToken,
  validateObjectId("studentId"),
  async (req, res) => {
    try {
      const studentTalents = await StudentTalent.find({
        studentId: req.params.studentId,
      })
        .populate("talentId", "name category description icon")
        .populate("teacherId", "firstName lastName email phoneNumber")
        .populate("schoolId", "name schoolCode");

      res.json({
        success: true,
        data: studentTalents,
      });
    } catch (error) {
      console.error("❌ Error fetching student talents:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch student talents",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// REGISTER student talent
app.post(
  "/api/students/:studentId/talents",
  authenticateToken,
  validateObjectId("studentId"),
  async (req, res) => {
    try {
      const {
        talentId,
        proficiencyLevel,
        yearsOfExperience,
        achievements,
        teacherId,
        schoolId,
      } = req.body;

      // Check if already registered
      const existing = await StudentTalent.findOne({
        studentId: req.params.studentId,
        talentId,
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: "Student already registered for this talent",
        });
      }

      const studentTalent = await StudentTalent.create({
        studentId: req.params.studentId,
        talentId,
        proficiencyLevel: proficiencyLevel || "beginner",
        yearsOfExperience: yearsOfExperience || 0,
        achievements: achievements || [],
        teacherId,
        schoolId: schoolId || req.user.schoolId,
      });

      // Populate for response
      await studentTalent.populate("talentId", "name category");

      await logActivity(
        req.user.id,
        "TALENT_REGISTERED",
        `Student registered for talent`,
        req,
        {
          studentId: req.params.studentId,
          talentId,
        },
      );

      await createNotification(
        req.params.studentId,
        "Talent Registered",
        `You have been registered for ${studentTalent.talentId.name}`,
        "success",
      );

      res.status(201).json({
        success: true,
        message: "Talent registered successfully",
        data: studentTalent,
      });
    } catch (error) {
      console.error("❌ Error registering talent:", error);
      res.status(500).json({
        success: false,
        error: "Failed to register talent",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE student talent
app.put(
  "/api/students/:studentId/talents/:talentId",
  authenticateToken,
  validateObjectId("talentId"),
  validateObjectId("studentId"),
  async (req, res) => {
    try {
      const studentTalent = await StudentTalent.findOneAndUpdate(
        { studentId: req.params.studentId, talentId: req.params.talentId },
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true },
      )
        .populate("talentId", "name category")
        .populate("teacherId", "firstName lastName");

      if (!studentTalent) {
        return res.status(404).json({
          success: false,
          error: "Student talent registration not found",
        });
      }

      await logActivity(
        req.user.id,
        "TALENT_UPDATED",
        `Updated student talent`,
        req,
      );

      res.json({
        success: true,
        message: "Talent updated successfully",
        data: studentTalent,
      });
    } catch (error) {
      console.error("❌ Error updating talent:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update talent",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE student talent registration
app.delete(
  "/api/students/:studentId/talents/:talentId",
  authenticateToken,
  validateObjectId("talentId"),
  validateObjectId("studentId"),
  async (req, res) => {
    try {
      const studentTalent = await StudentTalent.findOneAndDelete({
        studentId: req.params.studentId,
        talentId: req.params.talentId,
      });

      if (!studentTalent) {
        return res.status(404).json({
          success: false,
          error: "Student talent registration not found",
        });
      }

      await logActivity(
        req.user.id,
        "TALENT_UNREGISTERED",
        `Student unregistered from talent`,
        req,
      );

      res.json({
        success: true,
        message: "Talent registration removed successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting talent registration:", error);
      res.status(500).json({
        success: false,
        error: "Failed to remove talent registration",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Add certification to student talent
app.post(
  "/api/students/:studentId/talents/:talentId/certifications",
  authenticateToken,
  validateObjectId("talentId"),
  validateObjectId("studentId"),
  async (req, res) => {
    try {
      const {
        name,
        issuedBy,
        issuedDate,
        expiryDate,
        certificateUrl,
        certificateNumber,
      } = req.body;

      const studentTalent = await StudentTalent.findOne({
        studentId: req.params.studentId,
        talentId: req.params.talentId,
      });

      if (!studentTalent) {
        return res.status(404).json({
          success: false,
          error: "Student talent registration not found",
        });
      }

      studentTalent.certifications.push({
        name,
        issuedBy,
        issuedDate,
        expiryDate,
        certificateUrl,
        certificateNumber,
      });

      studentTalent.updatedAt = new Date();
      await studentTalent.save();

      await logActivity(
        req.user.id,
        "CERTIFICATION_ADDED",
        `Added certification to student talent`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Certification added successfully",
        data: studentTalent,
      });
    } catch (error) {
      console.error("❌ Error adding certification:", error);
      res.status(500).json({
        success: false,
        error: "Failed to add certification",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// BOOKS STORE ENDPOINTS
// ============================================

// GET all books
app.get("/api/books", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      q,
      featured,
      minPrice,
      maxPrice,
      language,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    if (category) query.category = category;
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: "i" } },
        { author: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    if (featured === "true") query.isFeatured = true;
    if (language) query.language = language;
    if (minPrice) query.price = { $gte: parseFloat(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseFloat(maxPrice) };

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const books = await Book.find(query)
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("uploadedBy", "firstName lastName")
      .select("-reviews");

    const total = await Book.countDocuments(query);

    res.json({
      success: true,
      data: books,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching books:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch books",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET book by ID
app.get(
  "/api/books/:id",
  validateObjectId("id"),
  publicRateLimiter,
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id)
        .populate("uploadedBy", "firstName lastName")
        .populate("reviews.userId", "firstName lastName profileImage");

      if (!book) {
        return res.status(404).json({
          success: false,
          error: "Book not found",
        });
      }

      // Increment view count
      book.viewCount += 1;
      await book.save();

      res.json({
        success: true,
        data: book,
      });
    } catch (error) {
      console.error("❌ Error fetching book:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch book",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE book
app.post(
  "/api/books",
  authenticateToken,
  authorizeRoles("super_admin", "entrepreneur", "national_official"),
  async (req, res) => {
    try {
      const book = await Book.create({
        ...req.body,
        uploadedBy: req.user.id,
      });

      await logActivity(
        req.user.id,
        "BOOK_CREATED",
        `Created book: ${book.title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Book created successfully",
        data: book,
      });
    } catch (error) {
      console.error("❌ Error creating book:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create book",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE book
app.put(
  "/api/books/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("super_admin", "entrepreneur", "national_official"),
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id);

      if (!book) {
        return res
          .status(404)
          .json({ success: false, error: "Book not found" });
      }

      // Check ownership for entrepreneurs
      if (
        req.user.role === "entrepreneur" &&
        book.uploadedBy.toString() !== req.user.id
      ) {
        return res
          .status(403)
          .json({ success: false, error: "You can only edit your own books" });
      }

      Object.assign(book, req.body);
      book.updatedAt = new Date();
      await book.save();

      await logActivity(
        req.user.id,
        "BOOK_UPDATED",
        `Updated book: ${book.title}`,
        req,
      );

      res.json({
        success: true,
        message: "Book updated successfully",
        data: book,
      });
    } catch (error) {
      console.error("❌ Error updating book:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update book",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE book
app.delete(
  "/api/books/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("super_admin", "entrepreneur"),
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id);

      if (!book) {
        return res
          .status(404)
          .json({ success: false, error: "Book not found" });
      }

      // Check ownership for entrepreneurs
      if (
        req.user.role === "entrepreneur" &&
        book.uploadedBy.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          error: "You can only delete your own books",
        });
      }

      book.isActive = false;
      book.updatedAt = new Date();
      await book.save();

      await logActivity(
        req.user.id,
        "BOOK_DELETED",
        `Deleted book: ${book.title}`,
        req,
      );

      res.json({
        success: true,
        message: "Book deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting book:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete book",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Purchase book
app.post(
  "/api/books/:id/purchase",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id);
      if (!book) {
        return res
          .status(404)
          .json({ success: false, error: "Book not found" });
      }

      const amount = book.discountPrice || book.price;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res
          .status(400)
          .json({ success: false, error: "Phone number is required" });
      }
      // Manual payment instructions
      res.json({
        success: true,
        message: "Book purchase recorded. Please complete payment manually.",
        data: {
          bookId: book._id,
          bookTitle: book.title,
          amount,
          paymentInstructions: {
            vodacomLipa: "5130676",
            crdbAccount: "0150814579600",
            accountName: "E Connect Limited",
          },
        },
      });
    } catch (error) {
      console.error("❌ Purchase error:", error);
      res.status(500).json({
        success: false,
        error: "Purchase failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Add book review
app.post(
  "/api/books/:id/reviews",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { rating, comment } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res
          .status(400)
          .json({ success: false, error: "Valid rating (1-5) is required" });
      }

      const book = await Book.findById(req.params.id);

      if (!book) {
        return res
          .status(404)
          .json({ success: false, error: "Book not found" });
      }

      // Check if user already reviewed
      const existingReview = book.reviews.find(
        (r) => r.userId.toString() === req.user.id,
      );
      if (existingReview) {
        return res.status(409).json({
          success: false,
          error: "You have already reviewed this book",
        });
      }

      book.reviews.push({
        userId: req.user.id,
        rating,
        comment,
      });

      // Recalculate average rating
      const totalRating = book.reviews.reduce((sum, r) => sum + r.rating, 0);
      book.rating = totalRating / book.reviews.length;
      book.ratingsCount = book.reviews.length;
      book.updatedAt = new Date();

      await book.save();

      await logActivity(
        req.user.id,
        "BOOK_REVIEWED",
        `Reviewed book: ${book.title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Review added successfully",
        data: book,
      });
    } catch (error) {
      console.error("❌ Error adding review:", error);
      res.status(500).json({
        success: false,
        error: "Failed to add review",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Get user's purchased books
app.get("/api/books/purchased", authenticateToken, async (req, res) => {
  try {
    const purchases = await BookPurchase.find({
      userId: req.user.id,
      paymentStatus: "completed",
    })
      .populate("bookId")
      .sort({ purchasedAt: -1 });

    res.json({
      success: true,
      data: purchases,
    });
  } catch (error) {
    console.error("❌ Error fetching purchased books:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch purchased books",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// ============================================
// EVENTS ENDPOINTS
// ============================================

// GET all events
app.get("/api/events", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      eventType,
      status,
      upcoming,
      regionId,
      schoolId,
      q,
    } = req.query;

    const query = {};

    if (eventType) query.eventType = eventType;
    if (status) query.status = status;
    if (regionId) query.regionId = regionId;
    if (schoolId) query.schoolId = schoolId;
    if (upcoming === "true") query.startDate = { $gte: new Date() };
    if (q) {
      query.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const events = await Event.find(query)
      .sort({ startDate: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("organizer", "firstName lastName")
      .populate("schoolId", "name schoolCode")
      .populate("regionId", "name code");

    const total = await Event.countDocuments(query);

    res.json({
      success: true,
      data: events,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching events:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch events",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET event by ID
app.get("/api/events/:id", validateObjectId("id"), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("organizer", "firstName lastName email phoneNumber")
      .populate("schoolId", "name schoolCode")
      .populate("regionId", "name code")
      .populate("districtId", "name code");

    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    // Get registration count
    const registrationCount = await EventRegistration.countDocuments({
      eventId: event._id,
      registrationStatus: { $ne: "cancelled" },
    });

    const eventData = event.toObject();
    eventData.currentParticipants = registrationCount;

    res.json({
      success: true,
      data: eventData,
    });
  } catch (error) {
    console.error("❌ Error fetching event:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch event",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE event
app.post(
  "/api/events",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
    "teacher",
  ),
  async (req, res) => {
    try {
      const event = await Event.create({
        ...req.body,
        organizer: req.user.id,
        schoolId: req.user.schoolId || req.body.schoolId,
        regionId: req.user.regionId || req.body.regionId,
        districtId: req.user.districtId || req.body.districtId,
      });

      await logActivity(
        req.user.id,
        "EVENT_CREATED",
        `Created event: ${event.title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: event,
      });
    } catch (error) {
      console.error("❌ Error creating event:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create event",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE event
app.put(
  "/api/events/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return res
          .status(404)
          .json({ success: false, error: "Event not found" });
      }

      // Check permissions
      const canEdit =
        req.user.role === "super_admin" ||
        event.organizer.toString() === req.user.id;

      if (!canEdit) {
        return res
          .status(403)
          .json({ success: false, error: "You cannot edit this event" });
      }

      Object.assign(event, req.body);
      event.updatedAt = new Date();
      await event.save();

      await logActivity(
        req.user.id,
        "EVENT_UPDATED",
        `Updated event: ${event.title}`,
        req,
      );

      res.json({
        success: true,
        message: "Event updated successfully",
        data: event,
      });
    } catch (error) {
      console.error("❌ Error updating event:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update event",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE event
app.delete(
  "/api/events/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return res
          .status(404)
          .json({ success: false, error: "Event not found" });
      }

      // Check permissions
      const canDelete =
        req.user.role === "super_admin" ||
        event.organizer.toString() === req.user.id;

      if (!canDelete) {
        return res
          .status(403)
          .json({ success: false, error: "You cannot delete this event" });
      }

      event.status = "cancelled";
      event.updatedAt = new Date();
      await event.save();

      await logActivity(
        req.user.id,
        "EVENT_DELETED",
        `Cancelled event: ${event.title}`,
        req,
      );

      res.json({
        success: true,
        message: "Event cancelled successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting event:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete event",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Register for event
app.post(
  "/api/events/:id/register",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return res
          .status(404)
          .json({ success: false, error: "Event not found" });
      }

      if (event.status !== "published") {
        return res.status(400).json({
          success: false,
          error: "Event is not open for registration",
        });
      }

      if (
        event.registrationDeadline &&
        new Date() > event.registrationDeadline
      ) {
        return res
          .status(400)
          .json({ success: false, error: "Registration deadline has passed" });
      }

      // Check if already registered
      const existing = await EventRegistration.findOne({
        eventId: event._id,
        userId: req.user.id,
      });

      if (existing) {
        return res
          .status(409)
          .json({ success: false, error: "Already registered for this event" });
      }

      // Check capacity
      if (event.maxParticipants) {
        const currentCount = await EventRegistration.countDocuments({
          eventId: event._id,
          registrationStatus: { $ne: "cancelled" },
        });

        if (currentCount >= event.maxParticipants) {
          return res
            .status(400)
            .json({ success: false, error: "Event is full" });
        }
      }

      const registration = await EventRegistration.create({
        eventId: event._id,
        userId: req.user.id,
        schoolId: req.user.schoolId,
        talentId: req.body.talentId,
        teamMembers: req.body.teamMembers,
        notes: req.body.notes,
      });

      // Update event participant count
      event.currentParticipants += 1;
      await event.save();

      await createNotification(
        req.user.id,
        "Event Registration",
        `You have registered for ${event.title}`,
        "success",
        `/events/${event._id}`,
      );

      await logActivity(
        req.user.id,
        "EVENT_REGISTERED",
        `Registered for event: ${event.title}`,
        req,
      );

      // Event registration without payment gateway
      if (event.registrationFee > 0) {
        // Create pending payment record
        registration.paymentStatus = "pending";
        registration.notes =
          "Payment pending - contact organizer for payment instructions";
        await registration.save();
      }

      res.status(201).json({
        success: true,
        message: "Registered successfully",
        data: registration,
      });
    } catch (error) {
      console.error("❌ Registration error:", error);
      res.status(500).json({
        success: false,
        error: "Registration failed",
        ...(process.env.NODE_ENV === "development" && { debug: error.message }),
      });
    }
  },
);

app.delete(
  "/api/student/events/:eventId/register",
  authenticateToken,
  validateObjectId("eventId"),
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const userId = req.user.id;

      console.log(`🔄 Unregister request: Event ${eventId}, User ${userId}`);

      // Find the event first
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({
          success: false,
          error: "Event not found",
        });
      }

      // Find the registration and mark as cancelled (soft delete)
      const registration = await EventRegistration.findOneAndUpdate(
        {
          eventId: eventId,
          userId: userId,
          registrationStatus: { $ne: "cancelled" }, // Only update if not already cancelled
        },
        {
          registrationStatus: "cancelled",
        },
        { new: true },
      ).populate("eventId", "title");

      if (!registration) {
        return res.status(404).json({
          success: false,
          error: "Registration not found or already cancelled",
        });
      }

      // Decrement event participant count
      if (event.currentParticipants > 0) {
        event.currentParticipants -= 1;
        await event.save();
        console.log(
          `📊 Updated participant count: ${event.currentParticipants}`,
        );
      }

      // Create notification (async, don't block response)
      createNotification(
        userId,
        "Event Unregistered",
        `You have unregistered from "${event.title}"`,
        "info",
        `/events/${event._id}`,
      ).catch((err) => console.error("❌ Notification error:", err));

      // Log activity (async, don't block response)
      logActivity(
        userId,
        "EVENT_UNREGISTERED",
        `Cancelled registration for event: ${event.title}`,
        req,
        {
          eventId: event._id,
          eventTitle: event.title,
          registrationId: registration._id,
        },
      ).catch((err) => console.error("❌ Activity log error:", err));

      console.log(`✅ Successfully unregistered from event: ${event.title}`);

      res.json({
        success: true,
        message: "Successfully unregistered from event",
        data: {
          eventId: event._id,
          eventTitle: event.title,
          registrationStatus: registration.registrationStatus,
          currentParticipants: event.currentParticipants,
        },
      });
    } catch (error) {
      console.error("❌ Error unregistering from event:", error);
      res.status(500).json({
        success: false,
        error: "Failed to unregister from event",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Get event registrations
app.get(
  "/api/events/:id/registrations",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.id);

      if (!event) {
        return res
          .status(404)
          .json({ success: false, error: "Event not found" });
      }

      // Check permissions
      const canView =
        req.user.role === "super_admin" ||
        event.organizer.toString() === req.user.id ||
        [
          "national_official",
          "regional_official",
          "district_official",
          "headmaster",
        ].includes(req.user.role);

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: "You cannot view registrations for this event",
        });
      }

      const registrations = await EventRegistration.find({ eventId: event._id })
        .populate("userId", "firstName lastName email phoneNumber schoolId")
        .populate("schoolId", "name schoolCode")
        .populate("talentId", "name category")
        .sort({ registeredAt: -1 });

      res.json({
        success: true,
        data: registrations,
      });
    } catch (error) {
      console.error("❌ Error fetching registrations:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch registrations",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// BUSINESS & ENTREPRENEUR ENDPOINTS (PART 2 OF 2)
// ============================================

// GET all businesses
app.get("/api/businesses", async (req, res) => {
  try {
    const { page = 1, limit = 20, category, regionId, verified, q } = req.query;

    const query = { status: "active" };

    if (category) query.category = category;
    if (regionId) query.regionId = regionId;
    if (verified === "true") query.isVerified = true;
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const businesses = await Business.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("ownerId", "firstName lastName email")
      .populate("regionId", "name code")
      .populate("districtId", "name code");

    const total = await Business.countDocuments(query);

    res.json({
      success: true,
      data: businesses,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching businesses:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch businesses",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET business by ID
app.get("/api/businesses/:id", async (req, res) => {
  try {
    const business = await Business.findById(req.params.id)
      .populate("ownerId", "firstName lastName email phoneNumber")
      .populate("regionId", "name code")
      .populate("districtId", "name code");

    if (!business) {
      return res
        .status(404)
        .json({ success: false, error: "Business not found" });
    }

    // Get product count
    const productCount = await Product.countDocuments({
      businessId: business._id,
      isActive: true,
    });

    const businessData = business.toObject();
    businessData.productCount = productCount;

    res.json({
      success: true,
      data: businessData,
    });
  } catch (error) {
    console.error("❌ Error fetching business:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch business",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE business
app.post(
  "/api/businesses",
  authenticateToken,
  authorizeRoles("entrepreneur", "super_admin"),
  async (req, res) => {
    try {
      const business = await Business.create({
        ...req.body,
        ownerId: req.user.id,
        status: "pending",
      });

      await logActivity(
        req.user.id,
        "BUSINESS_CREATED",
        `Created business: ${business.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Business created successfully. Pending verification.",
        data: business,
      });
    } catch (error) {
      console.error("❌ Error creating business:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create business",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE business
app.put("/api/businesses/:id", authenticateToken, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);

    if (!business) {
      return res
        .status(404)
        .json({ success: false, error: "Business not found" });
    }

    // Check ownership
    if (
      req.user.role !== "super_admin" &&
      business.ownerId.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ success: false, error: "You can only edit your own business" });
    }

    Object.assign(business, req.body);
    business.updatedAt = new Date();
    await business.save();

    await logActivity(
      req.user.id,
      "BUSINESS_UPDATED",
      `Updated business: ${business.name}`,
      req,
    );

    res.json({
      success: true,
      message: "Business updated successfully",
      data: business,
    });
  } catch (error) {
    console.error("❌ Error updating business:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update business",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Verify business (admin only)
app.patch(
  "/api/businesses/:id/verify",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const business = await Business.findByIdAndUpdate(
        req.params.id,
        {
          isVerified: true,
          status: "active",
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!business) {
        return res
          .status(404)
          .json({ success: false, error: "Business not found" });
      }

      await createNotification(
        business.ownerId,
        "Business Verified",
        `Your business ${business.name} has been verified`,
        "success",
      );

      await logActivity(
        req.user.id,
        "BUSINESS_VERIFIED",
        `Verified business: ${business.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Business verified successfully",
        data: business,
      });
    } catch (error) {
      console.error("❌ Error verifying business:", error);
      res.status(500).json({
        success: false,
        error: "Failed to verify business",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET business products
app.get("/api/businesses/:id/products", async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive = true } = req.query;

    const query = { businessId: req.params.id };
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE product
app.post(
  "/api/businesses/:id/products",
  authenticateToken,
  async (req, res) => {
    try {
      const business = await Business.findById(req.params.id);

      if (!business) {
        return res
          .status(404)
          .json({ success: false, error: "Business not found" });
      }

      // Check ownership
      if (
        req.user.role !== "super_admin" &&
        business.ownerId.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          error: "You can only add products to your own business",
        });
      }

      const product = await Product.create({
        ...req.body,
        businessId: business._id,
      });

      await logActivity(
        req.user.id,
        "PRODUCT_CREATED",
        `Created product: ${product.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: product,
      });
    } catch (error) {
      console.error("❌ Error creating product:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create product",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// PAYMENT PROOF UPLOAD ENDPOINT
// ============================================

app.post(
  "/api/student/invoices/payment-proof",
  authenticateToken,
  upload.single("paymentProof"),
  async (req, res) => {
    // ✅ START TRANSACTION SESSION
    const session = await mongoose.startSession();

    try {
      const { invoiceId, transactionReference, notes } = req.body;
      const userId = req.user.id;
      const file = req.file;

      console.log("📤 Payment proof upload request:", {
        userId,
        invoiceId,
        transactionReference,
        fileName: file?.originalname,
      });

      // ============================================
      // 1️⃣ VALIDATE REQUIRED FIELDS (Outside transaction)
      // ============================================
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "Payment proof file is required",
        });
      }

      if (!invoiceId) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return res.status(400).json({
          success: false,
          error: "Invoice ID is required",
        });
      }

      if (!transactionReference || !transactionReference.trim()) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return res.status(400).json({
          success: false,
          error: "Transaction reference is required",
        });
      }

      // ============================================
      // 2️⃣ FIND INVOICE AND VERIFY OWNERSHIP (Outside transaction)
      // ============================================
      const invoice = await Invoice.findOne({
        _id: invoiceId,
        user_id: userId,
      });

      if (!invoice) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return res.status(404).json({
          success: false,
          error: "Invoice not found or you do not have permission to access it",
        });
      }

      // ============================================
      // 3️⃣ CHECK IF INVOICE IS ALREADY PAID (Outside transaction)
      // ============================================
      if (invoice.status === "paid") {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return res.status(400).json({
          success: false,
          error: "This invoice has already been paid",
        });
      }

      // ============================================
      // 🔒 START TRANSACTION - ALL DB OPERATIONS ATOMIC
      // ============================================
      session.startTransaction();

      console.log("🔒 Transaction started for payment proof upload");

      try {
        // ============================================
        // ✅ NEW: CHECK FOR DUPLICATE PAYMENT REFERENCE (Fraud Prevention)
        // ============================================
        console.log(
          `🔍 Checking for duplicate payment reference: ${transactionReference.trim()}`,
        );

        const duplicateReference = await PaymentHistory.findOne({
          "metadata.transactionReference": transactionReference.trim(),
          userId: { $ne: userId }, // ✅ Different user
          status: { $in: ["submitted", "verified", "approved", "completed"] }, // ✅ Active payments only
        }).session(session); // ✅ Use transaction session

        if (duplicateReference) {
          // ✅ FRAUD DETECTED: Same payment reference used by different user
          await session.abortTransaction();

          console.error(
            `🚨 FRAUD ALERT: Payment reference ${transactionReference.trim()} already used by user ${duplicateReference.userId}`,
          );

          // ✅ Log fraud attempt
          await ActivityLog.create({
            userId: userId,
            action: "PAYMENT_FRAUD_ATTEMPT",
            description: `Attempted to use duplicate payment reference: ${transactionReference.trim()}`,
            metadata: {
              invoiceId: invoiceId,
              transactionReference: transactionReference.trim(),
              originalUserId: duplicateReference.userId,
              originalPaymentId: duplicateReference._id,
              ipAddress: req.ip || req.connection?.remoteAddress,
              userAgent: req.get("user-agent"),
            },
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.get("user-agent"),
          });

          // ✅ Notify super admins
          try {
            const superAdmins = await User.find({
              role: "super_admin",
            }).distinct("_id");
            await Promise.all(
              superAdmins.map((adminId) =>
                createNotification(
                  adminId,
                  "🚨 Fraud Alert: Duplicate Payment Reference",
                  `User ${req.user.firstName} ${req.user.lastName} (${userId}) attempted to use payment reference ${transactionReference.trim()} which was already used by another user.`,
                  "error",
                  `/admin/fraud-alerts`,
                ),
              ),
            );
          } catch (notifError) {
            console.error("Failed to notify admins:", notifError);
          }

          // ✅ Clean up uploaded file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }

          return res.status(400).json({
            success: false,
            error:
              "Invalid payment reference. This payment proof has already been submitted. Please use a unique transaction reference.",
            errorCode: "DUPLICATE_PAYMENT_REFERENCE",
          });
        }

        console.log(
          `✅ Payment reference is unique - proceeding with submission`,
        );

        // ============================================
        // ✅ ADDITIONAL: CHECK IF SAME USER ALREADY USED THIS REFERENCE
        // ============================================
        const ownDuplicateReference = await PaymentHistory.findOne({
          "metadata.transactionReference": transactionReference.trim(),
          userId: userId, // ✅ Same user
          invoiceId: { $ne: invoiceId }, // ✅ Different invoice
        }).session(session);

        if (ownDuplicateReference) {
          await session.abortTransaction();

          console.warn(
            `⚠️ User ${userId} trying to reuse their own payment reference for different invoice`,
          );

          // Clean up uploaded file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }

          return res.status(400).json({
            success: false,
            error:
              "You have already used this payment reference for another invoice. Please use a unique transaction reference for each payment.",
            errorCode: "DUPLICATE_OWN_REFERENCE",
          });
        }

        // ============================================
        // Continue with existing PaymentHistory creation logic...
        // ============================================

        const existingPaymentHistory = await PaymentHistory.findOne({
          invoiceId: invoiceId,
          userId: userId,
        }).session(session);

        // ... rest of your existing code ...
      } catch (transactionError) {
        await session.abortTransaction();
        console.error("❌ Transaction aborted:", transactionError);
        throw transactionError;
      }
    } catch (error) {
      console.error("❌ Error submitting payment proof:", error);

      // ============================================
      // 🧹 CLEANUP: Remove uploaded file on error
      // ============================================
      if (req.file && req.file.path) {
        try {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log(`🧹 Cleaned up file: ${req.file.path}`);
          }
        } catch (cleanupError) {
          console.error("❌ Error cleaning up file:", cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        error: "Failed to submit payment proof. Please try again.",
        ...(process.env.NODE_ENV === "development" && {
          debug: error.message,
        }),
      });
    } finally {
      // ============================================
      // 🔓 END SESSION (Always runs)
      // ============================================
      session.endSession();
      console.log("🔓 Transaction session ended");
    }
  },
);

// ============================================
// ADMIN: VERIFY PAYMENT PROOF
// ============================================

app.patch(
  "/api/admin/invoices/:invoiceId/verify-payment",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'
      const adminId = req.user.id;

      // Validate action
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'Action must be either "approve" or "reject"',
        });
      }

      // Find invoice
      const invoice = await Invoice.findById(invoiceId).populate(
        "user_id",
        "firstName lastName email",
      );
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found",
        });
      }

      // Check if payment proof exists
      if (!invoice.paymentProof || !invoice.paymentProof.fileName) {
        return res.status(400).json({
          success: false,
          error: "No payment proof has been submitted for this invoice",
        });
      }

      if (action === "approve") {
        // Approve payment
        invoice.status = "paid";
        invoice.paidDate = new Date();
        invoice.paymentProof.status = "verified";
        invoice.paymentProof.verifiedBy = adminId;
        invoice.paymentProof.verifiedAt = new Date();

        await invoice.save();

        // Create audit log
        await logActivity(
          adminId,
          "PAYMENT_VERIFIED",
          `Verified payment for invoice ${invoice.invoiceNumber}`,
          req,
          {
            invoice_id: invoiceId,
            invoice_number: invoice.invoiceNumber,
            student_id: invoice.student_id._id,
            amount: invoice.amount,
            transaction_reference: invoice.paymentProof.transactionReference,
          },
        );

        // Notify student
        await createNotification(
          invoice.user_id._id,
          "Payment Verified",
          `Your payment for invoice ${invoice.invoiceNumber} has been verified`,
          "success",
        );

        console.log("Payment verified for invoice:", invoice.invoiceNumber);

        res.json({
          success: true,
          message: "Payment verified successfully",
          data: { invoice },
        });
      } else if (action === "reject") {
        // Reject payment
        if (!rejectionReason || !rejectionReason.trim()) {
          return res.status(400).json({
            success: false,
            error: "Rejection reason is required",
          });
        }

        invoice.status = "pending"; // Back to pending
        invoice.paymentProof.status = "rejected";
        invoice.paymentProof.verifiedBy = adminId;
        invoice.paymentProof.verifiedAt = new Date();
        invoice.paymentProof.rejectionReason = rejectionReason.trim();

        await invoice.save();

        // Create audit log
        await logActivity(
          adminId,
          "PAYMENT_REJECTED",
          `Rejected payment for invoice ${invoice.invoiceNumber}`,
          req,
          {
            invoice_id: invoiceId,
            invoice_number: invoice.invoiceNumber,
            student_id: invoice.student_id._id,
            rejection_reason: rejectionReason.trim(),
          },
        );

        // Notify student
        await createNotification(
          invoice.user_id._id,
          "Payment Rejected",
          `Your payment proof for invoice ${invoice.invoiceNumber} was rejected: ${rejectionReason}`,
          "warning",
        );

        console.log("Payment rejected for invoice:", invoice.invoiceNumber);

        res.json({
          success: true,
          message: "Payment proof rejected",
          data: { invoice, rejectionReason },
        });
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to verify payment",
      });
    }
  },
);

// ============================================
// ADMIN: GET PENDING PAYMENT PROOFS
// ============================================

app.get(
  "/api/admin/invoices/pending-proofs",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Find invoices with pending payment proofs
      const invoices = await Invoice.find({
        status: "verification",
        "paymentProof.status": "pending",
      })
        .populate("user_id", "firstName lastName email username")
        .sort({ "paymentProof.uploadedAt": -1 })
        .skip(skip)
        .limit(limit);

      const total = await Invoice.countDocuments({
        status: "verification",
        "paymentProof.status": "pending",
      });

      res.json({
        success: true,
        data: invoices,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching pending proofs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch pending payment proofs",
      });
    }
  },
);

// ============================================
// ADMIN: VIEW PAYMENT PROOF FILE
// ============================================

app.get(
  "/api/admin/invoices/:invoiceId/payment-proof",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { invoiceId } = req.params;

      const invoice = await Invoice.findById(invoiceId);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found",
        });
      }

      if (!invoice.paymentProof || !invoice.paymentProof.filePath) {
        return res.status(404).json({
          success: false,
          error: "No payment proof found for this invoice",
        });
      }

      const filePath = invoice.paymentProof.filePath;

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: "Payment proof file not found on server",
        });
      }

      // Send file
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      console.error("Error downloading payment proof:", error);
      res.status(500).json({
        success: false,
        error: "Failed to download payment proof",
      });
    }
  },
);

// ============================================
// INVOICE DOWNLOAD ENDPOINT
// ============================================

app.get(
  "/api/student/invoices/:invoiceId/download",
  authenticateToken,
  async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const userId = req.user._id;

      console.log("Invoice download request:", { userId, invoiceId });

      // Find invoice and verify ownership
      const invoice = await Invoice.findOne({
        _id: invoiceId,
        user_id: userId,
      }).populate("user_id", "firstName lastName email");
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found or you do not have permission to access it",
        });
      }

      // For now, return invoice data for client-side PDF generation
      // Later, you can use libraries like pdfkit or puppeteer to generate PDFs server-side

      res.json({
        success: true,
        message: "Invoice data retrieved successfully",
        data: {
          invoice: {
            id: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            type: invoice.type,
            description: invoice.description,
            amount: invoice.amount,
            currency: invoice.currency,
            status: invoice.status,
            dueDate: invoice.dueDate,
            paidDate: invoice.paidDate,
            academicYear: invoice.academicYear,
            createdAt: invoice.createdAt,
          },
          student: {
            name: `${invoice.user_id.firstName} ${invoice.user_id.lastName}`,
            email: invoice.user_id.email,
          },
          company: {
            name: "E Connect Limited",
            address: "Dar es Salaam, Tanzania",
            phone: "+255 XXX XXX XXX",
            email: "info@econnect.co.tz",
          },
          paymentMethods: {
            vodacomLipa: "5130676",
            crdbAccount: "0150814579600",
            accountName: "E Connect Limited",
          },
        },
      });
    } catch (error) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({
        success: false,
        error: "Failed to download invoice. Please try again.",
      });
    }
  },
);

// ============================================
// GET STUDENT INVOICES
// ============================================

app.get(
  "/api/student/invoices",
  authenticateToken,
  authorizeRoles("student", "entrepreneur"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 20 } = req.query;

      const query = { user_id: userId };
      if (status) {
        query.status = status;
      }

      const invoices = await Invoice.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Invoice.countDocuments(query);

      res.json({
        success: true,
        data: invoices,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching student invoices:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch invoices",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// REST OF ENDPOINTS CONTINUE...
//
// ============================================

// Get transactions
app.get("/api/transactions", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, transactionType } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === "student" || req.user.role === "entrepreneur") {
      query.userId = req.user.id;
    } else if (req.user.role === "headmaster" && req.user.schoolId) {
      query.schoolId = req.user.schoolId;
    }

    if (status) query.status = status;
    if (transactionType) query.transactionType = transactionType;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("userId", "firstName lastName email");

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      data: transactions,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch transactions",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Revenue overview
app.get(
  "/api/revenue/overview",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "entrepreneur"),
  async (req, res) => {
    try {
      const { year = new Date().getFullYear(), month } = req.query;

      const query = { year: parseInt(year) };

      if (month) query.month = parseInt(month);

      // For entrepreneurs, filter by their businesses
      if (req.user.role === "entrepreneur") {
        const businesses = await Business.find({
          ownerId: req.user.id,
        }).distinct("_id");
        query.businessId = { $in: businesses };
      }

      const [overview, byType, byMonth] = await Promise.all([
        Revenue.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              totalCommission: { $sum: "$commission" },
              totalNet: { $sum: "$netAmount" },
              count: { $sum: 1 },
            },
          },
        ]),
        Revenue.aggregate([
          { $match: query },
          {
            $group: {
              _id: "$revenueType",
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),
        Revenue.aggregate([
          { $match: { year: parseInt(year) } },
          {
            $group: {
              _id: "$month",
              total: { $sum: "$amount" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          overview: overview[0] || {
            totalRevenue: 0,
            totalCommission: 0,
            totalNet: 0,
            count: 0,
          },
          byType,
          byMonth,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching revenue data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch revenue data",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// System analytics
app.get(
  "/api/analytics/overview",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "tamisemi"),
  async (req, res) => {
    try {
      const [stats, trends] = await Promise.all([
        Promise.all([
          User.countDocuments({ isActive: true }),
          School.countDocuments({ isActive: true }),
          User.countDocuments({ role: "student", isActive: true }),
          User.countDocuments({ role: "teacher", isActive: true }),
          Talent.countDocuments({ isActive: true }),
          Book.countDocuments({ isActive: true }),
          Event.countDocuments(),
          Business.countDocuments({ status: "active" }),
          Transaction.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
        ]),
        User.aggregate([
          { $match: { role: "student", isActive: true } },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": -1, "_id.month": -1 } },
          { $limit: 12 },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          totalUsers: stats[0],
          totalSchools: stats[1],
          totalStudents: stats[2],
          totalTeachers: stats[3],
          totalTalents: stats[4],
          totalBooks: stats[5],
          totalEvents: stats[6],
          totalBusinesses: stats[7],
          totalRevenue: stats[8][0]?.total || 0,
          studentGrowth: trends,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch analytics",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Messaging endpoints
app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    const { recipientId, page = 1, limit = 50 } = req.query;

    const query = {
      $or: [
        { senderId: req.user.id, recipientId },
        { senderId: recipientId, recipientId: req.user.id },
      ],
    };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("senderId", "firstName lastName profileImage")
      .populate("recipientId", "firstName lastName profileImage");

    const total = await Message.countDocuments(query);

    res.json({
      success: true,
      data: messages.reverse(),
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch messages",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Get conversations
app.get("/api/messages/conversations", authenticateToken, async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: new mongoose.Types.ObjectId(req.user.id) },
            { recipientId: new mongoose.Types.ObjectId(req.user.id) },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$recipientId",
                        new mongoose.Types.ObjectId(req.user.id),
                      ],
                    },
                    { $eq: ["$isRead", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    await Message.populate(conversations, {
      path: "lastMessage.senderId lastMessage.recipientId",
      select: "firstName lastName profileImage",
    });

    res.json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    console.error("❌ Error fetching conversations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch conversations",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// ============================================
// STUDENT MESSAGING ENDPOINTS
// ============================================

// GET student's conversations (simplified for students)
app.get(
  "/api/student/conversations",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;

      // Get all messages involving this student
      const messages = await Message.find({
        $or: [{ senderId: studentId }, { recipientId: studentId }],
      })
        .sort({ createdAt: -1 })
        .populate("senderId", "firstName lastName profileImage role")
        .populate("recipientId", "firstName lastName profileImage role")
        .limit(500);

      // Group by conversation partner
      const conversationsMap = new Map();

      messages.forEach((msg) => {
        const isFromMe = msg.senderId._id.toString() === studentId;
        const otherUser = isFromMe ? msg.recipientId : msg.senderId;
        const otherUserId = otherUser._id.toString();

        // Skip if already have this conversation
        if (conversationsMap.has(otherUserId)) {
          // Update unread count
          if (!isFromMe && !msg.isRead) {
            conversationsMap.get(otherUserId).unreadCount++;
          }
          return;
        }

        // Add new conversation
        conversationsMap.set(otherUserId, {
          teacherId: otherUser._id,
          teacherName:
            `${otherUser.firstName || ""} ${otherUser.lastName || ""}`.trim() ||
            "Unknown",
          teacherRole: otherUser.role || "teacher",
          teacherAvatar: otherUser.profileImage || null,
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: !isFromMe && !msg.isRead ? 1 : 0,
        });
      });

      const conversations = Array.from(conversationsMap.values());

      res.json({
        success: true,
        data: conversations,
      });
    } catch (error) {
      console.error("❌ Error fetching student conversations:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch conversations",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET list of teachers (for messaging)
app.get(
  "/api/student/teachers",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const schoolId = req.user.schoolId;

      if (!schoolId) {
        return res.json({
          success: true,
          data: [],
          message: "No school assigned to student",
        });
      }

      // Get teachers from student's school
      const teachers = await User.find({
        schoolId: schoolId,
        role: "teacher",
        isActive: true,
      })
        .select("firstName lastName email profileImage specialization")
        .sort({ firstName: 1 })
        .limit(100);

      // Format response
      const formattedTeachers = teachers.map((teacher) => ({
        id: teacher._id,
        name:
          `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() ||
          teacher.email,
        email: teacher.email,
        subject: teacher.specialization || "Teacher",
        profilePicture: teacher.profileImage || null,
      }));

      res.json({
        success: true,
        data: formattedTeachers,
      });
    } catch (error) {
      console.error("❌ Error fetching teachers:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch teachers",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET messages with a specific teacher
app.get(
  "/api/student/messages/:teacherId",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const teacherId = req.params.teacherId;

      // Validate teacherId
      if (!teacherId || teacherId === "undefined") {
        return res.status(400).json({
          success: false,
          error: "Invalid teacher ID",
        });
      }

      const messages = await Message.find({
        $or: [
          { senderId: studentId, recipientId: teacherId },
          { senderId: teacherId, recipientId: studentId },
        ],
      })
        .sort({ createdAt: 1 })
        .populate("senderId", "firstName lastName profileImage")
        .populate("recipientId", "firstName lastName profileImage")
        .limit(200);

      // Mark messages as read (async, don't wait)
      Message.updateMany(
        {
          senderId: teacherId,
          recipientId: studentId,
          isRead: false,
        },
        {
          isRead: true,
          readAt: new Date(),
        },
      ).catch((err) => console.error("Error marking messages as read:", err));

      // Format response
      const formattedMessages = messages.map((msg) => ({
        id: msg._id,
        senderId: msg.senderId._id,
        senderName:
          `${msg.senderId.firstName || ""} ${
            msg.senderId.lastName || ""
          }`.trim() || "Unknown",
        receiverId: msg.recipientId._id,
        content: msg.content,
        timestamp: msg.createdAt,
        isRead: msg.isRead,
        isSentByMe: msg.senderId._id.toString() === studentId,
      }));

      res.json({
        success: true,
        data: formattedMessages,
      });
    } catch (error) {
      console.error("❌ Error fetching messages:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch messages",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// SEND message to teacher
app.post(
  "/api/student/messages",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { receiverId, content } = req.body;
      const senderId = req.user.id;

      if (!receiverId || !content || !content.trim()) {
        return res.status(400).json({
          success: false,
          error: "Receiver ID and content are required",
        });
      }

      // Verify receiver exists
      const receiver = await User.findById(receiverId).select(
        "firstName lastName role",
      );
      if (!receiver) {
        return res.status(404).json({
          success: false,
          error: "Receiver not found",
        });
      }

      // Create message
      const message = await Message.create({
        senderId,
        recipientId: receiverId,
        content: content.trim(),
        conversationId: [senderId, receiverId].sort().join("_"),
        messageType: "text",
        isRead: false,
      });

      // Populate for response
      const populatedMessage = await Message.findById(message._id)
        .populate("senderId", "firstName lastName profileImage")
        .populate("recipientId", "firstName lastName profileImage");

      // Emit real-time via Socket.io (if connected)
      if (io) {
        io.to(receiverId).emit("new_message", populatedMessage);
      }

      // Create notification (async, don't wait)
      createNotification(
        receiverId,
        "New Message",
        `${req.user.firstName || "A student"} sent you a message`,
        "message",
        `/messages/${senderId}`,
      ).catch((err) => console.error("Error creating notification:", err));

      // Log activity (async, don't wait)
      logActivity(
        req.user.id,
        "MESSAGE_SENT",
        `Sent message to ${receiver.firstName || "user"}`,
        req,
      ).catch((err) => console.error("Error logging activity:", err));

      res.status(201).json({
        success: true,
        message: "Message sent successfully",
        data: {
          id: populatedMessage._id,
          senderId: populatedMessage.senderId._id,
          receiverId: populatedMessage.recipientId._id,
          content: populatedMessage.content,
          timestamp: populatedMessage.createdAt,
          isSentByMe: true,
        },
      });
    } catch (error) {
      console.error("❌ Error sending message:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send message",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);
// Notifications
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const query = { userId: req.user.id };
    if (unreadOnly === "true") query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      isRead: false,
    });

    res.json({
      success: true,
      data: notifications,
      meta: {
        total,
        unreadCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

app.patch(
  "/api/notifications/:id/read",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { isRead: true, readAt: new Date() },
        { new: true },
      );

      if (!notification) {
        return res
          .status(404)
          .json({ success: false, error: "Notification not found" });
      }

      res.json({ success: true, data: notification });
    } catch (error) {
      console.error("❌ Error updating notification:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update notification",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

app.patch(
  "/api/notifications/read-all",
  authenticateToken,
  async (req, res) => {
    try {
      await Notification.updateMany(
        { userId: req.user.id, isRead: false },
        { isRead: true, readAt: new Date() },
      );

      res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      console.error("❌ Error updating notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update notifications",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// User management
app.get(
  "/api/users",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        role,
        schoolId,
        regionId,
        districtId,
        q,
      } = req.query;

      const query = {};

      if (role) query.role = role;
      if (schoolId) query.schoolId = schoolId;
      if (regionId) query.regionId = regionId;
      if (districtId) query.districtId = districtId;
      if (q) {
        query.$or = [
          { username: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
        ];
      }

      // Apply role-based access control
      if (req.user.role === "headmaster") query.schoolId = req.user.schoolId;
      if (req.user.role === "regional_official")
        query.regionId = req.user.regionId;
      if (req.user.role === "district_official")
        query.districtId = req.user.districtId;

      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("schoolId", "name schoolCode")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      const total = await User.countDocuments(query);

      res.json({
        success: true,
        data: users,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching users:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users",
        ...(process.env.NODE_ENV === "development" && { debug: error.message }),
      });
    }
  },
);

app.get(
  "/api/users/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id)
        .select("-password")
        .populate("schoolId", "name schoolCode type")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      res.json({ success: true, data: user });
    } catch (error) {
      console.error("❌ Error fetching user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

app.put(
  "/api/users/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
  ),
  async (req, res) => {
    try {
      const { password, ...updateData } = req.body;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true },
      ).select("-password");

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      await logActivity(
        req.user.id,
        "USER_UPDATED",
        `Updated user: ${user.username}`,
        req,
      );

      res.json({
        success: true,
        message: "User updated successfully",
        data: user,
      });
    } catch (error) {
      console.error("❌ Error updating user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

app.patch(
  "/api/users/:id/deactivate",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("super_admin", "national_official", "regional_official"),
  async (req, res) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: false, updatedAt: new Date() },
        { new: true },
      ).select("-password");

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      await logActivity(
        req.user.id,
        "USER_DEACTIVATED",
        `Deactivated user: ${user.username}`,
        req,
      );

      res.json({
        success: true,
        message: "User deactivated successfully",
        data: user,
      });
    } catch (error) {
      console.error("❌ Error deactivating user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to deactivate user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// STUDENT ENDPOINTS
// ============================================================================

// GET student grades
app.get(
  "/api/student/grades",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;

      const grades = await Grade.find({ studentId })
        .sort({ examDate: -1, createdAt: -1 })
        .populate("teacherId", "firstName lastName")
        .populate("schoolId", "name schoolCode")
        .limit(50);

      // Calculate statistics
      const stats = {
        totalExams: grades.length,
        averageScore:
          grades.length > 0
            ? grades.reduce((sum, g) => sum + g.score, 0) / grades.length
            : 0,
        highestScore:
          grades.length > 0 ? Math.max(...grades.map((g) => g.score)) : 0,
        lowestScore:
          grades.length > 0 ? Math.min(...grades.map((g) => g.score)) : 0,
      };

      // Group by subject
      const bySubject = {};
      grades.forEach((grade) => {
        if (!bySubject[grade.subject]) {
          bySubject[grade.subject] = {
            subject: grade.subject,
            grades: [],
            average: 0,
            count: 0,
          };
        }
        bySubject[grade.subject].grades.push(grade);
        bySubject[grade.subject].count++;
      });

      // Calculate averages per subject
      Object.keys(bySubject).forEach((subject) => {
        const subjectGrades = bySubject[subject].grades;
        bySubject[subject].average =
          subjectGrades.reduce((sum, g) => sum + g.score, 0) /
          subjectGrades.length;
      });

      res.json({
        success: true,
        data: grades,
        meta: {
          stats,
          bySubject: Object.values(bySubject),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching student grades:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch grades",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET student attendance
app.get(
  "/api/student/attendance",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const { startDate, endDate, limit = 50 } = req.query;

      const query = { studentId };

      // Date range filter
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      const records = await AttendanceRecord.find(query)
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .populate("teacherId", "firstName lastName")
        .populate("schoolId", "name schoolCode");

      // Calculate attendance statistics
      const totalRecords = records.length;
      const presentCount = records.filter((r) => r.status === "present").length;
      const absentCount = records.filter((r) => r.status === "absent").length;
      const lateCount = records.filter((r) => r.status === "late").length;
      const excusedCount = records.filter((r) => r.status === "excused").length;

      const attendanceRate =
        totalRecords > 0
          ? (
              ((presentCount + lateCount + excusedCount) / totalRecords) *
              100
            ).toFixed(2)
          : 0;

      res.json({
        success: true,
        data: records,
        meta: {
          total: totalRecords,
          present: presentCount,
          absent: absentCount,
          late: lateCount,
          excused: excusedCount,
          attendanceRate: parseFloat(attendanceRate),
          rate: `${attendanceRate}%`,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching student attendance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch attendance",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET all assignments (for student)
app.get("/api/assignments", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, subject } = req.query;

    let query = {};

    // For students, show assignments from their school
    if (req.user.role === "student") {
      query.schoolId = req.user.schoolId;
      query.status = "published";

      // Optionally filter by class level
      if (req.user.gradeLevel) {
        query.$or = [
          { classLevel: req.user.gradeLevel },
          { classLevel: { $exists: false } },
        ];
      }
    } else if (req.user.role === "teacher") {
      query.teacherId = req.user.id;
    } else if (req.user.schoolId) {
      query.schoolId = req.user.schoolId;
    }

    if (status) query.status = status;
    if (subject) query.subject = subject;

    const assignments = await Assignment.find(query)
      .sort({ dueDate: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("teacherId", "firstName lastName")
      .populate("schoolId", "name schoolCode");

    // For students, get their submission status for each assignment
    if (req.user.role === "student") {
      const assignmentIds = assignments.map((a) => a._id);
      const submissions = await AssignmentSubmission.find({
        assignmentId: { $in: assignmentIds },
        studentId: req.user.id,
      });

      const submissionMap = {};
      submissions.forEach((sub) => {
        submissionMap[sub.assignmentId.toString()] = sub;
      });

      // Add submission info to each assignment
      const assignmentsWithStatus = assignments.map((assignment) => {
        const assignmentObj = assignment.toObject();
        const submission = submissionMap[assignment._id.toString()];

        return {
          ...assignmentObj,
          submitted: !!submission,
          submission: submission || null,
          isOverdue: !submission && new Date() > assignment.dueDate,
        };
      });

      const total = await Assignment.countDocuments(query);

      return res.json({
        success: true,
        data: assignmentsWithStatus,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    }

    const total = await Assignment.countDocuments(query);

    res.json({
      success: true,
      data: assignments,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching assignments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch assignments",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET assignment by ID
app.get(
  "/api/assignments/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const assignment = await Assignment.findById(req.params.id)
        .populate("teacherId", "firstName lastName email")
        .populate("schoolId", "name schoolCode");

      if (!assignment) {
        return res.status(404).json({
          success: false,
          error: "Assignment not found",
        });
      }

      // Check permissions
      const canView =
        req.user.role === "super_admin" ||
        assignment.teacherId._id.toString() === req.user.id ||
        (req.user.role === "student" &&
          assignment.schoolId._id.toString() === req.user.schoolId?.toString());

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to view this assignment",
        });
      }

      // If student, get their submission
      if (req.user.role === "student") {
        const submission = await AssignmentSubmission.findOne({
          assignmentId: assignment._id,
          studentId: req.user.id,
        });

        const assignmentObj = assignment.toObject();
        assignmentObj.submitted = !!submission;
        assignmentObj.submission = submission;
        assignmentObj.isOverdue =
          !submission && new Date() > assignment.dueDate;

        return res.json({
          success: true,
          data: assignmentObj,
        });
      }

      res.json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      console.error("❌ Error fetching assignment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch assignment",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE assignment (teacher only)
app.post(
  "/api/assignments",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const assignment = await Assignment.create({
        ...req.body,
        teacherId: req.user.id,
        schoolId: req.user.schoolId,
      });

      await logActivity(
        req.user.id,
        "ASSIGNMENT_CREATED",
        `Created assignment: ${assignment.title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Assignment created successfully",
        data: assignment,
      });
    } catch (error) {
      console.error("❌ Error creating assignment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create assignment",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
); // ✅ FIXED: Added closing }); for app.post()

// SUBMIT assignment (student only)
app.post(
  "/api/student/assignments/submit",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { assignmentId, content, attachments } = req.body;

      // Check if assignment exists
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) {
        return res.status(404).json({
          success: false,
          error: "Assignment not found",
        });
      }

      // Check if already submitted
      const existing = await AssignmentSubmission.findOne({
        assignmentId,
        studentId: req.user.id,
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: "You have already submitted this assignment",
        });
      }

      // Check if overdue
      const isLate = new Date() > assignment.dueDate;

      const submission = await AssignmentSubmission.create({
        assignmentId,
        studentId: req.user.id,
        content,
        attachments: attachments || [],
        status: isLate ? "late" : "submitted",
      });

      // Notify teacher
      await createNotification(
        assignment.teacherId,
        "New Assignment Submission",
        `${req.user.firstName || "A student"} submitted "${assignment.title}"`,
        "info",
        `/assignments/${assignmentId}/submissions`,
      );

      await logActivity(
        req.user.id,
        "ASSIGNMENT_SUBMITTED",
        `Submitted assignment: ${assignment.title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Assignment submitted successfully",
        data: submission,
      });
    } catch (error) {
      console.error("❌ Error submitting assignment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to submit assignment",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE grade (teacher/headmaster)
app.post(
  "/api/student/grades",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const grade = await Grade.create({
        ...req.body,
        teacherId: req.user.id,
        schoolId: req.user.schoolId,
      });

      await grade.populate("studentId", "firstName lastName email");

      // Notify student
      await createNotification(
        grade.studentId._id,
        "New Grade Posted",
        `Your grade for ${grade.subject} has been posted: ${grade.score}%`,
        "info",
        "/grades",
      );

      await logActivity(
        req.user.id,
        "GRADE_CREATED",
        `Posted grade for ${grade.studentId.firstName}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Grade posted successfully",
        data: grade,
      });
    } catch (error) {
      console.error("❌ Error creating grade:", error);
      res.status(500).json({
        success: false,
        error: "Failed to post grade",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// RECORD attendance (teacher/headmaster)
app.post(
  "/api/student/attendance",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const { records } = req.body; // Array of attendance records

      if (!records || !Array.isArray(records)) {
        return res.status(400).json({
          success: false,
          error: "Records array is required",
        });
      }

      const createdRecords = [];

      for (const record of records) {
        const attendanceRecord = await AttendanceRecord.create({
          ...record,
          teacherId: req.user.id,
          schoolId: req.user.schoolId,
          date: record.date || new Date(),
        });
        createdRecords.push(attendanceRecord);
      }

      await logActivity(
        req.user.id,
        "ATTENDANCE_RECORDED",
        `Recorded attendance for ${records.length} students`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Attendance recorded successfully",
        data: createdRecords,
      });
    } catch (error) {
      console.error("❌ Error recording attendance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to record attendance",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Global search
app.get("/api/search", authenticateToken, async (req, res) => {
  try {
    const { q, type } = req.query;

    if (!q) {
      return res
        .status(400)
        .json({ success: false, error: "Search query required" });
    }

    const results = {};

    if (!type || type === "users") {
      results.users = await User.find({
        $or: [
          { username: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
        ],
      })
        .select("-password")
        .limit(10);
    }

    if (!type || type === "schools") {
      results.schools = await School.find({
        $or: [
          { name: { $regex: q, $options: "i" } },
          { schoolCode: { $regex: q, $options: "i" } },
        ],
      }).limit(10);
    }

    if (!type || type === "books") {
      results.books = await Book.find({
        $or: [
          { title: { $regex: q, $options: "i" } },
          { author: { $regex: q, $options: "i" } },
        ],
        isActive: true,
      }).limit(10);
    }

    if (!type || type === "events") {
      results.events = await Event.find({
        $or: [
          { title: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
        ],
      }).limit(10);
    }

    if (!type || type === "businesses") {
      results.businesses = await Business.find({
        $or: [
          { name: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
        ],
        status: "active",
      }).limit(10);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({
      success: false,
      error: "Search failed",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// Dashboard endpoints for all 7+ roles
app.get(
  "/api/dashboard/super-admin",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const stats = await Promise.all([
        User.countDocuments({ isActive: true }),
        School.countDocuments({ isActive: true }),
        Talent.countDocuments({ isActive: true }),
        Book.countDocuments({ isActive: true }),
        Event.countDocuments(),
        Business.countDocuments({ status: "active" }),
        Transaction.aggregate([
          { $match: { status: "completed" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        ActivityLog.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("userId", "username firstName lastName role"),
      ]);

      res.json({
        success: true,
        data: {
          totalUsers: stats[0],
          totalSchools: stats[1],
          totalTalents: stats[2],
          totalBooks: stats[3],
          totalEvents: stats[4],
          totalBusinesses: stats[5],
          totalRevenue: stats[6][0]?.total || 0,
          recentActivities: stats[7],
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch dashboard" });
    }
  },
);

// ============================================================================
// ADDITIONAL ENDPOINTS - ALL ROLES (Auto-merged)
// ============================================================================
// ✅ Student, Teacher, Headmaster, Entrepreneur, Staff Dashboards
// ✅ Performance Records (Complete CRUD)
// ✅ Certificates (Complete + Verification)
// ✅ Groups & Group Messaging
// ✅ Complete Product Endpoints
// ✅ Book Download (with purchase verification)
// ✅ Subscriptions
// ✅ Activity Logs
// ✅ Advanced Reports
// ✅ Bulk Operations
// ============================================================================

// ============================================================================
// DASHBOARD ENDPOINTS - ALL 7+ ROLES
// ============================================================================

// GET Student Announcements
app.get(
  "/api/student/announcements",
  authenticateToken,
  authorizeRoles("student", "entrepreneur"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const studentId = req.user.id;

      const student = await User.findById(studentId);

      const query = {
        isActive: true,
        publishDate: { $lte: new Date() },
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: { $gte: new Date() } },
        ],
        $or: [
          { targetAudience: "all" },
          { targetAudience: "students" },
          { targetAudience: "entrepreneurs" },
        ],
      };

      // Filter by school/region/district
      if (student.schoolId) {
        query.$or.push({ schoolId: student.schoolId });
      }
      if (student.regionId) {
        query.$or.push({ regionId: student.regionId });
      }

      const announcements = await Announcement.find(query)
        .sort({ priority: -1, publishDate: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("createdBy", "firstName lastName role")
        .populate("schoolId", "name schoolCode");

      const total = await Announcement.countDocuments(query);

      res.json({
        success: true,
        data: announcements,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching announcements:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch announcements",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student Timetable
app.get(
  "/api/student/timetable",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const student = await User.findById(studentId);

      // Use classLevel (with fallback to gradeLevel for backward compat)
      const studentClassLevel = student.classLevel || student.gradeLevel;

      if (!student.schoolId || !studentClassLevel) {
        return res.json({
          success: true,
          data: [],
          message: "No timetable available. Please update your class level.",
        });
      }

      const currentYear = new Date().getFullYear();

      const timetables = await Timetable.find({
        schoolId: student.schoolId,
        classLevel: studentClassLevel, // ✅ CORRECT
        academicYear: currentYear.toString(),
        isActive: true,
      })
        .populate("periods.teacherId", "firstName lastName")
        .sort({ dayOfWeek: 1, "periods.periodNumber": 1 });

      res.json({
        success: true,
        data: timetables,
      });
    } catch (error) {
      console.error("❌ Error fetching timetable:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch timetable",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student CTM Membership
app.get(
  "/api/student/ctm-membership",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;

      let membership = await CTMMembership.findOne({ studentId })
        .populate("schoolId", "name schoolCode")
        .populate("talents", "name category icon");

      // Auto-create membership if doesn't exist
      if (!membership) {
        const student = await User.findById(studentId);
        const membershipNumber = `CTM-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)
          .toUpperCase()}`;

        membership = await CTMMembership.create({
          studentId,
          membershipNumber,
          schoolId: student.schoolId,
          status: "active",
          membershipType: "basic",
          joinDate: new Date(),
        });

        await membership.populate("schoolId", "name schoolCode");
      }

      res.json({
        success: true,
        data: membership,
      });
    } catch (error) {
      console.error("❌ Error fetching CTM membership:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch CTM membership",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student CTM Activities
app.get(
  "/api/student/ctm-activities",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const studentId = req.user.id;
      const student = await User.findById(studentId);

      const query = {
        $or: [{ schoolId: student.schoolId }, { participants: studentId }],
        date: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }, // Last year
      };

      const activities = await CTMActivity.find(query)
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("organizer", "firstName lastName")
        .populate("schoolId", "name schoolCode");

      const total = await CTMActivity.countDocuments(query);

      // Check participation status
      const activitiesWithStatus = activities.map((activity) => ({
        ...activity.toObject(),
        isParticipant: activity.participants.some(
          (p) => p.toString() === studentId,
        ),
        isFull:
          activity.maxParticipants &&
          activity.participants.length >= activity.maxParticipants,
      }));

      res.json({
        success: true,
        data: activitiesWithStatus,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching CTM activities:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch CTM activities",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student Awards
app.get(
  "/api/student/awards",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;

      const awards = await Award.find({ studentId })
        .sort({ awardDate: -1 })
        .populate("awardedBy", "firstName lastName")
        .populate("schoolId", "name schoolCode");

      // Group by category
      const byCategory = {};
      awards.forEach((award) => {
        if (!byCategory[award.category]) {
          byCategory[award.category] = [];
        }
        byCategory[award.category].push(award);
      });

      res.json({
        success: true,
        data: awards,
        meta: {
          total: awards.length,
          byCategory,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching awards:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch awards",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student Rankings
app.get(
  "/api/student/rankings",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const student = await User.findById(studentId);

      const currentYear = new Date().getFullYear();

      const ranking = await Ranking.findOne({
        studentId,
        academicYear: currentYear.toString(),
      }).populate("schoolId", "name schoolCode");

      // Get class rankings for context
      const classRankings = await Ranking.find({
        schoolId: student.schoolId,
        classLevel: student.gradeLevel,
        academicYear: currentYear.toString(),
      })
        .sort({ averageScore: -1 })
        .limit(10)
        .populate("studentId", "firstName lastName profileImage");

      res.json({
        success: true,
        data: {
          myRanking: ranking,
          topPerformers: classRankings,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching rankings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch rankings",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// PATCH Update Student Talents
app.patch(
  "/api/student/talents",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const { talents } = req.body; // Array of talent IDs

      if (!talents || !Array.isArray(talents)) {
        return res.status(400).json({
          success: false,
          error: "Talents array is required",
        });
      }

      const student = await User.findById(studentId);

      // Update CTM membership talents
      let membership = await CTMMembership.findOne({ studentId });
      if (!membership) {
        const membershipNumber = `CTM-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)
          .toUpperCase()}`;
        membership = await CTMMembership.create({
          studentId,
          membershipNumber,
          schoolId: student.schoolId,
          talents,
        });
      } else {
        membership.talents = talents;
        membership.updatedAt = new Date();
        await membership.save();
      }

      await logActivity(
        studentId,
        "TALENTS_UPDATED",
        "Updated talent selections",
        req,
      );

      res.json({
        success: true,
        message: "Talents updated successfully",
        data: membership,
      });
    } catch (error) {
      console.error("❌ Error updating talents:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update talents",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET /api/student/class-level-requests - View My Requests
app.get(
  "/api/student/class-level-requests",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const requests = await ClassLevelRequest.find({ studentId: req.user.id })
        .sort({ submittedAt: -1 })
        .populate("reviewedBy", "firstName lastName");

      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      console.error("❌ Error fetching requests:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch requests",
      });
    }
  },
);

// PATCH /api/admin/class-level-requests/:requestId/approve - Approve Request
app.patch(
  "/api/admin/class-level-requests/:requestId/approve",
  authenticateToken,
  authorizeRoles("headmaster", "super_admin"),
  async (req, res) => {
    try {
      const { comments } = req.body;

      const request = await ClassLevelRequest.findById(req.params.requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          error: "Request not found",
        });
      }

      // Update student's class level
      await User.findByIdAndUpdate(request.studentId, {
        classLevel: request.requestedClassLevel, // ✅ CORRECT
        gradeLevel: request.requestedClassLevel, // Keep for backward compatibility
        course: request.requestedCourse,
        updatedAt: new Date(),
      });

      // Update request status
      request.status = "approved";
      request.reviewedBy = req.user.id;
      request.reviewedAt = new Date();
      request.reviewComments = comments;
      await request.save();

      // Notify student
      await createNotification(
        request.studentId,
        "Class Level Request Approved",
        `Your request to change to ${request.requestedClassLevel} has been approved`,
        "success",
      );

      await logActivity(
        req.user.id,
        "CLASS_LEVEL_REQUEST_APPROVED",
        "Approved class level request",
        req,
      );

      res.json({
        success: true,
        message: "Request approved successfully",
        data: request,
      });
    } catch (error) {
      console.error("❌ Error approving request:", error);
      res.status(500).json({
        success: false,
        error: "Failed to approve request",
      });
    }
  },
);

// PATCH /api/admin/class-level-requests/:requestId/reject - Reject Request
app.patch(
  "/api/admin/class-level-requests/:requestId/reject",
  authenticateToken,
  authorizeRoles("headmaster", "super_admin"),
  async (req, res) => {
    try {
      const { comments } = req.body;

      if (!comments) {
        return res.status(400).json({
          success: false,
          error: "Rejection reason is required",
        });
      }

      const request = await ClassLevelRequest.findById(req.params.requestId);

      if (!request) {
        return res.status(404).json({
          success: false,
          error: "Request not found",
        });
      }

      request.status = "rejected";
      request.reviewedBy = req.user.id;
      request.reviewedAt = new Date();
      request.reviewComments = comments;
      await request.save();

      await createNotification(
        request.studentId,
        "Class Level Request Rejected",
        `Your request was rejected: ${comments}`,
        "warning",
      );

      await logActivity(
        req.user.id,
        "CLASS_LEVEL_REQUEST_REJECTED",
        "Rejected class level request",
        req,
      );

      res.json({
        success: true,
        message: "Request rejected",
        data: request,
      });
    } catch (error) {
      console.error("❌ Error rejecting request:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reject request",
      });
    }
  },
);

// POST /api/student/class-level-request - Request Class Update (With Approval)
app.post(
  "/api/student/class-level-request",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { classLevel, academicYear, course, reason } = req.body;

      if (!classLevel || !academicYear || !reason) {
        return res.status(400).json({
          success: false,
          error: "Class level, academic year, and reason are required",
        });
      }

      const student = await User.findById(req.user.id);

      const request = await ClassLevelRequest.create({
        studentId: req.user.id,
        currentClassLevel: student.gradeLevel,
        requestedClassLevel: classLevel,
        currentAcademicYear: new Date().getFullYear().toString(),
        requestedAcademicYear: academicYear,
        currentCourse: student.course,
        requestedCourse: course,
        reason,
        status: "pending",
      });

      // Notify headmaster
      if (student.schoolId) {
        const headmaster = await User.findOne({
          schoolId: student.schoolId,
          role: "headmaster",
        });

        if (headmaster) {
          await createNotification(
            headmaster._id,
            "Class Level Request",
            `${student.firstName} ${student.lastName} requested class level change`,
            "info",
            `/admin/class-requests/${request._id}`,
          );
        }
      }

      await logActivity(
        req.user.id,
        "CLASS_LEVEL_REQUEST_SUBMITTED",
        `Requested class level change to ${classLevel}`,
        req,
      );

      res.status(201).json({
        success: true,
        message:
          "Class level request submitted successfully. Awaiting approval.",
        data: request,
      });
    } catch (error) {
      console.error("❌ Error submitting request:", error);
      res.status(500).json({
        success: false,
        error: "Failed to submit request",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// PUT Update Student Profile
app.put(
  "/api/student/profile",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const allowedUpdates = [
        "firstName",
        "lastName",
        "email",
        "phoneNumber",
        "dateOfBirth",
        "gender",

        // ✅ ADD THESE LOCATION FIELDS
        "regionId",
        "districtId",
        "wardId",

        // ✅ EXISTING GUARDIAN FIELDS
        "guardianName",
        "guardianPhone",
        "guardianRelationship",

        // ✅ ADD THESE NEW GUARDIAN FIELDS
        "guardianEmail",
        "guardianOccupation",
        "guardianNationalId",
        "emergencyContact",

        // ✅ ADD THESE PARENT LOCATION FIELDS
        "parentRegionId",
        "parentDistrictId",
        "parentWardId",
        "parentAddress",
      ];

      const updates = {};
      Object.keys(req.body).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      updates.updatedAt = new Date();

      const student = await User.findByIdAndUpdate(req.user.id, updates, {
        new: true,
        runValidators: true,
      }).select("-password");

      await logActivity(
        req.user.id,
        "PROFILE_UPDATED",
        "Updated personal information",
        req,
      );

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: student,
      });
    } catch (error) {
      console.error("❌ Error updating profile:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update profile",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// PATCH Update Student Class Information
app.patch(
  "/api/student/class",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { classLevel, academicYear, course } = req.body;

      if (!classLevel || !academicYear) {
        return res.status(400).json({
          success: false,
          error: "Class level and academic year are required",
        });
      }

      const student = await User.findByIdAndUpdate(
        req.user.id,
        {
          classLevel: classLevel, // ✅ CORRECT
          gradeLevel: classLevel, // Keep for backward compatibility
          course: course || "",
          updatedAt: new Date(),
        },
        { new: true, runValidators: true },
      ).select("-password");

      await logActivity(
        req.user.id,
        "CLASS_INFO_UPDATED",
        `Updated class to ${classLevel} for ${academicYear}`,
        req,
      );

      res.json({
        success: true,
        message: "Class information updated successfully",
        data: student,
      });
    } catch (error) {
      console.error("❌ Error updating class:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update class information",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// PATCH Update Student Class Level
app.patch(
  "/api/student/class-level",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;
      const { classLevel, academicYear, course, reason } = req.body;

      if (!classLevel || !academicYear || !reason) {
        return res.status(400).json({
          success: false,
          error: "Class level, academic year, and reason are required",
        });
      }

      const student = await User.findByIdAndUpdate(
        studentId,
        {
          classLevel: classLevel, // ✅ CORRECT FIELD
          gradeLevel: classLevel, // Keep for backward compatibility
          updatedAt: new Date(),
        },
        { new: true },
      ).select("-password");

      await logActivity(
        studentId,
        "CLASS_LEVEL_UPDATED",
        `Updated class level to ${classLevel} for ${academicYear}. Reason: ${reason}`,
        req,
        { classLevel, academicYear, course, reason },
      );

      res.json({
        success: true,
        message: "Class level updated successfully",
        data: student,
      });
    } catch (error) {
      console.error("❌ Error updating class level:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update class level",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Student Terms Acceptance
app.get(
  "/api/student/terms",
  authenticateToken,
  authorizeRoles("student", "entrepreneur"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      const acceptance = await TermsAcceptance.findOne({ userId }).sort({
        acceptedAt: -1,
      });

      res.json({
        success: true,
        data: acceptance || null,
      });
    } catch (error) {
      console.error("❌ Error fetching terms:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch terms",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// POST Re-accept Terms
app.post(
  "/api/student/terms/reaccept",
  authenticateToken,
  authorizeRoles("student", "entrepreneur"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { termsVersion, acceptedTerms, acceptedPrivacy } = req.body;

      if (!termsVersion || acceptedTerms !== true || acceptedPrivacy !== true) {
        return res.status(400).json({
          success: false,
          error: "You must accept both terms and privacy policy",
        });
      }

      const acceptance = await TermsAcceptance.create({
        userId,
        termsVersion,
        acceptedTerms,
        acceptedPrivacy,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("user-agent"),
      });

      await logActivity(
        userId,
        "TERMS_ACCEPTED",
        `Accepted terms version ${termsVersion}`,
        req,
      );

      res.json({
        success: true,
        message: "Terms accepted successfully",
        data: acceptance,
      });
    } catch (error) {
      console.error("❌ Error accepting terms:", error);
      res.status(500).json({
        success: false,
        error: "Failed to accept terms",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// POST Submit Assignment (Student-specific endpoint)
app.post(
  "/api/student/assignments/submit",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { assignmentId, content, attachments } = req.body;

      if (!assignmentId) {
        return res.status(400).json({
          success: false,
          error: "Assignment ID is required",
        });
      }

      // Check if assignment exists
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) {
        return res.status(404).json({
          success: false,
          error: "Assignment not found",
        });
      }

      // Check if already submitted
      const existing = await AssignmentSubmission.findOne({
        assignmentId,
        studentId: req.user.id,
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: "You have already submitted this assignment",
        });
      }

      // Check if overdue
      const isLate = new Date() > assignment.dueDate;

      const submission = await AssignmentSubmission.create({
        assignmentId,
        studentId: req.user.id,
        content,
        attachments: attachments || [],
        status: isLate ? "late" : "submitted",
      });

      // Notify teacher
      await createNotification(
        assignment.teacherId,
        "New Assignment Submission",
        `${req.user.firstName || "A student"} submitted "${assignment.title}"`,
        "info",
        `/assignments/${assignmentId}/submissions`,
      );

      await logActivity(
        req.user.id,
        "ASSIGNMENT_SUBMITTED",
        `Submitted assignment: ${assignment.title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Assignment submitted successfully",
        data: submission,
      });
    } catch (error) {
      console.error("❌ Error submitting assignment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to submit assignment",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// STUDENT DASHBOARD
app.get(
  "/api/dashboard/student",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const studentId = req.user.id;

      const [
        profile,
        talents,
        upcomingEvents,
        recentGrades,
        purchasedBooks,
        notifications,
        schoolInfo,
        performanceRecords,
      ] = await Promise.all([
        User.findById(studentId).select("-password"),
        StudentTalent.find({ studentId })
          .populate("talentId", "name category icon")
          .populate("teacherId", "firstName lastName"),
        EventRegistration.find({ userId: studentId })
          .populate({
            path: "eventId",
            match: { startDate: { $gte: new Date() } },
            select: "title startDate location eventType",
          })
          .limit(5),
        PerformanceRecord.find({ studentId })
          .sort({ assessmentDate: -1 })
          .limit(5)
          .populate("talentId", "name category"),
        BookPurchase.find({ userId: studentId, paymentStatus: "completed" })
          .populate("bookId", "title author coverImage")
          .limit(5),
        Notification.find({ userId: studentId, isRead: false })
          .sort({ createdAt: -1 })
          .limit(10),
        School.findById(req.user.schoolId).select(
          "name schoolCode logo address phoneNumber",
        ),
        PerformanceRecord.aggregate([
          {
            $match: { studentId: new mongoose.Types.ObjectId(studentId) },
          },
          {
            $group: {
              _id: "$talentId",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
              latestGrade: { $last: "$grade" },
            },
          },
        ]),
      ]);

      // Filter out null events (from populate match)
      const filteredEvents = upcomingEvents.filter((reg) => reg.eventId);

      // Get talent statistics
      const talentStats = {
        total: talents.length,
        beginner: talents.filter((t) => t.proficiencyLevel === "beginner")
          .length,
        intermediate: talents.filter(
          (t) => t.proficiencyLevel === "intermediate",
        ).length,
        advanced: talents.filter((t) => t.proficiencyLevel === "advanced")
          .length,
        expert: talents.filter((t) => t.proficiencyLevel === "expert").length,
      };

      res.json({
        success: true,
        data: {
          profile,
          talents,
          talentStats,
          upcomingEvents: filteredEvents,
          recentGrades,
          purchasedBooks,
          notifications,
          school: schoolInfo,
          performanceOverview: performanceRecords,
          stats: {
            totalTalents: talents.length,
            totalEvents: filteredEvents.length,
            totalBooks: purchasedBooks.length,
            unreadNotifications: notifications.length,
          },
        },
      });
    } catch (error) {
      console.error("❌ Student dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load dashboard",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// TEACHER DASHBOARD
app.get(
  "/api/dashboard/teacher",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const teacherId = req.user.id;

      const [
        profile,
        myStudents,
        myTalents,
        upcomingEvents,
        recentAssessments,
        schoolInfo,
        talentDistribution,
      ] = await Promise.all([
        User.findById(teacherId).select("-password"),
        StudentTalent.find({ teacherId })
          .populate("studentId", "firstName lastName email profileImage")
          .populate("talentId", "name category"),
        StudentTalent.aggregate([
          { $match: { teacherId: new mongoose.Types.ObjectId(teacherId) } },
          {
            $group: {
              _id: "$talentId",
              studentCount: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "talents",
              localField: "_id",
              foreignField: "_id",
              as: "talent",
            },
          },
          { $unwind: "$talent" },
        ]),
        Event.find({
          organizer: teacherId,
          startDate: { $gte: new Date() },
        }).limit(5),
        PerformanceRecord.find({ assessedBy: teacherId })
          .sort({ assessmentDate: -1 })
          .limit(10)
          .populate("studentId", "firstName lastName")
          .populate("talentId", "name"),
        School.findById(req.user.schoolId),
        StudentTalent.aggregate([
          { $match: { teacherId: new mongoose.Types.ObjectId(teacherId) } },
          {
            $group: {
              _id: "$proficiencyLevel",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          profile,
          students: myStudents,
          talents: myTalents,
          upcomingEvents,
          recentAssessments,
          school: schoolInfo,
          talentDistribution,
          stats: {
            totalStudents: myStudents.length,
            totalTalents: myTalents.length,
            totalEvents: upcomingEvents.length,
            totalAssessments: recentAssessments.length,
          },
        },
      });
    } catch (error) {
      console.error("❌ Teacher dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load dashboard",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// HEADMASTER DASHBOARD
app.get(
  "/api/dashboard/headmaster",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const schoolId = req.user.schoolId;

      const [
        profile,
        schoolInfo,
        studentStats,
        teacherStats,
        talentStats,
        eventStats,
        recentActivities,
        topPerformers,
      ] = await Promise.all([
        User.findById(req.user.id).select("-password"),
        School.findById(schoolId).populate("regionId districtId wardId"),
        User.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(schoolId),
              role: "student",
              isActive: true,
            },
          },
          {
            $group: {
              _id: "$gradeLevel",
              count: { $sum: 1 },
            },
          },
        ]),
        User.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(schoolId),
              role: "teacher",
              isActive: true,
            },
          },
          {
            $group: {
              _id: "$specialization",
              count: { $sum: 1 },
            },
          },
        ]),
        StudentTalent.aggregate([
          { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
          {
            $group: {
              _id: "$talentId",
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "talents",
              localField: "_id",
              foreignField: "_id",
              as: "talent",
            },
          },
          { $unwind: "$talent" },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        Event.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(schoolId),
            },
          },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        ActivityLog.find({
          $or: [
            { "metadata.schoolId": schoolId },
            {
              userId: {
                $in: await User.find({ schoolId }).distinct("_id"),
              },
            },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("userId", "firstName lastName role"),
        PerformanceRecord.aggregate([
          { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
          {
            $group: {
              _id: "$studentId",
              avgScore: { $avg: "$score" },
              assessmentCount: { $sum: 1 },
            },
          },
          { $sort: { avgScore: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "student",
            },
          },
          { $unwind: "$student" },
        ]),
      ]);

      // Get total counts
      const [totalStudents, totalTeachers, totalTalents] = await Promise.all([
        User.countDocuments({
          schoolId,
          role: "student",
          isActive: true,
        }),
        User.countDocuments({
          schoolId,
          role: "teacher",
          isActive: true,
        }),
        StudentTalent.countDocuments({ schoolId }),
      ]);

      res.json({
        success: true,
        data: {
          profile,
          school: schoolInfo,
          stats: {
            totalStudents,
            totalTeachers,
            totalTalents,
            studentsByGrade: studentStats,
            teachersBySpecialization: teacherStats,
          },
          talentDistribution: talentStats,
          eventOverview: eventStats,
          recentActivities,
          topPerformers,
        },
      });
    } catch (error) {
      console.error("❌ Headmaster dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load dashboard",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ENTREPRENEUR DASHBOARD
app.get(
  "/api/dashboard/entrepreneur",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const entrepreneurId = req.user.id;

      const [
        profile,
        businesses,
        totalRevenue,
        recentTransactions,
        productStats,
        topProducts,
      ] = await Promise.all([
        User.findById(entrepreneurId).select("-password"),
        Business.find({ ownerId: entrepreneurId }),
        Revenue.aggregate([
          {
            $match: {
              businessId: {
                $in: await Business.find({ ownerId: entrepreneurId }).distinct(
                  "_id",
                ),
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              netAmount: { $sum: "$netAmount" },
              commission: { $sum: "$commission" },
            },
          },
        ]),
        Transaction.find({
          businessId: {
            $in: await Business.find({ ownerId: entrepreneurId }).distinct(
              "_id",
            ),
          },
          status: "completed",
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("userId", "firstName lastName"),
        Product.aggregate([
          {
            $match: {
              businessId: {
                $in: await Business.find({ ownerId: entrepreneurId }).distinct(
                  "_id",
                ),
              },
            },
          },
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              totalValue: { $sum: "$price" },
            },
          },
        ]),
        Product.find({
          businessId: {
            $in: await Business.find({ ownerId: entrepreneurId }).distinct(
              "_id",
            ),
          },
          isActive: true,
        })
          .sort({ soldCount: -1, viewCount: -1 })
          .limit(5),
      ]);

      const businessIds = businesses.map((b) => b._id);
      const [totalProducts, pendingOrders] = await Promise.all([
        Product.countDocuments({
          businessId: { $in: businessIds },
          isActive: true,
        }),
        Transaction.countDocuments({
          businessId: { $in: businessIds },
          status: "pending",
        }),
      ]);

      res.json({
        success: true,
        data: {
          profile,
          businesses,
          revenue: totalRevenue[0] || {
            total: 0,
            netAmount: 0,
            commission: 0,
          },
          recentTransactions,
          productStats,
          topProducts,
          stats: {
            totalBusinesses: businesses.length,
            totalProducts,
            pendingOrders,
            activeBusinesses: businesses.filter((b) => b.status === "active")
              .length,
          },
        },
      });
    } catch (error) {
      console.error("❌ Entrepreneur dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load dashboard",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// STAFF/TAMISEMI DASHBOARD (National, Regional, District Officials)
app.get(
  "/api/dashboard/staff",
  authenticateToken,
  authorizeRoles(
    "staff",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staffId = req.user.id;
      const profile = await User.findById(staffId).select("-password");

      // Build query based on staff level
      let schoolQuery = {};
      if (profile.regionId) {
        schoolQuery.regionId = profile.regionId;
      }
      if (profile.districtId) {
        schoolQuery.districtId = profile.districtId;
      }

      const [
        schoolStats,
        studentStats,
        teacherStats,
        talentStats,
        eventStats,
        recentActivities,
      ] = await Promise.all([
        School.aggregate([
          { $match: schoolQuery },
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              totalStudents: { $sum: "$totalStudents" },
              totalTeachers: { $sum: "$totalTeachers" },
            },
          },
        ]),
        User.aggregate([
          {
            $match: {
              role: "student",
              isActive: true,
              ...(profile.regionId && { regionId: profile.regionId }),
              ...(profile.districtId && { districtId: profile.districtId }),
            },
          },
          {
            $group: {
              _id: "$schoolId",
              count: { $sum: 1 },
            },
          },
        ]),
        User.aggregate([
          {
            $match: {
              role: "teacher",
              isActive: true,
              ...(profile.regionId && { regionId: profile.regionId }),
              ...(profile.districtId && { districtId: profile.districtId }),
            },
          },
          {
            $group: {
              _id: "$specialization",
              count: { $sum: 1 },
            },
          },
        ]),
        StudentTalent.aggregate([
          {
            $lookup: {
              from: "schools",
              localField: "schoolId",
              foreignField: "_id",
              as: "school",
            },
          },
          { $unwind: "$school" },
          {
            $match: {
              ...(profile.regionId && {
                "school.regionId": profile.regionId,
              }),
              ...(profile.districtId && {
                "school.districtId": profile.districtId,
              }),
            },
          },
          {
            $group: {
              _id: "$talentId",
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "talents",
              localField: "_id",
              foreignField: "_id",
              as: "talent",
            },
          },
          { $unwind: "$talent" },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        Event.aggregate([
          {
            $match: {
              ...(profile.regionId && { regionId: profile.regionId }),
              ...(profile.districtId && { districtId: profile.districtId }),
            },
          },
          {
            $group: {
              _id: "$eventType",
              count: { $sum: 1 },
            },
          },
        ]),
        ActivityLog.find({
          ...(profile.regionId && { "metadata.regionId": profile.regionId }),
          ...(profile.districtId && {
            "metadata.districtId": profile.districtId,
          }),
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("userId", "firstName lastName role"),
      ]);

      // Get totals
      const [totalSchools, totalStudents, totalTeachers] = await Promise.all([
        School.countDocuments(schoolQuery),
        User.countDocuments({
          role: "student",
          isActive: true,
          ...(profile.regionId && { regionId: profile.regionId }),
          ...(profile.districtId && { districtId: profile.districtId }),
        }),
        User.countDocuments({
          role: "teacher",
          isActive: true,
          ...(profile.regionId && { regionId: profile.regionId }),
          ...(profile.districtId && { districtId: profile.districtId }),
        }),
      ]);

      res.json({
        success: true,
        data: {
          profile,
          coverage: {
            level: profile.staffPosition || "National",
            region: profile.regionId
              ? await Region.findById(profile.regionId)
              : null,
            district: profile.districtId
              ? await District.findById(profile.districtId)
              : null,
          },
          stats: {
            totalSchools,
            totalStudents,
            totalTeachers,
            schoolsByType: schoolStats,
            studentsBySchool: studentStats,
            teachersBySpecialization: teacherStats,
          },
          talentDistribution: talentStats,
          eventOverview: eventStats,
          recentActivities,
        },
      });
    } catch (error) {
      console.error("❌ Staff dashboard error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load dashboard",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// PERFORMANCE RECORDS ENDPOINTS
// ============================================================================

// GET all performance records (with filters)
app.get("/api/performance-records", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      studentId,
      talentId,
      schoolId,
      assessmentType,
      minScore,
      maxScore,
    } = req.query;

    const query = {};

    if (studentId) query.studentId = studentId;
    if (talentId) query.talentId = talentId;
    if (schoolId) query.schoolId = schoolId;
    if (assessmentType) query.assessmentType = assessmentType;
    if (minScore) query.score = { $gte: parseFloat(minScore) };
    if (maxScore) query.score = { ...query.score, $lte: parseFloat(maxScore) };

    // Apply role-based access control
    if (req.user.role === "student") {
      query.studentId = req.user.id;
    } else if (req.user.role === "teacher") {
      query.assessedBy = req.user.id;
    } else if (req.user.role === "headmaster") {
      query.schoolId = req.user.schoolId;
    }

    const records = await PerformanceRecord.find(query)
      .sort({ assessmentDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("studentId", "firstName lastName email profileImage")
      .populate("talentId", "name category icon")
      .populate("assessedBy", "firstName lastName")
      .populate("schoolId", "name schoolCode");

    const total = await PerformanceRecord.countDocuments(query);

    res.json({
      success: true,
      data: records,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching performance records:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch performance records",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET performance record by ID
app.get("/api/performance-records/:id", authenticateToken, async (req, res) => {
  try {
    const record = await PerformanceRecord.findById(req.params.id)
      .populate("studentId", "firstName lastName email profileImage")
      .populate("talentId", "name category icon")
      .populate("assessedBy", "firstName lastName email")
      .populate("schoolId", "name schoolCode");

    if (!record) {
      return res.status(404).json({
        success: false,
        error: "Performance record not found",
      });
    }

    // Check permissions
    const canView =
      req.user.role === "super_admin" ||
      record.studentId._id.toString() === req.user.id ||
      record.assessedBy._id.toString() === req.user.id ||
      (req.user.role === "headmaster" &&
        record.schoolId._id.toString() === req.user.schoolId.toString());

    if (!canView) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to view this record",
      });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error("❌ Error fetching performance record:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch performance record",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// CREATE performance record
app.post(
  "/api/performance-records",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const {
        studentId,
        talentId,
        assessmentType,
        assessmentDate,
        score,
        grade,
        comments,
        strengths,
        areasForImprovement,
        recommendations,
        attachments,
        isPublic,
      } = req.body;

      // Verify student talent registration
      const studentTalent = await StudentTalent.findOne({
        studentId,
        talentId,
      });

      if (!studentTalent) {
        return res.status(400).json({
          success: false,
          error: "Student is not registered for this talent",
        });
      }

      const record = await PerformanceRecord.create({
        studentId,
        talentId,
        schoolId: studentTalent.schoolId,
        assessmentType,
        assessmentDate,
        score,
        grade,
        comments,
        strengths,
        areasForImprovement,
        recommendations,
        attachments,
        isPublic: isPublic || false,
        assessedBy: req.user.id,
      });

      // Populate for response
      await record.populate([
        { path: "studentId", select: "firstName lastName email" },
        { path: "talentId", select: "name category" },
        { path: "assessedBy", select: "firstName lastName" },
      ]);

      // Notify student
      await createNotification(
        studentId,
        "New Performance Assessment",
        `You received a new ${assessmentType} assessment for ${record.talentId.name}`,
        "info",
        `/performance/${record._id}`,
      );

      await logActivity(
        req.user.id,
        "PERFORMANCE_RECORDED",
        `Assessed ${record.studentId.firstName} in ${record.talentId.name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Performance record created successfully",
        data: record,
      });
    } catch (error) {
      console.error("❌ Error creating performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create performance record",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE performance record
app.put(
  "/api/performance-records/:id",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const record = await PerformanceRecord.findById(req.params.id);

      if (!record) {
        return res.status(404).json({
          success: false,
          error: "Performance record not found",
        });
      }

      // Check permissions
      const canEdit =
        req.user.role === "super_admin" ||
        record.assessedBy.toString() === req.user.id;

      if (!canEdit) {
        return res.status(403).json({
          success: false,
          error: "You can only edit records you created",
        });
      }

      Object.assign(record, req.body);
      await record.save();

      await record.populate([
        { path: "studentId", select: "firstName lastName" },
        { path: "talentId", select: "name category" },
      ]);

      await logActivity(
        req.user.id,
        "PERFORMANCE_UPDATED",
        `Updated performance record`,
        req,
      );

      res.json({
        success: true,
        message: "Performance record updated successfully",
        data: record,
      });
    } catch (error) {
      console.error("❌ Error updating performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update performance record",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE performance record
app.delete(
  "/api/performance-records/:id",
  authenticateToken,
  authorizeRoles("super_admin", "headmaster"),
  async (req, res) => {
    try {
      const record = await PerformanceRecord.findByIdAndDelete(req.params.id);

      if (!record) {
        return res.status(404).json({
          success: false,
          error: "Performance record not found",
        });
      }

      await logActivity(
        req.user.id,
        "PERFORMANCE_DELETED",
        `Deleted performance record`,
        req,
      );

      res.json({
        success: true,
        message: "Performance record deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete performance record",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET student performance summary
app.get(
  "/api/students/:studentId/performance",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { studentId } = req.params;

      // Check permissions
      const canView =
        req.user.role === "super_admin" ||
        req.user.id === studentId ||
        req.user.role === "teacher" ||
        req.user.role === "headmaster";

      if (!canView) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to view this data",
        });
      }

      const [overallStats, byTalent, recentRecords, trends] = await Promise.all(
        [
          PerformanceRecord.aggregate([
            {
              $match: {
                studentId: new mongoose.Types.ObjectId(studentId),
              },
            },
            {
              $group: {
                _id: null,
                avgScore: { $avg: "$score" },
                maxScore: { $max: "$score" },
                minScore: { $min: "$score" },
                totalAssessments: { $sum: 1 },
              },
            },
          ]),
          PerformanceRecord.aggregate([
            {
              $match: {
                studentId: new mongoose.Types.ObjectId(studentId),
              },
            },
            {
              $group: {
                _id: "$talentId",
                avgScore: { $avg: "$score" },
                assessmentCount: { $sum: 1 },
                latestGrade: { $last: "$grade" },
              },
            },
            {
              $lookup: {
                from: "talents",
                localField: "_id",
                foreignField: "_id",
                as: "talent",
              },
            },
            { $unwind: "$talent" },
          ]),
          PerformanceRecord.find({ studentId })
            .sort({ assessmentDate: -1 })
            .limit(10)
            .populate("talentId", "name category")
            .populate("assessedBy", "firstName lastName"),
          PerformanceRecord.aggregate([
            {
              $match: {
                studentId: new mongoose.Types.ObjectId(studentId),
              },
            },
            {
              $group: {
                _id: {
                  year: { $year: "$assessmentDate" },
                  month: { $month: "$assessmentDate" },
                },
                avgScore: { $avg: "$score" },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
        ],
      );

      res.json({
        success: true,
        data: {
          overall: overallStats[0] || {
            avgScore: 0,
            maxScore: 0,
            minScore: 0,
            totalAssessments: 0,
          },
          byTalent,
          recentRecords,
          trends,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching student performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch student performance",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// ENTREPRENEUR ENDPOINTS (10 ENDPOINTS)
// ============================================

// GET Entrepreneur Profile
app.get(
  "/api/entrepreneur/profile",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const entrepreneur = await User.findById(req.user.id)
        .select("-password")
        .populate("schoolId", "name schoolCode")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      if (!entrepreneur) {
        return res
          .status(404)
          .json({ success: false, error: "Entrepreneur not found" });
      }

      // Get entrepreneur's businesses
      const businesses = await Business.find({ ownerId: entrepreneur._id });

      res.json({
        success: true,
        data: {
          ...entrepreneur.toObject(),
          businesses,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching entrepreneur profile:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch profile" });
    }
  },
);

// GET Business Metrics
app.get(
  "/api/entrepreneur/metrics",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const businesses = await Business.find({ ownerId: req.user.id });
      const businessIds = businesses.map((b) => b._id);

      const [totalProducts, totalRevenue, recentTransactions, productStats] = // ✅ totalRevenue not recentRevenue
        await Promise.all([
          Product.countDocuments({
            businessId: { $in: businessIds },
            isActive: true,
          }),
          Revenue.aggregate([
            { $match: { businessId: { $in: businessIds } } },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                net: { $sum: "$netAmount" },
              },
            },
          ]),
          Transaction.find({
            businessId: { $in: businessIds },
            status: "completed",
          })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("userId", "firstName lastName"),
          Product.aggregate([
            { $match: { businessId: { $in: businessIds } } },
            {
              $group: {
                _id: "$type",
                count: { $sum: 1 },
                totalValue: { $sum: "$price" },
              },
            },
          ]),
        ]);

      res.json({
        success: true,
        data: {
          totalBusinesses: businesses.length,
          activeBusinesses: businesses.filter((b) => b.status === "active")
            .length,
          totalProducts,
          revenue: totalRevenue[0] || { total: 0, net: 0 }, // ✅ FIXED
          recentTransactions,
          productStats,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching metrics:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch metrics" });
    }
  },
);

// GET Revenue
app.get(
  "/api/entrepreneur/revenue",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const { year = new Date().getFullYear(), month } = req.query;

      const businesses = await Business.find({ ownerId: req.user.id }).distinct(
        "_id",
      );

      const query = {
        businessId: { $in: businesses },
        year: parseInt(year),
      };

      if (month) query.month = parseInt(month);

      const [revenue, byMonth, byType] = await Promise.all([
        Revenue.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              commission: { $sum: "$commission" },
              net: { $sum: "$netAmount" },
              count: { $sum: 1 },
            },
          },
        ]),
        Revenue.aggregate([
          { $match: { businessId: { $in: businesses }, year: parseInt(year) } },
          {
            $group: {
              _id: "$month",
              total: { $sum: "$amount" },
              net: { $sum: "$netAmount" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Revenue.aggregate([
          { $match: query },
          {
            $group: {
              _id: "$revenueType",
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          summary: revenue[0] || { total: 0, commission: 0, net: 0, count: 0 },
          byMonth,
          byType,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching revenue:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch revenue" });
    }
  },
);

// GET Expenses
app.get(
  "/api/entrepreneur/expenses",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const { year = new Date().getFullYear(), month } = req.query;

      const businesses = await Business.find({ ownerId: req.user.id }).distinct(
        "_id",
      );

      const query = {
        businessId: { $in: businesses },
        transactionType: {
          $in: ["product_purchase", "service_payment", "subscription"],
        },
        status: "completed",
      };

      // Filter by date
      const startDate = month
        ? new Date(year, month - 1, 1)
        : new Date(year, 0, 1);
      const endDate = month ? new Date(year, month, 0) : new Date(year, 11, 31);

      query.createdAt = { $gte: startDate, $lte: endDate };

      const expenses = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .populate("userId", "firstName lastName");

      const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);

      res.json({
        success: true,
        data: {
          expenses,
          total,
          count: expenses.length,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching expenses:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch expenses" });
    }
  },
);

// ADD Transaction
app.post(
  "/api/entrepreneur/transactions",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const { type, amount, description, category, date } = req.body;

      if (!type || !amount || !description) {
        return res.status(400).json({
          success: false,
          error: "Type, amount, and description are required",
        });
      }

      const businesses = await Business.find({ ownerId: req.user.id });
      if (businesses.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Please create a business first",
        });
      }

      const transactionType =
        type === "revenue" ? "product_sale" : "product_purchase";

      const transaction = await Transaction.create({
        userId: req.user.id,
        businessId: businesses[0]._id,
        transactionType,
        amount,
        currency: "TZS",
        status: "completed",
        referenceId: generateReferenceId("TXN"),
        description,
        metadata: { category, manualEntry: true },
        completedAt: date ? new Date(date) : new Date(),
      });

      // Create revenue record if revenue
      if (type === "revenue") {
        const { commission, netAmount } = calculateRevenueSplit(
          amount,
          "product_sale",
        );

        await Revenue.create({
          transactionId: transaction._id,
          businessId: businesses[0]._id,
          userId: req.user.id,
          amount,
          commission,
          netAmount,
          revenueType: "product_sale",
          revenueDate: transaction.completedAt,
          month: new Date(transaction.completedAt).getMonth() + 1,
          year: new Date(transaction.completedAt).getFullYear(),
          quarter: Math.ceil(
            (new Date(transaction.completedAt).getMonth() + 1) / 3,
          ),
          category,
        });
      }

      await logActivity(
        req.user.id,
        "TRANSACTION_ADDED",
        `Added ${type} transaction`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Transaction added successfully",
        data: transaction,
      });
    } catch (error) {
      console.error("❌ Error adding transaction:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to add transaction" });
    }
  },
);

// GET Business Status
app.get(
  "/api/entrepreneur/business-status",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const businesses = await Business.find({ ownerId: req.user.id }).sort({
        createdAt: -1,
      });

      res.json({ success: true, data: businesses });
    } catch (error) {
      console.error("❌ Error fetching business status:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch business status" });
    }
  },
);

// UPDATE Business Status
app.patch(
  "/api/entrepreneur/business-status",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const { status, businessName, businessType, registrationNumber } =
        req.body;

      let business = await Business.findOne({ ownerId: req.user.id });

      if (!business) {
        // Create new business
        business = await Business.create({
          ownerId: req.user.id,
          name: businessName || "My Business",
          businessType: businessType || "General",
          registrationNumber,
          status: status || "pending",
          regionId: req.user.regionId,
          districtId: req.user.districtId,
        });

        await logActivity(
          req.user.id,
          "BUSINESS_CREATED",
          `Created business: ${business.name}`,
          req,
        );
      } else {
        // Update existing business
        if (status) business.status = status;
        if (businessName) business.name = businessName;
        if (businessType) business.businessType = businessType;
        if (registrationNumber)
          business.registrationNumber = registrationNumber;
        business.updatedAt = new Date();
        await business.save();

        await logActivity(
          req.user.id,
          "BUSINESS_UPDATED",
          `Updated business: ${business.name}`,
          req,
        );
      }

      res.json({
        success: true,
        message: "Business status updated successfully",
        data: business,
      });
    } catch (error) {
      console.error("❌ Error updating business status:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update business status" });
    }
  },
);

// GET Entrepreneur Talents
app.get(
  "/api/entrepreneur/talents",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      // Get CTM membership (entrepreneurs can also have talents)
      const membership = await CTMMembership.findOne({
        studentId: req.user.id,
      }).populate("talents", "name category icon description");

      res.json({
        success: true,
        data: membership || { talents: [] },
      });
    } catch (error) {
      console.error("❌ Error fetching talents:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch talents" });
    }
  },
);

// UPDATE Entrepreneur Talents
app.patch(
  "/api/entrepreneur/talents",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const { talents } = req.body;

      if (!talents || !Array.isArray(talents)) {
        return res
          .status(400)
          .json({ success: false, error: "Talents array is required" });
      }

      let membership = await CTMMembership.findOne({ studentId: req.user.id });

      if (!membership) {
        const membershipNumber = `CTM-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)
          .toUpperCase()}`;
        membership = await CTMMembership.create({
          studentId: req.user.id,
          membershipNumber,
          schoolId: req.user.schoolId,
          talents,
          membershipType: "premium", // Entrepreneurs get premium
        });
      } else {
        membership.talents = talents;
        membership.updatedAt = new Date();
        await membership.save();
      }

      await logActivity(
        req.user.id,
        "TALENTS_UPDATED",
        "Updated talent selections",
        req,
      );

      res.json({
        success: true,
        message: "Talents updated successfully",
        data: membership,
      });
    } catch (error) {
      console.error("❌ Error updating talents:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update talents" });
    }
  },
);

// UPDATE Entrepreneur Profile
app.patch(
  "/api/entrepreneur/profile",
  authenticateToken,
  authorizeRoles("entrepreneur"),
  async (req, res) => {
    try {
      const allowedUpdates = [
        "firstName",
        "lastName",
        "phoneNumber",
        "address",
        "emergencyContact",
        "profileImage",
        "dateOfBirth",
        "gender",
        "businessName",
        "businessType",
        "tinNumber",
      ];

      const updates = {};
      Object.keys(req.body).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          updates[key] = req.body[key];
        }
      });

      updates.updatedAt = new Date();

      const entrepreneur = await User.findByIdAndUpdate(req.user.id, updates, {
        new: true,
        runValidators: true,
      }).select("-password");

      await logActivity(
        req.user.id,
        "PROFILE_UPDATED",
        "Updated entrepreneur profile",
        req,
      );

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: entrepreneur,
      });
    } catch (error) {
      console.error("❌ Error updating profile:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update profile" });
    }
  },
);

// ============================================
// HEADMASTER ENDPOINTS (26 ENDPOINTS)
// ============================================

// GET Headmaster Profile
app.get(
  "/api/headmaster/profile",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const headmaster = await User.findById(req.user.id)
        .select("-password")
        .populate("schoolId", "name schoolCode logo address phoneNumber email");

      res.json({ success: true, data: headmaster });
    } catch (error) {
      console.error("❌ Error fetching profile:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch profile" });
    }
  },
);

// GET School Profile
app.get(
  "/api/headmaster/school",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const school = await School.findById(req.user.schoolId)
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code");

      if (!school) {
        return res
          .status(404)
          .json({ success: false, error: "School not found" });
      }

      // Get school statistics
      const [studentCount, teacherCount, staffCount, classCount] =
        await Promise.all([
          User.countDocuments({
            schoolId: school._id,
            role: "student",
            isActive: true,
          }),
          User.countDocuments({
            schoolId: school._id,
            role: "teacher",
            isActive: true,
          }),
          User.countDocuments({
            schoolId: school._id,
            role: "staff",
            isActive: true,
          }),
          Class.countDocuments({ schoolId: school._id, isActive: true }),
        ]);

      res.json({
        success: true,
        data: {
          ...school.toObject(),
          stats: {
            students: studentCount,
            teachers: teacherCount,
            staff: staffCount,
            classes: classCount,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching school:", error);
      res.status(500).json({ success: false, error: "Failed to fetch school" });
    }
  },
);

// UPDATE School Profile
app.patch(
  "/api/headmaster/school",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const school = await School.findByIdAndUpdate(
        req.user.schoolId,
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true },
      );

      if (!school) {
        return res
          .status(404)
          .json({ success: false, error: "School not found" });
      }

      await logActivity(
        req.user.id,
        "SCHOOL_UPDATED",
        `Updated school: ${school.name}`,
        req,
      );

      res.json({
        success: true,
        message: "School updated successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error updating school:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update school" });
    }
  },
);

// GET Pending Teachers
app.get(
  "/api/headmaster/approvals/teachers",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const pendingTeachers = await User.find({
        schoolId: req.user.schoolId,
        role: "teacher",
        isActive: false, // Pending approval
      })
        .select("-password")
        .sort({ createdAt: -1 });

      res.json({ success: true, data: pendingTeachers });
    } catch (error) {
      console.error("❌ Error fetching pending teachers:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending teachers" });
    }
  },
);

// GET Pending Students
app.get(
  "/api/headmaster/approvals/students",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const pendingStudents = await User.find({
        schoolId: req.user.schoolId,
        role: "student",
        isActive: false, // Pending approval
      })
        .select("-password")
        .sort({ createdAt: -1 });

      res.json({ success: true, data: pendingStudents });
    } catch (error) {
      console.error("❌ Error fetching pending students:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending students" });
    }
  },
);

/**
 * Approve a user (student or teacher) by headmaster
 * Handles password generation, SMS sending, and notifications
 *
 * @param {string} userId - User ID to approve
 * @param {string} role - User role ('student' or 'teacher')
 * @param {string} schoolId - School ID of the approving headmaster
 * @param {string} approvedBy - ID of the headmaster approving
 * @param {Object} req - Express request object (for logging)
 * @returns {Promise<Object>} - { user, passwordGenerated, userName }
 */
async function approveUser(userId, role, schoolId, approvedBy, req) {
  try {
    console.log(`🔄 Approving ${role}: ${userId} by headmaster: ${approvedBy}`);

    // ============================================
    // 1️⃣ FIND USER
    // ============================================
    const user = await User.findOne({
      _id: userId,
      schoolId: schoolId,
      role: role,
    });

    if (!user) {
      throw new Error(`${role} not found`);
    }

    // ============================================
    // 2️⃣ CHECK IF PASSWORD GENERATION IS NEEDED
    // ============================================
    let newPassword = null;
    let passwordGenerated = false;

    // Generate password ONLY if:
    // - No password exists
    // - Password looks temporary (< 20 chars)
    // - This is first approval (no approvedAt date)
    if (!user.password || user.password.length < 20 || !user.approvedAt) {
      newPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(newPassword);
      user.password = hashedPassword;
      passwordGenerated = true;
      console.log(`✅ Generated NEW password for ${role} ${user._id}`);
    } else {
      console.log(`✅ Keeping EXISTING password for ${role} ${user._id}`);
    }

    // ============================================
    // 3️⃣ ACTIVATE ACCOUNT
    // ============================================
    user.accountStatus = "active";
    user.isActive = true;
    user.approvedBy = approvedBy;
    user.approvedAt = new Date();
    await user.save();

    const userName = `${user.firstName} ${user.lastName}`;

    // ============================================
    // 4️⃣ SEND SMS BASED ON SCENARIO
    // ============================================
    let smsResult = null;

    if (passwordGenerated && newPassword) {
      // ✅ Scenario A: Send password SMS (new user or password reset)
      console.log(`📱 Sending password SMS to ${role}: ${user.phoneNumber}`);

      if (role === "student") {
        smsResult = await smsService.sendPasswordSMS(
          user.phoneNumber,
          newPassword,
          userName,
          user._id.toString(),
        );
      } else if (role === "teacher") {
        smsResult = await smsService.sendPasswordSMS(
          user.phoneNumber,
          newPassword,
          userName,
          user._id.toString(),
        );
      }

      // Log SMS result
      if (smsResult?.success) {
        console.log(`📱 Password SMS sent successfully to ${user.phoneNumber}`);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: `${role} approval password SMS`,
          type: "password",
          status: "sent",
          messageId: smsResult.messageId,
          reference: `${role}_approved_password_${user._id}`,
        });
      } else {
        console.error(`❌ Failed to send password SMS:`, smsResult?.error);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: `${role} approval password SMS (failed)`,
          type: "password",
          status: "failed",
          errorMessage: smsResult?.error || "Unknown error",
          reference: `${role}_approved_password_${user._id}`,
        });
      }
    } else {
      // ✅ Scenario B: Send approval notification (existing user)
      console.log(
        `📱 Sending approval notification to ${role}: ${user.phoneNumber}`,
      );

      const approvalMessage =
        role === "student"
          ? `Karibu ${userName}! Akaunti yako ya mwanafunzi imeidhinishwa. Unaweza kuingia kwa kutumia namba yako ya simu na nenosiri lako la awali. Asante!`
          : `Karibu ${userName}! Akaunti yako ya mwalimu imeidhinishwa. Unaweza kuingia kwa kutumia namba yako ya simu na nenosiri lako la awali. Asante!`;

      smsResult = await smsService.sendSMS(
        user.phoneNumber,
        approvalMessage,
        `${role}_approval_${user._id}`,
      );

      if (smsResult?.success) {
        console.log(`📱 Approval notification sent to ${user.phoneNumber}`);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: `${role} approval notification`,
          type: "general",
          status: "sent",
          messageId: smsResult.messageId,
          reference: `${role}_approval_notif_${user._id}`,
        });
      } else {
        console.error(`❌ Failed to send approval SMS:`, smsResult?.error);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: `${role} approval notification (failed)`,
          type: "general",
          status: "failed",
          errorMessage: smsResult?.error || "Unknown error",
          reference: `${role}_approval_notif_${user._id}`,
        });
      }
    }

    // ============================================
    // 5️⃣ CREATE IN-APP NOTIFICATION
    // ============================================
    const notificationMessage = passwordGenerated
      ? `Your ${role} account has been approved. Check your SMS for login credentials.`
      : `Your ${role} account has been approved. You can now login with your existing password.`;

    await createNotification(
      user._id,
      "Account Approved",
      notificationMessage,
      "success",
    );

    // ============================================
    // 6️⃣ LOG ACTIVITY
    // ============================================
    await logActivity(
      approvedBy,
      `${role.toUpperCase()}_APPROVED`,
      `Approved ${role}: ${user.firstName} ${user.lastName}`,
      req,
      {
        [`${role}Id`]: user._id,
        passwordGenerated,
        userName,
        schoolId: schoolId,
      },
    );

    console.log(
      `✅ ${role} approved: ${userName} (Password generated: ${passwordGenerated})`,
    );

    // ============================================
    // 7️⃣ RETURN RESULT
    // ============================================
    return {
      user,
      passwordGenerated,
      userName,
      smsStatus: smsResult?.success ? "sent" : "failed",
    };
  } catch (error) {
    console.error(`❌ Error approving ${role}:`, error);
    throw error;
  }
}

/**
 * Reject a user (student or teacher) by headmaster
 * Deletes the user from the database
 *
 * @param {string} userId - User ID to reject
 * @param {string} role - User role ('student' or 'teacher')
 * @param {string} schoolId - School ID of the approving headmaster
 * @param {string} rejectedBy - ID of the headmaster rejecting
 * @param {Object} req - Express request object (for logging)
 * @param {string} reason - Reason for rejection (optional)
 * @returns {Promise<Object>} - { userName, reason }
 */
async function rejectUser(
  userId,
  role,
  schoolId,
  rejectedBy,
  req,
  reason = null,
) {
  try {
    console.log(`🔄 Rejecting ${role}: ${userId} by headmaster: ${rejectedBy}`);

    // Find user
    const user = await User.findOne({
      _id: userId,
      schoolId: schoolId,
      role: role,
    });

    if (!user) {
      throw new Error(`${role} not found`);
    }

    const userName = `${user.firstName} ${user.lastName}`;

    // ✅ Optional: Send rejection notification before deletion
    if (user.phoneNumber) {
      const rejectionMessage = `Samahani ${userName}. Ombi lako la ${role === "student" ? "mwanafunzi" : "mwalimu"} haliku idhinishwa. ${reason ? `Sababu: ${reason}` : ""} Kwa maelezo zaidi, wasiliana na shule.`;

      try {
        await smsService.sendSMS(
          user.phoneNumber,
          rejectionMessage,
          `${role}_rejected_${user._id}`,
        );

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: `${role} rejection notification`,
          type: "general",
          status: "sent",
          reference: `${role}_rejected_${user._id}`,
        });
      } catch (smsError) {
        console.warn(
          `⚠️ Failed to send rejection SMS (non-critical):`,
          smsError.message,
        );
      }
    }

    // Delete user
    await user.deleteOne();

    // Log activity
    await logActivity(
      rejectedBy,
      `${role.toUpperCase()}_REJECTED`,
      `Rejected ${role}: ${userName}${reason ? ` - Reason: ${reason}` : ""}`,
      req,
      {
        [`${role}Id`]: userId,
        userName,
        reason,
        schoolId: schoolId,
      },
    );

    console.log(`✅ ${role} rejected and deleted: ${userName}`);

    return {
      userName,
      reason,
    };
  } catch (error) {
    console.error(`❌ Error rejecting ${role}:`, error);
    throw error;
  }
}

// ============================================
// APPROVE TEACHER
// ============================================
app.post(
  "/api/headmaster/approvals/teacher/:userId/approve",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const result = await approveUser(
        req.params.userId,
        "teacher",
        req.user.schoolId,
        req.user.id,
        req,
      );

      res.json({
        success: true,
        message: "Teacher approved successfully",
        data: {
          passwordGenerated: result.passwordGenerated,
          userName: result.userName,
          smsStatus: result.smsStatus,
        },
      });
    } catch (error) {
      console.error("❌ Error in teacher approval endpoint:", error);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Teacher not found",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to approve teacher",
        ...(process.env.NODE_ENV === "development" && {
          debug: error.message,
        }),
      });
    }
  },
);

// ============================================
// REJECT TEACHER
// ============================================
app.post(
  "/api/headmaster/approvals/teacher/:userId/reject",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { reason } = req.body;

      const result = await rejectUser(
        req.params.userId,
        "teacher",
        req.user.schoolId,
        req.user.id,
        req,
        reason,
      );

      res.json({
        success: true,
        message: "Teacher rejected successfully",
        data: {
          userName: result.userName,
          reason: result.reason,
        },
      });
    } catch (error) {
      console.error("❌ Error in teacher rejection endpoint:", error);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Teacher not found",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to reject teacher",
        ...(process.env.NODE_ENV === "development" && {
          debug: error.message,
        }),
      });
    }
  },
);

// ============================================
// APPROVE STUDENT
// ============================================
app.post(
  "/api/headmaster/approvals/student/:userId/approve",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const result = await approveUser(
        req.params.userId,
        "student",
        req.user.schoolId,
        req.user.id,
        req,
      );

      res.json({
        success: true,
        message: "Student approved successfully",
        data: {
          passwordGenerated: result.passwordGenerated,
          userName: result.userName,
          smsStatus: result.smsStatus,
        },
      });
    } catch (error) {
      console.error("❌ Error in student approval endpoint:", error);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Student not found",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to approve student",
        ...(process.env.NODE_ENV === "development" && {
          debug: error.message,
        }),
      });
    }
  },
);

// ============================================
// REJECT STUDENT
// ============================================
app.post(
  "/api/headmaster/approvals/student/:userId/reject",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { reason } = req.body;

      const result = await rejectUser(
        req.params.userId,
        "student",
        req.user.schoolId,
        req.user.id,
        req,
        reason,
      );

      res.json({
        success: true,
        message: "Student rejected successfully",
        data: {
          userName: result.userName,
          reason: result.reason,
        },
      });
    } catch (error) {
      console.error("❌ Error in student rejection endpoint:", error);

      if (error.message.includes("not found")) {
        return res.status(404).json({
          success: false,
          error: "Student not found",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to reject student",
        ...(process.env.NODE_ENV === "development" && {
          debug: error.message,
        }),
      });
    }
  },
);

// CREATE Class (Headmaster can also create classes)
app.post(
  "/api/headmaster/classes",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { name, subject, level, teacherId, academicYear, description } =
        req.body;

      if (!name || !subject || !level || !teacherId) {
        return res.status(400).json({
          success: false,
          error: "Name, subject, level, and teacher are required",
        });
      }

      const classData = await Class.create({
        name,
        subject,
        level,
        teacherId,
        academicYear: academicYear || new Date().getFullYear().toString(),
        description,
        schoolId: req.user.schoolId,
      });

      await logActivity(
        req.user.id,
        "CLASS_CREATED",
        `Created class: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Class created successfully",
        data: classData,
      });
    } catch (error) {
      console.error("❌ Error creating class:", error);
      res.status(500).json({ success: false, error: "Failed to create class" });
    }
  },
);

// CREATE Subject
app.post(
  "/api/headmaster/subjects",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { name, code, description } = req.body;

      if (!name || !code) {
        return res
          .status(400)
          .json({ success: false, error: "Name and code are required" });
      }

      // Store in school metadata (you could create a Subject model if needed)
      const school = await School.findById(req.user.schoolId);
      if (!school.metadata) school.metadata = {};
      if (!school.metadata.subjects) school.metadata.subjects = [];

      school.metadata.subjects.push({ name, code, description });
      await school.save();

      await logActivity(
        req.user.id,
        "SUBJECT_CREATED",
        `Created subject: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Subject created successfully",
        data: { name, code, description },
      });
    } catch (error) {
      console.error("❌ Error creating subject:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create subject" });
    }
  },
);

// CREATE Academic Year
app.post(
  "/api/headmaster/academic-years",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { year, startDate, endDate } = req.body;

      if (!year || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "Year, start date, and end date are required",
        });
      }

      const school = await School.findById(req.user.schoolId);
      if (!school.metadata) school.metadata = {};
      if (!school.metadata.academicYears) school.metadata.academicYears = [];

      school.metadata.academicYears.push({
        year,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
      await school.save();

      await logActivity(
        req.user.id,
        "ACADEMIC_YEAR_CREATED",
        `Created academic year: ${year}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Academic year created successfully",
        data: { year, startDate, endDate },
      });
    } catch (error) {
      console.error("❌ Error creating academic year:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create academic year" });
    }
  },
);

// GET Announcements
app.get(
  "/api/headmaster/announcements",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const announcements = await Announcement.find({
        schoolId: req.user.schoolId,
      })
        .sort({ publishDate: -1 })
        .populate("createdBy", "firstName lastName");

      res.json({ success: true, data: announcements });
    } catch (error) {
      console.error("❌ Error fetching announcements:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch announcements" });
    }
  },
);

// CREATE Announcement
app.post(
  "/api/headmaster/announcements",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const {
        title,
        content,
        priority,
        targetAudience,
        expiryDate,
        attachments,
      } = req.body;

      if (!title || !content) {
        return res
          .status(400)
          .json({ success: false, error: "Title and content are required" });
      }

      const announcement = await Announcement.create({
        title,
        content,
        priority: priority || "normal",
        targetAudience: targetAudience || "all",
        schoolId: req.user.schoolId,
        createdBy: req.user.id,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        attachments: attachments || [],
      });

      await logActivity(
        req.user.id,
        "ANNOUNCEMENT_CREATED",
        `Created announcement: ${title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Announcement created successfully",
        data: announcement,
      });
    } catch (error) {
      console.error("❌ Error creating announcement:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create announcement" });
    }
  },
);

// CREATE Event
app.post(
  "/api/headmaster/events",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { title, description, date, location, type } = req.body;

      if (!title || !date) {
        return res
          .status(400)
          .json({ success: false, error: "Title and date are required" });
      }

      const event = await Event.create({
        title,
        description,
        startDate: new Date(date),
        endDate: new Date(date),
        location,
        eventType: type || "other",
        organizer: req.user.id,
        schoolId: req.user.schoolId,
        status: "published",
      });

      await logActivity(
        req.user.id,
        "EVENT_CREATED",
        `Created event: ${title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: event,
      });
    } catch (error) {
      console.error("❌ Error creating event:", error);
      res.status(500).json({ success: false, error: "Failed to create event" });
    }
  },
);

// GET Analytics
app.get(
  "/api/headmaster/analytics",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const schoolId = req.user.schoolId;

      const [
        studentStats,
        teacherStats,
        attendanceStats,
        gradeStats,
        eventStats,
      ] = await Promise.all([
        User.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(schoolId),
              role: "student",
            },
          },
          { $group: { _id: "$gradeLevel", count: { $sum: 1 } } },
        ]),
        User.countDocuments({ schoolId, role: "teacher", isActive: true }),
        AttendanceRecord.aggregate([
          { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Grade.aggregate([
          { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
          {
            $group: {
              _id: "$subject",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
            },
          },
        ]),
        Event.countDocuments({ schoolId, status: "published" }),
      ]);

      res.json({
        success: true,
        data: {
          students: {
            byGrade: studentStats,
            total: studentStats.reduce((sum, s) => sum + s.count, 0),
          },
          teachers: teacherStats,
          attendance: attendanceStats,
          grades: gradeStats,
          events: eventStats,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching analytics:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch analytics" });
    }
  },
);

// GET Attendance Analytics
app.get(
  "/api/headmaster/analytics/attendance",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const query = { schoolId: req.user.schoolId };

      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      const [byStatus, byDate, byClass] = await Promise.all([
        AttendanceRecord.aggregate([
          { $match: query },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        AttendanceRecord.aggregate([
          { $match: query },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              total: { $sum: 1 },
              present: {
                $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        AttendanceRecord.aggregate([
          { $match: query },
          {
            $lookup: {
              from: "users",
              localField: "studentId",
              foreignField: "_id",
              as: "student",
            },
          },
          { $unwind: "$student" },
          {
            $group: {
              _id: "$student.gradeLevel",
              total: { $sum: 1 },
              present: {
                $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
              },
            },
          },
        ]),
      ]);

      res.json({
        success: true,
        data: { byStatus, byDate, byClass },
      });
    } catch (error) {
      console.error("❌ Error fetching attendance analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch attendance analytics",
      });
    }
  },
);

// GET Academic Analytics
app.get(
  "/api/headmaster/analytics/academic",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const [avgBySubject, avgByClass, topPerformers] = await Promise.all([
        Grade.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
            },
          },
          {
            $group: {
              _id: "$subject",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
            },
          },
          { $sort: { avgScore: -1 } },
        ]),
        Grade.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "studentId",
              foreignField: "_id",
              as: "student",
            },
          },
          { $unwind: "$student" },
          {
            $group: {
              _id: "$student.gradeLevel",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Grade.aggregate([
          {
            $match: {
              schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
            },
          },
          {
            $group: {
              _id: "$studentId",
              avgScore: { $avg: "$score" },
            },
          },
          { $sort: { avgScore: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "student",
            },
          },
          { $unwind: "$student" },
        ]),
      ]);

      res.json({
        success: true,
        data: { avgBySubject, avgByClass, topPerformers },
      });
    } catch (error) {
      console.error("❌ Error fetching academic analytics:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch academic analytics" });
    }
  },
);

// GET CTM Members
app.get(
  "/api/headmaster/ctm/members",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const members = await CTMMembership.find({ schoolId: req.user.schoolId })
        .populate(
          "studentId",
          "firstName lastName email profileImage gradeLevel",
        )
        .populate("talents", "name category")
        .sort({ joinDate: -1 });

      res.json({ success: true, data: members });
    } catch (error) {
      console.error("❌ Error fetching CTM members:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch CTM members" });
    }
  },
);

// GET CTM Activities
app.get(
  "/api/headmaster/ctm/activities",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const activities = await CTMActivity.find({ schoolId: req.user.schoolId })
        .sort({ date: -1 })
        .populate("organizer", "firstName lastName")
        .populate("participants", "firstName lastName profileImage");

      res.json({ success: true, data: activities });
    } catch (error) {
      console.error("❌ Error fetching CTM activities:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch CTM activities" });
    }
  },
);

// GET Talent Categories
app.get(
  "/api/headmaster/ctm/talents",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const talents = await Talent.find({ isActive: true }).sort({
        category: 1,
        name: 1,
      });

      // Group by category
      const byCategory = {};
      talents.forEach((talent) => {
        if (!byCategory[talent.category]) {
          byCategory[talent.category] = [];
        }
        byCategory[talent.category].push(talent);
      });

      res.json({ success: true, data: { talents, byCategory } });
    } catch (error) {
      console.error("❌ Error fetching talents:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch talents" });
    }
  },
);

// UPDATE CTM Member Status
app.patch(
  "/api/headmaster/ctm/members/:memberId/status",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["active", "inactive", "blocked", "suspended"].includes(status)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid status" });
      }

      const member = await CTMMembership.findOne({
        _id: req.params.memberId,
        schoolId: req.user.schoolId,
      });

      if (!member) {
        return res
          .status(404)
          .json({ success: false, error: "Member not found" });
      }

      member.status = status;
      member.updatedAt = new Date();
      await member.save();

      await createNotification(
        member.studentId,
        "CTM Status Updated",
        `Your CTM membership status has been changed to: ${status}`,
        "info",
      );

      await logActivity(
        req.user.id,
        "CTM_STATUS_UPDATED",
        `Updated CTM member status to ${status}`,
        req,
      );

      res.json({
        success: true,
        message: "Member status updated successfully",
        data: member,
      });
    } catch (error) {
      console.error("❌ Error updating member status:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update member status" });
    }
  },
);

// GET All Students (for transfer/management)
app.get(
  "/api/headmaster/students",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const students = await User.find({
        schoolId: req.user.schoolId,
        role: "student",
      })
        .select("-password")
        .sort({ firstName: 1 });

      res.json({ success: true, data: students });
    } catch (error) {
      console.error("❌ Error fetching students:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch students" });
    }
  },
);

// TRANSFER Student
app.post(
  "/api/headmaster/students/:studentId/transfer",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { targetSchoolId, reason, notes } = req.body;

      if (!targetSchoolId || !reason) {
        return res.status(400).json({
          success: false,
          error: "Target school and reason are required",
        });
      }

      const student = await User.findOne({
        _id: req.params.studentId,
        schoolId: req.user.schoolId,
        role: "student",
      });

      if (!student) {
        return res
          .status(404)
          .json({ success: false, error: "Student not found" });
      }

      const targetSchool = await School.findById(targetSchoolId);
      if (!targetSchool) {
        return res
          .status(404)
          .json({ success: false, error: "Target school not found" });
      }

      // Update student's school
      student.schoolId = targetSchoolId;
      await student.save();

      await createNotification(
        student._id,
        "School Transfer",
        `You have been transferred to ${targetSchool.name}`,
        "info",
      );

      await logActivity(
        req.user.id,
        "STUDENT_TRANSFERRED",
        `Transferred student to ${targetSchool.name}. Reason: ${reason}`,
        req,
        { studentId: student._id, targetSchoolId, reason, notes },
      );

      res.json({
        success: true,
        message: "Student transferred successfully",
        data: { student, targetSchool },
      });
    } catch (error) {
      console.error("❌ Error transferring student:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to transfer student" });
    }
  },
);

// GET Staff
app.get(
  "/api/headmaster/staff",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const staff = await User.find({
        schoolId: req.user.schoolId,
        role: { $in: ["teacher", "staff"] },
        isActive: true,
      })
        .select("-password")
        .sort({ role: 1, firstName: 1 });

      res.json({ success: true, data: staff });
    } catch (error) {
      console.error("❌ Error fetching staff:", error);
      res.status(500).json({ success: false, error: "Failed to fetch staff" });
    }
  },
);

// UPDATE Staff Role
app.patch(
  "/api/headmaster/staff/:staffId/role",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const { role, permissions } = req.body;

      if (!role) {
        return res
          .status(400)
          .json({ success: false, error: "Role is required" });
      }

      const staff = await User.findOne({
        _id: req.params.staffId,
        schoolId: req.user.schoolId,
      });

      if (!staff) {
        return res
          .status(404)
          .json({ success: false, error: "Staff member not found" });
      }

      staff.role = role;
      if (permissions) {
        if (!staff.metadata) staff.metadata = {};
        staff.metadata.permissions = permissions;
      }
      await staff.save();

      await createNotification(
        staff._id,
        "Role Updated",
        `Your role has been updated to: ${role}`,
        "info",
      );

      await logActivity(
        req.user.id,
        "STAFF_ROLE_UPDATED",
        `Updated staff role to ${role}`,
        req,
      );

      res.json({
        success: true,
        message: "Staff role updated successfully",
        data: staff,
      });
    } catch (error) {
      console.error("❌ Error updating staff role:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update staff role" });
    }
  },
);

// GET Teacher Activities
app.get(
  "/api/headmaster/teacher-activities",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const teachers = await User.find({
        schoolId: req.user.schoolId,
        role: "teacher",
        isActive: true,
      }).select("_id firstName lastName");

      const teacherIds = teachers.map((t) => t._id);

      const activities = await ActivityLog.find({
        userId: { $in: teacherIds },
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("userId", "firstName lastName");

      res.json({ success: true, data: activities });
    } catch (error) {
      console.error("❌ Error fetching teacher activities:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch teacher activities" });
    }
  },
);

// GET Teacher Report
app.get(
  "/api/headmaster/teachers/:teacherId/report",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const teacher = await User.findOne({
        _id: req.params.teacherId,
        schoolId: req.user.schoolId,
        role: "teacher",
      }).select("-password");

      if (!teacher) {
        return res
          .status(404)
          .json({ success: false, error: "Teacher not found" });
      }

      const [classes, assignments, gradesGiven, recentActivity] =
        await Promise.all([
          Class.countDocuments({ teacherId: teacher._id }),
          Assignment.countDocuments({ teacherId: teacher._id }),
          Grade.countDocuments({ teacherId: teacher._id }),
          ActivityLog.find({ userId: teacher._id })
            .sort({ createdAt: -1 })
            .limit(20),
        ]);

      res.json({
        success: true,
        data: {
          teacher,
          stats: {
            classes,
            assignments,
            gradesGiven,
          },
          recentActivity,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching teacher report:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch teacher report" });
    }
  },
);
// ============================================
// STAFF/TAMISEMI ENDPOINTS (25 ENDPOINTS)
// ============================================

// GET Staff Overview
app.get(
  "/api/staff/overview",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id)
        .select("-password")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      // Build query based on staff level
      let schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const [schoolCount, studentCount, teacherCount, pendingTasks] =
        await Promise.all([
          School.countDocuments(schoolQuery),
          User.countDocuments({
            role: "student",
            ...(staff.districtId && { districtId: staff.districtId }),
            ...(staff.regionId && { regionId: staff.regionId }),
          }),
          User.countDocuments({
            role: "teacher",
            ...(staff.districtId && { districtId: staff.districtId }),
            ...(staff.regionId && { regionId: staff.regionId }),
          }),
          Todo.countDocuments({ userId: staff._id, completed: false }),
        ]);

      res.json({
        success: true,
        data: {
          profile: staff,
          stats: {
            schools: schoolCount,
            students: studentCount,
            teachers: teacherCount,
            pendingTasks,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching overview:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch overview" });
    }
  },
);

// GET Staff Profile
app.get(
  "/api/staff/profile",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const profile = await User.findById(req.user.id)
        .select("-password")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      res.json({ success: true, data: profile });
    } catch (error) {
      console.error("❌ Error fetching profile:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch profile" });
    }
  },
);

// GET Assigned Activities
app.get(
  "/api/staff/activities",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      // For now, return todos as activities
      const activities = await Todo.find({ userId: req.user.id }).sort({
        dueDate: 1,
        createdAt: -1,
      });

      res.json({ success: true, data: activities });
    } catch (error) {
      console.error("❌ Error fetching activities:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch activities" });
    }
  },
);

// UPDATE Activity Status
app.patch(
  "/api/staff/activities/:activityId/status",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["in_progress", "completed"].includes(status)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid status" });
      }

      const activity = await Todo.findOne({
        _id: req.params.activityId,
        userId: req.user.id,
      });

      if (!activity) {
        return res
          .status(404)
          .json({ success: false, error: "Activity not found" });
      }

      activity.completed = status === "completed";
      if (activity.completed) {
        activity.completedAt = new Date();
      }
      activity.updatedAt = new Date();
      await activity.save();

      await logActivity(
        req.user.id,
        "ACTIVITY_STATUS_UPDATED",
        `Updated activity status to ${status}`,
        req,
      );

      res.json({
        success: true,
        message: "Activity status updated successfully",
        data: activity,
      });
    } catch (error) {
      console.error("❌ Error updating activity status:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update activity status" });
    }
  },
);

// GET Supervised Users
app.get(
  "/api/staff/supervised-users",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const query = {
        role: { $in: ["student", "teacher", "headmaster", "entrepreneur"] },
      };

      if (staff.districtId) {
        query.districtId = staff.districtId;
      } else if (staff.regionId) {
        query.regionId = staff.regionId;
      }

      const users = await User.find(query)
        .select("firstName lastName email role schoolId isActive")
        .populate("schoolId", "name schoolCode")
        .sort({ role: 1, firstName: 1 })
        .limit(100);

      res.json({ success: true, data: users });
    } catch (error) {
      console.error("❌ Error fetching supervised users:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch supervised users" });
    }
  },
);

// SEND Message
app.post(
  "/api/staff/messages",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const { userId, message } = req.body;

      if (!userId || !message) {
        return res
          .status(400)
          .json({ success: false, error: "User ID and message are required" });
      }

      await createNotification(
        userId,
        "Message from Official",
        message,
        "info",
      );

      await logActivity(
        req.user.id,
        "MESSAGE_SENT",
        `Sent message to user ${userId}`,
        req,
      );

      res.json({ success: true, message: "Message sent successfully" });
    } catch (error) {
      console.error("❌ Error sending message:", error);
      res.status(500).json({ success: false, error: "Failed to send message" });
    }
  },
);

// GET Work Reports
app.get(
  "/api/staff/work-reports",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const reports = await WorkReport.find({ userId: req.user.id })
        .sort({ submittedAt: -1, createdAt: -1 })
        .populate("reviewedBy", "firstName lastName");

      res.json({ success: true, data: reports });
    } catch (error) {
      console.error("❌ Error fetching work reports:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch work reports" });
    }
  },
);

// SUBMIT Work Report
app.post(
  "/api/staff/work-reports",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const {
        type,
        title,
        period,
        achievements,
        challenges,
        nextSteps,
        metrics,
        attachments,
      } = req.body;

      if (!type || !title || !period || !achievements) {
        return res.status(400).json({
          success: false,
          error: "Type, title, period, and achievements are required",
        });
      }

      const report = await WorkReport.create({
        userId: req.user.id,
        type,
        title,
        period,
        achievements,
        challenges,
        nextSteps,
        metrics,
        attachments: attachments || [],
        status: "submitted",
        submittedAt: new Date(),
      });

      await logActivity(
        req.user.id,
        "WORK_REPORT_SUBMITTED",
        `Submitted ${type} work report`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Work report submitted successfully",
        data: report,
      });
    } catch (error) {
      console.error("❌ Error submitting work report:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to submit work report" });
    }
  },
);

// GET Permission Requests
app.get(
  "/api/staff/permission-requests",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const requests = await PermissionRequest.find({ userId: req.user.id })
        .sort({ submittedAt: -1 })
        .populate("reviewedBy", "firstName lastName");

      res.json({ success: true, data: requests });
    } catch (error) {
      console.error("❌ Error fetching permission requests:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch permission requests" });
    }
  },
);

// SUBMIT Permission Request
app.post(
  "/api/staff/permission-requests",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const {
        type,
        title,
        description,
        amount,
        startDate,
        endDate,
        reason,
        attachments,
      } = req.body;

      if (!type || !title || !description || !reason) {
        return res.status(400).json({
          success: false,
          error: "Type, title, description, and reason are required",
        });
      }

      const request = await PermissionRequest.create({
        userId: req.user.id,
        type,
        title,
        description,
        amount,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        reason,
        attachments: attachments || [],
        status: "pending",
      });

      await logActivity(
        req.user.id,
        "PERMISSION_REQUEST_SUBMITTED",
        `Submitted ${type} permission request`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Permission request submitted successfully",
        data: request,
      });
    } catch (error) {
      console.error("❌ Error submitting permission request:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to submit permission request" });
    }
  },
);

// GET Pending Approvals (for supervisors)
app.get(
  "/api/staff/pending-approvals",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      // Get pending work reports and permission requests from subordinates
      const staff = await User.findById(req.user.id);

      const subordinateQuery = {};
      if (staff.districtId) {
        subordinateQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        subordinateQuery.regionId = staff.regionId;
      }

      const subordinates = await User.find({
        ...subordinateQuery,
        role: { $in: ["staff", "district_official"] },
        _id: { $ne: req.user.id },
      }).distinct("_id");

      const [pendingReports, pendingRequests] = await Promise.all([
        WorkReport.find({
          userId: { $in: subordinates },
          status: "submitted",
        })
          .populate("userId", "firstName lastName role")
          .sort({ submittedAt: -1 }),
        PermissionRequest.find({
          userId: { $in: subordinates },
          status: "pending",
        })
          .populate("userId", "firstName lastName role")
          .sort({ submittedAt: -1 }),
      ]);

      res.json({
        success: true,
        data: {
          reports: pendingReports,
          requests: pendingRequests,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching pending approvals:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending approvals" });
    }
  },
);

// GET Todos
app.get(
  "/api/staff/todos",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const todos = await Todo.find({ userId: req.user.id }).sort({
        completed: 1,
        dueDate: 1,
        priority: -1,
      });

      res.json({ success: true, data: todos });
    } catch (error) {
      console.error("❌ Error fetching todos:", error);
      res.status(500).json({ success: false, error: "Failed to fetch todos" });
    }
  },
);

// CREATE Todo
app.post(
  "/api/staff/todos",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const { title, description, dueDate, priority, category } = req.body;

      if (!title) {
        return res
          .status(400)
          .json({ success: false, error: "Title is required" });
      }

      const todo = await Todo.create({
        userId: req.user.id,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority: priority || "medium",
        category,
      });

      res.status(201).json({
        success: true,
        message: "Todo created successfully",
        data: todo,
      });
    } catch (error) {
      console.error("❌ Error creating todo:", error);
      res.status(500).json({ success: false, error: "Failed to create todo" });
    }
  },
);

// TOGGLE Todo Complete
app.patch(
  "/api/staff/todos/:todoId",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const { completed } = req.body;

      const todo = await Todo.findOne({
        _id: req.params.todoId,
        userId: req.user.id,
      });

      if (!todo) {
        return res
          .status(404)
          .json({ success: false, error: "Todo not found" });
      }

      todo.completed = completed;
      if (completed) {
        todo.completedAt = new Date();
      } else {
        todo.completedAt = undefined;
      }
      todo.updatedAt = new Date();
      await todo.save();

      res.json({
        success: true,
        message: "Todo updated successfully",
        data: todo,
      });
    } catch (error) {
      console.error("❌ Error updating todo:", error);
      res.status(500).json({ success: false, error: "Failed to update todo" });
    }
  },
);

// DELETE Todo
app.delete(
  "/api/staff/todos/:todoId",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const todo = await Todo.findOneAndDelete({
        _id: req.params.todoId,
        userId: req.user.id,
      });

      if (!todo) {
        return res
          .status(404)
          .json({ success: false, error: "Todo not found" });
      }

      res.json({ success: true, message: "Todo deleted successfully" });
    } catch (error) {
      console.error("❌ Error deleting todo:", error);
      res.status(500).json({ success: false, error: "Failed to delete todo" });
    }
  },
);

// GET Timetable
app.get(
  "/api/staff/timetable",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      // Return staff's personal schedule (stored as todos with specific category)
      const schedule = await Todo.find({
        userId: req.user.id,
        category: "schedule",
        completed: false,
      }).sort({ dueDate: 1 });

      res.json({ success: true, data: schedule });
    } catch (error) {
      console.error("❌ Error fetching timetable:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch timetable" });
    }
  },
);

// GET Exam Results (aggregated for their area)
app.get(
  "/api/staff/exam-results",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const schools = await School.find(schoolQuery).distinct("_id");

      const results = await Grade.aggregate([
        { $match: { schoolId: { $in: schools } } },
        {
          $group: {
            _id: { subject: "$subject", schoolId: "$schoolId" },
            avgScore: { $avg: "$score" },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "schools",
            localField: "_id.schoolId",
            foreignField: "_id",
            as: "school",
          },
        },
        { $unwind: "$school" },
        { $sort: { avgScore: -1 } },
      ]);

      res.json({ success: true, data: results });
    } catch (error) {
      console.error("❌ Error fetching exam results:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch exam results" });
    }
  },
);

// GET Grades (aggregated)
app.get(
  "/api/staff/grades",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const schools = await School.find(schoolQuery).distinct("_id");

      const [bySubject, bySchool] = await Promise.all([
        Grade.aggregate([
          { $match: { schoolId: { $in: schools } } },
          {
            $group: {
              _id: "$subject",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
            },
          },
          { $sort: { avgScore: -1 } },
        ]),
        Grade.aggregate([
          { $match: { schoolId: { $in: schools } } },
          {
            $group: {
              _id: "$schoolId",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "schools",
              localField: "_id",
              foreignField: "_id",
              as: "school",
            },
          },
          { $unwind: "$school" },
          { $sort: { avgScore: -1 } },
        ]),
      ]);

      res.json({ success: true, data: { bySubject, bySchool } });
    } catch (error) {
      console.error("❌ Error fetching grades:", error);
      res.status(500).json({ success: false, error: "Failed to fetch grades" });
    }
  },
);

// GET Rankings (aggregated)
app.get(
  "/api/staff/rankings",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const schools = await School.find(schoolQuery).distinct("_id");

      const topSchools = await Ranking.aggregate([
        { $match: { schoolId: { $in: schools } } },
        {
          $group: {
            _id: "$schoolId",
            avgScore: { $avg: "$averageScore" },
            studentCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "schools",
            localField: "_id",
            foreignField: "_id",
            as: "school",
          },
        },
        { $unwind: "$school" },
        { $sort: { avgScore: -1 } },
        { $limit: 20 },
      ]);

      res.json({ success: true, data: topSchools });
    } catch (error) {
      console.error("❌ Error fetching rankings:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch rankings" });
    }
  },
);

// GET Attendance (aggregated)
app.get(
  "/api/staff/attendance",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const staff = await User.findById(req.user.id);

      const schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const schools = await School.find(schoolQuery).distinct("_id");

      const query = { schoolId: { $in: schools } };
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      const [byStatus, bySchool] = await Promise.all([
        AttendanceRecord.aggregate([
          { $match: query },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        AttendanceRecord.aggregate([
          { $match: query },
          {
            $group: {
              _id: "$schoolId",
              total: { $sum: 1 },
              present: {
                $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
              },
            },
          },
          {
            $lookup: {
              from: "schools",
              localField: "_id",
              foreignField: "_id",
              as: "school",
            },
          },
          { $unwind: "$school" },
          {
            $project: {
              schoolName: "$school.name",
              total: 1,
              present: 1,
              rate: {
                $multiply: [{ $divide: ["$present", "$total"] }, 100],
              },
            },
          },
          { $sort: { rate: -1 } },
        ]),
      ]);

      res.json({ success: true, data: { byStatus, bySchool } });
    } catch (error) {
      console.error("❌ Error fetching attendance:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch attendance" });
    }
  },
);

// GET Announcements
app.get(
  "/api/staff/announcements",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const query = {
        isActive: true,
        targetAudience: { $in: ["all", "staff"] },
        publishDate: { $lte: new Date() },
      };

      if (staff.regionId) {
        query.$or = [
          { regionId: staff.regionId },
          { regionId: { $exists: false } },
        ];
      }

      const announcements = await Announcement.find(query)
        .sort({ priority: -1, publishDate: -1 })
        .limit(50)
        .populate("createdBy", "firstName lastName role");

      res.json({ success: true, data: announcements });
    } catch (error) {
      console.error("❌ Error fetching announcements:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch announcements" });
    }
  },
);

// GET Events
app.get(
  "/api/staff/events",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const query = { status: "published" };

      if (staff.regionId) {
        query.$or = [
          { regionId: staff.regionId },
          { regionId: { $exists: false } },
        ];
      }

      const events = await Event.find(query)
        .sort({ startDate: 1 })
        .limit(50)
        .populate("organizer", "firstName lastName")
        .populate("schoolId", "name schoolCode");

      res.json({ success: true, data: events });
    } catch (error) {
      console.error("❌ Error fetching events:", error);
      res.status(500).json({ success: false, error: "Failed to fetch events" });
    }
  },
);

// GET CTM Members (aggregated)
app.get(
  "/api/staff/ctm-members",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const schools = await School.find(schoolQuery).distinct("_id");

      const members = await CTMMembership.aggregate([
        { $match: { schoolId: { $in: schools } } },
        {
          $group: {
            _id: "$schoolId",
            memberCount: { $sum: 1 },
            activeCount: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
            },
          },
        },
        {
          $lookup: {
            from: "schools",
            localField: "_id",
            foreignField: "_id",
            as: "school",
          },
        },
        { $unwind: "$school" },
        { $sort: { memberCount: -1 } },
      ]);

      res.json({ success: true, data: members });
    } catch (error) {
      console.error("❌ Error fetching CTM members:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch CTM members" });
    }
  },
);

// GET CTM Activities
app.get(
  "/api/staff/ctm-activities",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const staff = await User.findById(req.user.id);

      const schoolQuery = {};
      if (staff.districtId) {
        schoolQuery.districtId = staff.districtId;
      } else if (staff.regionId) {
        schoolQuery.regionId = staff.regionId;
      }

      const schools = await School.find(schoolQuery).distinct("_id");

      const activities = await CTMActivity.find({ schoolId: { $in: schools } })
        .sort({ date: -1 })
        .limit(100)
        .populate("schoolId", "name schoolCode")
        .populate("organizer", "firstName lastName");

      res.json({ success: true, data: activities });
    } catch (error) {
      console.error("❌ Error fetching CTM activities:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch CTM activities" });
    }
  },
);

// GET Notifications
app.get(
  "/api/staff/notifications",
  authenticateToken,
  authorizeRoles(
    "staff",
    "district_official",
    "regional_official",
    "national_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const notifications = await Notification.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50);

      res.json({ success: true, data: notifications });
    } catch (error) {
      console.error("❌ Error fetching notifications:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch notifications" });
    }
  },
);
// ============================================
// SUPERADMIN ENDPOINTS (30 ENDPOINTS)
// ============================================

// GET SuperAdmin Overview - FIXED VERSION
app.get(
  "/api/superadmin/overview",
  authenticateToken,
  authorizeRoles("super_admin", "tamisemi"),
  async (req, res) => {
    try {
      console.log("📊 SuperAdmin: Fetching overview data...");

      const [
        totalUsers,
        totalSchools,
        totalStudents,
        totalTeachers,
        totalRegions,
        inactiveUsers,
        activeSessions,
      ] = await Promise.all([
        User.countDocuments().catch(() => 0),
        School.countDocuments().catch(() => 0),
        User.countDocuments({ role: "student", accountStatus: "active" }).catch(
          () => 0,
        ), // 🆕 PHASE 2
        User.countDocuments({ role: "teacher", accountStatus: "active" }).catch(
          () => 0,
        ), // 🆕 PHASE 2
        Region.countDocuments({ isActive: true }).catch(() => 0),
        User.countDocuments({
          accountStatus: { $in: ["inactive", "suspended"] },
        }).catch(() => 0), // 🆕 PHASE 2
        User.countDocuments({
          accountStatus: "active", // 🆕 PHASE 2
          lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }).catch(() => 0),
      ]);

      // Calculate monthly revenue (safe fallback)
      let monthlyRevenue = 0;
      try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const revenueResult = await Revenue.aggregate([
          {
            $match: {
              year: currentYear,
              month: currentMonth,
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        monthlyRevenue = revenueResult[0]?.total
          ? Math.round(revenueResult[0].total / 1000)
          : 0;
      } catch (err) {
        console.error("Revenue calculation error:", err);
        monthlyRevenue = 0;
      }

      const data = {
        totalUsers,
        totalSchools,
        totalStudents,
        totalTeachers,
        regionsCovered: totalRegions,
        monthlyRevenue,
        pendingIssues: 0, // You can calculate this based on your needs
        moderatedUsers: inactiveUsers,
        activeSessions,
      };

      console.log("✅ SuperAdmin: Overview data fetched successfully", data);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("❌ SuperAdmin: Error fetching overview:", error);

      // Return safe defaults instead of crashing
      res.json({
        success: true,
        data: {
          totalUsers: 0,
          totalSchools: 0,
          totalStudents: 0,
          totalTeachers: 0,
          regionsCovered: 0,
          monthlyRevenue: 0,
          pendingIssues: 0,
          moderatedUsers: 0,
          activeSessions: 0,
        },
      });
    }
  },
);

// GET SuperAdmin Analytics
app.get(
  "/api/superadmin/analytics",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const [userGrowth, schoolGrowth, revenueByMonth, topSchools] =
        await Promise.all([
          User.aggregate([
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                  role: "$role",
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          School.aggregate([
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          Revenue.aggregate([
            {
              $group: {
                _id: { year: "$year", month: "$month" },
                total: { $sum: "$amount" },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ]),
          School.aggregate([
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "schoolId",
                as: "students",
              },
            },
            {
              $project: {
                name: 1,
                studentCount: { $size: "$students" },
              },
            },
            { $sort: { studentCount: -1 } },
            { $limit: 10 },
          ]),
        ]);

      res.json({
        success: true,
        data: {
          userGrowth,
          schoolGrowth,
          revenueByMonth,
          topSchools,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching analytics:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch analytics" });
    }
  },
);

// GET All Schools (SuperAdmin)
app.get(
  "/api/superadmin/schools",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, type, q } = req.query;

      const query = {};

      // ✅ IMPROVED: Better status filtering
      if (status === "active") {
        query.isActive = true;
      } else if (status === "inactive") {
        query.isActive = false;
      }
      // If status === "all" or undefined, don't filter by isActive

      // ✅ ADDED: Filter by school type (primary, secondary, etc.)
      if (type) {
        query.type = type;
      }

      // ✅ ADDED: Search functionality
      if (q) {
        query.$or = [
          { name: { $regex: q, $options: "i" } },
          { schoolCode: { $regex: q, $options: "i" } },
        ];
      }

      const schools = await School.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code"); // ✅ ADDED: Also populate wardId

      const total = await School.countDocuments(query);

      // ✅ ADDED: Statistics by status
      const stats = {
        total: await School.countDocuments(),
        active: await School.countDocuments({ isActive: true }),
        inactive: await School.countDocuments({ isActive: false }),
      };

      console.log(`✅ Fetched ${schools.length} schools (total: ${total})`);

      res.json({
        success: true,
        data: schools,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          stats, // ✅ ADDED: Include stats in response
        },
      });
    } catch (error) {
      console.error("❌ Error fetching schools:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch schools",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE School (SuperAdmin) - UPDATED to handle embedded location data
app.post(
  "/api/superadmin/schools",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const schoolData = { ...req.body };

      console.log("📍 Received school data:", schoolData);

      // ✅ NEW: Handle embedded location objects from frontend
      // Frontend now sends: { regionId: { name: "...", code: "..." } }

      // Process regionId
      if (schoolData.regionId && typeof schoolData.regionId === "object") {
        // Frontend sent embedded object
        const regionData = schoolData.regionId;

        // Try to find or create region
        let region = await Region.findOne({
          $or: [{ code: regionData.code }, { name: regionData.name }],
        });

        if (!region) {
          // Create region if it doesn't exist
          console.log(`📍 Creating new region: ${regionData.name}`);
          region = await Region.create({
            name: regionData.name,
            code: regionData.code,
            isActive: true,
          });
        }

        schoolData.regionId = region._id;
        console.log(`✅ Region resolved: ${region.name} (${region._id})`);
      } else if (schoolData.regionCode) {
        // Fallback: Handle old format (just code/name string)
        const region = await Region.findOne({
          $or: [
            { code: { $regex: new RegExp(`^${schoolData.regionCode}$`, "i") } },
            { name: { $regex: new RegExp(`^${schoolData.regionCode}$`, "i") } },
          ],
        });

        if (region) {
          schoolData.regionId = region._id;
          console.log(`✅ Found region: ${region.name}`);
        } else {
          console.warn(`⚠️ Region not found: ${schoolData.regionCode}`);
          // Don't fail - just skip
        }
        delete schoolData.regionCode;
      }

      // Process districtId
      if (schoolData.districtId && typeof schoolData.districtId === "object") {
        const districtData = schoolData.districtId;

        let district = await District.findOne({
          $or: [{ code: districtData.code }, { name: districtData.name }],
        });

        if (!district && schoolData.regionId) {
          // Create district if it doesn't exist
          console.log(`📍 Creating new district: ${districtData.name}`);
          district = await District.create({
            name: districtData.name,
            code: districtData.code,
            regionId: schoolData.regionId,
            isActive: true,
          });
        }

        if (district) {
          schoolData.districtId = district._id;
          console.log(
            `✅ District resolved: ${district.name} (${district._id})`,
          );
        }
      } else if (schoolData.districtCode) {
        const district = await District.findOne({
          $or: [
            {
              code: { $regex: new RegExp(`^${schoolData.districtCode}$`, "i") },
            },
            {
              name: { $regex: new RegExp(`^${schoolData.districtCode}$`, "i") },
            },
          ],
        });

        if (district) {
          schoolData.districtId = district._id;
          console.log(`✅ Found district: ${district.name}`);
        }
        delete schoolData.districtCode;
      }

      // Process wardId
      if (schoolData.wardId && typeof schoolData.wardId === "object") {
        const wardData = schoolData.wardId;

        let ward = await Ward.findOne({
          $or: [{ code: wardData.code }, { name: wardData.name }],
        });

        if (!ward && schoolData.districtId) {
          // Create ward if it doesn't exist
          console.log(`📍 Creating new ward: ${wardData.name}`);
          ward = await Ward.create({
            name: wardData.name,
            code: wardData.code,
            districtId: schoolData.districtId,
            isActive: true,
          });
        }

        if (ward) {
          schoolData.wardId = ward._id;
          console.log(`✅ Ward resolved: ${ward.name} (${ward._id})`);
        }
      } else if (schoolData.wardCode) {
        const ward = await Ward.findOne({
          $or: [
            { code: { $regex: new RegExp(`^${schoolData.wardCode}$`, "i") } },
            { name: { $regex: new RegExp(`^${schoolData.wardCode}$`, "i") } },
          ],
        });

        if (ward) {
          schoolData.wardId = ward._id;
          console.log(`✅ Found ward: ${ward.name}`);
        }
        delete schoolData.wardCode;
      }

      // ✅ Validate required fields
      if (!schoolData.regionId) {
        return res.status(400).json({
          success: false,
          error: "Region is required",
        });
      }

      if (!schoolData.districtId) {
        return res.status(400).json({
          success: false,
          error: "District is required",
        });
      }

      console.log("💾 Creating school with data:", {
        name: schoolData.name,
        regionId: schoolData.regionId,
        districtId: schoolData.districtId,
        wardId: schoolData.wardId,
      });

      // Create the school
      const school = await School.create(schoolData);

      // Populate the references for the response
      await school.populate([
        { path: "regionId", select: "name code" },
        { path: "districtId", select: "name code" },
        { path: "wardId", select: "name code" },
      ]);

      await logActivity(
        req.user.id,
        "SCHOOL_CREATED",
        `Created school: ${school.name}`,
        req,
      );

      console.log(`✅ School created successfully: ${school.name}`);

      res.status(201).json({
        success: true,
        message: "School created successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error creating school:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create school",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// SUSPEND School
app.post(
  "/api/superadmin/schools/:schoolId/suspend",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { reason } = req.body;

      const school = await School.findByIdAndUpdate(
        req.params.schoolId,
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );

      if (!school) {
        return res
          .status(404)
          .json({ success: false, error: "School not found" });
      }

      await logActivity(
        req.user.id,
        "SCHOOL_SUSPENDED",
        `Suspended school: ${school.name}. Reason: ${reason}`,
        req,
      );

      res.json({
        success: true,
        message: "School suspended successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error suspending school:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to suspend school" });
    }
  },
);

// ACTIVATE School
app.post(
  "/api/superadmin/schools/:schoolId/activate",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const school = await School.findByIdAndUpdate(
        req.params.schoolId,
        { isActive: true, updatedAt: new Date() },
        { new: true },
      );

      if (!school) {
        return res
          .status(404)
          .json({ success: false, error: "School not found" });
      }

      await logActivity(
        req.user.id,
        "SCHOOL_ACTIVATED",
        `Activated school: ${school.name}`,
        req,
      );

      res.json({
        success: true,
        message: "School activated successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error activating school:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to activate school" });
    }
  },
);

// ============================================
// DATA MIGRATION: gradeLevel → classLevel
// ============================================
app.post(
  "/api/superadmin/migrate-classlevel",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      console.log("🔄 Starting classLevel migration...");

      // Find all students who have gradeLevel but no classLevel
      const studentsToMigrate = await User.find({
        role: "student",
        gradeLevel: { $exists: true, $ne: null },
        $or: [
          { classLevel: { $exists: false } },
          { classLevel: null },
          { classLevel: "" },
        ],
      });

      console.log(`📊 Found ${studentsToMigrate.length} students to migrate`);

      let migratedCount = 0;

      for (const student of studentsToMigrate) {
        student.classLevel = student.gradeLevel; // Copy gradeLevel to classLevel
        await student.save();
        migratedCount++;
      }

      console.log(`✅ Successfully migrated ${migratedCount} students`);

      res.json({
        success: true,
        message: `Successfully migrated ${migratedCount} students`,
        data: {
          total: studentsToMigrate.length,
          migrated: migratedCount,
        },
      });
    } catch (error) {
      console.error("❌ Migration error:", error);
      res.status(500).json({
        success: false,
        error: "Migration failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// GET Education Level Statistics
// ============================================
app.get(
  "/api/superadmin/students/education-levels",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      console.log("📊 Fetching education level statistics...");

      // Get all students with classLevel data
      const students = await User.find({
        role: "student",
        isActive: true,
        $or: [
          { classLevel: { $exists: true, $ne: null, $ne: "" } },
          { gradeLevel: { $exists: true, $ne: null, $ne: "" } },
        ],
      })
        .select("classLevel gradeLevel")
        .lean();

      console.log(`📊 Total students found: ${students.length}`);

      // Categorize students
      const levels = {
        primary: 0,
        secondary: 0,
        college: 0,
        university: 0,
        other: 0,
      };

      students.forEach((student) => {
        // Use classLevel first, fallback to gradeLevel
        const level = (
          student.classLevel ||
          student.gradeLevel ||
          ""
        ).toLowerCase();

        if (
          level.includes("standard") ||
          level.includes("primary") ||
          level.includes("darasa")
        ) {
          levels.primary++;
        } else if (
          level.includes("form") ||
          level.includes("secondary") ||
          level.includes("kidato")
        ) {
          levels.secondary++;
        } else if (level.includes("college")) {
          levels.college++;
        } else if (level.includes("university") || level.includes("chuo")) {
          levels.university++;
        } else if (level) {
          levels.other++;
        }
      });

      console.log("✅ Education level breakdown:", levels);

      res.json({
        success: true,
        data: levels,
        meta: {
          total: students.length,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching education levels:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch education level statistics",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE /api/superadmin/schools/:schoolId - Delete School
app.delete(
  "/api/superadmin/schools/:schoolId",
  authenticateSuperAdmin,
  async (req, res) => {
    try {
      const { schoolId } = req.params;

      // 1️⃣ Find the school
      const school = await School.findById(schoolId);
      if (!school) {
        return res.status(404).json({
          success: false,
          error: "School not found",
        });
      }

      // 2️⃣ Check if school has students or teachers (optional safety check)
      const hasStudents = await User.exists({
        schoolId: schoolId,
        role: "student",
      });
      const hasTeachers = await User.exists({
        schoolId: schoolId,
        role: "teacher",
      });

      if (hasStudents || hasTeachers) {
        // OPTION A: Prevent deletion if has users
        return res.status(400).json({
          success: false,
          error:
            "Cannot delete school with existing students or teachers. Please transfer them first.",
        });

        // OR OPTION B: Just soft delete
        // school.isActive = false;
        // school.deletedAt = new Date();
        // await school.save();
        // return res.json({ success: true, message: 'School deactivated successfully' });
      }

      // 3️⃣ Permanently delete the school
      await School.findByIdAndDelete(schoolId);

      // 4️⃣ Log the deletion (if you have audit logs)
      if (AuditLog) {
        await AuditLog.create({
          action: "SCHOOL_DELETED",
          userId: req.user._id,
          targetId: schoolId,
          targetType: "School",
          details: { schoolName: school.name },
        });
      }

      console.log(`✅ School deleted: ${school.name} by ${req.user.name}`);

      res.json({
        success: true,
        message: `${school.name} deleted successfully`,
      });
    } catch (error) {
      console.error("❌ Error deleting school:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete school. Please try again.",
      });
    }
  },
);

// ============================================
// COLLEGES & UNIVERSITIES ENDPOINTS
// ============================================

// GET All Colleges (SuperAdmin)
app.get(
  "/api/superadmin/colleges",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status } = req.query;

      const query = {
        type: { $in: ["vocational", "technical", "college"] }, // College types
      };

      if (status === "active") {
        query.isActive = true;
      } else if (status === "inactive") {
        query.isActive = false;
      }

      const colleges = await School.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code");

      const total = await School.countDocuments(query);

      console.log(`✅ Fetched ${colleges.length} colleges (total: ${total})`);

      res.json({
        success: true,
        data: colleges,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching colleges:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch colleges",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET All Universities (SuperAdmin)
app.get(
  "/api/superadmin/universities",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status } = req.query;

      const query = {
        type: { $in: ["university", "tertiary"] }, // University types
      };

      if (status === "active") {
        query.isActive = true;
      } else if (status === "inactive") {
        query.isActive = false;
      }

      const universities = await School.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code");

      const total = await School.countDocuments(query);

      console.log(
        `✅ Fetched ${universities.length} universities (total: ${total})`,
      );

      res.json({
        success: true,
        data: universities,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching universities:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch universities",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// REGISTER User (SuperAdmin can register any role)
app.post(
  "/api/superadmin/users/register",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { role, name, phone, email, schoolId, level, locationId } =
        req.body;

      if (!role || !name || !phone) {
        return res.status(400).json({
          success: false,
          error: "Role, name, and phone are required",
        });
      }

      // Generate temporary password
      const tempPassword = Math.random().toString(36).substring(2, 10);
      const hashedPassword = await hashPassword(tempPassword);

      const nameParts = name.split(" ");
      const userData = {
        username: phone,
        email: email || `${phone}@econnect.temp`,
        password: hashedPassword,
        role,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" "),
        phoneNumber: phone,
        schoolId,
        isActive: true,
      };

      // ✅ ADD THIS
      if (role === "student") {
        userData.classLevel = req.body.classLevel || req.body.gradeLevel || "";
        userData.gradeLevel = userData.classLevel; // Backward compatibility
        userData.course = req.body.course || "";
        userData.institutionType = req.body.institutionType || "government";
      }

      if (level && locationId) {
        if (level === "district") userData.districtId = locationId;
        if (level === "regional") userData.regionId = locationId;
      }
      const user = await User.create(userData);

      // Send credentials via SMS (optional)
      if (smsQueue) {
        await sendSMS(
          phone,
          `Welcome to ECONNECT! Your temporary password is: ${tempPassword}. Please change it after first login.`,
        );
      }

      await logActivity(
        req.user.id,
        "USER_REGISTERED",
        `Registered ${role}: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: { ...user.toObject(), password: undefined },
          temporaryPassword: tempPassword,
        },
      });
    } catch (error) {
      console.error("❌ Error registering user:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to register user" });
    }
  },
);

// GET All Users (SuperAdmin) - ENHANCED WITH FULL POPULATION
app.get(
  "/api/superadmin/users",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { role, status, page = 1, limit = 50 } = req.query;

      const query = {};
      if (role) query.role = role;
      if (status === "active") query.isActive = true;
      if (status === "inactive") query.isActive = false;

      console.log(`📊 Fetching users with role: ${role || "all"}`);

      const users = await User.find(query)
        // ✅ DON'T use .select() - get all fields except password
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate({
          path: "schoolId",
          select:
            "name schoolCode type ownership isActive regionId districtId wardId",
          populate: [
            { path: "regionId", select: "name code" },
            { path: "districtId", select: "name code" },
            { path: "wardId", select: "name code" },
          ],
        })
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code")
        .lean();

      const total = await User.countDocuments(query);

      const sanitizedUsers = users.map(({ password, ...user }) => user);

      // ============================================
      // ✅ OPTIMIZED: CALCULATE registration_fee_paid FOR ALL USERS (1 QUERY)
      // ============================================
      console.log(
        `💰 Calculating registration_fee_paid for ${sanitizedUsers.length} users...`,
      );

      // ✅ Fetch all payment totals in ONE aggregation query
      const userIds = sanitizedUsers.map((u) => u._id);

      const paymentTotals = await PaymentHistory.aggregate([
        {
          $match: {
            userId: { $in: userIds },
            status: { $in: ["verified", "approved", "completed"] },
            transactionType: "registration_fee",
          },
        },
        {
          $group: {
            _id: "$userId",
            totalPaid: { $sum: "$amount" },
          },
        },
      ]);

      // ✅ Create lookup map (O(n) time)
      const paymentMap = {};
      paymentTotals.forEach((p) => {
        paymentMap[p._id.toString()] = p.totalPaid;
      });

      // ✅ Enrich users with payment data (no async, super fast)
      const enrichedUsers = sanitizedUsers.map((user) => ({
        ...user,
        registration_fee_paid: paymentMap[user._id.toString()] || 0,
      }));

      console.log(
        `✅ Enriched ${enrichedUsers.length} users with payment data (1 query instead of ${sanitizedUsers.length})`,
      );

      // ✅ FETCH TALENTS FOR STUDENTS (FIXED TO SEND STRINGS)
      if (role === "student") {
        const userIds = enrichedUsers.map((u) => u._id);

        const studentTalents = await StudentTalent.find({
          studentId: { $in: userIds },
          status: "active",
        })
          .populate("talentId", "name category icon")
          .lean();

        const talentMap = {};
        studentTalents.forEach((st) => {
          const studentId = st.studentId.toString();
          if (!talentMap[studentId]) talentMap[studentId] = [];

          // ✅ FIX: Push just the NAME (string) instead of the whole object
          if (st.talentId && st.talentId.name) {
            talentMap[studentId].push(st.talentId.name); // ✅ String format
          }
        });

        enrichedUsers.forEach((user) => {
          user.talents = talentMap[user._id.toString()] || [];
        });
      }

      // ✅ FORMAT ENTREPRENEUR BUSINESS DATA
      if (role === "entrepreneur") {
        console.log(`📊 Processing ${sanitizedUsers.length} entrepreneurs...`);

        sanitizedUsers.forEach((user) => {
          user.businessInfo = {
            name: user.businessName || null,
            type: user.businessType || null,
            status: user.businessStatus || null,
            website: user.businessWebsite || null,
            categories: user.businessCategories || [],
            registrationNumber: user.businessRegistrationNumber || null,
            tinNumber: user.tinNumber || null,
          };
        });
      }

      console.log(`✅ Fetched ${enrichedUsers.length} users (total: ${total})`);

      // ✅ LOG CLASSLEVEL VERIFICATION FOR STUDENTS
      if (role === "student" && enrichedUsers.length > 0) {
        const sample = enrichedUsers[0];
        console.log("🔍 ClassLevel Check:", {
          classLevel: sample.classLevel,
          gradeLevel: sample.gradeLevel,
          hasClassLevel: !!sample.classLevel,
          sampleName: `${sample.firstName} ${sample.lastName}`,
        });
      }

      res.json({
        success: true,
        data: enrichedUsers,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching users:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users",
        ...(process.env.NODE_ENV === "development" && { debug: error.message }),
      });
    }
  },
);

// ============================================
// GET USERS WITH PAYMENT INFORMATION
// ============================================

// GET /api/superadmin/users/with-payments - Get all users with their latest payment information
app.get(
  "/api/superadmin/users/with-payments",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { role, status, page = 1, limit = 1000 } = req.query;

      console.log("📊 Fetching users with payment information...");

      // Build query for users
      const userQuery = {};

      if (role) {
        userQuery.role = role;
      }

      if (status === "inactive") {
        userQuery.isActive = false;
      } else if (status === "active") {
        userQuery.isActive = true;
      }

      // Fetch users
      const users = await User.find(userQuery)
        .populate("schoolId", "name schoolCode logo")
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code")
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(); // Use lean() for better performance

      if (users.length === 0) {
        return res.json({
          success: true,
          data: [],
          meta: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0,
          },
        });
      }

      // Get all user IDs
      const userIds = users.map((u) => u._id);

      console.log(`📊 Fetching payment info for ${userIds.length} users...`);

      // ============================================
      // 🆕 FETCH LATEST PAYMENT + TOTAL PAID FOR EACH USER
      // ============================================
      const [latestPayments, totalPaidByUser] = await Promise.all([
        // Latest payment
        PaymentHistory.aggregate([
          {
            $match: {
              userId: { $in: userIds },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $group: {
              _id: "$userId",
              latestPayment: { $first: "$$ROOT" },
            },
          },
        ]),

        // Total paid (verified registration fees)
        PaymentHistory.aggregate([
          {
            $match: {
              userId: { $in: userIds },
              status: "verified",
              transactionType: "registration_fee",
            },
          },
          {
            $group: {
              _id: "$userId",
              totalPaid: { $sum: "$amount" },
              paymentCount: { $sum: 1 },
            },
          },
        ]),
      ]);
      // ============================================
      // 🆕 CREATE PAYMENT MAP WITH TOTAL PAID
      // ============================================
      const paymentMap = {};

      // Add latest payment info
      latestPayments.forEach((p) => {
        const userId = p._id.toString();
        const payment = p.latestPayment;

        paymentMap[userId] = {
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency || "TZS",
          paymentMethod: payment.paymentMethod,
          paymentReference: payment.paymentReference,
          paymentDate: payment.paymentDate,
          transactionType: payment.transactionType,
          verifiedBy: payment.verifiedBy,
          verifiedAt: payment.verifiedAt,
          createdAt: payment.createdAt,
          // ✅ Initialize with 0, will be updated below
          registration_fee_paid: 0,
          paymentCount: 0,
        };
      });

      // ✅ Add total paid calculations
      totalPaidByUser.forEach((p) => {
        const userId = p._id.toString();
        if (paymentMap[userId]) {
          paymentMap[userId].registration_fee_paid = p.totalPaid;
          paymentMap[userId].paymentCount = p.paymentCount;
        } else {
          // User has payments but no latest payment entry (edge case)
          paymentMap[userId] = {
            status: "unknown",
            amount: 0,
            currency: "TZS",
            registration_fee_paid: p.totalPaid,
            paymentCount: p.paymentCount,
          };
        }
      });

      console.log(
        `✅ Found payment info for ${Object.keys(paymentMap).length} users`,
      );
      console.log(
        `💰 Calculated registration_fee_paid for ${totalPaidByUser.length} users`,
      );

      // Attach payment info to users
      const usersWithPayments = users.map((user) => {
        const paymentData = paymentMap[user._id.toString()];

        return {
          ...user,

          // ✅ FIXED: Flatten registration_fee_paid to top level for PaymentModal
          registration_fee_paid: paymentData?.registration_fee_paid || 0,

          // Attach payment info from PaymentHistory
          paymentInfo: paymentData || null,

          // Include region/district/ward names if populated
          regionName: user.regionId?.name || user.region,
          districtName: user.districtId?.name || user.district,
          wardName: user.wardId?.name || user.ward,
        };
      });
      // Get total count
      const total = await User.countDocuments(userQuery);

      console.log(
        `✅ Returning ${usersWithPayments.length} users with payment data`,
      );

      res.json({
        success: true,
        data: usersWithPayments,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          withPaymentInfo: Object.keys(paymentMap).length,
          withoutPaymentInfo:
            usersWithPayments.length - Object.keys(paymentMap).length,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching users with payments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users with payment information",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// MODERATE User
app.post(
  "/api/superadmin/users/:userId/moderate",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { action } = req.body;

      if (!["block", "suspend", "mute", "delete", "restore"].includes(action)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid action" });
      }

      const user = await User.findById(req.params.userId);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      if (action === "delete") {
        await user.deleteOne();
      } else if (
        action === "block" ||
        action === "suspend" ||
        action === "mute"
      ) {
        user.isActive = false;
        await user.save();
      } else if (action === "restore") {
        user.isActive = true;
        await user.save();
      }

      await logActivity(
        req.user.id,
        "USER_MODERATED",
        `${action} user: ${user.username}`,
        req,
      );

      res.json({
        success: true,
        message: `User ${action}ed successfully`,
        data: action === "delete" ? null : user,
      });
    } catch (error) {
      console.error("❌ Error moderating user:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to moderate user" });
    }
  },
);

// GET Moderated Users
app.get(
  "/api/superadmin/users/moderated",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const moderatedUsers = await User.find({ isActive: false })
        .select("-password")
        .sort({ updatedAt: -1 })
        .limit(100);

      res.json({ success: true, data: moderatedUsers });
    } catch (error) {
      console.error("❌ Error fetching moderated users:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch moderated users" });
    }
  },
);

// GET Location Statistics
app.get(
  "/api/superadmin/locations/stats",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const [regionStats, districtStats, schoolsByRegion] = await Promise.all([
        Region.aggregate([
          {
            $lookup: {
              from: "schools",
              localField: "_id",
              foreignField: "regionId",
              as: "schools",
            },
          },
          {
            $project: {
              name: 1,
              code: 1,
              schoolCount: { $size: "$schools" },
            },
          },
          { $sort: { schoolCount: -1 } },
        ]),
        District.aggregate([
          {
            $lookup: {
              from: "schools",
              localField: "_id",
              foreignField: "districtId",
              as: "schools",
            },
          },
          {
            $project: {
              name: 1,
              code: 1,
              schoolCount: { $size: "$schools" },
            },
          },
          { $sort: { schoolCount: -1 } },
        ]),
        School.aggregate([
          {
            $group: {
              _id: "$regionId",
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "regions",
              localField: "_id",
              foreignField: "_id",
              as: "region",
            },
          },
          { $unwind: "$region" },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          regionStats,
          districtStats,
          schoolsByRegion,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching location stats:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch location stats" });
    }
  },
);

// GET Staff Performance
app.get(
  "/api/superadmin/staff/performance",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const staffPerformance = await WorkReport.aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: "$userId",
            reportCount: { $sum: 1 },
            lastReport: { $max: "$submittedAt" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $match: {
            "user.role": {
              $in: ["staff", "district_official", "regional_official"],
            },
          },
        },
        { $sort: { reportCount: -1 } },
      ]);

      res.json({ success: true, data: staffPerformance });
    } catch (error) {
      console.error("❌ Error fetching staff performance:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch staff performance" });
    }
  },
);

// GET Staff Reports
app.get(
  "/api/superadmin/staff/reports",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { status } = req.query;

      const query = {};
      if (status) query.status = status;

      const reports = await WorkReport.find(query)
        .sort({ submittedAt: -1 })
        .populate("userId", "firstName lastName role")
        .populate("reviewedBy", "firstName lastName")
        .limit(100);

      res.json({ success: true, data: reports });
    } catch (error) {
      console.error("❌ Error fetching staff reports:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch staff reports" });
    }
  },
);

// APPROVE Staff Report
app.post(
  "/api/superadmin/staff/reports/:reportId/approve",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { comments } = req.body;

      const report = await WorkReport.findByIdAndUpdate(
        req.params.reportId,
        {
          status: "approved",
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          reviewComments: comments,
        },
        { new: true },
      );

      if (!report) {
        return res
          .status(404)
          .json({ success: false, error: "Report not found" });
      }

      await createNotification(
        report.userId,
        "Report Approved",
        "Your work report has been approved",
        "success",
      );

      await logActivity(
        req.user.id,
        "REPORT_APPROVED",
        "Approved work report",
        req,
      );

      res.json({
        success: true,
        message: "Report approved successfully",
        data: report,
      });
    } catch (error) {
      console.error("❌ Error approving report:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to approve report" });
    }
  },
);

// REJECT Staff Report
app.post(
  "/api/superadmin/staff/reports/:reportId/reject",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { comments } = req.body;

      if (!comments) {
        return res.status(400).json({
          success: false,
          error: "Comments are required for rejection",
        });
      }

      const report = await WorkReport.findByIdAndUpdate(
        req.params.reportId,
        {
          status: "rejected",
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          reviewComments: comments,
        },
        { new: true },
      );

      if (!report) {
        return res
          .status(404)
          .json({ success: false, error: "Report not found" });
      }

      await createNotification(
        report.userId,
        "Report Rejected",
        `Your work report was rejected: ${comments}`,
        "warning",
      );

      await logActivity(
        req.user.id,
        "REPORT_REJECTED",
        "Rejected work report",
        req,
      );

      res.json({
        success: true,
        message: "Report rejected successfully",
        data: report,
      });
    } catch (error) {
      console.error("❌ Error rejecting report:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to reject report" });
    }
  },
);

// GET Permission Requests (SuperAdmin)
app.get(
  "/api/superadmin/permission-requests",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { status, type } = req.query;

      const query = {};
      if (status) query.status = status;
      if (type) query.type = type;

      const requests = await PermissionRequest.find(query)
        .sort({ submittedAt: -1 })
        .populate("userId", "firstName lastName role")
        .populate("reviewedBy", "firstName lastName")
        .limit(100);

      res.json({ success: true, data: requests });
    } catch (error) {
      console.error("❌ Error fetching permission requests:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch permission requests" });
    }
  },
);

// APPROVE Permission Request
app.post(
  "/api/superadmin/permission-requests/:requestId/approve",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { comments } = req.body;

      const request = await PermissionRequest.findByIdAndUpdate(
        req.params.requestId,
        {
          status: "approved",
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          reviewComments: comments,
        },
        { new: true },
      );

      if (!request) {
        return res
          .status(404)
          .json({ success: false, error: "Request not found" });
      }

      await createNotification(
        request.userId,
        "Permission Approved",
        `Your ${request.type} request has been approved`,
        "success",
      );

      await logActivity(
        req.user.id,
        "PERMISSION_APPROVED",
        `Approved ${request.type} request`,
        req,
      );

      res.json({
        success: true,
        message: "Permission request approved successfully",
        data: request,
      });
    } catch (error) {
      console.error("❌ Error approving request:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to approve request" });
    }
  },
);

// REJECT Permission Request
app.post(
  "/api/superadmin/permission-requests/:requestId/reject",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { comments } = req.body;

      if (!comments) {
        return res.status(400).json({
          success: false,
          error: "Comments are required for rejection",
        });
      }

      const request = await PermissionRequest.findByIdAndUpdate(
        req.params.requestId,
        {
          status: "rejected",
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          reviewComments: comments,
        },
        { new: true },
      );

      if (!request) {
        return res
          .status(404)
          .json({ success: false, error: "Request not found" });
      }

      await createNotification(
        request.userId,
        "Permission Rejected",
        `Your ${request.type} request was rejected: ${comments}`,
        "warning",
      );

      await logActivity(
        req.user.id,
        "PERMISSION_REJECTED",
        `Rejected ${request.type} request`,
        req,
      );

      res.json({
        success: true,
        message: "Permission request rejected successfully",
        data: request,
      });
    } catch (error) {
      console.error("❌ Error rejecting request:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to reject request" });
    }
  },
);

// GET Pending Students (SuperAdmin)
app.get(
  "/api/superadmin/pending/students",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const pendingStudents = await User.find({
        role: "student",
        isActive: false,
      })
        .select("-password")
        .populate("schoolId", "name schoolCode")
        .sort({ createdAt: -1 })
        .limit(100);

      // ✅ Enrich with registration_fee_paid
      const enrichedStudents = await Promise.all(
        pendingStudents.map(async (student) => {
          const studentObj = student.toObject();
          studentObj.registration_fee_paid = await calculateRegistrationFeePaid(
            student._id,
          );
          return studentObj;
        }),
      );

      res.json({ success: true, data: enrichedStudents });
    } catch (error) {
      console.error("❌ Error fetching pending students:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending students" });
    }
  },
);

// GET Pending Teachers (SuperAdmin)
app.get(
  "/api/superadmin/pending/teachers",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const pendingTeachers = await User.find({
        role: "teacher",
        isActive: false,
      })
        .select("-password")
        .populate("schoolId", "name schoolCode")
        .sort({ createdAt: -1 })
        .limit(100);

      res.json({ success: true, data: pendingTeachers });
    } catch (error) {
      console.error("❌ Error fetching pending teachers:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending teachers" });
    }
  },
);

// GET All Pending Tasks (across all staff)
app.get(
  "/api/superadmin/tasks/pending",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const pendingTasks = await Todo.find({ completed: false })
        .populate("userId", "firstName lastName role")
        .sort({ dueDate: 1, priority: -1 })
        .limit(200);

      res.json({ success: true, data: pendingTasks });
    } catch (error) {
      console.error("❌ Error fetching pending tasks:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending tasks" });
    }
  },
);

// ASSIGN Task
app.post(
  "/api/superadmin/tasks/assign",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { taskId, assigneeId, dueDate, priority } = req.body;

      if (!taskId || !assigneeId) {
        return res.status(400).json({
          success: false,
          error: "Task ID and assignee ID are required",
        });
      }

      const task = await Todo.findByIdAndUpdate(
        taskId,
        {
          userId: assigneeId,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          priority: priority || "medium",
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!task) {
        return res
          .status(404)
          .json({ success: false, error: "Task not found" });
      }

      await createNotification(
        assigneeId,
        "New Task Assigned",
        `You have been assigned a new task: ${task.title}`,
        "info",
      );

      await logActivity(
        req.user.id,
        "TASK_ASSIGNED",
        `Assigned task to user ${assigneeId}`,
        req,
      );

      res.json({
        success: true,
        message: "Task assigned successfully",
        data: task,
      });
    } catch (error) {
      console.error("❌ Error assigning task:", error);
      res.status(500).json({ success: false, error: "Failed to assign task" });
    }
  },
);

// COMMENT on Task
app.post(
  "/api/superadmin/tasks/:taskId/comment",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { comment } = req.body;

      if (!comment) {
        return res
          .status(400)
          .json({ success: false, error: "Comment is required" });
      }

      const task = await Todo.findById(req.params.taskId);

      if (!task) {
        return res
          .status(404)
          .json({ success: false, error: "Task not found" });
      }

      // Store comment in description or metadata
      task.description = `${
        task.description || ""
      }\n\n[Comment by SuperAdmin]: ${comment}`;
      task.updatedAt = new Date();
      await task.save();

      await createNotification(
        task.userId,
        "Task Comment",
        `SuperAdmin commented on your task: ${comment}`,
        "info",
      );

      await logActivity(
        req.user.id,
        "TASK_COMMENTED",
        "Commented on task",
        req,
      );

      res.json({
        success: true,
        message: "Comment added successfully",
        data: task,
      });
    } catch (error) {
      console.error("❌ Error commenting on task:", error);
      res.status(500).json({ success: false, error: "Failed to add comment" });
    }
  },
);

// GET Revenue Analytics (SuperAdmin)
app.get(
  "/api/superadmin/revenue/analytics",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const [total, byType, byMonth, topBusinesses] = await Promise.all([
        Revenue.aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              totalCommission: { $sum: "$commission" },
              totalNet: { $sum: "$netAmount" },
            },
          },
        ]),
        Revenue.aggregate([
          {
            $group: {
              _id: "$revenueType",
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ]),
        Revenue.aggregate([
          {
            $group: {
              _id: { year: "$year", month: "$month" },
              total: { $sum: "$amount" },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]),
        Revenue.aggregate([
          { $match: { businessId: { $exists: true } } },
          {
            $group: {
              _id: "$businessId",
              total: { $sum: "$amount" },
            },
          },
          { $sort: { total: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "businesses",
              localField: "_id",
              foreignField: "_id",
              as: "business",
            },
          },
          { $unwind: "$business" },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          total: total[0] || {
            totalRevenue: 0,
            totalCommission: 0,
            totalNet: 0,
          },
          byType,
          byMonth,
          topBusinesses,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching revenue analytics:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch revenue analytics" });
    }
  },
);

// GET Revenue Summary
app.get(
  "/api/superadmin/revenue/summary",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      const [yearly, monthly, daily] = await Promise.all([
        Revenue.aggregate([
          { $match: { year: currentYear } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Revenue.aggregate([
          { $match: { year: currentYear, month: currentMonth } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Revenue.aggregate([
          {
            $match: {
              revenueDate: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          yearly: yearly[0]?.total || 0,
          monthly: monthly[0]?.total || 0,
          daily: daily[0]?.total || 0,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching revenue summary:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch revenue summary" });
    }
  },
);

// GET System Usage
app.get(
  "/api/superadmin/system/usage",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const [activeUsers, todayLogins, systemLoad] = await Promise.all([
        User.countDocuments({
          lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
        ActivityLog.countDocuments({
          action: "USER_LOGIN",
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
        ActivityLog.aggregate([
          {
            $match: {
              createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
            },
          },
          {
            $group: {
              _id: { $minute: "$createdAt" },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          activeUsers,
          todayLogins,
          requestsPerMinute: systemLoad,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching system usage:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch system usage" });
    }
  },
);

// GET System Reports
app.get(
  "/api/superadmin/system/reports",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const reports = await ActivityLog.aggregate([
        {
          $match: {
            action: { $in: ["ERROR", "WARNING", "CRITICAL"] },
          },
        },
        {
          $group: {
            _id: "$action",
            count: { $sum: 1 },
            latest: { $max: "$createdAt" },
          },
        },
      ]);

      res.json({ success: true, data: reports });
    } catch (error) {
      console.error("❌ Error fetching system reports:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch system reports" });
    }
  },
);

// GET SuperAdmin Profile
app.get(
  "/api/superadmin/profile",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const profile = await User.findById(req.user.id).select("-password");

      res.json({ success: true, data: profile });
    } catch (error) {
      console.error("❌ Error fetching profile:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch profile" });
    }
  },
);

// ============================================
// ADMIN ENDPOINTS (7 ENDPOINTS) - FINAL PHASE
// ============================================

// GET Admin Dashboard
app.get(
  "/api/admin/dashboard",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const admin = await User.findById(req.user.id);

      // Build query based on admin level
      let schoolQuery = {};
      if (admin.districtId) {
        schoolQuery.districtId = admin.districtId;
      } else if (admin.regionId) {
        schoolQuery.regionId = admin.regionId;
      }

      const [
        totalSchools,
        totalStudents,
        totalTeachers,
        totalStaff,
        activeEvents,
        recentActivity,
        pendingApprovals,
      ] = await Promise.all([
        School.countDocuments({ ...schoolQuery, isActive: true }),
        User.countDocuments({
          role: "student",
          accountStatus: "active", // 🆕 PHASE 2
          ...(admin.districtId && { districtId: admin.districtId }),
          ...(admin.regionId && { regionId: admin.regionId }),
        }),
        User.countDocuments({
          role: "teacher",
          accountStatus: "active", // 🆕 PHASE 2
          ...(admin.districtId && { districtId: admin.districtId }),
          ...(admin.regionId && { regionId: admin.regionId }),
        }),
        User.countDocuments({
          role: "staff",
          accountStatus: "active", // 🆕 PHASE 2
          ...(admin.districtId && { districtId: admin.districtId }),
          ...(admin.regionId && { regionId: admin.regionId }),
        }),
        Event.countDocuments({
          status: "published",
          startDate: { $gte: new Date() },
          ...(admin.regionId && { regionId: admin.regionId }),
          ...(admin.districtId && { districtId: admin.districtId }),
        }),
        ActivityLog.find({
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("userId", "firstName lastName role"),
        User.countDocuments({
          accountStatus: "inactive", // 🆕 PHASE 2: Only inactive (not suspended)
          role: { $in: ["student", "teacher"] },
          ...(admin.districtId && { districtId: admin.districtId }),
          ...(admin.regionId && { regionId: admin.regionId }),
        }),
      ]);

      res.json({
        success: true,
        data: {
          stats: {
            totalSchools,
            totalStudents,
            totalTeachers,
            totalStaff,
            activeEvents,
            pendingApprovals,
          },
          recentActivity,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching admin dashboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Admin Analytics - COMPLETE IMPLEMENTATION
app.get(
  "/api/admin/analytics",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      console.log("📊 Analytics: Starting comprehensive data fetch...");

      const admin = await User.findById(req.user.id);
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
      const endOfMonth = new Date(
        currentYear,
        currentMonth,
        0,
        23,
        59,
        59,
        999,
      );

      // Build query based on admin level
      let schoolQuery = {};
      let userQuery = {};

      if (admin.districtId) {
        schoolQuery.districtId = admin.districtId;
        userQuery.districtId = admin.districtId;
      } else if (admin.regionId) {
        schoolQuery.regionId = admin.regionId;
        userQuery.regionId = admin.regionId;
      }
      // Run all queries in parallel for performance
      const [
        // Basic counts
        totalSchools,
        governmentSchools,
        privateSchools,
        activeSchools,
        suspendedSchools,
        totalStudents,
        totalTeachers,
        totalHeadmasters,
        totalStaff,
        totalEntrepreneurs,

        // CTM and active users
        totalCTMMembers,
        activeUsers,

        // Regions covered
        regionsCovered,

        // Pending and moderated
        pendingIssues,
        moderatedUsers,

        // Active sessions
        activeSessions,

        // Monthly growth
        newSchoolsThisMonth,
        newStudentsThisMonth,
        newTeachersThisMonth,

        // Revenue data
        monthlyRevenueData,

        // Regional distribution
        regionalDistribution,

        // Recent activities
        recentActivities,
      ] = await Promise.all([
        // Basic counts
        School.countDocuments({ ...schoolQuery, isActive: true }),
        School.countDocuments({ ...schoolQuery, ownership: "government" }),
        School.countDocuments({ ...schoolQuery, ownership: "private" }),
        School.countDocuments({ ...schoolQuery, isActive: true }),
        School.countDocuments({ ...schoolQuery, isActive: false }),

        // 🆕 PHASE 2: Use accountStatus instead of isActive
        User.countDocuments({
          ...userQuery,
          role: "student",
          accountStatus: "active",
        }),
        User.countDocuments({
          ...userQuery,
          role: "teacher",
          accountStatus: "active",
        }),
        User.countDocuments({
          ...userQuery,
          role: "headmaster",
          accountStatus: "active",
        }),
        User.countDocuments({
          ...userQuery,
          role: "staff",
          accountStatus: "active",
        }),
        User.countDocuments({
          ...userQuery,
          role: "entrepreneur",
          accountStatus: "active",
        }),

        // CTM Members (active only)
        User.countDocuments({
          ...userQuery,
          is_ctm_student: true,
          accountStatus: "active",
        }),

        // Active users (logged in within 30 days)
        User.countDocuments({
          ...userQuery,
          accountStatus: "active",
          lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }),

        // Regions covered
        admin.regionId
          ? 1
          : admin.districtId
            ? Region.countDocuments({
                _id: {
                  $in: await School.find(schoolQuery).distinct("regionId"),
                },
              })
            : Region.countDocuments({ isActive: true }),

        // Pending issues
        0,

        // 🆕 PHASE 2: Moderated users (inactive + suspended)
        User.countDocuments({
          ...userQuery,
          accountStatus: { $in: ["inactive", "suspended"] },
        }),

        // Active sessions (users active in last 24 hours)
        User.countDocuments({
          ...userQuery,
          accountStatus: "active",
          lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),

        // Monthly growth
        School.countDocuments({
          ...schoolQuery,
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        }),
        User.countDocuments({
          ...userQuery,
          role: "student",
          accountStatus: "active", // 🆕 Only count active
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        }),
        User.countDocuments({
          ...userQuery,
          role: "teacher",
          accountStatus: "active", // 🆕 Only count active
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        }),

        // Monthly revenue
        Revenue.aggregate([
          {
            $match: {
              year: currentYear,
              month: currentMonth,
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              commission: { $sum: "$commission" },
              net: { $sum: "$netAmount" },
            },
          },
        ]),

        // Regional distribution (top 10 regions)
        School.aggregate([
          { $match: { ...schoolQuery, isActive: true } },
          {
            $group: {
              _id: "$regionId",
              schoolCount: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "regions",
              localField: "_id",
              foreignField: "_id",
              as: "region",
            },
          },
          { $unwind: "$region" },
          {
            $lookup: {
              from: "users",
              let: { regionId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$regionId", "$$regionId"] },
                    role: "student",
                    accountStatus: "active", // 🆕 PHASE 2
                  },
                },
                { $count: "count" },
              ],
              as: "studentData",
            },
          },
          {
            $project: {
              _id: 0,
              name: "$region.name",
              schoolCount: 1,
              studentCount: {
                $ifNull: [{ $arrayElemAt: ["$studentData.count", 0] }, 0],
              },
            },
          },
          { $sort: { schoolCount: -1 } },
          { $limit: 10 },
        ]),

        // Recent activities
        ActivityLog.find()
          .sort({ createdAt: -1 })
          .limit(20)
          .populate("userId", "firstName lastName role")
          .select("action description createdAt metadata"),
      ]);

      // Calculate revenue values
      const monthlyRevenue = monthlyRevenueData[0]?.total || 0;
      const membershipRevenue = Math.round(monthlyRevenue * 0.6);
      const monthlyCharges = Math.round(monthlyRevenue * 0.3);
      const otherIncome = monthlyRevenue - membershipRevenue - monthlyCharges;

      // Calculate growth rate
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const lastMonthEnd = new Date(
        lastMonthYear,
        lastMonth,
        0,
        23,
        59,
        59,
        999,
      );

      const lastMonthStudents = await User.countDocuments({
        ...userQuery,
        role: "student",
        createdAt: { $lte: lastMonthEnd },
      });

      const growthRate =
        lastMonthStudents > 0
          ? Math.round((newStudentsThisMonth / lastMonthStudents) * 100)
          : 0;

      // Format response
      const analyticsData = {
        // Top Stats (6 cards)
        totalSchools,
        governmentSchools,
        privateSchools,
        activeSchools,
        suspendedSchools,
        totalStudents,
        totalTeachers,
        totalHeadmasters,
        totalStaff,
        totalEntrepreneurs,
        monthlyRevenue: Math.round(monthlyRevenue / 1000), // In thousands
        regionsCovered,
        pendingIssues,
        moderatedUsers,

        // Additional metrics
        totalCTMMembers,
        activeUsers,
        activeSessions,

        // Growth metrics
        newSchoolsThisMonth,
        newStudentsThisMonth,
        newTeachersThisMonth,
        growthRate,

        // Revenue breakdown
        membershipRevenue,
        monthlyCharges,
        otherIncome,
        totalRevenue: monthlyRevenue,

        // Distributions
        regionalDistribution: regionalDistribution.map((r) => ({
          name: r.name || "Unknown",
          schoolCount: r.schoolCount || 0,
          studentCount: r.studentCount || 0,
        })),

        // Recent activities
        recentActivities: recentActivities.map((activity) => ({
          description: activity.description || `${activity.action} performed`,
          timestamp: activity.createdAt,
          user: activity.userId
            ? {
                name: `${activity.userId.firstName || ""} ${
                  activity.userId.lastName || ""
                }`.trim(),
                role: activity.userId.role,
              }
            : null,
        })),
      };

      console.log("✅ Analytics: Data fetched successfully", {
        totalSchools,
        totalStudents,
        totalTeachers,
        monthlyRevenue: analyticsData.monthlyRevenue,
      });

      res.json({
        success: true,
        data: analyticsData,
        meta: {
          generatedAt: new Date().toISOString(),
          adminLevel: admin.role,
          scope: admin.districtId
            ? "district"
            : admin.regionId
              ? "region"
              : "national",
        },
      });
    } catch (error) {
      console.error("❌ Analytics Error:", error);

      // Return safe defaults instead of crashing
      res.json({
        success: true,
        data: {
          totalSchools: 0,
          totalStudents: 0,
          totalTeachers: 0,
          totalHeadmasters: 0,
          totalStaff: 0,
          totalEntrepreneurs: 0,
          monthlyRevenue: 0,
          regionsCovered: 0,
          pendingIssues: 0,
          moderatedUsers: 0,
          totalCTMMembers: 0,
          activeUsers: 0,
          activeSessions: 0,
          newSchoolsThisMonth: 0,
          newStudentsThisMonth: 0,
          newTeachersThisMonth: 0,
          growthRate: 0,
          membershipRevenue: 0,
          monthlyCharges: 0,
          otherIncome: 0,
          totalRevenue: 0,
          regionalDistribution: [],
          recentActivities: [],
        },
        meta: {
          error: error.message,
          fallback: true,
        },
      });
    }
  },
);

// ============================================
// 🧪 DEBUG: Test Ownership Analytics
// ============================================
app.get(
  "/api/debug/school-analytics",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      console.log("🧪 Testing school analytics...");

      // Get admin user
      const admin = await User.findById(req.user.id);

      // Build query based on admin level (same as your analytics endpoint)
      let schoolQuery = {};
      if (admin.districtId) {
        schoolQuery.districtId = admin.districtId;
      } else if (admin.regionId) {
        schoolQuery.regionId = admin.regionId;
      }

      console.log("📍 schoolQuery:", JSON.stringify(schoolQuery));

      // Test all queries
      const totalSchools = await School.countDocuments({
        ...schoolQuery,
        isActive: true,
      });
      const governmentSchools = await School.countDocuments({
        ...schoolQuery,
        ownership: "government",
      });
      const privateSchools = await School.countDocuments({
        ...schoolQuery,
        ownership: "private",
      });
      const activeSchools = await School.countDocuments({
        ...schoolQuery,
        isActive: true,
      });
      const suspendedSchools = await School.countDocuments({
        ...schoolQuery,
        isActive: false,
      });
      const noOwnership = await School.countDocuments({
        ...schoolQuery,
        ownership: { $exists: false },
      });
      const allSchools = await School.countDocuments(schoolQuery);

      // Get sample schools
      const samples = await School.find(schoolQuery)
        .limit(5)
        .select("name ownership isActive regionId districtId");

      // Get breakdown by ownership
      const ownershipBreakdown = await School.aggregate([
        { $match: schoolQuery },
        {
          $group: {
            _id: "$ownership",
            count: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        debug: {
          adminRole: admin.role,
          hasRegionId: !!admin.regionId,
          hasDistrictId: !!admin.districtId,
          schoolQuery,

          counts: {
            allSchools,
            totalSchools,
            governmentSchools,
            privateSchools,
            activeSchools,
            suspendedSchools,
            noOwnership,
          },

          ownershipBreakdown,
          sampleSchools: samples,

          analysis: {
            problem:
              noOwnership > 0
                ? `${noOwnership} schools missing ownership field!`
                : "All schools have ownership field ✅",
            governmentMatch:
              governmentSchools === 137
                ? "✅ Government count correct"
                : `❌ Expected 137, got ${governmentSchools}`,
          },
        },
      });
    } catch (error) {
      console.error("❌ Debug endpoint error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack,
      });
    }
  },
);

// GET All Users (Admin) - PHASE 2 UPDATED
app.get(
  "/api/admin/users",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        role,
        accountStatus, // 🆕 NEW: Account status filter
        paymentStatus, // 🆕 NEW: Payment status filter
        search, // 🆕 NEW: Search query
      } = req.query;

      const admin = await User.findById(req.user.id);

      // Build base query
      const query = {};

      // Role filter
      if (role) query.role = role;

      // 🆕 PHASE 2: Status filters
      if (accountStatus && isValidAccountStatus(accountStatus)) {
        query.accountStatus = accountStatus;
      }

      if (paymentStatus && isValidPaymentStatus(paymentStatus)) {
        query.paymentStatus = paymentStatus;
      }

      // 🆕 NEW: Search functionality
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }

      // Apply role-based filtering (regional/district scope)
      if (admin.districtId) {
        query.districtId = admin.districtId;
      } else if (admin.regionId) {
        query.regionId = admin.regionId;
      }

      console.log(`📊 Fetching users with query:`, JSON.stringify(query));

      // Fetch users
      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("schoolId", "name schoolCode")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      // ============================================
      // ✅ OPTIMIZED: Fetch all payment totals in ONE query
      // (Prevents 393 individual log lines)
      // ============================================
      console.log(
        `💰 Enriching ${users.length} users with payment data (optimized)...`,
      );

      const userIds = users.map((u) => u._id);

      const paymentTotals = await PaymentHistory.aggregate([
        {
          $match: {
            userId: { $in: userIds },
            status: { $in: ["verified", "approved", "completed"] },
            transactionType: "registration_fee",
          },
        },
        {
          $group: {
            _id: "$userId",
            totalPaid: { $sum: "$amount" },
          },
        },
      ]);

      // Create lookup map for O(1) access
      const paymentMap = {};
      paymentTotals.forEach((p) => {
        paymentMap[p._id.toString()] = p.totalPaid;
      });

      // Enrich users with payment data (no async, super fast)
      const enrichedUsers = users.map((user) => {
        const userObj = user.toObject();
        userObj.registration_fee_paid = paymentMap[user._id.toString()] || 0;
        delete userObj.password; // Ensure password is removed
        return userObj;
      });

      console.log(
        `✅ Payment enrichment complete: ${enrichedUsers.length} users (1 query)`,
      );

      // Get total count
      const total = await User.countDocuments(query);

      // 🆕 PHASE 2: Get status breakdown
      const statusAggregation = await User.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              accountStatus: "$accountStatus",
              paymentStatus: "$paymentStatus",
            },
            count: { $sum: 1 },
          },
        },
      ]);

      const statusCounts = formatStatusCounts(statusAggregation);

      // 🆕 NEW: Get role breakdown
      const roleBreakdown = await User.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 },
          },
        },
      ]);

      const roleCountsMap = {};
      roleBreakdown.forEach((item) => {
        roleCountsMap[item._id] = item.count;
      });

      console.log(`✅ Fetched ${enrichedUsers.length} users (total: ${total})`);

      res.json({
        success: true,
        data: enrichedUsers,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),

          // 🆕 PHASE 2: Status breakdown
          statusCounts,

          // 🆕 NEW: Role breakdown
          roleCounts: roleCountsMap,

          // 🆕 NEW: Applied filters
          appliedFilters: {
            role: role || null,
            accountStatus: accountStatus || null,
            paymentStatus: paymentStatus || null,
            search: search || null,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching users:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch users",
        ...(process.env.NODE_ENV === "development" && { debug: error.message }),
      });
    }
  },
);

// ============================================
// GET SINGLE STUDENT (for PaymentModal and other admin functions)
// ============================================
app.get(
  "/api/students/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
    "teacher",
  ),
  async (req, res) => {
    try {
      const { id } = req.params;

      console.log(`📊 Fetching student data for ID: ${id}`);

      // Find the student
      const student = await User.findById(id)
        .select("-password") // Exclude password
        .populate("schoolId", "name schoolCode logo address")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      if (!student) {
        return res.status(404).json({
          success: false,
          error: "Student not found",
        });
      }

      // Verify it's actually a student role
      if (student.role !== "student") {
        return res.status(400).json({
          success: false,
          error: `User is not a student (role: ${student.role})`,
        });
      }

      // Check permissions - admins can view students in their scope
      const admin = await User.findById(req.user.id);

      let hasPermission = false;
      if (
        req.user.role === "super_admin" ||
        req.user.role === "national_official"
      ) {
        hasPermission = true; // Full access
      } else if (req.user.role === "regional_official" && admin.regionId) {
        hasPermission =
          student.regionId?.toString() === admin.regionId.toString();
      } else if (req.user.role === "district_official" && admin.districtId) {
        hasPermission =
          student.districtId?.toString() === admin.districtId.toString();
      } else if (
        (req.user.role === "headmaster" || req.user.role === "teacher") &&
        req.user.schoolId
      ) {
        hasPermission =
          student.schoolId?._id.toString() === req.user.schoolId.toString();
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to view this student",
        });
      }

      // ============================================
      // ✅ ENRICH WITH PAYMENT DATA (optimized - single query)
      // ============================================
      console.log(`💰 Fetching payment data for student: ${student.username}`);

      const registration_fee_paid = await calculateRegistrationFeePaid(
        student._id,
      );

      // Calculate total required based on student's package
      let totalRequired = 0;
      if (student.registration_type) {
        totalRequired = getStudentRegistrationFee(
          student.registration_type,
          student.institutionType,
        );
      }

      const remainingBalance = Math.max(
        0,
        totalRequired - registration_fee_paid,
      );

      // ============================================
      // ✅ GET PAYMENT HISTORY SUMMARY
      // ============================================
      const paymentCount = await PaymentHistory.countDocuments({
        userId: student._id,
      });

      const lastPayment = await PaymentHistory.findOne({
        userId: student._id,
      })
        .sort({ paymentDate: -1 })
        .select("amount paymentDate paymentMethod status");

      // ============================================
      // ✅ GET PENDING INVOICES
      // ============================================
      const pendingInvoices = await Invoice.find({
        user_id: student._id,
        status: { $in: ["pending", "partial_paid", "verification"] },
      }).select("invoiceNumber amount dueDate status");

      // ============================================
      // ✅ BUILD ENRICHED RESPONSE
      // ============================================
      const enrichedStudent = {
        ...student.toObject(),

        // Payment information
        registration_fee_paid,
        totalRequired,
        remainingBalance,

        // Payment status indicators
        isFullyPaid:
          registration_fee_paid >= totalRequired && totalRequired > 0,
        isPartiallyPaid:
          registration_fee_paid > 0 && registration_fee_paid < totalRequired,
        hasNeverPaid: registration_fee_paid === 0,

        // Payment summary
        paymentSummary: {
          totalPaid: registration_fee_paid,
          totalRequired,
          remainingBalance,
          paymentCount,
          lastPayment: lastPayment
            ? {
                amount: lastPayment.amount,
                date: lastPayment.paymentDate,
                method: lastPayment.paymentMethod,
                status: lastPayment.status,
              }
            : null,
          pendingInvoices: pendingInvoices.length,
        },
      };

      console.log(`✅ Student data retrieved: ${student.username}`);
      console.log(
        `   - Total Paid: TZS ${registration_fee_paid.toLocaleString()}`,
      );
      console.log(`   - Total Required: TZS ${totalRequired.toLocaleString()}`);
      console.log(`   - Remaining: TZS ${remainingBalance.toLocaleString()}`);
      console.log(`   - Account Status: ${student.accountStatus}`);
      console.log(`   - Payment Status: ${student.paymentStatus}`);

      res.json({
        success: true,
        data: enrichedStudent,
      });
    } catch (error) {
      console.error("❌ Error fetching student:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch student data",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE User (Admin)
app.post(
  "/api/admin/users",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
  ),
  async (req, res) => {
    try {
      const {
        username,
        email,
        password,
        role,
        firstName,
        lastName,
        phoneNumber,
        schoolId,
      } = req.body;

      if (!username || !email || !password || !role) {
        return res.status(400).json({
          success: false,
          error: "Username, email, password, and role are required",
        });
      }

      // Check existing user
      const existingUser = await User.findOne({
        $or: [{ username }, { email }, { phoneNumber }],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "Username, email, or phone number already exists",
        });
      }

      const hashedPassword = await hashPassword(password);

      // 🔹 Base user data
      const userData = {
        username,
        email,
        password: hashedPassword,
        role,
        firstName,
        lastName,
        phoneNumber,
        schoolId: schoolId || req.user.schoolId,
        regionId: req.user.regionId,
        districtId: req.user.districtId,

        // 🆕 PHASE 2: NEW STATUS SYSTEM
        accountStatus: "inactive", // All new users start inactive
        paymentStatus: "no_payment", // Default payment status
        isActive: false, // ✅ Kept for backward compatibility (synced via pre-save)
      };

      // 🔹 Role-based extensions
      if (role === "student") {
        userData.classLevel = req.body.classLevel || req.body.gradeLevel || "";
        userData.gradeLevel = userData.classLevel; // backward compatibility
        userData.course = req.body.course || "";
        userData.institutionType = req.body.institutionType || "government";
        userData.studentId = req.body.studentId || "";
      }

      if (role === "teacher") {
        userData.subjects = req.body.subjects || [];
        userData.otherSubjects =
          req.body.otherSubjects || req.body.other_subjects || "";
        userData.employeeId = req.body.employeeId || "";
      }

      if (role === "entrepreneur") {
        userData.businessName = req.body.businessName || "";
        userData.businessType = req.body.businessType || "";
        userData.businessCategories = req.body.businessCategories || [];
      }

      // 🔹 Create user ONCE
      const user = await User.create(userData);

      await logActivity(
        req.user.id,
        "USER_CREATED",
        `Created ${role} user: ${username}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
          ...user.toObject(),
          password: undefined,
        },
      });
    } catch (error) {
      console.error("❌ Error creating user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE User (Admin) - PHASE 2 UPDATED
app.patch(
  "/api/admin/users/:userId",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
  ),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      // Check permissions
      const admin = await User.findById(req.user.id);
      const canEdit =
        req.user.role === "super_admin" ||
        (req.user.role === "headmaster" &&
          user.schoolId?.toString() === req.user.schoolId?.toString()) ||
        (admin.districtId &&
          user.districtId?.toString() === admin.districtId.toString()) ||
        (admin.regionId &&
          user.regionId?.toString() === admin.regionId.toString());

      if (!canEdit) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to edit this user",
        });
      }

      // 🆕 PHASE 2: Extract and block direct status changes
      const {
        password,
        role,
        accountStatus, // 🆕 BLOCK direct changes
        paymentStatus, // 🆕 BLOCK direct changes
        isActive, // 🆕 BLOCK direct changes (deprecated)
        payment_verified_by, // 🆕 BLOCK direct changes
        payment_verified_at, // 🆕 BLOCK direct changes
        payment_date, // 🆕 BLOCK direct changes
        ...updates
      } = req.body;

      // 🆕 PHASE 2: Reject attempts to change status fields directly
      if (
        accountStatus !== undefined ||
        paymentStatus !== undefined ||
        isActive !== undefined
      ) {
        return res.status(400).json({
          success: false,
          error: "Account status and payment status cannot be changed directly",
          message:
            "Use the appropriate endpoints: /approve for activation, /payment/record for payment updates, /suspend for suspension",
          blockedFields: {
            accountStatus: accountStatus !== undefined,
            paymentStatus: paymentStatus !== undefined,
            isActive: isActive !== undefined,
          },
        });
      }

      // 🆕 PHASE 2: Block payment verification field changes
      if (
        payment_verified_by !== undefined ||
        payment_verified_at !== undefined ||
        payment_date !== undefined
      ) {
        return res.status(400).json({
          success: false,
          error: "Payment verification fields are read-only",
          message:
            "These fields are automatically managed by the payment system",
        });
      }

      // 🆕 PHASE 2: Block role changes (security)
      if (role !== undefined && role !== user.role) {
        return res.status(400).json({
          success: false,
          error: "User role cannot be changed after creation",
          message: "Create a new account if a different role is needed",
        });
      }

      // ✅ Sync classLevel with gradeLevel (backward compatibility)
      if (updates.classLevel) {
        updates.gradeLevel = updates.classLevel;
      }

      // If they somehow update gradeLevel instead, copy to classLevel
      if (updates.gradeLevel && !updates.classLevel) {
        updates.classLevel = updates.gradeLevel;
      }

      // ✅ Apply allowed updates
      Object.assign(user, updates);
      user.updatedAt = new Date();
      await user.save();

      console.log(`✅ Updated user: ${user.username} (${req.params.userId})`);

      await logActivity(
        req.user.id,
        "USER_UPDATED",
        `Updated user: ${user.username}`,
        req,
        {
          userId: user._id,
          updatedFields: Object.keys(updates),
        },
      );

      res.json({
        success: true,
        message: "User updated successfully",
        data: {
          ...user.toObject(),
          password: undefined,
        },
      });
    } catch (error) {
      console.error("❌ Error updating user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE User (Admin)
app.delete(
  "/api/admin/users/:userId",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster",
  ),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      // Check permissions
      const admin = await User.findById(req.user.id);
      const canDelete =
        req.user.role === "super_admin" ||
        (req.user.role === "headmaster" &&
          user.schoolId?.toString() === req.user.schoolId?.toString()) ||
        (admin.districtId &&
          user.districtId?.toString() === admin.districtId.toString()) ||
        (admin.regionId &&
          user.regionId?.toString() === admin.regionId.toString());

      if (!canDelete) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to delete this user",
        });
      }

      // 🆕 PHASE 2: Soft delete - suspend instead of removing
      user.accountStatus = "suspended"; // New: Use accountStatus
      user.isActive = false; // Kept for backward compatibility
      user.updatedAt = new Date();
      await user.save();

      await logActivity(
        req.user.id,
        "USER_DELETED",
        `Suspended user: ${user.username}`,
        req,
      );

      res.json({
        success: true,
        message: "User suspended successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// DELETE User (SuperAdmin - Hard Delete)
// ============================================
app.delete(
  "/api/superadmin/users/:userId",
  authenticateToken,
  authorizeRoles("super_admin"),
  validateObjectId("userId"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      console.log(`🗑️ Delete request for user: ${userId}`);

      // Find user
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Store user info for logging
      const userName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username;
      const userRole = user.role;
      const userEmail = user.email;

      // ✅ HARD DELETE (permanent removal)
      await User.findByIdAndDelete(userId);

      // ✅ Clean up related data
      await Promise.all([
        // Delete student talents
        StudentTalent.deleteMany({ studentId: userId }),

        // Delete grades
        Grade.deleteMany({ studentId: userId }),

        // Delete attendance records
        AttendanceRecord.deleteMany({ studentId: userId }),

        // Delete assignment submissions
        AssignmentSubmission.deleteMany({ studentId: userId }),

        // Delete performance records
        PerformanceRecord.deleteMany({ studentId: userId }),

        // Delete certificates
        Certificate.deleteMany({ studentId: userId }),

        // Delete CTM membership
        CTMMembership.deleteOne({ studentId: userId }),

        // Delete messages (sent and received)
        Message.deleteMany({
          $or: [{ senderId: userId }, { recipientId: userId }],
        }),

        // Delete notifications
        Notification.deleteMany({ userId }),

        // Delete activity logs
        ActivityLog.deleteMany({ userId }),

        // Delete event registrations
        EventRegistration.deleteMany({ userId }),

        // Delete invoices
        Invoice.deleteMany({ user_id: userId }),

        // Delete payment history
        PaymentHistory.deleteMany({ userId }),

        // Delete payment reminders
        PaymentReminder.deleteMany({ userId }),

        // Delete SMS logs
        SMSLog.deleteMany({ userId }),

        // Delete todos
        Todo.deleteMany({ userId }),

        // Delete work reports
        WorkReport.deleteMany({ userId }),

        // Delete permission requests
        PermissionRequest.deleteMany({ userId }),

        // Delete class level requests
        ClassLevelRequest.deleteMany({ studentId: userId }),
      ]);

      // ✅ If entrepreneur, delete their businesses
      if (userRole === "entrepreneur") {
        const businesses = await Business.find({ ownerId: userId });
        const businessIds = businesses.map((b) => b._id);

        await Promise.all([
          Business.deleteMany({ ownerId: userId }),
          Product.deleteMany({ businessId: { $in: businessIds } }),
          Transaction.deleteMany({ businessId: { $in: businessIds } }),
          Revenue.deleteMany({ businessId: { $in: businessIds } }),
        ]);

        console.log(
          `🗑️ Deleted ${businesses.length} businesses for entrepreneur ${userName}`,
        );
      }

      // ✅ If teacher, clean up their classes
      if (userRole === "teacher") {
        await Promise.all([
          Class.updateMany(
            { teacherId: userId },
            { isActive: false, updatedAt: new Date() },
          ),
          Assignment.updateMany(
            { teacherId: userId },
            { status: "closed", updatedAt: new Date() },
          ),
        ]);

        console.log(`📚 Deactivated classes for teacher ${userName}`);
      }

      // Log activity
      await logActivity(
        req.user.id,
        "USER_DELETED",
        `Permanently deleted ${userRole}: ${userName} (${userEmail})`,
        req,
        {
          deletedUserId: userId,
          deletedUserRole: userRole,
          deletedUserName: userName,
          deletedUserEmail: userEmail,
          deletionType: "hard_delete",
          initiatedBy: req.user.username,
        },
      );

      console.log(`✅ Successfully deleted user: ${userName} (${userId})`);

      res.json({
        success: true,
        message: `${
          userRole.charAt(0).toUpperCase() + userRole.slice(1)
        } deleted successfully`,
        data: {
          deletedUserId: userId,
          deletedUserName: userName,
          deletedUserRole: userRole,
        },
      });
    } catch (error) {
      console.error("❌ Error deleting user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// BULK APPROVE USERS (Multiple users at once)
// ============================================
app.post(
  "/api/superadmin/users/bulk-approve",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  [
    body("userIds")
      .isArray({ min: 1, max: 50 })
      .withMessage("userIds must be an array of 1-50 items"),
    body("userIds.*")
      .isMongoId()
      .withMessage("Each userId must be a valid MongoDB ObjectId"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userIds } = req.body;

      console.log(`🔄 Bulk approval request for ${userIds?.length || 0} users`);

      // Validate input
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "User IDs array is required",
        });
      }

      // Limit bulk operations
      if (userIds.length > 50) {
        return res.status(400).json({
          success: false,
          error: "Maximum 50 users can be approved at once",
        });
      }

      // Results tracking
      const results = {
        success: [],
        failed: [],
        skipped: [],
        stats: {
          total: userIds.length,
          approved: 0,
          failed: 0,
          skipped: 0,
        },
      };

      // Process each user
      for (const userId of userIds) {
        try {
          console.log(`\n📝 Processing user: ${userId}`);

          // Validate ObjectId
          if (!mongoose.Types.ObjectId.isValid(userId)) {
            results.failed.push({
              userId,
              error: "Invalid user ID format",
            });
            results.stats.failed++;
            continue;
          }

          // Find user
          const user = await User.findById(userId);

          if (!user) {
            results.failed.push({
              userId,
              error: "User not found",
            });
            results.stats.failed++;
            continue;
          }

          // ✅ FIX 1: Check accountStatus instead of isActive
          if (user.accountStatus === "active") {
            const userName =
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              user.username;
            results.skipped.push({
              userId,
              username: user.username,
              name: userName,
              role: user.role,
              reason: "Already active",
            });
            results.stats.skipped++;
            console.log(`⏭️ Skipped ${userName} - already active`);
            continue;
          }

          // Generate new password
          const newPassword = generateRandomPassword();
          const hashedPassword = await hashPassword(newPassword);

          // 🆕 PHASE 2: Activate user with new status system
          const rolesRequiringPayment = [
            "student",
            "entrepreneur",
            "nonstudent",
          ];
          const requiresPayment = rolesRequiringPayment.includes(user.role);

          user.password = hashedPassword;

          if (!requiresPayment) {
            // Non-payment roles - activate immediately
            user.accountStatus = "active";
            user.paymentStatus = "no_payment";
            user.isActive = true;
            user.payment_verified_by = req.user.id;
            user.payment_verified_at = new Date();
          } else {
            // Payment roles - keep inactive until payment
            user.accountStatus = "inactive";
            user.paymentStatus = "no_payment";
            user.isActive = false;
          }

          user.updatedAt = new Date();
          await user.save();

          console.log(
            `✅ User processed: ${user.username} - Status: ${user.accountStatus}`,
          );

          // Send SMS with password
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;
          let smsResult = { success: false, error: "Not sent" };

          try {
            smsResult = await smsService.sendPasswordSMS(
              user.phoneNumber,
              newPassword,
              userName,
              user._id.toString(),
            );

            // Log SMS result
            if (smsResult.success) {
              console.log(`📱 SMS sent to ${user.phoneNumber}`);

              await SMSLog.create({
                userId: user._id,
                phone: user.phoneNumber,
                message: "Bulk approval password SMS",
                type: "password",
                status: "sent",
                messageId: smsResult.messageId,
                reference: `bulk_approval_${user._id}`,
              });
            } else {
              console.warn(
                `⚠️ SMS failed for ${user.phoneNumber}: ${smsResult.error}`,
              );

              await SMSLog.create({
                userId: user._id,
                phone: user.phoneNumber,
                message: "Bulk approval SMS (failed)",
                type: "password",
                status: "failed",
                errorMessage: smsResult.error,
                reference: `bulk_approval_${user._id}`,
              });
            }
          } catch (smsError) {
            console.error(`❌ SMS error for ${user.phoneNumber}:`, smsError);
            smsResult = { success: false, error: smsError.message };
          }

          // Create notification
          try {
            await createNotification(
              user._id,
              "Account Approved! 🎉",
              `Your ${user.role} account has been approved! Check your SMS at ${user.phoneNumber} for your login password.`,
              "success",
            );
          } catch (notifError) {
            console.error(`⚠️ Notification error:`, notifError);
          }

          // Update invoices if applicable
          if (
            user.role === "student" ||
            user.role === "entrepreneur" ||
            user.role === "nonstudent"
          ) {
            try {
              await Invoice.updateMany(
                {
                  user_id: user._id,
                  status: { $in: ["pending", "verification"] },
                },
                {
                  status: "paid",
                  paidDate: new Date(),
                  "paymentProof.status": "verified",
                  "paymentProof.verifiedBy": req.user.id,
                  "paymentProof.verifiedAt": new Date(),
                },
              );
            } catch (invoiceError) {
              console.error(`⚠️ Invoice update error:`, invoiceError);
            }
          }

          // Update payment history
          try {
            await PaymentHistory.updateMany(
              { userId: user._id, status: "pending" },
              {
                status: "verified",
                verifiedAt: new Date(),
                verifiedBy: req.user.id,
                $push: {
                  statusHistory: {
                    status: "verified",
                    changedBy: req.user.id,
                    changedAt: new Date(),
                    reason: "Bulk approval by admin",
                  },
                },
              },
            );
          } catch (paymentError) {
            console.error(`⚠️ Payment history update error:`, paymentError);
          }

          // ✅ Calculate total paid from PaymentHistory
          const registration_fee_paid = await calculateRegistrationFeePaid(
            user._id,
          );

          // Add to success results
          results.success.push({
            userId: user._id.toString(),
            username: user.username,
            name: userName,
            role: user.role,
            phoneNumber: user.phoneNumber,
            email: user.email,
            smsSent: smsResult.success,
            smsError: smsResult.success ? null : smsResult.error,
            registration_fee_paid,
            accountStatus: user.accountStatus, // ✅ NEW: Include status in response
            paymentStatus: user.paymentStatus, // ✅ NEW: Include payment status
          });
          results.stats.approved++;

          console.log(
            `✅ Successfully approved ${userName} (Status: ${user.accountStatus}, Paid: TZS ${registration_fee_paid})`,
          );
        } catch (userError) {
          console.error(`❌ Error processing user ${userId}:`, userError);
          results.failed.push({
            userId,
            error: userError.message,
          });
          results.stats.failed++;
        }
      }

      // Log bulk activity
      await logActivity(
        req.user.id,
        "BULK_USER_APPROVAL",
        `Bulk approved ${results.stats.approved} users (${results.stats.failed} failed, ${results.stats.skipped} skipped)`,
        req,
        {
          totalRequested: userIds.length,
          approved: results.stats.approved,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          successUserIds: results.success.map((u) => u.userId),
          failedUserIds: results.failed.map((f) => f.userId),
        },
      );

      console.log(`\n✅ Bulk approval complete:`, results.stats);

      // Determine response status
      const allFailed =
        results.stats.approved === 0 && results.stats.failed > 0;
      const partialSuccess =
        results.stats.approved > 0 && results.stats.failed > 0;

      res.status(allFailed ? 500 : 200).json({
        success: results.stats.approved > 0,
        message: allFailed
          ? "All approvals failed"
          : partialSuccess
            ? `Approved ${results.stats.approved} users. ${results.stats.failed} failed.`
            : `Successfully approved ${results.stats.approved} user(s)`,
        data: results,
        summary: {
          total: results.stats.total,
          approved: results.stats.approved,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          successRate: `${(
            (results.stats.approved / results.stats.total) *
            100
          ).toFixed(1)}%`,
        },
      });
    } catch (error) {
      console.error("❌ Bulk approval error:", error);
      res.status(500).json({
        success: false,
        error: "Bulk approval failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// BULK SEND PAYMENT REMINDERS (Multiple users at once)
// ============================================
app.post(
  "/api/superadmin/users/bulk-payment-reminder",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { userIds } = req.body;

      console.log(
        `💰 Bulk payment reminder request for ${userIds?.length || 0} users`,
      );

      // Validate input
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "User IDs array is required",
        });
      }

      // Limit bulk operations
      if (userIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: "Maximum 100 users can receive reminders at once",
        });
      }

      // Results tracking
      const results = {
        success: [],
        failed: [],
        skipped: [],
        stats: {
          total: userIds.length,
          sent: 0,
          failed: 0,
          skipped: 0,
          totalAmountDue: 0,
        },
      };

      // Process each user
      for (const userId of userIds) {
        try {
          console.log(`\n📝 Processing payment reminder for: ${userId}`);

          // Validate ObjectId
          if (!mongoose.Types.ObjectId.isValid(userId)) {
            results.failed.push({
              userId,
              error: "Invalid user ID format",
            });
            results.stats.failed++;
            continue;
          }

          // Find user
          const user = await User.findById(userId).populate(
            "schoolId",
            "name schoolCode",
          );

          if (!user) {
            results.failed.push({
              userId,
              error: "User not found",
            });
            results.stats.failed++;
            continue;
          }

          // Find pending invoices
          const pendingInvoices = await Invoice.find({
            user_id: user._id,
            status: { $in: ["pending", "verification"] },
          }).sort({ dueDate: 1 });

          if (pendingInvoices.length === 0) {
            const userName =
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              user.username;
            results.skipped.push({
              userId,
              username: user.username,
              name: userName,
              phoneNumber: user.phoneNumber,
              reason: "No pending invoices",
            });
            results.stats.skipped++;
            console.log(`⏭️ Skipped ${userName} - no pending invoices`);
            continue;
          }

          // Calculate total amount due
          const totalDue = pendingInvoices.reduce(
            (sum, inv) => sum + inv.amount,
            0,
          );
          results.stats.totalAmountDue += totalDue;

          // Get most urgent invoice
          const urgentInvoice = pendingInvoices[0];
          const daysUntilDue = Math.ceil(
            (new Date(urgentInvoice.dueDate) - new Date()) /
              (1000 * 60 * 60 * 24),
          );

          // Prepare SMS message
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;
          const smsMessage = `Hello ${userName}! Payment Reminder:\n\nAmount Due: TZS ${totalDue.toLocaleString()}\nDue Date: ${new Date(
            urgentInvoice.dueDate,
          ).toLocaleDateString()}\n${
            daysUntilDue > 0 ? `(${daysUntilDue} days remaining)` : "(OVERDUE)"
          }\n\nPay via:\n- Vodacom Lipa: 5130676\n- CRDB: 0150814579600\n\nThank you!`;

          // Send SMS
          let smsResult = { success: false, error: "Not sent" };

          try {
            smsResult = await smsService.sendSMS(
              user.phoneNumber,
              smsMessage,
              "payment_reminder",
            );

            // Log SMS result
            if (smsResult.success) {
              console.log(
                `📱 Payment reminder SMS sent to ${user.phoneNumber}`,
              );

              await SMSLog.create({
                userId: user._id,
                phone: user.phoneNumber,
                message: smsMessage,
                type: "payment_reminder",
                status: "sent",
                messageId: smsResult.messageId,
                reference: `bulk_payment_reminder_${user._id}`,
              });
            } else {
              console.warn(
                `⚠️ SMS failed for ${user.phoneNumber}: ${smsResult.error}`,
              );

              await SMSLog.create({
                userId: user._id,
                phone: user.phoneNumber,
                message: smsMessage,
                type: "payment_reminder",
                status: "failed",
                errorMessage: smsResult.error,
                reference: `bulk_payment_reminder_${user._id}`,
              });
            }
          } catch (smsError) {
            console.error(`❌ SMS error for ${user.phoneNumber}:`, smsError);
            smsResult = { success: false, error: smsError.message };
          }

          // Create in-app notification
          try {
            await createNotification(
              user._id,
              "Payment Reminder",
              `You have ${
                pendingInvoices.length
              } pending invoice(s) totaling TZS ${totalDue.toLocaleString()}. Please complete payment by ${new Date(
                urgentInvoice.dueDate,
              ).toLocaleDateString()}.`,
              "warning",
              `/invoices`,
            );
          } catch (notifError) {
            console.error(`⚠️ Notification error:`, notifError);
          }

          // Create payment reminder record
          try {
            await PaymentReminder.create({
              userId: user._id,
              invoiceId: urgentInvoice._id,
              reminderType: daysUntilDue > 0 ? "second_reminder" : "overdue",
              sentVia: smsResult.success ? "all" : "notification",
              dueDate: urgentInvoice.dueDate,
              amount: totalDue,
              message: smsMessage,
            });
          } catch (reminderError) {
            console.error(`⚠️ Payment reminder record error:`, reminderError);
          }

          // Add to success results
          results.success.push({
            userId: user._id.toString(),
            username: user.username,
            name: userName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            totalDue,
            invoiceCount: pendingInvoices.length,
            daysUntilDue,
            isOverdue: daysUntilDue < 0,
            smsSent: smsResult.success,
            smsError: smsResult.success ? null : smsResult.error,
          });
          results.stats.sent++;

          console.log(`✅ Payment reminder sent to ${userName}`);
        } catch (userError) {
          console.error(`❌ Error processing user ${userId}:`, userError);
          results.failed.push({
            userId,
            error: userError.message,
          });
          results.stats.failed++;
        }
      }

      // Log bulk activity
      await logActivity(
        req.user.id,
        "BULK_PAYMENT_REMINDER",
        `Sent ${results.stats.sent} payment reminders (${results.stats.failed} failed, ${results.stats.skipped} skipped)`,
        req,
        {
          totalRequested: userIds.length,
          sent: results.stats.sent,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          totalAmountDue: results.stats.totalAmountDue,
          successUserIds: results.success.map((u) => u.userId),
          failedUserIds: results.failed.map((f) => f.userId),
        },
      );

      console.log(`\n✅ Bulk payment reminder complete:`, results.stats);

      // Determine response status
      const allFailed = results.stats.sent === 0 && results.stats.failed > 0;
      const partialSuccess = results.stats.sent > 0 && results.stats.failed > 0;

      res.status(allFailed ? 500 : 200).json({
        success: results.stats.sent > 0,
        message: allFailed
          ? "All reminders failed"
          : partialSuccess
            ? `Sent ${results.stats.sent} reminders. ${results.stats.failed} failed.`
            : `Successfully sent ${results.stats.sent} payment reminder(s)`,
        data: results,
        summary: {
          total: results.stats.total,
          sent: results.stats.sent,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          totalAmountDue: results.stats.totalAmountDue,
          successRate: `${(
            (results.stats.sent / results.stats.total) *
            100
          ).toFixed(1)}%`,
        },
      });
    } catch (error) {
      console.error("❌ Bulk payment reminder error:", error);
      res.status(500).json({
        success: false,
        error: "Bulk payment reminder failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// BULK DELETE USERS (Multiple users at once)
// ============================================
app.post(
  "/api/superadmin/users/bulk-delete",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { userIds, confirmationText } = req.body;

      console.log(`🗑️ Bulk delete request for ${userIds?.length || 0} users`);

      // Validate input
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "User IDs array is required",
        });
      }

      // Require confirmation for bulk delete
      if (confirmationText !== "DELETE") {
        return res.status(400).json({
          success: false,
          error: 'Confirmation text must be "DELETE"',
        });
      }

      // Limit bulk operations
      if (userIds.length > 50) {
        return res.status(400).json({
          success: false,
          error: "Maximum 50 users can be deleted at once",
        });
      }

      // Results tracking
      const results = {
        success: [],
        failed: [],
        skipped: [],
        stats: {
          total: userIds.length,
          deleted: 0,
          failed: 0,
          skipped: 0,
        },
        deletedData: {
          students: 0,
          teachers: 0,
          entrepreneurs: 0,
          others: 0,
          totalRecordsDeleted: 0,
        },
      };

      // Process each user
      for (const userId of userIds) {
        try {
          console.log(`\n📝 Processing deletion for: ${userId}`);

          // Validate ObjectId
          if (!mongoose.Types.ObjectId.isValid(userId)) {
            results.failed.push({
              userId,
              error: "Invalid user ID format",
            });
            results.stats.failed++;
            continue;
          }

          // Find user
          const user = await User.findById(userId);

          if (!user) {
            results.failed.push({
              userId,
              error: "User not found",
            });
            results.stats.failed++;
            continue;
          }

          // Prevent deleting super admin
          if (user.role === "super_admin") {
            const userName =
              `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
              user.username;
            results.skipped.push({
              userId,
              username: user.username,
              name: userName,
              role: user.role,
              reason: "Cannot delete Super Admin accounts",
            });
            results.stats.skipped++;
            console.log(`⏭️ Skipped ${userName} - super admin protected`);
            continue;
          }

          // Store user info for logging
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;
          const userRole = user.role;
          const userEmail = user.email;
          let recordsDeleted = 0;

          // Delete user (hard delete)
          await User.findByIdAndDelete(userId);
          recordsDeleted++;

          // Clean up related data
          const cleanupResults = await Promise.allSettled([
            // Student talents
            StudentTalent.deleteMany({ studentId: userId }),

            // Grades
            Grade.deleteMany({ studentId: userId }),

            // Attendance records
            AttendanceRecord.deleteMany({ studentId: userId }),

            // Assignment submissions
            AssignmentSubmission.deleteMany({ studentId: userId }),

            // Performance records
            PerformanceRecord.deleteMany({ studentId: userId }),

            // Certificates
            Certificate.deleteMany({ studentId: userId }),

            // CTM membership
            CTMMembership.deleteOne({ studentId: userId }),

            // Messages (sent and received)
            Message.deleteMany({
              $or: [{ senderId: userId }, { recipientId: userId }],
            }),

            // Notifications
            Notification.deleteMany({ userId }),

            // Activity logs
            ActivityLog.deleteMany({ userId }),

            // Event registrations
            EventRegistration.deleteMany({ userId }),

            // Invoices
            Invoice.deleteMany({ user_id: userId }),

            // Payment history
            PaymentHistory.deleteMany({ userId }),

            // Payment reminders
            PaymentReminder.deleteMany({ userId }),

            // SMS logs
            SMSLog.deleteMany({ userId }),

            // Todos
            Todo.deleteMany({ userId }),

            // Work reports
            WorkReport.deleteMany({ userId }),

            // Permission requests
            PermissionRequest.deleteMany({ userId }),

            // Class level requests
            ClassLevelRequest.deleteMany({ studentId: userId }),
          ]);

          // Count successful deletions
          cleanupResults.forEach((result) => {
            if (result.status === "fulfilled" && result.value?.deletedCount) {
              recordsDeleted += result.value.deletedCount;
            }
          });

          // Role-specific cleanup
          if (userRole === "entrepreneur") {
            const businesses = await Business.find({ ownerId: userId });
            const businessIds = businesses.map((b) => b._id);

            const bizCleanup = await Promise.allSettled([
              Business.deleteMany({ ownerId: userId }),
              Product.deleteMany({ businessId: { $in: businessIds } }),
              Transaction.deleteMany({ businessId: { $in: businessIds } }),
              Revenue.deleteMany({ businessId: { $in: businessIds } }),
            ]);

            bizCleanup.forEach((result) => {
              if (result.status === "fulfilled" && result.value?.deletedCount) {
                recordsDeleted += result.value.deletedCount;
              }
            });

            results.deletedData.entrepreneurs++;
            console.log(
              `🗑️ Deleted ${businesses.length} businesses for entrepreneur ${userName}`,
            );
          } else if (userRole === "teacher") {
            await Promise.allSettled([
              Class.updateMany(
                { teacherId: userId },
                { isActive: false, updatedAt: new Date() },
              ),
              Assignment.updateMany(
                { teacherId: userId },
                { status: "closed", updatedAt: new Date() },
              ),
            ]);

            results.deletedData.teachers++;
            console.log(`📚 Deactivated classes for teacher ${userName}`);
          } else if (userRole === "student") {
            results.deletedData.students++;
          } else {
            results.deletedData.others++;
          }

          results.deletedData.totalRecordsDeleted += recordsDeleted;

          // Add to success results
          results.success.push({
            userId,
            username: user.username,
            name: userName,
            role: userRole,
            email: userEmail,
            recordsDeleted,
          });
          results.stats.deleted++;

          console.log(
            `✅ Deleted user ${userName} (${recordsDeleted} total records)`,
          );
        } catch (userError) {
          console.error(`❌ Error processing user ${userId}:`, userError);
          results.failed.push({
            userId,
            error: userError.message,
          });
          results.stats.failed++;
        }
      }

      // Log bulk activity
      await logActivity(
        req.user.id,
        "BULK_USER_DELETION",
        `Bulk deleted ${results.stats.deleted} users (${results.stats.failed} failed, ${results.stats.skipped} skipped)`,
        req,
        {
          totalRequested: userIds.length,
          deleted: results.stats.deleted,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          deletedUserIds: results.success.map((u) => u.userId),
          failedUserIds: results.failed.map((f) => f.userId),
          totalRecordsDeleted: results.deletedData.totalRecordsDeleted,
          byRole: {
            students: results.deletedData.students,
            teachers: results.deletedData.teachers,
            entrepreneurs: results.deletedData.entrepreneurs,
            others: results.deletedData.others,
          },
        },
      );

      console.log(`\n✅ Bulk deletion complete:`, results.stats);

      // Determine response status
      const allFailed = results.stats.deleted === 0 && results.stats.failed > 0;
      const partialSuccess =
        results.stats.deleted > 0 && results.stats.failed > 0;

      res.status(allFailed ? 500 : 200).json({
        success: results.stats.deleted > 0,
        message: allFailed
          ? "All deletions failed"
          : partialSuccess
            ? `Deleted ${results.stats.deleted} users. ${results.stats.failed} failed.`
            : `Successfully deleted ${results.stats.deleted} user(s)`,
        data: results,
        summary: {
          total: results.stats.total,
          deleted: results.stats.deleted,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          totalRecordsDeleted: results.deletedData.totalRecordsDeleted,
          byRole: results.deletedData,
          successRate: `${(
            (results.stats.deleted / results.stats.total) *
            100
          ).toFixed(1)}%`,
        },
      });
    } catch (error) {
      console.error("❌ Bulk deletion error:", error);
      res.status(500).json({
        success: false,
        error: "Bulk deletion failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// ✅ SEND PASSWORD - Simple password generation without status changes
// POST /api/superadmin/users/:userId/send-password
// ============================================
app.post(
  "/api/superadmin/users/:userId/send-password",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      console.log(`🔑 Send password request for user: ${userId}`);

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Check if user has phone number
      if (!user.phoneNumber) {
        return res.status(400).json({
          success: false,
          error: "User does not have a phone number on file",
        });
      }

      const userName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username;

      // ============================================
      // ✅ GENERATE 6-CHARACTER PASSWORD
      // ============================================
      const generateSixCharPassword = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let password = "";
        for (let i = 0; i < 6; i++) {
          const randomIndex = crypto.randomInt(0, chars.length);
          password += chars[randomIndex];
        }
        return password;
      };

      const newPassword = generateSixCharPassword();
      const hashedPassword = await hashPassword(newPassword);

      console.log(`✅ Generated 6-character password for: ${user.username}`);

      // ============================================
      // ✅ UPDATE ONLY PASSWORD - NO STATUS CHANGES
      // ============================================
      user.password = hashedPassword;
      user.updatedAt = new Date();
      await user.save();

      console.log(
        `✅ Password updated for: ${user.username} - No status changes made`,
      );

      // ============================================
      // ✅ SEND SMS WITH PASSWORD
      // ============================================
      let smsResult = { success: false, error: "Not sent" };

      try {
        smsResult = await smsService.sendPasswordSMS(
          user.phoneNumber,
          newPassword,
          userName,
          user._id.toString(),
        );

        // Log SMS result
        if (smsResult.success) {
          console.log(`📱 Password SMS sent to ${user.phoneNumber}`);

          await SMSLog.create({
            userId: user._id,
            phone: user.phoneNumber,
            message: "Password sent by admin",
            type: "password",
            status: "sent",
            messageId: smsResult.messageId,
            reference: `send_pwd_${user._id}`,
          });
        } else {
          console.error(`❌ Failed to send SMS:`, smsResult.error);

          await SMSLog.create({
            userId: user._id,
            phone: user.phoneNumber,
            message: "Password send SMS (failed)",
            type: "password",
            status: "failed",
            errorMessage: smsResult.error,
            reference: `send_pwd_${user._id}`,
          });
        }
      } catch (smsError) {
        console.error(`❌ SMS error for ${user.phoneNumber}:`, smsError);
        smsResult = { success: false, error: smsError.message };
      }

      // ============================================
      // ✅ CREATE NOTIFICATION
      // ============================================
      try {
        await createNotification(
          user._id,
          "Password Sent 🔑",
          `A new password has been sent to your phone number ${user.phoneNumber}. Please check your SMS to login.`,
          "info",
        );
      } catch (notifError) {
        console.error(`⚠️ Notification error:`, notifError);
      }

      // ============================================
      // ✅ LOG ACTIVITY
      // ============================================
      await logActivity(
        req.user.id,
        "PASSWORD_SENT",
        `Sent password to ${userName} (${user.username}) - No status changes`,
        req,
        {
          userId: user._id,
          userRole: user.role,
          userName,
          phoneNumber: user.phoneNumber,
          smsSent: smsResult.success,
          accountStatus: user.accountStatus, // Log but don't change
          paymentStatus: user.paymentStatus, // Log but don't change
          passwordLength: 6,
        },
      );

      console.log(`✅ Send password complete for ${user.username}`);

      // ============================================
      // ✅ RETURN RESPONSE
      // ============================================
      res.json({
        success: true,
        message: `Password sent successfully to ${user.phoneNumber}.`,
        data: {
          userId: user._id,
          username: user.username,
          name: userName,
          phoneNumber: user.phoneNumber,
          smsSent: smsResult.success,
          smsError: smsResult.success ? null : smsResult.error,
          accountStatus: user.accountStatus, // ✅ Status unchanged
          paymentStatus: user.paymentStatus, // ✅ Status unchanged
          passwordLength: 6,
        },
      });
    } catch (error) {
      console.error("❌ Error sending password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send password",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// GET USER PASSWORD ENDPOINT
// ============================================
app.get(
  "/api/superadmin/users/:userId/password",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      console.log("🔑 View password request for user:", userId);
      console.log("👤 Requested by admin:", req.user.email);

      // Validate userId
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid user ID",
        });
      }

      // Find user in all collections
      let user = await Student.findById(userId).select(
        "firstName lastName email phoneNumber phone password",
      );
      let userType = "student";

      if (!user) {
        user = await User.findById(userId).select(
          "firstName lastName names email phoneNumber phone password",
        );
        userType = "entrepreneur/staff";
      }

      if (!user) {
        console.log("❌ User not found:", userId);
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Security check - ensure user has a password
      if (!user.password) {
        console.log("❌ User has no password:", userId);
        return res.status(404).json({
          success: false,
          error: "User password not found",
        });
      }

      const userName = user.firstName
        ? `${user.firstName} ${user.lastName}`
        : `${user.names?.first || ""} ${user.names?.last || ""}`.trim();

      console.log(`✅ Password retrieved for: ${userName} (${userType})`);
      console.log(`📱 Password: ${user.password}`);

      // ✅ CREATE ACTIVITY LOG
      try {
        const ActivityLog = mongoose.model("ActivityLog");
        await ActivityLog.create({
          userId: req.user.userId,
          userRole: req.user.role,
          action: "view_password",
          targetUserId: userId,
          targetUserType: userType,
          details: `Viewed password for ${userName}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          timestamp: new Date(),
        });
        console.log("✅ Activity logged: Password view");
      } catch (logError) {
        console.error("⚠️ Failed to log activity:", logError);
        // Don't fail the request if logging fails
      }

      // ✅ CREATE NOTIFICATION FOR ADMIN
      try {
        const Notification = mongoose.model("Notification");
        await Notification.create({
          recipientId: req.user.userId,
          type: "password_viewed",
          title: "Password Viewed",
          message: `You viewed the password for ${userName}`,
          relatedId: userId,
          relatedModel: userType === "student" ? "Student" : "User",
          createdAt: new Date(),
        });
        console.log("✅ Notification created for admin");
      } catch (notifError) {
        console.error("⚠️ Failed to create notification:", notifError);
        // Don't fail the request if notification fails
      }

      // Return password
      res.status(200).json({
        success: true,
        data: {
          password: user.password,
          userId: user._id,
          userName: userName,
          userEmail: user.email,
          userPhone: user.phoneNumber || user.phone,
          retrievedAt: new Date().toISOString(),
          retrievedBy: req.user.email,
        },
        message: "Password retrieved successfully",
      });
    } catch (error) {
      console.error("❌ Error retrieving password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retrieve password",
        details: error.message,
      });
    }
  },
);

// GET Admin Profile
app.get(
  "/api/admin/profile",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi",
  ),
  async (req, res) => {
    try {
      const profile = await User.findById(req.user.id)
        .select("-password")
        .populate("schoolId", "name schoolCode logo")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      if (!profile) {
        return res
          .status(404)
          .json({ success: false, error: "Profile not found" });
      }

      res.json({ success: true, data: profile });
    } catch (error) {
      console.error("❌ Error fetching admin profile:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch profile",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// REGISTRATION TYPE ADMIN ENDPOINTS
// ============================================

// GET all registration types (Admin)
app.get(
  "/api/admin/registration-types",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      // ✅ STUDENT PACKAGES (CTM-based)
      const registrationTypes = [
        {
          id: "normal_registration",
          name: "Normal Registration",
          category: "CTM",
          amount: getStudentRegistrationFee("normal", "government"), // ✅ Using centralized pricing
          currency: "TZS",
          monthly: false,
          monthlyFee: 0,
          features: [
            "Basic CTM membership",
            "Access to school activities",
            "One-time registration fee",
          ],
        },
        {
          id: "premier_registration",
          name: "Premier Registration",
          category: "CTM",
          amount: getStudentRegistrationFee("premier", "government"), // ✅ Using centralized pricing
          currency: "TZS",
          monthly: true,
          monthlyFee: getStudentMonthlyFee("premier"), // ✅ Using centralized pricing
          features: [
            "Full CTM membership",
            "Monthly billing",
            "Premium features",
            "Priority support",
          ],
        },

        // ✅ NON-STUDENT PACKAGES (Entrepreneur-based)
        {
          id: "silver_registration",
          name: "Silver Registration",
          category: "Non-CTM",
          amount: getEntrepreneurRegistrationFee("silver", false), // ✅ Using centralized pricing
          currency: "TZS",
          monthly: false,
          monthlyFee: 0,
          features: [
            "Basic access",
            "Standard support",
            "One-time registration fee",
          ],
        },
        {
          id: "diamond_registration",
          name: "Diamond Registration",
          category: "Non-CTM",
          amount: getEntrepreneurRegistrationFee("diamond", true), // ✅ Using centralized pricing (includes first month)
          currency: "TZS",
          monthly: true,
          monthlyFee: getEntrepreneurMonthlyFee("diamond"), // ✅ Using centralized pricing
          features: [
            "Full access",
            "Monthly billing",
            "Premium support",
            "Business promotion features",
          ],
        },

        // ✅ ADDITIONAL ENTREPRENEUR PACKAGES
        {
          id: "gold_registration",
          name: "Gold Registration",
          category: "Non-CTM",
          amount: getEntrepreneurRegistrationFee("gold", true), // ✅ Using centralized pricing
          currency: "TZS",
          monthly: true,
          monthlyFee: getEntrepreneurMonthlyFee("gold"), // ✅ Using centralized pricing
          features: [
            "Enhanced business features",
            "Monthly billing",
            "Advanced analytics",
            "Priority support",
          ],
        },
        {
          id: "platinum_registration",
          name: "Platinum Registration",
          category: "Non-CTM",
          amount: getEntrepreneurRegistrationFee("platinum", true), // ✅ Using centralized pricing
          currency: "TZS",
          monthly: true,
          monthlyFee: getEntrepreneurMonthlyFee("platinum"), // ✅ Using centralized pricing
          features: [
            "Premium business features",
            "Monthly billing",
            "Full analytics suite",
            "Dedicated support",
            "Marketing tools",
          ],
        },
      ];

      // ✅ Add summary statistics
      const summary = {
        totalPackages: registrationTypes.length,
        studentPackages: registrationTypes.filter((p) => p.category === "CTM")
          .length,
        entrepreneurPackages: registrationTypes.filter(
          (p) => p.category === "Non-CTM",
        ).length,
        monthlyPackages: registrationTypes.filter((p) => p.monthly).length,
        oneTimePackages: registrationTypes.filter((p) => !p.monthly).length,
      };

      res.json({
        success: true,
        data: registrationTypes,
        summary,
        meta: {
          generatedAt: new Date().toISOString(),
          pricingSource: "centralized_packagePricing",
        },
      });
    } catch (error) {
      console.error("❌ Error fetching registration types:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch registration types",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE registration type (Admin)
app.post(
  "/api/admin/registration-types",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { name, category, amount, currency, monthly, features } = req.body;

      await logActivity(
        req.user.id,
        "REGISTRATION_TYPE_CREATED",
        `Created registration type: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Registration type created successfully",
        data: { name, category, amount, currency, monthly, features },
      });
    } catch (error) {
      console.error("❌ Error creating registration type:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create registration type",
      });
    }
  },
);

// UPDATE registration type (Admin)
app.patch(
  "/api/admin/registration-types/:id",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      await logActivity(
        req.user.id,
        "REGISTRATION_TYPE_UPDATED",
        `Updated registration type: ${id}`,
        req,
      );

      res.json({
        success: true,
        message: "Registration type updated successfully",
        data: { id, ...req.body },
      });
    } catch (error) {
      console.error("❌ Error updating registration type:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update registration type",
      });
    }
  },
);

// DELETE registration type (Admin)
app.delete(
  "/api/admin/registration-types/:id",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      await logActivity(
        req.user.id,
        "REGISTRATION_TYPE_DELETED",
        `Deleted registration type: ${id}`,
        req,
      );

      res.json({
        success: true,
        message: "Registration type deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting registration type:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete registration type",
      });
    }
  },
);

// ============================================
// SUPERADMIN MESSAGING ENDPOINTS
// ============================================

// GET SuperAdmin Inbox
app.get(
  "/api/superadmin/messages/inbox",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, filter = "all" } = req.query;

      const query = {
        recipientId: req.user.id,
        isDeleted: false,
      };

      if (filter === "unread") {
        query.isRead = false;
      }

      const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate(
          "senderId",
          "firstName lastName email role profileImage schoolId",
        )
        .populate({
          path: "senderId",
          populate: { path: "schoolId", select: "name schoolCode" },
        });

      const total = await Message.countDocuments(query);
      const unreadCount = await Message.countDocuments({
        recipientId: req.user.id,
        isRead: false,
        isDeleted: false,
      });

      res.json({
        success: true,
        data: messages,
        meta: {
          total,
          unreadCount,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching inbox:", error);
      res.status(500).json({ success: false, error: "Failed to fetch inbox" });
    }
  },
);

// GET SuperAdmin Outbox
app.get(
  "/api/superadmin/messages/outbox",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      const messages = await Message.find({
        senderId: req.user.id,
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate(
          "recipientId",
          "firstName lastName email role profileImage schoolId",
        )
        .populate({
          path: "recipientId",
          populate: { path: "schoolId", select: "name schoolCode" },
        });

      const total = await Message.countDocuments({
        senderId: req.user.id,
        isDeleted: false,
      });

      res.json({
        success: true,
        data: messages,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching outbox:", error);
      res.status(500).json({ success: false, error: "Failed to fetch outbox" });
    }
  },
);

// POST Send Message (Individual)
app.post(
  "/api/superadmin/messages/send",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { recipientId, subject, content, messageType = "text" } = req.body;

      if (!recipientId || !content) {
        return res.status(400).json({
          success: false,
          error: "Recipient and content are required",
        });
      }

      const message = await Message.create({
        senderId: req.user.id,
        recipientId,
        content,
        messageType,
        conversationId: [req.user.id, recipientId].sort().join("_"),
      });

      await message.populate([
        { path: "senderId", select: "firstName lastName profileImage" },
        { path: "recipientId", select: "firstName lastName profileImage" },
      ]);

      // Create notification
      await createNotification(
        recipientId,
        subject || "New Message from SuperAdmin",
        content.substring(0, 100),
        "message",
        `/messages`,
      );

      // Emit real-time via Socket.io
      if (io) {
        io.to(recipientId).emit("new_message", message);
      }

      await logActivity(
        req.user.id,
        "SUPERADMIN_MESSAGE_SENT",
        `Sent message to user ${recipientId}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Message sent successfully",
        data: message,
      });
    } catch (error) {
      console.error("❌ Error sending message:", error);
      res.status(500).json({ success: false, error: "Failed to send message" });
    }
  },
);

// POST Bulk Message
app.post(
  "/api/superadmin/messages/bulk",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const {
        recipientType, // 'all', 'role', 'school', 'region', 'district', 'individual'
        recipientIds,
        role,
        schoolId,
        regionId,
        districtId,
        subject,
        content,
      } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: "Content is required",
        });
      }

      let recipients = [];

      // Build recipient list based on type
      if (recipientType === "individual" && recipientIds) {
        recipients = recipientIds;
      } else if (recipientType === "role" && role) {
        const users = await User.find({ role, isActive: true }).distinct("_id");
        recipients = users;
      } else if (recipientType === "school" && schoolId) {
        const users = await User.find({ schoolId, isActive: true }).distinct(
          "_id",
        );
        recipients = users;
      } else if (recipientType === "region" && regionId) {
        const users = await User.find({ regionId, isActive: true }).distinct(
          "_id",
        );
        recipients = users;
      } else if (recipientType === "district" && districtId) {
        const users = await User.find({ districtId, isActive: true }).distinct(
          "_id",
        );
        recipients = users;
      } else if (recipientType === "all") {
        const users = await User.find({
          isActive: true,
          _id: { $ne: req.user.id },
        }).distinct("_id");
        recipients = users;
      }

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No recipients found",
        });
      }

      // Create messages and notifications
      const messages = [];
      for (const recipientId of recipients) {
        const message = await Message.create({
          senderId: req.user.id,
          recipientId,
          content,
          messageType: "text",
          conversationId: [req.user.id, recipientId].sort().join("_"),
        });
        messages.push(message);

        // Create notification
        await createNotification(
          recipientId,
          subject || "New Message from SuperAdmin",
          content.substring(0, 100),
          "message",
          `/messages`,
        );

        // Emit real-time
        if (io) {
          io.to(recipientId.toString()).emit("new_message", message);
        }
      }

      await logActivity(
        req.user.id,
        "SUPERADMIN_BULK_MESSAGE_SENT",
        `Sent bulk message to ${recipients.length} recipients`,
        req,
        { recipientType, recipientCount: recipients.length },
      );

      res.status(201).json({
        success: true,
        message: `Message sent to ${recipients.length} recipient(s)`,
        data: { sentCount: recipients.length },
      });
    } catch (error) {
      console.error("❌ Error sending bulk message:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to send bulk message" });
    }
  },
);

// GET Users Search (for recipient autocomplete)
app.get(
  "/api/superadmin/users/search",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { q, role, schoolId, limit = 20 } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: "Search query must be at least 2 characters",
        });
      }

      const query = {
        $or: [
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
          { username: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
        ],
        isActive: true,
        _id: { $ne: req.user.id }, // Exclude self
      };

      if (role) query.role = role;
      if (schoolId) query.schoolId = schoolId;

      const users = await User.find(query)
        .select("firstName lastName email username role profileImage schoolId")
        .populate("schoolId", "name schoolCode")
        .limit(parseInt(limit))
        .sort({ firstName: 1 });

      res.json({
        success: true,
        data: users.map((user) => ({
          id: user._id,
          name:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username,
          email: user.email,
          role: user.role,
          school: user.schoolId?.name,
          avatar: user.profileImage,
        })),
      });
    } catch (error) {
      console.error("❌ Error searching users:", error);
      res.status(500).json({ success: false, error: "Failed to search users" });
    }
  },
);

// PATCH Mark Message as Read
app.patch(
  "/api/superadmin/messages/:messageId/read",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const message = await Message.findOneAndUpdate(
        {
          _id: req.params.messageId,
          recipientId: req.user.id,
        },
        {
          isRead: true,
          readAt: new Date(),
        },
        { new: true },
      );

      if (!message) {
        return res.status(404).json({
          success: false,
          error: "Message not found",
        });
      }

      res.json({
        success: true,
        message: "Message marked as read",
        data: message,
      });
    } catch (error) {
      console.error("❌ Error marking message as read:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to mark message as read" });
    }
  },
);

// DELETE Message
app.delete(
  "/api/superadmin/messages/:messageId",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const message = await Message.findOneAndUpdate(
        {
          _id: req.params.messageId,
          $or: [{ senderId: req.user.id }, { recipientId: req.user.id }],
        },
        { isDeleted: true, deletedAt: new Date() },
        { new: true },
      );

      if (!message) {
        return res.status(404).json({
          success: false,
          error: "Message not found",
        });
      }

      res.json({
        success: true,
        message: "Message deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting message:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to delete message" });
    }
  },
);

// UPDATE School (SuperAdmin) - UPDATED to handle embedded location data
app.put(
  "/api/superadmin/schools/:schoolId",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { schoolId } = req.params;
      const updateData = { ...req.body };

      console.log("📍 Received update data:", updateData);

      // ✅ Process regionId (same logic as create)
      if (updateData.regionId && typeof updateData.regionId === "object") {
        const regionData = updateData.regionId;

        let region = await Region.findOne({
          $or: [{ code: regionData.code }, { name: regionData.name }],
        });

        if (!region) {
          region = await Region.create({
            name: regionData.name,
            code: regionData.code,
            isActive: true,
          });
        }

        updateData.regionId = region._id;
      } else if (updateData.regionCode) {
        const region = await Region.findOne({
          $or: [
            { code: { $regex: new RegExp(`^${updateData.regionCode}$`, "i") } },
            { name: { $regex: new RegExp(`^${updateData.regionCode}$`, "i") } },
          ],
        });

        if (region) {
          updateData.regionId = region._id;
        }
        delete updateData.regionCode;
      }

      // ✅ Process districtId
      if (updateData.districtId && typeof updateData.districtId === "object") {
        const districtData = updateData.districtId;

        let district = await District.findOne({
          $or: [{ code: districtData.code }, { name: districtData.name }],
        });

        if (!district && updateData.regionId) {
          district = await District.create({
            name: districtData.name,
            code: districtData.code,
            regionId: updateData.regionId,
            isActive: true,
          });
        }

        if (district) {
          updateData.districtId = district._id;
        }
      } else if (updateData.districtCode) {
        const district = await District.findOne({
          $or: [
            {
              code: { $regex: new RegExp(`^${updateData.districtCode}$`, "i") },
            },
            {
              name: { $regex: new RegExp(`^${updateData.districtCode}$`, "i") },
            },
          ],
        });

        if (district) {
          updateData.districtId = district._id;
        }
        delete updateData.districtCode;
      }

      // ✅ Process wardId
      if (updateData.wardId && typeof updateData.wardId === "object") {
        const wardData = updateData.wardId;

        let ward = await Ward.findOne({
          $or: [{ code: wardData.code }, { name: wardData.name }],
        });

        if (!ward && updateData.districtId) {
          ward = await Ward.create({
            name: wardData.name,
            code: wardData.code,
            districtId: updateData.districtId,
            isActive: true,
          });
        }

        if (ward) {
          updateData.wardId = ward._id;
        }
      } else if (updateData.wardCode) {
        const ward = await Ward.findOne({
          $or: [
            { code: { $regex: new RegExp(`^${updateData.wardCode}$`, "i") } },
            { name: { $regex: new RegExp(`^${updateData.wardCode}$`, "i") } },
          ],
        });

        if (ward) {
          updateData.wardId = ward._id;
        }
        delete updateData.wardCode;
      }

      // Update timestamp
      updateData.updatedAt = new Date();

      // Find and update the school
      const school = await School.findByIdAndUpdate(schoolId, updateData, {
        new: true,
        runValidators: true,
      })
        .populate("regionId", "name code")
        .populate("districtId", "name code")
        .populate("wardId", "name code");

      if (!school) {
        return res.status(404).json({
          success: false,
          error: "School not found",
        });
      }

      await logActivity(
        req.user.id,
        "SCHOOL_UPDATED",
        `Updated school: ${school.name}`,
        req,
      );

      console.log(`✅ Successfully updated school: ${school.name}`);

      res.json({
        success: true,
        message: "School updated successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error updating school:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update school",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// TEACHER ENDPOINTS (18 ENDPOINTS)
// ============================================

// GET Teacher Profile
app.get(
  "/api/teacher/profile",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const teacher = await User.findById(req.user.id)
        .select("-password")
        .populate("schoolId", "name schoolCode logo address")
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      if (!teacher) {
        return res
          .status(404)
          .json({ success: false, error: "Teacher not found" });
      }

      // Get teacher statistics
      const [classCount, studentCount, assignmentCount, totalGrades] =
        await Promise.all([
          Class.countDocuments({ teacherId: teacher._id, isActive: true }),
          Class.aggregate([
            { $match: { teacherId: new mongoose.Types.ObjectId(teacher._id) } },
            { $project: { studentCount: { $size: "$students" } } },
            { $group: { _id: null, total: { $sum: "$studentCount" } } },
          ]),
          Assignment.countDocuments({ teacherId: teacher._id }),
          Grade.countDocuments({ teacherId: teacher._id }),
        ]);

      res.json({
        success: true,
        data: {
          ...teacher.toObject(),
          stats: {
            classes: classCount,
            students: studentCount[0]?.total || 0,
            assignments: assignmentCount,
            gradesGiven: totalGrades,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching teacher profile:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch profile" });
    }
  },
);

// GET Teacher Classes
app.get(
  "/api/teacher/classes",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const classes = await Class.find({
        teacherId: req.user.id,
        isActive: true,
      })
        .populate("schoolId", "name schoolCode")
        .populate("students", "firstName lastName email profileImage")
        .sort({ createdAt: -1 });

      res.json({ success: true, data: classes });
    } catch (error) {
      console.error("❌ Error fetching classes:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch classes" });
    }
  },
);

// GET /api/admin/class-level-requests - List all class level requests for admin review
app.get(
  "/api/admin/class-level-requests",
  authenticateToken,
  authorizeRoles("headmaster", "super_admin", "national_official"),
  async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const admin = await User.findById(req.user.id);

      // Build query based on admin role
      const query = {};

      // Filter by status if provided
      if (status) {
        query.status = status;
      }

      // Apply school/region filtering for headmasters
      if (req.user.role === "headmaster" && req.user.schoolId) {
        // Get students from this school
        const schoolStudents = await User.find({
          schoolId: req.user.schoolId,
          role: "student",
        }).distinct("_id");

        query.studentId = { $in: schoolStudents };
      }

      const requests = await ClassLevelRequest.find(query)
        .sort({ submittedAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate(
          "studentId",
          "firstName lastName email username gradeLevel course",
        )
        .populate("reviewedBy", "firstName lastName");

      // ✅ OPTIMIZED: ENRICH WITH PAYMENT DATA (1 QUERY TOTAL)
      const studentIds = requests
        .map((r) => r.studentId?._id)
        .filter((id) => id);

      const paymentTotals = await PaymentHistory.aggregate([
        {
          $match: {
            userId: { $in: studentIds },
            status: { $in: ["verified", "approved", "completed"] },
            transactionType: "registration_fee",
          },
        },
        {
          $group: {
            _id: "$userId",
            totalPaid: { $sum: "$amount" },
          },
        },
      ]);

      // Create lookup map
      const paymentMap = {};
      paymentTotals.forEach((p) => {
        paymentMap[p._id.toString()] = p.totalPaid;
      });

      // Enrich requests with payment data (no async, super fast)
      const enrichedRequests = requests.map((request) => {
        const requestObj = request.toObject();

        if (requestObj.studentId) {
          requestObj.studentId.registration_fee_paid =
            paymentMap[requestObj.studentId._id.toString()] || 0;
        }

        return requestObj;
      });

      console.log(
        `✅ Enriched ${enrichedRequests.length} requests with payment data (optimized)`,
      );

      const total = await ClassLevelRequest.countDocuments(query);

      // Get counts by status
      const statusCounts = await ClassLevelRequest.aggregate([
        {
          $match:
            req.user.role === "headmaster" && req.user.schoolId
              ? { studentId: { $in: schoolStudents } }
              : {},
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      console.log(`✅ Admin fetched ${requests.length} class level requests`);

      res.json({
        success: true,
        data: enrichedRequests, // ✅ Use enriched data instead of requests
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          statusCounts: statusCounts.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching class level requests:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch class level requests",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET /api/admin/class-level-requests/:requestId - Get specific request details
app.get(
  "/api/admin/class-level-requests/:requestId",
  authenticateToken,
  authorizeRoles("headmaster", "super_admin", "national_official"),
  async (req, res) => {
    try {
      const request = await ClassLevelRequest.findById(req.params.requestId)
        .populate(
          "studentId",
          "firstName lastName email username phoneNumber gradeLevel course schoolId",
        )
        .populate("reviewedBy", "firstName lastName email");

      if (!request) {
        return res.status(404).json({
          success: false,
          error: "Request not found",
        });
      }

      // Check permissions
      if (req.user.role === "headmaster") {
        const student = await User.findById(request.studentId._id);
        if (student.schoolId?.toString() !== req.user.schoolId?.toString()) {
          return res.status(403).json({
            success: false,
            error: "You can only view requests from your school",
          });
        }
      }

      console.log(`✅ Admin viewed request ${request._id}`);

      res.json({
        success: true,
        data: request,
      });
    } catch (error) {
      console.error("❌ Error fetching request details:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch request details",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE Class
app.post(
  "/api/teacher/classes",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const {
        name,
        subject,
        level,
        academicYear,
        description,
        schedule,
        room,
        term,
      } = req.body;

      if (!name || !subject || !level || !academicYear) {
        return res.status(400).json({
          success: false,
          error: "Name, subject, level, and academic year are required",
        });
      }

      const classData = await Class.create({
        name,
        subject,
        level,
        academicYear,
        term,
        description,
        schedule,
        room,
        teacherId: req.user.id,
        schoolId: req.user.schoolId,
      });

      await logActivity(
        req.user.id,
        "CLASS_CREATED",
        `Created class: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Class created successfully",
        data: classData,
      });
    } catch (error) {
      console.error("❌ Error creating class:", error);
      res.status(500).json({ success: false, error: "Failed to create class" });
    }
  },
);

// UPDATE Class
app.patch(
  "/api/teacher/classes/:classId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const classData = await Class.findOne({
        _id: req.params.classId,
        teacherId: req.user.id,
      });

      if (!classData) {
        return res
          .status(404)
          .json({ success: false, error: "Class not found" });
      }

      Object.assign(classData, req.body);
      classData.updatedAt = new Date();
      await classData.save();

      await logActivity(
        req.user.id,
        "CLASS_UPDATED",
        `Updated class: ${classData.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Class updated successfully",
        data: classData,
      });
    } catch (error) {
      console.error("❌ Error updating class:", error);
      res.status(500).json({ success: false, error: "Failed to update class" });
    }
  },
);

// DELETE Class
app.delete(
  "/api/teacher/classes/:classId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const classData = await Class.findOne({
        _id: req.params.classId,
        teacherId: req.user.id,
      });

      if (!classData) {
        return res
          .status(404)
          .json({ success: false, error: "Class not found" });
      }

      classData.isActive = false;
      classData.updatedAt = new Date();
      await classData.save();

      await logActivity(
        req.user.id,
        "CLASS_DELETED",
        `Deleted class: ${classData.name}`,
        req,
      );

      res.json({ success: true, message: "Class deleted successfully" });
    } catch (error) {
      console.error("❌ Error deleting class:", error);
      res.status(500).json({ success: false, error: "Failed to delete class" });
    }
  },
);

// GET Class Students
app.get(
  "/api/teacher/classes/:classId/students",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const classData = await Class.findOne({
        _id: req.params.classId,
        teacherId: req.user.id,
      }).populate(
        "students",
        "firstName lastName email phoneNumber profileImage gradeLevel studentId",
      );

      if (!classData) {
        return res
          .status(404)
          .json({ success: false, error: "Class not found" });
      }

      res.json({ success: true, data: classData.students });
    } catch (error) {
      console.error("❌ Error fetching class students:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch students" });
    }
  },
);

// GET All Students (Teacher's school) - PHASE 2 UPDATED
app.get(
  "/api/teacher/students",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 100,
        classLevel,
        search,
        accountStatus,
      } = req.query;

      // Build query
      const query = {
        schoolId: req.user.schoolId,
        role: "student",
        accountStatus: accountStatus || "active",
      };

      // Class level filter
      if (classLevel) {
        query.classLevel = classLevel;
      }

      // Search filter
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { username: { $regex: search, $options: "i" } },
          { studentId: { $regex: search, $options: "i" } },
        ];
      }

      console.log(
        `👨‍🏫 Teacher ${req.user.username} fetching students:`,
        JSON.stringify(query),
      );

      const students = await User.find(query)
        .select(
          "firstName lastName email phoneNumber profileImage gradeLevel classLevel studentId accountStatus paymentStatus registration_type",
        )
        .sort({ firstName: 1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await User.countDocuments(query);

      // ============================================
      // ✅ OPTIMIZED: Fetch all payment totals in ONE query
      // (Prevents flooding logs with individual calculations)
      // ============================================
      console.log(
        `💰 Enriching ${students.length} students with payment data (optimized)...`,
      );

      const studentIds = students.map((s) => s._id);

      const paymentTotals = await PaymentHistory.aggregate([
        {
          $match: {
            userId: { $in: studentIds },
            status: { $in: ["verified", "approved", "completed"] },
            transactionType: "registration_fee",
          },
        },
        {
          $group: {
            _id: "$userId",
            totalPaid: { $sum: "$amount" },
          },
        },
      ]);

      // Create lookup map for O(1) access
      const paymentMap = {};
      paymentTotals.forEach((p) => {
        paymentMap[p._id.toString()] = p.totalPaid;
      });

      // Enrich students with payment data (no async, super fast)
      const enrichedStudents = students.map((student) => {
        const studentObj = student.toObject();
        studentObj.registration_fee_paid =
          paymentMap[student._id.toString()] || 0;
        return studentObj;
      });

      console.log(
        `✅ Payment enrichment complete: ${enrichedStudents.length} students (1 query)`,
      );

      // Get class level breakdown
      const classLevelBreakdown = await User.aggregate([
        {
          $match: {
            schoolId: req.user.schoolId,
            role: "student",
            accountStatus: "active",
          },
        },
        {
          $group: {
            _id: "$classLevel",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const classLevelCounts = {};
      classLevelBreakdown.forEach((item) => {
        if (item._id) {
          classLevelCounts[item._id] = item.count;
        }
      });

      console.log(
        `✅ Found ${enrichedStudents.length} students (total: ${total})`,
      );

      res.json({
        success: true,
        data: enrichedStudents, // ✅ FIXED: Return enriched data
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          classLevelCounts,
          appliedFilters: {
            classLevel: classLevel || null,
            search: search || null,
            accountStatus: accountStatus || "active",
          },
        },
      });
    } catch (error) {
      console.error("❌ Error fetching students:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch students",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET Attendance for a class
app.get(
  "/api/teacher/classes/:classId/attendance",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const { date } = req.query;

      if (!date) {
        return res
          .status(400)
          .json({ success: false, error: "Date is required" });
      }

      const classData = await Class.findOne({
        _id: req.params.classId,
        teacherId: req.user.id,
      });

      if (!classData) {
        return res
          .status(404)
          .json({ success: false, error: "Class not found" });
      }

      const attendanceDate = new Date(date);
      const startOfDay = new Date(attendanceDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(attendanceDate.setHours(23, 59, 59, 999));

      const records = await AttendanceRecord.find({
        studentId: { $in: classData.students },
        date: { $gte: startOfDay, $lte: endOfDay },
        teacherId: req.user.id,
      }).populate("studentId", "firstName lastName profileImage");

      res.json({ success: true, data: records });
    } catch (error) {
      console.error("❌ Error fetching attendance:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch attendance" });
    }
  },
);

// SAVE Attendance
app.post(
  "/api/teacher/classes/:classId/attendance",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const { records } = req.body; // Array of { user_id, status, date }

      if (!records || !Array.isArray(records)) {
        return res
          .status(400)
          .json({ success: false, error: "Records array is required" });
      }

      const classData = await Class.findOne({
        _id: req.params.classId,
        teacherId: req.user.id,
      });

      if (!classData) {
        return res
          .status(404)
          .json({ success: false, error: "Class not found" });
      }

      const createdRecords = [];

      for (const record of records) {
        const existing = await AttendanceRecord.findOne({
          studentId: record.user_id,
          date: new Date(record.date),
          teacherId: req.user.id,
        });

        if (existing) {
          existing.status = record.status;
          existing.remarks = record.remarks;
          await existing.save();
          createdRecords.push(existing);
        } else {
          const newRecord = await AttendanceRecord.create({
            studentId: record.user_id,
            schoolId: req.user.schoolId,
            date: new Date(record.date),
            status: record.status,
            remarks: record.remarks,
            teacherId: req.user.id,
          });
          createdRecords.push(newRecord);
        }
      }

      await logActivity(
        req.user.id,
        "ATTENDANCE_RECORDED",
        `Recorded attendance for ${records.length} students`,
        req,
      );

      res.json({
        success: true,
        message: "Attendance saved successfully",
        data: createdRecords,
      });
    } catch (error) {
      console.error("❌ Error saving attendance:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to save attendance" });
    }
  },
);

// GET Teacher Assignments
app.get(
  "/api/teacher/assignments",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const assignments = await Assignment.find({ teacherId: req.user.id })
        .sort({ dueDate: -1, createdAt: -1 })
        .populate("schoolId", "name schoolCode");

      // Get submission counts
      const assignmentsWithStats = await Promise.all(
        assignments.map(async (assignment) => {
          const submissionCount = await AssignmentSubmission.countDocuments({
            assignmentId: assignment._id,
          });
          const gradedCount = await AssignmentSubmission.countDocuments({
            assignmentId: assignment._id,
            status: "graded",
          });

          return {
            ...assignment.toObject(),
            stats: {
              submissions: submissionCount,
              graded: gradedCount,
              pending: submissionCount - gradedCount,
            },
          };
        }),
      );

      res.json({ success: true, data: assignmentsWithStats });
    } catch (error) {
      console.error("❌ Error fetching assignments:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch assignments" });
    }
  },
);

// CREATE Assignment
app.post(
  "/api/teacher/assignments",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        subject,
        classLevel,
        dueDate,
        totalMarks,
        instructions,
        attachments,
      } = req.body;

      if (!title || !subject || !dueDate) {
        return res.status(400).json({
          success: false,
          error: "Title, subject, and due date are required",
        });
      }

      const assignment = await Assignment.create({
        title,
        description,
        subject,
        classLevel,
        dueDate: new Date(dueDate),
        totalMarks: totalMarks || 100,
        instructions,
        attachments: attachments || [],
        teacherId: req.user.id,
        schoolId: req.user.schoolId,
        status: "published",
      });

      await logActivity(
        req.user.id,
        "ASSIGNMENT_CREATED",
        `Created assignment: ${title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Assignment created successfully",
        data: assignment,
      });
    } catch (error) {
      console.error("❌ Error creating assignment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create assignment",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
); // ✅ FIXED: Closing app.post() for CREATE Assignment

// GET Assignment Submissions
app.get(
  "/api/teacher/assignments/:assignmentId/submissions",
  authenticateToken,
  validateObjectId("assignmentId"),
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const assignment = await Assignment.findOne({
        _id: req.params.assignmentId,
        teacherId: req.user.id,
      });

      if (!assignment) {
        return res
          .status(404)
          .json({ success: false, error: "Assignment not found" });
      }

      const submissions = await AssignmentSubmission.find({
        assignmentId: req.params.assignmentId,
      })
        .populate(
          "studentId",
          "firstName lastName email profileImage studentId",
        )
        .sort({ submittedAt: -1 });

      res.json({ success: true, data: submissions });
    } catch (error) {
      console.error("❌ Error fetching submissions:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch submissions" });
    }
  },
);

// GRADE Submission
app.post(
  "/api/teacher/submissions/:submissionId/grade",
  authenticateToken,
  validateObjectId("submissionId"),
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const { grade, feedback } = req.body;

      if (grade === undefined) {
        return res
          .status(400)
          .json({ success: false, error: "Grade is required" });
      }

      const submission = await AssignmentSubmission.findById(
        req.params.submissionId,
      ).populate("assignmentId");

      if (!submission) {
        return res
          .status(404)
          .json({ success: false, error: "Submission not found" });
      }

      // Verify teacher owns the assignment
      if (submission.assignmentId.teacherId.toString() !== req.user.id) {
        return res
          .status(403)
          .json({ success: false, error: "Not authorized" });
      }

      submission.score = grade;
      submission.feedback = feedback;
      submission.status = "graded";
      submission.gradedBy = req.user.id;
      submission.gradedAt = new Date();
      await submission.save();

      // Notify student
      await createNotification(
        submission.studentId,
        "Assignment Graded",
        `Your assignment "${submission.assignmentId.title}" has been graded: ${grade}/${submission.assignmentId.totalMarks}`,
        "info",
      );

      await logActivity(
        req.user.id,
        "SUBMISSION_GRADED",
        "Graded assignment submission",
        req,
      );

      res.json({
        success: true,
        message: "Submission graded successfully",
        data: submission,
      });
    } catch (error) {
      console.error("❌ Error grading submission:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to grade submission" });
    }
  },
);

// GET Teacher Exams
app.get(
  "/api/teacher/exams",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const exams = await Exam.find({ teacherId: req.user.id })
        .sort({ examDate: -1 })
        .populate("schoolId", "name schoolCode")
        .populate("classId", "name level");

      res.json({ success: true, data: exams });
    } catch (error) {
      console.error("❌ Error fetching exams:", error);
      res.status(500).json({ success: false, error: "Failed to fetch exams" });
    }
  },
);

// CREATE Exam
app.post(
  "/api/teacher/exams",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const {
        title,
        subject,
        classId,
        examDate,
        duration,
        totalMarks,
        passingMarks,
        examType,
        instructions,
      } = req.body;

      if (!title || !subject || !examDate || !totalMarks) {
        return res.status(400).json({
          success: false,
          error: "Title, subject, exam date, and total marks are required",
        });
      }

      const exam = await Exam.create({
        title,
        subject,
        classId,
        examDate: new Date(examDate),
        duration,
        totalMarks,
        passingMarks,
        examType: examType || "quiz",
        instructions,
        teacherId: req.user.id,
        schoolId: req.user.schoolId,
      });

      await logActivity(
        req.user.id,
        "EXAM_CREATED",
        `Created exam: ${title}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Exam created successfully",
        data: exam,
      });
    } catch (error) {
      console.error("❌ Error creating exam:", error);
      res.status(500).json({ success: false, error: "Failed to create exam" });
    }
  },
);

// SEND Bulk Message
app.post(
  "/api/teacher/messages/bulk",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const {
        type,
        recipientType,
        classId,
        studentIds,
        subject,
        message,
        includeParents,
      } = req.body;

      if (!type || !message) {
        return res
          .status(400)
          .json({ success: false, error: "Type and message are required" });
      }

      let recipients = [];

      if (recipientType === "class" && classId) {
        const classData = await Class.findById(classId);
        recipients = classData.students;
      } else if (recipientType === "individual" && studentIds) {
        recipients = studentIds;
      }

      if (recipients.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No recipients specified" });
      }

      // Send notifications
      for (const recipientId of recipients) {
        await createNotification(
          recipientId,
          subject || "Message from Teacher",
          message,
          "info",
        );
      }

      await logActivity(
        req.user.id,
        "BULK_MESSAGE_SENT",
        `Sent message to ${recipients.length} recipients`,
        req,
      );

      res.json({
        success: true,
        message: `Message sent to ${recipients.length} recipient(s)`,
      });
    } catch (error) {
      console.error("❌ Error sending bulk message:", error);
      res.status(500).json({ success: false, error: "Failed to send message" });
    }
  },
);

// GET Student Report
app.get(
  "/api/teacher/students/:studentId/report",
  validateObjectId("studentId"),
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const student = await User.findById(req.params.studentId)
        .select("-password")
        .populate("schoolId", "name schoolCode");

      if (!student || student.role !== "student") {
        return res
          .status(404)
          .json({ success: false, error: "Student not found" });
      }

      const [grades, attendance, assignments] = await Promise.all([
        Grade.find({ studentId: student._id, teacherId: req.user.id })
          .sort({ createdAt: -1 })
          .limit(20),
        AttendanceRecord.aggregate([
          { $match: { studentId: new mongoose.Types.ObjectId(student._id) } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        AssignmentSubmission.find({ studentId: student._id })
          .populate("assignmentId")
          .sort({ submittedAt: -1 })
          .limit(10),
      ]);

      res.json({
        success: true,
        data: {
          student,
          grades,
          attendance,
          assignments,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching student report:", error);
      res.status(500).json({ success: false, error: "Failed to fetch report" });
    }
  },
);

// GET Class Report
app.get(
  "/api/teacher/classes/:classId/report",
  authenticateToken,
  authorizeRoles("teacher"),
  validateObjectId("classId"),
  async (req, res) => {
    try {
      const classData = await Class.findOne({
        _id: req.params.classId,
        teacherId: req.user.id,
      }).populate("students", "firstName lastName email");

      if (!classData) {
        return res
          .status(404)
          .json({ success: false, error: "Class not found" });
      }

      const studentIds = classData.students.map((s) => s._id);

      const [avgGrades, attendanceStats, assignmentStats] = await Promise.all([
        Grade.aggregate([
          { $match: { studentId: { $in: studentIds } } },
          {
            $group: {
              _id: "$subject",
              avgScore: { $avg: "$score" },
              count: { $sum: 1 },
            },
          },
        ]),
        AttendanceRecord.aggregate([
          { $match: { studentId: { $in: studentIds } } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),
        Assignment.aggregate([
          { $match: { teacherId: new mongoose.Types.ObjectId(req.user.id) } },
          {
            $lookup: {
              from: "assignmentsubmissions",
              localField: "_id",
              foreignField: "assignmentId",
              as: "submissions",
            },
          },
          {
            $project: {
              title: 1,
              submissionCount: { $size: "$submissions" },
            },
          },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          class: classData,
          avgGrades,
          attendanceStats,
          assignmentStats,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching class report:", error);
      res.status(500).json({ success: false, error: "Failed to fetch report" });
    }
  },
);

// ============================================================================
// CERTIFICATE ENDPOINTS
// ============================================================================

// GET all certificates (with filters)
app.get("/api/certificates", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      studentId,
      talentId,
      schoolId,
      certificateType,
    } = req.query;

    const query = {};

    if (studentId) query.studentId = studentId;
    if (talentId) query.talentId = talentId;
    if (schoolId) query.schoolId = schoolId;
    if (certificateType) query.certificateType = certificateType;

    // Role-based filtering
    if (req.user.role === "student") {
      query.studentId = req.user.id;
    } else if (req.user.role === "headmaster") {
      query.schoolId = req.user.schoolId;
    }

    const certificates = await Certificate.find(query)
      .sort({ issuedDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("studentId", "firstName lastName email profileImage")
      .populate("talentId", "name category icon")
      .populate("issuedBy", "firstName lastName")
      .populate("schoolId", "name schoolCode logo");

    const total = await Certificate.countDocuments(query);

    res.json({
      success: true,
      data: certificates,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching certificates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch certificates",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET certificate by ID
app.get(
  "/api/certificates/:id",
  validateObjectId("id"),
  authenticateToken,
  async (req, res) => {
    try {
      const certificate = await Certificate.findById(req.params.id)
        .populate("studentId", "firstName lastName email dateOfBirth")
        .populate("talentId", "name category description")
        .populate("issuedBy", "firstName lastName email")
        .populate("schoolId", "name schoolCode logo address");

      if (!certificate) {
        return res.status(404).json({
          success: false,
          error: "Certificate not found",
        });
      }

      res.json({
        success: true,
        data: certificate,
      });
    } catch (error) {
      console.error("❌ Error fetching certificate:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch certificate",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET student certificates
app.get(
  "/api/students/:studentId/certificates",
  authenticateToken,
  validateObjectId("studentId"),
  async (req, res) => {
    try {
      const certificates = await Certificate.find({
        studentId: req.params.studentId,
      })
        .sort({ issuedDate: -1 })
        .populate("talentId", "name category icon")
        .populate("issuedBy", "firstName lastName")
        .populate("schoolId", "name schoolCode logo");

      res.json({
        success: true,
        data: certificates,
      });
    } catch (error) {
      console.error("❌ Error fetching student certificates:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch certificates",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE certificate
app.post(
  "/api/certificates",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const {
        studentId,
        talentId,
        schoolId,
        certificateType,
        title,
        description,
        certificateUrl,
        expiryDate,
        metadata,
      } = req.body;

      // Generate unique certificate number
      const certificateNumber = `CERT-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`;

      // Generate verification code
      const verificationCode = crypto
        .randomBytes(16)
        .toString("hex")
        .toUpperCase();

      const certificate = await Certificate.create({
        studentId,
        talentId,
        schoolId: schoolId || req.user.schoolId,
        certificateNumber,
        certificateType,
        title,
        description,
        issuedBy: req.user.id,
        issuedDate: new Date(),
        certificateUrl,
        verificationCode,
        expiryDate,
        metadata,
        isVerified: true,
      });

      await certificate.populate([
        { path: "studentId", select: "firstName lastName email" },
        { path: "talentId", select: "name category" },
        { path: "schoolId", select: "name schoolCode" },
      ]);

      // Notify student
      await createNotification(
        studentId,
        "Certificate Issued",
        `You have been awarded a ${certificateType} certificate for ${certificate.talentId.name}`,
        "achievement",
        `/certificates/${certificate._id}`,
      );

      await logActivity(
        req.user.id,
        "CERTIFICATE_ISSUED",
        `Issued ${certificateType} certificate to ${certificate.studentId.firstName}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Certificate issued successfully",
        data: certificate,
      });
    } catch (error) {
      console.error("❌ Error creating certificate:", error);
      res.status(500).json({
        success: false,
        error: "Failed to issue certificate",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Verify certificate by number or code
app.get(
  "/api/certificates/verify/:identifier",
  publicRateLimiter,
  validateObjectId("identifier"),
  async (req, res) => {
    try {
      const { identifier } = req.params;

      const certificate = await Certificate.findOne({
        $or: [
          { certificateNumber: identifier },
          { verificationCode: identifier },
        ],
        isVerified: true,
      })
        .populate("studentId", "firstName lastName")
        .populate("talentId", "name category")
        .populate("schoolId", "name schoolCode logo")
        .populate("issuedBy", "firstName lastName");

      if (!certificate) {
        return res.status(404).json({
          success: false,
          error: "Certificate not found or not verified",
        });
      }

      // Check if expired
      if (certificate.expiryDate && new Date() > certificate.expiryDate) {
        return res.json({
          success: true,
          verified: false,
          message: "Certificate has expired",
          data: certificate,
        });
      }

      res.json({
        success: true,
        verified: true,
        message: "Certificate is valid",
        data: certificate,
      });
    } catch (error) {
      console.error("❌ Error verifying certificate:", error);
      res.status(500).json({
        success: false,
        error: "Verification failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE certificate
app.put(
  "/api/certificates/:id",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("headmaster", "super_admin"),
  async (req, res) => {
    try {
      const certificate = await Certificate.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true },
      );

      if (!certificate) {
        return res.status(404).json({
          success: false,
          error: "Certificate not found",
        });
      }

      await logActivity(
        req.user.id,
        "CERTIFICATE_UPDATED",
        `Updated certificate ${certificate.certificateNumber}`,
        req,
      );

      res.json({
        success: true,
        message: "Certificate updated successfully",
        data: certificate,
      });
    } catch (error) {
      console.error("❌ Error updating certificate:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update certificate",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// REVOKE certificate
app.patch(
  "/api/certificates/:id/revoke",
  authenticateToken,
  validateObjectId("id"),
  authorizeRoles("headmaster", "super_admin"),
  async (req, res) => {
    try {
      const certificate = await Certificate.findByIdAndUpdate(
        req.params.id,
        { isVerified: false },
        { new: true },
      );

      if (!certificate) {
        return res.status(404).json({
          success: false,
          error: "Certificate not found",
        });
      }

      await createNotification(
        certificate.studentId,
        "Certificate Revoked",
        `Your certificate ${certificate.certificateNumber} has been revoked`,
        "warning",
      );

      await logActivity(
        req.user.id,
        "CERTIFICATE_REVOKED",
        `Revoked certificate ${certificate.certificateNumber}`,
        req,
      );

      res.json({
        success: true,
        message: "Certificate revoked successfully",
        data: certificate,
      });
    } catch (error) {
      console.error("❌ Error revoking certificate:", error);
      res.status(500).json({
        success: false,
        error: "Failed to revoke certificate",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// GROUPS & GROUP MESSAGING ENDPOINTS
// ============================================================================

// GET all groups (user's groups)
app.get("/api/groups", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, groupType, schoolId } = req.query;

    const query = {
      $or: [
        { members: req.user.id },
        { admins: req.user.id },
        { createdBy: req.user.id },
      ],
    };

    if (groupType) query.groupType = groupType;
    if (schoolId) query.schoolId = schoolId;

    const groups = await Group.find(query)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate("createdBy", "firstName lastName profileImage")
      .populate("admins", "firstName lastName profileImage")
      .populate("schoolId", "name schoolCode");

    // Get member count and latest message for each group
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        const [memberCount, latestMessage, unreadCount] = await Promise.all([
          group.members.length,
          GroupMessage.findOne({ groupId: group._id })
            .sort({ createdAt: -1 })
            .populate("senderId", "firstName lastName"),
          // You could track read status per user if needed
          0,
        ]);

        return {
          ...group.toObject(),
          memberCount,
          latestMessage,
          unreadCount,
        };
      }),
    );

    const total = await Group.countDocuments(query);

    res.json({
      success: true,
      data: groupsWithStats,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching groups:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch groups",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET group by ID
app.get(
  "/api/groups/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const group = await Group.findById(req.params.id)
        .populate("createdBy", "firstName lastName profileImage email")
        .populate("admins", "firstName lastName profileImage email")
        .populate("members", "firstName lastName profileImage email role")
        .populate("schoolId", "name schoolCode logo");

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Check if user is a member
      const isMember =
        group.members.some((m) => m._id.toString() === req.user.id) ||
        group.admins.some((a) => a._id.toString() === req.user.id) ||
        group.createdBy._id.toString() === req.user.id;

      if (!isMember && group.isPrivate) {
        return res.status(403).json({
          success: false,
          error: "You do not have access to this private group",
        });
      }

      res.json({
        success: true,
        data: group,
      });
    } catch (error) {
      console.error("❌ Error fetching group:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch group",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE group
app.post("/api/groups", authenticateToken, async (req, res) => {
  try {
    const {
      name,
      description,
      groupType,
      schoolId,
      avatar,
      isPrivate,
      settings,
      memberIds,
    } = req.body;

    if (!name || !groupType) {
      return res.status(400).json({
        success: false,
        error: "Name and group type are required",
      });
    }

    const group = await Group.create({
      name,
      description,
      groupType,
      schoolId: schoolId || req.user.schoolId,
      avatar,
      createdBy: req.user.id,
      admins: [req.user.id],
      members: memberIds || [],
      isPrivate: isPrivate || false,
      settings: settings || {},
    });

    await group.populate([
      { path: "createdBy", select: "firstName lastName" },
      { path: "members", select: "firstName lastName profileImage" },
    ]);

    // Notify members
    if (memberIds && memberIds.length > 0) {
      memberIds.forEach(async (memberId) => {
        await createNotification(
          memberId,
          "Added to Group",
          `You have been added to the group "${name}"`,
          "info",
          `/groups/${group._id}`,
        );
      });
    }

    await logActivity(
      req.user.id,
      "GROUP_CREATED",
      `Created group: ${name}`,
      req,
    );

    res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: group,
    });
  } catch (error) {
    console.error("❌ Error creating group:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create group",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// UPDATE group
app.put(
  "/api/groups/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const group = await Group.findById(req.params.id);

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Check if user is admin
      const isAdmin =
        group.createdBy.toString() === req.user.id ||
        group.admins.some((a) => a.toString() === req.user.id);

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Only group admins can update the group",
        });
      }

      Object.assign(group, req.body);
      group.updatedAt = new Date();
      await group.save();

      await logActivity(
        req.user.id,
        "GROUP_UPDATED",
        `Updated group: ${group.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Group updated successfully",
        data: group,
      });
    } catch (error) {
      console.error("❌ Error updating group:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update group",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE group
app.delete(
  "/api/groups/:id",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const group = await Group.findById(req.params.id);

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Only creator can delete
      if (group.createdBy.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "Only the group creator can delete the group",
        });
      }

      await group.deleteOne();

      // Delete all messages
      await GroupMessage.deleteMany({ groupId: group._id });

      await logActivity(
        req.user.id,
        "GROUP_DELETED",
        `Deleted group: ${group.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Group deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting group:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete group",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ADD member to group
app.post(
  "/api/groups/:id/members",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { userIds } = req.body;

      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          success: false,
          error: "User IDs array is required",
        });
      }

      const group = await Group.findById(req.params.id);

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Check permissions
      const isAdmin =
        group.createdBy.toString() === req.user.id ||
        group.admins.some((a) => a.toString() === req.user.id) ||
        (group.settings.allowMemberInvite &&
          group.members.some((m) => m.toString() === req.user.id));

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to add members",
        });
      }

      // Add new members (avoid duplicates)
      userIds.forEach((userId) => {
        if (!group.members.includes(userId)) {
          group.members.push(userId);
        }
      });

      group.updatedAt = new Date();
      await group.save();

      // Notify new members
      userIds.forEach(async (userId) => {
        await createNotification(
          userId,
          "Added to Group",
          `You have been added to "${group.name}"`,
          "info",
          `/groups/${group._id}`,
        );
      });

      res.json({
        success: true,
        message: "Members added successfully",
        data: group,
      });
    } catch (error) {
      console.error("❌ Error adding members:", error);
      res.status(500).json({
        success: false,
        error: "Failed to add members",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// REMOVE member from group
app.delete(
  "/api/groups/:id/members/:userId",
  authenticateToken,
  validateObjectId("id"),
  validateObjectId("userId"),
  async (req, res) => {
    try {
      const group = await Group.findById(req.params.id);

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Check permissions
      const isAdmin =
        group.createdBy.toString() === req.user.id ||
        group.admins.some((a) => a.toString() === req.user.id);

      const isSelf = req.params.userId === req.user.id;

      if (!isAdmin && !isSelf) {
        return res.status(403).json({
          success: false,
          error: "You do not have permission to remove members",
        });
      }

      group.members = group.members.filter(
        (m) => m.toString() !== req.params.userId,
      );
      group.admins = group.admins.filter(
        (a) => a.toString() !== req.params.userId,
      );
      group.updatedAt = new Date();
      await group.save();

      res.json({
        success: true,
        message: "Member removed successfully",
      });
    } catch (error) {
      console.error("❌ Error removing member:", error);
      res.status(500).json({
        success: false,
        error: "Failed to remove member",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// GET group messages
app.get(
  "/api/groups/:id/messages",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;

      const group = await Group.findById(req.params.id);

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Check if user is member
      const isMember =
        group.members.some((m) => m.toString() === req.user.id) ||
        group.admins.some((a) => a.toString() === req.user.id) ||
        group.createdBy.toString() === req.user.id;

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "You are not a member of this group",
        });
      }

      const messages = await GroupMessage.find({ groupId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("senderId", "firstName lastName profileImage role");

      const total = await GroupMessage.countDocuments({
        groupId: req.params.id,
      });

      res.json({
        success: true,
        data: messages.reverse(),
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching group messages:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch messages",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// POST group message (REST endpoint, Socket.io also available)
app.post(
  "/api/groups/:id/messages",
  authenticateToken,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { content, messageType, attachmentUrl, attachmentName, mentions } =
        req.body;

      const group = await Group.findById(req.params.id);

      if (!group) {
        return res.status(404).json({
          success: false,
          error: "Group not found",
        });
      }

      // Check permissions
      const isMember =
        group.members.some((m) => m.toString() === req.user.id) ||
        group.admins.some((a) => a.toString() === req.user.id) ||
        group.createdBy.toString() === req.user.id;

      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: "You are not a member of this group",
        });
      }

      if (
        !group.settings.allowMemberPost &&
        !group.admins.some((a) => a.toString() === req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          error: "Only admins can post in this group",
        });
      }

      const message = await GroupMessage.create({
        senderId: req.user.id,
        groupId: req.params.id,
        content,
        messageType: messageType || "text",
        attachmentUrl,
        attachmentName,
        mentions: mentions || [],
      });

      await message.populate("senderId", "firstName lastName profileImage");

      // Update group timestamp
      group.updatedAt = new Date();
      await group.save();

      res.status(201).json({
        success: true,
        message: "Message sent successfully",
        data: message,
      });
    } catch (error) {
      console.error("❌ Error sending group message:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send message",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// COMPLETE PRODUCT ENDPOINTS
// ============================================================================

// GET all products (public endpoint with search)
app.get("/api/products", publicRateLimiter, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      category,
      businessId,
      minPrice,
      maxPrice,
      q,
      featured,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    if (type) query.type = type;
    if (category) query.category = category;
    if (businessId) query.businessId = businessId;
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    if (featured === "true") query.isFeatured = true;
    if (minPrice) query.price = { $gte: parseFloat(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseFloat(maxPrice) };

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const products = await Product.find(query)
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate({
        path: "businessId",
        select: "name logo isVerified",
      });

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET product by ID
app.get(
  "/api/products/:id",
  publicRateLimiter,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).populate({
        path: "businessId",
        select: "name logo isVerified address phoneNumber email",
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: "Product not found",
        });
      }

      // Increment view count
      product.viewCount += 1;
      await product.save();

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      console.error("❌ Error fetching product:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch product",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE product
app.put(
  "/api/products/:id",
  publicRateLimiter,
  validateObjectId("id"),
  authenticateToken,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).populate(
        "businessId",
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          error: "Product not found",
        });
      }

      // Check ownership
      if (
        req.user.role !== "super_admin" &&
        product.businessId.ownerId.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          error: "You can only update your own products",
        });
      }

      Object.assign(product, req.body);
      product.updatedAt = new Date();
      await product.save();

      await logActivity(
        req.user.id,
        "PRODUCT_UPDATED",
        `Updated product: ${product.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Product updated successfully",
        data: product,
      });
    } catch (error) {
      console.error("❌ Error updating product:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update product",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE product
app.delete(
  "/api/products/:id",
  publicRateLimiter,
  validateObjectId("id"),
  authenticateToken,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id).populate(
        "businessId",
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          error: "Product not found",
        });
      }

      // Check ownership
      if (
        req.user.role !== "super_admin" &&
        product.businessId.ownerId.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          error: "You can only delete your own products",
        });
      }

      product.isActive = false;
      product.updatedAt = new Date();
      await product.save();

      await logActivity(
        req.user.id,
        "PRODUCT_DELETED",
        `Deleted product: ${product.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting product:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete product",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// BOOK DOWNLOAD ENDPOINT (with Purchase Verification)
// ============================================================================

app.get(
  "/api/books/:id/download",
  authenticateToken,
  publicRateLimiter,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id);

      if (!book) {
        return res.status(404).json({
          success: false,
          error: "Book not found",
        });
      }

      // Verify purchase
      const purchase = await BookPurchase.findOne({
        userId: req.user.id,
        bookId: book._id,
        paymentStatus: "completed",
      });

      if (!purchase) {
        return res.status(403).json({
          success: false,
          error: "You have not purchased this book",
          message: "Please purchase the book to download it",
        });
      }

      // Update download count
      purchase.downloadCount += 1;
      purchase.lastDownloadDate = new Date();
      await purchase.save();

      await logActivity(
        req.user.id,
        "BOOK_DOWNLOADED",
        `Downloaded book: ${book.title}`,
        req,
      );

      // In production, you would stream the file or return a signed URL
      res.json({
        success: true,
        message: "Book download authorized",
        data: {
          downloadUrl: book.pdfFile,
          bookTitle: book.title,
          author: book.author,
          downloadCount: purchase.downloadCount,
        },
      });
    } catch (error) {
      console.error("❌ Error downloading book:", error);
      res.status(500).json({
        success: false,
        error: "Download failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// STUDENT: GET REGISTERED EVENTS (with populated event details)
// ============================================

app.get(
  "/api/student/events",
  authenticateToken,
  authorizeRoles("student", "nonstudent"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, status } = req.query;

      // Find student's registered events
      const query = { userId };
      if (status) {
        query.registrationStatus = status;
      }

      const registrations = await EventRegistration.find(query)
        .sort({ registeredAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate({
          path: "eventId",
          select:
            "title description eventType startDate endDate location venue coverImage status maxParticipants currentParticipants organizer",
          populate: {
            path: "organizer",
            select: "firstName lastName username",
          },
        })
        .populate("schoolId", "name schoolCode")
        .populate("talentId", "name category");

      // Filter out registrations where event was deleted & format data
      const validEvents = registrations
        .filter((reg) => reg.eventId)
        .map((reg) => {
          const event = reg.eventId;
          return {
            id: event._id.toString(),
            title: event.title,
            description: event.description || "No description available",
            category: event.eventType || "other",
            date: event.startDate,
            time: event.startDate
              ? new Date(event.startDate).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "TBA",
            location: event.location || event.venue || "TBA",
            organizer: event.organizer
              ? `${event.organizer.firstName || ""} ${
                  event.organizer.lastName || ""
                }`.trim() || event.organizer.username
              : "ECONNECT",
            maxParticipants: event.maxParticipants,
            currentParticipants: event.currentParticipants || 0,
            isRegistered: true,
            isPast: event.endDate
              ? new Date(event.endDate) < new Date()
              : false,
            imageUrl: event.coverImage,
          };
        });

      const total = await EventRegistration.countDocuments(query);

      res.json({
        success: true,
        data: validEvents,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching student events:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch events",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// ACTIVITY LOGS ENDPOINT
// ============================================================================

app.get(
  "/api/activity-logs",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        userId,
        action,
        startDate,
        endDate,
      } = req.query;

      const query = {};

      if (userId) query.userId = userId;
      if (action) query.action = action;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Role-based filtering
      if (req.user.role === "headmaster") {
        const schoolUsers = await User.find({
          schoolId: req.user.schoolId,
        }).distinct("_id");
        query.userId = { $in: schoolUsers };
      }

      const logs = await ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("userId", "firstName lastName email role profileImage");

      const total = await ActivityLog.countDocuments(query);

      res.json({
        success: true,
        data: logs,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching activity logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch activity logs",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error), // ✅ ADDED
        }),
      });
    }
  },
);

// ============================================================================
// ADVANCED REPORTING ENDPOINTS
// ============================================================================

// School performance report
app.get(
  "/api/reports/schools",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "regional_official"),
  async (req, res) => {
    try {
      const { regionId, districtId } = req.query;

      const matchQuery = {};
      if (regionId) matchQuery.regionId = new mongoose.Types.ObjectId(regionId);
      if (districtId)
        matchQuery.districtId = new mongoose.Types.ObjectId(districtId);

      const schoolStats = await School.aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: "users",
            let: { schoolId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$schoolId", "$$schoolId"] },
                      { $eq: ["$role", "student"] },
                      { $eq: ["$isActive", true] },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "studentCount",
          },
        },
        {
          $lookup: {
            from: "users",
            let: { schoolId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$schoolId", "$$schoolId"] },
                      { $eq: ["$role", "teacher"] },
                      { $eq: ["$isActive", true] },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "teacherCount",
          },
        },
        {
          $lookup: {
            from: "studenttalents",
            localField: "_id",
            foreignField: "schoolId",
            as: "talents",
          },
        },
        {
          $project: {
            name: 1,
            schoolCode: 1,
            type: 1,
            totalStudents: {
              $ifNull: [{ $arrayElemAt: ["$studentCount.count", 0] }, 0],
            },
            totalTeachers: {
              $ifNull: [{ $arrayElemAt: ["$teacherCount.count", 0] }, 0],
            },
            totalTalents: { $size: "$talents" },
            studentTeacherRatio: {
              $cond: [
                {
                  $eq: [{ $arrayElemAt: ["$teacherCount.count", 0] }, 0],
                },
                0,
                {
                  $divide: [
                    { $arrayElemAt: ["$studentCount.count", 0] },
                    { $arrayElemAt: ["$teacherCount.count", 0] },
                  ],
                },
              ],
            },
          },
        },
        { $sort: { totalStudents: -1 } },
      ]);

      res.json({
        success: true,
        data: schoolStats,
      });
    } catch (error) {
      console.error("❌ Error generating school report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate school report",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Talent distribution report
app.get(
  "/api/reports/talents",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const talentDistribution = await StudentTalent.aggregate([
        {
          $group: {
            _id: "$talentId",
            totalStudents: { $sum: 1 },
            byProficiency: {
              $push: "$proficiencyLevel",
            },
            bySchool: {
              $addToSet: "$schoolId",
            },
          },
        },
        {
          $lookup: {
            from: "talents",
            localField: "_id",
            foreignField: "_id",
            as: "talent",
          },
        },
        { $unwind: "$talent" },
        {
          $project: {
            talent: "$talent.name",
            category: "$talent.category",
            totalStudents: 1,
            schoolCount: { $size: "$bySchool" },
            proficiencyBreakdown: {
              beginner: {
                $size: {
                  $filter: {
                    input: "$byProficiency",
                    as: "level",
                    cond: { $eq: ["$$level", "beginner"] },
                  },
                },
              },
              intermediate: {
                $size: {
                  $filter: {
                    input: "$byProficiency",
                    as: "level",
                    cond: { $eq: ["$$level", "intermediate"] },
                  },
                },
              },
              advanced: {
                $size: {
                  $filter: {
                    input: "$byProficiency",
                    as: "level",
                    cond: { $eq: ["$$level", "advanced"] },
                  },
                },
              },
              expert: {
                $size: {
                  $filter: {
                    input: "$byProficiency",
                    as: "level",
                    cond: { $eq: ["$$level", "expert"] },
                  },
                },
              },
            },
          },
        },
        { $sort: { totalStudents: -1 } },
      ]);

      res.json({
        success: true,
        data: talentDistribution,
      });
    } catch (error) {
      console.error("❌ Error generating talent report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate talent report",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Revenue report (detailed)
app.get(
  "/api/reports/revenue",
  authenticateToken,
  authorizeRoles("super_admin", "entrepreneur"),
  async (req, res) => {
    try {
      const {
        year = new Date().getFullYear(),
        month,
        groupBy = "month",
      } = req.query;

      const matchQuery = { year: parseInt(year) };
      if (month) matchQuery.month = parseInt(month);

      // For entrepreneurs, filter by their businesses
      if (req.user.role === "entrepreneur") {
        const businesses = await Business.find({
          ownerId: req.user.id,
        }).distinct("_id");
        matchQuery.businessId = { $in: businesses };
      }

      let groupByField;
      switch (groupBy) {
        case "day":
          groupByField = { $dayOfMonth: "$revenueDate" };
          break;
        case "week":
          groupByField = { $week: "$revenueDate" };
          break;
        case "quarter":
          groupByField = "$quarter";
          break;
        default:
          groupByField = "$month";
      }

      const revenueData = await Revenue.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: groupByField,
            totalRevenue: { $sum: "$amount" },
            totalCommission: { $sum: "$commission" },
            totalNet: { $sum: "$netAmount" },
            transactionCount: { $sum: 1 },
            byType: {
              $push: {
                type: "$revenueType",
                amount: "$amount",
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Calculate type breakdown
      const typeBreakdown = await Revenue.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: "$revenueType",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
            avgAmount: { $avg: "$amount" },
          },
        },
        { $sort: { total: -1 } },
      ]);

      res.json({
        success: true,
        data: {
          timeline: revenueData,
          byType: typeBreakdown,
          summary: {
            totalRevenue: revenueData.reduce(
              (sum, item) => sum + item.totalRevenue,
              0,
            ),
            totalCommission: revenueData.reduce(
              (sum, item) => sum + item.totalCommission,
              0,
            ),
            totalNet: revenueData.reduce((sum, item) => sum + item.totalNet, 0),
            totalTransactions: revenueData.reduce(
              (sum, item) => sum + item.transactionCount,
              0,
            ),
          },
        },
      });
    } catch (error) {
      console.error("❌ Error generating revenue report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate revenue report",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// SUBJECT ENDPOINTS
// ============================================

// GET all subjects
app.get("/api/subjects", async (req, res) => {
  try {
    const { schoolId, category, isActive = true } = req.query;

    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (category) {
      query.category = category;
    }

    if (schoolId) {
      // Get both global subjects and school-specific ones
      query.$or = [{ schoolId: schoolId }, { schoolId: { $exists: false } }];
    } else {
      // Only return global subjects if no schoolId specified
      query.schoolId = { $exists: false };
    }

    const subjects = await Subject.find(query)
      .sort({ category: 1, name: 1 })
      .select("_id name code description category isActive createdAt");

    console.log(`✅ Fetched ${subjects.length} subjects`);

    res.json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    console.error("❌ Error fetching subjects:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch subjects",
      ...(process.env.NODE_ENV === "development" && {
        debug: sanitizeError(error),
      }),
    });
  }
});

// GET subject by ID
app.get(
  "/api/subjects/:id",
  authenticateToken,
  publicRateLimiter,
  validateObjectId("id"),
  async (req, res) => {
    try {
      const subject = await Subject.findById(req.params.id);

      if (!subject) {
        return res.status(404).json({
          success: false,
          error: "Subject not found",
        });
      }

      res.json({
        success: true,
        data: subject,
      });
    } catch (error) {
      console.error("❌ Error fetching subject:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch subject",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// CREATE subject (admin only)
app.post(
  "/api/subjects",
  authenticateToken,
  publicRateLimiter,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { name, code, description, category, schoolId } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: "Subject name is required",
        });
      }

      // Check if subject already exists
      const existingSubject = await Subject.findOne({
        name,
        ...(schoolId ? { schoolId } : { schoolId: { $exists: false } }),
      });

      if (existingSubject) {
        return res.status(409).json({
          success: false,
          error: "Subject already exists",
        });
      }

      const subject = await Subject.create({
        name,
        code,
        description,
        category,
        schoolId: schoolId || undefined,
      });

      await logActivity(
        req.user.id,
        "SUBJECT_CREATED",
        `Created subject: ${name}`,
        req,
      );

      res.status(201).json({
        success: true,
        message: "Subject created successfully",
        data: subject,
      });
    } catch (error) {
      console.error("❌ Error creating subject:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create subject",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// UPDATE subject
app.put(
  "/api/subjects/:id",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"), // ✅ FIXED: Removed syntax error
  validateObjectId("id"),
  async (req, res) => {
    try {
      const subject = await Subject.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true },
      );

      if (!subject) {
        return res.status(404).json({
          success: false,
          error: "Subject not found",
        });
      }

      await logActivity(
        req.user.id,
        "SUBJECT_UPDATED",
        `Updated subject: ${subject.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Subject updated successfully",
        data: subject,
      });
    } catch (error) {
      console.error("❌ Error updating subject:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update subject",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// DELETE subject (soft delete)
app.delete(
  "/api/subjects/:id",
  authenticateToken,
  publicRateLimiter, // ✅ FIXED
  authorizeRoles("super_admin"), // ✅ FIXED
  validateObjectId("id"),
  async (req, res) => {
    try {
      const subject = await Subject.findByIdAndUpdate(
        req.params.id,
        { isActive: false, updatedAt: new Date() },
        { new: true },
      );

      if (!subject) {
        return res.status(404).json({
          success: false,
          error: "Subject not found",
        });
      }

      await logActivity(
        req.user.id,
        "SUBJECT_DELETED",
        `Deleted subject: ${subject.name}`,
        req,
      );

      res.json({
        success: true,
        message: "Subject deleted successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting subject:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete subject",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// User growth report
app.get(
  "/api/reports/users",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const { year = new Date().getFullYear() } = req.query;

      const userGrowth = await User.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(`${year}-01-01`),
              $lt: new Date(`${parseInt(year) + 1}-01-01`),
            },
          },
        },
        {
          $group: {
            _id: {
              month: { $month: "$createdAt" },
              role: "$role",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]);

      // Format for easier consumption
      const formattedData = {};
      userGrowth.forEach((item) => {
        const month = item._id.month;
        if (!formattedData[month]) {
          formattedData[month] = { month, total: 0 };
        }
        formattedData[month][item._id.role] = item.count;
        formattedData[month].total += item.count;
      });

      const timeline = Object.values(formattedData);

      // Get totals by role
      const byRole = await User.aggregate([
        {
          $group: {
            _id: "$role",
            total: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
            },
          },
        },
        { $sort: { total: -1 } },
      ]);

      res.json({
        success: true,
        data: {
          timeline,
          byRole,
          totalUsers: await User.countDocuments(),
          activeUsers: await User.countDocuments({ isActive: true }),
        },
      });
    } catch (error) {
      console.error("❌ Error generating user report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate user report",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================================================
// BULK OPERATIONS
// ============================================================================

// Bulk import users (CSV)
app.post(
  "/api/users/bulk-import",
  authenticateToken,
  authorizeRoles("super_admin", "headmaster"),
  [
    body("users").isArray().withMessage("Users must be an array"),
    body("users.*.username").trim().notEmpty(),
    body("users.*.email").isEmail(),
    body("users.*.password").isLength({ min: 6 }),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { users } = req.body; // Array of user objects

      if (!users || !Array.isArray(users) || users.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Users array is required",
        });
      }

      const results = {
        success: [],
        failed: [],
      };

      for (const userData of users) {
        try {
          // Hash password
          if (userData.password) {
            userData.password = await hashPassword(userData.password);
          }
          // 🆕 PHASE 2: Force all bulk imported users to be inactive
          userData.accountStatus = "inactive";
          userData.paymentStatus = "no_payment";
          userData.isActive = false;

          // Create user
          const user = await User.create(userData);
          results.success.push({
            username: user.username,
            email: user.email,
            role: user.role,
          });
        } catch (error) {
          results.failed.push({
            data: userData,
            error: error.message,
          });
        }
      }

      await logActivity(
        req.user.id,
        "BULK_IMPORT_USERS",
        `Imported ${results.success.length} users, ${results.failed.length} failed`,
        req,
      );

      res.json({
        success: true,
        message: `Imported ${results.success.length} users successfully`,
        data: results,
      });
    } catch (error) {
      console.error("❌ Error bulk importing users:", error);
      res.status(500).json({
        success: false,
        error: "Bulk import failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// Bulk register students for talents
app.post(
  "/api/students/bulk-register-talents",
  authenticateToken,
  authorizeRoles("teacher", "headmaster", "super_admin"),
  async (req, res) => {
    try {
      const { registrations } = req.body; // Array of { studentId, talentId, proficiencyLevel }

      if (
        !registrations ||
        !Array.isArray(registrations) ||
        registrations.length === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Registrations array is required",
        });
      }

      const results = {
        success: [],
        failed: [],
      };

      for (const reg of registrations) {
        try {
          // Check if already registered
          const existing = await StudentTalent.findOne({
            studentId: reg.studentId,
            talentId: reg.talentId,
          });

          if (existing) {
            results.failed.push({
              data: reg,
              error: "Already registered",
            });
            continue;
          }

          const studentTalent = await StudentTalent.create({
            ...reg,
            schoolId: req.user.schoolId,
            teacherId: req.user.id,
          });

          results.success.push(studentTalent);
        } catch (error) {
          results.failed.push({
            data: reg,
            error: error.message,
          });
        }
      }

      await logActivity(
        req.user.id,
        "BULK_REGISTER_TALENTS",
        `Registered ${results.success.length} student talents`,
        req,
      );

      res.json({
        success: true,
        message: `Registered ${results.success.length} students successfully`,
        data: results,
      });
    } catch (error) {
      console.error("❌ Error bulk registering talents:", error);
      res.status(500).json({
        success: false,
        error: "Bulk registration failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// TEST ENDPOINT 1: Test NEXTSMS Connection
// ADD THIS AFTER YOUR LAST ENDPOINT (Before server.listen())
// ============================================

app.post(
  "/api/test/nextsms",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { phone, message } = req.body;

      console.log("🧪 Testing NEXTSMS with:", {
        phone,
        messageLength: message?.length,
      });

      const result = await smsService.sendSMS(phone, message, "test");

      res.json({
        success: true,
        testResult: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ NEXTSMS test failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

// ============================================
// TEST ENDPOINT 2: Test Password SMS
// ============================================

app.post(
  "/api/test/password-sms",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { phone, password, userName } = req.body;

      const result = await smsService.sendPasswordSMS(
        phone,
        password,
        userName,
        "test123",
      );

      res.json({
        success: true,
        testResult: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

// ============================================
// SMS LOGS ENDPOINT: View SMS History
// ============================================

app.get(
  "/api/superadmin/sms-logs",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, type } = req.query;

      const query = {};
      if (status) query.status = status;
      if (type) query.type = type;

      const logs = await SMSLog.find(query)
        .sort({ sentAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("userId", "firstName lastName email phoneNumber role");

      const total = await SMSLog.countDocuments(query);

      // Get stats
      const stats = await SMSLog.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        data: logs,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          stats: stats.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      console.error("❌ Error fetching SMS logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch SMS logs",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
); // ✅ FIXED: Closing app.get() for SMS Logs
// ============================================
// SMS STATISTICS ENDPOINT
// ============================================

app.get(
  "/api/superadmin/sms-stats",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const [totalSent, totalFailed, last24Hours, byType] = await Promise.all([
        SMSLog.countDocuments({ status: "sent" }),
        SMSLog.countDocuments({ status: "failed" }),
        SMSLog.countDocuments({
          sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
        SMSLog.aggregate([
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              successful: {
                $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] },
              },
            },
          },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          totalSent,
          totalFailed,
          last24Hours,
          byType,
          successRate:
            totalSent + totalFailed > 0
              ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(2)
              : 0,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching SMS stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch stats",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
); // ✅ FIXED: Closing app.get() for SMS Stats
// ============================================
// RESEND PASSWORD SMS (Manual Trigger for Admin)
// ============================================

app.post(
  "/api/superadmin/resend-password-sms",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { userId } = req.body;

      const user = await User.findById(userId);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      // Generate new password
      const newPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(newPassword);

      user.password = hashedPassword;
      await user.save();

      // Send SMS
      const userName = `${user.firstName} ${user.lastName}`;
      const smsResult = await smsService.sendPasswordSMS(
        user.phoneNumber,
        newPassword,
        userName,
        user._id.toString(),
      );

      if (smsResult.success) {
        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: "Password resent by admin",
          type: "password",
          status: "sent",
          messageId: smsResult.messageId,
          reference: `pwd_resend_${user._id}`,
        });

        await logActivity(
          req.user.id,
          "PASSWORD_RESENT",
          `Resent password to ${user.firstName} ${user.lastName}`,
          req,
        );
        res.json({
          success: true,
          message: "Password SMS sent successfully",
          phone: user.phoneNumber,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to send SMS",
          details: smsResult.error,
        });
      }
    } catch (error) {
      console.error("❌ Error resending password:", error);
      res.status(500).json({
        success: false,
        error: "Failed to resend password",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
); // ✅ FIXED: Closing app.post() for Resend Password SMS

// ============================================
// APPROVE USER ENDPOINT (Students/Entrepreneurs/NonStudents)
// ============================================

app.post(
  "/api/superadmin/users/:userId/approve",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      console.log(`🔍 Approval request for user: ${userId}`);

      // Find the user
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      if (user.accountStatus === "active") {
        return res.status(400).json({ error: "User is already active" });
      }

      // ✅ FIX #1: CORRECTED CONDITIONAL ACTIVATION LOGIC
      const rolesRequiringPayment = ["student", "entrepreneur", "nonstudent"];
      const requiresPayment = rolesRequiringPayment.includes(user.role);

      // Generate new password for all approved users
      const newPassword = generateRandomPassword();
      const hashedPassword = await hashPassword(newPassword);

      // Update password
      user.password = hashedPassword;

      // ============================================
      // ✅ CORRECTED STATUS UPDATE LOGIC
      // ============================================
      if (!requiresPayment) {
        // Non-payment roles (teacher, staff, etc.) - activate immediately
        user.accountStatus = "active";
        user.paymentStatus = "no_payment"; // They don't need to pay
        user.isActive = true;
        user.payment_verified_by = req.user.id;
        user.payment_verified_at = new Date();
        console.log(
          `✅ User activated (no payment required): ${user.username}`,
        );
      } else {
        // Payment-required roles - check if they've paid anything
        // ✅ NEW: Check existing payments before deciding status
        const totalPaid = await calculateRegistrationFeePaid(user._id);

        // Determine required amount
        let totalRequired = 0;
        if (user.role === "entrepreneur" || user.role === "nonstudent") {
          const packageType = user.registration_type || "silver";
          totalRequired = getEntrepreneurRegistrationFee(packageType, false);
        } else if (user.role === "student") {
          totalRequired = getStudentRegistrationFee(
            user.registration_type,
            user.institutionType,
          );
        }

        console.log(
          `💰 Payment check: Paid ${totalPaid} / Required ${totalRequired}`,
        );

        if (totalPaid >= totalRequired && totalRequired > 0) {
          // ✅ Full payment - activate as paid
          user.accountStatus = "active";
          user.paymentStatus = "paid";
          user.isActive = true;
          user.payment_verified_by = req.user.id;
          user.payment_verified_at = new Date();
          console.log(`✅ User activated (full payment): ${user.username}`);
        } else if (totalPaid > 0) {
          // ✅ Partial payment - activate with partial status
          user.accountStatus = "active";
          user.paymentStatus = "partial_paid";
          user.isActive = true;
          user.payment_verified_by = req.user.id;
          user.payment_verified_at = new Date();
          console.log(
            `✅ User activated (partial payment ${totalPaid}/${totalRequired}): ${user.username}`,
          );
        } else {
          // ❌ No payment - keep inactive
          user.accountStatus = "inactive";
          user.paymentStatus = "no_payment";
          user.isActive = false;
          console.log(
            `⚠️ User approved but inactive (no payment): ${user.username}`,
          );
        }
      }

      user.updatedAt = new Date();
      await user.save();

      console.log(
        `✅ User status updated: ${user.username} - ${user.accountStatus} + ${user.paymentStatus}`,
      );

      // Send SMS with password
      const userName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username;
      const smsResult = await smsService.sendPasswordSMS(
        user.phoneNumber,
        newPassword,
        userName,
        user._id.toString(),
      );

      // Log SMS result
      if (smsResult.success) {
        console.log(`📱 Approval SMS sent to ${user.phoneNumber}`);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: "Account approval password SMS",
          type: "password",
          status: "sent",
          messageId: smsResult.messageId,
          reference: `approval_${user._id}`,
        });
      } else {
        console.error(`❌ Failed to send approval SMS:`, smsResult.error);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: "Account approval SMS (failed)",
          type: "password",
          status: "failed",
          errorMessage: smsResult.error,
          reference: `approval_${user._id}`,
        });
      }

      // ✅ SMART NOTIFICATIONS based on payment status
      if (user.accountStatus === "active" && user.paymentStatus === "paid") {
        await createNotification(
          user._id,
          "Account Approved & Fully Activated! 🎉",
          `Your ${user.role} account has been approved and fully activated! Your password has been sent to ${user.phoneNumber}.`,
          "success",
        );
      } else if (
        user.accountStatus === "active" &&
        user.paymentStatus === "partial_paid"
      ) {
        const remaining = totalRequired - totalPaid;
        await createNotification(
          user._id,
          "Account Approved & Activated - Payment Pending! ✅",
          `Your ${user.role} account is now active! You have a remaining balance of TZS ${remaining.toLocaleString()}. Your password has been sent to ${user.phoneNumber}.`,
          "warning",
        );
      } else if (user.accountStatus === "inactive") {
        await createNotification(
          user._id,
          "Account Approved - Payment Required 💳",
          `Your ${user.role} account has been approved! Please complete your payment of TZS ${totalRequired.toLocaleString()} to activate your account. Your password has been sent to ${user.phoneNumber}.`,
          "warning",
        );
      } else {
        // Non-payment roles
        await createNotification(
          user._id,
          "Account Approved & Activated! 🎉",
          `Your ${user.role} account has been approved and activated! Check your SMS at ${user.phoneNumber} for your login password.`,
          "success",
        );
      }

      // Update invoice status if exists
      if (requiresPayment) {
        const invoiceUpdate = await Invoice.updateMany(
          {
            user_id: user._id,
            status: { $in: ["pending", "verification"] },
          },
          {
            status: user.paymentStatus === "paid" ? "paid" : "partial_paid",
            paidDate: user.paymentStatus === "paid" ? new Date() : null,
            "paymentProof.status": "verified",
            "paymentProof.verifiedBy": req.user.id,
            "paymentProof.verifiedAt": new Date(),
          },
        );

        console.log(`📄 Updated ${invoiceUpdate.modifiedCount} invoices`);
      }

      // Update payment history if exists
      await PaymentHistory.updateMany(
        { userId: user._id, status: "pending" },
        {
          status: "verified",
          verifiedAt: new Date(),
          verifiedBy: req.user.id,
          $push: {
            statusHistory: {
              status: "verified",
              changedBy: req.user.id,
              changedAt: new Date(),
              reason: "Account approved by admin",
            },
          },
        },
      );

      // Log activity
      await logActivity(
        req.user.id,
        "USER_APPROVED",
        `Approved ${user.role}: ${userName} - Status: ${user.accountStatus}/${user.paymentStatus}`,
        req,
        {
          userId: user._id,
          userRole: user.role,
          phoneNumber: user.phoneNumber,
          smsSent: smsResult.success,
          accountStatus: user.accountStatus,
          paymentStatus: user.paymentStatus,
          totalPaid: totalPaid || 0,
          totalRequired: totalRequired || 0,
          requiresPayment: requiresPayment,
        },
      );

      console.log(`✅ Approval complete for ${user.username}`);

      // ✅ Get final payment total
      const registration_fee_paid = await calculateRegistrationFeePaid(
        user._id,
      );

      // ✅ SMART RESPONSE MESSAGE
      let responseMessage;
      if (user.accountStatus === "active" && user.paymentStatus === "paid") {
        responseMessage = `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} approved and fully activated. Password sent to ${user.phoneNumber}.`;
      } else if (
        user.accountStatus === "active" &&
        user.paymentStatus === "partial_paid"
      ) {
        const remaining = totalRequired - totalPaid;
        responseMessage = `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} approved and activated with partial payment. Remaining balance: TZS ${remaining.toLocaleString()}. Password sent to ${user.phoneNumber}.`;
      } else if (user.accountStatus === "inactive") {
        responseMessage = `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} approved. Password sent to ${user.phoneNumber}. User will be activated after payment verification.`;
      } else {
        responseMessage = `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} approved and activated. Password sent to ${user.phoneNumber}.`;
      }

      res.json({
        success: true,
        message: responseMessage,
        data: {
          userId: user._id,
          username: user.username,
          name: userName,
          role: user.role,
          phoneNumber: user.phoneNumber,
          email: user.email,
          smsSent: smsResult.success,
          accountStatus: user.accountStatus,
          paymentStatus: user.paymentStatus,
          isActive: user.isActive,
          payment_verified_at: user.payment_verified_at,
          payment_verified_by: user.payment_verified_by,
          registration_fee_paid,
          totalRequired: totalRequired || 0,
          remainingBalance: Math.max(
            0,
            (totalRequired || 0) - registration_fee_paid,
          ),
        },
      });
    } catch (error) {
      console.error("❌ Error approving user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to approve user",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// ✅ SEND PAYMENT REMINDER - For users with pending payment
// ============================================
app.post(
  "/api/superadmin/users/:userId/payment-reminder",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      console.log(`💰 Payment reminder request for user: ${userId}`);

      // Find user and invoices
      const user = await User.findById(userId).populate(
        "schoolId",
        "name schoolCode",
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Find pending invoices
      const pendingInvoices = await Invoice.find({
        user_id: user._id,
        status: { $in: ["pending", "verification"] },
      }).sort({ dueDate: 1 });

      if (pendingInvoices.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No pending invoices found for this user",
        });
      }

      // Calculate total amount due
      const totalDue = pendingInvoices.reduce(
        (sum, inv) => sum + inv.amount,
        0,
      );

      // Get most urgent invoice
      const urgentInvoice = pendingInvoices[0];
      const daysUntilDue = Math.ceil(
        (new Date(urgentInvoice.dueDate) - new Date()) / (1000 * 60 * 60 * 24),
      );

      // Send SMS reminder
      const userName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username;
      const smsMessage = `Hello ${userName}! Payment Reminder:\n\nAmount Due: TZS ${totalDue.toLocaleString()}\nDue Date: ${new Date(
        urgentInvoice.dueDate,
      ).toLocaleDateString()}\n${
        daysUntilDue > 0 ? `(${daysUntilDue} days remaining)` : "(OVERDUE)"
      }\n\nPay via:\n- Vodacom Lipa: 5130676\n- CRDB: 0150814579600\n\nThank you!`;

      const smsResult = await smsService.sendSMS(
        user.phoneNumber,
        smsMessage,
        "payment_reminder",
      );

      // Log SMS result
      if (smsResult.success) {
        console.log(`📱 Payment reminder SMS sent to ${user.phoneNumber}`);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: smsMessage,
          type: "payment_reminder",
          status: "sent",
          messageId: smsResult.messageId,
          reference: `payment_reminder_${user._id}`,
        });
      } else {
        console.error(`❌ Failed to send SMS:`, smsResult.error);

        await SMSLog.create({
          userId: user._id,
          phone: user.phoneNumber,
          message: smsMessage,
          type: "payment_reminder",
          status: "failed",
          errorMessage: smsResult.error,
          reference: `payment_reminder_${user._id}`,
        });
      }

      // Create in-app notification
      await createNotification(
        user._id,
        "Payment Reminder",
        `You have ${
          pendingInvoices.length
        } pending invoice(s) totaling TZS ${totalDue.toLocaleString()}. Please complete payment by ${new Date(
          urgentInvoice.dueDate,
        ).toLocaleDateString()}.`,
        "warning",
        `/invoices`,
      );

      // Create payment reminder record
      await PaymentReminder.create({
        userId: user._id,
        invoiceId: urgentInvoice._id,
        reminderType: daysUntilDue > 0 ? "second_reminder" : "overdue",
        sentVia: smsResult.success ? "all" : "notification",
        dueDate: urgentInvoice.dueDate,
        amount: totalDue,
        message: smsMessage,
      });

      // Log activity
      await logActivity(
        req.user.id,
        "PAYMENT_REMINDER_SENT",
        `Sent payment reminder to ${userName} - TZS ${totalDue.toLocaleString()}`,
        req,
        {
          userId: user._id,
          userRole: user.role,
          totalDue,
          invoiceCount: pendingInvoices.length,
          phoneNumber: user.phoneNumber,
          smsSent: smsResult.success,
        },
      );

      console.log(`✅ Payment reminder sent for ${user.username}`);

      res.json({
        success: true,
        message: `Payment reminder sent successfully to ${user.phoneNumber}.`,
        data: {
          userId: user._id,
          username: user.username,
          name: userName,
          phoneNumber: user.phoneNumber,
          totalDue,
          invoiceCount: pendingInvoices.length,
          daysUntilDue,
          smsSent: smsResult.success,
        },
      });
    } catch (error) {
      console.error("❌ Error sending payment reminder:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send payment reminder",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// FIXED: RECORD PAYMENT ENDPOINT with Partial Payment Support
// ============================================

// POST Record Payment (SuperAdmin) - ✅ FULLY CORRECTED VERSION
app.post(
  "/api/superadmin/payment/record",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  [
    body("userId").isMongoId().withMessage("Valid user ID is required"),
    body("paymentData.amount")
      .isNumeric()
      .withMessage("Valid amount is required"),
    body("paymentData.totalRequired").optional().isNumeric(),
    body("paymentData.currency").optional().isString(),
    body("paymentData.transactionType").optional().isString(),
    body("paymentData.method").optional().isString(),
    body("paymentData.reference").optional().isString(),
    body("paymentData.notes").optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      // ✅ FIXED: Extract paymentData first
      const { userId, paymentData } = req.body;

      // ✅ Then extract fields from paymentData
      const {
        amount,
        totalRequired,
        currency,
        transactionType,
        method,
        reference,
        notes,
      } = paymentData || {};

      console.log(`💳 Payment record request for user: ${userId}`);
      console.log(
        `💰 Amount: ${amount}, Total Required: ${
          totalRequired || "Not specified"
        }`,
      );

      // Validate required fields
      if (!userId || !amount) {
        return res.status(400).json({
          success: false,
          error: "User ID and amount are required",
        });
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const userName =
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.username;

      // ✅ DETERMINE TOTAL REQUIRED AMOUNT
      let actualTotalRequired = totalRequired;

      // If totalRequired not provided, calculate based on role and registration type
      if (!actualTotalRequired) {
        if (user.role === "entrepreneur" || user.role === "nonstudent") {
          // Entrepreneur/NonStudent: Get registration fee only
          const packageType = user.registration_type || "silver";
          actualTotalRequired = getEntrepreneurRegistrationFee(
            packageType,
            false, // Don't include first month fee
          );
          console.log(
            `📊 Entrepreneur ${packageType} - Registration fee: ${actualTotalRequired}`,
          );
        } else if (user.role === "student") {
          // Student: Get student package fee
          actualTotalRequired = getStudentRegistrationFee(
            user.registration_type,
            user.institutionType,
          );
          console.log(
            `📊 Student ${user.registration_type} - Fee: ${actualTotalRequired}`,
          );
        } else {
          // Other roles - no payment required
          actualTotalRequired = 0;
          console.log(`📊 ${user.role} - No payment required`);
        }
      }

      // ✅ CALCULATE TOTAL ALREADY PAID
      const totalPaid = await calculateRegistrationFeePaid(userId);
      console.log(`💵 Total already paid: ${totalPaid}`);

      // ✅ CALCULATE NEW TOTAL AFTER THIS PAYMENT
      const newTotal = totalPaid + parseFloat(amount);
      console.log(`💵 New total after payment: ${newTotal}`);

      // ============================================
      // ✅ FIX: CORRECTED PAYMENT STATUS LOGIC
      // ============================================
      let historyStatus; // For PaymentHistory.status (pending, verified)
      let userPaymentStatus; // For User.paymentStatus (paid, partial_paid, no_payment, overdue)
      let shouldActivateUser;

      if (newTotal >= actualTotalRequired) {
        // ✅ FULL PAYMENT
        historyStatus = "verified";
        userPaymentStatus = "paid";
        shouldActivateUser = true;
        console.log(
          "✅ Full payment detected - User will be ACTIVATED (Active + Paid)",
        );
      } else if (newTotal > 0) {
        // ✅ PARTIAL PAYMENT - CORRECTED FIX!
        historyStatus = "verified"; // ✅ FIXED: Admin-recorded payments are verified immediately
        userPaymentStatus = "partial_paid";
        shouldActivateUser = true; // ✅ FIXED: Partial payment ACTIVATES user
        console.log(
          "✅ Partial payment detected - User will be ACTIVATED (Active + Partial Paid)",
        );
      } else {
        // ✅ NO PAYMENT
        historyStatus = "pending";
        userPaymentStatus = "no_payment";
        shouldActivateUser = false;
        console.log("⚠️ No payment - User will remain INACTIVE");
      }

      // ✅ GENERATE INVOICE NUMBER
      const invoiceNumber = `INV-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`;

      // ✅ DETERMINE INVOICE TYPE AND DESCRIPTION
      let invoiceType = transactionType || "other";
      let description =
        notes || `Manual payment recorded by ${req.user.username}`;

      const typeMapping = {
        registration_fee: "ctm_membership",
        membership_fee: "ctm_membership",
        ctm_membership: "ctm_membership",
        certificate_fee: "certificate",
        event_fee: "event",
        tuition_fee: "school_fees",
        exam_fee: "school_fees",
        school_fees: "school_fees",
      };

      invoiceType = typeMapping[transactionType] || "other";

      if (
        transactionType === "registration_fee" ||
        transactionType === "ctm_membership"
      ) {
        description = user.registration_type
          ? `${user.registration_type.toUpperCase()} Registration Payment${
              userPaymentStatus === "partial_paid" ? " (Partial)" : ""
            }`
          : `CTM Club Membership Payment${
              userPaymentStatus === "partial_paid" ? " (Partial)" : ""
            }`;
      } else if (transactionType === "certificate_fee") {
        description = "Certificate Fee Payment";
      } else if (transactionType === "event_fee") {
        description = "Event Registration Payment";
      } else if (notes) {
        description = notes;
      }

      // ✅ CREATE INVOICE
      const invoice = await Invoice.create({
        user_id: userId,
        invoiceNumber,
        type: invoiceType,
        description,
        amount: parseFloat(amount),
        currency: currency || "TZS",
        status: historyStatus === "verified" ? "paid" : "partial_paid",
        paidDate: historyStatus === "verified" ? new Date() : null,
        dueDate: new Date(),
        academicYear: new Date().getFullYear().toString(),
      });

      console.log(
        `✅ Invoice created: ${invoiceNumber} - Status: ${invoice.status}`,
      );

      // ✅ CREATE PAYMENT HISTORY RECORD
      const paymentHistory = await PaymentHistory.create({
        userId,
        invoiceId: invoice._id,
        transactionType: transactionType || "registration_fee",
        amount: parseFloat(amount),
        currency: currency || "TZS",
        status: historyStatus,
        paymentDate: new Date(),
        verifiedAt: historyStatus === "verified" ? new Date() : null,
        verifiedBy: historyStatus === "verified" ? req.user.id : null,
        description,
        metadata: {
          recordedBy: req.user.username,
          recordedByRole: req.user.role,
          method: method || "manual",
          reference: reference || invoiceNumber,
          notes,
          totalRequired: actualTotalRequired,
          totalPaidBefore: totalPaid,
          totalPaidAfter: newTotal,
          remainingBalance: Math.max(0, actualTotalRequired - newTotal),
          isPartialPayment: userPaymentStatus === "partial_paid",
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get("user-agent"),
        },
        statusHistory: [
          {
            status: historyStatus,
            changedBy: req.user.id,
            changedAt: new Date(),
            reason:
              userPaymentStatus === "partial_paid"
                ? `Partial payment recorded (${amount}/${actualTotalRequired} TZS)`
                : "Full payment recorded by admin",
            notes,
          },
        ],
      });

      console.log(
        `✅ Payment history created: ${paymentHistory._id} - Status: ${historyStatus}`,
      );

      // ============================================
      // ✅ FIX: CORRECTED USER STATUS UPDATE LOGIC
      // ============================================
      if (shouldActivateUser) {
        // ✅ ACTIVATE USER (for both full and partial payments)
        user.accountStatus = "active"; // ✅ FIXED: Partial payments now activate user
        user.paymentStatus = userPaymentStatus; // "paid" or "partial_paid"
        user.isActive = true;
        user.payment_verified_by = req.user.id;
        user.payment_verified_at = new Date();
        user.payment_date = new Date();
        await user.save();

        console.log(
          `✅ User ACTIVATED: ${user.username} - Payment Status: ${userPaymentStatus}`,
        );
      } else {
        // ✅ KEEP USER INACTIVE (only for no payment)
        user.accountStatus = "inactive";
        user.paymentStatus = "no_payment";
        user.isActive = false;
        user.payment_date = new Date();
        await user.save();

        console.log(
          `⚠️ User remains INACTIVE: ${user.username} - No payment received`,
        );
      }

      // ✅ CREATE APPROPRIATE NOTIFICATION + SMS
      if (userPaymentStatus === "paid") {
        // Full payment notification
        await createNotification(
          userId,
          "Payment Verified - Account Activated! ✅",
          `Your full payment of ${currency || "TZS"} ${amount} has been recorded. Your account is now active!`,
          "success",
        );

        // 🆕 SEND CONGRATULATIONS SMS IN SWAHILI
        if (user.phoneNumber && smsService) {
          try {
            const smsMessage = `Hongera ${userName}! Malipo yako ya ${
              currency || "TZS"
            } ${amount.toLocaleString()} yametimiwa. Akaunti yako sasa ni hai. Karibu ECONNECT! 🎉`;

            const smsResult = await smsService.sendSMS(
              user.phoneNumber,
              smsMessage,
              "payment_success",
            );

            if (smsResult.success) {
              console.log(`📱 Congratulations SMS sent to ${user.phoneNumber}`);

              await SMSLog.create({
                userId,
                phone: user.phoneNumber,
                message: smsMessage,
                type: "payment_success",
                status: "sent",
                messageId: smsResult.messageId,
                reference: `payment_congrats_${userId}`,
              });
            }
          } catch (smsError) {
            console.error(
              `⚠️ SMS failed for ${user.phoneNumber}:`,
              smsError.message,
            );
          }
        }
      } else if (userPaymentStatus === "partial_paid") {
        // Partial payment notification
        const remaining = actualTotalRequired - newTotal;
        await createNotification(
          userId,
          "Partial Payment Recorded - Account Activated! 💳",
          `Your payment of ${currency || "TZS"} ${amount} has been recorded and your account is now active! Remaining balance: ${currency || "TZS"} ${remaining.toLocaleString()}. Please complete payment to avoid suspension.`,
          "warning",
        );

        // ✅ FIX: SEND SMS FOR PARTIAL PAYMENT (Swahili)
        if (user.phoneNumber && smsService) {
          try {
            const smsMessage = `Asante ${userName}! Malipo yako ya ${currency || "TZS"} ${amount.toLocaleString()} yamepokewa. Akaunti yako ni hai. Baki: ${currency || "TZS"} ${remaining.toLocaleString()}. Tafadhali maliza malipo. Asante!`;

            const smsResult = await smsService.sendSMS(
              user.phoneNumber,
              smsMessage,
              "payment_partial",
            );

            if (smsResult.success) {
              console.log(`📱 Partial payment SMS sent to ${user.phoneNumber}`);

              await SMSLog.create({
                userId,
                phone: user.phoneNumber,
                message: smsMessage,
                type: "payment_confirmation",
                status: "sent",
                messageId: smsResult.messageId,
                reference: `payment_partial_${userId}`,
              });
            }
          } catch (smsError) {
            console.error(`⚠️ Partial payment SMS failed:`, smsError.message);
          }
        }
      } else {
        // No payment notification
        await createNotification(
          userId,
          "Payment Required ⚠️",
          `Please complete your payment of ${
            currency || "TZS"
          } ${actualTotalRequired.toLocaleString()} to activate your account.`,
          "warning",
        );
      }

      // ✅ LOG ACTIVITY
      await logActivity(
        req.user.id,
        "PAYMENT_RECORDED",
        `Recorded ${userPaymentStatus} payment for ${userName}: ${
          currency || "TZS"
        } ${amount}${
          userPaymentStatus === "partial_paid"
            ? ` (${newTotal}/${actualTotalRequired})`
            : ""
        } - User ${shouldActivateUser ? "ACTIVATED" : "remains INACTIVE"}`,
        req,
        {
          userId,
          userName,
          amount: parseFloat(amount),
          currency: currency || "TZS",
          invoiceNumber,
          transactionType,
          method,
          reference,
          paymentStatus: userPaymentStatus,
          historyStatus,
          totalRequired: actualTotalRequired,
          totalPaid: newTotal,
          remainingBalance: Math.max(0, actualTotalRequired - newTotal),
          userActivated: shouldActivateUser,
          accountStatus: user.accountStatus,
        },
      );

      res.status(201).json({
        success: true,
        message:
          userPaymentStatus === "paid"
            ? "Full payment recorded successfully - User activated"
            : userPaymentStatus === "partial_paid"
              ? `Partial payment recorded - User activated with ${currency || "TZS"} ${(
                  actualTotalRequired - newTotal
                ).toLocaleString()} remaining`
              : "Payment information recorded - User remains inactive",
        data: {
          invoice,
          paymentHistory,
          user: {
            id: user._id,
            name: userName,
            accountStatus: user.accountStatus, // ✅ NEW: Return account status
            paymentStatus: user.paymentStatus, // ✅ NEW: Return payment status
            isActive: user.isActive,
          },
          paymentSummary: {
            amountPaid: parseFloat(amount),
            totalPaidBefore: totalPaid,
            totalPaidAfter: newTotal,
            totalRequired: actualTotalRequired,
            remainingBalance: Math.max(0, actualTotalRequired - newTotal),
            status: userPaymentStatus,
            historyStatus: historyStatus,
            isFullyPaid: userPaymentStatus === "paid",
            isPartiallyPaid: userPaymentStatus === "partial_paid",
            userActivated: shouldActivateUser,
          },
        },
      });
    } catch (error) {
      console.error("❌ Error recording payment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to record payment",
        ...(process.env.NODE_ENV === "development" && {
          debug: error.message,
        }),
      });
    }
  },
);

// ============================================
// BATCH PAYMENT RECORDING ENDPOINT
// ============================================

app.post(
  "/api/superadmin/payment/batch-record",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { payments, sendNotifications = true } = req.body;

      console.log(`📦 Batch payment recording request received`);

      // Validate input
      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Payments array is required and must not be empty",
        });
      }

      if (payments.length > 100) {
        return res.status(400).json({
          success: false,
          error: "Maximum 100 payments can be recorded at once",
        });
      }

      // Results tracking
      const results = {
        success: [],
        failed: [],
        skipped: [],
        stats: {
          total: payments.length,
          recorded: 0,
          failed: 0,
          skipped: 0,
          totalAmount: 0,
        },
        summary: {
          byPaymentMethod: {},
          byUserRole: {},
          invoicesCreated: 0,
          invoicesUpdated: 0,
        },
      };

      console.log(`📊 Processing ${payments.length} payment records...`);

      // Process each payment
      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        const recordNumber = i + 1;

        try {
          console.log(
            `\n📝 [${recordNumber}/${payments.length}] Processing payment for user: ${payment.userId}`,
          );

          // [... validation code remains the same ...]

          // Find the user
          const user = await User.findById(payment.userId);

          if (!user) {
            results.failed.push({
              recordNumber,
              userId: payment.userId,
              error: "User not found",
              data: payment,
            });
            results.stats.failed++;
            console.log(`❌ [${recordNumber}] User not found`);
            continue;
          }

          // [... other validation code ...]

          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;

          // ========================================
          // UPDATE USER PAYMENT INFORMATION
          // ========================================

          user.payment_date = payment.payment_date
            ? new Date(payment.payment_date)
            : new Date();
          user.updatedAt = new Date();

          await user.save();

          console.log(`✅ [${recordNumber}] Updated user payment date`);

          // ========================================
          // ✅ FIX #2: CREATE OR UPDATE INVOICE WITH "PAID" STATUS
          // ========================================

          let invoice = await Invoice.findOne({
            user_id: payment.userId,
            status: { $in: ["pending", "verification"] },
          });

          let invoiceAction = "";

          if (invoice) {
            // ✅ Update existing invoice - MARK AS PAID (admin verified)
            invoice.amount = payment.amount;
            invoice.paymentMethod = payment.payment_method;
            invoice.status = "paid"; // ✅ FIXED: Changed from "verification" to "paid"
            invoice.paidDate = new Date(); // ✅ ADDED: Set payment date
            invoice.paymentProof = {
              reference: payment.payment_reference,
              method: payment.payment_method,
              submittedAt: new Date(),
              status: "verified", // ✅ FIXED: Changed from "pending" to "verified"
              verifiedBy: req.user.id, // ✅ ADDED
              verifiedAt: new Date(), // ✅ ADDED
              notes: payment.notes || `Batch recorded by ${req.user.username}`,
            };
            invoice.updatedAt = new Date();
            await invoice.save();

            invoiceAction = "updated_verified";
            results.summary.invoicesUpdated++;

            console.log(
              `📄 [${recordNumber}] Updated invoice ${invoice._id} to PAID status`,
            );
          } else {
            // ✅ Create new invoice - MARK AS PAID (admin verified)
            const invoiceNumber = `INV-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)
              .toUpperCase()}`;

            const getRegistrationDescription = (role, regType) => {
              if (role === "student") {
                const types = {
                  normal: "Normal Registration - CTM Club",
                  premier: "Premier Registration - CTM Club (Monthly)",
                  silver: "Silver Registration - Non-CTM",
                  diamond: "Diamond Registration - Non-CTM (Monthly)",
                };
                return types[regType] || "Student Registration Fee";
              } else if (role === "entrepreneur") {
                return "Entrepreneur Registration Fee";
              } else {
                return "Non-Student Registration Fee";
              }
            };

            invoice = await Invoice.create({
              user_id: payment.userId,
              schoolId: user.schoolId,
              invoiceNumber: invoiceNumber,
              amount: payment.amount,
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              status: "paid", // ✅ FIXED: Changed from "verification" to "paid"
              paidDate: new Date(), // ✅ ADDED
              type: user.role === "student" ? "ctm_membership" : "registration",
              items: [
                {
                  description: getRegistrationDescription(
                    user.role,
                    user.registration_type,
                  ),
                  quantity: 1,
                  unitPrice: payment.amount,
                  total: payment.amount,
                },
              ],
              paymentMethod: payment.payment_method,
              paymentProof: {
                reference: payment.payment_reference,
                method: payment.payment_method,
                submittedAt: new Date(),
                status: "verified", // ✅ FIXED: Changed from "pending" to "verified"
                verifiedBy: req.user.id, // ✅ ADDED
                verifiedAt: new Date(), // ✅ ADDED
                notes:
                  payment.notes || `Batch recorded by ${req.user.username}`,
              },
            });

            invoiceAction = "created_verified";
            results.summary.invoicesCreated++;

            console.log(
              `📄 [${recordNumber}] Created invoice ${invoiceNumber} with PAID status`,
            );
          }

          // ============================================
          // ✅ FIX #3: CREATE PAYMENT HISTORY WITH "VERIFIED" STATUS
          // ============================================

          const paymentHistory = await PaymentHistory.create({
            userId: payment.userId,
            schoolId: user.schoolId,
            transactionType: "registration_fee",
            amount: payment.amount,
            paymentMethod: payment.payment_method,
            paymentReference: payment.payment_reference,
            paymentDate: payment.payment_date
              ? new Date(payment.payment_date)
              : new Date(),

            // ✅ FIXED: Admin batch imports are VERIFIED immediately (consistent with single payment)
            status: "verified", // ✅ CHANGED from "pending" to "verified"
            verifiedBy: req.user.id, // ✅ ADDED
            verifiedAt: new Date(), // ✅ ADDED

            invoiceId: invoice._id,
            notes: payment.notes || "",

            // ✅ FIXED: Status history reflects verified status
            statusHistory: [
              {
                status: "verified", // ✅ CHANGED from "pending" to "verified"
                changedBy: req.user.id,
                changedAt: new Date(),
                reason:
                  "Payment recorded and verified via batch import by admin", // ✅ UPDATED
              },
            ],

            metadata: {
              batchImport: true,
              batchRecordNumber: recordNumber,
              totalInBatch: payments.length,
              recordedByUsername: req.user.username,
              recordedByRole: req.user.role,
              verifiedImmediately: true, // ✅ ADDED flag
              ipAddress: req.ip || req.connection?.remoteAddress,
              userAgent: req.get("user-agent"),
            },
          });

          console.log(
            `💾 [${recordNumber}] Created payment history ${paymentHistory._id} with VERIFIED status`,
          );

          // ========================================
          // ✅ UPDATE USER STATUS BASED ON TOTAL PAID
          // ========================================

          // Calculate total paid including this new payment
          const totalPaid = await calculateRegistrationFeePaid(payment.userId);

          // Determine required amount
          let totalRequired = 0;
          if (user.role === "entrepreneur" || user.role === "nonstudent") {
            const packageType = user.registration_type || "silver";
            totalRequired = getEntrepreneurRegistrationFee(packageType, false);
          } else if (user.role === "student") {
            totalRequired = getStudentRegistrationFee(
              user.registration_type,
              user.institutionType,
            );
          }

          // Update user payment status
          if (totalPaid >= totalRequired && totalRequired > 0) {
            user.accountStatus = "active";
            user.paymentStatus = "paid";
            user.isActive = true;
            user.payment_verified_by = req.user.id;
            user.payment_verified_at = new Date();
            await user.save();
            console.log(
              `✅ [${recordNumber}] User activated - FULL PAYMENT (${totalPaid}/${totalRequired})`,
            );
          } else if (totalPaid > 0) {
            user.accountStatus = "active";
            user.paymentStatus = "partial_paid";
            user.isActive = true;
            user.payment_verified_by = req.user.id;
            user.payment_verified_at = new Date();
            await user.save();
            console.log(
              `✅ [${recordNumber}] User activated - PARTIAL PAYMENT (${totalPaid}/${totalRequired})`,
            );
          }

          // ========================================
          // SEND NOTIFICATION (if enabled)
          // ========================================

          // Send notification to user
          if (sendNotifications) {
            // ✅ Smart notification based on payment status
            if (user.paymentStatus === "paid") {
              await createNotification(
                payment.userId,
                "Payment Verified - Fully Paid! ✅",
                `Your payment of TZS ${payment.amount.toLocaleString()} has been verified. Your account is now fully paid and active! Reference: ${payment.payment_reference}`,
                "success",
                `/invoices/${invoice._id}`,
              );

              // ✅ FIX: SEND CONGRATULATIONS SMS FOR FULL PAYMENT (Swahili)
              if (user.phoneNumber && smsService) {
                try {
                  const smsMessage = `Hongera ${userName}! Malipo yako ya TZS ${payment.amount.toLocaleString()} yametimiwa kikamilifu. Akaunti yako sasa ni hai. Karibu ECONNECT! 🎉`;

                  const smsResult = await smsService.sendSMS(
                    user.phoneNumber,
                    smsMessage,
                    "payment_success",
                  );

                  if (smsResult.success) {
                    console.log(
                      `   📱 [${recordNumber}] SMS sent to ${user.phoneNumber} (Swahili)`,
                    );

                    await SMSLog.create({
                      userId: payment.userId,
                      phone: user.phoneNumber,
                      message: smsMessage,
                      type: "payment_success",
                      status: "sent",
                      messageId: smsResult.messageId,
                      reference: `batch_payment_success_${payment.userId}`,
                    });
                  } else {
                    console.error(
                      `   ⚠️  [${recordNumber}] SMS failed: ${smsResult.error}`,
                    );
                  }
                } catch (smsError) {
                  console.error(
                    `   ⚠️  [${recordNumber}] SMS error:`,
                    smsError.message,
                  );
                }
              }
            } else if (user.paymentStatus === "partial_paid") {
              const remaining = totalRequired - totalPaid;
              await createNotification(
                payment.userId,
                "Payment Verified - Partial Payment 💳",
                `Your payment of TZS ${payment.amount.toLocaleString()} has been verified. Remaining balance: TZS ${remaining.toLocaleString()}. Reference: ${payment.payment_reference}`,
                "warning",
                `/invoices/${invoice._id}`,
              );

              // ✅ FIX: SEND SMS FOR PARTIAL PAYMENT (Swahili)
              if (user.phoneNumber && smsService) {
                try {
                  const smsMessage = `Asante ${userName}! Malipo yako ya TZS ${payment.amount.toLocaleString()} yamepokewa. Baki: TZS ${remaining.toLocaleString()}. Tafadhali maliza malipo yako. Asante!`;

                  const smsResult = await smsService.sendSMS(
                    user.phoneNumber,
                    smsMessage,
                    "payment_partial",
                  );

                  if (smsResult.success) {
                    console.log(
                      `   📱 [${recordNumber}] Partial payment SMS sent to ${user.phoneNumber}`,
                    );

                    await SMSLog.create({
                      userId: payment.userId,
                      phone: user.phoneNumber,
                      message: smsMessage,
                      type: "payment_confirmation",
                      status: "sent",
                      messageId: smsResult.messageId,
                      reference: `batch_payment_partial_${payment.userId}`,
                    });
                  }
                } catch (smsError) {
                  console.error(
                    `   ⚠️  [${recordNumber}] Partial SMS error:`,
                    smsError.message,
                  );
                }
              }
            } else {
              await createNotification(
                payment.userId,
                "Payment Information Recorded 💳",
                `Your payment of TZS ${payment.amount.toLocaleString()} has been recorded and verified. Reference: ${payment.payment_reference}`,
                "info",
                `/invoices/${invoice._id}`,
              );
            }

            console.log(`🔔 [${recordNumber}] Notification sent to user`);
          }
          // ========================================
          // UPDATE STATS
          // ========================================

          if (!results.summary.byPaymentMethod[payment.payment_method]) {
            results.summary.byPaymentMethod[payment.payment_method] = {
              count: 0,
              totalAmount: 0,
            };
          }
          results.summary.byPaymentMethod[payment.payment_method].count++;
          results.summary.byPaymentMethod[payment.payment_method].totalAmount +=
            payment.amount;

          if (!results.summary.byUserRole[user.role]) {
            results.summary.byUserRole[user.role] = {
              count: 0,
              totalAmount: 0,
            };
          }
          results.summary.byUserRole[user.role].count++;
          results.summary.byUserRole[user.role].totalAmount += payment.amount;

          // Add to success results
          results.success.push({
            recordNumber,
            userId: payment.userId,
            username: user.username,
            name: userName,
            role: user.role,
            amount: payment.amount,
            paymentMethod: payment.payment_method,
            paymentReference: payment.payment_reference,
            invoiceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceAction: invoiceAction,
            paymentHistoryId: paymentHistory._id,
            accountStatus: user.accountStatus, // ✅ ADDED
            paymentStatus: user.paymentStatus, // ✅ ADDED
            totalPaid, // ✅ ADDED
            totalRequired, // ✅ ADDED
          });

          results.stats.recorded++;
          results.stats.totalAmount += payment.amount;

          console.log(
            `✅ [${recordNumber}] Successfully processed: ${userName} - TZS ${payment.amount.toLocaleString()} (Status: ${user.accountStatus}/${user.paymentStatus})`,
          );
        } catch (paymentError) {
          console.error(
            `❌ [${recordNumber}] Error processing payment:`,
            paymentError,
          );

          results.failed.push({
            recordNumber,
            userId: payment.userId,
            error: paymentError.message,
            data: payment,
          });
          results.stats.failed++;
        }
      }

      // ========================================
      // LOG BULK ACTIVITY
      // ========================================

      await logActivity(
        req.user.id,
        "BATCH_PAYMENT_RECORDED",
        `Batch recorded and verified ${
          results.stats.recorded
        } payments totaling TZS ${results.stats.totalAmount.toLocaleString()} (${
          results.stats.failed
        } failed, ${results.stats.skipped} skipped)`,
        req,
        {
          totalRequested: results.stats.total,
          recorded: results.stats.recorded,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          totalAmount: results.stats.totalAmount,
          byPaymentMethod: results.summary.byPaymentMethod,
          byUserRole: results.summary.byUserRole,
          invoicesCreated: results.summary.invoicesCreated,
          invoicesUpdated: results.summary.invoicesUpdated,
          recordedUserIds: results.success.map((r) => r.userId),
          failedUserIds: results.failed.map((f) => f.userId),
          skippedUserIds: results.skipped.map((s) => s.userId),
        },
      );

      console.log(`\n✅ Batch payment recording complete:`, results.stats);
      console.log(
        `💰 Total amount recorded: TZS ${results.stats.totalAmount.toLocaleString()}`,
      );

      // ========================================
      // DETERMINE RESPONSE STATUS
      // ========================================

      const allFailed =
        results.stats.recorded === 0 && results.stats.failed > 0;
      const partialSuccess =
        results.stats.recorded > 0 && results.stats.failed > 0;

      res.status(allFailed ? 500 : 200).json({
        success: results.stats.recorded > 0,
        message: allFailed
          ? "All payment recordings failed"
          : partialSuccess
            ? `Recorded and verified ${results.stats.recorded} payments. ${results.stats.failed} failed, ${results.stats.skipped} skipped.`
            : `Successfully recorded and verified ${results.stats.recorded} payment(s)`,
        data: results,
        summary: {
          total: results.stats.total,
          recorded: results.stats.recorded,
          failed: results.stats.failed,
          skipped: results.stats.skipped,
          totalAmount: results.stats.totalAmount,
          totalAmountFormatted: `TZS ${results.stats.totalAmount.toLocaleString()}`,
          invoicesCreated: results.summary.invoicesCreated,
          invoicesUpdated: results.summary.invoicesUpdated,
          byPaymentMethod: results.summary.byPaymentMethod,
          byUserRole: results.summary.byUserRole,
          successRate: `${(
            (results.stats.recorded / results.stats.total) *
            100
          ).toFixed(1)}%`,
          notificationsSent: sendNotifications,
          allVerified: true, // ✅ ADDED: Flag indicating all are verified
        },
      });
    } catch (error) {
      console.error("❌ Batch payment recording error:", error);
      res.status(500).json({
        success: false,
        error: "Batch payment recording failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// BATCH PAYMENT VALIDATION ENDPOINT (Preview) - ✅ FIXED VERSION
// ============================================

app.post(
  "/api/superadmin/payment/batch-validate",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { payments } = req.body;

      console.log(`🔍 Batch payment validation request received`);

      if (!payments || !Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Payments array is required and must not be empty",
        });
      }

      if (payments.length > 100) {
        return res.status(400).json({
          success: false,
          error: "Maximum 100 payments can be validated at once",
        });
      }

      const validationResults = {
        valid: [],
        invalid: [],
        warnings: [],
        stats: {
          total: payments.length,
          valid: 0,
          invalid: 0,
          warnings: 0,
          estimatedTotalAmount: 0,
        },
      };

      const validMethods = [
        "crdb_bank",
        "vodacom_lipa",
        "azampay",
        "tigopesa",
        "halopesa",
        "cash",
        "other",
      ];

      // ✅ FIXED: Pre-fetch all data needed ONCE before the loop
      console.log("📊 Pre-fetching validation data...");

      // Get all payment references in one query
      const allReferences = payments
        .map((p) => p.payment_reference)
        .filter((ref) => ref); // Remove undefined/null

      const existingPayments = await PaymentHistory.find({
        paymentReference: { $in: allReferences },
      }).distinct("paymentReference");

      // Convert to Set for O(1) lookup
      const existingReferencesSet = new Set(existingPayments);

      // Get all user IDs in one query
      const allUserIds = payments
        .map((p) => p.userId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

      const existingUsers = await User.find({
        _id: { $in: allUserIds },
      }).select("_id role firstName lastName username"); // ✅ REMOVED payment_reference from select

      // Create user lookup map
      const userMap = new Map();
      existingUsers.forEach((user) => {
        userMap.set(user._id.toString(), user);
      });

      console.log(
        `✅ Pre-fetch complete: ${existingReferencesSet.size} existing refs, ${userMap.size} users found`,
      );

      // ✅ NOW validate each payment (no more DB queries!)
      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        const recordNumber = i + 1;
        const errors = [];
        const warnings = [];

        // Check required fields
        if (!payment.userId) errors.push("Missing userId");
        if (!payment.amount) errors.push("Missing amount");
        if (!payment.payment_method) errors.push("Missing payment_method");
        if (!payment.payment_reference)
          errors.push("Missing payment_reference");

        // Validate amount
        if (payment.amount !== undefined && payment.amount <= 0) {
          errors.push("Amount must be greater than zero");
        }

        // Validate payment method
        if (
          payment.payment_method &&
          !validMethods.includes(payment.payment_method)
        ) {
          errors.push(
            `Invalid payment method. Must be one of: ${validMethods.join(", ")}`,
          );
        }

        // ✅ FIXED: Check user from pre-fetched map (no DB query!)
        if (payment.userId && mongoose.Types.ObjectId.isValid(payment.userId)) {
          const user = userMap.get(payment.userId);

          if (!user) {
            errors.push("User not found");
          } else {
            // Check if role is applicable
            if (
              !["student", "entrepreneur", "nonstudent"].includes(user.role)
            ) {
              warnings.push(
                `Payment recording not typically used for ${user.role} role`,
              );
            }

            // ✅ FIXED: Check duplicate payment reference from PaymentHistory only
            if (
              payment.payment_reference &&
              existingReferencesSet.has(payment.payment_reference)
            ) {
              errors.push(
                "Payment reference already exists in system - This payment may be a duplicate",
              );
            }

            // ✅ REMOVED: No longer checking user.payment_reference
            // Payment references are tracked exclusively in PaymentHistory model
          }
        } else if (payment.userId) {
          errors.push("Invalid user ID format");
        }

        // Categorize result
        if (errors.length > 0) {
          validationResults.invalid.push({
            recordNumber,
            payment,
            errors,
            warnings,
          });
          validationResults.stats.invalid++;
        } else {
          if (warnings.length > 0) {
            validationResults.warnings.push({
              recordNumber,
              payment,
              warnings,
            });
            validationResults.stats.warnings++;
          }

          validationResults.valid.push({
            recordNumber,
            payment,
            warnings,
          });
          validationResults.stats.valid++;
          validationResults.stats.estimatedTotalAmount += payment.amount || 0;
        }
      }

      console.log(
        `✅ Validation complete: ${validationResults.stats.valid} valid, ${validationResults.stats.invalid} invalid, ${validationResults.stats.warnings} warnings`,
      );

      res.json({
        success: true,
        message: `Validated ${payments.length} payment(s)`,
        canProceed: validationResults.stats.invalid === 0,
        data: validationResults,
        summary: {
          total: validationResults.stats.total,
          valid: validationResults.stats.valid,
          invalid: validationResults.stats.invalid,
          warnings: validationResults.stats.warnings,
          estimatedTotalAmount: validationResults.stats.estimatedTotalAmount,
          estimatedTotalAmountFormatted: `TZS ${validationResults.stats.estimatedTotalAmount.toLocaleString()}`,
          validationRate: `${(
            (validationResults.stats.valid / validationResults.stats.total) *
            100
          ).toFixed(1)}%`,
        },
      });
    } catch (error) {
      console.error("❌ Batch validation error:", error);
      res.status(500).json({
        success: false,
        error: "Batch validation failed",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// PAYMENT HISTORY ENDPOINT
// ============================================

// GET /api/superadmin/users/:userId/payment-history - Get user's payment history
app.get(
  "/api/superadmin/users/:userId/payment-history",
  authenticateToken,
  validateObjectId("userId"),
  authorizeRoles(
    "super_admin",
    "national_official",
    "headmaster",
    "district_official",
  ),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, status } = req.query;

      console.log(`📊 Fetching payment history for user: ${userId}`);

      // Verify user exists
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Build query
      const query = { userId };
      if (status) {
        query.status = status;
      }

      // Fetch payment history
      const paymentHistory = await PaymentHistory.find(query)
        .sort({ paymentDate: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("invoiceId", "invoice_number amount status");

      const total = await PaymentHistory.countDocuments(query);

      // Calculate total paid amount
      const totalPaid = await PaymentHistory.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            status: { $in: ["verified", "pending"] }, // ✅ Use "pending" instead
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      const totalPaidAmount = totalPaid[0]?.total || 0;

      // Get statistics
      const stats = await PaymentHistory.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      const statusStats = stats.reduce((acc, item) => {
        acc[item._id] = {
          count: item.count,
          totalAmount: item.totalAmount,
        };
        return acc;
      }, {});

      console.log(
        `✅ Found ${paymentHistory.length} payment records for user ${userId}`,
      );

      res.json({
        success: true,
        data: paymentHistory,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        summary: {
          totalPaid: totalPaidAmount,
          totalRecords: total,
          byStatus: statusStats,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching payment history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment history",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// GET PAYMENT HISTORY FOR CURRENT USER (Student/Entrepreneur Portal)
// ============================================

// GET /api/payments/my-history - Get current user's payment history
app.get(
  "/api/payments/my-history",
  authenticateToken,
  authorizeRoles("student", "entrepreneur", "nonstudent"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      console.log(
        `📊 Fetching payment history for current user: ${req.user.id}`,
      );

      // Fetch payment history
      const paymentHistory = await PaymentHistory.find({ userId: req.user.id })
        .sort({ paymentDate: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("invoiceId", "invoice_number amount status dueDate");

      const total = await PaymentHistory.countDocuments({
        userId: req.user.id,
      });

      // Calculate total paid amount
      const totalPaid = await PaymentHistory.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(req.user.id),
            status: { $in: ["verified", "pending"] }, // ✅ Use "pending" instead
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      const totalPaidAmount = totalPaid[0]?.total || 0;

      console.log(`✅ Found ${paymentHistory.length} payment records`);

      res.json({
        success: true,
        data: paymentHistory,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        summary: {
          totalPaid: totalPaidAmount,
          totalRecords: total,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching payment history:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment history",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// GET SINGLE PAYMENT RECORD DETAILS
// ============================================

// GET /api/superadmin/payments/:paymentId - Get single payment record details
app.get(
  "/api/superadmin/payments/:paymentId",
  authenticateToken,
  validateObjectId("paymentId"),
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const payment = await PaymentHistory.findById(req.params.paymentId)
        .populate(
          "userId",
          "firstName lastName email phoneNumber username role",
        )
        .populate("verifiedBy", "firstName lastName username")
        .populate("invoiceId", "invoice_number amount status dueDate paidDate")
        .populate("schoolId", "name schoolCode");

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: "Payment record not found",
        });
      }

      console.log(`✅ Retrieved payment record: ${payment._id}`);

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      console.error("❌ Error fetching payment record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch payment record",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// ✅ FIXED: UPDATE PAYMENT STATUS (Verify/Reject)
// Corrected partial payment SMS placement
// ============================================

app.patch(
  "/api/superadmin/payments/:paymentId/status",
  authenticateToken,
  validateObjectId("paymentId"),
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const { status, reason } = req.body;

      // Validate status
      const VALID_PAYMENT_STATUSES = ["pending", "verified", "rejected"];

      if (!status || !VALID_PAYMENT_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`,
          allowedStatuses: VALID_PAYMENT_STATUSES,
        });
      }

      const payment = await PaymentHistory.findById(
        req.params.paymentId,
      ).populate("userId", "firstName lastName email phoneNumber");

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: "Payment record not found",
        });
      }

      const previousStatus = payment.status;

      // Prevent changing verified payments back to pending
      if (previousStatus === "verified" && status === "pending") {
        return res.status(400).json({
          success: false,
          error:
            "Cannot change verified payment back to pending. Use 'rejected' to reverse.",
        });
      }

      // Update payment status
      payment.status = status;

      // Add to status history
      payment.statusHistory.push({
        status,
        changedBy: req.user.id,
        changedAt: new Date(),
        reason: reason || `Status changed from ${previousStatus} to ${status}`,
        previousStatus,
      });

      // ✅ VERIFIED STATUS: Update user and invoice
      if (status === "verified") {
        payment.verifiedBy = req.user.id;
        payment.verifiedAt = new Date();

        // Update user payment status
        const user = await User.findById(payment.userId._id);
        if (user) {
          // Calculate new total paid
          const totalPaid = await calculateRegistrationFeePaid(user._id);

          // Determine required amount
          let totalRequired = 0;
          if (user.role === "entrepreneur" || user.role === "nonstudent") {
            const packageType = user.registration_type || "silver";
            totalRequired = getEntrepreneurRegistrationFee(packageType, false);
          } else if (user.role === "student") {
            totalRequired = getStudentRegistrationFee(
              user.registration_type,
              user.institutionType,
            );
          }

          // Update user status based on payment
          if (totalPaid >= totalRequired && totalRequired > 0) {
            user.accountStatus = "active";
            user.paymentStatus = "paid";
            user.isActive = true;
          } else if (totalPaid > 0) {
            user.accountStatus = "active";
            user.paymentStatus = "partial_paid";
            user.isActive = true;
          }

          user.payment_verified_by = req.user.id;
          user.payment_verified_at = new Date();
          await user.save();

          console.log(
            `✅ User ${user.username} updated: ${user.accountStatus} + ${user.paymentStatus}`,
          );

          // ============================================
          // ✅ SEND SMS NOTIFICATIONS (BOTH CASES)
          // ============================================
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;

          // ✅ FULL PAYMENT SMS
          if (user.paymentStatus === "paid" && user.phoneNumber && smsService) {
            try {
              const smsMessage = `Hongera ${userName}! Malipo yako ya ${
                payment.currency || "TZS"
              } ${payment.amount.toLocaleString()} yametimiwa kikamilifu. Akaunti yako sasa ni hai. Karibu ECONNECT! 🎉`;

              const smsResult = await smsService.sendSMS(
                user.phoneNumber,
                smsMessage,
                "payment_success",
              );

              if (smsResult.success) {
                console.log(`📱 Full payment SMS sent to ${user.phoneNumber}`);

                await SMSLog.create({
                  userId: user._id,
                  phone: user.phoneNumber,
                  message: smsMessage,
                  type: "payment_success",
                  status: "sent",
                  messageId: smsResult.messageId,
                  reference: `payment_verified_full_${user._id}`,
                });
              }
            } catch (smsError) {
              console.error(
                `⚠️ Full payment SMS failed for ${user.phoneNumber}:`,
                smsError.message,
              );
            }
          }

          // ✅ PARTIAL PAYMENT SMS (NOW INSIDE THE CORRECT BLOCK!)
          if (
            user.paymentStatus === "partial_paid" &&
            user.phoneNumber &&
            smsService
          ) {
            try {
              // Calculate remaining balance
              const remaining = totalRequired - totalPaid;

              const smsMessage = `Asante ${userName}! Malipo yako ya ${payment.currency || "TZS"} ${payment.amount.toLocaleString()} yamethibitishwa. Akaunti yako ni hai. Baki: ${payment.currency || "TZS"} ${remaining.toLocaleString()}. Asante!`;

              const smsResult = await smsService.sendSMS(
                user.phoneNumber,
                smsMessage,
                "payment_partial",
              );

              if (smsResult.success) {
                console.log(
                  `📱 Partial payment SMS sent to ${user.phoneNumber}`,
                );

                await SMSLog.create({
                  userId: user._id,
                  phone: user.phoneNumber,
                  message: smsMessage,
                  type: "payment_confirmation",
                  status: "sent",
                  messageId: smsResult.messageId,
                  reference: `payment_verified_partial_${user._id}`,
                });
              }
            } catch (smsError) {
              console.error(
                `⚠️ Partial payment SMS failed for ${user.phoneNumber}:`,
                smsError.message,
              );
            }
          }
        }

        // Update invoice if exists
        if (payment.invoiceId) {
          await Invoice.findByIdAndUpdate(payment.invoiceId, {
            status: "paid",
            paidDate: new Date(),
            "paymentProof.status": "verified",
            "paymentProof.verifiedBy": req.user.id,
            "paymentProof.verifiedAt": new Date(),
          });
          console.log(`✅ Invoice ${payment.invoiceId} marked as paid`);
        }
      }

      // ✅ REJECTED STATUS: Update invoice
      if (status === "rejected") {
        if (payment.invoiceId) {
          await Invoice.findByIdAndUpdate(payment.invoiceId, {
            status: "pending",
            "paymentProof.status": "rejected",
            "paymentProof.verifiedBy": req.user.id,
            "paymentProof.verifiedAt": new Date(),
          });
          console.log(
            `✅ Invoice ${payment.invoiceId} marked as pending (payment rejected)`,
          );
        }
      }

      await payment.save();

      // Send notification to user
      const userName = `${payment.userId.firstName || ""} ${
        payment.userId.lastName || ""
      }`.trim();

      if (status === "verified") {
        await createNotification(
          payment.userId._id,
          "Payment Verified ✅",
          `Your payment of ${payment.currency || "TZS"} ${payment.amount.toLocaleString()} has been verified and approved.`,
          "success",
          `/payments`,
        );
      } else if (status === "rejected") {
        await createNotification(
          payment.userId._id,
          "Payment Rejected ❌",
          `Your payment of ${payment.currency || "TZS"} ${payment.amount.toLocaleString()} has been rejected. ${
            reason || "Please contact support for details."
          }`,
          "error",
          `/payments`,
        );
      } else if (status === "pending") {
        await createNotification(
          payment.userId._id,
          "Payment Status Updated",
          `Your payment status has been changed to pending for review.`,
          "info",
          `/payments`,
        );
      }

      // Log activity
      await logActivity(
        req.user.id,
        "PAYMENT_STATUS_UPDATED",
        `Updated payment status from ${previousStatus} to ${status} for ${userName}`,
        req,
        {
          paymentId: payment._id,
          userId: payment.userId._id,
          previousStatus,
          newStatus: status,
          amount: payment.amount,
          reason: reason || "",
        },
      );

      console.log(
        `✅ Payment status updated: ${payment._id} (${previousStatus} → ${status})`,
      );

      res.json({
        success: true,
        message: `Payment ${status} successfully`,
        data: payment,
      });
    } catch (error) {
      console.error("❌ Error updating payment status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update payment status",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// GENERATE PAYMENT RECEIPT
// ============================================

// GET /api/superadmin/payments/:paymentId/receipt - Generate payment receipt
app.get(
  "/api/superadmin/payments/:paymentId/receipt",
  authenticateToken,
  validateObjectId("paymentId"),
  async (req, res) => {
    try {
      const payment = await PaymentHistory.findById(req.params.paymentId)
        .populate(
          "userId",
          "firstName lastName email phoneNumber username studentId",
        )
        .populate("verifiedBy", "firstName lastName username")
        .populate("invoiceId", "invoice_number amount status dueDate paidDate")
        .populate("schoolId", "name schoolCode logo address");

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: "Payment record not found",
        });
      }

      // Generate receipt data
      const receiptData = {
        receiptNumber: `RCP-${payment._id.toString().slice(-8).toUpperCase()}`,
        paymentId: payment._id,
        issueDate: new Date(),

        // User details
        payer: {
          name:
            `${payment.userId.firstName || ""} ${
              payment.userId.lastName || ""
            }`.trim() || payment.userId.username,
          email: payment.userId.email,
          phone: payment.userId.phoneNumber,
          studentId: payment.userId.studentId || "N/A",
        },

        // School details (if applicable)
        school: payment.schoolId
          ? {
              name: payment.schoolId.name,
              code: payment.schoolId.schoolCode,
              logo: payment.schoolId.logo,
              address: payment.schoolId.address,
            }
          : null,

        // Payment details
        payment: {
          amount: payment.amount,
          currency: payment.currency || "TZS",
          paymentMethod: payment.paymentMethod,
          paymentReference: payment.paymentReference,
          paymentDate: payment.paymentDate,
          status: payment.status,
          notes: payment.notes,
        },

        // Invoice details (if linked)
        invoice: payment.invoiceId
          ? {
              number: payment.invoiceId.invoice_number,
              amount: payment.invoiceId.amount,
              status: payment.invoiceId.status,
              dueDate: payment.invoiceId.dueDate,
              paidDate: payment.invoiceId.paidDate,
            }
          : null,

        // Verification details
        verification: {
          verifiedBy: payment.verifiedBy
            ? `${payment.verifiedBy.firstName || ""} ${
                payment.verifiedBy.lastName || ""
              }`.trim() || payment.verifiedBy.username
            : null,
          verifiedAt: payment.verifiedAt,
          recordedBy: payment.recordedBy
            ? `${payment.recordedBy.firstName || ""} ${
                payment.recordedBy.lastName || ""
              }`.trim() || payment.recordedBy.username
            : null,
        },

        // System details
        system: {
          name: "ECONNECT Multi-School & Talent Management System",
          generatedAt: new Date(),
          generatedBy:
            `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
            req.user.username,
        },
      };

      // Log activity
      await logActivity(
        req.user.id,
        "RECEIPT_GENERATED",
        `Generated receipt for payment ${payment._id}`,
        req,
        {
          paymentId: payment._id,
          receiptNumber: receiptData.receiptNumber,
          amount: payment.amount,
          userId: payment.userId._id,
        },
      );

      console.log(`✅ Generated receipt: ${receiptData.receiptNumber}`);

      res.json({
        success: true,
        data: receiptData,
      });
    } catch (error) {
      console.error("❌ Error generating receipt:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate receipt",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// DOWNLOAD RECEIPT AS PDF (Student/Admin)
// ============================================

// GET /api/payments/:paymentId/receipt/download - Download receipt as PDF
app.get(
  "/api/payments/:paymentId/receipt/download",
  authenticateToken,
  validateObjectId("paymentId"),
  async (req, res) => {
    try {
      const payment = await PaymentHistory.findById(req.params.paymentId)
        .populate("userId", "firstName lastName email phoneNumber username")
        .populate("verifiedBy", "firstName lastName username")
        .populate("schoolId", "name schoolCode logo");

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: "Payment record not found",
        });
      }

      // Check permissions - user can only download their own receipt
      if (
        req.user.role !== "super_admin" &&
        req.user.role !== "national_official" &&
        req.user.role !== "headmaster" &&
        payment.userId._id.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          error: "You can only download your own payment receipts",
        });
      }

      // In a real implementation, you would generate a PDF here
      // For now, return receipt data that frontend can use
      const receiptNumber = `RCP-${payment._id
        .toString()
        .slice(-8)
        .toUpperCase()}`;

      console.log(`✅ Receipt download requested: ${receiptNumber}`);

      res.json({
        success: true,
        message: "Receipt data retrieved successfully",
        data: {
          receiptNumber,
          paymentId: payment._id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          paymentReference: payment.paymentReference,
          paymentDate: payment.paymentDate,
          status: payment.status,
          payer: {
            name: `${payment.userId.firstName || ""} ${
              payment.userId.lastName || ""
            }`.trim(),
            email: payment.userId.email,
            phone: payment.userId.phoneNumber,
          },
          school: payment.schoolId
            ? {
                name: payment.schoolId.name,
                code: payment.schoolId.schoolCode,
              }
            : null,
          generatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error("❌ Error downloading receipt:", error);
      res.status(500).json({
        success: false,
        error: "Failed to download receipt",
        ...(process.env.NODE_ENV === "development" && {
          debug: sanitizeError(error),
        }),
      });
    }
  },
);

// ============================================
// 🧪 TEST ENDPOINT (Optional - for verification)
// ============================================
//
// This endpoint lets you check indexes without modifying them
// Safe to call anytime
//

app.get(
  "/api/superadmin/migrate/check-indexes",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const PaymentHistory = mongoose.model("PaymentHistory");
      const collection = PaymentHistory.collection;

      const indexes = await collection.indexes();

      const invoiceIdIndexes = indexes.filter(
        (idx) => idx.key && idx.key.invoiceId !== undefined,
      );

      const indexList = indexes.map((idx) => ({
        name: idx.name,
        keys: idx.key,
        unique: idx.unique || false,
        sparse: idx.sparse || false,
      }));

      res.json({
        success: true,
        totalIndexes: indexes.length,
        invoiceIdIndexCount: invoiceIdIndexes.length,
        status:
          invoiceIdIndexes.length === 1
            ? "✅ Healthy - One invoiceId index"
            : invoiceIdIndexes.length > 1
              ? "⚠️  Warning - Multiple invoiceId indexes"
              : "⚠️  Warning - No invoiceId index",
        indexes: indexList,
        invoiceIdIndexes: invoiceIdIndexes.map((idx) => ({
          name: idx.name,
          keys: idx.key,
        })),
      });
    } catch (error) {
      console.error("❌ Error checking indexes:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check indexes",
        message: error.message,
      });
    }
  },
);

// ============================================
// FAILED JOBS MANAGEMENT ENDPOINTS
// ============================================

// GET Failed Jobs List
app.get(
  "/api/superadmin/failed-jobs",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status, jobType } = req.query;

      const query = {};
      if (status) query.status = status;
      if (jobType) query.jobType = jobType;

      const failedJobs = await FailedJob.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("resolvedBy", "firstName lastName username");

      const total = await FailedJob.countDocuments(query);

      // Get summary stats
      const summary = await jobRetryService.getFailedJobsSummary();

      res.json({
        success: true,
        data: failedJobs,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        summary,
      });
    } catch (error) {
      console.error("❌ Error fetching failed jobs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch failed jobs",
      });
    }
  },
);

// POST Manual Retry Single Job
app.post(
  "/api/superadmin/failed-jobs/:jobId/retry",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const failedJob = await FailedJob.findById(req.params.jobId);

      if (!failedJob) {
        return res.status(404).json({
          success: false,
          error: "Failed job not found",
        });
      }

      if (failedJob.status === "resolved") {
        return res.status(400).json({
          success: false,
          error: "Job already resolved",
        });
      }

      console.log(`🔄 Manual retry requested for job: ${failedJob._id}`);

      // Force retry immediately
      failedJob.nextRetryAt = new Date();
      failedJob.status = "pending";
      await failedJob.save();

      // Trigger retry
      const retryResults = await jobRetryService.retryFailedJobs();

      await logActivity(
        req.user.id,
        "FAILED_JOB_MANUAL_RETRY",
        `Manually retried failed job: ${failedJob.jobType}`,
        req,
        { jobId: failedJob._id, results: retryResults },
      );

      res.json({
        success: true,
        message: "Job retry initiated",
        data: retryResults,
      });
    } catch (error) {
      console.error("❌ Error retrying job:", error);
      res.status(500).json({
        success: false,
        error: "Failed to retry job",
      });
    }
  },
);

// DELETE Dismiss Failed Job
app.delete(
  "/api/superadmin/failed-jobs/:jobId",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { resolution } = req.body;

      const failedJob = await FailedJob.findById(req.params.jobId);

      if (!failedJob) {
        return res.status(404).json({
          success: false,
          error: "Failed job not found",
        });
      }

      failedJob.status = "resolved";
      failedJob.resolvedBy = req.user.id;
      failedJob.resolvedAt = new Date();
      failedJob.resolution = resolution || "Manually dismissed by admin";
      await failedJob.save();

      await logActivity(
        req.user.id,
        "FAILED_JOB_DISMISSED",
        `Dismissed failed job: ${failedJob.jobType}`,
        req,
        { jobId: failedJob._id, resolution: failedJob.resolution },
      );

      res.json({
        success: true,
        message: "Failed job dismissed",
        data: failedJob,
      });
    } catch (error) {
      console.error("❌ Error dismissing failed job:", error);
      res.status(500).json({
        success: false,
        error: "Failed to dismiss job",
      });
    }
  },
);

// ============================================
// 🛡️ APPLY ERROR HANDLERS (MUST BE LAST!)
// ============================================

console.log("\n🛡️ ========================================");
console.log("🛡️  APPLYING ERROR HANDLERS");
console.log("🛡️ ========================================\n");

// Apply error handling middleware from /middleware/errorHandler.js
applyErrorHandlers(app);

console.log("✅ Error handlers applied successfully!\n");

// ============================================
// AUTOMATED PAYMENT REMINDER CRON JOB
// ============================================

// ✅ Only run cron jobs in production
if (process.env.NODE_ENV === "production") {
  // Schedule task to run daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("🕐 Running automated payment reminder job...");

    try {
      const result = await sendBulkPaymentReminders();
      console.log(`✅ Automated reminders completed: ${result.sentCount} sent`);
    } catch (error) {
      console.error("❌ Automated reminder job failed:", error);

      // ✅ Notify SuperAdmin of failure
      try {
        const superAdmins = await User.find({ role: "super_admin" }).distinct(
          "_id",
        );
        await Promise.all(
          superAdmins.map((adminId) =>
            createNotification(
              adminId,
              "Payment Reminder Job Failed",
              `Automated payment reminders failed: ${error.message}`,
              "error",
            ),
          ),
        );
      } catch (notifError) {
        console.error("❌ Failed to send error notification:", notifError);
      }
    }
  });

  console.log("✅ Payment reminder cron job scheduled (daily at 9:00 AM)");
} else {
  console.log("ℹ️  Cron jobs disabled (not in production environment)");
}

if (process.env.NODE_ENV === "production") {
  // ============================================
  // ✅ CORRECTED: OVERDUE PAYMENT CHECKER - Runs daily at midnight
  // ============================================

  cron.schedule("0 0 * * *", async () => {
    console.log("\n🕐 ========================================");
    console.log("🕐  RUNNING OVERDUE PAYMENT CHECK");
    console.log("🕐 ========================================\n");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueInvoices = await Invoice.find({
        status: { $in: ["pending", "partial_paid"] },
        dueDate: { $lt: today },
      }).populate(
        "user_id",
        "firstName lastName username phoneNumber accountStatus paymentStatus",
      );

      console.log(`📊 Found ${overdueInvoices.length} overdue invoices`);

      let suspendedCount = 0;
      let notificationsSent = 0;
      const errors = [];

      const userInvoicesMap = new Map();
      overdueInvoices.forEach((invoice) => {
        const userId = invoice.user_id._id.toString();
        if (!userInvoicesMap.has(userId)) {
          userInvoicesMap.set(userId, {
            user: invoice.user_id,
            invoices: [],
          });
        }
        userInvoicesMap.get(userId).invoices.push(invoice);
      });

      console.log(
        `👥 Overdue invoices belong to ${userInvoicesMap.size} users`,
      );

      for (const [userId, { user, invoices }] of userInvoicesMap) {
        try {
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;

          if (
            user.accountStatus === "suspended" &&
            user.paymentStatus === "overdue"
          ) {
            console.log(`⏭️  Skipping ${userName} - already suspended/overdue`);
            continue;
          }

          const totalOverdue = invoices.reduce(
            (sum, inv) => sum + inv.amount,
            0,
          );

          const oldestInvoice = invoices.sort(
            (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
          )[0];
          const daysOverdue = Math.floor(
            (today - new Date(oldestInvoice.dueDate)) / (1000 * 60 * 60 * 24),
          );

          console.log(`\n⚠️  Processing overdue user: ${userName}`);
          console.log(`   - Overdue invoices: ${invoices.length}`);
          console.log(
            `   - Total overdue: TZS ${totalOverdue.toLocaleString()}`,
          );
          console.log(`   - Days overdue: ${daysOverdue}`);
          console.log(`   - Current account status: ${user.accountStatus}`);
          console.log(`   - Current payment status: ${user.paymentStatus}`);

          const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
              accountStatus: "suspended",
              paymentStatus: "overdue",
              isActive: false,
              updatedAt: new Date(),
            },
            { new: true },
          );

          suspendedCount++;
          console.log(
            `   ✅ User suspended: ${userName} (Suspended + Overdue)`,
          );

          // Update invoices
          const invoiceIds = invoices.map((inv) => inv._id);

          try {
            const updateResult = await Invoice.updateMany(
              {
                _id: { $in: invoiceIds },
                status: { $in: ["pending", "partial_paid", "verification"] },
              },
              {
                status: "overdue",
                updatedAt: new Date(),
                metadata: {
                  ...invoices[0].metadata,
                  overdueSetAt: new Date(),
                  overdueSetBy: "system_cron",
                  daysOverdue: daysOverdue,
                },
              },
            );

            console.log(
              `   ✅ Updated ${updateResult.modifiedCount} invoices to overdue status`,
            );
          } catch (invoiceUpdateError) {
            console.error(
              `   ❌ Failed to update invoices:`,
              invoiceUpdateError.message,
            );
            errors.push({
              userId,
              userName,
              error: `Invoice update failed: ${invoiceUpdateError.message}`,
            });
          }

          // Send in-app notification
          try {
            await createNotification(
              userId,
              "Malipo Yaliyochelewa - Akaunti Imesimamishwa 🚫",
              `Malipo yako yamechelewa kwa siku ${daysOverdue} (TZS ${totalOverdue.toLocaleString()}). Akaunti yako imesimamishwa. Tafadhali maliza malipo yako mara moja ili kuruhusu tena akaunti yako.`,
              "error",
              "/payments",
            );

            notificationsSent++;
            console.log(`   ✅ Notification sent to ${userName}`);
          } catch (notifError) {
            console.error(
              `   ❌ Failed to send notification to ${userName}:`,
              notifError.message,
            );
            errors.push({
              userId,
              userName,
              error: `Notification failed: ${notifError.message}`,
            });
          }

          // ============================================
          // ✅ FIX #5: SMS IN SWAHILI (CONSISTENT)
          // ============================================
          if (user.phoneNumber && smsService) {
            try {
              // ✅ SWAHILI VERSION (matching success SMS language)
              const smsMessage = `Samahani ${userName}! Akaunti yako ya ECONNECT imesimamishwa kwa sababu ya malipo yaliyochelewa (siku ${daysOverdue}, TZS ${totalOverdue.toLocaleString()}). Tafadhali lipa mara moja ili kuruhusu tena akaunti yako. Asante!`;

              const smsResult = await smsService.sendSMS(
                user.phoneNumber,
                smsMessage,
                "overdue_suspension",
              );

              if (smsResult.success) {
                console.log(`   📱 SMS sent to ${user.phoneNumber} (Swahili)`);

                await SMSLog.create({
                  userId,
                  phone: user.phoneNumber,
                  message: smsMessage,
                  type: "overdue_suspension",
                  status: "sent",
                  messageId: smsResult.messageId,
                  reference: `overdue_${userId}`,
                });
              }
            } catch (smsError) {
              console.error(
                `   ⚠️  SMS failed for ${user.phoneNumber}:`,
                smsError.message,
              );
            }
          }
        } catch (userError) {
          console.error(`❌ Error processing user ${userId}:`, userError);
          errors.push({
            userId,
            error: userError.message,
          });
        }
      }

      // ✅ Log summary
      console.log("\n✅ ========================================");
      console.log("✅  OVERDUE CHECK COMPLETE");
      console.log("✅ ========================================");
      console.log(`📊 Total overdue invoices: ${overdueInvoices.length}`);
      console.log(`👥 Users affected: ${userInvoicesMap.size}`);
      console.log(`🚫 Users suspended: ${suspendedCount}`);
      console.log(`🔔 Notifications sent: ${notificationsSent}`);
      console.log(`❌ Errors: ${errors.length}`);
      console.log("========================================\n");

      // ✅ Notify super admins of completion
      try {
        const superAdmins = await User.find({ role: "super_admin" }).distinct(
          "_id",
        );

        const summary = `Overdue Payment Check Complete:\n- ${overdueInvoices.length} overdue invoices\n- ${suspendedCount} users suspended\n- ${notificationsSent} notifications sent\n- ${errors.length} errors`;

        await Promise.all(
          superAdmins.map((adminId) =>
            createNotification(
              adminId,
              "Overdue Payment Check Completed",
              summary,
              errors.length > 0 ? "warning" : "info",
            ),
          ),
        );
      } catch (notifError) {
        console.error("❌ Failed to notify super admins:", notifError);
      }

      // ✅ Log activity for audit trail
      if (suspendedCount > 0) {
        await ActivityLog.create({
          userId: null, // System activity
          action: "OVERDUE_PAYMENT_CHECK",
          description: `Suspended ${suspendedCount} users for overdue payments`,
          metadata: {
            totalInvoices: overdueInvoices.length,
            usersAffected: userInvoicesMap.size,
            suspended: suspendedCount,
            notificationsSent,
            errors: errors.length,
            errorDetails: errors,
          },
          ipAddress: "system",
          userAgent: "cron-job",
        });
      }
    } catch (error) {
      console.error("\n❌ ========================================");
      console.error("❌  OVERDUE CHECK FAILED");
      console.error("❌ ========================================");
      console.error(error);
      console.error("========================================\n");

      // ✅ Notify SuperAdmin of failure
      try {
        const superAdmins = await User.find({ role: "super_admin" }).distinct(
          "_id",
        );
        await Promise.all(
          superAdmins.map((adminId) =>
            createNotification(
              adminId,
              "Overdue Payment Check Failed ❌",
              `Automated overdue payment check failed: ${error.message}`,
              "error",
            ),
          ),
        );
      } catch (notifError) {
        console.error("❌ Failed to send error notification:", notifError);
      }
    }
  });

  console.log("✅ Overdue payment checker scheduled (daily at midnight)");

  // ============================================
  // ✅ OPTIONAL: OVERDUE WARNING - Runs daily at 9 AM
  // Sends 7-day warning before suspension
  // ============================================
  cron.schedule("0 9 * * *", async () => {
    console.log("\n📧 Running overdue warning check (7-day notice)...");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);

      // Find invoices due within 7 days
      const upcomingDueInvoices = await Invoice.find({
        status: { $in: ["pending", "partial_paid"] },
        dueDate: { $gte: today, $lte: sevenDaysFromNow },
      }).populate("user_id", "firstName lastName username phoneNumber");

      console.log(
        `📊 Found ${upcomingDueInvoices.length} invoices due within 7 days`,
      );

      let warningsSent = 0;

      // Group by user
      const userInvoicesMap = new Map();
      upcomingDueInvoices.forEach((invoice) => {
        const userId = invoice.user_id._id.toString();
        if (!userInvoicesMap.has(userId)) {
          userInvoicesMap.set(userId, {
            user: invoice.user_id,
            invoices: [],
          });
        }
        userInvoicesMap.get(userId).invoices.push(invoice);
      });

      for (const [userId, { user, invoices }] of userInvoicesMap) {
        try {
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;
          const nearestInvoice = invoices.sort(
            (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
          )[0];
          const daysRemaining = Math.ceil(
            (new Date(nearestInvoice.dueDate) - today) / (1000 * 60 * 60 * 24),
          );
          const totalDue = invoices.reduce((sum, inv) => sum + inv.amount, 0);

          // Send warning notification
          await createNotification(
            userId,
            "Payment Due Soon - Action Required ⚠️",
            `Your payment of TZS ${totalDue.toLocaleString()} is due in ${daysRemaining} days. Please complete your payment to avoid account suspension.`,
            "warning",
            "/payments",
          );

          warningsSent++;
          console.log(
            `📧 Warning sent to ${userName} (${daysRemaining} days remaining)`,
          );
        } catch (userError) {
          console.error(`❌ Error warning user:`, userError);
        }
      }

      console.log(`✅ Overdue warnings complete: ${warningsSent} sent\n`);
    } catch (error) {
      console.error("❌ Overdue warning check failed:", error);
    }
  });

  console.log("✅ Overdue warning checker scheduled (daily at 9 AM)");
}

if (process.env.NODE_ENV === "production") {
  // ============================================
  // ✅ MONTHLY BILLING - Runs on 1st of every month at 1 AM
  // ============================================
  cron.schedule("0 1 1 * *", async () => {
    console.log("\n💰 ========================================");
    console.log("💰  RUNNING MONTHLY BILLING SERVICE");
    console.log("💰 ========================================\n");

    const startTime = new Date();
    console.log(`🕐 Started at: ${startTime.toISOString()}`);

    try {
      // Execute monthly billing service
      const result = await monthlyBillingService.processMonthlyBilling();

      const endTime = new Date();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log("\n✅ ========================================");
      console.log("✅  MONTHLY BILLING COMPLETE");
      console.log("✅ ========================================");
      console.log(`📊 Duration: ${duration} seconds`);
      console.log(`📊 Total Processed: ${result.totalProcessed}`);
      console.log(`✅ Success: ${result.successCount}`);
      console.log(`❌ Failures: ${result.failureCount}`);
      console.log(`⏭️  Skipped: ${result.skippedCount}`);
      console.log(
        `💰 Total Amount: TZS ${result.totalAmount.toLocaleString()}`,
      );
      console.log("========================================\n");

      // ✅ Notify super admins of completion
      try {
        const superAdmins = await User.find({ role: "super_admin" }).distinct(
          "_id",
        );

        const summary =
          `Monthly Billing Complete (${new Date().toLocaleDateString()}):\n` +
          `✅ Processed: ${result.totalProcessed} subscriptions\n` +
          `✅ Success: ${result.successCount}\n` +
          `❌ Failures: ${result.failureCount}\n` +
          `⏭️  Skipped: ${result.skippedCount}\n` +
          `💰 Total Billed: TZS ${result.totalAmount.toLocaleString()}\n` +
          `⏱️  Duration: ${duration}s`;

        await Promise.all(
          superAdmins.map((adminId) =>
            createNotification(
              adminId,
              result.failureCount > 0
                ? "Monthly Billing Completed with Errors ⚠️"
                : "Monthly Billing Completed Successfully ✅",
              summary,
              result.failureCount > 0 ? "warning" : "success",
              "/admin/analytics",
            ),
          ),
        );

        console.log(
          `🔔 Notified ${superAdmins.length} super admin(s) of completion`,
        );
      } catch (notifError) {
        console.error("❌ Failed to notify super admins:", notifError);
      }

      // ✅ Log activity for audit trail
      await ActivityLog.create({
        userId: null, // System activity
        action: "MONTHLY_BILLING_PROCESSED",
        description: `Monthly billing processed for ${result.successCount} subscriptions`,
        metadata: {
          totalProcessed: result.totalProcessed,
          successCount: result.successCount,
          failureCount: result.failureCount,
          skippedCount: result.skippedCount,
          totalAmount: result.totalAmount,
          duration: duration,
          executionDate: startTime,
          students: result.students || {},
          entrepreneurs: result.entrepreneurs || {},
          failures: result.failures || [],
        },
        ipAddress: "system",
        userAgent: "cron-job-monthly-billing",
      });

      console.log("✅ Activity logged for audit trail\n");

      // ✅ If there are failures, create a detailed report
      if (
        result.failureCount > 0 &&
        result.failures &&
        result.failures.length > 0
      ) {
        console.log("\n⚠️  FAILURES DETECTED - Creating detailed report...");

        // Group failures by reason
        const failuresByReason = {};
        result.failures.forEach((failure) => {
          const reason = failure.reason || "Unknown";
          if (!failuresByReason[reason]) {
            failuresByReason[reason] = [];
          }
          failuresByReason[reason].push(failure);
        });

        console.log("\n📋 FAILURE BREAKDOWN:");
        Object.entries(failuresByReason).forEach(([reason, failures]) => {
          console.log(`   ❌ ${reason}: ${failures.length} users`);
        });

        // Notify super admins with detailed failure list
        try {
          const superAdmins = await User.find({ role: "super_admin" }).distinct(
            "_id",
          );

          let failureDetails = "Monthly Billing Failures:\n\n";
          Object.entries(failuresByReason).forEach(([reason, failures]) => {
            failureDetails += `${reason} (${failures.length}):\n`;
            failures.slice(0, 5).forEach((f) => {
              failureDetails += `- ${f.userName || f.userId}\n`;
            });
            if (failures.length > 5) {
              failureDetails += `... and ${failures.length - 5} more\n`;
            }
            failureDetails += "\n";
          });

          await Promise.all(
            superAdmins.map((adminId) =>
              createNotification(
                adminId,
                `Monthly Billing - ${result.failureCount} Failures Require Attention ⚠️`,
                failureDetails,
                "error",
                "/admin/failed-jobs",
              ),
            ),
          );
        } catch (notifError) {
          console.error("❌ Failed to send failure notifications:", notifError);
        }
      }
    } catch (error) {
      console.error("\n❌ ========================================");
      console.error("❌  MONTHLY BILLING FAILED");
      console.error("❌ ========================================");
      console.error("❌ Error:", error.message);
      console.error("❌ Stack:", error.stack);
      console.error("========================================\n");

      // ✅ Notify SuperAdmin of critical failure
      try {
        const superAdmins = await User.find({ role: "super_admin" }).distinct(
          "_id",
        );

        const errorMessage =
          `CRITICAL: Monthly Billing Failed!\n\n` +
          `Error: ${error.message}\n` +
          `Time: ${new Date().toISOString()}\n\n` +
          `Immediate action required. Please check logs and retry manually if needed.`;

        await Promise.all(
          superAdmins.map((adminId) =>
            createNotification(
              adminId,
              "🚨 Monthly Billing System Failure",
              errorMessage,
              "error",
              "/admin/analytics",
            ),
          ),
        );

        console.log("🔔 Critical error notification sent to super admins");
      } catch (notifError) {
        console.error("❌ Failed to send error notification:", notifError);
      }

      // ✅ Log critical error
      try {
        await ActivityLog.create({
          userId: null,
          action: "MONTHLY_BILLING_FAILED",
          description: `Monthly billing failed: ${error.message}`,
          metadata: {
            error: error.message,
            stack: error.stack,
            executionDate: startTime,
          },
          ipAddress: "system",
          userAgent: "cron-job-monthly-billing",
        });
      } catch (logError) {
        console.error("❌ Failed to log error:", logError);
      }

      // ✅ Create failed job record for retry
      try {
        await FailedJob.create({
          jobType: "monthly_billing",
          jobData: {
            scheduledDate: startTime,
            month: startTime.getMonth() + 1,
            year: startTime.getFullYear(),
          },
          error: error.message,
          stackTrace: error.stack,
          attemptCount: 1,
          maxRetries: 3,
          nextRetryAt: new Date(Date.now() + 60 * 60 * 1000), // Retry in 1 hour
          status: "pending",
        });

        console.log("📝 Failed job record created for retry");
      } catch (failedJobError) {
        console.error("❌ Failed to create failed job record:", failedJobError);
      }
    }
  });

  console.log(
    "✅ Monthly billing cron job scheduled (1st of every month at 1 AM)",
  );

  // ============================================
  // ✅ OPTIONAL: MONTHLY BILLING REMINDER
  // Runs on the 25th of every month at 10 AM
  // Reminds users with monthly subscriptions about upcoming billing
  // ============================================
  cron.schedule("0 10 25 * *", async () => {
    console.log("\n📧 Running monthly billing reminder (upcoming charges)...");

    try {
      const today = new Date();
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      // Find users with monthly subscriptions
      const monthlyUsers = await User.find({
        registration_type: { $in: ["premier", "diamond", "gold", "platinum"] },
        accountStatus: "active",
        paymentStatus: { $in: ["paid", "partial_paid"] },
      }).select(
        "_id firstName lastName username phoneNumber registration_type role",
      );

      console.log(
        `📊 Found ${monthlyUsers.length} users with monthly subscriptions`,
      );

      let remindersSent = 0;
      const errors = [];

      for (const user of monthlyUsers) {
        try {
          const userName =
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.username;

          // Get monthly fee amount
          let monthlyFee = 0;
          if (user.role === "student") {
            if (user.registration_type === "premier") {
              monthlyFee = 70000;
            } else if (user.registration_type === "diamond") {
              monthlyFee = 55000;
            }
          } else if (user.role === "entrepreneur") {
            const packagePricing = getEntrepreneurMonthlyFee(
              user.registration_type,
            );
            monthlyFee = packagePricing || 0;
          }

          if (monthlyFee === 0) {
            console.log(`⏭️  Skipping ${userName} - no monthly fee`);
            continue;
          }

          // Send reminder notification
          await createNotification(
            user._id,
            "Monthly Subscription Reminder 📅",
            `Your monthly subscription of TZS ${monthlyFee.toLocaleString()} will be billed on ${nextMonth.toLocaleDateString()}. Please ensure your account is in good standing.`,
            "info",
            "/payments",
          );

          remindersSent++;
          console.log(
            `📧 Reminder sent to ${userName} (TZS ${monthlyFee.toLocaleString()})`,
          );

          // Optional: Send SMS reminder
          if (user.phoneNumber && smsService) {
            try {
              const smsMessage = `Hello ${userName}! Your ECONNECT monthly subscription (TZS ${monthlyFee.toLocaleString()}) will be billed on ${nextMonth.toLocaleDateString()}. Thank you!`;

              await smsService.sendSMS(
                user.phoneNumber,
                smsMessage,
                "billing_reminder",
              );

              console.log(`   📱 SMS sent to ${user.phoneNumber}`);
            } catch (smsError) {
              console.error(
                `   ⚠️  SMS failed for ${user.phoneNumber}:`,
                smsError.message,
              );
            }
          }
        } catch (userError) {
          console.error(`❌ Error reminding user ${user._id}:`, userError);
          errors.push({
            userId: user._id,
            error: userError.message,
          });
        }
      }

      console.log(
        `\n✅ Monthly billing reminders complete: ${remindersSent} sent`,
      );
      if (errors.length > 0) {
        console.log(`⚠️  Errors: ${errors.length}`);
      }
    } catch (error) {
      console.error("❌ Monthly billing reminder check failed:", error);
    }
  });

  console.log(
    "✅ Monthly billing reminder scheduled (25th of every month at 10 AM)",
  );
} else {
  console.log(
    "ℹ️  Monthly billing cron jobs disabled (not in production environment)",
  );
}

// Start server
server.listen(PORT, () => {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("🚀 ECONNECT MULTI-SCHOOL & TALENT MANAGEMENT SYSTEM");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("");
  console.log("🎯 FEATURES ENABLED:");
  console.log("   ✅ 7+ User Roles");
  console.log("   ✅ Socket.io Messaging");
  console.log("   ✅ Multi-School Isolation");
  console.log("   ✅ File Uploads");
  console.log("   ✅ Events & Registration");
  console.log("   ✅ Revenue Tracking");
  console.log("   ✅ Books Store");
  console.log("   ✅ Business Management");
  console.log("   ✅ Comprehensive Analytics");
  console.log("   ✅ Registration Type System");
  console.log("   ✅ Monthly Billing Automation");
  console.log("   ✅ Optimized Location Loading");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM: Closing server...");
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT: Closing server...");
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

module.exports = app;
