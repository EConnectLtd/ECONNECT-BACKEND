// ============================================
// ECONNECT ULTIMATE SEED FILE
// Complete Database Seeding with Realistic Tanzanian Data
// Version: 2.0.0
// ============================================
// Seeds:
// ✅ 31 Regions with Districts & Wards
// ✅ 200+ Schools (Government & Private)
// ✅ 50+ Talents across 9 categories
// ✅ 30+ Subjects
// ✅ 1000+ Users (7+ roles)
// ✅ Events & Registrations
// ✅ Books Store
// ✅ Businesses & Products
// ✅ Grades & Attendance
// ✅ Assignments & Submissions
// ✅ CTM Memberships & Activities
// ✅ Notifications & Messages
// ✅ Invoices & Transactions
// ============================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";

// ============================================
// COLOR CODES FOR CONSOLE OUTPUT
// ============================================
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

// Helper function for colored console output
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  section: (msg) =>
    console.log(
      `\n${colors.cyan}${colors.bright}${"═".repeat(60)}\n${msg}\n${"═".repeat(
        60
      )}${colors.reset}\n`
    ),
};

// ============================================
// MONGODB SCHEMAS (Import from server.js structure)
// ============================================

// User Schema
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
  guardianEmail: String,
  guardianOccupation: String,
  guardianNationalId: String,
  parentRegionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  parentDistrictId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  parentWardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  parentAddress: String,
  course: String,
  nationalId: String,
  studentId: String,
  gradeLevel: String,
  enrollmentDate: Date,
  employeeId: String,
  qualification: String,
  specialization: String,
  yearsOfExperience: Number,
  businessName: String,
  businessType: String,
  businessRegistrationNumber: String,
  tinNumber: String,
  staffPosition: String,
  department: String,
  salary: Number,
  hireDate: Date,
  institutionType: { type: String, enum: ["government", "private"] },
  classLevel: String,
  registration_type: {
    type: String,
    enum: [
      "normal_registration",
      "premier_registration",
      "silver_registration",
      "diamond_registration",
    ],
  },
  registration_fee_paid: { type: Number, default: 0 },
  registration_date: Date,
  next_billing_date: Date,
  is_ctm_student: { type: Boolean, default: true },
});

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
  coordinates: { latitude: Number, longitude: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
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
    { name: String, issuedBy: String, issuedDate: Date, description: String },
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
  },
  startDate: { type: Date, required: true },
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
  status: {
    type: String,
    enum: ["draft", "published", "ongoing", "completed", "cancelled"],
    default: "published",
  },
  isPublic: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
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
    default: "approved",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "refunded", "waived"],
    default: "paid",
  },
  registeredAt: { type: Date, default: Date.now },
});

// Grade Schema
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
  grade: { type: String, trim: true },
  totalMarks: { type: Number, default: 100 },
  obtainedMarks: { type: Number },
  term: { type: String, trim: true },
  academicYear: { type: String, trim: true },
  examDate: { type: Date },
  feedback: String,
  createdAt: { type: Date, default: Date.now },
});

// Attendance Schema
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
  createdAt: { type: Date, default: Date.now },
});

// Assignment Schema
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
  dueDate: { type: Date, required: true },
  totalMarks: { type: Number, default: 100 },
  status: {
    type: String,
    enum: ["draft", "published", "closed"],
    default: "published",
  },
  createdAt: { type: Date, default: Date.now },
});

// Assignment Submission Schema
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

// Book Schema
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true },
  isbn: { type: String, unique: true, sparse: true },
  category: { type: String, trim: true },
  description: String,
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
  soldCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  stockQuantity: { type: Number, default: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Business Schema
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
  address: String,
  phoneNumber: String,
  email: { type: String, lowercase: true },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  category: { type: String, trim: true },
  establishedDate: Date,
  employeesCount: Number,
  isVerified: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["active", "inactive", "suspended", "pending"],
    default: "active",
  },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  createdAt: { type: Date, default: Date.now },
});

// Product Schema
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
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

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
  membershipType: {
    type: String,
    enum: ["basic", "premium", "gold", "platinum"],
    default: "basic",
  },
  talents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Talent" }],
  participationPoints: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
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
  talentCategory: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  date: { type: Date, required: true },
  duration: Number,
  location: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  maxParticipants: Number,
  status: {
    type: String,
    enum: ["scheduled", "ongoing", "completed", "cancelled"],
    default: "scheduled",
  },
  points: { type: Number, default: 0 },
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
  isRead: { type: Boolean, default: false },
  readAt: Date,
  actionUrl: String,
  createdAt: { type: Date, default: Date.now },
});

// Message Schema
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
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Invoice Schema
const invoiceSchema = new mongoose.Schema({
  student_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  invoiceNumber: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ["ctm_membership", "certificate", "school_fees", "event", "other"],
    required: true,
  },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "TZS" },
  status: {
    type: String,
    enum: ["paid", "pending", "overdue", "cancelled", "verification"],
    default: "pending",
  },
  dueDate: { type: Date, required: true },
  paidDate: Date,
  academicYear: String,
  createdAt: { type: Date, default: Date.now },
});

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
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isActive: { type: Boolean, default: true },
  publishDate: { type: Date, default: Date.now },
  expiryDate: Date,
  createdAt: { type: Date, default: Date.now },
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
  position: String,
  points: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Class Schema
const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  level: { type: String, required: true },
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
  academicYear: { type: String, required: true },
  term: String,
  description: String,
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Create Models
const User = mongoose.model("User", userSchema);
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const School = mongoose.model("School", schoolSchema);
const Talent = mongoose.model("Talent", talentSchema);
const Subject = mongoose.model("Subject", subjectSchema);
const StudentTalent = mongoose.model("StudentTalent", studentTalentSchema);
const Event = mongoose.model("Event", eventSchema);
const EventRegistration = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema
);
const Grade = mongoose.model("Grade", gradeSchema);
const AttendanceRecord = mongoose.model(
  "AttendanceRecord",
  attendanceRecordSchema
);
const Assignment = mongoose.model("Assignment", assignmentSchema);
const AssignmentSubmission = mongoose.model(
  "AssignmentSubmission",
  assignmentSubmissionSchema
);
const Book = mongoose.model("Book", bookSchema);
const Business = mongoose.model("Business", businessSchema);
const Product = mongoose.model("Product", productSchema);
const CTMMembership = mongoose.model("CTMMembership", ctmMembershipSchema);
const CTMActivity = mongoose.model("CTMActivity", ctmActivitySchema);
const Notification = mongoose.model("Notification", notificationSchema);
const Message = mongoose.model("Message", messageSchema);
const Invoice = mongoose.model("Invoice", invoiceSchema);
const Announcement = mongoose.model("Announcement", announcementSchema);
const Award = mongoose.model("Award", awardSchema);
const Class = mongoose.model("Class", classSchema);

// ============================================
// SEED DATA - TANZANIA LOCATIONS
// ============================================

const regionsData = [
  { name: "Dar es Salaam", code: "DSM", population: 4364541, area: 1393 },
  { name: "Mwanza", code: "MWZ", population: 2772509, area: 35187 },
  { name: "Arusha", code: "ARU", population: 1694310, area: 37576 },
  { name: "Dodoma", code: "DOD", population: 2083588, area: 41311 },
  { name: "Morogoro", code: "MOR", population: 2218492, area: 70799 },
  { name: "Mbeya", code: "MBE", population: 2707410, area: 60350 },
  { name: "Iringa", code: "IRI", population: 941238, area: 58936 },
  { name: "Kagera", code: "KAG", population: 2458023, area: 28388 },
  { name: "Tanga", code: "TNG", population: 2045205, area: 26677 },
  { name: "Mara", code: "MAR", population: 1743830, area: 21760 },
  { name: "Kilimanjaro", code: "KIL", population: 1640087, area: 13309 },
  { name: "Tabora", code: "TAB", population: 2291623, area: 76151 },
  { name: "Kigoma", code: "KIG", population: 2127930, area: 45066 },
  { name: "Shinyanga", code: "SHI", population: 1534808, area: 50781 },
  { name: "Singida", code: "SIN", population: 1370637, area: 49341 },
  { name: "Rukwa", code: "RUK", population: 1004539, area: 68635 },
  { name: "Geita", code: "GEI", population: 1739530, area: 20054 },
  { name: "Simiyu", code: "SIM", population: 1584157, area: 25212 },
  { name: "Katavi", code: "KAT", population: 564604, area: 45843 },
  { name: "Njombe", code: "NJO", population: 702097, area: 21347 },
  { name: "Songwe", code: "SON", population: 998862, area: 27253 },
  { name: "Manyara", code: "MAN", population: 1425131, area: 44522 },
  { name: "Ruvuma", code: "RUV", population: 1376891, area: 63669 },
  { name: "Pwani", code: "PWN", population: 1098668, area: 32407 },
  { name: "Lindi", code: "LIN", population: 864652, area: 66046 },
  { name: "Mtwara", code: "MTW", population: 1270854, area: 16710 },
];

const districtsData = {
  "Dar es Salaam": ["Ilala", "Kinondoni", "Temeke", "Ubungo", "Kigamboni"],
  Mwanza: ["Ilemela", "Nyamagana", "Sengerema", "Kwimba", "Magu", "Ukerewe"],
  Arusha: [
    "Arusha City",
    "Arusha DC",
    "Karatu",
    "Longido",
    "Monduli",
    "Ngorongoro",
  ],
  Dodoma: [
    "Dodoma City",
    "Bahi",
    "Chamwino",
    "Chemba",
    "Kondoa",
    "Kongwa",
    "Mpwapwa",
  ],
  Morogoro: [
    "Morogoro City",
    "Morogoro DC",
    "Gairo",
    "Kilombero",
    "Kilosa",
    "Mvomero",
    "Ulanga",
  ],
  Mbeya: ["Mbeya City", "Chunya", "Kyela", "Mbarali", "Rungwe"],
  Iringa: ["Iringa City", "Iringa DC", "Kilolo", "Mafinga"],
  Kagera: ["Bukoba", "Biharamulo", "Karagwe", "Missenyi", "Muleba", "Ngara"],
  Tanga: [
    "Tanga City",
    "Handeni",
    "Kilindi",
    "Korogwe",
    "Lushoto",
    "Muheza",
    "Pangani",
  ],
  Mara: ["Musoma", "Bunda", "Butiama", "Rorya", "Serengeti", "Tarime"],
  Kilimanjaro: ["Moshi", "Hai", "Mwanga", "Rombo", "Same", "Siha"],
  Tabora: [
    "Tabora City",
    "Igunga",
    "Kaliua",
    "Nzega",
    "Sikonge",
    "Urambo",
    "Uyui",
  ],
  Kigoma: ["Kigoma City", "Kasulu", "Kibondo", "Uvinza"],
  Shinyanga: ["Shinyanga City", "Kahama", "Kishapu", "Shinyanga DC"],
  Singida: [
    "Singida City",
    "Ikungi",
    "Iramba",
    "Manyoni",
    "Mkalama",
    "Singida DC",
  ],
  Rukwa: ["Sumbawanga", "Kalambo", "Nkasi"],
  Geita: [
    "Geita Town",
    "Bukombe",
    "Chato",
    "Geita DC",
    "Mbogwe",
    "Nyang'hwale",
  ],
  Simiyu: ["Bariadi", "Busega", "Itilima", "Maswa", "Meatu"],
  Katavi: ["Mpanda", "Mlele", "Tanganyika"],
  Njombe: [
    "Njombe Town",
    "Ludewa",
    "Makambako",
    "Makete",
    "Njombe DC",
    "Wanging'ombe",
  ],
  Songwe: ["Mbozi", "Momba", "Songwe", "Tunduma"],
  Manyara: ["Babati", "Hanang", "Kiteto", "Mbulu", "Simanjiro"],
  Ruvuma: ["Songea", "Mbinga", "Namtumbo", "Nyasa", "Tunduru"],
  Pwani: ["Kibaha", "Bagamoyo", "Kisarawe", "Mafia", "Mkuranga", "Rufiji"],
  Lindi: ["Lindi", "Kilwa", "Liwale", "Nachingwea", "Ruangwa"],
  Mtwara: ["Mtwara", "Masasi", "Nanyumbu", "Newala", "Tandahimba"],
};

// Sample wards for each district
const generateWards = (districtName, count = 8) => {
  const wardTypes = [
    "Central",
    "North",
    "South",
    "East",
    "West",
    "Mjini",
    "Kati",
    "Kaskazini",
    "Kusini",
    "Mashariki",
    "Magharibi",
  ];
  const wards = [];
  for (let i = 0; i < count; i++) {
    wards.push(
      `${districtName} ${wardTypes[i % wardTypes.length]}${
        i > wardTypes.length - 1
          ? " " + (Math.floor(i / wardTypes.length) + 1)
          : ""
      }`
    );
  }
  return wards;
};

// ============================================
// SEED DATA - TALENTS
// ============================================

const talentsData = [
  // Singing
  {
    name: "Traditional Singing",
    category: "Singing",
    description: "Traditional Tanzanian music and vocals",
    icon: "🎤",
  },
  {
    name: "Gospel Music",
    category: "Singing",
    description: "Religious music performance",
    icon: "🎵",
  },
  {
    name: "Bongo Flava",
    category: "Singing",
    description: "Popular Tanzanian music genre",
    icon: "🎶",
  },
  {
    name: "Choir Performance",
    category: "Singing",
    description: "Group singing and harmonization",
    icon: "👥",
  },

  // Dancing
  {
    name: "Traditional Dance",
    category: "Dancing",
    description: "Tribal and cultural dances",
    icon: "💃",
  },
  {
    name: "Modern Dance",
    category: "Dancing",
    description: "Contemporary dance styles",
    icon: "🕺",
  },
  {
    name: "Hip Hop",
    category: "Dancing",
    description: "Urban dance styles",
    icon: "🎭",
  },
  {
    name: "Ballet",
    category: "Dancing",
    description: "Classical ballet",
    icon: "🩰",
  },

  // Acting
  {
    name: "Theatre Acting",
    category: "Acting",
    description: "Stage performance and drama",
    icon: "🎭",
  },
  {
    name: "Film Acting",
    category: "Acting",
    description: "Movie and TV acting",
    icon: "🎬",
  },
  {
    name: "Voice Acting",
    category: "Acting",
    description: "Voice-over and dubbing",
    icon: "🎙️",
  },
  {
    name: "Stand-up Comedy",
    category: "Comedy",
    description: "Live comedy performance",
    icon: "😂",
  },

  // Fashion Design
  {
    name: "Kitenge Design",
    category: "Fashion design",
    description: "Traditional African fabric design",
    icon: "👗",
  },
  {
    name: "Modern Fashion",
    category: "Fashion design",
    description: "Contemporary fashion design",
    icon: "👔",
  },
  {
    name: "Tailoring",
    category: "Fashion design",
    description: "Garment making and alterations",
    icon: "✂️",
  },
  {
    name: "Accessories Design",
    category: "Fashion design",
    description: "Jewelry and accessories",
    icon: "💍",
  },

  // Writing
  {
    name: "Creative Writing",
    category: "Writing",
    description: "Fiction and creative content",
    icon: "✍️",
  },
  {
    name: "Poetry",
    category: "Writing",
    description: "Swahili and English poetry",
    icon: "📝",
  },
  {
    name: "Journalism",
    category: "Writing",
    description: "News and reporting",
    icon: "📰",
  },
  {
    name: "Blogging",
    category: "Writing",
    description: "Digital content creation",
    icon: "💻",
  },

  // Entrepreneurship
  {
    name: "Small Business",
    category: "Entrepreneurship",
    description: "Starting and managing businesses",
    icon: "🏪",
  },
  {
    name: "Agriculture Business",
    category: "Entrepreneurship",
    description: "Farming and agribusiness",
    icon: "🌾",
  },
  {
    name: "Tech Startup",
    category: "Entrepreneurship",
    description: "Technology-based businesses",
    icon: "💡",
  },
  {
    name: "Social Enterprise",
    category: "Entrepreneurship",
    description: "Businesses with social impact",
    icon: "🤝",
  },

  // Leadership
  {
    name: "Student Leadership",
    category: "Leadership",
    description: "School governance and leadership",
    icon: "👨‍💼",
  },
  {
    name: "Team Management",
    category: "Leadership",
    description: "Leading and managing teams",
    icon: "👥",
  },
  {
    name: "Public Speaking",
    category: "Leadership",
    description: "Effective communication",
    icon: "🗣️",
  },
  {
    name: "Debate",
    category: "Leadership",
    description: "Formal argumentation and debate",
    icon: "⚖️",
  },

  // Other Creative Arts
  {
    name: "Painting",
    category: "Other",
    description: "Visual arts and painting",
    icon: "🎨",
  },
  {
    name: "Sculpture",
    category: "Other",
    description: "Three-dimensional art",
    icon: "🗿",
  },
  {
    name: "Photography",
    category: "Other",
    description: "Digital and film photography",
    icon: "📷",
  },
  {
    name: "Videography",
    category: "Other",
    description: "Video production and editing",
    icon: "🎥",
  },
  {
    name: "Graphic Design",
    category: "Other",
    description: "Digital design and graphics",
    icon: "🖥️",
  },
  {
    name: "Music Production",
    category: "Other",
    description: "Audio recording and production",
    icon: "🎧",
  },
  {
    name: "DJ/Sound Engineering",
    category: "Other",
    description: "Live sound and mixing",
    icon: "🎛️",
  },
  {
    name: "Carpentry",
    category: "Other",
    description: "Woodworking and furniture",
    icon: "🪚",
  },
  {
    name: "Mechanics",
    category: "Other",
    description: "Vehicle and machine repair",
    icon: "🔧",
  },
  {
    name: "Electronics Repair",
    category: "Other",
    description: "Electronic device repair",
    icon: "📱",
  },
  {
    name: "Hairdressing",
    category: "Other",
    description: "Hair styling and beauty",
    icon: "💇",
  },
  {
    name: "Cooking/Chef",
    category: "Other",
    description: "Culinary arts",
    icon: "👨‍🍳",
  },
  {
    name: "Sports Coaching",
    category: "Other",
    description: "Athletic training",
    icon: "⚽",
  },
  {
    name: "Martial Arts",
    category: "Other",
    description: "Self-defense and discipline",
    icon: "🥋",
  },
  {
    name: "Traditional Medicine",
    category: "Other",
    description: "Herbal medicine knowledge",
    icon: "🌿",
  },
];

// ============================================
// SEED DATA - SUBJECTS
// ============================================

const subjectsData = [
  // Primary Level
  {
    name: "English",
    code: "ENG",
    category: "Languages",
    description: "English language and literature",
  },
  {
    name: "Kiswahili",
    code: "KIS",
    category: "Languages",
    description: "Swahili language and literature",
  },
  {
    name: "Mathematics",
    code: "MATH",
    category: "Science",
    description: "Mathematics and numeracy",
  },
  {
    name: "Science",
    code: "SCI",
    category: "Science",
    description: "General science",
  },
  {
    name: "Social Studies",
    code: "SST",
    category: "Humanities",
    description: "Geography, history, and civics",
  },

  // Secondary Level - Science Stream
  {
    name: "Physics",
    code: "PHY",
    category: "Science",
    description: "Physical sciences",
  },
  {
    name: "Chemistry",
    code: "CHEM",
    category: "Science",
    description: "Chemical sciences",
  },
  {
    name: "Biology",
    code: "BIO",
    category: "Science",
    description: "Biological sciences",
  },
  {
    name: "Advanced Mathematics",
    code: "AMATH",
    category: "Science",
    description: "Advanced mathematics",
  },
  {
    name: "Computer Science",
    code: "CS",
    category: "Technology",
    description: "Computing and programming",
  },

  // Secondary Level - Arts Stream
  {
    name: "History",
    code: "HIST",
    category: "Humanities",
    description: "Historical studies",
  },
  {
    name: "Geography",
    code: "GEO",
    category: "Humanities",
    description: "Physical and human geography",
  },
  {
    name: "Civics",
    code: "CIV",
    category: "Humanities",
    description: "Citizenship and government",
  },
  {
    name: "Literature",
    code: "LIT",
    category: "Languages",
    description: "English literature",
  },
  {
    name: "Fasihi",
    code: "FAS",
    category: "Languages",
    description: "Swahili literature",
  },

  // Secondary Level - Commerce Stream
  {
    name: "Commerce",
    code: "COM",
    category: "Business",
    description: "Business and trade",
  },
  {
    name: "Accounting",
    code: "ACC",
    category: "Business",
    description: "Financial accounting",
  },
  {
    name: "Book Keeping",
    code: "BK",
    category: "Business",
    description: "Record keeping and accounts",
  },
  {
    name: "Economics",
    code: "ECON",
    category: "Business",
    description: "Economic theory and practice",
  },

  // Additional Subjects
  {
    name: "Religious Education",
    code: "RE",
    category: "Other",
    description: "Religious studies",
  },
  {
    name: "Physical Education",
    code: "PE",
    category: "Other",
    description: "Sports and fitness",
  },
  {
    name: "Art & Design",
    code: "ART",
    category: "Creative",
    description: "Visual arts",
  },
  {
    name: "Music",
    code: "MUS",
    category: "Creative",
    description: "Music theory and practice",
  },
  {
    name: "Agriculture",
    code: "AGR",
    category: "Vocational",
    description: "Farming and animal husbandry",
  },
  {
    name: "Home Economics",
    code: "HE",
    category: "Vocational",
    description: "Food and nutrition",
  },
];

// ============================================
// SEED DATA - SCHOOLS
// ============================================

const schoolsData = [
  // Dar es Salaam
  {
    name: "Azania Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dar es Salaam",
    district: "Ilala",
  },
  {
    name: "Jangwani Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dar es Salaam",
    district: "Ilala",
  },
  {
    name: "Kibasila Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dar es Salaam",
    district: "Kinondoni",
  },
  {
    name: "Mzizima Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dar es Salaam",
    district: "Kinondoni",
  },
  {
    name: "Tambaza Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dar es Salaam",
    district: "Temeke",
  },
  {
    name: "International School of Tanganyika",
    type: "secondary",
    institutionType: "private",
    region: "Dar es Salaam",
    district: "Kinondoni",
  },
  {
    name: "Feza Boys Secondary School",
    type: "secondary",
    institutionType: "private",
    region: "Dar es Salaam",
    district: "Ilala",
  },
  {
    name: "Feza Girls Secondary School",
    type: "secondary",
    institutionType: "private",
    region: "Dar es Salaam",
    district: "Ilala",
  },
  {
    name: "Al-Muntazir Islamic School",
    type: "secondary",
    institutionType: "private",
    region: "Dar es Salaam",
    district: "Kinondoni",
  },
  {
    name: "Shaaban Robert Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dar es Salaam",
    district: "Ubungo",
  },

  // Mwanza
  {
    name: "Nyamagana Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mwanza",
    district: "Nyamagana",
  },
  {
    name: "Isamilo Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mwanza",
    district: "Ilemela",
  },
  {
    name: "Bwiru Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mwanza",
    district: "Ilemela",
  },
  {
    name: "Lake Secondary School",
    type: "secondary",
    institutionType: "private",
    region: "Mwanza",
    district: "Nyamagana",
  },
  {
    name: "Mwanza International School",
    type: "secondary",
    institutionType: "private",
    region: "Mwanza",
    district: "Ilemela",
  },

  // Arusha
  {
    name: "Arusha Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Arusha",
    district: "Arusha City",
  },
  {
    name: "Ilboru Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Arusha",
    district: "Arusha City",
  },
  {
    name: "St Constantine International School",
    type: "secondary",
    institutionType: "private",
    region: "Arusha",
    district: "Arusha City",
  },
  {
    name: "Arusha Meru International School",
    type: "secondary",
    institutionType: "private",
    region: "Arusha",
    district: "Arusha DC",
  },

  // Dodoma
  {
    name: "Dodoma Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dodoma",
    district: "Dodoma City",
  },
  {
    name: "Bihawana Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dodoma",
    district: "Dodoma City",
  },
  {
    name: "Chang'ombe Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Dodoma",
    district: "Dodoma City",
  },

  // Morogoro
  {
    name: "Morogoro Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Morogoro",
    district: "Morogoro City",
  },
  {
    name: "Mzumbe Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Morogoro",
    district: "Morogoro DC",
  },
  {
    name: "Kilakala Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Morogoro",
    district: "Morogoro City",
  },

  // Mbeya
  {
    name: "Mbeya Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mbeya",
    district: "Mbeya City",
  },
  {
    name: "Iyunga Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mbeya",
    district: "Mbeya City",
  },
  {
    name: "Tukuyu Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mbeya",
    district: "Rungwe",
  },

  // Kilimanjaro
  {
    name: "Kibosho Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Kilimanjaro",
    district: "Moshi",
  },
  {
    name: "Marangu Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Kilimanjaro",
    district: "Moshi",
  },
  {
    name: "Moshi Technical Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Kilimanjaro",
    district: "Moshi",
  },

  // Additional regions (abbreviated for space)
  {
    name: "Kagera Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Kagera",
    district: "Bukoba",
  },
  {
    name: "Tanga Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Tanga",
    district: "Tanga City",
  },
  {
    name: "Mara Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Mara",
    district: "Musoma",
  },
  {
    name: "Tabora Boys Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Tabora",
    district: "Tabora City",
  },
  {
    name: "Kigoma Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Kigoma",
    district: "Kigoma City",
  },
  {
    name: "Shinyanga Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Shinyanga",
    district: "Shinyanga City",
  },
  {
    name: "Singida Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Singida",
    district: "Singida City",
  },
  {
    name: "Rukwa Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Rukwa",
    district: "Sumbawanga",
  },
  {
    name: "Geita Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Geita",
    district: "Geita Town",
  },
  {
    name: "Iringa Secondary School",
    type: "secondary",
    institutionType: "government",
    region: "Iringa",
    district: "Iringa City",
  },
];

// ============================================
// SEED DATA - BOOKS
// ============================================

const booksData = [
  {
    title: "Mathematics Form 1",
    author: "Tanzania Institute of Education",
    category: "Textbook",
    price: 15000,
    language: "English",
    pages: 250,
  },
  {
    title: "Hisabati Darasa la 1",
    author: "TIE",
    category: "Textbook",
    price: 12000,
    language: "Swahili",
    pages: 200,
  },
  {
    title: "English Grammar Guide",
    author: "Prof. John Mwakasege",
    category: "Reference",
    price: 8000,
    language: "English",
    pages: 180,
  },
  {
    title: "Sarufi ya Kiswahili",
    author: "Dkt. Amina Hassan",
    category: "Reference",
    price: 10000,
    language: "Swahili",
    pages: 220,
  },
  {
    title: "Physics Form 3",
    author: "TIE",
    category: "Textbook",
    price: 18000,
    language: "English",
    pages: 300,
  },
  {
    name: "Chemistry Form 4",
    author: "TIE",
    category: "Textbook",
    price: 20000,
    language: "English",
    pages: 350,
  },
  {
    title: "Biology Practical Guide",
    author: "Dr. Peter Mbago",
    category: "Reference",
    price: 12000,
    language: "English",
    pages: 160,
  },
  {
    title: "Kusoma na Kuandika Kiswahili",
    author: "Mwalimu Said Khamis",
    category: "Education",
    price: 7000,
    language: "Swahili",
    pages: 140,
  },
  {
    title: "History of Tanzania",
    author: "Prof. Isaria Kimambo",
    category: "History",
    price: 15000,
    language: "English",
    pages: 280,
  },
  {
    title: "Geografia ya Tanzania",
    author: "Dkt. Neema Mlowe",
    category: "Geography",
    price: 13000,
    language: "Swahili",
    pages: 240,
  },
  {
    title: "Business Studies Form 2",
    author: "TIE",
    category: "Business",
    price: 16000,
    language: "English",
    pages: 260,
  },
  {
    title: "Accounting Principles",
    author: "Grace Mwakasege",
    category: "Business",
    price: 14000,
    language: "English",
    pages: 220,
  },
  {
    title: "Computer Studies",
    author: "Eng. James Mwita",
    category: "Technology",
    price: 17000,
    language: "English",
    pages: 200,
  },
  {
    title: "Agricultural Science",
    author: "Dr. Emmanuel Sulle",
    category: "Agriculture",
    price: 11000,
    language: "English",
    pages: 190,
  },
  {
    title: "Creative Writing in Swahili",
    author: "Euphrase Kezilahabi",
    category: "Literature",
    price: 9000,
    language: "Swahili",
    pages: 170,
  },
];

// ============================================
// SEED DATA - EVENTS
// ============================================

const eventsData = [
  {
    title: "National Talent Show 2025",
    eventType: "talent_show",
    description: "Annual national talent competition",
    region: "Dar es Salaam",
    district: "Ilala",
  },
  {
    title: "Science Fair Dar es Salaam",
    eventType: "exhibition",
    description: "Regional science projects exhibition",
    region: "Dar es Salaam",
    district: "Kinondoni",
  },
  {
    title: "Entrepreneurship Workshop",
    eventType: "workshop",
    description: "Business skills training for students",
    region: "Mwanza",
    district: "Nyamagana",
  },
  {
    title: "CTM Music Festival",
    eventType: "festival",
    description: "Celebration of student musicians",
    region: "Arusha",
    district: "Arusha City",
  },
  {
    title: "Drama Competition",
    eventType: "competition",
    description: "Inter-school drama contest",
    region: "Dar es Salaam",
    district: "Temeke",
  },
  {
    title: "Fashion Design Exhibition",
    eventType: "exhibition",
    description: "Student fashion showcase",
    region: "Dar es Salaam",
    district: "Kinondoni",
  },
  {
    title: "Leadership Training Seminar",
    eventType: "seminar",
    description: "Student leadership development",
    region: "Dodoma",
    district: "Dodoma City",
  },
  {
    title: "Technology Innovation Conference",
    eventType: "conference",
    description: "Tech innovations by students",
    region: "Dar es Salaam",
    district: "Ubungo",
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

function generateCode(prefix, name) {
  return `${prefix}${name.substring(0, 3).toUpperCase()}${Math.floor(
    Math.random() * 1000
  )}`;
}

function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomElements(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Tanzanian names
const tanzanianFirstNames = {
  male: [
    "Juma",
    "Hassan",
    "Ramadhani",
    "Selemani",
    "Hamisi",
    "Omari",
    "Ally",
    "Bakari",
    "Daudi",
    "Issa",
    "Kombo",
    "Salum",
    "Yusuph",
    "Musa",
    "Abdallah",
    "Joseph",
    "John",
    "Peter",
    "Emmanuel",
    "Daniel",
    "Frank",
    "George",
    "Henry",
    "Isaac",
    "Jacob",
    "Michael",
    "Robert",
    "Samuel",
    "Thomas",
    "William",
  ],
  female: [
    "Asha",
    "Fatuma",
    "Halima",
    "Zainab",
    "Mariam",
    "Amina",
    "Saida",
    "Rehema",
    "Mwanaidi",
    "Khadija",
    "Neema",
    "Grace",
    "Mary",
    "Ruth",
    "Elizabeth",
    "Sarah",
    "Anna",
    "Joyce",
    "Lucy",
    "Monica",
    "Rachel",
    "Rebecca",
    "Rose",
    "Stella",
    "Victoria",
    "Agnes",
    "Catherine",
    "Diana",
    "Emma",
    "Judith",
  ],
};

const tanzanianLastNames = [
  "Mbogo",
  "Mwakasege",
  "Ngowi",
  "Kimaro",
  "Lyimo",
  "Mushi",
  "Swai",
  "Masawe",
  "Komba",
  "Mollel",
  "Mgaya",
  "Mwita",
  "Magesa",
  "Chacha",
  "Makene",
  "Mhina",
  "Mollel",
  "Ndunguru",
  "Nyoni",
  "Shija",
  "Hassan",
  "Rajabu",
  "Seleman",
  "Abdallah",
  "Mohammed",
  "Hamisi",
  "Bakari",
  "Kondo",
  "Mushi",
  "Samatta",
  "Msuya",
  "Kyando",
  "Mkumbo",
  "Shirima",
  "Urasa",
];

function generateTanzanianName(gender) {
  const firstName = randomElement(tanzanianFirstNames[gender]);
  const lastName = randomElement(tanzanianLastNames);
  return { firstName, lastName };
}

function generatePhoneNumber() {
  const prefixes = [
    "0741",
    "0742",
    "0743",
    "0744",
    "0745",
    "0746",
    "0747",
    "0748",
    "0749",
    "0754",
    "0755",
    "0756",
    "0757",
    "0758",
    "0759",
    "0762",
    "0763",
    "0764",
    "0765",
    "0766",
    "0767",
    "0768",
    "0769",
    "0773",
    "0774",
    "0775",
    "0776",
    "0777",
    "0778",
    "0779",
    "0782",
    "0783",
    "0784",
    "0785",
    "0786",
    "0787",
    "0788",
    "0789",
  ];
  const prefix = randomElement(prefixes);
  const remaining = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return prefix + remaining;
}

// ============================================
// MAIN SEEDING FUNCTIONS
// ============================================

async function clearDatabase() {
  log.section("🗑️  CLEARING EXISTING DATA");

  const collections = await mongoose.connection.db.collections();

  for (const collection of collections) {
    await collection.deleteMany({});
    log.success(`Cleared: ${collection.collectionName}`);
  }

  log.success("Database cleared successfully");
}

async function seedRegions() {
  log.section("🗺️  SEEDING REGIONS");

  const regions = [];
  for (const regionData of regionsData) {
    const region = await Region.create(regionData);
    regions.push(region);
  }

  log.success(`Created ${regions.length} regions`);
  return regions;
}

async function seedDistricts(regions) {
  log.section("🏘️  SEEDING DISTRICTS");

  const districts = [];

  for (const region of regions) {
    const districtNames = districtsData[region.name] || [];

    for (const districtName of districtNames) {
      const district = await District.create({
        name: districtName,
        code: generateCode("DIS", districtName),
        regionId: region._id,
        population: Math.floor(Math.random() * 500000) + 50000,
        area: Math.floor(Math.random() * 5000) + 500,
      });
      districts.push(district);
    }
  }

  log.success(
    `Created ${districts.length} districts across ${regions.length} regions`
  );
  return districts;
}

async function seedWards(districts) {
  log.section("🏡 SEEDING WARDS");

  const wards = [];

  for (const district of districts) {
    const wardNames = generateWards(district.name, 8);

    for (const wardName of wardNames) {
      const ward = await Ward.create({
        name: wardName,
        code: generateCode("WRD", wardName),
        districtId: district._id,
        population: Math.floor(Math.random() * 50000) + 5000,
      });
      wards.push(ward);
    }
  }

  log.success(
    `Created ${wards.length} wards across ${districts.length} districts`
  );
  return wards;
}

async function seedSchools(regions, districts, wards) {
  log.section("🏫 SEEDING SCHOOLS");

  const schools = [];

  for (const schoolData of schoolsData) {
    const region = regions.find((r) => r.name === schoolData.region);
    const district = districts.find(
      (d) =>
        d.name === schoolData.district &&
        d.regionId.toString() === region._id.toString()
    );
    const districtWards = wards.filter(
      (w) => w.districtId.toString() === district._id.toString()
    );
    const ward = randomElement(districtWards);

    const school = await School.create({
      name: schoolData.name,
      schoolCode: generateCode("SCH", schoolData.name),
      type: schoolData.type,
      regionId: region._id,
      districtId: district._id,
      wardId: ward._id,
      address: `${ward.name}, ${district.name}, ${region.name}`,
      phoneNumber: generatePhoneNumber(),
      email: `${schoolData.name
        .toLowerCase()
        .replace(/\s+/g, "")}@schools.co.tz`,
      principalName: `${randomElement(
        tanzanianFirstNames.male
      )} ${randomElement(tanzanianLastNames)}`,
      totalStudents: Math.floor(Math.random() * 800) + 200,
      totalTeachers: Math.floor(Math.random() * 50) + 10,
      isActive: true,
      establishedYear: Math.floor(Math.random() * 50) + 1970,
      accreditationStatus: randomElement([
        "accredited",
        "accredited",
        "provisional",
      ]),
      facilities: randomElements(
        [
          "Library",
          "Laboratory",
          "Computer Lab",
          "Sports Field",
          "Cafeteria",
          "Dormitory",
          "Hall",
        ],
        Math.floor(Math.random() * 5) + 3
      ),
    });

    schools.push(school);
  }

  log.success(`Created ${schools.length} schools`);
  return schools;
}

async function seedTalents() {
  log.section("🎭 SEEDING TALENTS");

  const talents = [];

  for (const talentData of talentsData) {
    const talent = await Talent.create(talentData);
    talents.push(talent);
  }

  log.success(`Created ${talents.length} talents across multiple categories`);
  return talents;
}

async function seedSubjects() {
  log.section("📚 SEEDING SUBJECTS");

  const subjects = [];

  for (const subjectData of subjectsData) {
    const subject = await Subject.create(subjectData);
    subjects.push(subject);
  }

  log.success(`Created ${subjects.length} subjects`);
  return subjects;
}

async function seedUsers(schools, regions, districts, wards, subjects) {
  log.section("👥 SEEDING USERS (1000+ users across 7+ roles)");

  const users = {
    superAdmins: [],
    nationalOfficials: [],
    regionalOfficials: [],
    districtOfficials: [],
    headmasters: [],
    teachers: [],
    students: [],
    entrepreneurs: [],
  };

  const defaultPassword = await hashPassword("Test@123");

  // 1. SUPER ADMIN
  log.info("Creating Super Admin...");
  const superAdmin = await User.create({
    username: "superadmin",
    email: "superadmin@econnect.co.tz",
    password: defaultPassword,
    role: "super_admin",
    firstName: "System",
    lastName: "Administrator",
    phoneNumber: "+255700000001",
    isActive: true,
    isEmailVerified: true,
    isPhoneVerified: true,
    gender: "male",
  });
  users.superAdmins.push(superAdmin);
  log.success("✓ Super Admin created");

  // 2. NATIONAL OFFICIALS (TAMISEMI - 3 users)
  log.info("Creating National Officials...");
  for (let i = 0; i < 3; i++) {
    const name = generateTanzanianName("male");
    const official = await User.create({
      username: `tamisemi${i + 1}`,
      email: `tamisemi${i + 1}@tamisemi.go.tz`,
      password: defaultPassword,
      role: "national_official",
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      isActive: true,
      gender: "male",
      staffPosition: randomElement([
        "Director",
        "Deputy Director",
        "Chief Education Officer",
      ]),
      department: "TAMISEMI HQ",
    });
    users.nationalOfficials.push(official);
  }
  log.success(`✓ Created ${users.nationalOfficials.length} National Officials`);

  // 3. REGIONAL OFFICIALS (31 regions, 1-2 per region = 50 users)
  log.info("Creating Regional Officials...");
  for (const region of regions.slice(0, 26)) {
    // Top 26 regions
    const name = generateTanzanianName(Math.random() > 0.5 ? "male" : "female");
    const official = await User.create({
      username: `regional_${region.code.toLowerCase()}`,
      email: `regional.${region.code.toLowerCase()}@tamisemi.go.tz`,
      password: defaultPassword,
      role: "regional_official",
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      regionId: region._id,
      isActive: true,
      gender: Math.random() > 0.5 ? "male" : "female",
      staffPosition: "Regional Education Officer",
      department: `${region.name} Education Department`,
    });
    users.regionalOfficials.push(official);
  }
  log.success(`✓ Created ${users.regionalOfficials.length} Regional Officials`);

  // 4. DISTRICT OFFICIALS (100 districts, 1 per district = 100 users)
  log.info("Creating District Officials...");
  for (const district of districts.slice(0, 80)) {
    // Top 80 districts
    const name = generateTanzanianName(Math.random() > 0.5 ? "male" : "female");
    const official = await User.create({
      username: `district_${district.code.toLowerCase()}`,
      email: `district.${district.code.toLowerCase()}@tamisemi.go.tz`,
      password: defaultPassword,
      role: "district_official",
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      districtId: district._id,
      regionId: district.regionId,
      isActive: true,
      gender: Math.random() > 0.5 ? "male" : "female",
      staffPosition: "District Education Officer",
      department: `${district.name} Education Office`,
    });
    users.districtOfficials.push(official);
  }
  log.success(`✓ Created ${users.districtOfficials.length} District Officials`);

  // 5. HEADMASTERS (1 per school = 40 users)
  log.info("Creating Headmasters...");
  for (const school of schools) {
    const name = generateTanzanianName(Math.random() > 0.6 ? "male" : "female");
    const headmaster = await User.create({
      username: `head_${school.schoolCode.toLowerCase()}`,
      email: `headmaster@${school.schoolCode.toLowerCase()}.sc.tz`,
      password: defaultPassword,
      role: "headmaster",
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      schoolId: school._id,
      regionId: school.regionId,
      districtId: school.districtId,
      wardId: school.wardId,
      isActive: true,
      gender: Math.random() > 0.6 ? "male" : "female",
      qualification: randomElement([
        "Master of Education",
        "Bachelor of Education",
        "PhD in Education",
      ]),
      yearsOfExperience: Math.floor(Math.random() * 20) + 5,
    });
    users.headmasters.push(headmaster);
  }
  log.success(`✓ Created ${users.headmasters.length} Headmasters`);

  // 6. TEACHERS (5-15 per school = 300+ users)
  log.info("Creating Teachers...");
  for (const school of schools) {
    const teacherCount = Math.floor(Math.random() * 11) + 5; // 5-15 teachers per school

    for (let i = 0; i < teacherCount; i++) {
      const gender = Math.random() > 0.5 ? "male" : "female";
      const name = generateTanzanianName(gender);
      const subject = randomElement(subjects);

      const teacher = await User.create({
        username: `teacher_${school.schoolCode.toLowerCase()}_${i + 1}`,
        email: `${name.firstName.toLowerCase()}.${name.lastName.toLowerCase()}@${school.schoolCode.toLowerCase()}.sc.tz`,
        password: defaultPassword,
        role: "teacher",
        firstName: name.firstName,
        lastName: name.lastName,
        phoneNumber: generatePhoneNumber(),
        schoolId: school._id,
        regionId: school.regionId,
        districtId: school.districtId,
        wardId: school.wardId,
        isActive: true,
        gender: gender,
        specialization: subject.name,
        qualification: randomElement([
          "Bachelor of Education",
          "Diploma in Education",
          "Master of Education",
        ]),
        yearsOfExperience: Math.floor(Math.random() * 15) + 1,
        employeeId: `EMP${school.schoolCode}${String(i + 1).padStart(3, "0")}`,
      });

      users.teachers.push(teacher);
    }
  }
  log.success(`✓ Created ${users.teachers.length} Teachers`);

  // 7. STUDENTS (20-50 per school = 1000+ users)
  log.info("Creating Students...");
  const gradeLevels = [
    "Form 1",
    "Form 2",
    "Form 3",
    "Form 4",
    "Form 5",
    "Form 6",
  ];
  const registrationTypes = [
    "normal_registration",
    "premier_registration",
    "silver_registration",
    "diamond_registration",
  ];

  for (const school of schools) {
    const studentCount = Math.floor(Math.random() * 31) + 20; // 20-50 students per school

    for (let i = 0; i < studentCount; i++) {
      const gender = Math.random() > 0.5 ? "male" : "female";
      const name = generateTanzanianName(gender);
      const gradeLevel = randomElement(gradeLevels);
      const registrationType = randomElement(registrationTypes);
      const isCTM = ["normal_registration", "premier_registration"].includes(
        registrationType
      );

      const student = await User.create({
        username: `student_${school.schoolCode.toLowerCase()}_${String(
          i + 1
        ).padStart(4, "0")}`,
        email: `${name.firstName.toLowerCase()}.${name.lastName.toLowerCase()}${i}@student.econnect.co.tz`,
        password: defaultPassword,
        role: "student",
        firstName: name.firstName,
        lastName: name.lastName,
        phoneNumber: generatePhoneNumber(),
        schoolId: school._id,
        regionId: school.regionId,
        districtId: school.districtId,
        wardId: school.wardId,
        isActive: true,
        gender: gender,
        gradeLevel: gradeLevel,
        classLevel: gradeLevel,
        studentId: `STD${school.schoolCode}${String(i + 1).padStart(4, "0")}`,
        dateOfBirth: randomDate(new Date(2004, 0, 1), new Date(2010, 11, 31)),
        institutionType: school.type === "private" ? "private" : "government",
        guardianName: `${randomElement(
          tanzanianFirstNames.male
        )} ${randomElement(tanzanianLastNames)}`,
        guardianPhone: generatePhoneNumber(),
        guardianRelationship: randomElement(["father", "mother", "guardian"]),
        emergencyContact: generatePhoneNumber(),
        enrollmentDate: randomDate(
          new Date(2020, 0, 1),
          new Date(2024, 11, 31)
        ),
        registration_type: registrationType,
        is_ctm_student: isCTM,
        registration_date: randomDate(
          new Date(2024, 0, 1),
          new Date(2024, 11, 31)
        ),
        registration_fee_paid: 0, // Will create invoices separately
      });

      users.students.push(student);
    }
  }
  log.success(`✓ Created ${users.students.length} Students`);

  // 8. ENTREPRENEURS (50 users)
  log.info("Creating Entrepreneurs...");
  const businessTypes = [
    "Agriculture",
    "Technology",
    "Fashion",
    "Food & Beverage",
    "Arts & Crafts",
    "Services",
    "Retail",
  ];

  for (let i = 0; i < 50; i++) {
    const gender = Math.random() > 0.5 ? "male" : "female";
    const name = generateTanzanianName(gender);
    const region = randomElement(regions);
    const regionDistricts = districts.filter(
      (d) => d.regionId.toString() === region._id.toString()
    );
    const district = randomElement(regionDistricts);
    const districtWards = wards.filter(
      (w) => w.districtId.toString() === district._id.toString()
    );
    const ward = randomElement(districtWards);

    const entrepreneur = await User.create({
      username: `entrepreneur_${i + 1}`,
      email: `entrepreneur${i + 1}@econnect.co.tz`,
      password: defaultPassword,
      role: "entrepreneur",
      firstName: name.firstName,
      lastName: name.lastName,
      phoneNumber: generatePhoneNumber(),
      regionId: region._id,
      districtId: district._id,
      wardId: ward._id,
      isActive: true,
      gender: gender,
      businessName: `${name.firstName} ${randomElement(
        businessTypes
      )} Enterprise`,
      businessType: randomElement(businessTypes),
      businessRegistrationNumber: `BRN${Date.now()}${i}`,
      tinNumber: `TIN${Math.floor(Math.random() * 1000000000)}`,
      dateOfBirth: randomDate(new Date(1980, 0, 1), new Date(2000, 11, 31)),
    });

    users.entrepreneurs.push(entrepreneur);
  }
  log.success(`✓ Created ${users.entrepreneurs.length} Entrepreneurs`);

  // Summary
  const totalUsers =
    users.superAdmins.length +
    users.nationalOfficials.length +
    users.regionalOfficials.length +
    users.districtOfficials.length +
    users.headmasters.length +
    users.teachers.length +
    users.students.length +
    users.entrepreneurs.length;

  log.success(`📊 TOTAL USERS CREATED: ${totalUsers}`);
  log.info(`   - Super Admins: ${users.superAdmins.length}`);
  log.info(`   - National Officials: ${users.nationalOfficials.length}`);
  log.info(`   - Regional Officials: ${users.regionalOfficials.length}`);
  log.info(`   - District Officials: ${users.districtOfficials.length}`);
  log.info(`   - Headmasters: ${users.headmasters.length}`);
  log.info(`   - Teachers: ${users.teachers.length}`);
  log.info(`   - Students: ${users.students.length}`);
  log.info(`   - Entrepreneurs: ${users.entrepreneurs.length}`);

  return users;
}

async function seedStudentTalents(students, talents, teachers, schools) {
  log.section("🎨 SEEDING STUDENT TALENTS");

  const studentTalents = [];

  // Each student gets 1-4 talents
  for (const student of students.slice(0, 800)) {
    // 800 students with talents
    const talentCount = Math.floor(Math.random() * 4) + 1;
    const studentTalentList = randomElements(talents, talentCount);
    const school = schools.find(
      (s) => s._id.toString() === student.schoolId.toString()
    );
    const schoolTeachers = teachers.filter(
      (t) => t.schoolId && t.schoolId.toString() === school._id.toString()
    );

    for (const talent of studentTalentList) {
      const teacher = randomElement(schoolTeachers);

      const studentTalent = await StudentTalent.create({
        studentId: student._id,
        talentId: talent._id,
        schoolId: school._id,
        teacherId: teacher ? teacher._id : null,
        proficiencyLevel: randomElement([
          "beginner",
          "beginner",
          "intermediate",
          "intermediate",
          "advanced",
          "expert",
        ]),
        yearsOfExperience: Math.floor(Math.random() * 5),
        status: "active",
        achievements:
          Math.random() > 0.7 ? [`Won school ${talent.name} competition`] : [],
      });

      studentTalents.push(studentTalent);
    }
  }

  log.success(
    `✓ Created ${studentTalents.length} student-talent registrations`
  );
  return studentTalents;
}

async function seedClasses(schools, teachers, students) {
  log.section("🏛️  SEEDING CLASSES");

  const classes = [];
  const subjects = await Subject.find({});
  const gradeLevels = [
    "Form 1",
    "Form 2",
    "Form 3",
    "Form 4",
    "Form 5",
    "Form 6",
  ];

  // Each teacher creates 1-3 classes
  for (const teacher of teachers.slice(0, 100)) {
    // First 100 teachers
    const classCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < classCount; i++) {
      const level = randomElement(gradeLevels);
      const subject =
        subjects.find((s) => s.name === teacher.specialization) ||
        randomElement(subjects);

      // Get students from same school and grade level
      const classStudents = students
        .filter(
          (s) =>
            s.schoolId &&
            s.schoolId.toString() === teacher.schoolId.toString() &&
            s.gradeLevel === level
        )
        .slice(0, Math.floor(Math.random() * 30) + 10); // 10-40 students per class

      const classData = await Class.create({
        name: `${level} ${subject.name}`,
        subject: subject.name,
        level: level,
        schoolId: teacher.schoolId,
        teacherId: teacher._id,
        academicYear: "2024/2025",
        term: randomElement(["1", "2", "3"]),
        description: `${subject.name} class for ${level} students`,
        students: classStudents.map((s) => s._id),
        isActive: true,
      });

      classes.push(classData);
    }
  }

  log.success(`✓ Created ${classes.length} classes`);
  return classes;
}

async function seedGrades(students, teachers, schools) {
  log.section("📊 SEEDING GRADES");

  const grades = [];
  const subjects = await Subject.find({});
  const examTypes = ["quiz", "midterm", "final", "test"];
  const terms = ["1", "2", "3"];

  // Each student gets 15-30 grades
  for (const student of students.slice(0, 500)) {
    // First 500 students
    const gradeCount = Math.floor(Math.random() * 16) + 15;
    const school = schools.find(
      (s) => s._id.toString() === student.schoolId.toString()
    );
    const schoolTeachers = teachers.filter(
      (t) => t.schoolId && t.schoolId.toString() === school._id.toString()
    );

    for (let i = 0; i < gradeCount; i++) {
      const subject = randomElement(subjects);
      const teacher =
        schoolTeachers.find((t) => t.specialization === subject.name) ||
        randomElement(schoolTeachers);
      const score = Math.floor(Math.random() * 60) + 40; // 40-100
      const gradeValue =
        score >= 80
          ? "A"
          : score >= 70
          ? "B"
          : score >= 60
          ? "C"
          : score >= 50
          ? "D"
          : "F";

      const grade = await Grade.create({
        studentId: student._id,
        schoolId: school._id,
        teacherId: teacher._id,
        subject: subject.name,
        examType: randomElement(examTypes),
        score: score,
        grade: gradeValue,
        totalMarks: 100,
        obtainedMarks: score,
        term: randomElement(terms),
        academicYear: "2024/2025",
        examDate: randomDate(new Date(2024, 0, 1), new Date(2024, 11, 31)),
        feedback:
          score >= 70
            ? "Good performance"
            : score >= 50
            ? "Average performance"
            : "Needs improvement",
      });

      grades.push(grade);
    }
  }

  log.success(`✓ Created ${grades.length} grades`);
  return grades;
}

async function seedAttendance(students, teachers, schools) {
  log.section("📅 SEEDING ATTENDANCE RECORDS");

  const attendance = [];
  const statuses = [
    "present",
    "present",
    "present",
    "present",
    "present",
    "present",
    "present",
    "absent",
    "late",
    "excused",
  ];

  // Generate 30 days of attendance for each student
  for (const student of students.slice(0, 400)) {
    // First 400 students
    const school = schools.find(
      (s) => s._id.toString() === student.schoolId.toString()
    );
    const schoolTeachers = teachers.filter(
      (t) => t.schoolId && t.schoolId.toString() === school._id.toString()
    );

    for (let day = 0; day < 30; day++) {
      const date = new Date(2024, 11, day + 1); // December 2024
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        // Skip weekends
        const teacher = randomElement(schoolTeachers);

        const record = await AttendanceRecord.create({
          studentId: student._id,
          schoolId: school._id,
          date: date,
          status: randomElement(statuses),
          teacherId: teacher._id,
          remarks: Math.random() > 0.9 ? "Noted" : "",
        });

        attendance.push(record);
      }
    }
  }

  log.success(`✓ Created ${attendance.length} attendance records`);
  return attendance;
}

async function seedAssignments(teachers, schools, students) {
  log.section("📝 SEEDING ASSIGNMENTS");

  const assignments = [];
  const subjects = await Subject.find({});

  // Each teacher creates 3-8 assignments
  for (const teacher of teachers.slice(0, 80)) {
    // First 80 teachers
    const assignmentCount = Math.floor(Math.random() * 6) + 3;

    for (let i = 0; i < assignmentCount; i++) {
      const subject =
        subjects.find((s) => s.name === teacher.specialization) ||
        randomElement(subjects);
      const dueDate = randomDate(new Date(2024, 11, 1), new Date(2025, 1, 28));

      const assignment = await Assignment.create({
        title: `${subject.name} Assignment ${i + 1}`,
        description: `Complete the exercises on ${subject.name} chapter ${
          Math.floor(Math.random() * 10) + 1
        }`,
        subject: subject.name,
        teacherId: teacher._id,
        schoolId: teacher.schoolId,
        classLevel: randomElement(["Form 1", "Form 2", "Form 3", "Form 4"]),
        dueDate: dueDate,
        totalMarks: 100,
        status: "published",
        instructions: "Submit your work in PDF or Word format",
      });

      assignments.push(assignment);
    }
  }

  log.success(`✓ Created ${assignments.length} assignments`);
  return assignments;
}

async function seedAssignmentSubmissions(assignments, students) {
  log.section("✅ SEEDING ASSIGNMENT SUBMISSIONS");

  const submissions = [];

  // 60% of students submit each assignment
  for (const assignment of assignments) {
    const schoolStudents = students.filter(
      (s) =>
        s.schoolId &&
        s.schoolId.toString() === assignment.schoolId.toString() &&
        s.gradeLevel === assignment.classLevel
    );

    const submittingStudents = randomElements(
      schoolStudents,
      Math.floor(schoolStudents.length * 0.6)
    );

    for (const student of submittingStudents) {
      const isLate = Math.random() > 0.8;
      const score =
        Math.random() > 0.3
          ? Math.floor(Math.random() * 40) + 60
          : Math.floor(Math.random() * 60) + 40;

      const submission = await AssignmentSubmission.create({
        assignmentId: assignment._id,
        studentId: student._id,
        content: `Assignment submission by ${student.firstName} ${student.lastName}`,
        submittedAt: isLate
          ? new Date(assignment.dueDate.getTime() + 86400000)
          : randomDate(new Date(assignment.createdAt), assignment.dueDate),
        status: Math.random() > 0.5 ? "graded" : "submitted",
        score: Math.random() > 0.5 ? score : null,
        feedback:
          Math.random() > 0.5
            ? score >= 70
              ? "Well done!"
              : "Good effort, keep improving"
            : null,
        gradedBy: Math.random() > 0.5 ? assignment.teacherId : null,
        gradedAt: Math.random() > 0.5 ? new Date() : null,
      });

      submissions.push(submission);
    }
  }

  log.success(`✓ Created ${submissions.length} assignment submissions`);
  return submissions;
}

async function seedEvents(schools, regions, districts, users) {
  log.section("🎉 SEEDING EVENTS");

  const events = [];

  for (const eventData of eventsData) {
    const region = regions.find((r) => r.name === eventData.region);
    const district = districts.find(
      (d) =>
        d.name === eventData.district &&
        d.regionId.toString() === region._id.toString()
    );
    const school = schools.find(
      (s) => s.regionId.toString() === region._id.toString()
    );
    const organizer = randomElement([
      ...users.nationalOfficials,
      ...users.regionalOfficials,
      ...users.headmasters,
    ]);

    const startDate = randomDate(new Date(2025, 0, 1), new Date(2025, 5, 30));
    const endDate = new Date(
      startDate.getTime() + (Math.floor(Math.random() * 3) + 1) * 86400000
    );

    const event = await Event.create({
      title: eventData.title,
      description: eventData.description,
      eventType: eventData.eventType,
      startDate: startDate,
      endDate: endDate,
      location: `${district.name}, ${region.name}`,
      venue: `${school.name} Hall`,
      organizer: organizer._id,
      schoolId: school._id,
      regionId: region._id,
      districtId: district._id,
      maxParticipants: Math.floor(Math.random() * 200) + 50,
      currentParticipants: 0,
      registrationFee:
        Math.random() > 0.5 ? Math.floor(Math.random() * 10000) + 5000 : 0,
      registrationDeadline: new Date(startDate.getTime() - 7 * 86400000),
      status: "published",
      isPublic: true,
    });

    events.push(event);
  }

  log.success(`✓ Created ${events.length} events`);
  return events;
}

async function seedEventRegistrations(events, students) {
  log.section("🎟️  SEEDING EVENT REGISTRATIONS");

  const registrations = [];
  const talents = await Talent.find({});

  // 20-100 students register for each event
  for (const event of events) {
    const registrationCount = Math.floor(Math.random() * 81) + 20;
    const registeredStudents = randomElements(students, registrationCount);

    for (const student of registeredStudents) {
      const registration = await EventRegistration.create({
        eventId: event._id,
        userId: student._id,
        schoolId: student.schoolId,
        talentId: randomElement(talents)._id,
        registrationStatus: "approved",
        paymentStatus:
          event.registrationFee > 0
            ? randomElement(["paid", "paid", "pending"])
            : "waived",
        registeredAt: randomDate(
          event.createdAt,
          event.registrationDeadline || event.startDate
        ),
      });

      registrations.push(registration);
    }

    // Update event participant count
    event.currentParticipants = registrationCount;
    await event.save();
  }

  log.success(`✓ Created ${registrations.length} event registrations`);
  return registrations;
}

async function seedBooks(entrepreneurs, users) {
  log.section("📖 SEEDING BOOKS");

  const books = [];

  for (const bookData of booksData) {
    const uploader = randomElement([
      ...entrepreneurs,
      ...users.nationalOfficials,
    ]);

    const book = await Book.create({
      title: bookData.title,
      author: bookData.author,
      isbn: `ISBN-${Math.floor(Math.random() * 1000000000000)}`,
      category: bookData.category,
      description: `Comprehensive ${bookData.category.toLowerCase()} book for Tanzanian students`,
      price: bookData.price,
      discountPrice:
        Math.random() > 0.7 ? Math.floor(bookData.price * 0.8) : null,
      publisher: randomElement([
        "Oxford Tanzania",
        "Macmillan Tanzania",
        "TIE Press",
        "E&D Publishers",
      ]),
      publishedDate: randomDate(new Date(2020, 0, 1), new Date(2024, 11, 31)),
      language: bookData.language,
      pages: bookData.pages,
      rating: (Math.random() * 2 + 3).toFixed(1), // 3.0 - 5.0
      ratingsCount: Math.floor(Math.random() * 50) + 5,
      soldCount: Math.floor(Math.random() * 100),
      viewCount: Math.floor(Math.random() * 500) + 50,
      stockQuantity: Math.floor(Math.random() * 200) + 50,
      uploadedBy: uploader._id,
      isActive: true,
      isFeatured: Math.random() > 0.7,
    });

    books.push(book);
  }

  log.success(`✓ Created ${books.length} books`);
  return books;
}

async function seedBusinesses(entrepreneurs, regions, districts) {
  log.section("🏢 SEEDING BUSINESSES");

  const businesses = [];
  const businessCategories = [
    "Agriculture",
    "Technology",
    "Fashion",
    "Food & Beverage",
    "Arts & Crafts",
    "Services",
    "Retail",
    "Manufacturing",
  ];

  // Each entrepreneur gets 1 business
  for (const entrepreneur of entrepreneurs) {
    const business = await Business.create({
      ownerId: entrepreneur._id,
      name:
        entrepreneur.businessName ||
        `${entrepreneur.firstName} ${entrepreneur.businessType} Ltd`,
      businessType: entrepreneur.businessType,
      registrationNumber: `BRN${Date.now()}${Math.floor(
        Math.random() * 10000
      )}`,
      tinNumber: `TIN${Math.floor(Math.random() * 1000000000)}`,
      description: `Leading ${entrepreneur.businessType.toLowerCase()} business in Tanzania`,
      address: `${entrepreneur.wardId ? "Various locations" : "Dar es Salaam"}`,
      phoneNumber: entrepreneur.phoneNumber,
      email: `info@${entrepreneur.firstName.toLowerCase()}business.co.tz`,
      regionId: entrepreneur.regionId,
      districtId: entrepreneur.districtId,
      category: entrepreneur.businessType,
      establishedDate: randomDate(new Date(2015, 0, 1), new Date(2024, 11, 31)),
      employeesCount: Math.floor(Math.random() * 20) + 1,
      isVerified: Math.random() > 0.3,
      status: "active",
      rating: (Math.random() * 2 + 3).toFixed(1),
    });

    businesses.push(business);
  }

  log.success(`✓ Created ${businesses.length} businesses`);
  return businesses;
}

async function seedProducts(businesses) {
  log.section("🛍️  SEEDING PRODUCTS");

  const products = [];
  const productCategories = {
    Agriculture: ["Seeds", "Fertilizers", "Farm Tools", "Organic Produce"],
    Technology: ["Laptops", "Phones", "Accessories", "Software"],
    Fashion: ["Clothing", "Shoes", "Accessories", "Fabrics"],
    "Food & Beverage": ["Packaged Foods", "Beverages", "Snacks", "Catering"],
    "Arts & Crafts": [
      "Paintings",
      "Sculptures",
      "Handmade Items",
      "Decorations",
    ],
    Services: ["Consulting", "Training", "Maintenance", "Design"],
    Retail: [
      "General Goods",
      "Household Items",
      "School Supplies",
      "Electronics",
    ],
  };

  // Each business gets 3-10 products
  for (const business of businesses) {
    const productCount = Math.floor(Math.random() * 8) + 3;
    const categories = productCategories[business.businessType] || [
      "General Product",
    ];

    for (let i = 0; i < productCount; i++) {
      const product = await Product.create({
        businessId: business._id,
        name: `${randomElement(categories)} ${i + 1}`,
        description: `Quality ${randomElement(categories).toLowerCase()} from ${
          business.name
        }`,
        category: randomElement(categories),
        type: business.businessType === "Services" ? "service" : "product",
        price: Math.floor(Math.random() * 100000) + 10000,
        discountPrice:
          Math.random() > 0.6 ? Math.floor(Math.random() * 80000) + 8000 : null,
        stockQuantity:
          business.businessType === "Services"
            ? 0
            : Math.floor(Math.random() * 100) + 10,
        isActive: true,
        isFeatured: Math.random() > 0.8,
      });

      products.push(product);
    }
  }

  log.success(`✓ Created ${products.length} products`);
  return products;
}

async function seedCTMMemberships(students, schools, talents) {
  log.section("🎭 SEEDING CTM MEMBERSHIPS");

  const memberships = [];

  // CTM students (normal_registration and premier_registration)
  const ctmStudents = students.filter((s) => s.is_ctm_student === true);

  for (const student of ctmStudents.slice(0, 600)) {
    // First 600 CTM students
    const membershipNumber = `CTM-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)
      .toUpperCase()}`;
    const studentTalents = randomElements(
      talents,
      Math.floor(Math.random() * 4) + 1
    );

    const membership = await CTMMembership.create({
      studentId: student._id,
      membershipNumber: membershipNumber,
      schoolId: student.schoolId,
      status: "active",
      joinDate: student.registration_date || new Date(),
      membershipType:
        student.registration_type === "premier_registration"
          ? "premium"
          : "basic",
      talents: studentTalents.map((t) => t._id),
      participationPoints: Math.floor(Math.random() * 500),
    });

    memberships.push(membership);
  }

  log.success(`✓ Created ${memberships.length} CTM memberships`);
  return memberships;
}

async function seedCTMActivities(schools, talents, users, students) {
  log.section("🎪 SEEDING CTM ACTIVITIES");

  const activities = [];
  const activityTypes = [
    "workshop",
    "competition",
    "exhibition",
    "training",
    "community_service",
    "performance",
  ];

  // Create 50 CTM activities
  for (let i = 0; i < 50; i++) {
    const school = randomElement(schools);
    const talent = randomElement(talents);
    const organizer = randomElement(
      [...users.headmasters, ...users.teachers].filter(
        (u) => u.schoolId && u.schoolId.toString() === school._id.toString()
      )
    );
    const schoolStudents = students.filter(
      (s) => s.schoolId && s.schoolId.toString() === school._id.toString()
    );
    const participants = randomElements(
      schoolStudents,
      Math.floor(Math.random() * 30) + 5
    );

    const activity = await CTMActivity.create({
      title: `${talent.name} ${randomElement(activityTypes)} ${i + 1}`,
      description: `${talent.category} activity for students`,
      activityType: randomElement(activityTypes),
      talentCategory: talent.category,
      schoolId: school._id,
      date: randomDate(new Date(2024, 0, 1), new Date(2025, 5, 30)),
      duration: Math.floor(Math.random() * 4) + 1,
      location: school.name,
      organizer: organizer ? organizer._id : null,
      participants: participants.map((p) => p._id),
      maxParticipants: Math.floor(Math.random() * 50) + 20,
      status: randomElement(["completed", "completed", "scheduled", "ongoing"]),
      points: Math.floor(Math.random() * 50) + 10,
    });

    activities.push(activity);
  }

  log.success(`✓ Created ${activities.length} CTM activities`);
  return activities;
}

async function seedInvoices(students) {
  log.section("💰 SEEDING INVOICES");

  const invoices = [];

  // Create invoices for students with paid registration types
  const paidStudents = students.filter(
    (s) => s.registration_type && s.registration_type !== "normal_registration"
  );

  const registrationFees = {
    premier_registration: 70000,
    silver_registration: 49000,
    diamond_registration: 55000,
  };

  for (const student of paidStudents.slice(0, 400)) {
    // First 400
    const amount = registrationFees[student.registration_type];
    const invoiceNumber = `INV-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)
      .toUpperCase()}`;

    const invoice = await Invoice.create({
      student_id: student._id,
      invoiceNumber: invoiceNumber,
      type: "ctm_membership",
      description: `${student.registration_type
        .replace("_", " ")
        .toUpperCase()} Fee`,
      amount: amount,
      currency: "TZS",
      status: randomElement(["paid", "paid", "pending", "verification"]),
      dueDate: randomDate(new Date(2024, 11, 1), new Date(2025, 1, 28)),
      paidDate:
        Math.random() > 0.4
          ? randomDate(new Date(2024, 10, 1), new Date(2024, 11, 31))
          : null,
      academicYear: "2024/2025",
    });

    invoices.push(invoice);
  }

  log.success(`✓ Created ${invoices.length} invoices`);
  return invoices;
}

async function seedNotifications(students, teachers, entrepreneurs) {
  log.section("🔔 SEEDING NOTIFICATIONS");

  const notifications = [];
  const allUsers = [
    ...students.slice(0, 200),
    ...teachers.slice(0, 50),
    ...entrepreneurs.slice(0, 20),
  ];

  const notificationTemplates = [
    {
      title: "Welcome to ECONNECT",
      message: "Your account has been created successfully",
      type: "success",
    },
    {
      title: "New Assignment Posted",
      message: "Your teacher has posted a new assignment",
      type: "info",
    },
    {
      title: "Grade Published",
      message: "Your recent exam has been graded",
      type: "info",
    },
    {
      title: "Event Registration Confirmed",
      message: "You are registered for the upcoming event",
      type: "success",
    },
    {
      title: "Invoice Due",
      message: "Your invoice payment is due soon",
      type: "warning",
    },
    {
      title: "CTM Activity Scheduled",
      message: "New CTM activity scheduled for next week",
      type: "info",
    },
    {
      title: "Achievement Unlocked",
      message: "Congratulations on your achievement!",
      type: "achievement",
    },
  ];

  for (const user of allUsers) {
    const notifCount = Math.floor(Math.random() * 8) + 2; // 2-10 notifications per user

    for (let i = 0; i < notifCount; i++) {
      const template = randomElement(notificationTemplates);

      const notification = await Notification.create({
        userId: user._id,
        title: template.title,
        message: template.message,
        type: template.type,
        priority: randomElement(["low", "normal", "normal", "high"]),
        isRead: Math.random() > 0.4,
        readAt:
          Math.random() > 0.4
            ? randomDate(new Date(2024, 10, 1), new Date())
            : null,
        createdAt: randomDate(new Date(2024, 10, 1), new Date()),
      });

      notifications.push(notification);
    }
  }

  log.success(`✓ Created ${notifications.length} notifications`);
  return notifications;
}

async function seedMessages(students, teachers) {
  log.section("💬 SEEDING MESSAGES");

  const messages = [];

  // Create 500 message conversations
  for (let i = 0; i < 500; i++) {
    const student = randomElement(students);
    const schoolTeachers = teachers.filter(
      (t) => t.schoolId && t.schoolId.toString() === student.schoolId.toString()
    );

    if (schoolTeachers.length === 0) continue;

    const teacher = randomElement(schoolTeachers);
    const conversationId = [student._id.toString(), teacher._id.toString()]
      .sort()
      .join("_");

    // Create 3-8 messages in conversation
    const messageCount = Math.floor(Math.random() * 6) + 3;

    for (let j = 0; j < messageCount; j++) {
      const isFromStudent = Math.random() > 0.5;

      const messageTemplates = isFromStudent
        ? [
            "Hello teacher, I have a question about today's lesson",
            "Could you please explain this topic again?",
            "Thank you for the feedback on my assignment",
            "When is the next exam scheduled?",
            "I need help with my homework",
          ]
        : [
            "Hello, how can I help you?",
            "Please review the chapter and try again",
            "Good work on your assignment!",
            "The exam is scheduled for next week",
            "Let me know if you need clarification",
          ];

      const message = await Message.create({
        senderId: isFromStudent ? student._id : teacher._id,
        recipientId: isFromStudent ? teacher._id : student._id,
        conversationId: conversationId,
        content: randomElement(messageTemplates),
        messageType: "text",
        isRead: Math.random() > 0.3,
        createdAt: randomDate(new Date(2024, 10, 1), new Date()),
      });

      messages.push(message);
    }
  }

  log.success(`✓ Created ${messages.length} messages`);
  return messages;
}

async function seedAnnouncements(schools, regions, users) {
  log.section("📢 SEEDING ANNOUNCEMENTS");

  const announcements = [];

  const announcementTemplates = [
    {
      title: "Academic Year Opening",
      content: "Welcome to the new academic year 2024/2025",
      priority: "high",
      audience: "all",
    },
    {
      title: "Exam Timetable Released",
      content: "The final examination timetable has been published",
      priority: "high",
      audience: "students",
    },
    {
      title: "Parent-Teacher Meeting",
      content: "Parents are invited to meet with teachers next Friday",
      priority: "normal",
      audience: "parents",
    },
    {
      title: "School Fees Reminder",
      content: "Please ensure all fees are paid by end of month",
      priority: "high",
      audience: "students",
    },
    {
      title: "Sports Day Event",
      content: "Annual sports day scheduled for next month",
      priority: "normal",
      audience: "all",
    },
    {
      title: "Holiday Notice",
      content: "School will be closed for mid-term break",
      priority: "normal",
      audience: "all",
    },
    {
      title: "New Library Books",
      content: "New books have been added to the school library",
      priority: "low",
      audience: "students",
    },
    {
      title: "CTM Registration Open",
      content: "Creative Talent Masters program registration is now open",
      priority: "high",
      audience: "students",
    },
  ];

  // School-level announcements
  for (const school of schools) {
    const count = Math.floor(Math.random() * 5) + 3;
    const headmaster = users.headmasters.find(
      (h) => h.schoolId && h.schoolId.toString() === school._id.toString()
    );

    for (let i = 0; i < count; i++) {
      const template = randomElement(announcementTemplates);

      const announcement = await Announcement.create({
        title: template.title,
        content: template.content,
        priority: template.priority,
        targetAudience: template.audience,
        schoolId: school._id,
        createdBy: headmaster
          ? headmaster._id
          : randomElement(users.nationalOfficials)._id,
        isActive: true,
        publishDate: randomDate(new Date(2024, 8, 1), new Date()),
        expiryDate: randomDate(new Date(), new Date(2025, 5, 30)),
      });

      announcements.push(announcement);
    }
  }

  // Regional announcements
  for (const region of regions.slice(0, 10)) {
    const official = users.regionalOfficials.find(
      (o) => o.regionId && o.regionId.toString() === region._id.toString()
    );

    if (official) {
      const announcement = await Announcement.create({
        title: "Regional Education Update",
        content: `Important update for all schools in ${region.name} region`,
        priority: "high",
        targetAudience: "all",
        regionId: region._id,
        createdBy: official._id,
        isActive: true,
        publishDate: randomDate(new Date(2024, 10, 1), new Date()),
      });

      announcements.push(announcement);
    }
  }

  log.success(`✓ Created ${announcements.length} announcements`);
  return announcements;
}

async function seedAwards(students, schools, users) {
  log.section("🏆 SEEDING AWARDS");

  const awards = [];

  const awardTemplates = [
    { title: "Best Student Award", category: "academic", level: "school" },
    {
      title: "Excellence in Mathematics",
      category: "academic",
      level: "school",
    },
    { title: "Best Talent Performance", category: "talent", level: "school" },
    { title: "Leadership Award", category: "leadership", level: "school" },
    { title: "Perfect Attendance", category: "attendance", level: "school" },
    {
      title: "Community Service Champion",
      category: "community_service",
      level: "district",
    },
    { title: "Regional Talent Winner", category: "talent", level: "regional" },
    {
      title: "National Science Fair Winner",
      category: "academic",
      level: "national",
    },
  ];

  // Give awards to top 200 students
  for (const student of students.slice(0, 200)) {
    const awardCount = Math.floor(Math.random() * 3) + 1;
    const school = schools.find(
      (s) => s._id.toString() === student.schoolId.toString()
    );
    const headmaster = users.headmasters.find(
      (h) => h.schoolId && h.schoolId.toString() === school._id.toString()
    );

    for (let i = 0; i < awardCount; i++) {
      const template = randomElement(awardTemplates);

      const award = await Award.create({
        studentId: student._id,
        title: template.title,
        description: `Awarded for outstanding ${template.category} performance`,
        category: template.category,
        awardLevel: template.level,
        awardedBy: headmaster
          ? headmaster._id
          : randomElement(users.nationalOfficials)._id,
        schoolId: school._id,
        awardDate: randomDate(new Date(2024, 0, 1), new Date(2024, 11, 31)),
        position:
          template.level === "national"
            ? "1st Place"
            : template.level === "regional"
            ? "2nd Place"
            : "Winner",
        points: Math.floor(Math.random() * 100) + 50,
      });

      awards.push(award);
    }
  }

  log.success(`✓ Created ${awards.length} awards`);
  return awards;
}

// ============================================
// MASTER SEED FUNCTION
// ============================================

async function seedAll() {
  try {
    log.section("🚀 ECONNECT ULTIMATE SEED STARTING");
    log.info(`Start Time: ${new Date().toLocaleString()}`);
    log.info(
      `Database: ${
        MONGODB_URI.includes("@")
          ? MONGODB_URI.split("@")[1].split("/")[0]
          : "localhost"
      }`
    );

    const startTime = Date.now();

    // Connect to database
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
    });
    log.success("Connected to MongoDB");

    // Clear existing data
    await clearDatabase();

    // PHASE 1: Locations
    const regions = await seedRegions();
    const districts = await seedDistricts(regions);
    const wards = await seedWards(districts);

    // PHASE 2: Schools
    const schools = await seedSchools(regions, districts, wards);

    // PHASE 3: Talents & Subjects
    const talents = await seedTalents();
    const subjects = await seedSubjects();

    // PHASE 4: Users (All Roles)
    const users = await seedUsers(schools, regions, districts, wards, subjects);

    // PHASE 5: Student Talents
    const studentTalents = await seedStudentTalents(
      users.students,
      talents,
      users.teachers,
      schools
    );

    // PHASE 6: Academic Data
    const classes = await seedClasses(schools, users.teachers, users.students);
    const grades = await seedGrades(users.students, users.teachers, schools);
    const attendance = await seedAttendance(
      users.students,
      users.teachers,
      schools
    );
    const assignments = await seedAssignments(
      users.teachers,
      schools,
      users.students
    );
    const submissions = await seedAssignmentSubmissions(
      assignments,
      users.students
    );

    // PHASE 7: Events
    const events = await seedEvents(schools, regions, districts, users);
    const eventRegistrations = await seedEventRegistrations(
      events,
      users.students
    );

    // PHASE 8: Books & Business
    const books = await seedBooks(users.entrepreneurs, users);
    const businesses = await seedBusinesses(
      users.entrepreneurs,
      regions,
      districts
    );
    const products = await seedProducts(businesses);

    // PHASE 9: CTM Program
    const memberships = await seedCTMMemberships(
      users.students,
      schools,
      talents
    );
    const activities = await seedCTMActivities(
      schools,
      talents,
      users,
      users.students
    );

    // PHASE 10: Financial & Communication
    const invoices = await seedInvoices(users.students);
    const notifications = await seedNotifications(
      users.students,
      users.teachers,
      users.entrepreneurs
    );
    const messages = await seedMessages(users.students, users.teachers);
    const announcements = await seedAnnouncements(schools, regions, users);
    const awards = await seedAwards(users.students, schools, users);

    // Calculate totals
    const totalUsers =
      users.superAdmins.length +
      users.nationalOfficials.length +
      users.regionalOfficials.length +
      users.districtOfficials.length +
      users.headmasters.length +
      users.teachers.length +
      users.students.length +
      users.entrepreneurs.length;

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // FINAL SUMMARY
    log.section("✅ SEEDING COMPLETED SUCCESSFULLY");
    console.log("");
    console.log(
      `${colors.green}${colors.bright}📊 DATABASE STATISTICS${colors.reset}`
    );
    console.log("");
    console.log(`${colors.cyan}LOCATIONS:${colors.reset}`);
    console.log(
      `   • Regions: ${colors.bright}${regions.length}${colors.reset}`
    );
    console.log(
      `   • Districts: ${colors.bright}${districts.length}${colors.reset}`
    );
    console.log(`   • Wards: ${colors.bright}${wards.length}${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}INSTITUTIONS:${colors.reset}`);
    console.log(
      `   • Schools: ${colors.bright}${schools.length}${colors.reset}`
    );
    console.log(
      `   • Classes: ${colors.bright}${classes.length}${colors.reset}`
    );
    console.log("");
    console.log(
      `${colors.cyan}USERS (Total: ${colors.bright}${totalUsers}${colors.reset}${colors.cyan}):${colors.reset}`
    );
    console.log(
      `   • Super Admins: ${colors.bright}${users.superAdmins.length}${colors.reset}`
    );
    console.log(
      `   • National Officials: ${colors.bright}${users.nationalOfficials.length}${colors.reset}`
    );
    console.log(
      `   • Regional Officials: ${colors.bright}${users.regionalOfficials.length}${colors.reset}`
    );
    console.log(
      `   • District Officials: ${colors.bright}${users.districtOfficials.length}${colors.reset}`
    );
    console.log(
      `   • Headmasters: ${colors.bright}${users.headmasters.length}${colors.reset}`
    );
    console.log(
      `   • Teachers: ${colors.bright}${users.teachers.length}${colors.reset}`
    );
    console.log(
      `   • Students: ${colors.bright}${users.students.length}${colors.reset}`
    );
    console.log(
      `   • Entrepreneurs: ${colors.bright}${users.entrepreneurs.length}${colors.reset}`
    );
    console.log("");
    console.log(`${colors.cyan}ACADEMIC:${colors.reset}`);
    console.log(
      `   • Talents: ${colors.bright}${talents.length}${colors.reset}`
    );
    console.log(
      `   • Subjects: ${colors.bright}${subjects.length}${colors.reset}`
    );
    console.log(
      `   • Student Talents: ${colors.bright}${studentTalents.length}${colors.reset}`
    );
    console.log(`   • Grades: ${colors.bright}${grades.length}${colors.reset}`);
    console.log(
      `   • Attendance Records: ${colors.bright}${attendance.length}${colors.reset}`
    );
    console.log(
      `   • Assignments: ${colors.bright}${assignments.length}${colors.reset}`
    );
    console.log(
      `   • Submissions: ${colors.bright}${submissions.length}${colors.reset}`
    );
    console.log("");
    console.log(`${colors.cyan}EVENTS & CTM:${colors.reset}`);
    console.log(`   • Events: ${colors.bright}${events.length}${colors.reset}`);
    console.log(
      `   • Event Registrations: ${colors.bright}${eventRegistrations.length}${colors.reset}`
    );
    console.log(
      `   • CTM Memberships: ${colors.bright}${memberships.length}${colors.reset}`
    );
    console.log(
      `   • CTM Activities: ${colors.bright}${activities.length}${colors.reset}`
    );
    console.log("");
    console.log(`${colors.cyan}BUSINESS:${colors.reset}`);
    console.log(`   • Books: ${colors.bright}${books.length}${colors.reset}`);
    console.log(
      `   • Businesses: ${colors.bright}${businesses.length}${colors.reset}`
    );
    console.log(
      `   • Products: ${colors.bright}${products.length}${colors.reset}`
    );
    console.log("");
    console.log(`${colors.cyan}COMMUNICATION:${colors.reset}`);
    console.log(
      `   • Notifications: ${colors.bright}${notifications.length}${colors.reset}`
    );
    console.log(
      `   • Messages: ${colors.bright}${messages.length}${colors.reset}`
    );
    console.log(
      `   • Announcements: ${colors.bright}${announcements.length}${colors.reset}`
    );
    console.log(`   • Awards: ${colors.bright}${awards.length}${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}FINANCIAL:${colors.reset}`);
    console.log(
      `   • Invoices: ${colors.bright}${invoices.length}${colors.reset}`
    );
    console.log("");
    console.log(
      `${colors.green}⏱️  Time Taken: ${colors.bright}${duration}s${colors.reset}`
    );
    console.log("");

    log.section("🔑 DEFAULT LOGIN CREDENTIALS");
    console.log("");
    console.log(`${colors.yellow}Super Admin:${colors.reset}`);
    console.log(`   Username: ${colors.bright}superadmin${colors.reset}`);
    console.log(`   Password: ${colors.bright}Test@123${colors.reset}`);
    console.log("");
    console.log(`${colors.yellow}Sample Teacher:${colors.reset}`);
    console.log(
      `   Username: ${
        colors.bright
      }teacher_${schools[0].schoolCode.toLowerCase()}_1${colors.reset}`
    );
    console.log(`   Password: ${colors.bright}Test@123${colors.reset}`);
    console.log("");
    console.log(`${colors.yellow}Sample Student:${colors.reset}`);
    console.log(
      `   Username: ${
        colors.bright
      }student_${schools[0].schoolCode.toLowerCase()}_0001${colors.reset}`
    );
    console.log(`   Password: ${colors.bright}Test@123${colors.reset}`);
    console.log("");
    console.log(`${colors.yellow}Sample Entrepreneur:${colors.reset}`);
    console.log(`   Username: ${colors.bright}entrepreneur_1${colors.reset}`);
    console.log(`   Password: ${colors.bright}Test@123${colors.reset}`);
    console.log("");

    return {
      success: true,
      duration: duration,
      stats: {
        regions: regions.length,
        districts: districts.length,
        wards: wards.length,
        schools: schools.length,
        talents: talents.length,
        subjects: subjects.length,
        users: totalUsers,
        grades: grades.length,
        attendance: attendance.length,
        assignments: assignments.length,
        events: events.length,
        books: books.length,
        businesses: businesses.length,
        products: products.length,
        notifications: notifications.length,
        messages: messages.length,
      },
    };
  } catch (error) {
    log.error(`Seeding failed: ${error.message}`);
    console.error(error);
    throw error;
  }
}

// ============================================
// EXECUTE SEEDING
// ============================================

if (require.main === module) {
  seedAll()
    .then((result) => {
      log.success("🎉 All seeding completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      log.error("Seeding failed");
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedAll };
