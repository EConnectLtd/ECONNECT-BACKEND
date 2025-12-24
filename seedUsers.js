// ============================================
// ECONNECT USER & DATA SEEDING SCRIPT
// Seeds: Users, Events, Grades, Attendance, Assignments, Books, CTM, etc.
// Does NOT seed: Locations, Talents, Subjects, Schools (use utils or existing data)
// ============================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// MongoDB Connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";

// ============================================
// SCHEMAS (from server.js)
// ============================================

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: String,
  firstName: String,
  lastName: String,
  phoneNumber: String,
  schoolId: mongoose.Schema.Types.ObjectId,
  regionId: mongoose.Schema.Types.ObjectId,
  districtId: mongoose.Schema.Types.ObjectId,
  wardId: mongoose.Schema.Types.ObjectId,
  regionName: String,
  districtName: String,
  wardName: String,
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  profileImage: String,
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  dateOfBirth: Date,
  gender: String,
  gradeLevel: String,
  employeeId: String,
  studentId: String,
  subjects: [String],
  businessName: String,
  businessType: String,
  registration_type: String,
  registration_fee_paid: { type: Number, default: 0 },
  registration_date: Date,
  next_billing_date: Date,
  is_ctm_student: { type: Boolean, default: true },
  guardianName: String,
  guardianPhone: String,
  guardianRelationship: String,
  institutionType: String,
  classLevel: String,
});

const schoolSchema = new mongoose.Schema({
  name: String,
  schoolCode: String,
  type: String,
  regionId: mongoose.Schema.Types.ObjectId,
  districtId: mongoose.Schema.Types.ObjectId,
  wardId: mongoose.Schema.Types.ObjectId,
  address: String,
  phoneNumber: String,
  email: String,
  principalName: String,
  totalStudents: { type: Number, default: 0 },
  totalTeachers: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  logo: String,
  establishedYear: Number,
  createdAt: { type: Date, default: Date.now },
});

const regionSchema = new mongoose.Schema({
  name: String,
  code: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const districtSchema = new mongoose.Schema({
  name: String,
  code: String,
  regionId: mongoose.Schema.Types.ObjectId,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const wardSchema = new mongoose.Schema({
  name: String,
  code: String,
  districtId: mongoose.Schema.Types.ObjectId,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const talentSchema = new mongoose.Schema({
  name: String,
  category: String,
  description: String,
  icon: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  eventType: String,
  startDate: Date,
  endDate: Date,
  location: String,
  venue: String,
  organizer: mongoose.Schema.Types.ObjectId,
  schoolId: mongoose.Schema.Types.ObjectId,
  regionId: mongoose.Schema.Types.ObjectId,
  maxParticipants: Number,
  currentParticipants: { type: Number, default: 0 },
  registrationFee: { type: Number, default: 0 },
  coverImage: String,
  status: { type: String, default: "published" },
  isPublic: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const gradeSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  schoolId: mongoose.Schema.Types.ObjectId,
  teacherId: mongoose.Schema.Types.ObjectId,
  subject: String,
  examType: String,
  score: Number,
  grade: String,
  totalMarks: { type: Number, default: 100 },
  term: String,
  academicYear: String,
  examDate: Date,
  createdAt: { type: Date, default: Date.now },
});

const attendanceRecordSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  schoolId: mongoose.Schema.Types.ObjectId,
  date: Date,
  status: String,
  teacherId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
});

const assignmentSchema = new mongoose.Schema({
  title: String,
  description: String,
  subject: String,
  teacherId: mongoose.Schema.Types.ObjectId,
  schoolId: mongoose.Schema.Types.ObjectId,
  classLevel: String,
  dueDate: Date,
  totalMarks: { type: Number, default: 100 },
  status: { type: String, default: "published" },
  createdAt: { type: Date, default: Date.now },
});

const bookSchema = new mongoose.Schema({
  title: String,
  author: String,
  isbn: String,
  category: String,
  description: String,
  coverImage: String,
  pdfFile: String,
  price: Number,
  publisher: String,
  language: String,
  rating: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  uploadedBy: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
});

const notificationSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  message: String,
  type: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const ctmMembershipSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, unique: true },
  membershipNumber: { type: String, unique: true },
  schoolId: mongoose.Schema.Types.ObjectId,
  status: { type: String, default: "active" },
  membershipType: { type: String, default: "basic" },
  participationPoints: { type: Number, default: 0 },
  joinDate: { type: Date, default: Date.now },
});

const invoiceSchema = new mongoose.Schema(
  {
    student_id: mongoose.Schema.Types.ObjectId,
    invoiceNumber: { type: String, unique: true },
    type: String,
    description: String,
    amount: Number,
    currency: { type: String, default: "TZS" },
    status: { type: String, default: "pending" },
    dueDate: Date,
    paidDate: Date,
    academicYear: String,
  },
  { timestamps: true }
);

// Models
const User = mongoose.model("User", userSchema);
const School = mongoose.model("School", schoolSchema);
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const Talent = mongoose.model("Talent", talentSchema);
const Event = mongoose.model("Event", eventSchema);
const Grade = mongoose.model("Grade", gradeSchema);
const AttendanceRecord = mongoose.model(
  "AttendanceRecord",
  attendanceRecordSchema
);
const Assignment = mongoose.model("Assignment", assignmentSchema);
const Book = mongoose.model("Book", bookSchema);
const Notification = mongoose.model("Notification", notificationSchema);
const CTMMembership = mongoose.model("CTMMembership", ctmMembershipSchema);
const Invoice = mongoose.model("Invoice", invoiceSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================
// SEED DATA
// ============================================

const TANZANIAN_FIRST_NAMES = {
  male: [
    "John",
    "James",
    "Joseph",
    "Daniel",
    "David",
    "Michael",
    "Emmanuel",
    "Frank",
    "Charles",
    "Robert",
    "William",
    "Peter",
    "Paul",
    "Richard",
    "Steven",
    "Andrew",
    "Jacob",
    "Samuel",
    "George",
    "Thomas",
    "Juma",
    "Hamisi",
    "Rajabu",
    "Salum",
    "Bakari",
    "Omari",
    "Seif",
    "Khalid",
    "Hassan",
    "Ally",
  ],
  female: [
    "Mary",
    "Grace",
    "Anna",
    "Sarah",
    "Elizabeth",
    "Joyce",
    "Lucy",
    "Rose",
    "Jane",
    "Agnes",
    "Christina",
    "Ruth",
    "Rachel",
    "Esther",
    "Martha",
    "Rebecca",
    "Deborah",
    "Judith",
    "Janet",
    "Catherine",
    "Fatuma",
    "Amina",
    "Halima",
    "Mwanaisha",
    "Rehema",
    "Zaina",
    "Mariam",
    "Aziza",
    "Salma",
    "Asha",
  ],
};

const TANZANIAN_LAST_NAMES = [
  "Mwangi",
  "Nyerere",
  "Kamau",
  "Mushi",
  "Makena",
  "Mwaura",
  "Njoroge",
  "Omondi",
  "Wanjiru",
  "Kimani",
  "Mwaniki",
  "Kariuki",
  "Mwita",
  "Mbogo",
  "Kahiga",
  "Mwendwa",
  "Mugo",
  "Wambugu",
  "Mutua",
  "Kibet",
  "Kipchoge",
  "Nyambura",
  "Masai",
  "Maasai",
  "Temba",
  "Mollel",
  "Mchome",
  "Lyimo",
  "Swai",
  "Mrema",
  "Mkapa",
  "Kikwete",
  "Magufuli",
  "Hassan",
  "Lusekelo",
  "Mganga",
  "Shao",
  "Komba",
  "Maro",
  "Mahenge",
];

const SUBJECTS = [
  "Mathematics",
  "English",
  "Kiswahili",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Geography",
  "Civics",
  "Computer Science",
  "Commerce",
  "Accounting",
  "Book Keeping",
  "Basic Mathematics",
  "Religious Education",
];

const EXAM_TYPES = [
  "quiz",
  "midterm",
  "final",
  "assignment",
  "project",
  "test",
];
const ATTENDANCE_STATUS = ["present", "absent", "late", "excused"];
const EVENT_TYPES = [
  "competition",
  "workshop",
  "exhibition",
  "talent_show",
  "seminar",
  "training",
];

const BOOK_CATEGORIES = [
  "Fiction",
  "Non-Fiction",
  "Science",
  "Mathematics",
  "History",
  "Literature",
  "Biography",
  "Self-Help",
  "Educational",
];
const BOOK_TITLES = [
  "Introduction to Mathematics",
  "Swahili Grammar Guide",
  "Tanzania History and Culture",
  "Physics Fundamentals",
  "Chemistry Basics",
  "Biology for Beginners",
  "English Literature",
  "Computer Programming",
  "Geography of East Africa",
  "Civics and Government",
];

const REGISTRATION_TYPES = [
  { type: "normal_registration", amount: 15000, monthly: false },
  { type: "premier_registration", amount: 70000, monthly: true },
  { type: "silver_registration", amount: 49000, monthly: false },
  { type: "diamond_registration", amount: 55000, monthly: true },
];

// ============================================
// MAIN SEEDING FUNCTION
// ============================================

async function seedDatabase() {
  try {
    console.log("🌱 Starting ECONNECT User & Data Seeding...\n");

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Connected to MongoDB\n");

    // Get existing schools and regions
    const schools = await School.find({ isActive: true }).limit(50);
    const regions = await Region.find({ isActive: true });

    if (schools.length === 0) {
      console.error("❌ No schools found! Please seed schools first.");
      process.exit(1);
    }

    console.log(`📚 Found ${schools.length} schools`);
    console.log(`🗺️  Found ${regions.length} regions\n`);

    // ============================================
    // CLEAR EXISTING USER DATA
    // ============================================
    console.log("🗑️  Clearing existing user data...");
    await User.deleteMany({ role: { $ne: "super_admin" } }); // Keep super_admin
    await Event.deleteMany({});
    await Grade.deleteMany({});
    await AttendanceRecord.deleteMany({});
    await Assignment.deleteMany({});
    await Book.deleteMany({});
    await Notification.deleteMany({});
    await CTMMembership.deleteMany({});
    await Invoice.deleteMany({});
    console.log("✅ Cleared existing data (kept SuperAdmin)\n");

    // ============================================
    // 1. SEED SUPERADMIN
    // ============================================
    console.log("👑 Seeding SuperAdmin...");
    const superAdminPassword = await hashPassword("admin123");

    let superAdmin = await User.findOne({ username: "superadmin" });
    if (!superAdmin) {
      superAdmin = await User.create({
        username: "superadmin",
        email: "admin@econnect.co.tz",
        password: superAdminPassword,
        role: "super_admin",
        firstName: "Super",
        lastName: "Administrator",
        phoneNumber: "+255712000000",
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        gender: "male",
        createdAt: new Date("2024-01-01"),
      });
      console.log("✅ SuperAdmin created");
    } else {
      console.log("ℹ️  SuperAdmin already exists, skipping...");
    }
    console.log("   Username: superadmin");
    console.log("   Password: admin123");
    console.log("   Phone: +255712000000\n");

    // ============================================
    // 2. SEED HEADMASTERS (1 per school)
    // ============================================
    console.log("👔 Seeding Headmasters...");
    const headmasters = [];
    const headmasterPassword = await hashPassword("head123");

    for (let i = 0; i < Math.min(schools.length, 20); i++) {
      const school = schools[i];
      const gender = Math.random() > 0.3 ? "male" : "female";
      const firstName = randomElement(TANZANIAN_FIRST_NAMES[gender]);
      const lastName = randomElement(TANZANIAN_LAST_NAMES);

      const headmaster = await User.create({
        username: `head${school.schoolCode?.toLowerCase() || i}`,
        email: `headmaster${i + 1}@${
          school.schoolCode?.toLowerCase() || "school"
        }.ac.tz`,
        password: headmasterPassword,
        role: "headmaster",
        firstName,
        lastName,
        phoneNumber: `+25571${String(1000000 + i).padStart(7, "0")}`,
        schoolId: school._id,
        regionId: school.regionId,
        districtId: school.districtId,
        gender,
        isActive: true,
        employeeId: `EMP-HEAD-${1000 + i}`,
        createdAt: randomDate(new Date("2024-01-01"), new Date("2024-03-01")),
      });
      headmasters.push(headmaster);
    }
    console.log(`✅ Created ${headmasters.length} headmasters`);
    console.log("   Username: head{schoolcode}");
    console.log("   Password: head123\n");

    // ============================================
    // 3. SEED TEACHERS (4-6 per school)
    // ============================================
    console.log("👨‍🏫 Seeding Teachers...");
    const teachers = [];
    const teacherPassword = await hashPassword("teach123");

    for (let i = 0; i < Math.min(schools.length, 15); i++) {
      const school = schools[i];
      const teacherCount = randomInt(4, 6);

      for (let j = 0; j < teacherCount; j++) {
        const gender = Math.random() > 0.4 ? "female" : "male";
        const firstName = randomElement(TANZANIAN_FIRST_NAMES[gender]);
        const lastName = randomElement(TANZANIAN_LAST_NAMES);
        const teacherSubjects = [];
        const subjectCount = randomInt(2, 3);
        for (let k = 0; k < subjectCount; k++) {
          const subject = randomElement(SUBJECTS);
          if (!teacherSubjects.includes(subject)) {
            teacherSubjects.push(subject);
          }
        }

        const teacher = await User.create({
          username: `teacher${i}_${j}`,
          email: `teacher${i}_${j}@${
            school.schoolCode?.toLowerCase() || "school"
          }.ac.tz`,
          password: teacherPassword,
          role: "teacher",
          firstName,
          lastName,
          phoneNumber: `+25573${String(2000000 + i * 10 + j).padStart(7, "0")}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          gender,
          isActive: true,
          subjects: teacherSubjects,
          employeeId: `EMP-TCH-${2000 + i * 10 + j}`,
          createdAt: randomDate(new Date("2024-01-15"), new Date("2024-04-01")),
        });
        teachers.push(teacher);
      }
    }
    console.log(`✅ Created ${teachers.length} teachers`);
    console.log("   Username: teacher{school}_{number}");
    console.log("   Password: teach123\n");

    // ============================================
    // 4. SEED STUDENTS (25-35 per school)
    // ============================================
    console.log("🎓 Seeding Students...");
    const students = [];
    const studentPassword = await hashPassword("student123");
    const gradeLevels = [
      "Standard 1",
      "Standard 2",
      "Standard 3",
      "Standard 4",
      "Standard 5",
      "Standard 6",
      "Standard 7",
      "Form 1",
      "Form 2",
      "Form 3",
      "Form 4",
      "Form 5",
      "Form 6",
    ];

    for (let i = 0; i < Math.min(schools.length, 10); i++) {
      const school = schools[i];
      const studentCount = randomInt(25, 35);

      for (let j = 0; j < studentCount; j++) {
        const gender = Math.random() > 0.5 ? "female" : "male";
        const firstName = randomElement(TANZANIAN_FIRST_NAMES[gender]);
        const lastName = randomElement(TANZANIAN_LAST_NAMES);
        const registrationType = randomElement(REGISTRATION_TYPES);

        const student = await User.create({
          username: `student${i}_${j}`,
          email: `student${i}_${j}@gmail.com`,
          password: studentPassword,
          role: "student",
          firstName,
          lastName,
          phoneNumber: `+25574${String(3000000 + i * 100 + j).padStart(
            7,
            "0"
          )}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          gender,
          isActive: true,
          gradeLevel: randomElement(gradeLevels),
          studentId: `STD-${school.schoolCode || "SCH"}-${10000 + i * 100 + j}`,
          dateOfBirth: randomDate(
            new Date("2005-01-01"),
            new Date("2012-12-31")
          ),
          registration_type: registrationType.type,
          registration_fee_paid:
            Math.random() > 0.3 ? registrationType.amount : 0,
          registration_date: new Date(),
          next_billing_date: registrationType.monthly
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : null,
          is_ctm_student: Math.random() > 0.2,
          guardianName: `${randomElement(
            TANZANIAN_FIRST_NAMES[Math.random() > 0.5 ? "male" : "female"]
          )} ${lastName}`,
          guardianPhone: `+25575${String(5000000 + i * 100 + j).padStart(
            7,
            "0"
          )}`,
          guardianRelationship: randomElement(["father", "mother", "guardian"]),
          createdAt: randomDate(new Date("2024-02-01"), new Date("2024-11-01")),
        });
        students.push(student);

        // Create CTM Membership for CTM students
        if (student.is_ctm_student) {
          await CTMMembership.create({
            studentId: student._id,
            membershipNumber: `CTM-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)
              .toUpperCase()}`,
            schoolId: school._id,
            status: "active",
            membershipType: randomElement(["basic", "premium", "gold"]),
            participationPoints: randomInt(0, 500),
            joinDate: student.createdAt,
          });
        }

        // Create invoice if registration type requires payment
        if (
          registrationType.type !== "normal_registration" &&
          student.registration_fee_paid === 0
        ) {
          const invoiceNumber = `INV-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)
            .toUpperCase()}`;
          await Invoice.create({
            student_id: student._id,
            invoiceNumber,
            type: "ctm_membership",
            description: `${registrationType.type
              .replace("_", " ")
              .toUpperCase()} Fee`,
            amount: registrationType.amount,
            currency: "TZS",
            status: "pending",
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            academicYear: new Date().getFullYear().toString(),
          });
        }
      }
    }
    console.log(`✅ Created ${students.length} students`);
    console.log("   Username: student{school}_{number}");
    console.log("   Password: student123\n");

    // ============================================
    // 5. SEED ENTREPRENEURS
    // ============================================
    console.log("💼 Seeding Entrepreneurs...");
    const entrepreneurs = [];
    const entrepreneurPassword = await hashPassword("entrepreneur123");

    for (let i = 0; i < 15; i++) {
      const gender = Math.random() > 0.4 ? "male" : "female";
      const firstName = randomElement(TANZANIAN_FIRST_NAMES[gender]);
      const lastName = randomElement(TANZANIAN_LAST_NAMES);
      const region = randomElement(regions);

      const entrepreneur = await User.create({
        username: `entrepreneur${i}`,
        email: `entrepreneur${i}@gmail.com`,
        password: entrepreneurPassword,
        role: "entrepreneur",
        firstName,
        lastName,
        phoneNumber: `+25576${String(6000000 + i).padStart(7, "0")}`,
        regionId: region._id,
        gender,
        isActive: true,
        businessName: `${lastName} ${randomElement([
          "Enterprises",
          "Trading",
          "Services",
          "Solutions",
          "Group",
        ])}`,
        businessType: randomElement([
          "Retail",
          "Services",
          "Manufacturing",
          "Technology",
          "Agriculture",
        ]),
        createdAt: randomDate(new Date("2024-01-01"), new Date("2024-10-01")),
      });
      entrepreneurs.push(entrepreneur);
    }
    console.log(`✅ Created ${entrepreneurs.length} entrepreneurs`);
    console.log("   Username: entrepreneur{number}");
    console.log("   Password: entrepreneur123\n");

    // ============================================
    // 6. SEED EVENTS
    // ============================================
    console.log("🎉 Seeding Events...");
    const events = [];

    for (let i = 0; i < 30; i++) {
      const school = randomElement(schools);
      const organizer = randomElement([...headmasters, ...teachers]);
      const eventType = randomElement(EVENT_TYPES);
      const startDate = randomDate(
        new Date("2024-06-01"),
        new Date("2025-03-01")
      );
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + randomInt(1, 3));

      const event = await Event.create({
        title: `${eventType.replace("_", " ").toUpperCase()} - ${school.name}`,
        description: `An exciting ${eventType.replace(
          "_",
          " "
        )} event for students to showcase their skills and talents.`,
        eventType,
        startDate,
        endDate,
        location: school.address || "Tanzania",
        venue: school.name,
        organizer: organizer._id,
        schoolId: school._id,
        regionId: school.regionId,
        maxParticipants: randomInt(50, 200),
        currentParticipants: randomInt(10, 50),
        registrationFee: randomInt(0, 50000),
        status: randomElement(["published", "draft", "completed"]),
        isPublic: Math.random() > 0.2,
        createdAt: randomDate(new Date("2024-03-01"), new Date()),
      });
      events.push(event);
    }
    console.log(`✅ Created ${events.length} events\n`);

    // ============================================
    // 7. SEED GRADES
    // ============================================
    console.log("📊 Seeding Grades...");
    const grades = [];

    for (let i = 0; i < Math.min(150, students.length); i++) {
      const student = students[i];
      const school = schools.find((s) => s._id.equals(student.schoolId));
      const schoolTeachers = teachers.filter((t) =>
        t.schoolId.equals(student.schoolId)
      );

      if (schoolTeachers.length > 0) {
        for (let j = 0; j < randomInt(4, 8); j++) {
          const teacher = randomElement(schoolTeachers);
          const subject = randomElement(teacher.subjects || SUBJECTS);
          const score = randomInt(0, 100);
          const gradeLetter =
            score >= 80
              ? "A"
              : score >= 70
              ? "B+"
              : score >= 60
              ? "B"
              : score >= 50
              ? "C+"
              : score >= 40
              ? "C"
              : score >= 30
              ? "D"
              : "F";

          const grade = await Grade.create({
            studentId: student._id,
            schoolId: student.schoolId,
            teacherId: teacher._id,
            subject,
            examType: randomElement(EXAM_TYPES),
            score,
            grade: gradeLetter,
            totalMarks: 100,
            term: randomElement(["Term 1", "Term 2", "Term 3"]),
            academicYear: "2024",
            examDate: randomDate(new Date("2024-03-01"), new Date()),
            createdAt: randomDate(new Date("2024-03-01"), new Date()),
          });
          grades.push(grade);
        }
      }
    }
    console.log(`✅ Created ${grades.length} grade records\n`);

    // ============================================
    // 8. SEED ATTENDANCE
    // ============================================
    console.log("📅 Seeding Attendance Records...");
    const attendanceRecords = [];

    for (let i = 0; i < Math.min(100, students.length); i++) {
      const student = students[i];
      const schoolTeachers = teachers.filter((t) =>
        t.schoolId.equals(student.schoolId)
      );

      if (schoolTeachers.length > 0) {
        for (let j = 0; j < randomInt(15, 30); j++) {
          const teacher = randomElement(schoolTeachers);
          const date = randomDate(new Date("2024-01-01"), new Date());

          const attendance = await AttendanceRecord.create({
            studentId: student._id,
            schoolId: student.schoolId,
            date,
            status: randomElement(ATTENDANCE_STATUS),
            teacherId: teacher._id,
            createdAt: date,
          });
          attendanceRecords.push(attendance);
        }
      }
    }
    console.log(`✅ Created ${attendanceRecords.length} attendance records\n`);

    // ============================================
    // 9. SEED ASSIGNMENTS
    // ============================================
    console.log("📝 Seeding Assignments...");
    const assignments = [];

    for (let i = 0; i < Math.min(50, teachers.length); i++) {
      const teacher = teachers[i];
      const assignmentCount = randomInt(3, 6);

      for (let j = 0; j < assignmentCount; j++) {
        const subject = randomElement(teacher.subjects || SUBJECTS);
        const dueDate = randomDate(new Date(), new Date("2025-06-01"));

        const assignment = await Assignment.create({
          title: `${subject} Assignment ${j + 1}`,
          description: `Complete exercises on ${subject} topics covered in class.`,
          subject,
          teacherId: teacher._id,
          schoolId: teacher.schoolId,
          classLevel: randomElement([
            "Standard 5",
            "Standard 6",
            "Form 2",
            "Form 3",
            "Form 4",
          ]),
          dueDate,
          totalMarks: randomInt(50, 100),
          status: randomElement(["published", "draft"]),
          createdAt: randomDate(new Date("2024-01-01"), new Date()),
        });
        assignments.push(assignment);
      }
    }
    console.log(`✅ Created ${assignments.length} assignments\n`);


    // ============================================
    // 11. SEED NOTIFICATIONS
    // ============================================
    console.log("🔔 Seeding Notifications...");
    const notifications = [];
    const notificationTypes = [
      "system",
      "grade",
      "event",
      "assignment",
      "attendance",
      "message",
    ];
    const notificationMessages = [
      {
        type: "system",
        title: "Welcome to ECONNECT",
        message: "Welcome to the ECONNECT platform!",
      },
      {
        type: "grade",
        title: "New Grade Posted",
        message: "Your teacher has posted a new grade.",
      },
      {
        type: "event",
        title: "Upcoming Event",
        message: "Don't forget about the upcoming event!",
      },
      {
        type: "assignment",
        title: "New Assignment",
        message: "A new assignment has been posted.",
      },
      {
        type: "attendance",
        title: "Attendance Update",
        message: "Your attendance has been recorded.",
      },
      {
        type: "message",
        title: "New Message",
        message: "You have received a new message.",
      },
    ];

    for (let i = 0; i < 200; i++) {
      const user = randomElement([...students, ...teachers, ...entrepreneurs]);
      const notifData = randomElement(notificationMessages);

      const notification = await Notification.create({
        userId: user._id,
        title: notifData.title,
        message: notifData.message,
        type: notifData.type,
        isRead: Math.random() > 0.6,
        createdAt: randomDate(new Date("2024-01-01"), new Date()),
      });
      notifications.push(notification);
    }
    console.log(`✅ Created ${notifications.length} notifications\n`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n🎉 SEEDING COMPLETED SUCCESSFULLY!\n");
    console.log("═══════════════════════════════════════");
    console.log("📊 SUMMARY OF SEEDED DATA");
    console.log("═══════════════════════════════════════");
    console.log(`👑 SuperAdmin:        1`);
    console.log(`👔 Headmasters:       ${headmasters.length}`);
    console.log(`👨‍🏫 Teachers:          ${teachers.length}`);
    console.log(`🎓 Students:          ${students.length}`);
    console.log(`💼 Entrepreneurs:     ${entrepreneurs.length}`);
    console.log(`🎉 Events:            ${events.length}`);
    console.log(`📊 Grades:            ${grades.length}`);
    console.log(`📅 Attendance:        ${attendanceRecords.length}`);
    console.log(`📝 Assignments:       ${assignments.length}`);
    console.log(`🔔 Notifications:     ${notifications.length}`);
    console.log(
      `🏆 CTM Memberships:   ${students.filter((s) => s.is_ctm_student).length}`
    );
    console.log(`💰 Invoices:          ${await Invoice.countDocuments()}`);
    console.log("═══════════════════════════════════════\n");

    console.log("🔐 DEFAULT LOGIN CREDENTIALS:");
    console.log("═══════════════════════════════════════");
    console.log("SuperAdmin:");
    console.log("  Username: superadmin");
    console.log("  Password: admin123");
    console.log("  Phone:    +255712000000\n");
    console.log("Headmasters:");
    console.log("  Username: head{schoolcode}");
    console.log("  Password: head123\n");
    console.log("Teachers:");
    console.log("  Username: teacher{school}_{number}");
    console.log("  Password: teach123\n");
    console.log("Students:");
    console.log("  Username: student{school}_{number}");
    console.log("  Password: student123\n");
    console.log("Entrepreneurs:");
    console.log("  Username: entrepreneur{number}");
    console.log("  Password: entrepreneur123");
    console.log("═══════════════════════════════════════\n");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run the seeding
seedDatabase();
