// ============================================
// ECONNECT ULTIMATE SEED SCRIPT
// Optimized with Embedded Location Data
// Version: 3.1.0 - Ultra Performance Edition
// ============================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// ============================================
// TANZANIA LOCATION DATA (Embedded)
// ============================================

const TANZANIA_REGIONS = [
  { name: "Dar es Salaam", code: "DSM" },
  { name: "Dodoma", code: "DOD" },
  { name: "Arusha", code: "ARU" },
  { name: "Mwanza", code: "MWZ" },
  { name: "Mbeya", code: "MBY" },
  { name: "Kilimanjaro", code: "KIL" },
  { name: "Tanga", code: "TNG" },
  { name: "Morogoro", code: "MOR" },
  { name: "Pwani", code: "PWN" },
  { name: "Kagera", code: "KAG" },
  { name: "Mtwara", code: "MTW" },
  { name: "Lindi", code: "LND" },
  { name: "Ruvuma", code: "RUV" },
  { name: "Iringa", code: "IRG" },
  { name: "Mara", code: "MAR" },
  { name: "Manyara", code: "MNY" },
  { name: "Njombe", code: "NJO" },
  { name: "Shinyanga", code: "SHY" },
  { name: "Singida", code: "SNG" },
  { name: "Tabora", code: "TAB" },
  { name: "Kigoma", code: "KGM" },
  { name: "Rukwa", code: "RKW" },
  { name: "Katavi", code: "KAT" },
  { name: "Simiyu", code: "SIM" },
  { name: "Geita", code: "GEI" },
  { name: "Songwe", code: "SON" },
];

const TANZANIA_DISTRICTS = {
  "Dar es Salaam": ["Ilala", "Kinondoni", "Temeke", "Ubungo", "Kigamboni"],
  Dodoma: ["Dodoma", "Bahi", "Chamwino", "Kondoa", "Kongwa", "Mpwapwa"],
  Arusha: [
    "Arusha City",
    "Arusha District",
    "Karatu",
    "Longido",
    "Meru",
    "Monduli",
    "Ngorongoro",
  ],
  Mwanza: [
    "Ilemela",
    "Nyamagana",
    "Kwimba",
    "Magu",
    "Misungwi",
    "Sengerema",
    "Ukerewe",
  ],
  Mbeya: ["Mbeya City", "Mbeya Rural", "Chunya", "Kyela", "Mbarali", "Rungwe"],
  Kilimanjaro: [
    "Moshi Urban",
    "Moshi Rural",
    "Hai",
    "Mwanga",
    "Rombo",
    "Same",
    "Siha",
  ],
  Tanga: [
    "Tanga City",
    "Handeni",
    "Kilindi",
    "Korogwe",
    "Lushoto",
    "Muheza",
    "Mkinga",
    "Pangani",
  ],
  Morogoro: [
    "Morogoro Urban",
    "Morogoro Rural",
    "Gairo",
    "Kilombero",
    "Kilosa",
    "Mvomero",
    "Ulanga",
    "Malinyi",
  ],
  Pwani: ["Kibaha", "Bagamoyo", "Kisarawe", "Mafia", "Mkuranga", "Rufiji"],
  Kagera: [
    "Bukoba Urban",
    "Bukoba Rural",
    "Biharamulo",
    "Karagwe",
    "Kyerwa",
    "Missenyi",
    "Muleba",
    "Ngara",
  ],
  Mtwara: [
    "Mtwara Urban",
    "Mtwara Rural",
    "Masasi",
    "Nanyumbu",
    "Newala",
    "Tandahimba",
  ],
  Lindi: [
    "Lindi Urban",
    "Lindi Rural",
    "Kilwa",
    "Liwale",
    "Nachingwea",
    "Ruangwa",
  ],
  Ruvuma: [
    "Songea Urban",
    "Songea Rural",
    "Mbinga",
    "Namtumbo",
    "Nyasa",
    "Tunduru",
  ],
  Iringa: ["Iringa Urban", "Iringa Rural", "Kilolo", "Mufindi"],
  Mara: ["Musoma Urban", "Bunda", "Butiama", "Rorya", "Serengeti", "Tarime"],
  Manyara: [
    "Babati Urban",
    "Babati Rural",
    "Hanang",
    "Kiteto",
    "Mbulu",
    "Simanjiro",
  ],
  Njombe: ["Njombe Urban", "Njombe Rural", "Ludewa", "Makete", "Wanging'ombe"],
  Shinyanga: ["Shinyanga Urban", "Shinyanga Rural", "Kahama", "Kishapu"],
  Singida: [
    "Singida Urban",
    "Singida Rural",
    "Ikungi",
    "Iramba",
    "Manyoni",
    "Mkalama",
  ],
  Tabora: [
    "Tabora Urban",
    "Igunga",
    "Kaliua",
    "Nzega",
    "Sikonge",
    "Urambo",
    "Uyui",
  ],
  Kigoma: ["Kigoma Urban", "Buhigwe", "Kakonko", "Kasulu", "Kibondo", "Uvinza"],
  Rukwa: ["Sumbawanga Urban", "Kalambo", "Nkasi"],
  Katavi: ["Mpanda", "Mlele", "Tanganyika"],
  Simiyu: ["Bariadi", "Busega", "Itilima", "Maswa", "Meatu"],
  Geita: ["Geita", "Bukombe", "Chato", "Mbogwe", "Nyang'hwale"],
  Songwe: ["Ileje", "Mbozi", "Momba", "Songwe"],
};

const TANZANIA_WARDS = {
  Ilala: ["Kivukoni", "Kariakoo", "Buguruni", "Tabata", "Segerea"],
  Kinondoni: ["Magomeni", "Tandale", "Mwananyamala", "Msasani", "Mikocheni"],
  Temeke: ["Chang'ombe", "Keko", "Mbagala", "Chamazi"],
  Ubungo: ["Mburahati", "Sinza", "Ubungo", "Kimara", "Mabibo"],
  Kigamboni: ["Kimbiji", "Somangila", "Tungi", "Mjimwema"],
  Dodoma: ["Uhuru", "Viwandani", "Madukani", "Tambukareli"],
  Bahi: ["Bahi", "Ibihwa", "Ilindi"],
  "Arusha City": ["Sekei", "Kati", "Kaloleni", "Elerai"],
  "Moshi Urban": ["Kiusa", "Majengo", "Rau", "Bondeni"],
  "Tanga City": ["Makorora", "Chumbageni", "Tangasisi", "Msambweni"],
};

// ============================================
// CONFIGURATION
// ============================================

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";

// Seed quantities (configurable)
const SEED_CONFIG = {
  schools: 15,
  studentsPerSchool: 20,
  teachersPerSchool: 5,
  staffPerDistrict: 3,
  talents: 60,
  subjects: 20,
  events: 12,
  books: 25,
  businesses: 10,
  productsPerBusiness: 5,
};

// ============================================
// MONGODB SCHEMAS (Minimal for seeding)
// ============================================

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  firstName: String,
  lastName: String,
  phoneNumber: { type: String, unique: true, sparse: true },
  schoolId: mongoose.Schema.Types.ObjectId,
  regionId: mongoose.Schema.Types.ObjectId,
  districtId: mongoose.Schema.Types.ObjectId,
  wardId: mongoose.Schema.Types.ObjectId,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  gradeLevel: String,
  specialization: String,
  staffPosition: String,
  registration_type: String,
  is_ctm_student: { type: Boolean, default: true },
});

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  schoolCode: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  regionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, required: true },
  wardId: mongoose.Schema.Types.ObjectId,
  isActive: { type: Boolean, default: true },
  totalStudents: { type: Number, default: 0 },
  totalTeachers: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const regionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const districtSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  regionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const wardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const talentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: String,
  category: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  eventType: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  location: String,
  organizer: mongoose.Schema.Types.ObjectId,
  schoolId: mongoose.Schema.Types.ObjectId,
  regionId: mongoose.Schema.Types.ObjectId,
  districtId: mongoose.Schema.Types.ObjectId,
  status: { type: String, default: "published" },
  maxParticipants: Number,
  createdAt: { type: Date, default: Date.now },
});

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  category: String,
  description: String,
  price: { type: Number, default: 0 },
  language: { type: String, default: "english" }, // MongoDB text search only supports specific languages
  isActive: { type: Boolean, default: true },
  uploadedBy: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
});

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  businessType: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  regionId: mongoose.Schema.Types.ObjectId,
  districtId: mongoose.Schema.Types.ObjectId,
  status: { type: String, default: "active" },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  price: { type: Number, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const studentTalentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  talentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  schoolId: mongoose.Schema.Types.ObjectId,
  proficiencyLevel: {
    type: String,
    default: "beginner",
  },
  createdAt: { type: Date, default: Date.now },
});

// Models
const User = mongoose.model("User", userSchema);
const School = mongoose.model("School", schoolSchema);
const Region = mongoose.model("Region", regionSchema);
const District = mongoose.model("District", districtSchema);
const Ward = mongoose.model("Ward", wardSchema);
const Talent = mongoose.model("Talent", talentSchema);
const Subject = mongoose.model("Subject", subjectSchema);
const Event = mongoose.model("Event", eventSchema);
const Book = mongoose.model("Book", bookSchema);
const Business = mongoose.model("Business", businessSchema);
const Product = mongoose.model("Product", productSchema);
const StudentTalent = mongoose.model("StudentTalent", studentTalentSchema);

// ============================================
// UTILITY FUNCTIONS
// ============================================

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const randomElement = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

const randomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const generatePhoneNumber = () => {
  const prefixes = ["0754", "0755", "0756", "0764", "0765", "0766"];
  return `${randomElement(prefixes)}${randomNumber(100000, 999999)}`;
};

const progressBar = (current, total, label) => {
  const percentage = Math.min(Math.round((current / total) * 100), 100); // Cap at 100%
  const barLength = 30;
  const filled = Math.min(Math.round((barLength * current) / total), barLength); // Cap at barLength
  const empty = Math.max(barLength - filled, 0); // Prevent negative
  const bar = "█".repeat(filled) + "░".repeat(empty);
  process.stdout.write(
    `\r${label}: [${bar}] ${percentage}% (${current}/${total})`
  );
  if (current >= total) console.log();
};

// ============================================
// DATA GENERATORS
// ============================================

const TANZANIAN_FIRST_NAMES = [
  "Asha",
  "Juma",
  "Fatuma",
  "Rashidi",
  "Neema",
  "Hamisi",
  "Zuhura",
  "Ally",
  "Mwajuma",
  "Baraka",
  "Amina",
  "Hassan",
  "Mariam",
  "Salehe",
  "Halima",
  "Rajabu",
  "Saida",
  "Omari",
  "Rehema",
  "Bakari",
  "Sophia",
  "Emmanuel",
  "Grace",
  "John",
  "Elizabeth",
  "David",
  "Anna",
  "Michael",
  "Sarah",
  "Daniel",
];

const TANZANIAN_LAST_NAMES = [
  "Mwangi",
  "Ndege",
  "Komba",
  "Massawe",
  "Lyimo",
  "Mushi",
  "Mvungi",
  "Kisenge",
  "Mbowe",
  "Mkwawa",
  "Nyerere",
  "Kikwete",
  "Magufuli",
  "Karume",
  "Simba",
  "Twiga",
  "Tembo",
  "Chui",
  "Fisi",
  "Kiboko",
];

const SCHOOL_TYPES = [
  "primary",
  "secondary",
  "high_school",
  "vocational",
  "special",
];

const REGISTRATION_TYPES = [
  "normal_registration",
  "premier_registration",
  "silver_registration",
  "diamond_registration",
];

const TALENTS_DATA = [
  // Sports (15)
  { name: "Football", category: "Sports" },
  { name: "Basketball", category: "Sports" },
  { name: "Volleyball", category: "Sports" },
  { name: "Athletics", category: "Sports" },
  { name: "Swimming", category: "Sports" },
  { name: "Boxing", category: "Sports" },
  { name: "Table Tennis", category: "Sports" },
  { name: "Chess", category: "Sports" },
  { name: "Netball", category: "Sports" },
  { name: "Handball", category: "Sports" },
  { name: "Rugby", category: "Sports" },
  { name: "Cricket", category: "Sports" },
  { name: "Martial Arts", category: "Sports" },
  { name: "Badminton", category: "Sports" },
  { name: "Hockey", category: "Sports" },

  // Arts (15)
  { name: "Drawing", category: "Arts" },
  { name: "Painting", category: "Arts" },
  { name: "Sculpture", category: "Arts" },
  { name: "Photography", category: "Arts" },
  { name: "Graphic Design", category: "Arts" },
  { name: "Fashion Design", category: "Arts" },
  { name: "Pottery", category: "Arts" },
  { name: "Calligraphy", category: "Arts" },
  { name: "Cartooning", category: "Arts" },
  { name: "Digital Art", category: "Arts" },
  { name: "Beadwork", category: "Arts" },
  { name: "Weaving", category: "Arts" },
  { name: "Printmaking", category: "Arts" },
  { name: "Mural Painting", category: "Arts" },
  { name: "Crafts", category: "Arts" },

  // Music (10)
  { name: "Singing", category: "Music" },
  { name: "Guitar Playing", category: "Music" },
  { name: "Piano", category: "Music" },
  { name: "Drumming", category: "Music" },
  { name: "Traditional Dance", category: "Music" },
  { name: "Modern Dance", category: "Music" },
  { name: "Choir", category: "Music" },
  { name: "DJ Mixing", category: "Music" },
  { name: "Music Production", category: "Music" },
  { name: "Violin", category: "Music" },

  // Drama (5)
  { name: "Acting", category: "Drama" },
  { name: "Poetry", category: "Drama" },
  { name: "Storytelling", category: "Drama" },
  { name: "Public Speaking", category: "Drama" },
  { name: "Debate", category: "Drama" },

  // Technology (10)
  { name: "Programming", category: "Technology" },
  { name: "Web Development", category: "Technology" },
  { name: "Mobile App Development", category: "Technology" },
  { name: "Robotics", category: "Technology" },
  { name: "Electronics", category: "Technology" },
  { name: "Video Editing", category: "Technology" },
  { name: "Animation", category: "Technology" },
  { name: "Game Development", category: "Technology" },
  { name: "Cybersecurity", category: "Technology" },
  { name: "Data Science", category: "Technology" },

  // Other (5)
  { name: "Cooking", category: "Life Skills" },
  { name: "Agriculture", category: "Life Skills" },
  { name: "Entrepreneurship", category: "Business" },
  { name: "Writing", category: "Literature" },
  { name: "Journalism", category: "Media" },
];

const SUBJECTS_DATA = [
  { name: "Mathematics", code: "MATH", category: "Science" },
  { name: "Physics", code: "PHY", category: "Science" },
  { name: "Chemistry", code: "CHEM", category: "Science" },
  { name: "Biology", code: "BIO", category: "Science" },
  { name: "Computer Science", code: "CS", category: "Science" },
  { name: "English", code: "ENG", category: "Languages" },
  { name: "Kiswahili", code: "KIS", category: "Languages" },
  { name: "History", code: "HIST", category: "Social Studies" },
  { name: "Geography", code: "GEO", category: "Social Studies" },
  { name: "Civics", code: "CIV", category: "Social Studies" },
  { name: "Commerce", code: "COM", category: "Business" },
  { name: "Accounting", code: "ACC", category: "Business" },
  { name: "Book Keeping", code: "BK", category: "Business" },
  { name: "Economics", code: "ECON", category: "Business" },
  { name: "Basic Mathematics", code: "BMATH", category: "Basic" },
  { name: "Religious Education", code: "RE", category: "Other" },
  { name: "Physical Education", code: "PE", category: "Other" },
  { name: "Art & Design", code: "ART", category: "Creative" },
  { name: "Music", code: "MUS", category: "Creative" },
  { name: "Agriculture", code: "AGR", category: "Practical" },
];

const EVENT_TYPES = [
  "competition",
  "workshop",
  "exhibition",
  "conference",
  "talent_show",
  "seminar",
  "training",
  "festival",
];

const BOOK_CATEGORIES = [
  "Academic",
  "Fiction",
  "Non-Fiction",
  "Science",
  "Mathematics",
  "History",
  "Literature",
  "Biography",
  "Children",
  "Reference",
];

const BUSINESS_TYPES = [
  "Retail",
  "Agriculture",
  "Technology",
  "Education",
  "Healthcare",
  "Manufacturing",
  "Services",
  "Food & Beverage",
  "Tourism",
  "Construction",
];

// ============================================
// MAIN SEED FUNCTIONS
// ============================================

async function seedLocations() {
  console.log("\n🌍 Seeding locations to database...");

  const regions = [];
  const districts = [];
  const wards = [];

  // Seed Regions
  for (const regionData of TANZANIA_REGIONS) {
    const region = await Region.create({
      name: regionData.name,
      code: regionData.code,
      isActive: true,
    });
    regions.push(region);
  }

  // Seed Districts
  for (const regionName in TANZANIA_DISTRICTS) {
    const region = regions.find((r) => r.name === regionName);
    if (!region) continue;

    const districtNames = TANZANIA_DISTRICTS[regionName];
    for (let i = 0; i < districtNames.length; i++) {
      const districtName = districtNames[i];
      const districtCode = `${region.code}-${String(i + 1).padStart(3, "0")}`;

      const district = await District.create({
        name: districtName,
        code: districtCode,
        regionId: region._id,
        isActive: true,
      });
      districts.push(district);
    }
  }

  // Seed Wards
  for (const districtName in TANZANIA_WARDS) {
    const district = districts.find((d) => d.name === districtName);
    if (!district) continue;

    const wardNames = TANZANIA_WARDS[districtName];
    for (let i = 0; i < wardNames.length; i++) {
      const wardName = wardNames[i];
      const wardCode = `${district.code}-${String(i + 1).padStart(3, "0")}`;

      const ward = await Ward.create({
        name: wardName,
        code: wardCode,
        districtId: district._id,
        isActive: true,
      });
      wards.push(ward);
    }
  }

  console.log(
    `✅ Seeded ${regions.length} regions, ${districts.length} districts, ${wards.length} wards`
  );

  return { regions, districts, wards };
}

async function seedSuperAdmin() {
  console.log("\n👑 Creating Super Admin...");

  const hashedPassword = await hashPassword("admin123");

  const superAdmin = await User.create({
    username: "superadmin",
    email: "admin@econnect.co.tz",
    password: hashedPassword,
    role: "super_admin",
    firstName: "Super",
    lastName: "Admin",
    phoneNumber: "0700000000",
    isActive: true,
  });

  console.log(`✅ Super Admin created: ${superAdmin.username}`);
  return superAdmin;
}

async function seedTalents() {
  console.log(`\n🎨 Seeding ${SEED_CONFIG.talents} talents...`);

  const talentsToCreate = TALENTS_DATA.slice(0, SEED_CONFIG.talents);
  const talents = [];

  for (let i = 0; i < talentsToCreate.length; i++) {
    const talentData = talentsToCreate[i];

    const talent = await Talent.create({
      name: talentData.name,
      category: talentData.category,
      description: `Learn and develop ${talentData.name} skills`,
      isActive: true,
    });

    talents.push(talent);
    progressBar(i + 1, talentsToCreate.length, "Talents");
  }

  console.log(`✅ Created ${talents.length} talents`);
  return talents;
}

async function seedSubjects() {
  console.log(`\n📚 Seeding ${SEED_CONFIG.subjects} subjects...`);

  const subjectsToCreate = SUBJECTS_DATA.slice(0, SEED_CONFIG.subjects);
  const subjects = [];

  for (let i = 0; i < subjectsToCreate.length; i++) {
    const subjectData = subjectsToCreate[i];

    const subject = await Subject.create({
      name: subjectData.name,
      code: subjectData.code,
      category: subjectData.category,
      description: `${subjectData.name} curriculum`,
      isActive: true,
    });

    subjects.push(subject);
    progressBar(i + 1, subjectsToCreate.length, "Subjects");
  }

  console.log(`✅ Created ${subjects.length} subjects`);
  return subjects;
}

async function seedSchools(locations) {
  console.log(`\n🏫 Seeding ${SEED_CONFIG.schools} schools...`);

  const schools = [];
  const { regions, districts, wards } = locations;

  for (let i = 0; i < SEED_CONFIG.schools; i++) {
    const region = randomElement(regions);
    const districtOptions = districts.filter(
      (d) => d.regionId.toString() === region._id.toString()
    );

    if (districtOptions.length === 0) {
      console.warn(
        `⚠️  No districts found for region ${region.name}, skipping school ${
          i + 1
        }`
      );
      continue;
    }

    const district = randomElement(districtOptions);
    const wardOptions = wards.filter(
      (w) => w.districtId.toString() === district._id.toString()
    );

    const ward = wardOptions.length > 0 ? randomElement(wardOptions) : null;

    const schoolType = randomElement(SCHOOL_TYPES);
    const schoolNumber = String(i + 1).padStart(3, "0");

    const school = await School.create({
      name: `${district.name} ${
        schoolType.charAt(0).toUpperCase() + schoolType.slice(1)
      } School ${schoolNumber}`,
      schoolCode: `SCH-${region.code}-${district.code}-${schoolNumber}`,
      type: schoolType,
      regionId: region._id,
      districtId: district._id,
      wardId: ward ? ward._id : null,
      isActive: true,
      totalStudents: 0,
      totalTeachers: 0,
    });

    schools.push(school);
    progressBar(i + 1, SEED_CONFIG.schools, "Schools");
  }

  console.log(`✅ Created ${schools.length} schools`);
  return schools;
}

async function seedUsers(schools, locations) {
  console.log("\n👥 Seeding users (students, teachers, staff)...");

  const users = [];
  const { regions, districts } = locations;

  const totalUsers =
    schools.length * SEED_CONFIG.studentsPerSchool +
    schools.length * SEED_CONFIG.teachersPerSchool +
    Math.min(districts.length, 10) * SEED_CONFIG.staffPerDistrict;

  let userCount = 0;

  // Create students
  for (const school of schools) {
    for (let i = 0; i < SEED_CONFIG.studentsPerSchool; i++) {
      const firstName = randomElement(TANZANIAN_FIRST_NAMES);
      const lastName = randomElement(TANZANIAN_LAST_NAMES);
      const studentNumber = String(userCount + 1).padStart(4, "0");

      const hashedPassword = await hashPassword("student123");

      const student = await User.create({
        username: `student${studentNumber}`,
        email: `student${studentNumber}@econnect.co.tz`,
        password: hashedPassword,
        role: "student",
        firstName,
        lastName,
        phoneNumber: generatePhoneNumber(),
        schoolId: school._id,
        regionId: school.regionId,
        districtId: school.districtId,
        wardId: school.wardId,
        gradeLevel: randomElement([
          "Form 1",
          "Form 2",
          "Form 3",
          "Form 4",
          "Form 5",
          "Form 6",
        ]),
        registration_type: randomElement(REGISTRATION_TYPES),
        is_ctm_student: Math.random() > 0.3,
        isActive: true,
      });

      users.push(student);
      userCount++;
      progressBar(userCount, totalUsers, "Users");
    }

    // Update school student count
    school.totalStudents = SEED_CONFIG.studentsPerSchool;
    await school.save();
  }

  // Create teachers
  for (const school of schools) {
    for (let i = 0; i < SEED_CONFIG.teachersPerSchool; i++) {
      const firstName = randomElement(TANZANIAN_FIRST_NAMES);
      const lastName = randomElement(TANZANIAN_LAST_NAMES);
      const teacherNumber = String(userCount + 1).padStart(4, "0");

      const hashedPassword = await hashPassword("teacher123");

      const teacher = await User.create({
        username: `teacher${teacherNumber}`,
        email: `teacher${teacherNumber}@econnect.co.tz`,
        password: hashedPassword,
        role: "teacher",
        firstName,
        lastName,
        phoneNumber: generatePhoneNumber(),
        schoolId: school._id,
        regionId: school.regionId,
        districtId: school.districtId,
        specialization: randomElement([
          "Mathematics",
          "Science",
          "Languages",
          "Social Studies",
          "Arts",
        ]),
        isActive: true,
      });

      users.push(teacher);
      userCount++;
      progressBar(userCount, totalUsers, "Users");
    }

    // Update school teacher count
    school.totalTeachers = SEED_CONFIG.teachersPerSchool;
    await school.save();
  }

  // Create staff (limit to first 10 districts to avoid too many staff)
  const limitedDistricts = districts.slice(0, 10);
  for (const district of limitedDistricts) {
    for (let i = 0; i < SEED_CONFIG.staffPerDistrict; i++) {
      const firstName = randomElement(TANZANIAN_FIRST_NAMES);
      const lastName = randomElement(TANZANIAN_LAST_NAMES);
      const staffNumber = String(userCount + 1).padStart(4, "0");

      const hashedPassword = await hashPassword("staff123");

      const staff = await User.create({
        username: `staff${staffNumber}`,
        email: `staff${staffNumber}@econnect.co.tz`,
        password: hashedPassword,
        role: "district_official",
        firstName,
        lastName,
        phoneNumber: generatePhoneNumber(),
        districtId: district._id,
        regionId: district.regionId,
        staffPosition: "District Education Officer",
        isActive: true,
      });

      users.push(staff);
      userCount++;
      progressBar(userCount, totalUsers, "Users");
    }
  }

  console.log(`✅ Created ${users.length} users`);
  return users;
}

async function seedStudentTalents(students, talents) {
  console.log("\n🎯 Assigning talents to students...");

  const studentTalents = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const numTalents = randomNumber(1, 3);
    const selectedTalents = [];

    for (let j = 0; j < numTalents; j++) {
      const talent = randomElement(talents);

      if (!selectedTalents.includes(talent._id.toString())) {
        const studentTalent = await StudentTalent.create({
          studentId: student._id,
          talentId: talent._id,
          schoolId: student.schoolId,
          proficiencyLevel: randomElement([
            "beginner",
            "intermediate",
            "advanced",
          ]),
        });

        studentTalents.push(studentTalent);
        selectedTalents.push(talent._id.toString());
      }
    }

    progressBar(i + 1, students.length, "Student-Talent Assignments");
  }

  console.log(`✅ Created ${studentTalents.length} student-talent assignments`);
  return studentTalents;
}

async function seedEvents(schools, users, locations) {
  console.log(`\n📅 Seeding ${SEED_CONFIG.events} events...`);

  const events = [];
  const teachers = users.filter((u) => u.role === "teacher");

  for (let i = 0; i < SEED_CONFIG.events; i++) {
    const school = randomElement(schools);
    const organizer = randomElement(teachers);
    const eventType = randomElement(EVENT_TYPES);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + randomNumber(1, 90));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + randomNumber(1, 3));

    const event = await Event.create({
      title: `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Event ${
        i + 1
      }`,
      description: `Join us for an exciting ${eventType} event at ${school.name}`,
      eventType,
      startDate,
      endDate,
      location: school.wardId ? `${school.name}` : "TBA",
      organizer: organizer._id,
      schoolId: school._id,
      regionId: school.regionId,
      districtId: school.districtId,
      status: "published",
      maxParticipants: randomNumber(50, 200),
    });

    events.push(event);
    progressBar(i + 1, SEED_CONFIG.events, "Events");
  }

  console.log(`✅ Created ${events.length} events`);
  return events;
}

async function seedBooks(users) {
  console.log(`\n📖 Seeding ${SEED_CONFIG.books} books...`);

  const books = [];
  const uploaders = users.filter(
    (u) => u.role === "teacher" || u.role === "super_admin"
  );

  for (let i = 0; i < SEED_CONFIG.books; i++) {
    const category = randomElement(BOOK_CATEGORIES);
    const uploader = randomElement(uploaders);

    const book = await Book.create({
      title: `${category} Book ${i + 1}`,
      author: `${randomElement(TANZANIAN_FIRST_NAMES)} ${randomElement(
        TANZANIAN_LAST_NAMES
      )}`,
      category,
      description: `Comprehensive ${category.toLowerCase()} textbook for students`,
      price: randomNumber(5000, 50000),
      language: "english", // MongoDB text search only supports specific languages
      isActive: true,
      uploadedBy: uploader._id,
    });

    books.push(book);
    progressBar(i + 1, SEED_CONFIG.books, "Books");
  }

  console.log(`✅ Created ${books.length} books`);
  return books;
}

async function seedBusinesses(users, locations) {
  console.log(`\n🏢 Seeding ${SEED_CONFIG.businesses} businesses...`);

  const businesses = [];
  const entrepreneurs = users.filter((u) => u.role === "student").slice(0, 10);
  const { regions, districts } = locations;

  for (let i = 0; i < SEED_CONFIG.businesses; i++) {
    const entrepreneur = entrepreneurs[i] || randomElement(entrepreneurs);
    const businessType = randomElement(BUSINESS_TYPES);
    const region = randomElement(regions);
    const districtOptions = districts.filter(
      (d) => d.regionId.toString() === region._id.toString()
    );

    if (districtOptions.length === 0) {
      console.warn(
        `⚠️  No districts for region ${region.name}, skipping business ${i + 1}`
      );
      continue;
    }

    const district = randomElement(districtOptions);

    const business = await Business.create({
      name: `${businessType} Business ${i + 1}`,
      businessType,
      ownerId: entrepreneur._id,
      regionId: region._id,
      districtId: district._id,
      status: "active",
      isVerified: Math.random() > 0.5,
    });

    businesses.push(business);
    progressBar(i + 1, SEED_CONFIG.businesses, "Businesses");
  }

  console.log(`✅ Created ${businesses.length} businesses`);
  return businesses;
}

async function seedProducts(businesses) {
  console.log("\n🛍️ Seeding products...");

  const products = [];
  const totalProducts = businesses.length * SEED_CONFIG.productsPerBusiness;
  let productCount = 0;

  for (const business of businesses) {
    for (let i = 0; i < SEED_CONFIG.productsPerBusiness; i++) {
      const productType = randomElement(["product", "service"]);

      const product = await Product.create({
        name: `${business.businessType} ${
          productType.charAt(0).toUpperCase() + productType.slice(1)
        } ${i + 1}`,
        businessId: business._id,
        type: productType,
        price: randomNumber(1000, 100000),
        description: `Quality ${productType} from ${business.name}`,
        isActive: true,
      });

      products.push(product);
      productCount++;
      progressBar(productCount, totalProducts, "Products");
    }
  }

  console.log(`✅ Created ${products.length} products`);
  return products;
}

// ============================================
// MAIN EXECUTION
// ============================================

async function clearDatabase() {
  console.log("\n🗑️  Clearing existing data...");

  await Promise.all([
    User.deleteMany({}),
    School.deleteMany({}),
    Region.deleteMany({}),
    District.deleteMany({}),
    Ward.deleteMany({}),
    Talent.deleteMany({}),
    Subject.deleteMany({}),
    Event.deleteMany({}),
    Book.deleteMany({}),
    Business.deleteMany({}),
    Product.deleteMany({}),
    StudentTalent.deleteMany({}),
  ]);

  console.log("✅ Database cleared");
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("🚀 ECONNECT ULTIMATE SEED SCRIPT");
  console.log("   Optimized with Embedded Location Data");
  console.log("   Version 3.1.0 - Ultra Performance Edition");
  console.log("═══════════════════════════════════════════════════════");

  try {
    // Connect to MongoDB
    console.log("\n📡 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ Connected to: ${mongoose.connection.name}`);

    // Clear existing data
    await clearDatabase();

    // Seed locations FIRST (directly to database, no API calls!)
    const locations = await seedLocations();

    // Seed all other data
    const superAdmin = await seedSuperAdmin();
    const talents = await seedTalents();
    const subjects = await seedSubjects();
    const schools = await seedSchools(locations);
    const users = await seedUsers(schools, locations);
    const studentTalents = await seedStudentTalents(
      users.filter((u) => u.role === "student"),
      talents
    );
    const events = await seedEvents(schools, users, locations);
    const books = await seedBooks(users);
    const businesses = await seedBusinesses(users, locations);
    const products = await seedProducts(businesses);

    // Summary
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("✅ SEED COMPLETED SUCCESSFULLY!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("📊 SUMMARY:");
    console.log(`   🌍 Regions: ${locations.regions.length}`);
    console.log(`   🏘️  Districts: ${locations.districts.length}`);
    console.log(`   📍 Wards: ${locations.wards.length}`);
    console.log(`   🏫 Schools: ${schools.length}`);
    console.log(`   👥 Users: ${users.length}`);
    console.log(
      `      - Students: ${users.filter((u) => u.role === "student").length}`
    );
    console.log(
      `      - Teachers: ${users.filter((u) => u.role === "teacher").length}`
    );
    console.log(
      `      - Staff: ${
        users.filter((u) => u.role === "district_official").length
      }`
    );
    console.log(`   🎨 Talents: ${talents.length}`);
    console.log(`   📚 Subjects: ${subjects.length}`);
    console.log(`   🎯 Student-Talent Assignments: ${studentTalents.length}`);
    console.log(`   📅 Events: ${events.length}`);
    console.log(`   📖 Books: ${books.length}`);
    console.log(`   🏢 Businesses: ${businesses.length}`);
    console.log(`   🛍️  Products: ${products.length}`);
    console.log("═══════════════════════════════════════════════════════");
    console.log("\n🔐 DEFAULT CREDENTIALS:");
    console.log("   Super Admin:");
    console.log("      Username: superadmin");
    console.log("      Password: admin123");
    console.log("\n   Students:");
    console.log("      Username: student0001, student0002, etc.");
    console.log("      Password: student123");
    console.log("\n   Teachers:");
    console.log("      Username: teacher0001, teacher0002, etc.");
    console.log("      Password: teacher123");
    console.log("\n   Staff:");
    console.log("      Username: staff0001, staff0002, etc.");
    console.log("      Password: staff123");
    console.log("═══════════════════════════════════════════════════════");
    console.log("\n🎉 You can now start your backend server!");
    console.log("   Run: npm start");
    console.log("═══════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ SEED FAILED:");
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
