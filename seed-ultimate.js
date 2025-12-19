// ============================================
// ECONNECT MULTI-SCHOOL & TALENT MANAGEMENT SYSTEM
// ULTIMATE SEED FILE - COMPREHENSIVE DATA POPULATION
// Version: 2.0.0
// ============================================
// ✅ Seeds ALL schemas with realistic test data
// ✅ Creates complete hierarchical data structure
// ✅ Includes 7+ user roles with sample users
// ✅ Registration types with pricing
// ✅ Events, books, businesses, talents, and more
// ============================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

// ============================================
// DATABASE CONNECTION
// ============================================
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";

// ============================================
// IMPORT ALL SCHEMAS
// ============================================

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: String,
  firstName: String,
  lastName: String,
  phoneNumber: String,
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
  gender: String,
  address: String,
  emergencyContact: String,
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
  registration_type: String,
  registration_fee_paid: { type: Number, default: 0 },
  registration_date: Date,
  next_billing_date: Date,
  is_ctm_student: { type: Boolean, default: true },
});

const regionSchema = new mongoose.Schema({
  name: String,
  code: String,
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const districtSchema = new mongoose.Schema({
  name: String,
  code: String,
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const wardSchema = new mongoose.Schema({
  name: String,
  code: String,
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  population: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const schoolSchema = new mongoose.Schema({
  name: String,
  schoolCode: String,
  type: String,
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  address: String,
  phoneNumber: String,
  email: String,
  principalName: String,
  totalStudents: { type: Number, default: 0 },
  totalTeachers: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  logo: String,
  website: String,
  establishedYear: Number,
  accreditationStatus: String,
  facilities: [String],
  coordinates: {
    latitude: Number,
    longitude: Number,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const talentSchema = new mongoose.Schema({
  name: String,
  category: String,
  description: String,
  icon: String,
  requirements: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const studentTalentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  talentId: { type: mongoose.Schema.Types.ObjectId, ref: "Talent" },
  proficiencyLevel: String,
  yearsOfExperience: Number,
  achievements: [String],
  awards: [Object],
  certifications: [Object],
  portfolio: [Object],
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  status: String,
  registeredAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
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
  discountPrice: Number,
  publisher: String,
  publishedDate: Date,
  language: String,
  pages: Number,
  rating: Number,
  ratingsCount: Number,
  reviews: [Object],
  soldCount: Number,
  viewCount: Number,
  stockQuantity: Number,
  format: String,
  tags: [String],
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  eventType: String,
  startDate: Date,
  endDate: Date,
  location: String,
  venue: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  maxParticipants: Number,
  currentParticipants: { type: Number, default: 0 },
  registrationFee: Number,
  registrationDeadline: Date,
  coverImage: String,
  bannerImage: String,
  status: String,
  isPublic: { type: Boolean, default: true },
  requirements: [String],
  prizes: [Object],
  sponsors: [Object],
  agenda: [Object],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const businessSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  businessType: String,
  registrationNumber: String,
  tinNumber: String,
  description: String,
  logo: String,
  bannerImage: String,
  address: String,
  phoneNumber: String,
  email: String,
  website: String,
  socialMedia: Object,
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  category: String,
  subCategory: String,
  establishedDate: Date,
  employeesCount: Number,
  annualRevenue: Number,
  isVerified: { type: Boolean, default: false },
  verificationDocuments: [String],
  operatingHours: Object,
  status: String,
  rating: Number,
  reviewsCount: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const productSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
  name: String,
  description: String,
  category: String,
  type: String,
  price: Number,
  discountPrice: Number,
  images: [String],
  stockQuantity: Number,
  sku: String,
  specifications: Object,
  tags: [String],
  rating: Number,
  reviewsCount: Number,
  soldCount: Number,
  viewCount: Number,
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const ctmMembershipSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  membershipNumber: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  status: String,
  joinDate: Date,
  expiryDate: Date,
  membershipType: String,
  talents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Talent" }],
  participationPoints: Number,
  achievements: [Object],
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Create models
const User = mongoose.model("User", userSchema);
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const School = mongoose.model("School", schoolSchema);
const Talent = mongoose.model("Talent", talentSchema);
const StudentTalent = mongoose.model("StudentTalent", studentTalentSchema);
const Book = mongoose.model("Book", bookSchema);
const Event = mongoose.model("Event", eventSchema);
const Business = mongoose.model("Business", businessSchema);
const Product = mongoose.model("Product", productSchema);
const CTMMembership = mongoose.model("CTMMembership", ctmMembershipSchema);

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

// ============================================
// SEED DATA DEFINITIONS
// ============================================

const REGIONS_DATA = [
  { name: "Dar es Salaam", code: "DSM", population: 5383728, area: 1590 },
  { name: "Arusha", code: "ARU", population: 2356255, area: 37576 },
  { name: "Dodoma", code: "DOD", population: 2083588, area: 41311 },
  { name: "Mwanza", code: "MWZ", population: 3699872, area: 25233 },
  { name: "Mbeya", code: "MBY", population: 2707410, area: 35954 },
  { name: "Morogoro", code: "MOR", population: 2218492, area: 73039 },
  { name: "Tanga", code: "TNG", population: 2615597, area: 27350 },
  { name: "Kilimanjaro", code: "KLM", population: 1640087, area: 13309 },
  { name: "Mtwara", code: "MTW", population: 1270854, area: 16720 },
  { name: "Kagera", code: "KGR", population: 2458023, area: 28388 },
];

const TALENTS_DATA = [
  {
    category: "Arts",
    talents: [
      {
        name: "Painting",
        description: "Visual art using colors and brushes",
        icon: "🎨",
        requirements: ["Brushes", "Canvas", "Paints"],
      },
      {
        name: "Drawing",
        description: "Creating images with pencils and pens",
        icon: "✏️",
        requirements: ["Pencils", "Paper", "Erasers"],
      },
      {
        name: "Sculpture",
        description: "Three-dimensional artwork creation",
        icon: "🗿",
        requirements: ["Clay", "Tools", "Workspace"],
      },
    ],
  },
  {
    category: "Music",
    talents: [
      {
        name: "Singing",
        description: "Vocal music performance",
        icon: "🎤",
        requirements: ["Microphone", "Practice space"],
      },
      {
        name: "Guitar Playing",
        description: "String instrument mastery",
        icon: "🎸",
        requirements: ["Guitar", "Tuner", "Picks"],
      },
      {
        name: "Piano",
        description: "Keyboard instrument performance",
        icon: "🎹",
        requirements: ["Piano/Keyboard", "Sheet music"],
      },
      {
        name: "Traditional Drums",
        description: "African percussion instruments",
        icon: "🥁",
        requirements: ["Drums", "Practice space"],
      },
    ],
  },
  {
    category: "Sports",
    talents: [
      {
        name: "Football",
        description: "Team ball sport",
        icon: "⚽",
        requirements: ["Ball", "Field", "Boots"],
      },
      {
        name: "Athletics",
        description: "Track and field events",
        icon: "🏃",
        requirements: ["Running shoes", "Track"],
      },
      {
        name: "Basketball",
        description: "Court ball sport",
        icon: "🏀",
        requirements: ["Ball", "Court", "Hoop"],
      },
      {
        name: "Netball",
        description: "Team ball sport",
        icon: "🏐",
        requirements: ["Ball", "Court", "Posts"],
      },
    ],
  },
  {
    category: "Dance",
    talents: [
      {
        name: "Traditional Dance",
        description: "Cultural dance forms",
        icon: "💃",
        requirements: ["Traditional attire", "Practice space"],
      },
      {
        name: "Modern Dance",
        description: "Contemporary dance styles",
        icon: "🕺",
        requirements: ["Dance floor", "Music system"],
      },
      {
        name: "Ballet",
        description: "Classical dance technique",
        icon: "🩰",
        requirements: ["Ballet shoes", "Barre", "Studio"],
      },
    ],
  },
  {
    category: "Technology",
    talents: [
      {
        name: "Programming",
        description: "Software development",
        icon: "💻",
        requirements: ["Computer", "Internet", "IDE"],
      },
      {
        name: "Robotics",
        description: "Building and programming robots",
        icon: "🤖",
        requirements: ["Robot kit", "Tools", "Workspace"],
      },
      {
        name: "Graphic Design",
        description: "Digital visual creation",
        icon: "🎨",
        requirements: ["Computer", "Design software"],
      },
    ],
  },
  {
    category: "Literature",
    talents: [
      {
        name: "Poetry",
        description: "Creative verse writing",
        icon: "📝",
        requirements: ["Notebook", "Pen"],
      },
      {
        name: "Storytelling",
        description: "Narrative creation and delivery",
        icon: "📖",
        requirements: ["Platform", "Audience"],
      },
      {
        name: "Creative Writing",
        description: "Fiction and non-fiction composition",
        icon: "✍️",
        requirements: ["Writing materials"],
      },
    ],
  },
  {
    category: "Performing Arts",
    talents: [
      {
        name: "Drama/Acting",
        description: "Theatrical performance",
        icon: "🎭",
        requirements: ["Scripts", "Stage", "Costumes"],
      },
      {
        name: "Comedy",
        description: "Humorous performance",
        icon: "😂",
        requirements: ["Stage", "Microphone"],
      },
      {
        name: "Public Speaking",
        description: "Eloquent speech delivery",
        icon: "🗣️",
        requirements: ["Platform", "Audience"],
      },
    ],
  },
  {
    category: "Crafts",
    talents: [
      {
        name: "Beadwork",
        description: "Creating items with beads",
        icon: "📿",
        requirements: ["Beads", "Thread", "Tools"],
      },
      {
        name: "Weaving",
        description: "Textile creation",
        icon: "🧶",
        requirements: ["Loom", "Thread", "Materials"],
      },
      {
        name: "Pottery",
        description: "Ceramic creation",
        icon: "🏺",
        requirements: ["Clay", "Wheel", "Kiln"],
      },
    ],
  },
];

const BOOKS_DATA = [
  {
    title: "Maths for Form 1",
    author: "Dr. John Matemba",
    category: "Education",
    description: "Comprehensive mathematics textbook for Form 1 students",
    price: 15000,
    publisher: "Tanzania Education Publishers",
    language: "English",
    pages: 320,
    format: "pdf",
    tags: ["mathematics", "secondary", "education"],
  },
  {
    title: "Kiswahili Kitukuu",
    author: "Prof. Amina Hassan",
    category: "Language",
    description: "Advanced Kiswahili language learning",
    price: 12000,
    publisher: "Mkuki na Nyota",
    language: "English", // Using "English" to avoid MongoDB text index language errors
    pages: 280,
    format: "pdf",
    tags: ["kiswahili", "language", "secondary"],
  },
  {
    title: "Tanzania History & Civics",
    author: "Dr. Mohamed Ali",
    category: "Social Studies",
    description: "Comprehensive history and civics for secondary schools",
    price: 18000,
    publisher: "Tanzania Education Board",
    language: "English",
    pages: 400,
    format: "pdf",
    tags: ["history", "civics", "secondary"],
  },
  {
    title: "Biology Form 2",
    author: "Dr. Grace Mwakasege",
    category: "Science",
    description: "Biology textbook with practical experiments",
    price: 20000,
    publisher: "Science Publishers TZ",
    language: "English",
    pages: 380,
    format: "pdf",
    tags: ["biology", "science", "secondary"],
  },
  {
    title: "Physics Fundamentals",
    author: "Dr. Peter Kamwela",
    category: "Science",
    description: "Introduction to physics concepts",
    price: 22000,
    publisher: "Academic Press TZ",
    language: "English",
    pages: 420,
    format: "pdf",
    tags: ["physics", "science", "secondary"],
  },
  {
    title: "English Grammar & Composition",
    author: "Margaret Johnson",
    category: "Language",
    description: "Complete English language guide",
    price: 16000,
    publisher: "Language Masters",
    language: "English",
    pages: 350,
    format: "pdf",
    tags: ["english", "language", "grammar"],
  },
];

const EVENTS_DATA = [
  {
    title: "National Talent Show 2025",
    description:
      "Showcase your talents in music, dance, arts, and more. Open to all students nationwide.",
    eventType: "talent_show",
    daysFromNow: 30,
    duration: 3,
    location: "Julius Nyerere International Convention Centre, Dar es Salaam",
    venue: "Main Hall",
    maxParticipants: 500,
    registrationFee: 5000,
    prizes: [
      {
        position: "1st Place",
        description: "Trophy + TZS 500,000",
        amount: 500000,
      },
      {
        position: "2nd Place",
        description: "Trophy + TZS 300,000",
        amount: 300000,
      },
      {
        position: "3rd Place",
        description: "Trophy + TZS 200,000",
        amount: 200000,
      },
    ],
  },
  {
    title: "Inter-School Football Championship",
    description: "Annual football tournament for secondary schools",
    eventType: "competition",
    daysFromNow: 45,
    duration: 7,
    location: "National Stadium, Dar es Salaam",
    venue: "Main Pitch",
    maxParticipants: 32,
    registrationFee: 50000,
    prizes: [
      {
        position: "Winner",
        description: "Trophy + TZS 2,000,000",
        amount: 2000000,
      },
      {
        position: "Runner-up",
        description: "Trophy + TZS 1,000,000",
        amount: 1000000,
      },
    ],
  },
  {
    title: "Robotics & Innovation Workshop",
    description: "Learn robotics, programming, and innovation skills",
    eventType: "workshop",
    daysFromNow: 15,
    duration: 2,
    location: "University of Dar es Salaam",
    venue: "Engineering Building",
    maxParticipants: 100,
    registrationFee: 10000,
  },
  {
    title: "Art Exhibition & Competition",
    description: "Display your artwork and compete for prizes",
    eventType: "exhibition",
    daysFromNow: 20,
    duration: 5,
    location: "National Museum, Dar es Salaam",
    venue: "Gallery A",
    maxParticipants: 200,
    registrationFee: 3000,
    prizes: [
      { position: "Best Painting", description: "TZS 300,000", amount: 300000 },
      {
        position: "Best Sculpture",
        description: "TZS 250,000",
        amount: 250000,
      },
      {
        position: "Best Photography",
        description: "TZS 200,000",
        amount: 200000,
      },
    ],
  },
  {
    title: "Drama & Theatre Festival",
    description: "Perform your plays and compete with other schools",
    eventType: "festival",
    daysFromNow: 60,
    duration: 4,
    location: "Mlimani City Theatre, Dar es Salaam",
    venue: "Main Stage",
    maxParticipants: 30,
    registrationFee: 20000,
  },
];

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding...\n");

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ Connected to MongoDB\n");

    // ============================================
    // CLEAR EXISTING DATA
    // ============================================
    console.log("🗑️  Clearing existing data...");
    await Promise.all([
      User.deleteMany({}),
      Region.deleteMany({}),
      District.deleteMany({}),
      Ward.deleteMany({}),
      School.deleteMany({}),
      Talent.deleteMany({}),
      StudentTalent.deleteMany({}),
      Book.deleteMany({}),
      Event.deleteMany({}),
      Business.deleteMany({}),
      Product.deleteMany({}),
      CTMMembership.deleteMany({}),
    ]);
    console.log("✅ Database cleared\n");

    // ============================================
    // SEED REGIONS
    // ============================================
    console.log("📍 Seeding regions...");
    const regions = await Region.insertMany(REGIONS_DATA);
    console.log(`✅ Created ${regions.length} regions\n`);

    // ============================================
    // SEED DISTRICTS
    // ============================================
    console.log("📍 Seeding districts...");
    const districtsData = [];
    regions.forEach((region, regionIndex) => {
      const districtNames = [
        ["Ilala", "Kinondoni", "Temeke", "Ubungo", "Kigamboni"],
        ["Arusha City", "Arusha Rural", "Karatu", "Monduli", "Ngorongoro"],
        ["Dodoma Urban", "Dodoma Rural", "Kondoa", "Mpwapwa", "Kongwa"],
        ["Mwanza City", "Nyamagana", "Ilemela", "Sengerema", "Ukerewe"],
        ["Mbeya City", "Mbeya Rural", "Rungwe", "Kyela", "Chunya"],
        ["Morogoro Urban", "Morogoro Rural", "Mvomero", "Kilombero", "Ulanga"],
        ["Tanga City", "Muheza", "Pangani", "Handeni", "Lushoto"],
        ["Moshi Urban", "Moshi Rural", "Hai", "Rombo", "Same"],
        ["Mtwara Urban", "Mtwara Rural", "Masasi", "Newala", "Tandahimba"],
        ["Bukoba Urban", "Bukoba Rural", "Muleba", "Karagwe", "Ngara"],
      ];

      districtNames[regionIndex].forEach((name, idx) => {
        districtsData.push({
          name,
          code: `${region.code}${(idx + 1).toString().padStart(2, "0")}`,
          regionId: region._id,
          population: Math.floor(Math.random() * 500000) + 100000,
          area: Math.floor(Math.random() * 5000) + 500,
        });
      });
    });
    const districts = await District.insertMany(districtsData);
    console.log(`✅ Created ${districts.length} districts\n`);

    // ============================================
    // SEED WARDS
    // ============================================
    console.log("📍 Seeding wards...");
    const wardsData = [];
    districts.slice(0, 10).forEach((district, idx) => {
      // Seed wards for first 10 districts
      for (let i = 1; i <= 5; i++) {
        wardsData.push({
          name: `${district.name} Ward ${i}`,
          code: `${district.code}W${i.toString().padStart(2, "0")}`,
          districtId: district._id,
          population: Math.floor(Math.random() * 50000) + 5000,
        });
      }
    });
    const wards = await Ward.insertMany(wardsData);
    console.log(`✅ Created ${wards.length} wards\n`);

    // ============================================
    // SEED SCHOOLS
    // ============================================
    console.log("🏫 Seeding schools...");
    const schoolsData = [];
    const schoolTypes = ["primary", "secondary", "high_school"];
    const accreditationStatuses = [
      "accredited",
      "provisional",
      "not_accredited",
    ];

    districts.slice(0, 20).forEach((district, idx) => {
      for (let i = 1; i <= 3; i++) {
        const regionName = regions.find(
          (r) => r._id.toString() === district.regionId.toString()
        )?.name;
        schoolsData.push({
          name: `${district.name} ${randomElement([
            "Primary",
            "Secondary",
            "High",
          ])} School ${i}`,
          schoolCode: `SCH${(idx * 3 + i).toString().padStart(4, "0")}`,
          type: randomElement(schoolTypes),
          regionId: district.regionId,
          districtId: district._id,
          wardId: wards.find(
            (w) => w.districtId.toString() === district._id.toString()
          )?._id,
          address: `${district.name}, ${regionName}`,
          phoneNumber: `+255${
            Math.floor(Math.random() * 900000000) + 700000000
          }`,
          email: `school${idx * 3 + i}@econnect.co.tz`,
          principalName: `${randomElement([
            "Dr.",
            "Mr.",
            "Mrs.",
            "Ms.",
          ])} ${randomElement([
            "John",
            "Mary",
            "Peter",
            "Grace",
            "James",
            "Sarah",
          ])} ${randomElement([
            "Kamwela",
            "Mwakasege",
            "Hassan",
            "Matemba",
            "Mushi",
          ])}`,
          totalStudents: Math.floor(Math.random() * 800) + 200,
          totalTeachers: Math.floor(Math.random() * 50) + 10,
          establishedYear: Math.floor(Math.random() * 50) + 1970,
          accreditationStatus: randomElement(accreditationStatuses),
          facilities: [
            "Library",
            "Computer Lab",
            "Science Lab",
            "Sports Field",
            "Cafeteria",
          ],
          coordinates: {
            latitude: -6.8 + Math.random() * 2,
            longitude: 39.0 + Math.random() * 2,
          },
        });
      }
    });
    const schools = await School.insertMany(schoolsData);
    console.log(`✅ Created ${schools.length} schools\n`);

    // ============================================
    // SEED SUPER ADMIN
    // ============================================
    console.log("👤 Creating Super Admin...");
    const superAdmin = await User.create({
      username: "superadmin",
      email: "admin@econnect.co.tz",
      password: await hashPassword("Admin@123"),
      role: "super_admin",
      firstName: "System",
      lastName: "Administrator",
      phoneNumber: "+255700000001",
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });
    console.log("✅ Super Admin created");
    console.log("   📧 Email: admin@econnect.co.tz");
    console.log("   🔑 Password: Admin@123\n");

    // ============================================
    // SEED TAMISEMI & OFFICIALS
    // ============================================
    console.log("👥 Creating TAMISEMI and Officials...");
    const officials = [];

    // TAMISEMI
    officials.push(
      await User.create({
        username: "tamisemi",
        email: "tamisemi@econnect.co.tz",
        password: await hashPassword("Tamisemi@123"),
        role: "tamisemi",
        firstName: "TAMISEMI",
        lastName: "Official",
        phoneNumber: "+255700000002",
        isActive: true,
        isEmailVerified: true,
        staffPosition: "Director",
        department: "Education",
      })
    );

    // National Officials
    officials.push(
      await User.create({
        username: "national_official",
        email: "national@econnect.co.tz",
        password: await hashPassword("National@123"),
        role: "national_official",
        firstName: "National",
        lastName: "Education Officer",
        phoneNumber: "+255700000003",
        isActive: true,
        isEmailVerified: true,
        staffPosition: "National Coordinator",
        department: "National Education",
      })
    );

    // Regional Officials (one per region)
    for (let i = 0; i < Math.min(3, regions.length); i++) {
      officials.push(
        await User.create({
          username: `regional_${regions[i].code.toLowerCase()}`,
          email: `regional.${regions[i].code.toLowerCase()}@econnect.co.tz`,
          password: await hashPassword("Regional@123"),
          role: "regional_official",
          firstName: "Regional",
          lastName: `Officer ${regions[i].name}`,
          phoneNumber: `+2557000000${10 + i}`,
          regionId: regions[i]._id,
          isActive: true,
          isEmailVerified: true,
          staffPosition: "Regional Education Officer",
          department: `${regions[i].name} Region`,
        })
      );
    }

    // District Officials (one per first 5 districts)
    for (let i = 0; i < Math.min(5, districts.length); i++) {
      officials.push(
        await User.create({
          username: `district_${districts[i].code.toLowerCase()}`,
          email: `district.${districts[i].code.toLowerCase()}@econnect.co.tz`,
          password: await hashPassword("District@123"),
          role: "district_official",
          firstName: "District",
          lastName: `Officer ${districts[i].name}`,
          phoneNumber: `+2557000000${20 + i}`,
          regionId: districts[i].regionId,
          districtId: districts[i]._id,
          isActive: true,
          isEmailVerified: true,
          staffPosition: "District Education Officer",
          department: `${districts[i].name} District`,
        })
      );
    }

    console.log(`✅ Created ${officials.length} officials\n`);

    // ============================================
    // SEED HEADMASTERS
    // ============================================
    console.log("👨‍💼 Creating Headmasters...");
    const headmasters = [];
    for (let i = 0; i < Math.min(20, schools.length); i++) {
      const school = schools[i];
      headmasters.push(
        await User.create({
          username: `headmaster_${school.schoolCode.toLowerCase()}`,
          email: `headmaster.${school.schoolCode.toLowerCase()}@econnect.co.tz`,
          password: await hashPassword("Head@123"),
          role: "headmaster",
          firstName:
            randomElement(["Dr.", "Mr.", "Mrs."]) +
            " " +
            randomElement(["John", "Mary", "Peter", "Grace"]),
          lastName: randomElement([
            "Kamwela",
            "Mwakasege",
            "Hassan",
            "Matemba",
          ]),
          phoneNumber: `+2557000001${i.toString().padStart(2, "0")}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          isActive: true,
          isEmailVerified: true,
          staffPosition: "Headmaster",
          department: "Administration",
          qualification: randomElement(["PhD", "Masters", "Bachelors"]),
          yearsOfExperience: Math.floor(Math.random() * 20) + 5,
        })
      );
    }
    console.log(`✅ Created ${headmasters.length} headmasters\n`);

    // ============================================
    // SEED TEACHERS
    // ============================================
    console.log("👨‍🏫 Creating Teachers...");
    const teachers = [];
    const subjects = [
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
    ];

    for (let i = 0; i < Math.min(50, schools.length * 3); i++) {
      const school = schools[i % schools.length];
      teachers.push(
        await User.create({
          username: `teacher${(i + 1).toString().padStart(3, "0")}`,
          email: `teacher${i + 1}@econnect.co.tz`,
          password: await hashPassword("Teacher@123"),
          role: "teacher",
          firstName: randomElement([
            "John",
            "Mary",
            "Peter",
            "Grace",
            "James",
            "Sarah",
            "David",
            "Lucy",
          ]),
          lastName: randomElement([
            "Kamwela",
            "Mwakasege",
            "Hassan",
            "Matemba",
            "Mushi",
            "Mbwana",
            "Mlowe",
          ]),
          phoneNumber: `+2557000002${i.toString().padStart(2, "0")}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          isActive: true,
          isEmailVerified: true,
          employeeId: `EMP${(i + 1).toString().padStart(5, "0")}`,
          specialization: randomElement(subjects),
          qualification: randomElement(["Bachelors", "Masters", "Diploma"]),
          yearsOfExperience: Math.floor(Math.random() * 15) + 1,
        })
      );
    }
    console.log(`✅ Created ${teachers.length} teachers\n`);

    // ============================================
    // SEED STUDENTS
    // ============================================
    console.log("👨‍🎓 Creating Students...");
    const students = [];
    const registrationTypes = [
      "normal_registration",
      "premier_registration",
      "silver_registration",
      "diamond_registration",
    ];
    const gradeLevels = [
      "Form 1",
      "Form 2",
      "Form 3",
      "Form 4",
      "Form 5",
      "Form 6",
    ];

    for (let i = 0; i < 100; i++) {
      const school = schools[i % schools.length];
      const regType = randomElement(registrationTypes);
      const isCTM = regType.includes("normal") || regType.includes("premier");

      students.push(
        await User.create({
          username: `student${(i + 1).toString().padStart(4, "0")}`,
          email: `student${i + 1}@econnect.co.tz`,
          password: await hashPassword("Student@123"),
          role: "student",
          firstName: randomElement([
            "John",
            "Mary",
            "Peter",
            "Grace",
            "James",
            "Sarah",
            "David",
            "Lucy",
            "Daniel",
            "Anna",
          ]),
          lastName: randomElement([
            "Kamwela",
            "Mwakasege",
            "Hassan",
            "Matemba",
            "Mushi",
            "Mbwana",
            "Mlowe",
            "Kilonzo",
          ]),
          phoneNumber: `+2557000003${i.toString().padStart(2, "0")}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          isActive: true,
          isEmailVerified: true,
          studentId: `STD${(i + 1).toString().padStart(6, "0")}`,
          gradeLevel: randomElement(gradeLevels),
          enrollmentDate: randomDate(new Date(2020, 0, 1), new Date()),
          dateOfBirth: randomDate(new Date(2005, 0, 1), new Date(2010, 11, 31)),
          gender: randomElement(["male", "female"]),
          registration_type: regType,
          registration_fee_paid:
            regType === "normal_registration"
              ? 15000
              : regType === "premier_registration"
              ? 70000
              : regType === "silver_registration"
              ? 49000
              : 55000,
          registration_date: new Date(),
          is_ctm_student: isCTM,
          next_billing_date:
            regType === "premier_registration" ||
            regType === "diamond_registration"
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              : null,
        })
      );
    }
    console.log(`✅ Created ${students.length} students\n`);

    // ============================================
    // SEED ENTREPRENEURS
    // ============================================
    console.log("💼 Creating Entrepreneurs...");
    const entrepreneurs = [];
    for (let i = 0; i < 10; i++) {
      const region = regions[i % regions.length];
      const district = districts.find(
        (d) => d.regionId.toString() === region._id.toString()
      );

      entrepreneurs.push(
        await User.create({
          username: `entrepreneur${i + 1}`,
          email: `entrepreneur${i + 1}@econnect.co.tz`,
          password: await hashPassword("Entrepreneur@123"),
          role: "entrepreneur",
          firstName: randomElement(["John", "Mary", "Peter", "Grace", "James"]),
          lastName: randomElement([
            "Kamwela",
            "Mwakasege",
            "Hassan",
            "Matemba",
          ]),
          phoneNumber: `+2557000004${i.toString().padStart(2, "0")}`,
          regionId: region._id,
          districtId: district?._id,
          isActive: true,
          isEmailVerified: true,
          businessName: `${randomElement([
            "Tech",
            "Smart",
            "Digital",
            "Creative",
          ])} ${randomElement([
            "Solutions",
            "Innovations",
            "Enterprises",
            "Ventures",
          ])} ${i + 1}`,
          businessType: randomElement([
            "Technology",
            "Retail",
            "Services",
            "Manufacturing",
          ]),
          tinNumber: `TIN${(i + 1).toString().padStart(8, "0")}`,
        })
      );
    }
    console.log(`✅ Created ${entrepreneurs.length} entrepreneurs\n`);

    // ============================================
    // SEED TALENTS
    // ============================================
    console.log("🎨 Creating Talents...");
    const talents = [];
    for (const category of TALENTS_DATA) {
      for (const talent of category.talents) {
        talents.push(
          await Talent.create({
            name: talent.name,
            category: category.category,
            description: talent.description,
            icon: talent.icon,
            requirements: talent.requirements,
            isActive: true,
          })
        );
      }
    }
    console.log(`✅ Created ${talents.length} talents\n`);

    // ============================================
    // SEED STUDENT TALENTS
    // ============================================
    console.log("🎯 Assigning Talents to Students...");
    const studentTalents = [];
    const proficiencyLevels = [
      "beginner",
      "intermediate",
      "advanced",
      "expert",
    ];

    for (let i = 0; i < Math.min(50, students.length); i++) {
      const student = students[i];
      const numTalents = Math.floor(Math.random() * 3) + 1;
      const selectedTalents = [];

      for (let j = 0; j < numTalents; j++) {
        const talent = randomElement(talents);
        if (!selectedTalents.includes(talent._id)) {
          selectedTalents.push(talent._id);
          studentTalents.push(
            await StudentTalent.create({
              studentId: student._id,
              talentId: talent._id,
              schoolId: student.schoolId,
              teacherId:
                teachers[Math.floor(Math.random() * teachers.length)]?._id,
              proficiencyLevel: randomElement(proficiencyLevels),
              yearsOfExperience: Math.floor(Math.random() * 5),
              achievements: [
                `Participated in ${randomElement([
                  "school",
                  "district",
                  "regional",
                ])} competition`,
              ],
              status: "active",
            })
          );
        }
      }
    }
    console.log(`✅ Assigned ${studentTalents.length} talents to students\n`);

    // ============================================
    // SEED CTM MEMBERSHIPS
    // ============================================
    console.log("🎓 Creating CTM Memberships...");
    const ctmMemberships = [];
    const ctmStudents = students.filter((s) => s.is_ctm_student);

    for (let i = 0; i < Math.min(30, ctmStudents.length); i++) {
      const student = ctmStudents[i];
      const membershipNumber = `CTM-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`;

      const studentTalentsList = studentTalents
        .filter((st) => st.studentId.toString() === student._id.toString())
        .map((st) => st.talentId);

      ctmMemberships.push(
        await CTMMembership.create({
          studentId: student._id,
          membershipNumber,
          schoolId: student.schoolId,
          status: "active",
          joinDate: student.registration_date,
          membershipType:
            student.registration_type === "premier_registration"
              ? "premium"
              : "basic",
          talents: studentTalentsList,
          participationPoints: Math.floor(Math.random() * 500),
          achievements: [
            {
              title: "First Talent Registered",
              description: "Successfully registered your first talent",
              awardedDate: new Date(),
              category: "milestone",
            },
          ],
        })
      );
    }
    console.log(`✅ Created ${ctmMemberships.length} CTM memberships\n`);

    // ============================================
    // SEED BOOKS
    // ============================================
    console.log("📚 Creating Books...");
    const books = [];
    for (const bookData of BOOKS_DATA) {
      books.push(
        await Book.create({
          ...bookData,
          isbn: `ISBN-${Math.random().toString().substring(2, 15)}`,
          coverImage: "/uploads/covers/default-book.jpg",
          pdfFile: `/uploads/pdfs/${bookData.title
            .toLowerCase()
            .replace(/\s+/g, "-")}.pdf`,
          rating: Math.random() * 2 + 3,
          ratingsCount: Math.floor(Math.random() * 100),
          soldCount: Math.floor(Math.random() * 200),
          viewCount: Math.floor(Math.random() * 1000),
          stockQuantity: Math.floor(Math.random() * 100) + 20,
          uploadedBy: superAdmin._id,
          publishedDate: randomDate(new Date(2020, 0, 1), new Date()),
        })
      );
    }
    console.log(`✅ Created ${books.length} books\n`);

    // ============================================
    // SEED EVENTS
    // ============================================
    console.log("📅 Creating Events...");
    const events = [];
    for (const eventData of EVENTS_DATA) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + eventData.daysFromNow);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (eventData.duration || 1));

      events.push(
        await Event.create({
          title: eventData.title,
          description: eventData.description,
          eventType: eventData.eventType,
          startDate,
          endDate,
          location: eventData.location,
          venue: eventData.venue,
          organizer: randomElement([...officials, ...headmasters, ...teachers])
            ._id,
          schoolId: schools[0]._id,
          regionId: regions[0]._id,
          districtId: districts[0]._id,
          maxParticipants: eventData.maxParticipants,
          currentParticipants: 0,
          registrationFee: eventData.registrationFee,
          registrationDeadline: new Date(
            startDate.getTime() - 7 * 24 * 60 * 60 * 1000
          ),
          status: "published",
          isPublic: true,
          prizes: eventData.prizes || [],
          requirements: [
            "Valid student ID",
            "Parental consent",
            "Registration fee payment",
          ],
        })
      );
    }
    console.log(`✅ Created ${events.length} events\n`);

    // ============================================
    // SEED BUSINESSES
    // ============================================
    console.log("🏢 Creating Businesses...");
    const businesses = [];
    const businessTypes = [
      "Technology",
      "Retail",
      "Education",
      "Hospitality",
      "Manufacturing",
    ];
    const businessCategories = [
      "E-commerce",
      "Consulting",
      "Training",
      "Software",
      "Hardware",
    ];

    for (let i = 0; i < entrepreneurs.length; i++) {
      const entrepreneur = entrepreneurs[i];
      businesses.push(
        await Business.create({
          ownerId: entrepreneur._id,
          name: entrepreneur.businessName,
          businessType: randomElement(businessTypes),
          registrationNumber: `REG${(i + 1).toString().padStart(8, "0")}`,
          tinNumber: entrepreneur.tinNumber,
          description: `Leading provider of ${randomElement([
            "innovative",
            "quality",
            "affordable",
            "professional",
          ])} ${randomElement([
            "products",
            "services",
            "solutions",
          ])} in Tanzania`,
          address: `${randomElement([
            "Samora Avenue",
            "Kisutu Street",
            "Pugu Road",
          ])}, ${regions[i % regions.length].name}`,
          phoneNumber: entrepreneur.phoneNumber,
          email: `${entrepreneur.businessName
            .toLowerCase()
            .replace(/\s+/g, "")}@business.co.tz`,
          regionId: entrepreneur.regionId,
          districtId: entrepreneur.districtId,
          category: randomElement(businessCategories),
          establishedDate: randomDate(new Date(2015, 0, 1), new Date()),
          employeesCount: Math.floor(Math.random() * 50) + 5,
          annualRevenue: Math.floor(Math.random() * 100000000) + 1000000,
          isVerified: Math.random() > 0.3,
          status: "active",
          rating: Math.random() * 2 + 3,
          reviewsCount: Math.floor(Math.random() * 50),
        })
      );
    }
    console.log(`✅ Created ${businesses.length} businesses\n`);

    // ============================================
    // SEED PRODUCTS
    // ============================================
    console.log("📦 Creating Products...");
    const products = [];
    const productTypes = ["product", "service"];
    const productNames = {
      product: [
        "Laptop",
        "Smartphone",
        "Tablet",
        "Book",
        "Stationery Set",
        "School Bag",
        "Calculator",
        "Uniform",
      ],
      service: [
        "Web Development",
        "Mobile App Development",
        "Graphic Design",
        "Tutoring",
        "Consulting",
        "Training",
      ],
    };

    for (let i = 0; i < businesses.length * 3; i++) {
      const business = businesses[i % businesses.length];
      const type = randomElement(productTypes);
      const name = randomElement(productNames[type]);

      products.push(
        await Product.create({
          businessId: business._id,
          name: `${name} ${i + 1}`,
          description: `High quality ${type} from ${business.name}`,
          category: business.category,
          type,
          price: Math.floor(Math.random() * 500000) + 10000,
          discountPrice:
            Math.random() > 0.5
              ? Math.floor(Math.random() * 400000) + 5000
              : null,
          stockQuantity:
            type === "product" ? Math.floor(Math.random() * 100) + 10 : 0,
          sku: `SKU${(i + 1).toString().padStart(6, "0")}`,
          tags: [business.category, type, "quality"],
          rating: Math.random() * 2 + 3,
          reviewsCount: Math.floor(Math.random() * 50),
          soldCount: Math.floor(Math.random() * 100),
          viewCount: Math.floor(Math.random() * 500),
          isActive: true,
          isFeatured: Math.random() > 0.7,
        })
      );
    }
    console.log(`✅ Created ${products.length} products\n`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("\n📊 SUMMARY:");
    console.log(`   ✅ Regions: ${regions.length}`);
    console.log(`   ✅ Districts: ${districts.length}`);
    console.log(`   ✅ Wards: ${wards.length}`);
    console.log(`   ✅ Schools: ${schools.length}`);
    console.log(`   ✅ Talents: ${talents.length}`);
    console.log(`   ✅ Books: ${books.length}`);
    console.log(`   ✅ Events: ${events.length}`);
    console.log(`   ✅ Businesses: ${businesses.length}`);
    console.log(`   ✅ Products: ${products.length}`);
    console.log("\n👥 USERS:");
    console.log(`   ✅ Super Admin: 1`);
    console.log(`   ✅ TAMISEMI & Officials: ${officials.length}`);
    console.log(`   ✅ Headmasters: ${headmasters.length}`);
    console.log(`   ✅ Teachers: ${teachers.length}`);
    console.log(`   ✅ Students: ${students.length}`);
    console.log(`   ✅ Entrepreneurs: ${entrepreneurs.length}`);
    console.log(
      `   ✅ Total Users: ${
        1 +
        officials.length +
        headmasters.length +
        teachers.length +
        students.length +
        entrepreneurs.length
      }`
    );
    console.log("\n🎯 STUDENT DATA:");
    console.log(`   ✅ Student Talents: ${studentTalents.length}`);
    console.log(`   ✅ CTM Memberships: ${ctmMemberships.length}`);
    console.log("\n🔑 DEFAULT CREDENTIALS:");
    console.log("\n   Super Admin:");
    console.log("   📧 Email: admin@econnect.co.tz");
    console.log("   🔑 Password: Admin@123");
    console.log("\n   TAMISEMI:");
    console.log("   📧 Email: tamisemi@econnect.co.tz");
    console.log("   🔑 Password: Tamisemi@123");
    console.log("\n   National Official:");
    console.log("   📧 Email: national@econnect.co.tz");
    console.log("   🔑 Password: National@123");
    console.log("\n   Sample Student:");
    console.log("   📧 Email: student0001@econnect.co.tz");
    console.log("   🔑 Password: Student@123");
    console.log("\n   Sample Teacher:");
    console.log("   📧 Email: teacher001@econnect.co.tz");
    console.log("   🔑 Password: Teacher@123");
    console.log("\n   Sample Entrepreneur:");
    console.log("   📧 Email: entrepreneur1@econnect.co.tz");
    console.log("   🔑 Password: Entrepreneur@123");
    console.log("\n💡 NOTE: All passwords follow the same pattern:");
    console.log("   Format: [Role]@123 (e.g., Student@123, Teacher@123)");
    console.log("═══════════════════════════════════════════════════════\n");

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
    console.log("\n🚀 You can now start your server!\n");
  } catch (error) {
    console.error("\n❌ SEEDING ERROR:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================
// RUN SEEDER
// ============================================

// Check if running directly
if (require.main === module) {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("🌱 ECONNECT DATABASE SEEDER");
  console.log("═══════════════════════════════════════════════════════\n");

  // Show which database will be seeded
  const isProduction =
    MONGODB_URI.includes("mongodb+srv") ||
    MONGODB_URI.includes("render.com") ||
    MONGODB_URI.includes("cloud.mongodb.com");

  console.log("📍 TARGET DATABASE:");
  if (isProduction) {
    console.log("   🌐 PRODUCTION DATABASE");
    console.log(`   📌 ${MONGODB_URI.substring(0, 50)}...`);
  } else {
    console.log("   💻 LOCAL DATABASE");
    console.log(`   📌 ${MONGODB_URI}`);
  }
  console.log("\n⚠️  WARNING: This will delete ALL existing data!");
  console.log("⚠️  Make sure you're connected to the correct database!\n");

  // Auto-run in development
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedDatabase;
