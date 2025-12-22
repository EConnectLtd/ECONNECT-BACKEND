// ============================================
// ECONNECT MULTI-SCHOOL & TALENT MANAGEMENT SYSTEM
// Complete Backend Server - ALL FEATURES
// Version: 2.0.0
// ============================================
// ✅ 7+ User Roles (Student, Entrepreneur, Teacher, Headmaster, Staff, TAMISEMI, SuperAdmin)
// ✅ Beem OTP & SMS Integration
// ✅ AzamPay Payment Integration
// ✅ Redis + Bull Queues
// ✅ Socket.io Real-time Messaging
// ✅ Multi-School Data Isolation
// ✅ File Uploads (Avatars, Books, Certificates)
// ✅ Events & Registration
// ✅ Revenue Tracking
// ✅ Books Store
// ✅ Business Management
// ✅ Comprehensive Analytics
// ============================================

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const socketIO = require("socket.io");
const Redis = require("ioredis");
const Queue = require("bull");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult, param, query } = require("express-validator");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const compression = require("compression");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);

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
          "https://econnectz.netlify.app",
          "https://econnect.co.tz",
          "https://www.econnect.co.tz",
        ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  },
});

// ============================================
// REDIS CONFIGURATION
// ============================================
let redis = null;
let emailQueue, smsQueue, paymentQueue, notificationQueue, monthlyBillingQueue;

// Try to connect to Redis, but continue if it fails
if (process.env.REDIS_HOST) {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        // Stop retrying after 3 attempts to prevent crash
        if (times > 3) {
          console.warn("⚠️  Redis retry limit reached - disabling Redis");
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
      },
      maxRetriesPerRequest: 3, // ✅ CRITICAL: Limit retries to prevent crash
      enableReadyCheck: false,
      lazyConnect: true, // Don't connect immediately
    });

    // Try to connect with timeout
    Promise.race([
      redis.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 5000)
      ),
    ])
      .then(() => {
        console.log("✅ Redis Connected Successfully");

        // Initialize Bull Queues only after successful Redis connection
        try {
          const queueConfig = {
            redis: {
              host: process.env.REDIS_HOST,
              port: process.env.REDIS_PORT || 6379,
              maxRetriesPerRequest: 3,
            },
          };

          emailQueue = new Queue("email", queueConfig);
          smsQueue = new Queue("sms", queueConfig);
          paymentQueue = new Queue("payment", queueConfig);
          notificationQueue = new Queue("notification", queueConfig);
          monthlyBillingQueue = new Queue("monthly-billing", queueConfig);

          console.log("✅ Bull Queues initialized successfully");

          // Setup queue processors (only if queues exist)
          setupQueueProcessors();
        } catch (queueError) {
          console.warn(
            "⚠️  Bull Queues initialization failed:",
            queueError.message
          );
          emailQueue =
            smsQueue =
            paymentQueue =
            notificationQueue =
            monthlyBillingQueue =
              null;
        }
      })
      .catch((err) => {
        console.warn("⚠️  Redis connection failed - continuing without Redis");
        console.warn(
          "   → Background jobs (SMS, emails, billing) will be disabled"
        );
        redis = null;
        emailQueue =
          smsQueue =
          paymentQueue =
          notificationQueue =
          monthlyBillingQueue =
            null;
      });

    redis.on("error", (err) => {
      // Suppress connection refused errors (already handled)
      if (
        !err.message.includes("ECONNREFUSED") &&
        !err.message.includes("ETIMEDOUT") &&
        !err.message.includes("ENOTFOUND")
      ) {
        console.warn("⚠️  Redis warning:", err.message);
      }
    });
  } catch (error) {
    console.warn("⚠️  Redis initialization failed - continuing without Redis");
    console.warn(
      "   → Background jobs (SMS, emails, billing) will be disabled"
    );
    redis = null;
  }
} else {
  console.log("ℹ️  Redis not configured (REDIS_HOST not set)");
  console.log("   → Background jobs will be disabled");
  console.log("   → Set REDIS_HOST in environment variables to enable queues");
}

// ============================================
// BULL QUEUE PROCESSORS (only if Redis available)
// ============================================
function setupQueueProcessors() {
  if (
    !redis ||
    !smsQueue ||
    !emailQueue ||
    !paymentQueue ||
    !notificationQueue
  ) {
    console.warn("⚠️  Skipping queue processors - Redis not available");
    return;
  }

  // SMS Queue Processor
  if (smsQueue) {
    smsQueue.process(async (job) => {
      const { phoneNumber, message } = job.data;
      console.log(`📱 Processing SMS to ${phoneNumber}`);
      return await sendSMS(phoneNumber, message);
    });

    smsQueue.on("completed", (job, result) => {
      console.log(`✅ SMS job ${job.id} completed`);
    });

    smsQueue.on("failed", (job, err) => {
      console.error(`❌ SMS job ${job.id} failed:`, err.message);
    });
  }

  // Email Queue Processor
  if (emailQueue) {
    emailQueue.process(async (job) => {
      const { to, subject, body } = job.data;
      console.log(`📧 Processing email to ${to}`);
      return { success: true, message: "Email sent" };
    });
  }

  // Payment Queue Processor
  if (paymentQueue) {
    paymentQueue.process(async (job) => {
      const { transactionId } = job.data;
      console.log(`💳 Processing payment verification for ${transactionId}`);
      return { success: true };
    });
  }

  // Notification Queue Processor
  if (notificationQueue) {
    notificationQueue.process(async (job) => {
      const { userId, title, message, type } = job.data;
      console.log(`🔔 Processing notification for user ${userId}`);
      return { success: true };
    });
  }

  // Monthly Billing Queue Processor
  if (monthlyBillingQueue) {
    monthlyBillingQueue.process(async (job) => {
      console.log("💰 Processing monthly billing...");

      const today = new Date();
      const students = await User.find({
        role: "student",
        registration_type: {
          $in: ["premier_registration", "diamond_registration"],
        },
        next_billing_date: { $lte: today },
        isActive: true,
      });

      console.log(`📊 Found ${students.length} students due for billing`);

      for (const student of students) {
        try {
          const amount =
            student.registration_type === "premier_registration"
              ? 70000
              : 55000;
          const invoiceNumber = `INV-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)
            .toUpperCase()}`;

          await Invoice.create({
            student_id: student._id,
            invoiceNumber,
            type: "ctm_membership",
            description: `Monthly ${student.registration_type
              .replace("_", " ")
              .toUpperCase()} Fee`,
            amount,
            currency: "TZS",
            status: "pending",
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            academicYear: new Date().getFullYear().toString(),
          });

          student.next_billing_date = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          );
          await student.save();

          await createNotification(
            student._id,
            "Monthly Invoice Generated",
            `Your monthly membership fee of ${amount.toLocaleString()} TZS is due`,
            "info",
            "/invoices"
          );

          console.log(
            `✅ Generated invoice ${invoiceNumber} for student ${student.username}`
          );
        } catch (error) {
          console.error(`❌ Error billing student ${student.username}:`, error);
        }
      }

      return { processed: students.length };
    });

    // Schedule monthly billing (runs daily at 9 AM)
    monthlyBillingQueue.add(
      {},
      {
        repeat: { cron: "0 9 * * *" },
      }
    );

    console.log("✅ Monthly billing queue configured");
  }
}

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
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter for validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, GIF, PDF, DOC, DOCX are allowed."
      )
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
  })
);

// Security Headers (Helmet)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS Configuration
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
  })
);

// Body Parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Data Sanitization - Prevent NoSQL Injection (FIXED)
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((key) => {
        if (key.startsWith("$") || key.includes(".")) {
          delete obj[key];
        } else if (typeof obj[key] === "object") {
          sanitize(obj[key]);
        }
      });
    }
    return obj;
  };

  if (req.body) sanitize(req.body);
  if (req.query) {
    const sanitizedQuery = {};
    Object.keys(req.query).forEach((key) => {
      if (!key.startsWith("$") && !key.includes(".")) {
        sanitizedQuery[key] = req.query[key];
      }
    });
    req.query = sanitizedQuery;
  }
  if (req.params) sanitize(req.params);

  next();
});

// XSS Protection (FIXED)
app.use((req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === "string") {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=/gi, "");
    }
    if (typeof value === "object" && value !== null) {
      Object.keys(value).forEach((key) => {
        value[key] = sanitizeValue(value[key]);
      });
    }
    return value;
  };

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query) {
    const sanitizedQuery = {};
    Object.keys(req.query).forEach((key) => {
      sanitizedQuery[key] = sanitizeValue(req.query[key]);
    });
    req.query = sanitizedQuery;
  }
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
});

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
    serverSelectionTimeoutMS: 30000, // Increase from 5000 to 30000
    socketTimeoutMS: 45000,
    // Connection pool optimization
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
  })
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Host: ${mongoose.connection.host}`);
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    console.error("   Retrying in 5 seconds...");

    // Retry connection after 5 seconds
    setTimeout(() => {
      mongoose.connect(MONGODB_URI).catch((e) => {
        console.error("❌ MongoDB Retry Failed:", e.message);
        process.exit(1);
      });
    }, 5000);
  });

// ============================================
// MONGODB SCHEMAS
// ============================================

// User Schema (Enhanced with all roles)
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
  isActive: { type: Boolean, default: true },
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
  qualification: String,
  specialization: String,
  yearsOfExperience: Number,

  // Entrepreneur-specific fields
  businessName: String,
  businessType: String,
  businessRegistrationNumber: String,
  tinNumber: String,

  // Staff-specific fields
  staffPosition: String,
  department: String,
  salary: Number,
  hireDate: Date,

  // ✅ NEW GUARDIAN FIELDS
  guardianEmail: String,
  guardianOccupation: String,
  guardianNationalId: String,

  // ✅ NEW PARENT/GUARDIAN LOCATION FIELDS
  parentRegionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  parentDistrictId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  parentWardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  parentAddress: String,

  // ✅ NEW STUDENT FIELDS
  institutionType: { type: String, enum: ["government", "private"] },
  classLevel: String, // Primary, Secondary, College, University

  // Registration Type (for students)
  registration_type: {
    type: String,
    enum: [
      "normal_registration", // CTM: 15,000 TZS
      "premier_registration", // CTM: 70,000 TZS
      "silver_registration", // Non-CTM: 39,000-59,000 TZS
      "diamond_registration", // Non-CTM: 45,000-65,000 TZS
    ],
  },
  registration_fee_paid: { type: Number, default: 0 },
  registration_date: Date,
  next_billing_date: Date,
  is_ctm_student: { type: Boolean, default: true },

  // Security
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
});

// Add indexes for performance optimization
userSchema.index({ schoolId: 1, role: 1 });
userSchema.index({ regionId: 1, role: 1 });
userSchema.index({ districtId: 1, role: 1 });
userSchema.index({ isActive: 1, role: 1 }); // For filtering active users by role
userSchema.index({ registration_type: 1, next_billing_date: 1 }); // For monthly billing queries
userSchema.index({ createdAt: -1 }); // For sorting by creation date
userSchema.index({ lastLogin: -1 }); // For sorting by last login

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
  classLevelRequestSchema
);

// OTP Schema (for Beem Integration)
const otpSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  purpose: {
    type: String,
    enum: [
      "registration",
      "login",
      "password_reset",
      "phone_verification",
      "transaction_verification",
    ],
    required: true,
  },
  expiresAt: { type: Date, required: true, index: true },
  isVerified: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 600 }, // Auto-delete after 10 minutes
});

// School Schema
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
    enum: ["primary", "secondary", "high_school", "vocational", "special"],
    required: true,
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
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  address: String,
  phoneNumber: String,
  email: { type: String, lowercase: true },
  principalName: String,
  totalStudents: { type: Number, default: 0 },
  totalTeachers: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  logo: String,
  website: String,
  establishedYear: Number,
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
  area: Number, // in square kilometers
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
  category: String, // e.g., "Science", "Arts", "Mathematics"
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" }, // Optional: school-specific subjects
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
studentTalentSchema.index({ schoolId: 1, status: 1 }); // For school-based queries
studentTalentSchema.index({ teacherId: 1 }); // For teacher queries
studentTalentSchema.index({ registeredAt: -1 }); // For sorting by registration date

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
  paymentMethod: {
    type: String,
    enum: ["azampay", "mobile_money", "card", "cash", "bank_transfer"],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded", "cancelled"],
    default: "pending",
  },
  transactionId: String,
  azampayReference: String,
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
  paymentMethod: String,
  transactionId: String,
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
  paymentMethod: {
    type: String,
    enum: [
      "azampay",
      "mobile_money",
      "card",
      "bank_transfer",
      "cash",
      "wallet",
    ],
    required: true,
  },
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

// Subscription Schema
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  plan: {
    type: String,
    enum: ["free", "basic", "premium", "enterprise"],
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired", "suspended"],
    default: "active",
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  autoRenew: { type: Boolean, default: true },
  amount: Number,
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
  features: [String],
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
  attendanceRecordSchema
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
  { unique: true }
);

const AssignmentSubmission = mongoose.model(
  "AssignmentSubmission",
  assignmentSubmissionSchema
);

const invoiceSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["ctm_membership", "certificate", "school_fees", "event", "other"],
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
    currency: {
      type: String,
      default: "Tsh",
    },
    status: {
      type: String,
      enum: ["paid", "pending", "overdue", "cancelled", "verification"],
      default: "pending",
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

    // PAYMENT PROOF FIELDS - ADD THIS
    paymentProof: {
      fileName: String, // Stored filename
      originalName: String, // Original uploaded filename
      filePath: String, // Full path to file
      fileSize: Number, // File size in bytes
      mimeType: String, // File MIME type
      uploadedAt: Date, // When student uploaded
      transactionReference: String, // M-PESA or bank reference
      notes: String, // Optional student notes
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
  }
);

const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = Invoice;

// ============================================
// MODELS
// ============================================
const User = mongoose.model("User", userSchema);
const OTP = mongoose.model("OTP", otpSchema);
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
  eventRegistrationSchema
);
const Business = mongoose.model("Business", businessSchema);
const Product = mongoose.model("Product", productSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);
const Revenue = mongoose.model("Revenue", revenueSchema);
const PerformanceRecord = mongoose.model(
  "PerformanceRecord",
  performanceRecordSchema
);
const Notification = mongoose.model("Notification", notificationSchema);
const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
const Message = mongoose.model("Message", messageSchema);
const Group = mongoose.model("Group", groupSchema);
const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);
const Subscription = mongoose.model("Subscription", subscriptionSchema);
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
  termsAcceptanceSchema
);
const Class = mongoose.model("Class", classSchema);
const Exam = mongoose.model("Exam", examSchema);
const WorkReport = mongoose.model("WorkReport", workReportSchema);
const PermissionRequest = mongoose.model(
  "PermissionRequest",
  permissionRequestSchema
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
    { expiresIn: "7d" }
  );
}

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate unique reference ID
function generateReferenceId(prefix = "ECON") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Log activity
async function logActivity(userId, action, description, req, metadata = {}) {
  try {
    await ActivityLog.create({
      userId,
      action,
      description,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get("user-agent"),
      metadata,
    });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

// Create notification
async function createNotification(
  userId,
  title,
  message,
  type = "info",
  actionUrl = null,
  metadata = {}
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

    // Queue for push notification if queue exists
    if (notificationQueue) {
      await notificationQueue.add({
        userId,
        title,
        message,
        type,
      });
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

// Send SMS via Beem
async function sendSMS(phoneNumber, message) {
  try {
    const beemApiKey = process.env.BEEM_API_KEY;
    const beemSecretKey = process.env.BEEM_SECRET_KEY;
    const beemSourceAddr = process.env.BEEM_SOURCE_ADDR || "ECONNECT";

    if (!beemApiKey || !beemSecretKey) {
      console.log("⚠️  Beem credentials not configured. SMS: " + message);
      return { success: false, message: "Beem not configured" };
    }

    const response = await axios.post(
      "https://apisms.beem.africa/v1/send",
      {
        source_addr: beemSourceAddr,
        schedule_time: "",
        encoding: 0,
        message: message,
        recipients: [{ recipient_id: "1", dest_addr: phoneNumber }],
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${beemApiKey}:${beemSecretKey}`
          ).toString("base64")}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SMS sent via Beem:", phoneNumber);
    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Beem SMS Error:", error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

// Send OTP via Beem
async function sendOTP(phoneNumber, purpose = "verification") {
  try {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({
      phoneNumber,
      otp,
      purpose,
      expiresAt,
    });

    const message = `Your ECONNECT verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;

    // Queue SMS only if queue exists
    if (smsQueue) {
      await smsQueue.add({ phoneNumber, message });
    } else {
      // Direct send without queue
      await sendSMS(phoneNumber, message);
    }

    return { success: true, message: "OTP sent successfully" };
  } catch (error) {
    console.error("❌ Send OTP Error:", error);
    return { success: false, error: error.message };
  }
}

// Verify OTP
async function verifyOTP(phoneNumber, otp, purpose) {
  try {
    const otpRecord = await OTP.findOne({
      phoneNumber,
      otp,
      purpose,
      isVerified: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return { success: false, message: "Invalid or expired OTP" };
    }

    if (otpRecord.attempts >= 5) {
      return {
        success: false,
        message: "Maximum attempts exceeded. Please request a new OTP.",
      };
    }

    otpRecord.isVerified = true;
    await otpRecord.save();

    return { success: true, message: "OTP verified successfully" };
  } catch (error) {
    console.error("❌ Verify OTP Error:", error);
    return { success: false, error: error.message };
  }
}

// AzamPay - Initialize Payment
async function initiateAzamPayPayment(
  amount,
  phoneNumber,
  userId,
  transactionType,
  metadata = {}
) {
  try {
    const azampayAppName = process.env.AZAMPAY_APP_NAME;
    const azampayClientId = process.env.AZAMPAY_CLIENT_ID;
    const azampayClientSecret = process.env.AZAMPAY_CLIENT_SECRET;
    const azampayApiUrl =
      process.env.AZAMPAY_API_URL || "https://sandbox.azampay.co.tz";

    if (!azampayClientId || !azampayClientSecret) {
      console.log("⚠️  AzamPay credentials not configured.");
      return { success: false, message: "AzamPay not configured" };
    }

    // Generate unique reference
    const referenceId = generateReferenceId("ECON");

    // Create transaction record
    const transaction = await Transaction.create({
      userId,
      transactionType,
      amount,
      paymentMethod: "azampay",
      paymentProvider: "AzamPay",
      status: "pending",
      referenceId,
      phoneNumber,
      metadata,
    });

    // Call AzamPay API
    const response = await axios.post(
      `${azampayApiUrl}/api/v1/Partner/PostCheckout`,
      {
        appName: azampayAppName,
        clientId: azampayClientId,
        vendorId: azampayClientId,
        language: "en",
        currency: "TZS",
        externalId: referenceId,
        requestId: referenceId,
        amount: amount,
        cart: {
          items: [
            {
              name: transactionType.replace("_", " ").toUpperCase(),
            },
          ],
        },
        redirectFailURL: `${process.env.FRONTEND_URL}/payment/failed`,
        redirectSuccessURL: `${process.env.FRONTEND_URL}/payment/success`,
        msisdn: phoneNumber,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.success) {
      transaction.providerReference = response.data.transactionId;
      transaction.status = "processing";
      await transaction.save();

      return {
        success: true,
        transactionId: transaction._id,
        referenceId,
        paymentUrl: response.data.paymentUrl || null,
      };
    } else {
      transaction.status = "failed";
      transaction.failureReason = "AzamPay initialization failed";
      await transaction.save();

      return { success: false, message: "Payment initialization failed" };
    }
  } catch (error) {
    console.error("❌ AzamPay Error:", error.response?.data || error.message);
    return { success: false, error: error.message };
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

// Helper function to get subscription features by plan
function getFeaturesByPlan(plan) {
  const planFeatures = {
    free: ["Basic profile", "View public content", "Limited messaging"],
    basic: [
      "Full profile access",
      "Unlimited messaging",
      "Basic analytics",
      "Upload content",
    ],
    premium: [
      "All Basic features",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
      "API access",
    ],
    enterprise: [
      "All Premium features",
      "Dedicated account manager",
      "Custom integrations",
      "Advanced security",
      "SLA guarantee",
      "White-label options",
    ],
  };

  return planFeatures[plan] || planFeatures.free;
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
        `/messages/${senderId}`
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
        message._id
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
        { new: true }
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
      "Redis + Bull Queues",
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
    const redisStatus =
      redis && redis.status === "ready"
        ? "connected"
        : redis
        ? "connecting"
        : "disabled";

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
        redis: redisStatus,
        socketio: "active",
        queues: redis ? "enabled" : "disabled",
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
// RATE LIMITING CONFIGURATION
// ============================================

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count successful requests too
});

// Moderate rate limiter for general API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset attempts per hour
  message: {
    success: false,
    error: "Too many password reset attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
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

// Sanitize error messages for production
const sanitizeError = (error, isDevelopment = false) => {
  if (isDevelopment || process.env.NODE_ENV === "development") {
    return error.message || "An error occurred";
  }
  // In production, return generic messages
  return "An error occurred. Please try again later.";
};

// ============================================
// REDIS CACHING HELPERS
// ============================================

// Cache helper functions
const cache = {
  // Get cached data
  get: async (key) => {
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("❌ Cache get error:", error);
      return null;
    }
  },

  // Set cached data with TTL (Time To Live)
  set: async (key, data, ttlSeconds = 300) => {
    if (!redis) return false;
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("❌ Cache set error:", error);
      return false;
    }
  },

  // Delete cached data
  del: async (key) => {
    if (!redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error("❌ Cache delete error:", error);
      return false;
    }
  },

  // Delete multiple keys matching a pattern
  delPattern: async (pattern) => {
    if (!redis) return false;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error("❌ Cache delete pattern error:", error);
      return false;
    }
  },
};

// Cache middleware for GET requests
const cacheMiddleware = (ttlSeconds = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    const cacheKey = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedData = await cache.get(cacheKey);
      if (cachedData) {
        return res.json(cachedData);
      }

      // Store original json function
      const originalJson = res.json.bind(res);

      // Override json function to cache response
      res.json = function (data) {
        // Cache successful responses
        if (res.statusCode === 200) {
          cache.set(cacheKey, data, ttlSeconds).catch(() => {});
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error("❌ Cache middleware error:", error);
      next();
    }
  };
};

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ObjectId validation middleware
const validateObjectId = (paramName = "id") => {
  return [
    param(paramName).custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error(`Invalid ${paramName} format`);
      }
      return true;
    }),
    handleValidationErrors,
  ];
};

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Register with OTP
app.post(
  "/api/auth/register",
  authLimiter,
  [
    // ✅ NEW VALIDATION: Match the actual data format being sent from frontend
    body("phone")
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage("Valid phone number is required"),
    body("names.first")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("First name must be between 2 and 50 characters"),
    body("names.middle")
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage("Middle name must be less than 50 characters"),
    body("names.last")
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage("Last name must be between 2 and 50 characters"),
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
    body("email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email address"),
    body("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Invalid gender"),
    body("location.region").optional().trim().withMessage("Invalid region"),
    body("location.district").optional().trim().withMessage("Invalid district"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        phone,
        password,
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
      } = req.body;

      console.log("📥 Registration request received:", {
        phone,
        role,
        hasNames: !!names,
        hasLocation: !!location,
      });

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

      // Hash password (use phone as password if not provided)
      const hashedPassword = await hashPassword(password || phone);

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
        isActive: role !== "teacher", // Teachers need approval, others are active immediately
        accepted_terms: accepted_terms || true,
      };

      // Add school if provided
      if (school_id) {
        userData.schoolId = school_id;
      }

      // Add location if provided (using names, not IDs)
      if (location) {
        // Find region by name
        if (location.region) {
          let region = await Region.findOne({ name: location.region });
          if (region) {
            userData.regionId = region._id;
          }
        }

        // Find district by name
        if (location.district) {
          let district = await District.findOne({ name: location.district });
          if (district) {
            userData.districtId = district._id;
          }
        }

        // Find ward by name
        if (location.ward) {
          let ward = await Ward.findOne({ name: location.ward });
          if (ward) {
            userData.wardId = ward._id;
          }
        }
      }

      // Add role-specific data
      if (role === "student" && student) {
        userData.gradeLevel = student.class_level || student.classLevel;
        userData.course = student.course;
        userData.registration_type = student.registration_type;
        userData.is_ctm_student = student.is_ctm_student !== false;
        userData.registration_date = new Date();
        userData.registration_fee_paid = student.registration_fee_paid || 0;

        // Guardian information
        if (student.guardian) {
          userData.guardianName = student.guardian.name;
          userData.guardianPhone = student.guardian.phone;
          userData.guardianRelationship = student.guardian.relationship;
          userData.guardianEmail = student.guardian.email;
          userData.guardianOccupation = student.guardian.occupation;
          userData.guardianNationalId = student.guardian.nationalId;
        }
      } else if (role === "teacher" && teacher) {
        userData.specialization = teacher.specialization;
        userData.qualification = teacher.qualification;
        userData.yearsOfExperience = teacher.years_of_experience || 0;
      } else if (role === "entrepreneur" && entrepreneur) {
        userData.businessName = entrepreneur.business_name;
        userData.businessType = entrepreneur.business_type;
      }

      // Create user
      const user = await User.create(userData);

      console.log("✅ User created:", {
        id: user._id,
        username: user.username,
        role: user.role,
      });

      // ✅ AUTO-GENERATE INVOICE if registration type requires payment
      if (
        role === "student" &&
        student?.registration_type &&
        student.registration_type !== "normal_registration"
      ) {
        const registrationFees = {
          premier_registration: 70000,
          silver_registration: 49000,
          diamond_registration: 55000,
        };

        const amount = registrationFees[student.registration_type];

        if (amount) {
          const invoiceNumber = `INV-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)
            .toUpperCase()}`;

          await Invoice.create({
            student_id: user._id,
            invoiceNumber,
            type: "ctm_membership",
            description: `${student.registration_type
              .replace("_", " ")
              .toUpperCase()} Fee`,
            amount,
            currency: "TZS",
            status: "pending",
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            academicYear: new Date().getFullYear().toString(),
          });

          console.log(`💰 Created invoice ${invoiceNumber} for ${amount} TZS`);

          // Set next billing date for monthly subscriptions
          if (
            ["premier_registration", "diamond_registration"].includes(
              student.registration_type
            )
          ) {
            user.next_billing_date = new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            );
            await user.save();
          }
        }
      }

      // Send OTP for phone verification
      if (phone) {
        await sendOTP(phone, "registration");
      }

      // Generate token
      const token = generateToken(user);

      // Log activity
      await logActivity(
        user._id,
        "USER_REGISTERED",
        `New ${role} account created`,
        req
      );

      console.log("✅ Registration successful:", user.username);

      res.status(201).json({
        success: true,
        message: phone
          ? "User registered. Please verify your phone number."
          : "User registered successfully.",
        data: {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
            phoneNumber: user.phoneNumber,
            isPhoneVerified: user.isPhoneVerified,
          },
          token,
        },
      });
    } catch (error) {
      console.error("❌ Registration error:", error);
      res.status(500).json({
        success: false,
        error: "Registration failed",
        message: error.message,
      });
    }
  }
);

// Verify OTP
app.post("/api/auth/verify-otp", authenticateToken, async (req, res) => {
  try {
    const { otp, purpose } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, error: "OTP is required" });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const verification = await verifyOTP(
      user.phoneNumber,
      otp,
      purpose || "registration"
    );

    if (!verification.success) {
      return res.status(400).json(verification);
    }

    user.isPhoneVerified = true;
    await user.save();

    await createNotification(
      user._id,
      "Phone Verified",
      "Your phone number has been verified successfully",
      "success"
    );

    await logActivity(user._id, "PHONE_VERIFIED", "Phone number verified", req);

    res.json({
      success: true,
      message: "Phone verified successfully",
      data: { isPhoneVerified: true },
    });
  } catch (error) {
    console.error("❌ OTP verification error:", error);
    res.status(500).json({
      success: false,
      error: "Verification failed",
      message: error.message,
    });
  }
});

// Resend OTP
app.post("/api/auth/resend-otp", authenticateToken, async (req, res) => {
  try {
    const { purpose } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (!user.phoneNumber) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number not found" });
    }

    await sendOTP(user.phoneNumber, purpose || "registration");

    res.json({
      success: true,
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.error("❌ Resend OTP error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to resend OTP",
      message: error.message,
    });
  }
});

// Login
app.post(
  "/api/auth/login",
  authLimiter,
  [
    body("username").trim().notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: "Username and password are required",
        });
      }

      const user = await User.findOne({
        $or: [{ username }, { email: username }],
      }).populate("schoolId regionId districtId");

      if (!user || !(await comparePassword(password, user.password))) {
        return res.status(401).json({
          success: false,
          error: "Invalid credentials",
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: "Account is deactivated. Please contact support.",
        });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user);

      await logActivity(user._id, "USER_LOGIN", "User logged in", req);

      res.json({
        success: true,
        message: "Login successful",
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
            profileImage: user.profileImage,
            isPhoneVerified: user.isPhoneVerified,
            isEmailVerified: user.isEmailVerified,
            lastLogin: user.lastLogin,
          },
          token,
        },
      });
    } catch (error) {
      console.error("❌ Login error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed",
        message: error.message,
      });
    }
  }
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
      message: error.message,
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
      req
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
      message: error.message,
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
      user.password
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
      req
    );

    await createNotification(
      req.user.id,
      "Password Changed",
      "Your password has been changed successfully",
      "success"
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
      message: error.message,
    });
  }
});

// Forgot password - Request OTP
app.post(
  "/api/auth/forgot-password",
  passwordResetLimiter,
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
        message: sanitizeError(error),
      });
    }
  }
);

// Reset password with OTP
app.post(
  "/api/auth/reset-password",
  passwordResetLimiter,
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
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
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
        "password_reset"
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
        req
      );

      await createNotification(
        user._id,
        "Password Reset",
        "Your password has been reset successfully",
        "success"
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
        message: sanitizeError(error),
      });
    }
  }
);

// Logout
app.post("/api/auth/logout", authenticateToken, async (req, res) => {
  try {
    await logActivity(req.user.id, "USER_LOGOUT", "User logged out", req);

    // In a more advanced setup, you might want to blacklist the token
    // or store logout events in Redis

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Logout failed",
      message: error.message,
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
        "registration_type is_ctm_student registration_date next_billing_date registration_fee_paid"
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
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
      `📊 Location API Usage: ${req.method} ${req.path} - ${duration}ms`
    );

    // Optional: Track in database or analytics service
    // This helps you monitor the reduction in API calls after frontend optimization
  });

  next();
});

// ============================================
// LOCATION ENDPOINTS
// ============================================

// ============================================
// LOCATION ENDPOINTS - OPTIMIZED WITH CACHING
// ============================================

// GET all regions (OPTIMIZED - Frontend uses local utility now)
app.get("/api/locations/regions", async (req, res) => {
  try {
    // ✅ Log deprecated usage (optional monitoring)
    console.warn(
      "⚠️  DEPRECATED ENDPOINT CALLED: /api/locations/regions - Consider using frontend utility"
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
      message: error.message,
    });
  }
});

// GET districts (OPTIMIZED - Frontend uses local utility now)
app.get("/api/locations/districts", async (req, res) => {
  try {
    const { region_id } = req.query;

    // ✅ Log deprecated usage
    console.warn(
      "⚠️  DEPRECATED ENDPOINT CALLED: /api/locations/districts - Consider using frontend utility"
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
      } (cached response)`
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
      message: error.message,
    });
  }
});

// GET wards (OPTIMIZED - Frontend uses local utility now)
app.get("/api/locations/wards", async (req, res) => {
  try {
    const { district_id } = req.query;

    // ✅ Log deprecated usage
    console.warn(
      "⚠️  DEPRECATED ENDPOINT CALLED: /api/locations/wards - Consider using frontend utility"
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
      } (cached response)`
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
      message: error.message,
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
      `✅ Returned ALL locations: ${regions.length} regions, ${districts.length} districts, ${wards.length} wards`
    );
  } catch (error) {
    console.error("❌ Error fetching all locations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch all locations",
      message: error.message,
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
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
);

// ============================================
// SCHOOL ENDPOINTS (with Multi-School Isolation)
// ============================================

// GET all schools (with caching)
app.get("/api/schools", cacheMiddleware(600), async (req, res) => {
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
        "_id name schoolCode type regionId districtId wardId address phoneNumber email principalName totalStudents totalTeachers logo isActive establishedYear"
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
      message: error.message,
    });
  }
});

// GET school by ID
app.get("/api/schools/:id", async (req, res) => {
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
      message: error.message,
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
      const school = await School.create(req.body);

      await logActivity(
        req.user.id,
        "SCHOOL_CREATED",
        `Created school: ${school.name}`,
        req
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
        message: error.message,
      });
    }
  }
);

// UPDATE school
app.put(
  "/api/schools/:id",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "tamisemi",
    "headmaster"
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
        { new: true, runValidators: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

// DELETE school (soft delete)
app.delete(
  "/api/schools/:id",
  authenticateToken,
  authorizeRoles("super_admin", "national_official"),
  async (req, res) => {
    try {
      const school = await School.findByIdAndUpdate(
        req.params.id,
        { isActive: false, updatedAt: new Date() },
        { new: true }
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
        req
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
        message: error.message,
      });
    }
  }
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
        "_id name category description icon requirements isActive createdAt"
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
      message: error.message,
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
      message: error.message,
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
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
        { new: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

// ============================================
// STUDENT TALENT REGISTRATION ENDPOINTS
// ============================================

// GET student talents (for a specific student)
app.get(
  "/api/students/:studentId/talents",
  authenticateToken,
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
        message: error.message,
      });
    }
  }
);

// REGISTER student talent
app.post(
  "/api/students/:studentId/talents",
  authenticateToken,
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
        }
      );

      await createNotification(
        req.params.studentId,
        "Talent Registered",
        `You have been registered for ${studentTalent.talentId.name}`,
        "success"
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
        message: error.message,
      });
    }
  }
);

// UPDATE student talent
app.put(
  "/api/students/:studentId/talents/:talentId",
  authenticateToken,
  async (req, res) => {
    try {
      const studentTalent = await StudentTalent.findOneAndUpdate(
        { studentId: req.params.studentId, talentId: req.params.talentId },
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

// DELETE student talent registration
app.delete(
  "/api/students/:studentId/talents/:talentId",
  authenticateToken,
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
        req
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
        message: error.message,
      });
    }
  }
);

// Add certification to student talent
app.post(
  "/api/students/:studentId/talents/:talentId/certifications",
  authenticateToken,
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
        req
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
    });
  }
});

// GET book by ID
app.get("/api/books/:id", async (req, res) => {
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
      message: error.message,
    });
  }
});

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
        req
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
        message: error.message,
      });
    }
  }
);

// UPDATE book
app.put(
  "/api/books/:id",
  authenticateToken,
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
        req
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
        message: error.message,
      });
    }
  }
);

// DELETE book
app.delete(
  "/api/books/:id",
  authenticateToken,
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
        req
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
        message: error.message,
      });
    }
  }
);

// Purchase book
app.post("/api/books/:id/purchase", authenticateToken, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    const amount = book.discountPrice || book.price;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res
        .status(400)
        .json({ success: false, error: "Phone number is required" });
    }

    const payment = await initiateAzamPayPayment(
      amount,
      phoneNumber,
      req.user.id,
      "book_purchase",
      {
        bookId: book._id,
        bookTitle: book.title,
      }
    );

    if (payment.success) {
      await BookPurchase.create({
        userId: req.user.id,
        bookId: book._id,
        amount,
        paymentMethod: "azampay",
        transactionId: payment.referenceId,
        paymentStatus: "pending",
      });

      res.json({
        success: true,
        message: "Payment initiated successfully",
        data: payment,
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Payment initiation failed",
        message: payment.message,
      });
    }
  } catch (error) {
    console.error("❌ Purchase error:", error);
    res.status(500).json({
      success: false,
      error: "Purchase failed",
      message: error.message,
    });
  }
});

// Add book review
app.post("/api/books/:id/reviews", authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ success: false, error: "Valid rating (1-5) is required" });
    }

    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    // Check if user already reviewed
    const existingReview = book.reviews.find(
      (r) => r.userId.toString() === req.user.id
    );
    if (existingReview) {
      return res
        .status(409)
        .json({ success: false, error: "You have already reviewed this book" });
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
      req
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
      message: error.message,
    });
  }
});

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
      message: error.message,
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
      message: error.message,
    });
  }
});

// GET event by ID
app.get("/api/events/:id", async (req, res) => {
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
      message: error.message,
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
    "teacher"
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
        req
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
        message: error.message,
      });
    }
  }
);

// UPDATE event
app.put("/api/events/:id", authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
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
      req
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
      message: error.message,
    });
  }
});

// DELETE event
app.delete("/api/events/:id", authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
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
      req
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
      message: error.message,
    });
  }
});

// Register for event
app.post("/api/events/:id/register", authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, error: "Event not found" });
    }

    if (event.status !== "published") {
      return res
        .status(400)
        .json({ success: false, error: "Event is not open for registration" });
    }

    if (event.registrationDeadline && new Date() > event.registrationDeadline) {
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
        return res.status(400).json({ success: false, error: "Event is full" });
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
      `/events/${event._id}`
    );

    await logActivity(
      req.user.id,
      "EVENT_REGISTERED",
      `Registered for event: ${event.title}`,
      req
    );

    // If there's a fee, initiate payment
    if (event.registrationFee > 0 && req.body.phoneNumber) {
      const payment = await initiateAzamPayPayment(
        event.registrationFee,
        req.body.phoneNumber,
        req.user.id,
        "event_registration",
        {
          eventId: event._id,
          eventTitle: event.title,
          registrationId: registration._id,
        }
      );

      if (payment.success) {
        registration.transactionId = payment.referenceId;
        await registration.save();
      }
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
      message: error.message,
    });
  }
});

app.delete(
  "/api/student/events/:eventId/register",
  authenticateToken,
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
        { new: true }
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
          `📊 Updated participant count: ${event.currentParticipants}`
        );
      }

      // Create notification (async, don't block response)
      createNotification(
        userId,
        "Event Unregistered",
        `You have unregistered from "${event.title}"`,
        "info",
        `/events/${event._id}`
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
        }
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
        message: error.message,
      });
    }
  }
);

// Get event registrations
app.get(
  "/api/events/:id/registrations",
  authenticateToken,
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
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
      message: error.message,
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
        req
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
        message: error.message,
      });
    }
  }
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
      req
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
      message: error.message,
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
        { new: true }
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
        "success"
      );

      await logActivity(
        req.user.id,
        "BUSINESS_VERIFIED",
        `Verified business: ${business.name}`,
        req
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
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
        req
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
        message: error.message,
      });
    }
  }
);

// ============================================
// PAYMENT PROOF UPLOAD ENDPOINT
// ============================================

app.post(
  "/api/student/invoices/payment-proof",
  authenticateToken,
  upload.single("paymentProof"),
  async (req, res) => {
    try {
      const { invoiceId, transactionReference, notes } = req.body;
      const userId = req.user.id;
      const file = req.file;

      console.log("Payment proof upload request:", {
        userId,
        invoiceId,
        transactionReference,
        fileName: file?.originalname,
      });

      // Validate required fields
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "Payment proof file is required",
        });
      }

      if (!invoiceId) {
        return res.status(400).json({
          success: false,
          error: "Invoice ID is required",
        });
      }

      if (!transactionReference || !transactionReference.trim()) {
        return res.status(400).json({
          success: false,
          error: "Transaction reference is required",
        });
      }

      // Find invoice and verify ownership
      const invoice = await Invoice.findOne({
        _id: invoiceId,
        student_id: userId,
      });

      if (!invoice) {
        // Clean up uploaded file if invoice not found
        fs.unlinkSync(file.path);
        return res.status(404).json({
          success: false,
          error: "Invoice not found or you do not have permission to access it",
        });
      }

      // Check if invoice is already paid
      if (invoice.status === "paid") {
        fs.unlinkSync(file.path);
        return res.status(400).json({
          success: false,
          error: "This invoice has already been paid",
        });
      }

      // Update invoice with payment proof
      invoice.paymentProof = {
        fileName: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
        transactionReference: transactionReference.trim(),
        notes: notes || "",
        status: "pending", // Admin will verify
      };

      // Change invoice status to 'verification'
      invoice.status = "verification";

      await invoice.save();

      // Create audit log
      await logActivity(
        userId,
        "PAYMENT_PROOF_SUBMITTED",
        `Submitted payment proof for invoice ${invoice.invoiceNumber}`,
        req,
        {
          invoice_id: invoiceId,
          invoice_number: invoice.invoiceNumber,
          transaction_reference: transactionReference.trim(),
          file_name: file.originalname,
          file_size: file.size,
          amount: invoice.amount,
          currency: invoice.currency,
        }
      );

      // Create notification for student
      await createNotification(
        userId,
        "Payment Proof Submitted",
        `Your payment proof for invoice ${invoice.invoiceNumber} is being verified`,
        "info"
      );

      console.log("Payment proof submitted successfully:", {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        fileName: file.originalname,
      });

      res.json({
        success: true,
        message:
          "Payment proof submitted successfully. Your payment is being verified.",
        data: {
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          uploadedAt: invoice.paymentProof.uploadedAt,
        },
      });
    } catch (error) {
      console.error("Error submitting payment proof:", error);

      // Clean up uploaded file on error
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Error cleaning up file:", cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        error: "Failed to submit payment proof. Please try again.",
      });
    }
  }
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
        "student_id",
        "firstName lastName email"
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
          }
        );

        // Notify student
        await createNotification(
          invoice.student_id._id,
          "Payment Verified",
          `Your payment for invoice ${invoice.invoiceNumber} has been verified`,
          "success"
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
          }
        );

        // Notify student
        await createNotification(
          invoice.student_id._id,
          "Payment Rejected",
          `Your payment proof for invoice ${invoice.invoiceNumber} was rejected: ${rejectionReason}`,
          "warning"
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
  }
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
        .populate("student_id", "firstName lastName email username")
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
  }
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
  }
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
        student_id: userId,
      }).populate("student_id", "first_name last_name email");

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
            name: `${invoice.student_id.first_name} ${invoice.student_id.last_name}`,
            email: invoice.student_id.email,
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
  }
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

      const query = { student_id: userId };
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
        message: error.message,
      });
    }
  }
);

// ============================================
// REST OF ENDPOINTS CONTINUE...
//
// ============================================

// Payment callback (AzamPay webhook)
app.post("/api/payments/callback/azampay", async (req, res) => {
  try {
    console.log("💳 AzamPay Callback:", req.body);

    const { transactionId, status, reference } = req.body;

    const transaction = await Transaction.findOne({ referenceId: reference });

    if (!transaction) {
      console.error("❌ Transaction not found:", reference);
      return res
        .status(404)
        .json({ success: false, error: "Transaction not found" });
    }

    if (status === "success" || status === "completed") {
      transaction.status = "completed";
      transaction.completedAt = new Date();
      transaction.providerTransactionId = transactionId;
      await transaction.save();

      // Calculate revenue
      const { commission, netAmount } = calculateRevenueSplit(
        transaction.amount,
        transaction.transactionType
      );

      // Create revenue record
      await Revenue.create({
        transactionId: transaction._id,
        businessId: transaction.businessId,
        schoolId: transaction.schoolId,
        userId: transaction.userId,
        amount: transaction.amount,
        commission,
        netAmount,
        revenueType: transaction.transactionType,
        revenueDate: new Date(),
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        quarter: Math.ceil((new Date().getMonth() + 1) / 3),
      });

      // Update related entities based on transaction type
      if (
        transaction.transactionType === "book_purchase" &&
        transaction.metadata?.bookId
      ) {
        await Book.findByIdAndUpdate(transaction.metadata.bookId, {
          $inc: { soldCount: 1 },
        });

        await BookPurchase.findOneAndUpdate(
          { transactionId: transaction.referenceId },
          { paymentStatus: "completed" }
        );
      }

      if (
        transaction.transactionType === "event_registration" &&
        transaction.metadata?.registrationId
      ) {
        await EventRegistration.findByIdAndUpdate(
          transaction.metadata.registrationId,
          { paymentStatus: "paid" }
        );
      }

      await createNotification(
        transaction.userId,
        "Payment Successful",
        `Your payment of TZS ${transaction.amount.toLocaleString()} was successful`,
        "success"
      );

      await logActivity(
        transaction.userId,
        "PAYMENT_COMPLETED",
        `Payment completed: TZS ${transaction.amount}`,
        req
      );
    } else {
      transaction.status = "failed";
      transaction.failureReason = req.body.message || "Payment failed";
      await transaction.save();

      await createNotification(
        transaction.userId,
        "Payment Failed",
        "Your payment was not successful. Please try again.",
        "error"
      );
    }

    res.json({ success: true, message: "Callback processed" });
  } catch (error) {
    console.error("❌ Payment callback error:", error);
    res.status(500).json({
      success: false,
      error: "Callback processing failed",
      message: error.message,
    });
  }
});

// Initiate payment
app.post("/api/payments/initiate", authenticateToken, async (req, res) => {
  try {
    const { amount, phoneNumber, transactionType, metadata } = req.body;

    if (!amount || !phoneNumber || !transactionType) {
      return res.status(400).json({
        success: false,
        error: "Amount, phone number, and transaction type are required",
      });
    }

    const payment = await initiateAzamPayPayment(
      amount,
      phoneNumber,
      req.user.id,
      transactionType,
      metadata
    );

    if (payment.success) {
      res.json({
        success: true,
        message: "Payment initiated successfully",
        data: payment,
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Payment initiation failed",
        message: payment.message,
      });
    }
  } catch (error) {
    console.error("❌ Payment initiation error:", error);
    res.status(500).json({
      success: false,
      error: "Payment initiation failed",
      message: error.message,
    });
  }
});

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
      message: error.message,
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
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
      message: error.message,
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        }
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
        message: error.message,
      });
    }
  }
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
        "firstName lastName role"
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
        `/messages/${senderId}`
      ).catch((err) => console.error("Error creating notification:", err));

      // Log activity (async, don't wait)
      logActivity(
        req.user.id,
        "MESSAGE_SENT",
        `Sent message to ${receiver.firstName || "user"}`,
        req
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
    });
  }
});

app.patch(
  "/api/notifications/:id/read",
  authenticateToken,
  async (req, res) => {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { isRead: true, readAt: new Date() },
        { new: true }
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
        message: error.message,
      });
    }
  }
);

app.patch(
  "/api/notifications/read-all",
  authenticateToken,
  async (req, res) => {
    try {
      await Notification.updateMany(
        { userId: req.user.id, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      console.error("❌ Error updating notifications:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update notifications",
        message: error.message,
      });
    }
  }
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
    "tamisemi"
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
        message: error.message,
      });
    }
  }
);

app.get("/api/users/:id", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("schoolId", "name schoolCode type")
      .populate("regionId", "name code")
      .populate("districtId", "name code");

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error("❌ Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user",
      message: error.message,
    });
  }
});

app.put(
  "/api/users/:id",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster"
  ),
  async (req, res) => {
    try {
      const { password, ...updateData } = req.body;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

app.patch(
  "/api/users/:id/deactivate",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "regional_official"),
  async (req, res) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: false, updatedAt: new Date() },
        { new: true }
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
        req
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
    });
  }
});

// GET assignment by ID
app.get("/api/assignments/:id", authenticateToken, async (req, res) => {
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
      assignmentObj.isOverdue = !submission && new Date() > assignment.dueDate;

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
      message: error.message,
    });
  }
});

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
        req
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
        message: error.message,
      });
    }
  }
);

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
        `/assignments/${assignmentId}/submissions`
      );

      await logActivity(
        req.user.id,
        "ASSIGNMENT_SUBMITTED",
        `Submitted assignment: ${assignment.title}`,
        req
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
        message: error.message,
      });
    }
  }
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
        "/grades"
      );

      await logActivity(
        req.user.id,
        "GRADE_CREATED",
        `Posted grade for ${grade.studentId.firstName}`,
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
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
  }
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
        message: error.message,
      });
    }
  }
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

      if (!student.schoolId || !student.gradeLevel) {
        return res.json({
          success: true,
          data: [],
          message: "No timetable available. Please update your class level.",
        });
      }

      const currentYear = new Date().getFullYear();

      const timetables = await Timetable.find({
        schoolId: student.schoolId,
        classLevel: student.gradeLevel,
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
          (p) => p.toString() === studentId
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
  }
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
        gradeLevel: request.requestedClassLevel,
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
        "success"
      );

      await logActivity(
        req.user.id,
        "CLASS_LEVEL_REQUEST_APPROVED",
        "Approved class level request",
        req
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
  }
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
        "warning"
      );

      await logActivity(
        req.user.id,
        "CLASS_LEVEL_REQUEST_REJECTED",
        "Rejected class level request",
        req
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
  }
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
            `/admin/class-requests/${request._id}`
          );
        }
      }

      await logActivity(
        req.user.id,
        "CLASS_LEVEL_REQUEST_SUBMITTED",
        `Requested class level change to ${classLevel}`,
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
          gradeLevel: classLevel,
          course: course || "",
          updatedAt: new Date(),
        },
        { new: true, runValidators: true }
      ).select("-password");

      await logActivity(
        req.user.id,
        "CLASS_INFO_UPDATED",
        `Updated class to ${classLevel} for ${academicYear}`,
        req
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
        message: error.message,
      });
    }
  }
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
          gradeLevel: classLevel,
          updatedAt: new Date(),
        },
        { new: true }
      ).select("-password");

      await logActivity(
        studentId,
        "CLASS_LEVEL_UPDATED",
        `Updated class level to ${classLevel} for ${academicYear}. Reason: ${reason}`,
        req,
        { classLevel, academicYear, course, reason }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
        `/assignments/${assignmentId}/submissions`
      );

      await logActivity(
        req.user.id,
        "ASSIGNMENT_SUBMITTED",
        `Submitted assignment: ${assignment.title}`,
        req
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
        message: error.message,
      });
    }
  }
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
          "name schoolCode logo address phoneNumber"
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
          (t) => t.proficiencyLevel === "intermediate"
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
                  "_id"
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
              "_id"
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
                  "_id"
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
              "_id"
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
        message: error.message,
      });
    }
  }
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
    "tamisemi"
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
        message: error.message,
      });
    }
  }
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
      message: error.message,
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
      message: error.message,
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
        `/performance/${record._id}`
      );

      await logActivity(
        req.user.id,
        "PERFORMANCE_RECORDED",
        `Assessed ${record.studentId.firstName} in ${record.talentId.name}`,
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
);

// GET student performance summary
app.get(
  "/api/students/:studentId/performance",
  authenticateToken,
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
        ]
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
        message: error.message,
      });
    }
  }
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
  }
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
  }
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
        "_id"
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
  }
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
        "_id"
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
  }
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
        paymentMethod: "cash",
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
          "product_sale"
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
            (new Date(transaction.completedAt).getMonth() + 1) / 3
          ),
          category,
        });
      }

      await logActivity(
        req.user.id,
        "TRANSACTION_ADDED",
        `Added ${type} transaction`,
        req
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
  }
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
  }
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
          req
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
          req
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
  }
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
  }
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
        req
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
  }
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
        req
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
  }
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
  }
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
  }
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
        { new: true, runValidators: true }
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
        req
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
  }
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
  }
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
  }
);

// APPROVE Teacher
app.post(
  "/api/headmaster/approvals/teacher/:userId/approve",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const user = await User.findOne({
        _id: req.params.userId,
        schoolId: req.user.schoolId,
        role: "teacher",
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Teacher not found" });
      }

      user.isActive = true;
      await user.save();

      await createNotification(
        user._id,
        "Account Approved",
        "Your teacher account has been approved by the headmaster",
        "success"
      );

      await logActivity(
        req.user.id,
        "TEACHER_APPROVED",
        `Approved teacher: ${user.firstName} ${user.lastName}`,
        req
      );

      res.json({ success: true, message: "Teacher approved successfully" });
    } catch (error) {
      console.error("❌ Error approving teacher:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to approve teacher" });
    }
  }
);

// REJECT Teacher
app.post(
  "/api/headmaster/approvals/teacher/:userId/reject",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const user = await User.findOne({
        _id: req.params.userId,
        schoolId: req.user.schoolId,
        role: "teacher",
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Teacher not found" });
      }

      await user.deleteOne();

      await logActivity(
        req.user.id,
        "TEACHER_REJECTED",
        `Rejected teacher: ${user.firstName} ${user.lastName}`,
        req
      );

      res.json({ success: true, message: "Teacher rejected successfully" });
    } catch (error) {
      console.error("❌ Error rejecting teacher:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to reject teacher" });
    }
  }
);

// APPROVE Student
app.post(
  "/api/headmaster/approvals/student/:userId/approve",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const user = await User.findOne({
        _id: req.params.userId,
        schoolId: req.user.schoolId,
        role: "student",
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Student not found" });
      }

      user.isActive = true;
      await user.save();

      await createNotification(
        user._id,
        "Account Approved",
        "Your student account has been approved",
        "success"
      );

      await logActivity(
        req.user.id,
        "STUDENT_APPROVED",
        `Approved student: ${user.firstName} ${user.lastName}`,
        req
      );

      res.json({ success: true, message: "Student approved successfully" });
    } catch (error) {
      console.error("❌ Error approving student:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to approve student" });
    }
  }
);

// REJECT Student
app.post(
  "/api/headmaster/approvals/student/:userId/reject",
  authenticateToken,
  authorizeRoles("headmaster"),
  async (req, res) => {
    try {
      const user = await User.findOne({
        _id: req.params.userId,
        schoolId: req.user.schoolId,
        role: "student",
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "Student not found" });
      }

      await user.deleteOne();

      await logActivity(
        req.user.id,
        "STUDENT_REJECTED",
        `Rejected student: ${user.firstName} ${user.lastName}`,
        req
      );

      res.json({ success: true, message: "Student rejected successfully" });
    } catch (error) {
      console.error("❌ Error rejecting student:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to reject student" });
    }
  }
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
        req
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
  }
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
        req
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
  }
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
        req
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
  }
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
  }
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
        req
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
  }
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
        req
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
  }
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
  }
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
  }
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
  }
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
          "firstName lastName email profileImage gradeLevel"
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
  }
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
  }
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
  }
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
        "info"
      );

      await logActivity(
        req.user.id,
        "CTM_STATUS_UPDATED",
        `Updated CTM member status to ${status}`,
        req
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
  }
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
  }
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
        "info"
      );

      await logActivity(
        req.user.id,
        "STUDENT_TRANSFERRED",
        `Transferred student to ${targetSchool.name}. Reason: ${reason}`,
        req,
        { studentId: student._id, targetSchoolId, reason, notes }
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
  }
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
  }
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
        "info"
      );

      await logActivity(
        req.user.id,
        "STAFF_ROLE_UPDATED",
        `Updated staff role to ${role}`,
        req
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
  }
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
  }
);

// GET Teacher Report
app.get(
  "/api/headmaster/teachers/:teacherId/report",
  authenticateToken,
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
        req
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
        "info"
      );

      await logActivity(
        req.user.id,
        "MESSAGE_SENT",
        `Sent message to user ${userId}`,
        req
      );

      res.json({ success: true, message: "Message sent successfully" });
    } catch (error) {
      console.error("❌ Error sending message:", error);
      res.status(500).json({ success: false, error: "Failed to send message" });
    }
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
        req
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
        req
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
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
    "tamisemi"
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
  }
);
// ============================================
// SUPERADMIN ENDPOINTS (30 ENDPOINTS)
// ============================================

// GET SuperAdmin Overview
app.get(
  "/api/superadmin/overview",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const [
        totalUsers,
        totalSchools,
        totalStudents,
        totalTeachers,
        totalRevenue,
        recentUsers,
        systemHealth,
      ] = await Promise.all([
        User.countDocuments(),
        School.countDocuments(),
        User.countDocuments({ role: "student" }),
        User.countDocuments({ role: "teacher" }),
        Revenue.aggregate([
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        User.find()
          .select("firstName lastName email role createdAt")
          .sort({ createdAt: -1 })
          .limit(10),
        {
          database:
            mongoose.connection.readyState === 1 ? "connected" : "disconnected",
          redis:
            redis && redis.status === "ready" ? "connected" : "disconnected",
        },
      ]);

      res.json({
        success: true,
        data: {
          stats: {
            totalUsers,
            totalSchools,
            totalStudents,
            totalTeachers,
            totalRevenue: totalRevenue[0]?.total || 0,
          },
          recentUsers,
          systemHealth,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching overview:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch overview" });
    }
  }
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
  }
);

// GET All Schools (SuperAdmin)
app.get(
  "/api/superadmin/schools",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status } = req.query;

      const query = {};
      if (status) query.isActive = status === "active";

      const schools = await School.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("regionId", "name code")
        .populate("districtId", "name code");

      const total = await School.countDocuments(query);

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
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch schools" });
    }
  }
);

// CREATE School (SuperAdmin)
app.post(
  "/api/superadmin/schools",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const school = await School.create(req.body);

      await logActivity(
        req.user.id,
        "SCHOOL_CREATED",
        `Created school: ${school.name}`,
        req
      );

      res.status(201).json({
        success: true,
        message: "School created successfully",
        data: school,
      });
    } catch (error) {
      console.error("❌ Error creating school:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create school" });
    }
  }
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
        { new: true }
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
        req
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
  }
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
        { new: true }
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
        req
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
  }
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

      if (level && locationId) {
        if (level === "district") userData.districtId = locationId;
        if (level === "regional") userData.regionId = locationId;
      }

      const user = await User.create(userData);

      // Send credentials via SMS (optional)
      if (smsQueue) {
        await sendSMS(
          phone,
          `Welcome to ECONNECT! Your temporary password is: ${tempPassword}. Please change it after first login.`
        );
      }

      await logActivity(
        req.user.id,
        "USER_REGISTERED",
        `Registered ${role}: ${name}`,
        req
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
  }
);

// GET All Users (SuperAdmin)
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

      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate("schoolId", "name schoolCode");

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
      res.status(500).json({ success: false, error: "Failed to fetch users" });
    }
  }
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
        req
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
  }
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
  }
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
  }
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
  }
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
  }
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
        { new: true }
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
        "success"
      );

      await logActivity(
        req.user.id,
        "REPORT_APPROVED",
        "Approved work report",
        req
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
  }
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
        { new: true }
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
        "warning"
      );

      await logActivity(
        req.user.id,
        "REPORT_REJECTED",
        "Rejected work report",
        req
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
  }
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
  }
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
        { new: true }
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
        "success"
      );

      await logActivity(
        req.user.id,
        "PERMISSION_APPROVED",
        `Approved ${request.type} request`,
        req
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
  }
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
        { new: true }
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
        "warning"
      );

      await logActivity(
        req.user.id,
        "PERMISSION_REJECTED",
        `Rejected ${request.type} request`,
        req
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
  }
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

      res.json({ success: true, data: pendingStudents });
    } catch (error) {
      console.error("❌ Error fetching pending students:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch pending students" });
    }
  }
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
  }
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
  }
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
        { new: true }
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
        "info"
      );

      await logActivity(
        req.user.id,
        "TASK_ASSIGNED",
        `Assigned task to user ${assigneeId}`,
        req
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
  }
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
        "info"
      );

      await logActivity(
        req.user.id,
        "TASK_COMMENTED",
        "Commented on task",
        req
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
  }
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
  }
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
  }
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
  }
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
  }
);

// GET Subscription Plans
app.get(
  "/api/superadmin/subscriptions/plans",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      // Return default plans (you can store these in DB later)
      const plans = [
        {
          id: "free",
          name: "Free",
          price: 0,
          duration: "forever",
          features: [
            "Basic profile",
            "View public content",
            "Limited messaging",
          ],
        },
        {
          id: "basic",
          name: "Basic",
          price: 5000,
          duration: "30 days",
          features: [
            "Full profile access",
            "Unlimited messaging",
            "Basic analytics",
            "Upload content",
          ],
        },
        {
          id: "premium",
          name: "Premium",
          price: 15000,
          duration: "30 days",
          features: [
            "All Basic features",
            "Advanced analytics",
            "Priority support",
            "Custom branding",
            "API access",
          ],
        },
      ];

      res.json({ success: true, data: plans });
    } catch (error) {
      console.error("❌ Error fetching subscription plans:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch subscription plans" });
    }
  }
);

// CREATE Subscription Plan
app.post(
  "/api/superadmin/subscriptions/plans",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { name, price, duration, features } = req.body;

      if (!name || price === undefined || !duration) {
        return res.status(400).json({
          success: false,
          error: "Name, price, and duration are required",
        });
      }

      // Store in system settings or separate collection
      await logActivity(
        req.user.id,
        "SUBSCRIPTION_PLAN_CREATED",
        `Created plan: ${name}`,
        req
      );

      res.status(201).json({
        success: true,
        message: "Subscription plan created successfully",
        data: { name, price, duration, features },
      });
    } catch (error) {
      console.error("❌ Error creating subscription plan:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create subscription plan" });
    }
  }
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
  }
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
    "tamisemi"
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
          isActive: true,
          ...(admin.districtId && { districtId: admin.districtId }),
          ...(admin.regionId && { regionId: admin.regionId }),
        }),
        User.countDocuments({
          role: "teacher",
          isActive: true,
          ...(admin.districtId && { districtId: admin.districtId }),
          ...(admin.regionId && { regionId: admin.regionId }),
        }),
        User.countDocuments({
          role: "staff",
          isActive: true,
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
          isActive: false,
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
        message: error.message,
      });
    }
  }
);

// GET Admin Analytics
app.get(
  "/api/admin/analytics",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi"
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

      const schools = await School.find(schoolQuery).distinct("_id");

      const [
        studentGrowth,
        attendanceRate,
        academicPerformance,
        talentDistribution,
        eventParticipation,
      ] = await Promise.all([
        // Student growth over time
        User.aggregate([
          {
            $match: {
              role: "student",
              ...(admin.districtId && { districtId: admin.districtId }),
              ...(admin.regionId && { regionId: admin.regionId }),
            },
          },
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

        // Attendance rate
        AttendanceRecord.aggregate([
          { $match: { schoolId: { $in: schools } } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ]),

        // Academic performance
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

        // Talent distribution
        StudentTalent.aggregate([
          { $match: { schoolId: { $in: schools } } },
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

        // Event participation
        EventRegistration.aggregate([
          {
            $lookup: {
              from: "events",
              localField: "eventId",
              foreignField: "_id",
              as: "event",
            },
          },
          { $unwind: "$event" },
          {
            $match: {
              "event.schoolId": { $in: schools },
            },
          },
          {
            $group: {
              _id: "$event.eventType",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          studentGrowth,
          attendanceRate,
          academicPerformance,
          talentDistribution,
          eventParticipation,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching admin analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch analytics",
        message: error.message,
      });
    }
  }
);

// GET All Users (Admin)
app.get(
  "/api/admin/users",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "tamisemi"
  ),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, role } = req.query;
      const admin = await User.findById(req.user.id);

      const query = {};
      if (role) query.role = role;

      // Apply role-based filtering
      if (admin.districtId) {
        query.districtId = admin.districtId;
      } else if (admin.regionId) {
        query.regionId = admin.regionId;
      }

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
        message: error.message,
      });
    }
  }
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
    "headmaster"
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

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ username }, { email }, { phoneNumber }],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "Username, email, or phone number already exists",
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const admin = await User.findById(req.user.id);
      const user = await User.create({
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
        isActive: true,
      });

      await logActivity(
        req.user.id,
        "USER_CREATED",
        `Created ${role} user: ${username}`,
        req
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
        message: error.message,
      });
    }
  }
);

// UPDATE User (Admin)
app.patch(
  "/api/admin/users/:userId",
  authenticateToken,
  authorizeRoles(
    "super_admin",
    "national_official",
    "regional_official",
    "district_official",
    "headmaster"
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

      // Update user (excluding password and role)
      const { password, role, ...updates } = req.body;
      Object.assign(user, updates);
      user.updatedAt = new Date();
      await user.save();

      await logActivity(
        req.user.id,
        "USER_UPDATED",
        `Updated user: ${user.username}`,
        req
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
        message: error.message,
      });
    }
  }
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
    "headmaster"
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

      // Soft delete - deactivate instead of removing
      user.isActive = false;
      user.updatedAt = new Date();
      await user.save();

      await logActivity(
        req.user.id,
        "USER_DELETED",
        `Deactivated user: ${user.username}`,
        req
      );

      res.json({
        success: true,
        message: "User deactivated successfully",
      });
    } catch (error) {
      console.error("❌ Error deleting user:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete user",
        message: error.message,
      });
    }
  }
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
    "tamisemi"
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
        message: error.message,
      });
    }
  }
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
      const registrationTypes = [
        {
          id: "normal_registration",
          name: "Normal Registration",
          category: "CTM",
          amount: 15000,
          currency: "TZS",
          monthly: false,
          features: ["Basic CTM membership", "Access to school activities"],
        },
        {
          id: "premier_registration",
          name: "Premier Registration",
          category: "CTM",
          amount: 70000,
          currency: "TZS",
          monthly: true,
          features: [
            "Full CTM membership",
            "Monthly billing",
            "Premium features",
            "Priority support",
          ],
        },
        {
          id: "silver_registration",
          name: "Silver Registration",
          category: "Non-CTM",
          amount: 49000,
          currency: "TZS",
          monthly: false,
          features: ["Basic access", "Standard support"],
        },
        {
          id: "diamond_registration",
          name: "Diamond Registration",
          category: "Non-CTM",
          amount: 55000,
          currency: "TZS",
          monthly: true,
          features: ["Full access", "Monthly billing", "Premium support"],
        },
      ];

      res.json({
        success: true,
        data: registrationTypes,
      });
    } catch (error) {
      console.error("❌ Error fetching registration types:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch registration types",
      });
    }
  }
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
        req
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
  }
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
        req
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
  }
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
        req
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
  }
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
  }
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
  }
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
          "firstName lastName email username gradeLevel course"
        )
        .populate("reviewedBy", "firstName lastName");

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
        data: requests,
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
        message: error.message,
      });
    }
  }
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
          "firstName lastName email username phoneNumber gradeLevel course schoolId"
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
        message: error.message,
      });
    }
  }
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
        req
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
  }
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
        req
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
  }
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
        req
      );

      res.json({ success: true, message: "Class deleted successfully" });
    } catch (error) {
      console.error("❌ Error deleting class:", error);
      res.status(500).json({ success: false, error: "Failed to delete class" });
    }
  }
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
        "firstName lastName email phoneNumber profileImage gradeLevel studentId"
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
  }
);

// GET All Students (Teacher's school)
app.get(
  "/api/teacher/students",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const students = await User.find({
        schoolId: req.user.schoolId,
        role: "student",
        isActive: true,
      })
        .select(
          "firstName lastName email phoneNumber profileImage gradeLevel studentId"
        )
        .sort({ firstName: 1 });

      res.json({ success: true, data: students });
    } catch (error) {
      console.error("❌ Error fetching students:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch students" });
    }
  }
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
  }
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
        req
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
  }
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
        })
      );

      res.json({ success: true, data: assignmentsWithStats });
    } catch (error) {
      console.error("❌ Error fetching assignments:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch assignments" });
    }
  }
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
        req
      );

      res.status(201).json({
        success: true,
        message: "Assignment created successfully",
        data: assignment,
      });
    } catch (error) {
      console.error("❌ Error creating assignment:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create assignment" });
    }
  }
);

// GET Assignment Submissions
app.get(
  "/api/teacher/assignments/:assignmentId/submissions",
  authenticateToken,
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
          "firstName lastName email profileImage studentId"
        )
        .sort({ submittedAt: -1 });

      res.json({ success: true, data: submissions });
    } catch (error) {
      console.error("❌ Error fetching submissions:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch submissions" });
    }
  }
);

// GRADE Submission
app.post(
  "/api/teacher/submissions/:submissionId/grade",
  authenticateToken,
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
        req.params.submissionId
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
        "info"
      );

      await logActivity(
        req.user.id,
        "SUBMISSION_GRADED",
        "Graded assignment submission",
        req
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
  }
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
  }
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
        req
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
  }
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
          "info"
        );
      }

      await logActivity(
        req.user.id,
        "BULK_MESSAGE_SENT",
        `Sent message to ${recipients.length} recipients`,
        req
      );

      res.json({
        success: true,
        message: `Message sent to ${recipients.length} recipient(s)`,
      });
    } catch (error) {
      console.error("❌ Error sending bulk message:", error);
      res.status(500).json({ success: false, error: "Failed to send message" });
    }
  }
);

// GET Student Report
app.get(
  "/api/teacher/students/:studentId/report",
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
  }
);

// GET Class Report
app.get(
  "/api/teacher/classes/:classId/report",
  authenticateToken,
  authorizeRoles("teacher"),
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
  }
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
      message: error.message,
    });
  }
});

// GET certificate by ID
app.get("/api/certificates/:id", authenticateToken, async (req, res) => {
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
      message: error.message,
    });
  }
});

// GET student certificates
app.get(
  "/api/students/:studentId/certificates",
  authenticateToken,
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
        message: error.message,
      });
    }
  }
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
        `/certificates/${certificate._id}`
      );

      await logActivity(
        req.user.id,
        "CERTIFICATE_ISSUED",
        `Issued ${certificateType} certificate to ${certificate.studentId.firstName}`,
        req
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
        message: error.message,
      });
    }
  }
);

// Verify certificate by number or code
app.get("/api/certificates/verify/:identifier", async (req, res) => {
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
      message: error.message,
    });
  }
});

// UPDATE certificate
app.put(
  "/api/certificates/:id",
  authenticateToken,
  authorizeRoles("headmaster", "super_admin"),
  async (req, res) => {
    try {
      const certificate = await Certificate.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

// REVOKE certificate
app.patch(
  "/api/certificates/:id/revoke",
  authenticateToken,
  authorizeRoles("headmaster", "super_admin"),
  async (req, res) => {
    try {
      const certificate = await Certificate.findByIdAndUpdate(
        req.params.id,
        { isVerified: false },
        { new: true }
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
        "warning"
      );

      await logActivity(
        req.user.id,
        "CERTIFICATE_REVOKED",
        `Revoked certificate ${certificate.certificateNumber}`,
        req
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
        message: error.message,
      });
    }
  }
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
      })
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
      message: error.message,
    });
  }
});

// GET group by ID
app.get("/api/groups/:id", authenticateToken, async (req, res) => {
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
      message: error.message,
    });
  }
});

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
          `/groups/${group._id}`
        );
      });
    }

    await logActivity(
      req.user.id,
      "GROUP_CREATED",
      `Created group: ${name}`,
      req
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
      message: error.message,
    });
  }
});

// UPDATE group
app.put("/api/groups/:id", authenticateToken, async (req, res) => {
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
      req
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
      message: error.message,
    });
  }
});

// DELETE group
app.delete("/api/groups/:id", authenticateToken, async (req, res) => {
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
      req
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
      message: error.message,
    });
  }
});

// ADD member to group
app.post("/api/groups/:id/members", authenticateToken, async (req, res) => {
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
        `/groups/${group._id}`
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
      message: error.message,
    });
  }
});

// REMOVE member from group
app.delete(
  "/api/groups/:id/members/:userId",
  authenticateToken,
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
        (m) => m.toString() !== req.params.userId
      );
      group.admins = group.admins.filter(
        (a) => a.toString() !== req.params.userId
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
        message: error.message,
      });
    }
  }
);

// GET group messages
app.get("/api/groups/:id/messages", authenticateToken, async (req, res) => {
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
      message: error.message,
    });
  }
});

// POST group message (REST endpoint, Socket.io also available)
app.post("/api/groups/:id/messages", authenticateToken, async (req, res) => {
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
      message: error.message,
    });
  }
});

// ============================================================================
// COMPLETE PRODUCT ENDPOINTS
// ============================================================================

// GET all products (public endpoint with search)
app.get("/api/products", async (req, res) => {
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
      message: error.message,
    });
  }
});

// GET product by ID
app.get("/api/products/:id", async (req, res) => {
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
      message: error.message,
    });
  }
});

// UPDATE product
app.put("/api/products/:id", authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "businessId"
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
      req
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
      message: error.message,
    });
  }
});

// DELETE product
app.delete("/api/products/:id", authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "businessId"
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
      req
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
      message: error.message,
    });
  }
});

// ============================================================================
// BOOK DOWNLOAD ENDPOINT (with Purchase Verification)
// ============================================================================

app.get("/api/books/:id/download", authenticateToken, async (req, res) => {
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
      req
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
      message: error.message,
    });
  }
});

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
        message: error.message,
      });
    }
  }
);

// ============================================================================
// SUBSCRIPTION MANAGEMENT ENDPOINTS
// ============================================================================

// GET user subscriptions
app.get("/api/subscriptions", authenticateToken, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate("transactionId");

    res.json({
      success: true,
      data: subscriptions,
    });
  } catch (error) {
    console.error("❌ Error fetching subscriptions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch subscriptions",
      message: error.message,
    });
  }
});

// GET active subscription
app.get("/api/subscriptions/active", authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.user.id,
      status: "active",
      endDate: { $gt: new Date() },
    });

    res.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    console.error("❌ Error fetching active subscription:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch active subscription",
      message: error.message,
    });
  }
});

// CREATE subscription
app.post("/api/subscriptions", authenticateToken, async (req, res) => {
  try {
    const { plan, duration = 30, amount, phoneNumber } = req.body; // duration in days

    if (!plan || !amount || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Plan, amount, and phone number are required",
      });
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(duration));

    // Initiate payment
    const payment = await initiateAzamPayPayment(
      amount,
      phoneNumber,
      req.user.id,
      "subscription",
      {
        plan,
        duration,
        startDate,
        endDate,
      }
    );

    if (!payment.success) {
      return res.status(400).json({
        success: false,
        error: "Payment initiation failed",
        message: payment.message,
      });
    }

    // Create subscription (pending payment)
    const subscription = await Subscription.create({
      userId: req.user.id,
      plan,
      status: "active",
      startDate,
      endDate,
      autoRenew: true,
      amount,
      features: getFeaturesByPlan(plan),
    });

    res.status(201).json({
      success: true,
      message: "Subscription created. Complete payment to activate.",
      data: {
        subscription,
        payment,
      },
    });
  } catch (error) {
    console.error("❌ Error creating subscription:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create subscription",
      message: error.message,
    });
  }
});

// CANCEL subscription
app.patch(
  "/api/subscriptions/:id/cancel",
  authenticateToken,
  async (req, res) => {
    try {
      const subscription = await Subscription.findOne({
        _id: req.params.id,
        userId: req.user.id,
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: "Subscription not found",
        });
      }

      subscription.status = "cancelled";
      subscription.autoRenew = false;
      await subscription.save();

      await createNotification(
        req.user.id,
        "Subscription Cancelled",
        `Your ${subscription.plan} subscription has been cancelled`,
        "info"
      );

      await logActivity(
        req.user.id,
        "SUBSCRIPTION_CANCELLED",
        `Cancelled ${subscription.plan} subscription`,
        req
      );

      res.json({
        success: true,
        message: "Subscription cancelled successfully",
        data: subscription,
      });
    } catch (error) {
      console.error("❌ Error cancelling subscription:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel subscription",
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
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
              0
            ),
            totalCommission: revenueData.reduce(
              (sum, item) => sum + item.totalCommission,
              0
            ),
            totalNet: revenueData.reduce((sum, item) => sum + item.totalNet, 0),
            totalTransactions: revenueData.reduce(
              (sum, item) => sum + item.transactionCount,
              0
            ),
          },
        },
      });
    } catch (error) {
      console.error("❌ Error generating revenue report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate revenue report",
        message: error.message,
      });
    }
  }
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
      message: error.message,
    });
  }
});

// GET subject by ID
app.get("/api/subjects/:id", async (req, res) => {
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
      message: error.message,
    });
  }
});

// CREATE subject (admin only)
app.post(
  "/api/subjects",
  authenticateToken,
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
        req
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
        message: error.message,
      });
    }
  }
);

// UPDATE subject
app.put(
  "/api/subjects/:id",
  authenticateToken,
  authorizeRoles("super_admin", "national_official", "headmaster"),
  async (req, res) => {
    try {
      const subject = await Subject.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true, runValidators: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

// DELETE subject (soft delete)
app.delete(
  "/api/subjects/:id",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const subject = await Subject.findByIdAndUpdate(
        req.params.id,
        { isActive: false, updatedAt: new Date() },
        { new: true }
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
        req
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
        message: error.message,
      });
    }
  }
);

// SEED subjects (pre-populate common subjects)
app.post(
  "/api/subjects/seed",
  authenticateToken,
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const defaultSubjects = [
        // Science Subjects
        { name: "Mathematics", code: "MATH", category: "Science" },
        { name: "Physics", code: "PHY", category: "Science" },
        { name: "Chemistry", code: "CHEM", category: "Science" },
        { name: "Biology", code: "BIO", category: "Science" },
        { name: "Computer Science", code: "CS", category: "Science" },

        // Arts Subjects
        { name: "English", code: "ENG", category: "Arts" },
        { name: "Kiswahili", code: "KIS", category: "Arts" },
        { name: "History", code: "HIST", category: "Arts" },
        { name: "Geography", code: "GEO", category: "Arts" },
        { name: "Civics", code: "CIV", category: "Arts" },

        // Commerce Subjects
        { name: "Commerce", code: "COM", category: "Commerce" },
        { name: "Accounting", code: "ACC", category: "Commerce" },
        { name: "Book Keeping", code: "BK", category: "Commerce" },
        { name: "Economics", code: "ECON", category: "Commerce" },

        // Other Subjects
        { name: "Basic Mathematics", code: "BMATH", category: "Basic" },
        { name: "Religious Education", code: "RE", category: "Other" },
        { name: "Physical Education", code: "PE", category: "Other" },
      ];

      const results = [];
      for (const subjectData of defaultSubjects) {
        const existing = await Subject.findOne({
          name: subjectData.name,
          schoolId: { $exists: false },
        });
        if (!existing) {
          const subject = await Subject.create(subjectData);
          results.push(subject);
        }
      }

      await logActivity(
        req.user.id,
        "SUBJECTS_SEEDED",
        `Seeded ${results.length} subjects`,
        req
      );

      res.json({
        success: true,
        message: `Seeded ${results.length} subjects successfully`,
        data: results,
      });
    } catch (error) {
      console.error("❌ Error seeding subjects:", error);
      res.status(500).json({
        success: false,
        error: "Failed to seed subjects",
        message: error.message,
      });
    }
  }
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
        message: error.message,
      });
    }
  }
);

// ============================================================================
// BULK OPERATIONS
// ============================================================================

// Bulk import users (CSV)
app.post(
  "/api/users/bulk-import",
  authenticateToken,
  authorizeRoles("super_admin", "headmaster"),
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
        req
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
        message: error.message,
      });
    }
  }
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
        req
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
        message: error.message,
      });
    }
  }
);

// ============================================================================
// EXPORT MODULE
// ============================================================================

// ensure the standalone block is properly closed before attaching middleware
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error:
      err.name === "ValidationError"
        ? "Validation Error"
        : "Internal server error",
    message: sanitizeError(err),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

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
  console.log("   ✅ Beem OTP & SMS");
  console.log("   ✅ AzamPay Payments");
  console.log("   ✅ Redis + Bull Queues");
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
  console.log("   ✅ Optimized Location Loading"); // ✅ ADD THIS LINE
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM: Closing server...");
  server.close(() => {
    mongoose.connection.close();
    if (redis) {
      redis.quit();
    }
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT: Closing server...");
  server.close(() => {
    mongoose.connection.close();
    if (redis) {
      redis.quit();
    }
    process.exit(0);
  });
});

module.exports = app;
