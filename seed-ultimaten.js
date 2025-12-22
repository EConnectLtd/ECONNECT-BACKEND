// ============================================
// ECONNECT ULTIMATE DATABASE SEEDER
// Complete data population for Tanzania
// Version: 2.0.0
// ============================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ============================================
// DATABASE CONNECTION
// ============================================
const MONGODB_URI =
  "mongodb+srv://econnect-db:Hx3sagw4n9678u12@econnect-db-mongodb-fra1-99826-a3b6a8c0.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=econnect-db-mongodb-fra1-99826";

// ============================================
// SCHEMAS (matching server.js)
// ============================================

// Region Schema
const regionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// District Schema
const districtSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region", required: true },
  population: Number,
  area: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Ward Schema
const wardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true },
  population: Number,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// School Schema
const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  schoolCode: { type: String, required: true, unique: true, uppercase: true },
  type: {
    type: String,
    enum: ["primary", "secondary", "high_school", "vocational", "special"],
    required: true,
  },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region", required: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward" },
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

// Subject Schema
const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String },
  description: String,
  category: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Talent Schema
const talentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: String,
  icon: String,
  requirements: [String],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// User Schema
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
  profileImage: String,
  dateOfBirth: Date,
  gender: String,
  gradeLevel: String,
  institutionType: String,
  classLevel: String,
  registration_type: String,
  is_ctm_student: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Book Schema
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  isbn: String,
  category: String,
  description: String,
  coverImage: String,
  pdfFile: String,
  price: { type: Number, default: 0 },
  discountPrice: Number,
  publisher: String,
  publishedDate: Date,
  language: { type: String, default: "Swahili" },
  pages: Number,
  rating: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  stockQuantity: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Event Schema
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  eventType: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  location: String,
  venue: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
  maxParticipants: Number,
  currentParticipants: { type: Number, default: 0 },
  registrationFee: { type: Number, default: 0 },
  coverImage: String,
  status: { type: String, default: "published" },
  isPublic: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// ============================================
// CREATE MODELS
// ============================================
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const School = mongoose.model("School", schoolSchema);
const Subject = mongoose.model("Subject", subjectSchema);
const Talent = mongoose.model("Talent", talentSchema);
const User = mongoose.model("User", userSchema);
const Book = mongoose.model("Book", bookSchema);
const Event = mongoose.model("Event", eventSchema);

// ============================================
// SEED DATA
// ============================================

// Tanzania Regions (31 regions)
const regionsData = [
  { name: "Dar es Salaam", code: "DSM", population: 5500000, area: 1393 },
  { name: "Arusha", code: "ARU", population: 2500000, area: 37576 },
  { name: "Dodoma", code: "DOD", population: 2800000, area: 41311 },
  { name: "Geita", code: "GEI", population: 1900000, area: 20054 },
  { name: "Iringa", code: "IRI", population: 1200000, area: 35503 },
  { name: "Kagera", code: "KAG", population: 2900000, area: 28388 },
  { name: "Katavi", code: "KAT", population: 600000, area: 45843 },
  { name: "Kigoma", code: "KIG", population: 2400000, area: 45066 },
  { name: "Kilimanjaro", code: "KIL", population: 1900000, area: 13209 },
  { name: "Lindi", code: "LIN", population: 1000000, area: 66046 },
  { name: "Manyara", code: "MAN", population: 1700000, area: 44522 },
  { name: "Mara", code: "MAR", population: 2000000, area: 21760 },
  { name: "Mbeya", code: "MBE", population: 2700000, area: 35954 },
  { name: "Morogoro", code: "MOR", population: 2800000, area: 73039 },
  { name: "Mtwara", code: "MTW", population: 1400000, area: 16720 },
  { name: "Mwanza", code: "MWA", population: 3500000, area: 25233 },
  { name: "Njombe", code: "NJO", population: 800000, area: 21347 },
  { name: "Pwani", code: "PWA", population: 1200000, area: 32547 },
  { name: "Rukwa", code: "RUK", population: 1100000, area: 27765 },
  { name: "Ruvuma", code: "RUV", population: 1500000, area: 63669 },
  { name: "Shinyanga", code: "SHI", population: 1800000, area: 18901 },
  { name: "Simiyu", code: "SIM", population: 2000000, area: 25212 },
  { name: "Singida", code: "SIN", population: 1700000, area: 49341 },
  { name: "Songwe", code: "SON", population: 1200000, area: 27598 },
  { name: "Tabora", code: "TAB", population: 3100000, area: 76151 },
  { name: "Tanga", code: "TAN", population: 2400000, area: 26677 },
];

// Districts (sample for major regions)
const districtsData = [
  // Dar es Salaam
  { name: "Ilala", code: "DSM-ILA", regionCode: "DSM", population: 1800000 },
  { name: "Kinondoni", code: "DSM-KIN", regionCode: "DSM", population: 2000000 },
  { name: "Temeke", code: "DSM-TEM", regionCode: "DSM", population: 1700000 },
  { name: "Ubungo", code: "DSM-UBU", regionCode: "DSM", population: 900000 },
  { name: "Kigamboni", code: "DSM-KIG", regionCode: "DSM", population: 300000 },

  // Arusha
  { name: "Arusha City", code: "ARU-CTY", regionCode: "ARU", population: 500000 },
  { name: "Arusha District", code: "ARU-DIS", regionCode: "ARU", population: 400000 },
  { name: "Karatu", code: "ARU-KAR", regionCode: "ARU", population: 250000 },
  { name: "Longido", code: "ARU-LON", regionCode: "ARU", population: 200000 },
  { name: "Meru", code: "ARU-MER", regionCode: "ARU", population: 300000 },

  // Dodoma
  { name: "Dodoma City", code: "DOD-CTY", regionCode: "DOD", population: 800000 },
  { name: "Bahi", code: "DOD-BAH", regionCode: "DOD", population: 300000 },
  { name: "Chamwino", code: "DOD-CHA", regionCode: "DOD", population: 350000 },
  { name: "Kondoa", code: "DOD-KON", regionCode: "DOD", population: 400000 },
  { name: "Mpwapwa", code: "DOD-MPW", regionCode: "DOD", population: 300000 },

  // Mwanza
  { name: "Ilemela", code: "MWA-ILE", regionCode: "MWA", population: 600000 },
  { name: "Nyamagana", code: "MWA-NYA", regionCode: "MWA", population: 700000 },
  { name: "Kwimba", code: "MWA-KWI", regionCode: "MWA", population: 400000 },
  { name: "Magu", code: "MWA-MAG", regionCode: "MWA", population: 350000 },
  { name: "Misungwi", code: "MWA-MIS", regionCode: "MWA", population: 350000 },

  // Kilimanjaro
  { name: "Moshi Municipal", code: "KIL-MOS", regionCode: "KIL", population: 200000 },
  { name: "Moshi Rural", code: "KIL-MOR", regionCode: "KIL", population: 450000 },
  { name: "Hai", code: "KIL-HAI", regionCode: "KIL", population: 210000 },
  { name: "Rombo", code: "KIL-ROM", regionCode: "KIL", population: 260000 },
  { name: "Same", code: "KIL-SAM", regionCode: "KIL", population: 270000 },

  // Mbeya
  { name: "Mbeya City", code: "MBE-CTY", regionCode: "MBE", population: 500000 },
  { name: "Mbeya District", code: "MBE-DIS", regionCode: "MBE", population: 350000 },
  { name: "Chunya", code: "MBE-CHU", regionCode: "MBE", population: 300000 },
  { name: "Kyela", code: "MBE-KYE", regionCode: "MBE", population: 220000 },
  { name: "Rungwe", code: "MBE-RUN", regionCode: "MBE", population: 350000 },
];

// Wards (sample for Dar es Salaam districts)
const wardsData = [
  // Ilala District
  { name: "Kariakoo", code: "DSM-ILA-KAR", districtCode: "DSM-ILA", population: 50000 },
  { name: "Mchikichini", code: "DSM-ILA-MCH", districtCode: "DSM-ILA", population: 45000 },
  { name: "Buguruni", code: "DSM-ILA-BUG", districtCode: "DSM-ILA", population: 60000 },
  { name: "Tabata", code: "DSM-ILA-TAB", districtCode: "DSM-ILA", population: 70000 },
  { name: "Ilala", code: "DSM-ILA-ILA", districtCode: "DSM-ILA", population: 55000 },

  // Kinondoni District
  { name: "Mwananyamala", code: "DSM-KIN-MWA", districtCode: "DSM-KIN", population: 80000 },
  { name: "Magomeni", code: "DSM-KIN-MAG", districtCode: "DSM-KIN", population: 65000 },
  { name: "Kinondoni", code: "DSM-KIN-KIN", districtCode: "DSM-KIN", population: 70000 },
  { name: "Manzese", code: "DSM-KIN-MAN", districtCode: "DSM-KIN", population: 90000 },
  { name: "Tandale", code: "DSM-KIN-TAN", districtCode: "DSM-KIN", population: 85000 },

  // Temeke District
  { name: "Temeke", code: "DSM-TEM-TEM", districtCode: "DSM-TEM", population: 75000 },
  { name: "Mbagala", code: "DSM-TEM-MBA", districtCode: "DSM-TEM", population: 80000 },
  { name: "Kigamboni", code: "DSM-TEM-KIG", districtCode: "DSM-TEM", population: 60000 },
  { name: "Chanika", code: "DSM-TEM-CHA", districtCode: "DSM-TEM", population: 50000 },
  { name: "Chang'ombe", code: "DSM-TEM-CHG", districtCode: "DSM-TEM", population: 55000 },
];

// Schools (sample across regions)
const schoolsData = [
  // Dar es Salaam
  {
    name: "Azania Secondary School",
    code: "AZA-SS-001",
    type: "secondary",
    districtCode: "DSM-ILA",
    wardCode: "DSM-ILA-KAR",
    address: "Kariakoo, Dar es Salaam",
    phoneNumber: "+255222123456",
    email: "info@azania.ac.tz",
    principalName: "Dr. Hassan Mwinyi",
    establishedYear: 1950,
  },
  {
    name: "Jangwani Primary School",
    code: "JAN-PS-002",
    type: "primary",
    districtCode: "DSM-ILA",
    wardCode: "DSM-ILA-ILA",
    address: "Ilala, Dar es Salaam",
    phoneNumber: "+255222234567",
    email: "info@jangwani.ac.tz",
    principalName: "Mrs. Neema Katundu",
    establishedYear: 1965,
  },
  {
    name: "Mlimani City Secondary School",
    code: "MLI-SS-003",
    type: "secondary",
    districtCode: "DSM-KIN",
    wardCode: "DSM-KIN-KIN",
    address: "Kinondoni, Dar es Salaam",
    phoneNumber: "+255222345678",
    email: "admin@mlimani.ac.tz",
    principalName: "Mr. Joseph Mbwambo",
    establishedYear: 1985,
  },
  {
    name: "Temeke Secondary School",
    code: "TEM-SS-004",
    type: "secondary",
    districtCode: "DSM-TEM",
    wardCode: "DSM-TEM-TEM",
    address: "Temeke, Dar es Salaam",
    phoneNumber: "+255222456789",
    email: "info@temeke.ac.tz",
    principalName: "Mrs. Grace Mollel",
    establishedYear: 1972,
  },
  {
    name: "Mwenge Primary School",
    code: "MWE-PS-005",
    type: "primary",
    districtCode: "DSM-KIN",
    wardCode: "DSM-KIN-MWA",
    address: "Mwananyamala, Dar es Salaam",
    phoneNumber: "+255222567890",
    email: "info@mwenge.ac.tz",
    principalName: "Mr. Peter Kimaro",
    establishedYear: 1980,
  },

  // Arusha
  {
    name: "Arusha Technical College",
    code: "ARU-TC-006",
    type: "vocational",
    districtCode: "ARU-CTY",
    address: "Arusha City Center",
    phoneNumber: "+255272503123",
    email: "info@arushatech.ac.tz",
    principalName: "Eng. John Kisamo",
    establishedYear: 1978,
  },
  {
    name: "Meru Secondary School",
    code: "MER-SS-007",
    type: "secondary",
    districtCode: "ARU-MER",
    address: "Meru District, Arusha",
    phoneNumber: "+255272503234",
    email: "admin@meru.ac.tz",
    principalName: "Mrs. Anna Laizer",
    establishedYear: 1968,
  },

  // Dodoma
  {
    name: "Dodoma Secondary School",
    code: "DOD-SS-008",
    type: "secondary",
    districtCode: "DOD-CTY",
    address: "Dodoma City",
    phoneNumber: "+255262322123",
    email: "info@dodoma.ac.tz",
    principalName: "Dr. Emmanuel Nyambo",
    establishedYear: 1955,
  },

  // Mwanza
  {
    name: "Nyamagana Secondary School",
    code: "NYA-SS-009",
    type: "secondary",
    districtCode: "MWA-NYA",
    address: "Nyamagana, Mwanza",
    phoneNumber: "+255282500123",
    email: "info@nyamagana.ac.tz",
    principalName: "Mr. Samwel Magesa",
    establishedYear: 1963,
  },

  // Kilimanjaro
  {
    name: "Moshi Technical Secondary School",
    code: "MOS-TSS-010",
    type: "secondary",
    districtCode: "KIL-MOS",
    address: "Moshi Town",
    phoneNumber: "+255272751123",
    email: "info@moshitech.ac.tz",
    principalName: "Eng. David Lyimo",
    establishedYear: 1970,
  },
];

// Subjects (Academic subjects for Tanzania curriculum)
const subjectsData = [
  // Science Subjects
  { name: "Mathematics", code: "MATH", category: "Science", description: "Pure Mathematics" },
  { name: "Physics", code: "PHY", category: "Science", description: "Physical Science" },
  { name: "Chemistry", code: "CHEM", category: "Science", description: "Chemical Science" },
  { name: "Biology", code: "BIO", category: "Science", description: "Biological Science" },
  { name: "Computer Science", code: "CS", category: "Science", description: "ICT and Computing" },
  { name: "Advanced Mathematics", code: "AMATH", category: "Science", description: "Advanced Mathematics" },

  // Arts & Languages
  { name: "English Language", code: "ENG", category: "Arts", description: "English Language & Literature" },
  { name: "Kiswahili", code: "KIS", category: "Arts", description: "Kiswahili Language" },
  { name: "History", code: "HIST", category: "Arts", description: "World and African History" },
  { name: "Geography", code: "GEO", category: "Arts", description: "Physical and Human Geography" },
  { name: "Civics", code: "CIV", category: "Arts", description: "Civics and Moral Education" },
  { name: "French", code: "FRE", category: "Arts", description: "French Language" },
  { name: "Arabic", code: "ARA", category: "Arts", description: "Arabic Language" },

  // Commerce Subjects
  { name: "Commerce", code: "COM", category: "Commerce", description: "Business Commerce" },
  { name: "Accounting", code: "ACC", category: "Commerce", description: "Financial Accounting" },
  { name: "Book Keeping", code: "BK", category: "Commerce", description: "Book Keeping" },
  { name: "Economics", code: "ECON", category: "Commerce", description: "Economics" },

  // Basic & Other Subjects
  { name: "Basic Mathematics", code: "BMATH", category: "Basic", description: "Basic Applied Mathematics" },
  { name: "Religious Education", code: "RE", category: "Other", description: "Religious Studies" },
  { name: "Physical Education", code: "PE", category: "Other", description: "Sports and Physical Education" },
  { name: "Fine Arts", code: "ART", category: "Other", description: "Visual Arts and Drawing" },
  { name: "Music", code: "MUS", category: "Other", description: "Music and Performance" },
];

// Talents (Diverse talent categories)
const talentsData = [
  // Sports
  { name: "Football/Soccer", category: "Sports", icon: "⚽", description: "Association Football", requirements: ["Physical fitness", "Teamwork skills"] },
  { name: "Basketball", category: "Sports", icon: "🏀", description: "Basketball skills", requirements: ["Height advantage", "Agility"] },
  { name: "Volleyball", category: "Sports", icon: "🏐", description: "Volleyball expertise", requirements: ["Jumping ability", "Team coordination"] },
  { name: "Athletics", category: "Sports", icon: "🏃", description: "Track and field", requirements: ["Speed", "Endurance"] },
  { name: "Swimming", category: "Sports", icon: "🏊", description: "Swimming competence", requirements: ["Water confidence", "Stamina"] },
  { name: "Netball", category: "Sports", icon: "🥅", description: "Netball skills", requirements: ["Agility", "Hand-eye coordination"] },

  // Performing Arts
  { name: "Traditional Dance", category: "Performing Arts", icon: "💃", description: "Traditional Tanzanian dance", requirements: ["Rhythm", "Cultural knowledge"] },
  { name: "Modern Dance", category: "Performing Arts", icon: "🕺", description: "Contemporary dance styles", requirements: ["Flexibility", "Creativity"] },
  { name: "Drama/Acting", category: "Performing Arts", icon: "🎭", description: "Theatrical performance", requirements: ["Expression", "Confidence"] },
  { name: "Singing", category: "Performing Arts", icon: "🎤", description: "Vocal performance", requirements: ["Voice quality", "Musical ear"] },
  { name: "Choir", category: "Performing Arts", icon: "👥", description: "Choral singing", requirements: ["Harmony skills", "Teamwork"] },

  // Music
  { name: "Piano", category: "Music", icon: "🎹", description: "Piano playing", requirements: ["Musical theory", "Practice dedication"] },
  { name: "Guitar", category: "Music", icon: "🎸", description: "Guitar performance", requirements: ["Finger dexterity", "Rhythm"] },
  { name: "Drums", category: "Music", icon: "🥁", description: "Percussion instruments", requirements: ["Timing", "Coordination"] },
  { name: "Traditional Instruments", category: "Music", icon: "🪘", description: "Traditional music instruments", requirements: ["Cultural knowledge"] },

  // Visual Arts
  { name: "Painting", category: "Visual Arts", icon: "🎨", description: "Painting and drawing", requirements: ["Creativity", "Patience"] },
  { name: "Sculpture", category: "Visual Arts", icon: "🗿", description: "3D art creation", requirements: ["Spatial awareness", "Tool skills"] },
  { name: "Photography", category: "Visual Arts", icon: "📷", description: "Digital photography", requirements: ["Visual eye", "Technical skills"] },
  { name: "Graphic Design", category: "Visual Arts", icon: "🖼️", description: "Digital design", requirements: ["Software knowledge", "Creativity"] },

  // Technology
  { name: "Programming", category: "Technology", icon: "💻", description: "Software development", requirements: ["Logic", "Problem-solving"] },
  { name: "Robotics", category: "Technology", icon: "🤖", description: "Robotics and automation", requirements: ["Engineering basics", "Coding"] },
  { name: "Web Design", category: "Technology", icon: "🌐", description: "Website creation", requirements: ["HTML/CSS", "Design sense"] },

  // Literature & Writing
  { name: "Creative Writing", category: "Literature", icon: "✍️", description: "Story and poetry writing", requirements: ["Imagination", "Language skills"] },
  { name: "Journalism", category: "Literature", icon: "📰", description: "News reporting", requirements: ["Research", "Communication"] },
  { name: "Poetry", category: "Literature", icon: "📖", description: "Poetic expression", requirements: ["Literary knowledge", "Creativity"] },

  // Leadership & Service
  { name: "Debate", category: "Leadership", icon: "🗣️", description: "Public speaking and debate", requirements: ["Confidence", "Critical thinking"] },
  { name: "Student Leadership", category: "Leadership", icon: "👔", description: "School governance", requirements: ["Responsibility", "Communication"] },
  { name: "Community Service", category: "Leadership", icon: "🤝", description: "Volunteer work", requirements: ["Empathy", "Commitment"] },

  // Other Talents
  { name: "Cooking", category: "Life Skills", icon: "👨‍🍳", description: "Culinary arts", requirements: ["Hygiene awareness", "Creativity"] },
  { name: "Fashion Design", category: "Life Skills", icon: "👗", description: "Clothing design", requirements: ["Sewing skills", "Design sense"] },
  { name: "Agriculture", category: "Life Skills", icon: "🌾", description: "Farming skills", requirements: ["Hard work", "Patience"] },
];

// Books (Educational and general books)
const booksData = [
  {
    title: "Shamba la Wanyama (Animal Farm - Swahili)",
    author: "George Orwell (Translated)",
    category: "Literature",
    description: "Classic allegory about power and corruption",
    language: "Swahili",
    price: 15000,
    pages: 112,
    publisher: "East African Educational Publishers",
    publishedDate: new Date("2015-01-01"),
    stockQuantity: 50,
    rating: 4.5,
    isFeatured: true,
  },
  {
    title: "Kusadikika",
    author: "Ebrahim Hussein",
    category: "Literature",
    description: "Famous Swahili play about social issues",
    language: "Swahili",
    price: 12000,
    pages: 96,
    publisher: "Oxford University Press East Africa",
    publishedDate: new Date("1970-01-01"),
    stockQuantity: 40,
    rating: 4.8,
    isFeatured: true,
  },
  {
    title: "Mathematics Form 1-4 Guide",
    author: "Tanzania Institute of Education",
    category: "Academic",
    description: "Comprehensive mathematics guide for secondary schools",
    language: "English",
    price: 25000,
    pages: 456,
    publisher: "TIE",
    publishedDate: new Date("2020-01-01"),
    stockQuantity: 100,
    rating: 4.3,
  },
  {
    title: "Physics Practical Manual",
    author: "Dr. John Kamuzora",
    category: "Academic",
    description: "Laboratory practical guide for physics students",
    language: "English",
    price: 20000,
    pages: 200,
    publisher: "Nyambari Nyangwine Publishers",
    publishedDate: new Date("2019-06-15"),
    stockQuantity: 60,
    rating: 4.0,
  },
  {
    title: "Kiswahili Grammar Simplified",
    author: "Prof. Lioba Moshi",
    category: "Academic",
    description: "Easy-to-understand Kiswahili grammar rules",
    language: "Swahili/English",
    price: 18000,
    pages: 280,
    publisher: "TUKI",
    publishedDate: new Date("2018-03-20"),
    stockQuantity: 75,
    rating: 4.6,
  },
  {
    title: "Chemistry O-Level Notes",
    author: "Dr. Mary Nkya",
    category: "Academic",
    description: "Complete chemistry revision notes",
    language: "English",
    price: 22000,
    pages: 320,
    publisher: "Mkuki na Nyota",
    publishedDate: new Date("2021-01-10"),
    stockQuantity: 55,
    rating: 4.4,
  },
  {
    title: "Tanzania History: From Pre-Colonial to Independence",
    author: "Prof. Isaria Kimambo",
    category: "History",
    description: "Comprehensive Tanzanian history",
    language: "English",
    price: 30000,
    pages: 512,
    publisher: "Dar es Salaam University Press",
    publishedDate: new Date("2017-07-01"),
    stockQuantity: 30,
    rating: 4.9,
    isFeatured: true,
  },
  {
    title: "English Grammar in Use - Tanzania Edition",
    author: "Raymond Murphy (Adapted)",
    category: "Academic",
    description: "English grammar for Tanzanian students",
    language: "English",
    price: 28000,
    pages: 380,
    publisher: "Cambridge University Press",
    publishedDate: new Date("2020-09-01"),
    stockQuantity: 80,
    rating: 4.7,
  },
];

// Events (Upcoming school events)
const eventsData = [
  {
    title: "National CTM Talent Show 2025",
    description: "Annual showcase of student talents from across Tanzania. Categories include music, dance, drama, sports demonstrations, and technology innovations.",
    eventType: "talent_show",
    location: "National Stadium, Dar es Salaam",
    venue: "Main Arena",
    registrationFee: 10000,
    maxParticipants: 500,
    status: "published",
    isPublic: true,
  },
  {
    title: "Inter-School Science Competition",
    description: "Students compete in physics, chemistry, and biology challenges. Team-based and individual categories available.",
    eventType: "competition",
    location: "University of Dar es Salaam",
    venue: "Science Complex",
    registrationFee: 5000,
    maxParticipants: 200,
    status: "published",
    isPublic: true,
  },
  {
    title: "Football Championship - Regional Finals",
    description: "Regional football tournament for secondary schools. Top 3 teams advance to nationals.",
    eventType: "competition",
    location: "Uhuru Stadium, Dar es Salaam",
    venue: "Main Pitch",
    registrationFee: 50000,
    maxParticipants: 16,
    status: "published",
    isPublic: true,
  },
  {
    title: "ICT Workshop: Introduction to Programming",
    description: "3-day intensive workshop on Python programming for beginners. Laptops provided.",
    eventType: "workshop",
    location: "Dar es Salaam",
    venue: "Azania Front Lutheran Church Hall",
    registrationFee: 15000,
    maxParticipants: 50,
    status: "published",
    isPublic: true,
  },
  {
    title: "Art Exhibition: Young Tanzanian Artists",
    description: "Student artwork exhibition featuring paintings, sculptures, and digital art. Prizes for top 3 in each category.",
    eventType: "exhibition",
    location: "National Museum, Dar es Salaam",
    venue: "Exhibition Hall",
    registrationFee: 0,
    maxParticipants: 100,
    status: "published",
    isPublic: true,
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

function generateRandomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

// ============================================
// MAIN SEEDER FUNCTION
// ============================================

async function seedDatabase() {
  try {
    console.log("═══════════════════════════════════════════════════════");
    console.log("🚀 ECONNECT ULTIMATE DATABASE SEEDER");
    console.log("═══════════════════════════════════════════════════════\n");

    // Connect to MongoDB
    console.log("📡 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // ============================================
    // 1. SEED REGIONS
    // ============================================
    console.log("📍 1. Seeding Regions...");
    const regionMap = new Map();
    
    for (const regionData of regionsData) {
      try {
        // Use updateOne with upsert to avoid duplicate errors
        const result = await Region.updateOne(
          { code: regionData.code },
          { $setOnInsert: regionData },
          { upsert: true }
        );
        
        // Find the region to get its ID
        const region = await Region.findOne({ code: regionData.code });
        if (region) {
          regionMap.set(regionData.code, region._id);
          
          if (result.upsertedCount > 0) {
            console.log(`   ✓ Created region: ${regionData.name}`);
          } else {
            console.log(`   - Region exists: ${regionData.name}`);
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Error with region ${regionData.name}:`, error.message);
        // Try to find existing anyway
        const existing = await Region.findOne({ 
          $or: [{ code: regionData.code }, { name: regionData.name }] 
        });
        if (existing) {
          regionMap.set(regionData.code, existing._id);
        }
      }
    }
    console.log(`✅ Regions: ${regionMap.size} total\n`);

    // ============================================
    // 2. SEED DISTRICTS
    // ============================================
    console.log("🏘️  2. Seeding Districts...");
    const districtMap = new Map();
    
    for (const districtData of districtsData) {
      const regionId = regionMap.get(districtData.regionCode);
      if (!regionId) {
        console.log(`   ⚠️  Region not found for: ${districtData.regionCode}`);
        continue;
      }

      try {
        const result = await District.updateOne(
          { code: districtData.code },
          { 
            $setOnInsert: {
              name: districtData.name,
              code: districtData.code,
              regionId,
              population: districtData.population,
            }
          },
          { upsert: true }
        );
        
        const district = await District.findOne({ code: districtData.code });
        if (district) {
          districtMap.set(districtData.code, district._id);
          
          if (result.upsertedCount > 0) {
            console.log(`   ✓ Created district: ${districtData.name}`);
          } else {
            console.log(`   - District exists: ${districtData.name}`);
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Error with district ${districtData.name}:`, error.message);
        const existing = await District.findOne({ code: districtData.code });
        if (existing) {
          districtMap.set(districtData.code, existing._id);
        }
      }
    }
    console.log(`✅ Districts: ${districtMap.size} total\n`);

    // ============================================
    // 3. SEED WARDS
    // ============================================
    console.log("🏡 3. Seeding Wards...");
    const wardMap = new Map();
    
    for (const wardData of wardsData) {
      const districtId = districtMap.get(wardData.districtCode);
      if (!districtId) {
        console.log(`   ⚠️  District not found for: ${wardData.districtCode}`);
        continue;
      }

      try {
        const result = await Ward.updateOne(
          { code: wardData.code },
          { 
            $setOnInsert: {
              name: wardData.name,
              code: wardData.code,
              districtId,
              population: wardData.population,
            }
          },
          { upsert: true }
        );
        
        const ward = await Ward.findOne({ code: wardData.code });
        if (ward) {
          wardMap.set(wardData.code, ward._id);
          
          if (result.upsertedCount > 0) {
            console.log(`   ✓ Created ward: ${wardData.name}`);
          } else {
            console.log(`   - Ward exists: ${wardData.name}`);
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Error with ward ${wardData.name}:`, error.message);
        const existing = await Ward.findOne({ code: wardData.code });
        if (existing) {
          wardMap.set(wardData.code, existing._id);
        }
      }
    }
    console.log(`✅ Wards: ${wardMap.size} total\n`);

    // ============================================
    // 4. SEED SCHOOLS
    // ============================================
    console.log("🏫 4. Seeding Schools...");
    const schoolMap = new Map();
    
    for (const schoolData of schoolsData) {
      const districtId = districtMap.get(schoolData.districtCode);
      const wardId = schoolData.wardCode ? wardMap.get(schoolData.wardCode) : undefined;
      
      // Get region from district
      const district = await District.findById(districtId);
      const regionId = district ? district.regionId : undefined;

      if (!districtId) {
        console.log(`   ⚠️  District not found for: ${schoolData.districtCode}`);
        continue;
      }

      const existing = await School.findOne({ schoolCode: schoolData.code });
      if (!existing) {
        const school = await School.create({
          name: schoolData.name,
          schoolCode: schoolData.code,
          type: schoolData.type,
          regionId,
          districtId,
          wardId,
          address: schoolData.address,
          phoneNumber: schoolData.phoneNumber,
          email: schoolData.email,
          principalName: schoolData.principalName,
          establishedYear: schoolData.establishedYear,
        });
        schoolMap.set(schoolData.code, school._id);
        console.log(`   ✓ Created school: ${schoolData.name}`);
      } else {
        schoolMap.set(schoolData.code, existing._id);
        console.log(`   - School exists: ${schoolData.name}`);
      }
    }
    console.log(`✅ Schools: ${schoolMap.size} total\n`);

    // ============================================
    // 5. SEED SUBJECTS
    // ============================================
    console.log("📚 5. Seeding Subjects...");
    let subjectCount = 0;
    
    for (const subjectData of subjectsData) {
      const existing = await Subject.findOne({ name: subjectData.name, schoolId: { $exists: false } });
      if (!existing) {
        await Subject.create(subjectData);
        subjectCount++;
        console.log(`   ✓ Created subject: ${subjectData.name}`);
      } else {
        console.log(`   - Subject exists: ${subjectData.name}`);
      }
    }
    console.log(`✅ Subjects: ${subjectCount} created\n`);

    // ============================================
    // 6. SEED TALENTS
    // ============================================
    console.log("🎨 6. Seeding Talents...");
    let talentCount = 0;
    
    for (const talentData of talentsData) {
      const existing = await Talent.findOne({ name: talentData.name, category: talentData.category });
      if (!existing) {
        await Talent.create(talentData);
        talentCount++;
        console.log(`   ✓ Created talent: ${talentData.name}`);
      } else {
        console.log(`   - Talent exists: ${talentData.name}`);
      }
    }
    console.log(`✅ Talents: ${talentCount} created\n`);

    // ============================================
    // 7. SEED USERS
    // ============================================
    console.log("👥 7. Seeding Users...");
    
    const hashedPassword = await hashPassword("password123");
    
    // SuperAdmin
    const existingSuperAdmin = await User.findOne({ username: "superadmin" });
    if (!existingSuperAdmin) {
      await User.create({
        username: "superadmin",
        email: "admin@econnect.co.tz",
        password: hashedPassword,
        role: "super_admin",
        firstName: "System",
        lastName: "Administrator",
        phoneNumber: "+255700000001",
        isActive: true,
      });
      console.log("   ✓ Created SuperAdmin");
    } else {
      console.log("   - SuperAdmin exists");
    }

    // National Official
    const existingNational = await User.findOne({ username: "national_official" });
    if (!existingNational) {
      await User.create({
        username: "national_official",
        email: "national@tamisemi.go.tz",
        password: hashedPassword,
        role: "national_official",
        firstName: "Dr. James",
        lastName: "Mwangi",
        phoneNumber: "+255700000002",
        isActive: true,
      });
      console.log("   ✓ Created National Official");
    } else {
      console.log("   - National Official exists");
    }

    // Regional Official (Dar es Salaam)
    const dsmRegionId = regionMap.get("DSM");
    const existingRegional = await User.findOne({ username: "regional_dsm" });
    if (!existingRegional && dsmRegionId) {
      await User.create({
        username: "regional_dsm",
        email: "regional@dsm.go.tz",
        password: hashedPassword,
        role: "regional_official",
        firstName: "Mrs. Sarah",
        lastName: "Mwakasege",
        phoneNumber: "+255700000003",
        regionId: dsmRegionId,
        isActive: true,
      });
      console.log("   ✓ Created Regional Official (DSM)");
    } else {
      console.log("   - Regional Official exists");
    }

    // District Official (Ilala)
    const ilalaDistrictId = districtMap.get("DSM-ILA");
    const existingDistrict = await User.findOne({ username: "district_ilala" });
    if (!existingDistrict && ilalaDistrictId) {
      await User.create({
        username: "district_ilala",
        email: "district@ilala.go.tz",
        password: hashedPassword,
        role: "district_official",
        firstName: "Mr. John",
        lastName: "Mahenge",
        phoneNumber: "+255700000004",
        regionId: dsmRegionId,
        districtId: ilalaDistrictId,
        isActive: true,
      });
      console.log("   ✓ Created District Official (Ilala)");
    } else {
      console.log("   - District Official exists");
    }

    // Headmasters for each school
    let headmasterCount = 0;
    for (const [code, schoolId] of schoolMap.entries()) {
      const school = await School.findById(schoolId);
      const username = `headmaster_${code.toLowerCase().replace(/-/g, "_")}`;
      
      const existing = await User.findOne({ username });
      if (!existing) {
        await User.create({
          username,
          email: `headmaster@${code.toLowerCase()}.ac.tz`,
          password: hashedPassword,
          role: "headmaster",
          firstName: school.principalName ? school.principalName.split(" ")[0] : "Head",
          lastName: school.principalName ? school.principalName.split(" ").slice(1).join(" ") : "Master",
          phoneNumber: `+2557000${String(headmasterCount + 10).padStart(5, "0")}`,
          schoolId,
          regionId: school.regionId,
          districtId: school.districtId,
          isActive: true,
        });
        headmasterCount++;
        console.log(`   ✓ Created Headmaster for ${school.name}`);
      }
    }

    // Sample Teachers (3 per school)
    let teacherCount = 0;
    for (const [code, schoolId] of schoolMap.entries()) {
      const school = await School.findById(schoolId);
      
      for (let i = 1; i <= 3; i++) {
        const username = `teacher_${code.toLowerCase().replace(/-/g, "_")}_${i}`;
        const existing = await User.findOne({ username });
        
        if (!existing) {
          const subjects = ["Mathematics", "English", "Kiswahili", "Physics", "Chemistry", "Biology"];
          await User.create({
            username,
            email: `teacher${i}@${code.toLowerCase()}.ac.tz`,
            password: hashedPassword,
            role: "teacher",
            firstName: `Teacher${i}`,
            lastName: school.name.split(" ")[0],
            phoneNumber: `+2557001${String(teacherCount).padStart(5, "0")}`,
            schoolId,
            regionId: school.regionId,
            districtId: school.districtId,
            specialization: subjects[i % subjects.length],
            isActive: true,
          });
          teacherCount++;
        }
      }
    }
    console.log(`   ✓ Created ${teacherCount} Teachers`);

    // Sample Students (5 per school)
    let studentCount = 0;
    const registrationTypes = ["normal_registration", "premier_registration", "silver_registration", "diamond_registration"];
    
    for (const [code, schoolId] of schoolMap.entries()) {
      const school = await School.findById(schoolId);
      
      for (let i = 1; i <= 5; i++) {
        const username = `student_${code.toLowerCase().replace(/-/g, "_")}_${i}`;
        const existing = await User.findOne({ username });
        
        if (!existing) {
          await User.create({
            username,
            email: `student${i}@${code.toLowerCase()}.ac.tz`,
            password: hashedPassword,
            role: "student",
            firstName: `Student${i}`,
            lastName: school.name.split(" ")[0],
            phoneNumber: `+2557002${String(studentCount).padStart(5, "0")}`,
            schoolId,
            regionId: school.regionId,
            districtId: school.districtId,
            gender: i % 2 === 0 ? "male" : "female",
            gradeLevel: school.type === "primary" ? "Standard 5" : "Form 2",
            classLevel: school.type === "primary" ? "Primary" : "Secondary",
            institutionType: i % 2 === 0 ? "government" : "private",
            registration_type: registrationTypes[i % 4],
            is_ctm_student: true,
            isActive: true,
          });
          studentCount++;
        }
      }
    }
    console.log(`   ✓ Created ${studentCount} Students`);

    // Sample Entrepreneurs (3 total)
    let entrepreneurCount = 0;
    const entrepreneurData = [
      { firstName: "Fatuma", lastName: "Hassan", business: "Textile Design" },
      { firstName: "Juma", lastName: "Rajabu", business: "Tech Solutions" },
      { firstName: "Grace", lastName: "Mwambapa", business: "Catering Services" },
    ];

    for (let i = 0; i < entrepreneurData.length; i++) {
      const username = `entrepreneur_${i + 1}`;
      const existing = await User.findOne({ username });
      
      if (!existing) {
        await User.create({
          username,
          email: `entrepreneur${i + 1}@econnect.co.tz`,
          password: hashedPassword,
          role: "entrepreneur",
          firstName: entrepreneurData[i].firstName,
          lastName: entrepreneurData[i].lastName,
          phoneNumber: `+2557003${String(i).padStart(5, "0")}`,
          businessName: entrepreneurData[i].business,
          regionId: dsmRegionId,
          districtId: ilalaDistrictId,
          isActive: true,
        });
        entrepreneurCount++;
      }
    }
    console.log(`   ✓ Created ${entrepreneurCount} Entrepreneurs`);

    console.log(`✅ Users: ${headmasterCount + teacherCount + studentCount + entrepreneurCount + 4} total\n`);

    // ============================================
    // 8. SEED BOOKS
    // ============================================
    console.log("📖 8. Seeding Books...");
    let bookCount = 0;
    
    for (const bookData of booksData) {
      const existing = await Book.findOne({ title: bookData.title });
      if (!existing) {
        await Book.create(bookData);
        bookCount++;
        console.log(`   ✓ Created book: ${bookData.title}`);
      } else {
        console.log(`   - Book exists: ${bookData.title}`);
      }
    }
    console.log(`✅ Books: ${bookCount} created\n`);

    // ============================================
    // 9. SEED EVENTS
    // ============================================
    console.log("📅 9. Seeding Events...");
    let eventCount = 0;
    
    // Get a random school and region for events
    const randomSchoolId = Array.from(schoolMap.values())[0];
    const randomSchool = await School.findById(randomSchoolId);
    
    for (const eventData of eventsData) {
      const existing = await Event.findOne({ title: eventData.title });
      if (!existing) {
        const now = new Date();
        const startDate = generateRandomDate(now, new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)); // Next 90 days
        const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000); // 1 day event

        await Event.create({
          ...eventData,
          startDate,
          endDate,
          schoolId: randomSchoolId,
          regionId: randomSchool.regionId,
        });
        eventCount++;
        console.log(`   ✓ Created event: ${eventData.title}`);
      } else {
        console.log(`   - Event exists: ${eventData.title}`);
      }
    }
    console.log(`✅ Events: ${eventCount} created\n`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log("═══════════════════════════════════════════════════════");
    console.log("✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("\n📊 SUMMARY:");
    console.log(`   Regions: ${regionMap.size}`);
    console.log(`   Districts: ${districtMap.size}`);
    console.log(`   Wards: ${wardMap.size}`);
    console.log(`   Schools: ${schoolMap.size}`);
    console.log(`   Subjects: ${await Subject.countDocuments()}`);
    console.log(`   Talents: ${await Talent.countDocuments()}`);
    console.log(`   Users: ${await User.countDocuments()}`);
    console.log(`   Books: ${await Book.countDocuments()}`);
    console.log(`   Events: ${await Event.countDocuments()}`);
    console.log("\n🔑 DEFAULT LOGIN CREDENTIALS:");
    console.log("   SuperAdmin:");
    console.log("     Username: superadmin");
    console.log("     Password: password123");
    console.log("\n   National Official:");
    console.log("     Username: national_official");
    console.log("     Password: password123");
    console.log("\n   Headmaster (example):");
    console.log("     Username: headmaster_aza_ss_001");
    console.log("     Password: password123");
    console.log("\n   Teacher (example):");
    console.log("     Username: teacher_aza_ss_001_1");
    console.log("     Password: password123");
    console.log("\n   Student (example):");
    console.log("     Username: student_aza_ss_001_1");
    console.log("     Password: password123");
    console.log("\n   Entrepreneur:");
    console.log("     Username: entrepreneur_1");
    console.log("     Password: password123");
    console.log("═══════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n❌ SEEDING ERROR:", error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB\n");
    process.exit(0);
  }
}

// ============================================
// RUN SEEDER
// ============================================
seedDatabase();