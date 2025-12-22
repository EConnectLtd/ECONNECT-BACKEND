// ============================================
// ECONNECT ULTIMATE SEED FILE
// Complete Database Population Script
// ============================================

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// MongoDB Connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";

// ============================================
// SCHEMAS (Inline for standalone execution)
// ============================================

const regionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const districtSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  regionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region",
    required: true,
  },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const wardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "District",
    required: true,
  },
  population: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  schoolCode: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ["primary", "secondary", "high_school", "vocational", "special"],
    required: true,
  },
  regionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Region",
    required: true,
  },
  districtId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "District",
    required: true,
  },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  address: String,
  phoneNumber: String,
  email: String,
  principalName: String,
  totalStudents: { type: Number, default: 0 },
  totalTeachers: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  establishedYear: Number,
  createdAt: { type: Date, default: Date.now },
});

const talentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: String,
  icon: String,
  requirements: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String },
  description: String,
  category: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  firstName: String,
  lastName: String,
  phoneNumber: { type: String, unique: true, sparse: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District" },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  dateOfBirth: Date,
  gender: String,
  gradeLevel: String,
  studentId: String,
  employeeId: String,
  qualification: String,
  specialization: String,
  businessName: String,
  businessType: String,
  registration_type: String,
  is_ctm_student: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Models
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const School = mongoose.model("School", schoolSchema);
const Talent = mongoose.model("Talent", talentSchema);
const Subject = mongoose.model("Subject", subjectSchema);
const User = mongoose.model("User", userSchema);

// ============================================
// SEED DATA
// ============================================

// TANZANIA REGIONS (31 Regions)
const REGIONS = [
  { name: "Dar es Salaam", code: "DSM", population: 4364541, area: 1393 },
  { name: "Mwanza", code: "MWZ", population: 2772509, area: 9467 },
  { name: "Arusha", code: "ARU", population: 1694310, area: 37576 },
  { name: "Dodoma", code: "DOD", population: 2083588, area: 41311 },
  { name: "Mbeya", code: "MBY", population: 2707410, area: 35954 },
  { name: "Morogoro", code: "MRG", population: 2218492, area: 70624 },
  { name: "Tanga", code: "TNG", population: 2045205, area: 26677 },
  { name: "Kagera", code: "KGR", population: 2458023, area: 28388 },
  { name: "Shinyanga", code: "SHY", population: 1534808, area: 18901 },
  { name: "Kigoma", code: "KGM", population: 2127930, area: 37037 },
  { name: "Tabora", code: "TBR", population: 2291623, area: 76151 },
  { name: "Mara", code: "MRA", population: 1743830, area: 19566 },
  { name: "Mtwara", code: "MTW", population: 1270854, area: 16707 },
  { name: "Ruvuma", code: "RVU", population: 1376891, area: 63498 },
  { name: "Iringa", code: "IRG", population: 941238, area: 35503 },
  { name: "Kilimanjaro", code: "KLM", population: 1640087, area: 13309 },
  { name: "Pwani", code: "PWN", population: 1098668, area: 32407 },
  { name: "Lindi", code: "LND", population: 864652, area: 66046 },
  { name: "Rukwa", code: "RKW", population: 1004539, area: 27765 },
  { name: "Zanzibar Urban", code: "ZNZ", population: 593678, area: 1658 },
];

// DISTRICTS (Sample for major regions)
const DISTRICTS = [
  // Dar es Salaam
  { name: "Ilala", code: "DSM-ILL", regionCode: "DSM", population: 1220611 },
  {
    name: "Kinondoni",
    code: "DSM-KIN",
    regionCode: "DSM",
    population: 1775049,
  },
  { name: "Temeke", code: "DSM-TEM", regionCode: "DSM", population: 1368881 },
  { name: "Ubungo", code: "DSM-UBU", regionCode: "DSM", population: 845368 },
  { name: "Kigamboni", code: "DSM-KIG", regionCode: "DSM", population: 154632 },

  // Mwanza
  { name: "Ilemela", code: "MWZ-ILE", regionCode: "MWZ", population: 343001 },
  { name: "Nyamagana", code: "MWZ-NYA", regionCode: "MWZ", population: 363452 },
  { name: "Sengerema", code: "MWZ-SEN", regionCode: "MWZ", population: 663034 },
  { name: "Kwimba", code: "MWZ-KWI", regionCode: "MWZ", population: 404993 },

  // Arusha
  {
    name: "Arusha City",
    code: "ARU-CIT",
    regionCode: "ARU",
    population: 416442,
  },
  {
    name: "Arusha District",
    code: "ARU-DST",
    regionCode: "ARU",
    population: 323198,
  },
  { name: "Meru", code: "ARU-MER", regionCode: "ARU", population: 268144 },
  { name: "Karatu", code: "ARU-KAR", regionCode: "ARU", population: 230166 },

  // Dodoma
  {
    name: "Dodoma City",
    code: "DOD-CIT",
    regionCode: "DOD",
    population: 410956,
  },
  { name: "Chamwino", code: "DOD-CHM", regionCode: "DOD", population: 330543 },
  { name: "Kondoa", code: "DOD-KON", regionCode: "DOD", population: 269704 },

  // Mbeya
  {
    name: "Mbeya City",
    code: "MBY-CIT",
    regionCode: "MBY",
    population: 385279,
  },
  {
    name: "Mbeya District",
    code: "MBY-DST",
    regionCode: "MBY",
    population: 305319,
  },
  { name: "Rungwe", code: "MBY-RUN", regionCode: "MBY", population: 306852 },
];

// WARDS (Sample for Ilala District)
const WARDS = [
  {
    name: "Kariakoo",
    code: "ILL-KAR",
    districtCode: "DSM-ILL",
    population: 9434,
  },
  {
    name: "Kisutu",
    code: "ILL-KIS",
    districtCode: "DSM-ILL",
    population: 12776,
  },
  {
    name: "Mchikichini",
    code: "ILL-MCH",
    districtCode: "DSM-ILL",
    population: 18212,
  },
  {
    name: "Gerezani",
    code: "ILL-GER",
    districtCode: "DSM-ILL",
    population: 8934,
  },
  {
    name: "Jangwani",
    code: "ILL-JAN",
    districtCode: "DSM-ILL",
    population: 11234,
  },
  {
    name: "Kivukoni",
    code: "ILL-KIV",
    districtCode: "DSM-ILL",
    population: 7456,
  },
  {
    name: "Upanga West",
    code: "ILL-UPW",
    districtCode: "DSM-ILL",
    population: 15678,
  },
  {
    name: "Upanga East",
    code: "ILL-UPE",
    districtCode: "DSM-ILL",
    population: 14567,
  },
  {
    name: "Kiwalani",
    code: "ILL-KIW",
    districtCode: "DSM-ILL",
    population: 22345,
  },
  {
    name: "Tabata",
    code: "ILL-TAB",
    districtCode: "DSM-ILL",
    population: 45678,
  },
];

// SCHOOLS (Diverse sample)
const SCHOOLS = [
  // Dar es Salaam - Government Schools
  {
    name: "Azania Secondary School",
    code: "AZA-001",
    type: "secondary",
    districtCode: "DSM-ILL",
    wardCode: "ILL-KAR",
    institutionType: "government",
    principalName: "Dr. Hassan Mwinyi",
    totalStudents: 850,
    totalTeachers: 45,
    establishedYear: 1969,
  },
  {
    name: "Jangwani Primary School",
    code: "JAN-002",
    type: "primary",
    districtCode: "DSM-ILL",
    wardCode: "ILL-JAN",
    institutionType: "government",
    principalName: "Mrs. Amina Bakari",
    totalStudents: 420,
    totalTeachers: 18,
    establishedYear: 1975,
  },
  {
    name: "Kisutu Girls Secondary",
    code: "KIS-003",
    type: "secondary",
    districtCode: "DSM-ILL",
    wardCode: "ILL-KIS",
    institutionType: "government",
    principalName: "Sr. Grace Komba",
    totalStudents: 650,
    totalTeachers: 38,
    establishedYear: 1958,
  },

  // Dar es Salaam - Private Schools
  {
    name: "International School of Tanganyika",
    code: "IST-004",
    type: "high_school",
    districtCode: "DSM-KIN",
    wardCode: "ILL-UPW",
    institutionType: "private",
    principalName: "Mr. David Thompson",
    totalStudents: 520,
    totalTeachers: 55,
    establishedYear: 1963,
  },
  {
    name: "St. Francis Secondary",
    code: "STF-005",
    type: "secondary",
    districtCode: "DSM-ILL",
    wardCode: "ILL-TAB",
    institutionType: "private",
    principalName: "Fr. John Mgaya",
    totalStudents: 480,
    totalTeachers: 32,
    establishedYear: 1985,
  },
  {
    name: "Bright Future Primary",
    code: "BFP-006",
    type: "primary",
    districtCode: "DSM-UBU",
    wardCode: "ILL-KIW",
    institutionType: "private",
    principalName: "Mrs. Sarah Ndoto",
    totalStudents: 280,
    totalTeachers: 15,
    establishedYear: 2005,
  },

  // Mwanza
  {
    name: "Nyamagana Secondary School",
    code: "NYA-007",
    type: "secondary",
    districtCode: "MWZ-NYA",
    institutionType: "government",
    principalName: "Mr. Joseph Magesa",
    totalStudents: 720,
    totalTeachers: 40,
    establishedYear: 1972,
  },
  {
    name: "Lake Victoria Academy",
    code: "LVA-008",
    type: "high_school",
    districtCode: "MWZ-ILE",
    institutionType: "private",
    principalName: "Dr. Mary Kisesa",
    totalStudents: 350,
    totalTeachers: 28,
    establishedYear: 1998,
  },

  // Arusha
  {
    name: "Arusha Technical College",
    code: "ATC-009",
    type: "vocational",
    districtCode: "ARU-CIT",
    institutionType: "government",
    principalName: "Eng. Thomas Lyimo",
    totalStudents: 450,
    totalTeachers: 35,
    establishedYear: 1978,
  },
  {
    name: "Mount Meru International School",
    code: "MMI-010",
    type: "high_school",
    districtCode: "ARU-CIT",
    institutionType: "private",
    principalName: "Mrs. Jennifer Swai",
    totalStudents: 280,
    totalTeachers: 25,
    establishedYear: 2002,
  },

  // Dodoma
  {
    name: "Dodoma Secondary School",
    code: "DOD-011",
    type: "secondary",
    districtCode: "DOD-CIT",
    institutionType: "government",
    principalName: "Mr. Daniel Shoo",
    totalStudents: 680,
    totalTeachers: 42,
    establishedYear: 1965,
  },
  {
    name: "Capital Primary School",
    code: "CAP-012",
    type: "primary",
    districtCode: "DOD-CIT",
    institutionType: "private",
    principalName: "Mrs. Rose Msigwa",
    totalStudents: 320,
    totalTeachers: 16,
    establishedYear: 2010,
  },
];

// TALENTS (Comprehensive categories)
const TALENTS = [
  // Sports & Athletics
  {
    name: "Football (Soccer)",
    category: "Sports",
    description: "Team sport played with a spherical ball",
    icon: "⚽",
    requirements: ["Basic fitness", "Teamwork"],
  },
  {
    name: "Basketball",
    category: "Sports",
    description: "Team sport involving shooting a ball through a hoop",
    icon: "🏀",
    requirements: ["Height advantage helpful", "Agility"],
  },
  {
    name: "Athletics (Track & Field)",
    category: "Sports",
    description: "Running, jumping, and throwing events",
    icon: "🏃",
    requirements: ["Stamina", "Speed"],
  },
  {
    name: "Volleyball",
    category: "Sports",
    description: "Team sport with net and ball",
    icon: "🏐",
    requirements: ["Jumping ability", "Coordination"],
  },
  {
    name: "Swimming",
    category: "Sports",
    description: "Water-based athletic activity",
    icon: "🏊",
    requirements: ["Swimming ability", "Access to pool"],
  },

  // Performing Arts
  {
    name: "Drama & Theater",
    category: "Performing Arts",
    description: "Acting and stage performance",
    icon: "🎭",
    requirements: ["Confidence", "Memory"],
  },
  {
    name: "Traditional Dance",
    category: "Performing Arts",
    description: "Tanzanian traditional dances",
    icon: "💃",
    requirements: ["Rhythm", "Cultural knowledge"],
  },
  {
    name: "Modern Dance",
    category: "Performing Arts",
    description: "Contemporary dance styles",
    icon: "🕺",
    requirements: ["Flexibility", "Coordination"],
  },
  {
    name: "Singing",
    category: "Performing Arts",
    description: "Vocal performance",
    icon: "🎤",
    requirements: ["Vocal range", "Pitch control"],
  },
  {
    name: "Poetry & Spoken Word",
    category: "Performing Arts",
    description: "Performance poetry",
    icon: "📖",
    requirements: ["Writing skills", "Stage presence"],
  },

  // Music
  {
    name: "Piano",
    category: "Music",
    description: "Keyboard instrument",
    icon: "🎹",
    requirements: ["Access to piano", "Reading music"],
  },
  {
    name: "Guitar",
    category: "Music",
    description: "String instrument",
    icon: "🎸",
    requirements: ["Own guitar", "Finger dexterity"],
  },
  {
    name: "Drums & Percussion",
    category: "Music",
    description: "Rhythm instruments",
    icon: "🥁",
    requirements: ["Rhythm sense", "Coordination"],
  },
  {
    name: "Traditional Instruments",
    category: "Music",
    description: "African drums, marimba, etc.",
    icon: "🪘",
    requirements: ["Cultural interest"],
  },
  {
    name: "Music Composition",
    category: "Music",
    description: "Creating original music",
    icon: "🎵",
    requirements: ["Music theory", "Creativity"],
  },

  // Visual Arts
  {
    name: "Painting",
    category: "Visual Arts",
    description: "Creating art with paints",
    icon: "🎨",
    requirements: ["Art supplies", "Creativity"],
  },
  {
    name: "Drawing & Sketching",
    category: "Visual Arts",
    description: "Pencil and charcoal art",
    icon: "✏️",
    requirements: ["Basic supplies", "Observation skills"],
  },
  {
    name: "Sculpture",
    category: "Visual Arts",
    description: "Three-dimensional art",
    icon: "🗿",
    requirements: ["Materials", "Spatial thinking"],
  },
  {
    name: "Photography",
    category: "Visual Arts",
    description: "Capturing images",
    icon: "📷",
    requirements: ["Camera", "Artistic eye"],
  },
  {
    name: "Graphic Design",
    category: "Visual Arts",
    description: "Digital visual communication",
    icon: "🖌️",
    requirements: ["Computer access", "Design software"],
  },

  // Technology & Innovation
  {
    name: "Programming & Coding",
    category: "Technology",
    description: "Software development",
    icon: "💻",
    requirements: ["Computer access", "Logic skills"],
  },
  {
    name: "Robotics",
    category: "Technology",
    description: "Building and programming robots",
    icon: "🤖",
    requirements: ["STEM knowledge", "Equipment"],
  },
  {
    name: "Web Development",
    category: "Technology",
    description: "Creating websites",
    icon: "🌐",
    requirements: ["HTML/CSS/JS", "Computer"],
  },
  {
    name: "Mobile App Development",
    category: "Technology",
    description: "Creating mobile applications",
    icon: "📱",
    requirements: ["Programming knowledge"],
  },
  {
    name: "Electronics & Engineering",
    category: "Technology",
    description: "Circuit design and building",
    icon: "⚡",
    requirements: ["Electronics kit", "Technical knowledge"],
  },

  // Literature & Writing
  {
    name: "Creative Writing",
    category: "Literature",
    description: "Story and novel writing",
    icon: "📝",
    requirements: ["Language skills", "Imagination"],
  },
  {
    name: "Journalism",
    category: "Literature",
    description: "News reporting and writing",
    icon: "📰",
    requirements: ["Research skills", "Writing ability"],
  },
  {
    name: "Debate & Public Speaking",
    category: "Literature",
    description: "Argumentative speaking",
    icon: "🗣️",
    requirements: ["Confidence", "Research skills"],
  },
  {
    name: "Essay Writing",
    category: "Literature",
    description: "Academic and creative essays",
    icon: "📄",
    requirements: ["Analytical thinking", "Writing skills"],
  },

  // Science & Research
  {
    name: "Science Projects",
    category: "Science",
    description: "Scientific experiments and research",
    icon: "🔬",
    requirements: ["Scientific method", "Curiosity"],
  },
  {
    name: "Mathematics Competition",
    category: "Science",
    description: "Math olympiads and contests",
    icon: "🔢",
    requirements: ["Advanced math", "Problem-solving"],
  },
  {
    name: "Environmental Conservation",
    category: "Science",
    description: "Eco-projects and activism",
    icon: "🌱",
    requirements: ["Environmental awareness"],
  },
  {
    name: "Astronomy",
    category: "Science",
    description: "Study of celestial objects",
    icon: "🔭",
    requirements: ["Science knowledge", "Observation"],
  },

  // Entrepreneurship & Business
  {
    name: "Business & Entrepreneurship",
    category: "Business",
    description: "Starting and running businesses",
    icon: "💼",
    requirements: ["Business plan", "Initiative"],
  },
  {
    name: "Financial Literacy",
    category: "Business",
    description: "Money management skills",
    icon: "💰",
    requirements: ["Math skills", "Responsibility"],
  },
  {
    name: "Marketing & Sales",
    category: "Business",
    description: "Promoting products/services",
    icon: "📊",
    requirements: ["Communication", "Creativity"],
  },

  // Community Service
  {
    name: "Leadership",
    category: "Community Service",
    description: "Student government and clubs",
    icon: "👥",
    requirements: ["Communication", "Responsibility"],
  },
  {
    name: "Volunteering",
    category: "Community Service",
    description: "Community service projects",
    icon: "🤝",
    requirements: ["Compassion", "Time commitment"],
  },
  {
    name: "Peer Mentoring",
    category: "Community Service",
    description: "Helping other students",
    icon: "🎓",
    requirements: ["Patience", "Knowledge sharing"],
  },

  // Crafts & Handwork
  {
    name: "Tailoring & Fashion",
    category: "Crafts",
    description: "Clothing design and sewing",
    icon: "🧵",
    requirements: ["Sewing machine", "Creativity"],
  },
  {
    name: "Carpentry & Woodwork",
    category: "Crafts",
    description: "Working with wood",
    icon: "🪚",
    requirements: ["Tools", "Safety awareness"],
  },
  {
    name: "Beadwork & Jewelry",
    category: "Crafts",
    description: "Creating jewelry and accessories",
    icon: "📿",
    requirements: ["Materials", "Dexterity"],
  },
  {
    name: "Cooking & Culinary Arts",
    category: "Crafts",
    description: "Food preparation and cooking",
    icon: "🍳",
    requirements: ["Kitchen access", "Hygiene"],
  },
];

// SUBJECTS (Tanzania Curriculum)
const SUBJECTS = [
  // Primary Level
  {
    name: "Kiswahili",
    code: "KIS",
    category: "Language",
    description: "Swahili language and literature",
  },
  {
    name: "English",
    code: "ENG",
    category: "Language",
    description: "English language and communication",
  },
  {
    name: "Mathematics",
    code: "MATH",
    category: "Science",
    description: "Basic arithmetic to advanced mathematics",
  },
  {
    name: "Science",
    code: "SCI",
    category: "Science",
    description: "General science for primary",
  },
  {
    name: "Social Studies",
    code: "SS",
    category: "Social Sciences",
    description: "Geography, civics, history",
  },

  // Secondary Level - Science Subjects
  {
    name: "Physics",
    code: "PHY",
    category: "Science",
    description: "Study of matter and energy",
  },
  {
    name: "Chemistry",
    code: "CHEM",
    category: "Science",
    description: "Study of substances and reactions",
  },
  {
    name: "Biology",
    code: "BIO",
    category: "Science",
    description: "Study of living organisms",
  },
  {
    name: "Advanced Mathematics",
    code: "AMATH",
    category: "Science",
    description: "Advanced level mathematics",
  },
  {
    name: "Basic Mathematics",
    code: "BMATH",
    category: "Science",
    description: "Basic applied mathematics",
  },

  // Secondary Level - Arts Subjects
  {
    name: "Geography",
    code: "GEO",
    category: "Arts",
    description: "Physical and human geography",
  },
  {
    name: "History",
    code: "HIST",
    category: "Arts",
    description: "World and African history",
  },
  {
    name: "Civics",
    code: "CIV",
    category: "Arts",
    description: "Citizenship and moral education",
  },
  {
    name: "Literature in English",
    code: "LIT",
    category: "Arts",
    description: "English literature",
  },

  // Secondary Level - Commerce
  {
    name: "Commerce",
    code: "COM",
    category: "Commerce",
    description: "Business studies",
  },
  {
    name: "Accounting",
    code: "ACC",
    category: "Commerce",
    description: "Financial accounting",
  },
  {
    name: "Book Keeping",
    code: "BK",
    category: "Commerce",
    description: "Record keeping and accounts",
  },

  // Additional Subjects
  {
    name: "Computer Studies",
    code: "CS",
    category: "Technology",
    description: "ICT and computer skills",
  },
  {
    name: "Agriculture",
    code: "AGR",
    category: "Practical",
    description: "Farming and agriculture",
  },
  {
    name: "Home Economics",
    code: "HE",
    category: "Practical",
    description: "Nutrition and home management",
  },
  {
    name: "Religious Education",
    code: "RE",
    category: "Other",
    description: "Ethics and religion",
  },
  {
    name: "Physical Education",
    code: "PE",
    category: "Other",
    description: "Sports and physical fitness",
  },
  {
    name: "Art & Design",
    code: "ART",
    category: "Arts",
    description: "Visual arts",
  },
  {
    name: "Music",
    code: "MUS",
    category: "Arts",
    description: "Music theory and practice",
  },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

function generateStudentId(schoolCode, index) {
  return `${schoolCode}-STU-${String(index).padStart(4, "0")}`;
}

function generateEmployeeId(schoolCode, index) {
  return `${schoolCode}-EMP-${String(index).padStart(3, "0")}`;
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedDatabase() {
  try {
    console.log("🌱 Starting Ultimate Database Seeding...\n");

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Connected to MongoDB\n");

    // Clear existing data
    console.log("🗑️  Clearing existing data...");
    await Promise.all([
      Region.deleteMany({}),
      District.deleteMany({}),
      Ward.deleteMany({}),
      School.deleteMany({}),
      Talent.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({}),
    ]);
    console.log("✅ Cleared all collections\n");

    // ============================================
    // 1. SEED REGIONS
    // ============================================
    console.log("📍 Seeding Regions...");
    const regions = await Region.insertMany(REGIONS);
    console.log(`✅ Created ${regions.length} regions\n`);

    // ============================================
    // 2. SEED DISTRICTS
    // ============================================
    console.log("📍 Seeding Districts...");
    const districtDocs = [];
    for (const district of DISTRICTS) {
      const region = regions.find((r) => r.code === district.regionCode);
      if (region) {
        districtDocs.push({
          ...district,
          regionId: region._id,
        });
      }
    }
    const districts = await District.insertMany(districtDocs);
    console.log(`✅ Created ${districts.length} districts\n`);

    // ============================================
    // 3. SEED WARDS
    // ============================================
    console.log("📍 Seeding Wards...");
    const wardDocs = [];
    for (const ward of WARDS) {
      const district = districts.find((d) => d.code === ward.districtCode);
      if (district) {
        wardDocs.push({
          ...ward,
          districtId: district._id,
        });
      }
    }
    const wards = await Ward.insertMany(wardDocs);
    console.log(`✅ Created ${wards.length} wards\n`);

    // ============================================
    // 4. SEED SCHOOLS
    // ============================================
    console.log("🏫 Seeding Schools...");
    const schoolDocs = [];
    for (const school of SCHOOLS) {
      const district = districts.find((d) => d.code === school.districtCode);
      const ward = school.wardCode
        ? wards.find((w) => w.code === school.wardCode)
        : null;

      if (district) {
        schoolDocs.push({
          name: school.name,
          schoolCode: school.code,
          type: school.type,
          regionId: district.regionId,
          districtId: district._id,
          wardId: ward?._id,
          principalName: school.principalName,
          totalStudents: school.totalStudents,
          totalTeachers: school.totalTeachers,
          establishedYear: school.establishedYear,
          phoneNumber: `+255${Math.floor(
            Math.random() * 900000000 + 100000000
          )}`,
          email: `${school.code.toLowerCase()}@school.ac.tz`,
          address: `${school.name} Campus, ${district.name}, Tanzania`,
        });
      }
    }
    const schools = await School.insertMany(schoolDocs);
    console.log(`✅ Created ${schools.length} schools\n`);

    // ============================================
    // 5. SEED TALENTS
    // ============================================
    console.log("🎨 Seeding Talents...");
    const talents = await Talent.insertMany(TALENTS);
    console.log(`✅ Created ${talents.length} talents\n`);

    // ============================================
    // 6. SEED SUBJECTS
    // ============================================
    console.log("📚 Seeding Subjects...");
    const subjects = await Subject.insertMany(SUBJECTS);
    console.log(`✅ Created ${subjects.length} subjects\n`);

    // ============================================
    // 7. SEED USERS (All Roles)
    // ============================================
    console.log("👥 Seeding Users...\n");

    const defaultPassword = await hashPassword("password123");
    const userDocs = [];

    // ============================================
    // 7.1 SUPER ADMIN
    // ============================================
    console.log("  👑 Creating Super Admin...");
    userDocs.push({
      username: "superadmin",
      email: "admin@econnect.co.tz",
      password: defaultPassword,
      role: "super_admin",
      firstName: "System",
      lastName: "Administrator",
      phoneNumber: "+255712000001",
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    });

    // ============================================
    // 7.2 NATIONAL OFFICIALS (TAMISEMI)
    // ============================================
    console.log("  🏛️  Creating National Officials...");
    const nationalOfficials = [
      {
        firstName: "Joseph",
        lastName: "Mwangi",
        username: "joseph.mwangi",
        phone: "+255712000002",
      },
      {
        firstName: "Grace",
        lastName: "Mwakasege",
        username: "grace.mwakasege",
        phone: "+255712000003",
      },
    ];

    nationalOfficials.forEach((official) => {
      userDocs.push({
        username: official.username,
        email: `${official.username}@tamisemi.go.tz`,
        password: defaultPassword,
        role: "national_official",
        firstName: official.firstName,
        lastName: official.lastName,
        phoneNumber: official.phone,
        isActive: true,
      });
    });

    // ============================================
    // 7.3 REGIONAL OFFICIALS
    // ============================================
    console.log("  🗺️  Creating Regional Officials...");
    const dsmRegion = regions.find((r) => r.code === "DSM");
    const mwzRegion = regions.find((r) => r.code === "MWZ");

    userDocs.push({
      username: "regional.dsm",
      email: "regional.dsm@education.go.tz",
      password: defaultPassword,
      role: "regional_official",
      firstName: "Ali",
      lastName: "Mbwana",
      phoneNumber: "+255712000010",
      regionId: dsmRegion._id,
      isActive: true,
    });

    userDocs.push({
      username: "regional.mwanza",
      email: "regional.mwanza@education.go.tz",
      password: defaultPassword,
      role: "regional_official",
      firstName: "Mary",
      lastName: "Nyerere",
      phoneNumber: "+255712000011",
      regionId: mwzRegion._id,
      isActive: true,
    });

    // ============================================
    // 7.4 DISTRICT OFFICIALS
    // ============================================
    console.log("  🏘️  Creating District Officials...");
    const ilalaDistrict = districts.find((d) => d.code === "DSM-ILL");

    userDocs.push({
      username: "district.ilala",
      email: "district.ilala@education.go.tz",
      password: defaultPassword,
      role: "district_official",
      firstName: "Hassan",
      lastName: "Kikwete",
      phoneNumber: "+255712000020",
      regionId: dsmRegion._id,
      districtId: ilalaDistrict._id,
      isActive: true,
    });

    // ============================================
    // 7.5 HEADMASTERS (One per school)
    // ============================================
    console.log("  🎓 Creating Headmasters...");
    schools.forEach((school, index) => {
      const principalNames = school.principalName.split(" ");
      const firstName =
        principalNames[principalNames.length - 2] || "Principal";
      const lastName =
        principalNames[principalNames.length - 1] || school.schoolCode;

      userDocs.push({
        username: `headmaster.${school.schoolCode.toLowerCase()}`,
        email: `headmaster@${school.schoolCode.toLowerCase()}.ac.tz`,
        password: defaultPassword,
        role: "headmaster",
        firstName,
        lastName,
        phoneNumber: `+255712${String(100000 + index).slice(-6)}`,
        schoolId: school._id,
        regionId: school.regionId,
        districtId: school.districtId,
        employeeId: generateEmployeeId(school.schoolCode, 1),
        isActive: true,
      });
    });

    // ============================================
    // 7.6 TEACHERS (3 per school)
    // ============================================
    console.log("  👨‍🏫 Creating Teachers...");
    const teacherFirstNames = [
      "John",
      "Mary",
      "Peter",
      "Grace",
      "James",
      "Sarah",
      "David",
      "Ruth",
      "Daniel",
      "Elizabeth",
    ];
    const teacherLastNames = [
      "Mtaki",
      "Kamwela",
      "Juma",
      "Mwanga",
      "Kisamo",
      "Mushi",
      "Lyimo",
      "Mollel",
      "Shoo",
      "Tenga",
    ];
    const teachingLevels = ["Primary", "Secondary", "High School"];
    const qualifications = [
      "Diploma in Education",
      "Bachelor of Education",
      "Master of Education",
    ];

    schools.forEach((school, schoolIndex) => {
      for (let i = 0; i < 3; i++) {
        const firstName =
          teacherFirstNames[(schoolIndex * 3 + i) % teacherFirstNames.length];
        const lastName =
          teacherLastNames[(schoolIndex * 3 + i) % teacherLastNames.length];
        const subject = subjects[Math.floor(Math.random() * subjects.length)];

        userDocs.push({
          username: `teacher.${school.schoolCode.toLowerCase()}.${i + 1}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${school.schoolCode.toLowerCase()}.ac.tz`,
          password: defaultPassword,
          role: "teacher",
          firstName,
          lastName,
          phoneNumber: `+255713${String(100000 + schoolIndex * 10 + i).slice(
            -6
          )}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          employeeId: generateEmployeeId(school.schoolCode, i + 2),
          qualification: qualifications[i % qualifications.length],
          specialization: subject.name,
          gradeLevel:
            teachingLevels[Math.floor(Math.random() * teachingLevels.length)],
          isActive: true,
        });
      }
    });

    // ============================================
    // 7.7 STUDENTS (10 per school with different registration types)
    // ============================================
    console.log("  🎒 Creating Students...");
    const studentFirstNames = [
      "Amina",
      "Juma",
      "Fatuma",
      "Hassan",
      "Neema",
      "Baraka",
      "Asha",
      "Mohamed",
      "Rehema",
      "Salim",
    ];
    const studentLastNames = [
      "Ally",
      "Bakari",
      "Hamisi",
      "Mwamba",
      "Selemani",
      "Omari",
      "Rashid",
      "Nassor",
      "Makame",
      "Khamis",
    ];
    const gradeLevels = [
      "Form 1",
      "Form 2",
      "Form 3",
      "Form 4",
      "Form 5",
      "Form 6",
      "Standard 5",
      "Standard 6",
      "Standard 7",
    ];
    const registrationTypes = [
      "normal_registration",
      "premier_registration",
      "silver_registration",
      "diamond_registration",
    ];

    schools.forEach((school, schoolIndex) => {
      for (let i = 0; i < 10; i++) {
        const firstName = studentFirstNames[i % studentFirstNames.length];
        const lastName =
          studentLastNames[(schoolIndex + i) % studentLastNames.length];
        const registrationType =
          registrationTypes[i % registrationTypes.length];
        const isCTM = ["normal_registration", "premier_registration"].includes(
          registrationType
        );

        userDocs.push({
          username: `student.${school.schoolCode.toLowerCase()}.${i + 1}`,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@student.ac.tz`,
          password: defaultPassword,
          role: "student",
          firstName,
          lastName,
          phoneNumber: `+255714${String(100000 + schoolIndex * 100 + i).slice(
            -6
          )}`,
          schoolId: school._id,
          regionId: school.regionId,
          districtId: school.districtId,
          studentId: generateStudentId(school.schoolCode, i + 1),
          gradeLevel:
            gradeLevels[Math.floor(Math.random() * gradeLevels.length)],
          gender: i % 2 === 0 ? "male" : "female",
          dateOfBirth: new Date(2005 + Math.floor(i / 2), i % 12, 15),
          registration_type: registrationType,
          is_ctm_student: isCTM,
          registration_date: new Date(),
          isActive: true,
        });
      }
    });

    // ============================================
    // 7.8 ENTREPRENEURS (5 total)
    // ============================================
    console.log("  💼 Creating Entrepreneurs...");
    const entrepreneurs = [
      {
        firstName: "Fatma",
        lastName: "Hamad",
        business: "Fatma Fashion Design",
        type: "Tailoring",
      },
      {
        firstName: "Juma",
        lastName: "Mrisho",
        business: "JM Electronics",
        type: "Electronics",
      },
      {
        firstName: "Zainab",
        lastName: "Khamis",
        business: "Mama Zainab Catering",
        type: "Food Service",
      },
      {
        firstName: "Ahmed",
        lastName: "Salim",
        business: "Ahmed Carpentry Workshop",
        type: "Woodwork",
      },
      {
        firstName: "Halima",
        lastName: "Juma",
        business: "Halima Beauty Salon",
        type: "Beauty Services",
      },
    ];

    entrepreneurs.forEach((ent, index) => {
      userDocs.push({
        username: `entrepreneur${index + 1}`,
        email: `${ent.firstName.toLowerCase()}.${ent.lastName.toLowerCase()}@business.co.tz`,
        password: defaultPassword,
        role: "entrepreneur",
        firstName: ent.firstName,
        lastName: ent.lastName,
        phoneNumber: `+255715${String(100000 + index).slice(-6)}`,
        businessName: ent.business,
        businessType: ent.type,
        regionId: dsmRegion._id,
        districtId: ilalaDistrict._id,
        isActive: true,
      });
    });

    // ============================================
    // 7.9 STAFF (2 total)
    // ============================================
    console.log("  🧑‍💼 Creating Staff...");
    userDocs.push({
      username: "staff.admin",
      email: "staff.admin@econnect.co.tz",
      password: defaultPassword,
      role: "staff",
      firstName: "Anna",
      lastName: "Mwakasege",
      phoneNumber: "+255716000001",
      regionId: dsmRegion._id,
      districtId: ilalaDistrict._id,
      isActive: true,
    });

    userDocs.push({
      username: "staff.support",
      email: "staff.support@econnect.co.tz",
      password: defaultPassword,
      role: "staff",
      firstName: "John",
      lastName: "Kisamo",
      phoneNumber: "+255716000002",
      regionId: dsmRegion._id,
      districtId: ilalaDistrict._id,
      isActive: true,
    });

    // ============================================
    // INSERT ALL USERS
    // ============================================
    const users = await User.insertMany(userDocs);

    // Count by role
    const roleCounts = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    console.log("\n✅ Created users:");
    Object.entries(roleCounts).forEach(([role, count]) => {
      console.log(`   - ${role}: ${count}`);
    });
    console.log(`   Total: ${users.length} users\n`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n═══════════════════════════════════════");
    console.log("🎉 DATABASE SEEDING COMPLETED!");
    console.log("═══════════════════════════════════════");
    console.log(`✅ Regions: ${regions.length}`);
    console.log(`✅ Districts: ${districts.length}`);
    console.log(`✅ Wards: ${wards.length}`);
    console.log(`✅ Schools: ${schools.length}`);
    console.log(`✅ Talents: ${talents.length}`);
    console.log(`✅ Subjects: ${subjects.length}`);
    console.log(`✅ Users: ${users.length}`);
    console.log("═══════════════════════════════════════\n");

    console.log("📝 SAMPLE LOGIN CREDENTIALS:");
    console.log("─────────────────────────────────────");
    console.log("Super Admin:");
    console.log("  Username: superadmin");
    console.log("  Password: password123");
    console.log("");
    console.log("Headmaster (Azania Secondary):");
    console.log("  Username: headmaster.aza-001");
    console.log("  Password: password123");
    console.log("");
    console.log("Teacher (Azania Secondary):");
    console.log("  Username: teacher.aza-001.1");
    console.log("  Password: password123");
    console.log("");
    console.log("Student (Azania Secondary):");
    console.log("  Username: student.aza-001.1");
    console.log("  Password: password123");
    console.log("");
    console.log("Entrepreneur:");
    console.log("  Username: entrepreneur1");
    console.log("  Password: password123");
    console.log("═══════════════════════════════════════\n");
  } catch (error) {
    console.error("❌ Seeding Error:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("✅ Database connection closed\n");
  }
}

// ============================================
// RUN SEED
// ============================================

seedDatabase()
  .then(() => {
    console.log("✅ Seeding completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  });
