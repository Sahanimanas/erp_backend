# School ERP SaaS - Backend

Production-grade enterprise school management system backend built with Node.js, Express, TypeScript, PostgreSQL, and Prisma.

## Quick Start

### Prerequisites

- Node.js 20.x LTS
- PostgreSQL 15+
- Redis 7+ (optional, for queue management)
- npm or yarn

### Installation

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb school_erp_saas

   # Or if using pgAdmin or another tool, create a database named: school_erp_saas
   ```

4. **Run Prisma migrations**
   ```bash
   npm run prisma:migrate
   ```

5. **Seed database with default roles and permissions**
   ```bash
   npm run prisma:seed
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

The server should start on `http://localhost:3000`

## Project Structure

```
backend/
├── src/
│   ├── modules/              # Feature modules
│   │   ├── auth/             # Authentication
│   │   ├── school/           # School management
│   │   ├── student/          # Student management
│   │   ├── employee/         # Employee management
│   │   ├── fees/             # Fees management
│   │   ├── exams/            # Exam management
│   │   ├── attendance/       # Attendance tracking
│   │   ├── timetable/        # Timetable management
│   │   ├── subscription/     # Subscription management
│   │   └── admin/            # Admin operations
│   ├── common/               # Shared utilities
│   │   ├── middleware/       # Express middleware
│   │   ├── database/         # Prisma client
│   │   ├── queue/            # BullMQ setup
│   │   ├── storage/          # File storage (R2/S3)
│   │   └── utils/            # Utility functions
│   ├── config/               # Configuration
│   ├── types/                # TypeScript types
│   ├── app.ts                # Express app setup
│   └── server.ts             # Server entry point
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── seed.ts               # Database seeding
│   └── migrations/           # Database migrations
├── tests/                    # Test files
├── .env.example              # Example environment variables
├── package.json
└── tsconfig.json
```

## Architecture

### Multi-Tenant Architecture

The system uses **subdomain-based multi-tenancy**:

- **Platform Domain**: `schoolerp.com`
- **School Subdomains**: `school-name.schoolerp.com`
- **Custom Domains**: Supported per school

### Database Isolation

Every table with tenant data includes a `schoolId` field:
- All queries automatically filter by `schoolId`
- Tenant isolation middleware prevents cross-school access
- Soft deletes for data preservation

### Authentication & Authorization

- **JWT-based authentication** with access + refresh tokens
- **Role-Based Access Control (RBAC)**
  - 7 default roles: SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL, TEACHER, ACCOUNTANT, STUDENT, PARENT
  - Fine-grained permissions system
  - Dynamic permission assignment per role

### Module Structure

Each module follows this pattern:

```
module/
├── controller.ts    # HTTP request handlers
├── service.ts       # Business logic
├── repository.ts    # Database queries (when needed)
├── types.ts         # TypeScript interfaces
├── validation.ts    # Input validation
└── routes.ts        # Express routes
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/change-password` - Change password

### Schools
- `GET /api/v1/schools` - Get current school details
- `POST /api/v1/schools` - Create school (SUPER_ADMIN only)
- `PUT /api/v1/schools/:id` - Update school
- `DELETE /api/v1/schools/:id` - Delete school

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "message": "Optional additional context"
}
```

## Security Features

- ✅ Helmet.js for HTTP header security
- ✅ CORS configuration
- ✅ Rate limiting
- ✅ Input validation & sanitization
- ✅ Password hashing (bcrypt)
- ✅ JWT token rotation
- ✅ Refresh token revocation
- ✅ Audit logging
- ✅ SQL injection prevention (Prisma)
- ✅ XSS protection

## Database

### Setup PostgreSQL

**Using PostgreSQL locally:**

```bash
# Windows (using PostgreSQL installer)
# Installation creates a 'postgres' user with password you set

# Or using WSL:
sudo apt-get install postgresql
sudo service postgresql start

# Create database
psql -U postgres
CREATE DATABASE school_erp_saas;
\q
```

**Using Docker:**

```bash
docker run --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=school_erp_saas \
  -p 5432:5432 \
  -d postgres:15
```

### Prisma Migrations

```bash
# Create new migration
npm run prisma:migrate -- --name migration_name

# Apply migrations
npm run prisma:migrate:prod

# View database
npx prisma studio
```

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Run tests
npm test

# Run tests with coverage
npm test:cov

# Database operations
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:seed      # Seed database

# View database
npx prisma studio       # Opens database GUI at http://localhost:5555
```

## Environment Variables

All configuration is managed through `.env`:

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` - JWT secret key
- `JWT_REFRESH_SECRET` - Refresh token secret
- `FRONTEND_URL` - Frontend URL for CORS
- `REDIS_URL` - Redis connection (optional)

## API Documentation

### Error Codes

- `400` - Bad Request (validation failed)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Request Headers

All protected endpoints require:

```
Authorization: Bearer <access_token>
Host: school-slug.schoolerp.com
```

## Performance Optimization

- Database indexes on critical columns (schoolId, email, createdAt)
- Pagination support (20 items default, max 100)
- Redis caching (when configured)
- Query optimization
- Connection pooling via Prisma

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test auth.test.ts

# Watch mode
npm test -- --watch

# Coverage report
npm test:cov
```

## Deployment

### Docker

```bash
docker build -t school-erp-backend .
docker run -p 3000:3000 --env-file .env school-erp-backend
```

### Ubuntu VPS

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Clone and setup
git clone <repo>
cd backend
npm install
npm run build
npm run prisma:migrate:prod

# Start with PM2
npm install -g pm2
pm2 start dist/server.js --name "school-erp"
pm2 startup
pm2 save
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name *.schoolerp.com schoolerp.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Contributing

- Follow the established module structure
- Use TypeScript for type safety
- Include proper error handling
- Add tests for new features
- Follow ESLint + Prettier rules

## License

Proprietary - School ERP SaaS Platform

## Support

For issues and questions, contact the development team.
