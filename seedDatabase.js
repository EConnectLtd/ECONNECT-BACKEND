/**
 * ============================================
 * ECONNECT COMPREHENSIVE DATABASE SEEDER
 * ============================================
 *
 * Seeds the database with realistic Tanzanian data:
 * - 7+ User Roles (Student, Teacher, Headmaster, Entrepreneur, OPS, TAMISEMI, SuperAdmin)
 * - Schools across Tanzania
 * - 24 Broader Talent Categories
 * - Premier, Normal, Diamond, Silver Registration Types
 * - Assignments, Grades, Attendance, Events, Messages
 * - CTM Club Data, Awards, Rankings
 * - Payment/Invoice Records
 *
 * Usage: node backend/seedDatabase.js
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/econnect";

// Password Configuration
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "student123";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";
const OPS_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "ops123";
const TEACHER_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "teacher123";
const HEAD_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "head123";
const BIZ_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "biz123";

// ============================================
// MONGOOSE SCHEMAS (Inline for seeding)
// ============================================

const userSchema = new mongoose.Schema(
  {
    names: {
      first: { type: String },
      middle: { type: String },
      last: { type: String },
    },
    username: { type: String, unique: true, sparse: true },
    email: { type: String, sparse: true },
    phone: { type: String },
    password: { type: String },
    role: {
      type: String,
      enum: [
        "guest",
        "student",
        "nonstudent",
        "teacher",
        "school_admin",
        "ops",
        "tamisemi",
        "superadmin",
      ],
      default: "guest",
    },
    school_id: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    accepted_terms: { type: Boolean, default: false },
    is_approved: { type: Boolean, default: true },
    is_blacklisted: { type: Boolean, default: false },

    // Student-specific fields
    student: {
      student_id: String,
      class_level: String,
      year: Number,
      talents: [String],
    },

    // Teacher-specific fields
    teacher: {
      subjects: [String],
      teaching_level: String, // "Primary", "Secondary - O Level", "Secondary - A Level", "College", "University"
      institution_type: String, // "Government", "Private", "International"
      experience_years: Number,
      is_head: Boolean,
    },

    // Business/Entrepreneur-specific fields
    biz: {
      categories: [String],
      business_name: String,
      revenue: Number,
      description: String,
    },

    // Membership & CTM
    membership: {
      id: String,
      club_status: String, // "active", "inactive", "graduated"
      awards: [String],
      join_date: Date,
    },

    // Location
    location: {
      region: String,
      district: String,
      ward: String,
    },

    // Flexible metadata for registration types, payments, etc.
    metadata: { type: mongoose.Schema.Types.Mixed },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, unique: true, required: true },
    address: String,
    region: String,
    district: String,
    ward: String,
    phone: String,
    email: String,
    is_active: { type: Boolean, default: true },
    settings: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    subject: String,
    class_level: String,
    teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    school_id: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    due_date: Date,
    max_score: { type: Number, default: 100 },
    submissions: [
      {
        student_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        submitted_at: Date,
        file_url: String,
        notes: String,
        score: Number,
        feedback: String,
      },
    ],
  },
  { timestamps: true }
);

const gradeSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: { type: String, required: true },
    exam_type: { type: String }, // "Quiz", "Midterm", "Final", "Assignment"
    score: { type: Number, required: true },
    max_score: { type: Number, default: 100 },
    grade: String, // "A", "B+", "B", etc.
    academic_year: String,
    term: String,
    teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    school_id: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  },
  { timestamps: true }
);

const attendanceSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    school_id: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      required: true,
    },
    subject: String,
    notes: String,
  },
  { timestamps: true }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    category: {
      type: String,
      enum: ["academic", "ctm", "sports", "cultural", "other"],
    },
    date: Date,
    time: String,
    location: String,
    organizer: String,
    school_id: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    max_participants: Number,
    registered_students: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],
    image_url: String,
  },
  { timestamps: true }
);

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: String,
    category: { type: String, enum: ["school", "class", "ctm", "urgent"] },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"] },
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    school_id: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    target_audience: [String], // ["all", "form_4", "teachers", etc.]
    is_pinned: { type: Boolean, default: false },
    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema(
  {
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: { type: String, required: true },
    is_read: { type: Boolean, default: false },
    read_at: Date,
  },
  { timestamps: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invoice_number: { type: String, unique: true, required: true },
    type: {
      type: String,
      enum: ["ctm_membership", "certificate", "school_fees", "event", "other"],
    },
    description: String,
    amount: { type: Number, required: true },
    currency: { type: String, default: "TZS" },
    status: {
      type: String,
      enum: ["paid", "pending", "overdue", "cancelled", "verification"],
      default: "pending",
    },
    due_date: Date,
    paid_date: Date,
    academic_year: String,
    payment_proof: {
      file_url: String,
      uploaded_at: Date,
      status: { type: String, enum: ["pending", "verified", "rejected"] },
    },
  },
  { timestamps: true }
);

const timetableSchema = new mongoose.Schema(
  {
    school_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    class_level: { type: String, required: true },
    day: {
      type: String,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
    },
    time_slot: String, // "08:00 - 09:00"
    subject: String,
    teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    room: String,
  },
  { timestamps: true }
);

// Models
const User = mongoose.model("User", userSchema);
const School = mongoose.model("School", schoolSchema);
const Assignment = mongoose.model("Assignment", assignmentSchema);
const Grade = mongoose.model("Grade", gradeSchema);
const Attendance = mongoose.model("Attendance", attendanceSchema);
const Event = mongoose.model("Event", eventSchema);
const Announcement = mongoose.model("Announcement", announcementSchema);
const Message = mongoose.model("Message", messageSchema);
const Invoice = mongoose.model("Invoice", invoiceSchema);
const Timetable = mongoose.model("Timetable", timetableSchema);

// ============================================
// SEED DATA CONSTANTS
// ============================================

// 24 Broader Talent Categories
const TALENTS = [
  "Sports & Athletics",
  "Music & Performing Arts",
  "Visual Arts & Design",
  "Leadership & Public Speaking",
  "Science & Innovation",
  "Technology & Programming",
  "Writing & Journalism",
  "Business & Entrepreneurship",
  "Community Service & Volunteering",
  "Cultural Arts & Traditional Dance",
  "Drama & Theater",
  "Photography & Videography",
  "Environmental Conservation",
  "Mathematics & Problem Solving",
  "Languages & Literature",
  "Debate & Critical Thinking",
  "Cooking & Culinary Arts",
  "Fashion & Modeling",
  "Agriculture & Farming",
  "Robotics & Engineering",
  "Media & Broadcasting",
  "Health & Wellness",
  "Gaming & E-Sports",
  "Social Media & Content Creation",
];

// Tanzanian Regions
const REGIONS = [
  "Dar es Salaam",
  "Mwanza",
  "Arusha",
  "Dodoma",
  "Mbeya",
  "Morogoro",
  "Tanga",
  "Kilimanjaro",
  "Tabora",
  "Kigoma",
  "Shinyanga",
  "Kagera",
  "Mara",
  "Mtwara",
  "Ruvuma",
  "Iringa",
  "Pwani",
  "Singida",
  "Rukwa",
  "Katavi",
];

// Teaching Levels (Updated)
const TEACHING_LEVELS = [
  "Primary",
  "Secondary - O Level",
  "Secondary - A Level",
  "College",
  "University",
];

// Subjects
const SUBJECTS = [
  "Mathematics",
  "English",
  "Kiswahili",
  "Physics",
  "Chemistry",
  "Biology",
  "Geography",
  "History",
  "Civics",
  "Computer Studies",
  "Book Keeping",
  "Commerce",
  "Agriculture",
  "Physical Education",
];

// Class Levels
const CLASS_LEVELS = [
  "Form 1",
  "Form 2",
  "Form 3",
  "Form 4",
  "Form 5",
  "Form 6",
];

// Tanzanian First Names
const FIRST_NAMES = {
  male: [
    "Juma",
    "Hassan",
    "Ally",
    "Baraka",
    "Daudi",
    "Issa",
    "Salim",
    "Omari",
    "Hamisi",
    "Seif",
    "Rajabu",
    "Ramadhan",
    "Bakari",
    "Khamis",
  ],
  female: [
    "Amina",
    "Fatuma",
    "Zuhura",
    "Mariam",
    "Halima",
    "Asha",
    "Mwanaidi",
    "Rehema",
    "Neema",
    "Pendo",
    "Upendo",
    "Zawadi",
    "Furaha",
    "Hawa",
  ],
};

const LAST_NAMES = [
  "Mwambene",
  "Kasongo",
  "Mbwana",
  "Mtatiro",
  "Nkya",
  "Massawe",
  "Kivuyo",
  "Mahenge",
  "Sanga",
  "Lema",
  "Nyamhanga",
  "Mlaki",
  "Kisamo",
  "Tungaraza",
  "Mgaya",
  "Kimaro",
  "Ndosi",
  "Mushi",
];

// Schools Data
const SCHOOLS_DATA = [
  {
    name: "Azania Secondary School",
    code: "AZN001",
    region: "Dar es Salaam",
    district: "Ilala",
    ward: "Mchikichini",
  },
  {
    name: "Mkwawa High School",
    code: "MKW001",
    region: "Iringa",
    district: "Iringa DC",
    ward: "Makorongoni",
  },
  {
    name: "St. Francis Girls Secondary School",
    code: "STF001",
    region: "Dar es Salaam",
    district: "Kinondoni",
    ward: "Mwananyamala",
  },
  {
    name: "Ilboru Secondary School",
    code: "ILB001",
    region: "Arusha",
    district: "Arusha CC",
    ward: "Ilboru",
  },
  {
    name: "Jangwani Secondary School",
    code: "JNG001",
    region: "Dar es Salaam",
    district: "Ilala",
    ward: "Jangwani",
  },
  {
    name: "Kibaha Secondary School",
    code: "KBH001",
    region: "Pwani",
    district: "Kibaha",
    ward: "Kibaha",
  },
  {
    name: "Loyola High School",
    code: "LOY001",
    region: "Dar es Salaam",
    district: "Kinondoni",
    ward: "Sinza",
  },
  {
    name: "Tanga School",
    code: "TNG001",
    region: "Tanga",
    district: "Tanga CC",
    ward: "Chumbageni",
  },
  {
    name: "Zanaki Secondary School",
    code: "ZNK001",
    region: "Mara",
    district: "Butiama",
    ward: "Butiama",
  },
  {
    name: "Marian Girls Secondary School",
    code: "MAR001",
    region: "Morogoro",
    district: "Morogoro MC",
    ward: "Kihonda",
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function randomPhone() {
  const prefixes = [
    "0712",
    "0713",
    "0714",
    "0715",
    "0754",
    "0755",
    "0765",
    "0767",
  ];
  return `${randomItem(prefixes)}${Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0")}`;
}

function generateEmail(firstName, lastName) {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@econnect.co.tz`;
}

function generateStudentId(schoolCode, index) {
  return `${schoolCode}-S${(index + 1).toString().padStart(4, "0")}`;
}

function generateInvoiceNumber() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `INV-${timestamp}-${random}`;
}

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// ============================================
// SEEDING FUNCTIONS
// ============================================

async function seedSchools() {
  console.log("📚 Seeding schools...");

  const schools = await School.insertMany(
    SCHOOLS_DATA.map((s) => ({
      ...s,
      phone: randomPhone(),
      email: `info@${s.code.toLowerCase()}.sc.tz`,
      is_active: true,
      settings: {
        academic_year: "2024",
        terms: ["Term 1", "Term 2", "Term 3"],
      },
    }))
  );

  console.log(`✅ Created ${schools.length} schools`);
  return schools;
}

async function seedSuperAdmin() {
  console.log("👤 Seeding SuperAdmin...");

  const hashedPassword = await hashPassword(ADMIN_PASSWORD);

  const superadmin = await User.create({
    names: { first: "System", last: "Administrator" },
    username: "superadmin",
    email: "admin@econnect.co.tz",
    phone: "0700000000",
    password: hashedPassword,
    role: "superadmin",
    accepted_terms: true,
    is_approved: true,
    metadata: {
      position: "System Administrator",
      department: "IT & Operations",
    },
  });

  console.log("✅ Created SuperAdmin");
  return superadmin;
}

async function seedOPSUsers() {
  console.log("👥 Seeding OPS users...");

  const hashedPassword = await hashPassword(OPS_PASSWORD);
  const opsUsers = [];

  const opsData = [
    { first: "Daniel", last: "Mwakasege", phone: "0712345001" },
    { first: "Grace", last: "Ndunguru", phone: "0712345002" },
  ];

  for (const data of opsData) {
    const user = await User.create({
      names: { first: data.first, last: data.last },
      username: data.phone,
      email: generateEmail(data.first, data.last),
      phone: data.phone,
      password: hashedPassword,
      role: "ops",
      accepted_terms: true,
      is_approved: true,
      location: {
        region: randomItem(REGIONS),
        district: "Regional Office",
      },
      metadata: {
        department: "Operations & Support",
        position: "Operations Manager",
      },
    });
    opsUsers.push(user);
  }

  console.log(`✅ Created ${opsUsers.length} OPS users`);
  return opsUsers;
}

async function seedTAMISEMIUsers() {
  console.log("🏛️ Seeding TAMISEMI users...");

  const hashedPassword = await hashPassword("tamisemi123");
  const tamisemiUsers = [];

  const tamisemiData = [
    {
      first: "Dr. William",
      last: "Mgimwa",
      phone: "0713456001",
      region: "Dodoma",
    },
    {
      first: "Eng. Sophia",
      last: "Kimaro",
      phone: "0713456002",
      region: "Dar es Salaam",
    },
  ];

  for (const data of tamisemiData) {
    const user = await User.create({
      names: { first: data.first, last: data.last },
      username: data.phone,
      email: generateEmail(
        data.first.replace("Dr. ", "").replace("Eng. ", ""),
        data.last
      ),
      phone: data.phone,
      password: hashedPassword,
      role: "tamisemi",
      accepted_terms: true,
      is_approved: true,
      location: {
        region: data.region,
        district: "TAMISEMI Office",
      },
      metadata: {
        department: "Ministry of Education",
        position: "Education Officer",
        jurisdiction: data.region,
      },
    });
    tamisemiUsers.push(user);
  }

  console.log(`✅ Created ${tamisemiUsers.length} TAMISEMI users`);
  return tamisemiUsers;
}

async function seedHeadmasters(schools) {
  console.log("🎓 Seeding Headmasters...");

  const hashedPassword = await hashPassword(HEAD_PASSWORD);
  const headmasters = [];

  for (let i = 0; i < schools.length; i++) {
    const school = schools[i];
    const isMale = i % 2 === 0;
    const firstName = randomItem(
      isMale ? FIRST_NAMES.male : FIRST_NAMES.female
    );
    const lastName = randomItem(LAST_NAMES);

    const headmaster = await User.create({
      names: { first: firstName, last: lastName },
      username: randomPhone(),
      email: `head@${school.code.toLowerCase()}.sc.tz`,
      phone: randomPhone(),
      password: hashedPassword,
      role: "school_admin",
      school_id: school._id,
      accepted_terms: true,
      is_approved: true,
      location: {
        region: school.region,
        district: school.district,
        ward: school.ward,
      },
      teacher: {
        is_head: true,
        subjects: randomItems(SUBJECTS, 2),
        teaching_level: randomItem([
          "Secondary - O Level",
          "Secondary - A Level",
        ]),
        institution_type: randomItem(["Government", "Private"]),
        experience_years: Math.floor(Math.random() * 20) + 10,
      },
      metadata: {
        position: "Headmaster/Headmistress",
        qualification: "Master of Education",
        school_name: school.name,
      },
    });

    headmasters.push(headmaster);
  }

  console.log(`✅ Created ${headmasters.length} headmasters`);
  return headmasters;
}

async function seedTeachers(schools) {
  console.log("👨‍🏫 Seeding Teachers...");

  const hashedPassword = await hashPassword(TEACHER_PASSWORD);
  const teachers = [];
  const teachersPerSchool = 8;

  for (const school of schools) {
    for (let i = 0; i < teachersPerSchool; i++) {
      const isMale = Math.random() > 0.4;
      const firstName = randomItem(
        isMale ? FIRST_NAMES.male : FIRST_NAMES.female
      );
      const lastName = randomItem(LAST_NAMES);
      const phone = randomPhone();

      const teacher = await User.create({
        names: { first: firstName, last: lastName },
        username: phone,
        email: generateEmail(firstName, lastName),
        phone,
        password: hashedPassword,
        role: "teacher",
        school_id: school._id,
        accepted_terms: true,
        is_approved: true,
        location: {
          region: school.region,
          district: school.district,
          ward: school.ward,
        },
        teacher: {
          subjects: randomItems(SUBJECTS, Math.floor(Math.random() * 3) + 1),
          teaching_level: randomItem(TEACHING_LEVELS),
          institution_type: randomItem([
            "Government",
            "Private",
            "International",
          ]),
          experience_years: Math.floor(Math.random() * 15) + 1,
          is_head: false,
        },
        metadata: {
          qualification: randomItem([
            "Bachelor of Education",
            "Master of Arts",
            "Master of Science",
          ]),
          school_name: school.name,
          employee_id: `TCH-${school.code}-${(i + 1)
            .toString()
            .padStart(3, "0")}`,
        },
      });

      teachers.push(teacher);
    }
  }

  console.log(`✅ Created ${teachers.length} teachers`);
  return teachers;
}

async function seedStudents(schools) {
  console.log("👨‍🎓 Seeding Students with all registration types...");

  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);
  const students = [];
  const studentsPerSchool = 40;

  const registrationTypes = [
    { type: "premier_registration", fee: 50000, count: 10 },
    { type: "normal_registration", fee: 30000, count: 15 },
    { type: "diamond_tier", fee: 100000, count: 8 },
    { type: "silver_tier", fee: 75000, count: 7 },
  ];

  let studentIndex = 0;

  for (const school of schools) {
    let schoolStudentIndex = 0;

    for (const regType of registrationTypes) {
      for (let i = 0; i < regType.count; i++) {
        const isMale = Math.random() > 0.45;
        const firstName = randomItem(
          isMale ? FIRST_NAMES.male : FIRST_NAMES.female
        );
        const middleName =
          Math.random() > 0.5
            ? randomItem(isMale ? FIRST_NAMES.male : FIRST_NAMES.female)
            : "";
        const lastName = randomItem(LAST_NAMES);
        const phone = randomPhone();
        const classLevel = randomItem(CLASS_LEVELS);
        const talentCount = Math.floor(Math.random() * 4) + 1;
        const selectedTalents = randomItems(TALENTS, talentCount);

        const isCTMStudent = regType.type.includes("registration");

        const student = await User.create({
          names: {
            first: firstName,
            middle: middleName,
            last: lastName,
          },
          username: phone,
          email: generateEmail(firstName, lastName),
          phone,
          password: hashedPassword,
          role: "student",
          school_id: school._id,
          accepted_terms: true,
          is_approved: true,
          location: {
            region: school.region,
            district: school.district,
            ward: school.ward,
          },
          student: {
            student_id: generateStudentId(school.code, schoolStudentIndex),
            class_level: classLevel,
            year: 2024,
            talents: selectedTalents,
          },
          membership: {
            id: `CTM-${school.code}-${(schoolStudentIndex + 1)
              .toString()
              .padStart(4, "0")}`,
            club_status: isCTMStudent ? "active" : "inactive",
            awards: [],
            join_date: new Date("2024-01-15"),
          },
          metadata: {
            registrationType: regType.type,
            registration_type: regType.type,
            registrationFeePaid: regType.fee,
            is_ctm_student: isCTMStudent,
            school_name: school.name,
            academicYear: "2024",
            course:
              classLevel.includes("5") || classLevel.includes("6")
                ? randomItem(["Science", "Arts", "Commerce"])
                : undefined,
            parent_phone: randomPhone(),
            parent_name: `${randomItem(FIRST_NAMES.male)} ${randomItem(
              LAST_NAMES
            )}`,
          },
        });

        students.push(student);
        schoolStudentIndex++;
        studentIndex++;
      }
    }
  }

  console.log(`✅ Created ${students.length} students`);
  console.log(
    `   - Premier: ${
      students.filter(
        (s) => s.metadata.registrationType === "premier_registration"
      ).length
    }`
  );
  console.log(
    `   - Normal: ${
      students.filter(
        (s) => s.metadata.registrationType === "normal_registration"
      ).length
    }`
  );
  console.log(
    `   - Diamond: ${
      students.filter((s) => s.metadata.registrationType === "diamond_tier")
        .length
    }`
  );
  console.log(
    `   - Silver: ${
      students.filter((s) => s.metadata.registrationType === "silver_tier")
        .length
    }`
  );
  return students;
}

async function seedEntrepreneurs() {
  console.log("💼 Seeding Entrepreneurs...");

  const hashedPassword = await hashPassword(BIZ_PASSWORD);
  const entrepreneurs = [];

  const bizCategories = [
    "Agriculture & Food Processing",
    "Technology & Software",
    "Fashion & Textiles",
    "Education & Training",
    "Healthcare & Wellness",
    "Tourism & Hospitality",
    "Manufacturing & Production",
    "Retail & E-commerce",
  ];

  for (let i = 0; i < 15; i++) {
    const isMale = Math.random() > 0.4;
    const firstName = randomItem(
      isMale ? FIRST_NAMES.male : FIRST_NAMES.female
    );
    const lastName = randomItem(LAST_NAMES);
    const phone = randomPhone();
    const selectedCategories = randomItems(
      bizCategories,
      Math.floor(Math.random() * 2) + 1
    );

    const businessNames = [
      `${firstName} Enterprises`,
      `${lastName} Solutions`,
      `${firstName} & Co.`,
      `${lastName} Industries`,
      "Smart Innovations Ltd",
      "Future Tech TZ",
      "Green Valley Farms",
      "Urban Fashion Hub",
    ];

    const entrepreneur = await User.create({
      names: { first: firstName, last: lastName },
      username: phone,
      email: generateEmail(firstName, lastName),
      phone,
      password: hashedPassword,
      role: "nonstudent",
      accepted_terms: true,
      is_approved: true,
      location: {
        region: randomItem(REGIONS),
        district: randomItem(["Ilala", "Kinondoni", "Temeke", "Arusha CC"]),
      },
      biz: {
        categories: selectedCategories,
        business_name: randomItem(businessNames),
        revenue: Math.floor(Math.random() * 50000000) + 1000000,
        description: `${selectedCategories[0]} business operating in Tanzania`,
      },
      metadata: {
        registration_date: new Date("2024-02-01"),
        business_registration_number: `BRN-${Math.floor(
          Math.random() * 1000000
        )}`,
        tax_id: `TIN-${Math.floor(Math.random() * 10000000)}`,
      },
    });

    entrepreneurs.push(entrepreneur);
  }

  console.log(`✅ Created ${entrepreneurs.length} entrepreneurs`);
  return entrepreneurs;
}

async function seedAssignments(schools, teachers, students) {
  console.log("📝 Seeding Assignments...");

  const assignments = [];
  const assignmentsPerTeacher = 3;

  for (const teacher of teachers.slice(0, 20)) {
    const teacherSchool = schools.find((s) => s._id.equals(teacher.school_id));
    const teacherSubjects = teacher.teacher.subjects || [randomItem(SUBJECTS)];

    for (let i = 0; i < assignmentsPerTeacher; i++) {
      const subject = randomItem(teacherSubjects);
      const classLevel = randomItem(CLASS_LEVELS);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) + 1);

      const titles = [
        `${subject} Assignment ${i + 1}`,
        `${subject} Research Project`,
        `${subject} Practical Exercise`,
        `${subject} Essay`,
        `${subject} Problem Set`,
      ];

      // Find students from same school and class
      const eligibleStudents = students.filter(
        (s) =>
          s.school_id.equals(teacherSchool._id) &&
          s.student.class_level === classLevel
      );

      // Random submissions
      const submissions = eligibleStudents
        .slice(0, Math.floor(Math.random() * 5))
        .map((student) => ({
          student_id: student._id,
          submitted_at: new Date(
            Date.now() - Math.floor(Math.random() * 86400000 * 7)
          ),
          notes: "Assignment submitted",
          score: Math.floor(Math.random() * 40) + 60,
          feedback: randomItem([
            "Excellent work!",
            "Good effort",
            "Needs improvement",
            "Well done",
          ]),
        }));

      const assignment = await Assignment.create({
        title: randomItem(titles),
        description: `Complete the ${subject} exercises from chapter ${
          Math.floor(Math.random() * 10) + 1
        }. Show all your work and submit by due date.`,
        subject,
        class_level: classLevel,
        teacher_id: teacher._id,
        school_id: teacherSchool._id,
        due_date: dueDate,
        max_score: 100,
        submissions,
      });

      assignments.push(assignment);
    }
  }

  console.log(`✅ Created ${assignments.length} assignments`);
  return assignments;
}

async function seedGrades(students, teachers, schools) {
  console.log("📊 Seeding Grades...");

  const grades = [];
  const gradesPerStudent = 8;

  for (const student of students.slice(0, 100)) {
    const school = schools.find((s) => s._id.equals(student.school_id));
    const schoolTeachers = teachers.filter((t) =>
      t.school_id.equals(school._id)
    );

    for (let i = 0; i < gradesPerStudent; i++) {
      const teacher = randomItem(schoolTeachers);
      const subject = randomItem(teacher.teacher.subjects || SUBJECTS);
      const score = Math.floor(Math.random() * 40) + 50;

      let grade = "F";
      if (score >= 80) grade = "A";
      else if (score >= 70) grade = "B";
      else if (score >= 60) grade = "C";
      else if (score >= 50) grade = "D";

      const gradeRecord = await Grade.create({
        student_id: student._id,
        subject,
        exam_type: randomItem(["Quiz", "Midterm", "Final", "Assignment"]),
        score,
        max_score: 100,
        grade,
        academic_year: "2024",
        term: randomItem(["Term 1", "Term 2", "Term 3"]),
        teacher_id: teacher._id,
        school_id: school._id,
      });

      grades.push(gradeRecord);
    }
  }

  console.log(`✅ Created ${grades.length} grade records`);
  return grades;
}

async function seedAttendance(students, schools) {
  console.log("📅 Seeding Attendance...");

  const attendanceRecords = [];
  const daysToGenerate = 30;

  for (const student of students.slice(0, 100)) {
    const school = schools.find((s) => s._id.equals(student.school_id));

    for (let i = 0; i < daysToGenerate; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const statuses = [
        "present",
        "present",
        "present",
        "present",
        "late",
        "absent",
      ];

      const record = await Attendance.create({
        student_id: student._id,
        school_id: school._id,
        date,
        status: randomItem(statuses),
        subject: randomItem(SUBJECTS),
        notes: "",
      });

      attendanceRecords.push(record);
    }
  }

  console.log(`✅ Created ${attendanceRecords.length} attendance records`);
  return attendanceRecords;
}

async function seedEvents(schools) {
  console.log("🎉 Seeding Events...");

  const events = [];
  const eventsPerSchool = 5;

  const eventTemplates = [
    { title: "Inter-School Football Tournament", category: "sports" },
    { title: "Science Fair 2024", category: "academic" },
    { title: "CTM Talent Showcase", category: "ctm" },
    { title: "Cultural Day Celebration", category: "cultural" },
    { title: "Annual Music Concert", category: "ctm" },
    { title: "Mathematics Competition", category: "academic" },
    { title: "Drama Festival", category: "ctm" },
    { title: "Environmental Cleanup Day", category: "other" },
  ];

  for (const school of schools) {
    for (let i = 0; i < eventsPerSchool; i++) {
      const template = randomItem(eventTemplates);
      const eventDate = new Date();
      eventDate.setDate(eventDate.getDate() + Math.floor(Math.random() * 60));

      const event = await Event.create({
        title: template.title,
        description: `Join us for ${template.title} at ${school.name}. All students are welcome!`,
        category: template.category,
        date: eventDate,
        time: randomItem(["09:00 AM", "10:00 AM", "02:00 PM", "03:00 PM"]),
        location: school.name,
        organizer: school.name,
        school_id: school._id,
        max_participants: Math.floor(Math.random() * 100) + 50,
        registered_students: [],
      });

      events.push(event);
    }
  }

  console.log(`✅ Created ${events.length} events`);
  return events;
}

async function seedAnnouncements(schools, teachers) {
  console.log("📢 Seeding Announcements...");

  const announcements = [];
  const announcementsPerSchool = 8;

  const announcementTemplates = [
    { title: "Exam Timetable Released", category: "school", priority: "high" },
    {
      title: "New Library Books Available",
      category: "school",
      priority: "low",
    },
    {
      title: "CTM Club Meeting This Friday",
      category: "ctm",
      priority: "medium",
    },
    {
      title: "Parent-Teacher Conference",
      category: "school",
      priority: "urgent",
    },
    {
      title: "Form 4 Mock Exams Starting",
      category: "class",
      priority: "high",
    },
    { title: "Sports Day Postponed", category: "school", priority: "medium" },
    { title: "School Fees Reminder", category: "urgent", priority: "urgent" },
    { title: "Holiday Notice", category: "school", priority: "medium" },
  ];

  for (const school of schools) {
    const schoolTeachers = teachers.filter((t) =>
      t.school_id.equals(school._id)
    );

    for (let i = 0; i < announcementsPerSchool; i++) {
      const template = randomItem(announcementTemplates);
      const author = randomItem(schoolTeachers);

      const announcement = await Announcement.create({
        title: template.title,
        content: `Important notice regarding ${template.title.toLowerCase()}. Please check with your class teacher for more details.`,
        category: template.category,
        priority: template.priority,
        author_id: author._id,
        school_id: school._id,
        target_audience: ["all"],
        is_pinned: template.priority === "urgent",
        read_by: [],
      });

      announcements.push(announcement);
    }
  }

  console.log(`✅ Created ${announcements.length} announcements`);
  return announcements;
}

async function seedMessages(students, teachers) {
  console.log("💬 Seeding Messages...");

  const messages = [];
  const messagesCount = 50;

  for (let i = 0; i < messagesCount; i++) {
    const student = randomItem(students);
    const school = await School.findById(student.school_id);
    const schoolTeachers = teachers.filter((t) =>
      t.school_id.equals(school._id)
    );
    const teacher = randomItem(schoolTeachers);

    const isStudentSender = Math.random() > 0.5;

    const studentMessages = [
      "Good morning, I have a question about the assignment.",
      "Could you please explain the homework?",
      "I was absent yesterday, what did I miss?",
      "Thank you for the lesson today!",
      "When is the next exam?",
    ];

    const teacherMessages = [
      "Please submit your assignment by Friday.",
      "Good work on your last exam!",
      "See me after class for extra help.",
      "Don't forget to study for tomorrow's quiz.",
      "Well done on your project!",
    ];

    const message = await Message.create({
      sender_id: isStudentSender ? student._id : teacher._id,
      receiver_id: isStudentSender ? teacher._id : student._id,
      content: isStudentSender
        ? randomItem(studentMessages)
        : randomItem(teacherMessages),
      is_read: Math.random() > 0.3,
      read_at: Math.random() > 0.3 ? new Date() : undefined,
    });

    messages.push(message);
  }

  console.log(`✅ Created ${messages.length} messages`);
  return messages;
}

async function seedInvoices(students) {
  console.log("💳 Seeding Invoices...");

  const invoices = [];

  for (const student of students) {
    const registrationType = student.metadata.registrationType;
    const registrationFee = student.metadata.registrationFeePaid;

    // Registration Fee Invoice
    const registrationInvoice = await Invoice.create({
      student_id: student._id,
      invoice_number: generateInvoiceNumber(),
      type: "ctm_membership",
      description: `CTM Registration Fee - ${registrationType
        .replace("_", " ")
        .toUpperCase()}`,
      amount: registrationFee,
      currency: "TZS",
      status: Math.random() > 0.2 ? "paid" : "pending",
      due_date: new Date("2024-02-01"),
      paid_date: Math.random() > 0.2 ? new Date("2024-01-25") : undefined,
      academic_year: "2024",
    });

    invoices.push(registrationInvoice);

    // Random additional invoices
    if (Math.random() > 0.5) {
      const additionalInvoice = await Invoice.create({
        student_id: student._id,
        invoice_number: generateInvoiceNumber(),
        type: randomItem(["school_fees", "event", "certificate"]),
        description: randomItem([
          "School Fees - Term 1",
          "Sports Event Registration",
          "Certificate Processing Fee",
          "Exam Registration Fee",
        ]),
        amount: Math.floor(Math.random() * 50000) + 10000,
        currency: "TZS",
        status: randomItem(["paid", "pending", "verification"]),
        due_date: new Date(Date.now() + 86400000 * 30),
        academic_year: "2024",
      });

      invoices.push(additionalInvoice);
    }
  }

  console.log(`✅ Created ${invoices.length} invoices`);
  return invoices;
}

async function seedTimetables(schools, teachers) {
  console.log("📆 Seeding Timetables...");

  const timetables = [];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const timeSlots = [
    "08:00 - 09:00",
    "09:00 - 10:00",
    "10:00 - 11:00",
    "11:30 - 12:30",
    "12:30 - 13:30",
    "14:00 - 15:00",
    "15:00 - 16:00",
  ];

  for (const school of schools.slice(0, 5)) {
    const schoolTeachers = teachers.filter((t) =>
      t.school_id.equals(school._id)
    );

    for (const classLevel of CLASS_LEVELS) {
      for (const day of days) {
        for (const timeSlot of timeSlots) {
          const teacher = randomItem(schoolTeachers);
          const subject = randomItem(teacher.teacher.subjects || SUBJECTS);

          const timetable = await Timetable.create({
            school_id: school._id,
            class_level: classLevel,
            day,
            time_slot: timeSlot,
            subject,
            teacher_id: teacher._id,
            room: `Room ${Math.floor(Math.random() * 20) + 1}`,
          });

          timetables.push(timetable);
        }
      }
    }
  }

  console.log(`✅ Created ${timetables.length} timetable entries`);
  return timetables;
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedDatabase() {
  try {
    console.log("\n🚀 Starting ECONNECT Database Seeding...\n");
    console.log("📡 Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Clear existing data
    console.log("🗑️  Clearing existing data...");
    await User.deleteMany({});
    await School.deleteMany({});
    await Assignment.deleteMany({});
    await Grade.deleteMany({});
    await Attendance.deleteMany({});
    await Event.deleteMany({});
    await Announcement.deleteMany({});
    await Message.deleteMany({});
    await Invoice.deleteMany({});
    await Timetable.deleteMany({});
    console.log("✅ Database cleared\n");

    // Seed in order
    const schools = await seedSchools();
    const superadmin = await seedSuperAdmin();
    const opsUsers = await seedOPSUsers();
    const tamisemiUsers = await seedTAMISEMIUsers();
    const headmasters = await seedHeadmasters(schools);
    const teachers = await seedTeachers(schools);
    const students = await seedStudents(schools);
    const entrepreneurs = await seedEntrepreneurs();

    // Seed academic data
    const assignments = await seedAssignments(schools, teachers, students);
    const grades = await seedGrades(students, teachers, schools);
    const attendance = await seedAttendance(students, schools);
    const events = await seedEvents(schools);
    const announcements = await seedAnnouncements(schools, teachers);
    const messages = await seedMessages(students, teachers);
    const invoices = await seedInvoices(students);
    const timetables = await seedTimetables(schools, teachers);

    console.log("\n✅ ============================================");
    console.log("✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!");
    console.log("✅ ============================================\n");

    console.log("📊 Summary:");
    console.log(`   Schools: ${schools.length}`);
    console.log(`   SuperAdmin: 1`);
    console.log(`   OPS Users: ${opsUsers.length}`);
    console.log(`   TAMISEMI Users: ${tamisemiUsers.length}`);
    console.log(`   Headmasters: ${headmasters.length}`);
    console.log(`   Teachers: ${teachers.length}`);
    console.log(`   Students: ${students.length}`);
    console.log(`   Entrepreneurs: ${entrepreneurs.length}`);
    console.log(`   Assignments: ${assignments.length}`);
    console.log(`   Grades: ${grades.length}`);
    console.log(`   Attendance Records: ${attendance.length}`);
    console.log(`   Events: ${events.length}`);
    console.log(`   Announcements: ${announcements.length}`);
    console.log(`   Messages: ${messages.length}`);
    console.log(`   Invoices: ${invoices.length}`);
    console.log(`   Timetables: ${timetables.length}`);

    console.log("\n📝 Test Credentials:");
    console.log("   SuperAdmin: superadmin / admin123");
    console.log("   OPS: 0712345001 / ops123");
    console.log("   TAMISEMI: 0713456001 / tamisemi123");
    console.log("   Headmaster: Check any school email / head123");
    console.log("   Teacher: Any teacher phone / teacher123");
    console.log("   Student: Any student phone / student123");
    console.log("   Entrepreneur: Any entrepreneur phone / biz123");

    console.log("\n🎉 You can now login and test the system!\n");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("📡 Disconnected from MongoDB");
  }
}

// Run the seeder
seedDatabase()
  .then(() => {
    console.log("✅ Seeding script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seeding script failed:", error);
    process.exit(1);
  });
