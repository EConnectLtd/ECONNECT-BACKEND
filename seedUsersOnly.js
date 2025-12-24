// ============================================
// ECONNECT USER CREDENTIALS SEEDING
// ✅ ONLY Creates User Accounts (All Roles)
// ✅ No Schools, Locations, or Other Data
// ✅ Use SuperAdmin to create schools manually
// ============================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// MongoDB Connection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/econnect";

console.log("🔗 Connecting to MongoDB...\n");

// ============================================
// USER SCHEMA
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
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  gender: String,
  employeeId: String,
  studentId: String,
  subjects: [String],
  businessName: String,
  businessType: String,
  staffPosition: String,
  department: String,
  gradeLevel: String,
  dateOfBirth: Date,
  guardianName: String,
  guardianPhone: String,
  guardianRelationship: String,
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

// ============================================
// HELPER FUNCTION
// ============================================

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// ============================================
// MAIN SEEDING FUNCTION
// ============================================

async function seedUsers() {
  try {
    console.log("🌱 SEEDING USER CREDENTIALS\n");
    console.log(
      "⚠️  This will DELETE ALL USERS and create fresh login credentials\n"
    );

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ Connected to MongoDB\n");

    // ============================================
    // 🗑️  DELETE ALL USERS
    // ============================================
    console.log("🗑️  Deleting all existing users...");
    const deletedCount = await User.deleteMany({});
    console.log(`   ❌ Deleted ${deletedCount.deletedCount} users\n`);

    const users = [];

    // ============================================
    // 👑 1. SUPER ADMIN
    // ============================================
    console.log("👑 Creating SUPER ADMIN...");
    users.push(
      await User.create({
        username: "superadmin",
        email: "admin@econnect.co.tz",
        password: await hashPassword("admin123"),
        role: "super_admin",
        firstName: "Super",
        lastName: "Administrator",
        phoneNumber: "+255700000001",
        isActive: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        gender: "male",
      })
    );
    console.log("   ✅ superadmin / admin123\n");

    // ============================================
    // 🏛️  2. TAMISEMI OFFICIALS (3)
    // ============================================
    console.log("🏛️  Creating TAMISEMI OFFICIALS...");
    for (let i = 1; i <= 3; i++) {
      users.push(
        await User.create({
          username: `tamisemi${i}`,
          email: `tamisemi${i}@tamisemi.go.tz`,
          password: await hashPassword("tamisemi123"),
          role: "tamisemi",
          firstName: "TAMISEMI",
          lastName: `Official ${i}`,
          phoneNumber: `+2557000010${i}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          staffPosition:
            i === 1
              ? "Director"
              : i === 2
              ? "Deputy Director"
              : "Education Officer",
          department: "National Education Management",
          employeeId: `TAM-${1000 + i}`,
        })
      );
    }
    console.log("   ✅ tamisemi1, tamisemi2, tamisemi3 / tamisemi123\n");

    // ============================================
    // 🌍 3. NATIONAL OFFICIALS (2)
    // ============================================
    console.log("🌍 Creating NATIONAL OFFICIALS...");
    for (let i = 1; i <= 2; i++) {
      users.push(
        await User.create({
          username: `national${i}`,
          email: `national${i}@econnect.co.tz`,
          password: await hashPassword("national123"),
          role: "national_official",
          firstName: "National",
          lastName: `Official ${i}`,
          phoneNumber: `+2557000020${i}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          staffPosition: i === 1 ? "National Coordinator" : "Senior Officer",
          department: "National Operations",
          employeeId: `NAT-${1000 + i}`,
        })
      );
    }
    console.log("   ✅ national1, national2 / national123\n");

    // ============================================
    // 🏞️  4. REGIONAL OFFICIALS (5)
    // ============================================
    console.log("🏞️  Creating REGIONAL OFFICIALS...");
    for (let i = 1; i <= 5; i++) {
      users.push(
        await User.create({
          username: `regional${i}`,
          email: `regional${i}@region${i}.go.tz`,
          password: await hashPassword("regional123"),
          role: "regional_official",
          firstName: "Regional",
          lastName: `Official ${i}`,
          phoneNumber: `+2557000030${i}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          staffPosition:
            i % 2 === 0 ? "Regional Education Officer" : "Regional Coordinator",
          department: `Region ${i} Office`,
          employeeId: `REG-${1000 + i}`,
        })
      );
    }
    console.log("   ✅ regional1-5 / regional123\n");

    // ============================================
    // 🏙️  5. DISTRICT OFFICIALS (10)
    // ============================================
    console.log("🏙️  Creating DISTRICT OFFICIALS...");
    for (let i = 1; i <= 10; i++) {
      users.push(
        await User.create({
          username: `district${i}`,
          email: `district${i}@district${i}.go.tz`,
          password: await hashPassword("district123"),
          role: "district_official",
          firstName: "District",
          lastName: `Official ${i}`,
          phoneNumber: `+255700004${String(i).padStart(3, "0")}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          staffPosition:
            i % 2 === 0 ? "District Education Officer" : "District Coordinator",
          department: `District ${i} Office`,
          employeeId: `DIS-${1000 + i}`,
        })
      );
    }
    console.log("   ✅ district1-10 / district123\n");

    // ============================================
    // 👔 6. HEADMASTERS (5)
    // ============================================
    console.log("👔 Creating HEADMASTERS...");
    for (let i = 1; i <= 5; i++) {
      users.push(
        await User.create({
          username: `headmaster${i}`,
          email: `headmaster${i}@school${i}.ac.tz`,
          password: await hashPassword("headmaster123"),
          role: "headmaster",
          firstName: "Headmaster",
          lastName: `${i}`,
          phoneNumber: `+255710${String(100000 + i).padStart(6, "0")}`,
          isActive: true,
          gender: i % 3 === 0 ? "female" : "male",
          employeeId: `HEAD-${2000 + i}`,
        })
      );
    }
    console.log("   ✅ headmaster1-5 / headmaster123\n");

    // ============================================
    // 👨‍🏫 7. TEACHERS (10)
    // ============================================
    console.log("👨‍🏫 Creating TEACHERS...");
    const subjects = [
      "Mathematics",
      "English",
      "Kiswahili",
      "Physics",
      "Chemistry",
      "Biology",
      "History",
      "Geography",
    ];
    for (let i = 1; i <= 10; i++) {
      users.push(
        await User.create({
          username: `teacher${i}`,
          email: `teacher${i}@school.ac.tz`,
          password: await hashPassword("teacher123"),
          role: "teacher",
          firstName: "Teacher",
          lastName: `${i}`,
          phoneNumber: `+255730${String(100000 + i).padStart(6, "0")}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          subjects: [
            subjects[i % subjects.length],
            subjects[(i + 1) % subjects.length],
          ],
          employeeId: `TCH-${3000 + i}`,
        })
      );
    }
    console.log("   ✅ teacher1-10 / teacher123\n");

    // ============================================
    // 👥 8. STAFF (5)
    // ============================================
    console.log("👥 Creating STAFF...");
    const staffPositions = [
      "Secretary",
      "Librarian",
      "Lab Technician",
      "IT Support",
      "Accountant",
    ];
    const departments = [
      "Administration",
      "Library",
      "Laboratory",
      "ICT",
      "Finance",
    ];
    for (let i = 1; i <= 5; i++) {
      users.push(
        await User.create({
          username: `staff${i}`,
          email: `staff${i}@school.ac.tz`,
          password: await hashPassword("staff123"),
          role: "staff",
          firstName: "Staff",
          lastName: `${i}`,
          phoneNumber: `+255750${String(100000 + i).padStart(6, "0")}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          staffPosition: staffPositions[i - 1],
          department: departments[i - 1],
          employeeId: `STF-${4000 + i}`,
        })
      );
    }
    console.log("   ✅ staff1-5 / staff123\n");

    // ============================================
    // 🎓 9. STUDENTS (20)
    // ============================================
    console.log("🎓 Creating STUDENTS...");
    const gradeLevels = [
      "Standard 1",
      "Standard 5",
      "Form 1",
      "Form 2",
      "Form 3",
      "Form 4",
    ];
    for (let i = 1; i <= 20; i++) {
      users.push(
        await User.create({
          username: `student${i}`,
          email: `student${i}@gmail.com`,
          password: await hashPassword("student123"),
          role: "student",
          firstName: "Student",
          lastName: `${i}`,
          phoneNumber: `+255740${String(100000 + i).padStart(6, "0")}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          gradeLevel: gradeLevels[i % gradeLevels.length],
          studentId: `STD-${10000 + i}`,
          dateOfBirth: new Date(2008 + (i % 5), i % 12, 15),
          guardianName: `Guardian ${i}`,
          guardianPhone: `+255760${String(100000 + i).padStart(6, "0")}`,
          guardianRelationship:
            i % 3 === 0 ? "father" : i % 3 === 1 ? "mother" : "guardian",
        })
      );
    }
    console.log("   ✅ student1-20 / student123\n");

    // ============================================
    // 💼 10. ENTREPRENEURS (5)
    // ============================================
    console.log("💼 Creating ENTREPRENEURS...");
    const businessTypes = [
      "Retail",
      "Services",
      "Manufacturing",
      "Technology",
      "Education",
    ];
    for (let i = 1; i <= 5; i++) {
      users.push(
        await User.create({
          username: `entrepreneur${i}`,
          email: `entrepreneur${i}@gmail.com`,
          password: await hashPassword("entrepreneur123"),
          role: "entrepreneur",
          firstName: "Entrepreneur",
          lastName: `${i}`,
          phoneNumber: `+255770${String(100000 + i).padStart(6, "0")}`,
          isActive: true,
          gender: i % 2 === 0 ? "female" : "male",
          businessName: `Business ${i} Ltd`,
          businessType: businessTypes[i - 1],
        })
      );
    }
    console.log("   ✅ entrepreneur1-5 / entrepreneur123\n");

    // ============================================
    // 📊 FINAL SUMMARY
    // ============================================
    console.log("\n════════════════════════════════════════════════════════");
    console.log("✅ USER SEEDING COMPLETE!");
    console.log("════════════════════════════════════════════════════════\n");

    console.log("📊 TOTAL USERS CREATED: " + users.length + "\n");

    console.log("🔑 LOGIN CREDENTIALS:\n");
    console.log("┌─────────────────────────────────────────────────────┐");
    console.log("│ ROLE              │ USERNAME        │ PASSWORD       │");
    console.log("├─────────────────────────────────────────────────────┤");
    console.log("│ 👑 SuperAdmin     │ superadmin      │ admin123       │");
    console.log("│ 🏛️  TAMISEMI       │ tamisemi1       │ tamisemi123    │");
    console.log("│ 🌍 National       │ national1       │ national123    │");
    console.log("│ 🏞️  Regional       │ regional1       │ regional123    │");
    console.log("│ 🏙️  District       │ district1       │ district123    │");
    console.log("│ 👔 Headmaster     │ headmaster1     │ headmaster123  │");
    console.log("│ 👨‍🏫 Teacher        │ teacher1        │ teacher123     │");
    console.log("│ 👥 Staff          │ staff1          │ staff123       │");
    console.log("│ 🎓 Student        │ student1        │ student123     │");
    console.log("│ 💼 Entrepreneur   │ entrepreneur1   │ entrepreneur123│");
    console.log("└─────────────────────────────────────────────────────┘\n");

    console.log("💡 NEXT STEPS:\n");
    console.log("   1. Login as SuperAdmin (superadmin / admin123)");
    console.log("   2. Go to SuperAdmin Dashboard > Institutions");
    console.log("   3. Create schools manually using the UI");
    console.log("   4. Assign users to schools as needed\n");

    console.log("════════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding users:", error);
    process.exit(1);
  }
}

// ============================================
// RUN THE SEEDING
// ============================================

seedUsers();
