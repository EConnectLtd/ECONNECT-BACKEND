# ECONNECT Backend API

Multi-School & Talent Management System for Tanzania

## 🚀 Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` and set your configuration**

4. **Seed the database:**
   ```bash
   npm run seed
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

   The API will be available at `http://localhost:3001`

### Production Deployment (Render)

See the deployment guide in `DEPLOYMENT.md`

## 📚 API Documentation

### Base URL
- **Development:** `http://localhost:3001`
- **Production:** `https://your-app.onrender.com`

### Health Check
```
GET /api/health
```

### Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Main Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - User logout

#### Student APIs
- `GET /api/student/profile` - Get student profile
- `GET /api/student/announcements` - Get announcements
- `GET /api/student/events` - Get events
- `GET /api/student/timetable` - Get timetable
- `GET /api/student/invoices` - Get invoices
- `GET /api/student/ctm-membership` - Get CTM membership
- `GET /api/student/awards` - Get awards
- `POST /api/student/talents` - Update talents
- `GET /api/student/rankings` - Get student rankings

#### Teacher APIs
- `GET /api/teacher/profile` - Get teacher profile
- `GET /api/teacher/classes` - Get assigned classes
- `POST /api/teacher/classes` - Create new class
- `GET /api/teacher/classes/:id/students` - Get class students
- `POST /api/teacher/classes/:id/attendance` - Save attendance
- `GET /api/teacher/assignments` - Get assignments
- `POST /api/teacher/assignments` - Create assignment
- `POST /api/teacher/submissions/:id/grade` - Grade submission
- `POST /api/teacher/messages/bulk` - Send bulk messages

#### Admin APIs
- `GET /api/admin/dashboard` - Get admin dashboard
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users` - Create user
- `GET /api/admin/schools` - Get all schools
- `POST /api/admin/schools` - Create school
- `GET /api/admin/analytics` - Get analytics
- `GET /api/admin/audit` - Get audit logs

## 🔧 Environment Variables

See `.env.example` for all available configuration options.

Required variables:
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - Secret key for JWT tokens
- `DATABASE_URL` - SQLite database path
- `NODE_ENV` - Environment (development/production)

## 📦 Database

This project uses SQLite for data storage. The database is automatically created when you run the seed script.

### Database Schema

The database includes the following main tables:
- `users` - All system users (students, teachers, admins, etc.)
- `schools` - School information
- `classes` - Class/subject information
- `enrollments` - Student-class relationships
- `attendance` - Attendance records
- `assignments` - Assignment information
- `submissions` - Student assignment submissions
- `exams` - Exam information
- `grades` - Student grades
- `announcements` - System announcements
- `events` - School events
- `messages` - Communication messages
- `invoices` - Payment invoices
- `talents` - Student talent registrations
- `awards` - Student awards and achievements

## 🛡️ Security

- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Input validation
- SQL injection prevention
- Rate limiting (configurable)

## 📝 Test Credentials

After seeding, you can login with:

**System Admin:**
- Username: `admin`
- Password: `admin123`

**School Admin:**
- Username: `schooladmin1`
- Password: `password123`

**Headmaster:**
- Username: `headmaster1`
- Password: `password123`

**Teacher:**
- Username: `teacher1`
- Password: `password123`

**Student:**
- Username: `student1`
- Password: `password123`

**Parent:**
- Username: `parent1`
- Password: `password123`

**Entrepreneur:**
- Username: `entrepreneur1`
- Password: `password123`

## 🤝 Support

For support, email support@econnect.co.tz or visit our help center.

## 📄 License

MIT License - see LICENSE file for details

---

Built with ❤️ in Tanzania 🇹🇿
