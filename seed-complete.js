// ============================================
// ECONNECT COMPLETE SYSTEM SEED FILE
// Seeds all essential data for testing and demo
// Version: 1.0.0
// ============================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/econnect';

// ============================================
// MONGOOSE SCHEMAS (Copy from server.js)
// ============================================

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: String,
  firstName: String,
  lastName: String,
  phoneNumber: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward' },
  regionName: String,
  districtName: String,
  wardName: String,
  isActive: { type: Boolean, default: true },
  profileImage: String,
  gender: String,
  dateOfBirth: Date,
  gradeLevel: String,
  course: String,
  registration_type: String,
  registration_date: Date,
  is_ctm_student: Boolean,
  subjects: [String],
  businessName: String,
  businessType: String,
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

const schoolSchema = new mongoose.Schema({
  name: String,
  schoolCode: String,
  type: String,
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
  address: String,
  phoneNumber: String,
  email: String,
  principalName: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const regionSchema = new mongoose.Schema({
  name: String,
  code: String,
  isActive: { type: Boolean, default: true }
});

const districtSchema = new mongoose.Schema({
  name: String,
  code: String,
  regionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
  isActive: { type: Boolean, default: true }
});

const wardSchema = new mongoose.Schema({
  name: String,
  code: String,
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
  isActive: { type: Boolean, default: true }
});

const talentSchema = new mongoose.Schema({
  name: String,
  category: String,
  description: String,
  isActive: { type: Boolean, default: true }
});

const subjectSchema = new mongoose.Schema({
  name: String,
  code: String,
  category: String,
  isActive: { type: Boolean, default: true }
});

const gradeSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subject: String,
  score: Number,
  grade: String,
  examType: String,
  academicYear: String,
  term: String,
  createdAt: { type: Date, default: Date.now }
});

const attendanceRecordSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  date: Date,
  status: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const assignmentSchema = new mongoose.Schema({
  title: String,
  description: String,
  subject: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  dueDate: Date,
  totalMarks: Number,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  eventType: String,
  startDate: Date,
  endDate: Date,
  location: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  status: String,
  maxParticipants: Number,
  createdAt: { type: Date, default: Date.now }
});

const bookSchema = new mongoose.Schema({
  title: String,
  author: String,
  category: String,
  description: String,
  price: Number,
  coverImage: String,
  isActive: { type: Boolean, default: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const businessSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  businessType: String,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const announcementSchema = new mongoose.Schema({
  title: String,
  content: String,
  priority: String,
  targetAudience: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  publishDate: Date
});

const ctmMembershipSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  membershipNumber: String,
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  status: String,
  membershipType: String,
  joinDate: Date
});

// Models
const User = mongoose.model('User', userSchema);
const School = mongoose.model('School', schoolSchema);
const Region = mongoose.model('Region', regionSchema);
const District = mongoose.model('District', districtSchema);
const Ward = mongoose.model('Ward', wardSchema);
const Talent = mongoose.model('Talent', talentSchema);
const Subject = mongoose.model('Subject', subjectSchema);
const Grade = mongoose.model('Grade', gradeSchema);
const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);
const Assignment = mongoose.model('Assignment', assignmentSchema);
const Event = mongoose.model('Event', eventSchema);
const Book = mongoose.model('Book', bookSchema);
const Business = mongoose.model('Business', businessSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const CTMMembership = mongoose.model('CTMMembership', ctmMembershipSchema);

// ============================================
// SEED DATA
// ============================================

const seedData = {
  // Regions (28 regions)
  regions: [
    { name: 'ARUSHA', code: 'AR' },
    { name: 'DAR-ES-SALAAM', code: 'DSM' },
    { name: 'DODOMA', code: 'DO' },
    { name: 'GEITA', code: 'GE' },
    { name: 'IRINGA', code: 'IR' },
    { name: 'KAGERA', code: 'KA' },
    { name: 'KATAVI', code: 'KT' },
    { name: 'KIGOMA', code: 'KI' },
    { name: 'KILIMANJARO', code: 'KJ' },
    { name: 'LINDI', code: 'LI' },
    { name: 'MANYARA', code: 'MY' },
    { name: 'MARA', code: 'MR' },
    { name: 'MBEYA', code: 'MB' },
    { name: 'MOROGORO', code: 'MO' },
    { name: 'MTWARA', code: 'MT' },
    { name: 'MWANZA', code: 'MW' },
    { name: 'NJOMBE', code: 'NJ' },
    { name: 'PWANI', code: 'PW' },
    { name: 'RUKWA', code: 'RK' },
    { name: 'RUVUMA', code: 'RV' },
    { name: 'SHINYANGA', code: 'SH' },
    { name: 'SIMIYU', code: 'SI' },
    { name: 'SINGIDA', code: 'SG' },
    { name: 'SONGWE', code: 'SO' },
    { name: 'TABORA', code: 'TB' },
    { name: 'TANGA', code: 'TG' }
  ],

  // Districts (sample for key regions)
  districts: [
    { name: 'ILALA', code: 'ILL', regionName: 'DAR-ES-SALAAM' },
    { name: 'KINONDONI', code: 'KIN', regionName: 'DAR-ES-SALAAM' },
    { name: 'TEMEKE', code: 'TEM', regionName: 'DAR-ES-SALAAM' },
    { name: 'ARUSHA', code: 'ARU', regionName: 'ARUSHA' },
    { name: 'MOSHI', code: 'MOS', regionName: 'KILIMANJARO' },
    { name: 'MWANZA', code: 'MWN', regionName: 'MWANZA' },
    { name: 'DODOMA', code: 'DOD', regionName: 'DODOMA' },
    { name: 'MBEYA', code: 'MBE', regionName: 'MBEYA' }
  ],

  // Wards (sample)
  wards: [
    { name: 'MCHIKICHINI', code: 'MCH', districtName: 'ILALA' },
    { name: 'KARIAKOO', code: 'KAR', districtName: 'ILALA' },
    { name: 'KINONDONI', code: 'KIN', districtName: 'KINONDONI' },
    { name: 'MIKOCHENI', code: 'MIK', districtName: 'KINONDONI' }
  ],

  // Subjects (comprehensive list)
  subjects: [
    { name: 'Mathematics', code: 'MATH', category: 'Science' },
    { name: 'Physics', code: 'PHY', category: 'Science' },
    { name: 'Chemistry', code: 'CHEM', category: 'Science' },
    { name: 'Biology', code: 'BIO', category: 'Science' },
    { name: 'Computer Science', code: 'CS', category: 'Science' },
    { name: 'English', code: 'ENG', category: 'Languages' },
    { name: 'Kiswahili', code: 'KIS', category: 'Languages' },
    { name: 'History', code: 'HIST', category: 'Social Studies' },
    { name: 'Geography', code: 'GEO', category: 'Social Studies' },
    { name: 'Civics', code: 'CIV', category: 'Social Studies' },
    { name: 'Commerce', code: 'COM', category: 'Business' },
    { name: 'Accounting', code: 'ACC', category: 'Business' },
    { name: 'Book Keeping', code: 'BK', category: 'Business' }
  ],

  // Talents (24 categories)
  talents: [
    { name: 'Music', category: 'Performing Arts', description: 'Singing, instruments, and music production' },
    { name: 'Dance', category: 'Performing Arts', description: 'Traditional and modern dance styles' },
    { name: 'Acting and Drama', category: 'Performing Arts', description: 'Stage and screen performance' },
    { name: 'Comedy', category: 'Performing Arts', description: 'Stand-up comedy and entertainment' },
    { name: 'Visual Art and Design', category: 'Visual Arts & Media', description: 'Drawing, painting, and graphic design' },
    { name: 'Photography', category: 'Visual Arts & Media', description: 'Visual content creation' },
    { name: 'Writing and Poetry', category: 'Visual Arts & Media', description: 'Creative writing and poetry' },
    { name: 'Football', category: 'Sports & Fitness', description: 'Soccer skills and teamwork' },
    { name: 'Basketball', category: 'Sports & Fitness', description: 'Basketball techniques' },
    { name: 'Athletics', category: 'Sports & Fitness', description: 'Track and field events' },
    { name: 'Fashion Design', category: 'Fashion & Creative Industries', description: 'Clothing and accessory design' },
    { name: 'Tailoring', category: 'Fashion & Creative Industries', description: 'Professional sewing and garment making' },
    { name: 'Coding', category: 'Technology & Innovation', description: 'Software development and programming' },
    { name: 'Robotics', category: 'Technology & Innovation', description: 'Building and programming robots' },
    { name: 'Entrepreneurship', category: 'Business & Entrepreneurship', description: 'Starting and managing businesses' },
    { name: 'Marketing', category: 'Business & Entrepreneurship', description: 'Product promotion and sales' }
  ],

  // Schools (sample schools - real ones from database will be used)
  schools: [
    {
      name: 'Azania Secondary School',
      schoolCode: 'AZN001',
      type: 'secondary',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      address: 'Ilala, Dar es Salaam',
      phoneNumber: '+255 22 286 0000',
      email: 'info@azania.ac.tz',
      principalName: 'Dr. Joseph Mwinyipembe'
    },
    {
      name: 'Jangwani Secondary School',
      schoolCode: 'JNG001',
      type: 'secondary',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      address: 'Jangwani, Dar es Salaam',
      phoneNumber: '+255 22 212 0000',
      email: 'info@jangwani.ac.tz',
      principalName: 'Mrs. Amina Hassan'
    },
    {
      name: 'Mwenge Primary School',
      schoolCode: 'MWE001',
      type: 'primary',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'KINONDONI',
      address: 'Mwenge, Dar es Salaam',
      phoneNumber: '+255 22 277 0000',
      email: 'info@mwenge.ac.tz',
      principalName: 'Mr. John Mushi'
    }
  ],

  // Users (all 7+ roles)
  users: [
    // Super Admin
    {
      username: 'superadmin',
      email: 'admin@econnect.co.tz',
      password: 'Admin@123',
      role: 'super_admin',
      firstName: 'System',
      lastName: 'Administrator',
      phoneNumber: '+255700000001',
      isActive: true
    },
    // National Official
    {
      username: 'national_official',
      email: 'national@tamisemi.go.tz',
      password: 'Official@123',
      role: 'national_official',
      firstName: 'Fatuma',
      lastName: 'Mohamed',
      phoneNumber: '+255700000002',
      isActive: true
    },
    // Regional Official (Dar es Salaam)
    {
      username: 'regional_dsm',
      email: 'regional.dsm@tamisemi.go.tz',
      password: 'Regional@123',
      role: 'regional_official',
      firstName: 'Hassan',
      lastName: 'Juma',
      phoneNumber: '+255700000003',
      regionName: 'DAR-ES-SALAAM',
      isActive: true
    },
    // District Official (Ilala)
    {
      username: 'district_ilala',
      email: 'district.ilala@tamisemi.go.tz',
      password: 'District@123',
      role: 'district_official',
      firstName: 'Grace',
      lastName: 'Msemwa',
      phoneNumber: '+255700000004',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    },
    // Headmaster
    {
      username: 'headmaster_azania',
      email: 'headmaster@azania.ac.tz',
      password: 'Head@123',
      role: 'headmaster',
      firstName: 'Joseph',
      lastName: 'Mwinyipembe',
      phoneNumber: '+255700000005',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    },
    // Teachers
    {
      username: 'teacher_math',
      email: 'teacher.math@azania.ac.tz',
      password: 'Teacher@123',
      role: 'teacher',
      firstName: 'Michael',
      lastName: 'Komba',
      phoneNumber: '+255700000006',
      subjects: ['Mathematics', 'Physics'],
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    },
    {
      username: 'teacher_english',
      email: 'teacher.english@azania.ac.tz',
      password: 'Teacher@123',
      role: 'teacher',
      firstName: 'Sarah',
      lastName: 'Kimaro',
      phoneNumber: '+255700000007',
      subjects: ['English', 'Kiswahili'],
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    },
    // Students
    {
      username: 'student001',
      email: 'john.doe@student.econnect.co.tz',
      password: 'Student@123',
      role: 'student',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+255700000010',
      gender: 'male',
      gradeLevel: 'Form 4',
      course: 'Science',
      registration_type: 'premier_registration',
      registration_date: new Date(),
      is_ctm_student: true,
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      wardName: 'MCHIKICHINI',
      isActive: true
    },
    {
      username: 'student002',
      email: 'jane.smith@student.econnect.co.tz',
      password: 'Student@123',
      role: 'student',
      firstName: 'Jane',
      lastName: 'Smith',
      phoneNumber: '+255700000011',
      gender: 'female',
      gradeLevel: 'Form 3',
      course: 'Arts',
      registration_type: 'normal_registration',
      registration_date: new Date(),
      is_ctm_student: true,
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    },
    {
      username: 'student003',
      email: 'mary.joseph@student.econnect.co.tz',
      password: 'Student@123',
      role: 'student',
      firstName: 'Mary',
      lastName: 'Joseph',
      phoneNumber: '+255700000012',
      gender: 'female',
      gradeLevel: 'Form 2',
      course: 'Science',
      registration_type: 'silver_registration',
      registration_date: new Date(),
      is_ctm_student: false,
      regionName: 'DAR-ES-SALAAM',
      districtName: 'KINONDONI',
      isActive: true
    },
    // Entrepreneur
    {
      username: 'entrepreneur001',
      email: 'entrepreneur@business.co.tz',
      password: 'Business@123',
      role: 'entrepreneur',
      firstName: 'David',
      lastName: 'Mwenda',
      phoneNumber: '+255700000020',
      businessName: 'TechHub Tanzania',
      businessType: 'Technology',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    },
    // Staff
    {
      username: 'staff001',
      email: 'staff@azania.ac.tz',
      password: 'Staff@123',
      role: 'staff',
      firstName: 'Peter',
      lastName: 'Masanja',
      phoneNumber: '+255700000030',
      regionName: 'DAR-ES-SALAAM',
      districtName: 'ILALA',
      isActive: true
    }
  ]
};

// ============================================
// SEED FUNCTIONS
// ============================================

async function clearDatabase() {
  console.log('🗑️  Clearing existing data...');
  await User.deleteMany({});
  await School.deleteMany({});
  await Region.deleteMany({});
  await District.deleteMany({});
  await Ward.deleteMany({});
  await Talent.deleteMany({});
  await Subject.deleteMany({});
  await Grade.deleteMany({});
  await AttendanceRecord.deleteMany({});
  await Assignment.deleteMany({});
  await Event.deleteMany({});
  await Book.deleteMany({});
  await Business.deleteMany({});
  await Announcement.deleteMany({});
  await CTMMembership.deleteMany({});
  console.log('✅ Database cleared');
}

async function seedRegions() {
  console.log('\n📍 Seeding Regions...');
  const regions = await Region.insertMany(seedData.regions);
  console.log(`✅ Created ${regions.length} regions`);
  return regions;
}

async function seedDistricts(regions) {
  console.log('\n🏘️  Seeding Districts...');
  const districtsWithRefs = seedData.districts.map(district => {
    const region = regions.find(r => r.name === district.regionName);
    return {
      ...district,
      regionId: region._id
    };
  });
  const districts = await District.insertMany(districtsWithRefs);
  console.log(`✅ Created ${districts.length} districts`);
  return districts;
}

async function seedWards(districts) {
  console.log('\n🏡 Seeding Wards...');
  const wardsWithRefs = seedData.wards.map(ward => {
    const district = districts.find(d => d.name === ward.districtName);
    return {
      ...ward,
      districtId: district._id
    };
  });
  const wards = await Ward.insertMany(wardsWithRefs);
  console.log(`✅ Created ${wards.length} wards`);
  return wards;
}

async function seedSubjects() {
  console.log('\n📚 Seeding Subjects...');
  const subjects = await Subject.insertMany(seedData.subjects);
  console.log(`✅ Created ${subjects.length} subjects`);
  return subjects;
}

async function seedTalents() {
  console.log('\n🎨 Seeding Talents...');
  const talents = await Talent.insertMany(seedData.talents);
  console.log(`✅ Created ${talents.length} talents`);
  return talents;
}

async function seedSchools(regions, districts) {
  console.log('\n🏫 Seeding Schools...');
  const schoolsWithRefs = seedData.schools.map(school => {
    const region = regions.find(r => r.name === school.regionName);
    const district = districts.find(d => d.name === school.districtName);
    return {
      ...school,
      regionId: region?._id,
      districtId: district?._id
    };
  });
  const schools = await School.insertMany(schoolsWithRefs);
  console.log(`✅ Created ${schools.length} schools`);
  return schools;
}

async function seedUsers(schools, regions, districts) {
  console.log('\n👥 Seeding Users...');
  
  // Hash passwords
  const usersWithHashedPasswords = await Promise.all(
    seedData.users.map(async user => {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      // Find school for school-based users
      let schoolId = null;
      if (user.role === 'headmaster' || user.role === 'teacher' || user.role === 'student' || user.role === 'staff') {
        const school = schools.find(s => s.districtName === user.districtName);
        schoolId = school?._id;
      }
      
      // Find region and district
      const region = regions.find(r => r.name === user.regionName);
      const district = districts.find(d => d.name === user.districtName);
      
      return {
        ...user,
        password: hashedPassword,
        schoolId,
        regionId: region?._id,
        districtId: district?._id
      };
    })
  );
  
  const users = await User.insertMany(usersWithHashedPasswords);
  console.log(`✅ Created ${users.length} users`);
  console.log('\n📋 User Credentials:');
  seedData.users.forEach(user => {
    console.log(`   ${user.role.padEnd(20)} | ${user.username.padEnd(20)} | ${user.password}`);
  });
  
  return users;
}

async function seedGrades(students, teachers, schools) {
  console.log('\n📊 Seeding Grades...');
  const grades = [];
  
  const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Kiswahili'];
  const examTypes = ['midterm', 'final', 'quiz'];
  
  for (const student of students) {
    for (const subject of subjects) {
      const teacher = teachers.find(t => t.subjects?.includes(subject)) || teachers[0];
      
      grades.push({
        studentId: student._id,
        schoolId: student.schoolId,
        teacherId: teacher._id,
        subject,
        score: Math.floor(Math.random() * 40) + 60, // 60-100
        grade: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
        examType: examTypes[Math.floor(Math.random() * examTypes.length)],
        academicYear: '2024',
        term: 'Term 1'
      });
    }
  }
  
  const createdGrades = await Grade.insertMany(grades);
  console.log(`✅ Created ${createdGrades.length} grade records`);
  return createdGrades;
}

async function seedAttendance(students, teachers, schools) {
  console.log('\n📅 Seeding Attendance...');
  const attendance = [];
  
  const statuses = ['present', 'absent', 'late', 'excused'];
  const today = new Date();
  
  for (const student of students) {
    // Last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      attendance.push({
        studentId: student._id,
        schoolId: student.schoolId,
        teacherId: teachers[0]._id,
        date,
        status: i % 5 === 0 ? 'absent' : 'present' // 80% attendance
      });
    }
  }
  
  const records = await AttendanceRecord.insertMany(attendance);
  console.log(`✅ Created ${records.length} attendance records`);
  return records;
}

async function seedAssignments(teachers, schools) {
  console.log('\n📝 Seeding Assignments...');
  const assignments = [];
  
  for (const teacher of teachers) {
    const subjects = teacher.subjects || ['General'];
    
    for (const subject of subjects) {
      assignments.push({
        title: `${subject} Homework - Week 1`,
        description: `Complete exercises on ${subject}`,
        subject,
        teacherId: teacher._id,
        schoolId: teacher.schoolId,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        totalMarks: 100,
        status: 'published'
      });
      
      assignments.push({
        title: `${subject} Project`,
        description: `Research project on ${subject}`,
        subject,
        teacherId: teacher._id,
        schoolId: teacher.schoolId,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        totalMarks: 100,
        status: 'published'
      });
    }
  }
  
  const created = await Assignment.insertMany(assignments);
  console.log(`✅ Created ${created.length} assignments`);
  return created;
}

async function seedEvents(users, schools) {
  console.log('\n🎉 Seeding Events...');
  
  const organizer = users.find(u => u.role === 'teacher' || u.role === 'headmaster');
  
  const events = [
    {
      title: 'Inter-School Sports Competition',
      description: 'Annual sports competition featuring football, basketball, and athletics',
      eventType: 'competition',
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
      location: 'National Stadium, Dar es Salaam',
      organizer: organizer._id,
      schoolId: schools[0]._id,
      status: 'published',
      maxParticipants: 200
    },
    {
      title: 'Talent Show 2024',
      description: 'Showcase your talents in music, dance, comedy, and more!',
      eventType: 'talent_show',
      startDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      location: 'School Auditorium',
      organizer: organizer._id,
      schoolId: schools[0]._id,
      status: 'published',
      maxParticipants: 50
    },
    {
      title: 'Science Fair',
      description: 'Present your science projects and innovations',
      eventType: 'exhibition',
      startDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
      location: 'Science Laboratory',
      organizer: organizer._id,
      schoolId: schools[0]._id,
      status: 'published',
      maxParticipants: 100
    }
  ];
  
  const created = await Event.insertMany(events);
  console.log(`✅ Created ${created.length} events`);
  return created;
}

async function seedBooks(users) {
  console.log('\n📖 Seeding Books...');
  
  const uploader = users.find(u => u.role === 'super_admin');
  
  const books = [
    {
      title: 'Form 4 Mathematics Guide',
      author: 'Prof. John Mwakasege',
      category: 'Education',
      description: 'Comprehensive guide for O-Level Mathematics',
      price: 15000,
      coverImage: '/uploads/books/math-cover.jpg',
      uploadedBy: uploader._id
    },
    {
      title: 'English Grammar Mastery',
      author: 'Dr. Sarah Kimaro',
      category: 'Education',
      description: 'Master English grammar with practical exercises',
      price: 12000,
      coverImage: '/uploads/books/english-cover.jpg',
      uploadedBy: uploader._id
    },
    {
      title: 'Physics Practical Handbook',
      author: 'Dr. Michael Komba',
      category: 'Education',
      description: 'Laboratory guide for physics experiments',
      price: 18000,
      coverImage: '/uploads/books/physics-cover.jpg',
      uploadedBy: uploader._id
    },
    {
      title: 'Entrepreneurship in Tanzania',
      author: 'David Mwenda',
      category: 'Business',
      description: 'Start and grow your business in Tanzania',
      price: 20000,
      coverImage: '/uploads/books/business-cover.jpg',
      uploadedBy: uploader._id
    }
  ];
  
  const created = await Book.insertMany(books);
  console.log(`✅ Created ${created.length} books`);
  return created;
}

async function seedBusinesses(entrepreneurs) {
  console.log('\n🏢 Seeding Businesses...');
  
  const businesses = entrepreneurs.map(entrepreneur => ({
    ownerId: entrepreneur._id,
    name: entrepreneur.businessName || 'My Business',
    businessType: entrepreneur.businessType || 'General',
    description: `${entrepreneur.businessName} - Providing quality services`,
    status: 'active'
  }));
  
  const created = await Business.insertMany(businesses);
  console.log(`✅ Created ${created.length} businesses`);
  return created;
}

async function seedAnnouncements(users, schools) {
  console.log('\n📢 Seeding Announcements...');
  
  const headmaster = users.find(u => u.role === 'headmaster');
  
  const announcements = [
    {
      title: 'Welcome to New Academic Year 2024',
      content: 'We welcome all students to the new academic year. Classes begin on January 15th.',
      priority: 'high',
      targetAudience: 'all',
      schoolId: schools[0]._id,
      createdBy: headmaster._id,
      publishDate: new Date()
    },
    {
      title: 'Sports Day Registration Open',
      content: 'Register for the annual sports day. Registration closes on February 1st.',
      priority: 'normal',
      targetAudience: 'students',
      schoolId: schools[0]._id,
      createdBy: headmaster._id,
      publishDate: new Date()
    },
    {
      title: 'Parent-Teacher Meeting',
      content: 'All parents are invited to the quarterly meeting on January 20th at 2 PM.',
      priority: 'high',
      targetAudience: 'all',
      schoolId: schools[0]._id,
      createdBy: headmaster._id,
      publishDate: new Date()
    }
  ];
  
  const created = await Announcement.insertMany(announcements);
  console.log(`✅ Created ${created.length} announcements`);
  return created;
}

async function seedCTMMemberships(students, schools) {
  console.log('\n🎖️  Seeding CTM Memberships...');
  
  const ctmStudents = students.filter(s => s.is_ctm_student);
  
  const memberships = ctmStudents.map((student, index) => ({
    studentId: student._id,
    membershipNumber: `CTM-2024-${String(index + 1).padStart(6, '0')}`,
    schoolId: student.schoolId,
    status: 'active',
    membershipType: student.registration_type === 'premier_registration' ? 'premium' : 'basic',
    joinDate: student.registration_date || new Date()
  }));
  
  const created = await CTMMembership.insertMany(memberships);
  console.log(`✅ Created ${created.length} CTM memberships`);
  return created;
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedDatabase() {
  try {
    console.log('🌱 Starting ECONNECT Database Seeding...\n');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');
    
    // Clear existing data
    await clearDatabase();
    
    // Seed in order (respecting dependencies)
    const regions = await seedRegions();
    const districts = await seedDistricts(regions);
    const wards = await seedWards(districts);
    const subjects = await seedSubjects();
    const talents = await seedTalents();
    const schools = await seedSchools(regions, districts);
    const users = await seedUsers(schools, regions, districts);
    
    // Separate users by role
    const students = users.filter(u => u.role === 'student');
    const teachers = users.filter(u => u.role === 'teacher');
    const entrepreneurs = users.filter(u => u.role === 'entrepreneur');
    
    // Seed dependent data
    await seedGrades(students, teachers, schools);
    await seedAttendance(students, teachers, schools);
    await seedAssignments(teachers, schools);
    await seedEvents(users, schools);
    await seedBooks(users);
    await seedBusinesses(entrepreneurs);
    await seedAnnouncements(users, schools);
    await seedCTMMemberships(students, schools);
    
    console.log('\n✅ ============================================');
    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('✅ ============================================\n');
    
    console.log('📊 Summary:');
    console.log(`   - Regions: ${regions.length}`);
    console.log(`   - Districts: ${districts.length}`);
    console.log(`   - Wards: ${wards.length}`);
    console.log(`   - Subjects: ${subjects.length}`);
    console.log(`   - Talents: ${talents.length}`);
    console.log(`   - Schools: ${schools.length}`);
    console.log(`   - Users: ${users.length}`);
    console.log(`   - Students: ${students.length}`);
    console.log(`   - Teachers: ${teachers.length}`);
    console.log('\n🎯 You can now login with the credentials shown above!\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
    process.exit(0);
  }
}

// Run seeding
seedDatabase();
