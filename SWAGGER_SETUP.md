# Swagger/OpenAPI Setup Guide

Complete guide for setting up and using Swagger UI documentation for the School ERP API.

---

## Quick Start

### Option 1: Static Swagger UI (Easiest)

1. **Open Swagger UI in Browser**
   ```
   Open: file:///path/to/backend/swagger-ui.html
   ```

2. **View API Documentation**
   - Interactive documentation
   - Try out endpoints
   - See request/response examples

### Option 2: Swagger UI with Express (Recommended)

Install swagger packages:
```bash
npm install swagger-ui-express swagger-jsdoc
```

Update `backend/src/app.ts`:
```typescript
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger.json';

// Add after other middleware
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerDocument, {
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    defaultModelsExpandDepth: 1,
  }
}));

// Alternative: serve swagger.json
app.get('/swagger.json', (req, res) => {
  res.sendFile('swagger.json');
});
```

Then access at:
```
http://localhost:3000/api-docs
```

### Option 3: ReDoc (Alternative Documentation)

ReDoc provides a clean, single-page documentation:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>School ERP API - ReDoc</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <redoc spec-url='./swagger.json'></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
  </body>
</html>
```

---

## API Endpoints Available

### Authentication (5 endpoints)
- **POST /auth/login** - User login
- **POST /auth/refresh** - Refresh token
- **POST /auth/logout** - Logout
- **GET /auth/me** - Current user
- **POST /auth/change-password** - Change password

### Admin (18 endpoints)
- **POST /admin/schools** - Create school
- **GET /admin/schools** - List schools
- **GET /admin/schools/{id}** - Get school
- **PUT /admin/schools/{id}** - Update school
- **DELETE /admin/schools/{id}** - Delete school
- **POST /admin/schools/{id}/activate** - Activate
- **POST /admin/schools/{id}/deactivate** - Deactivate
- **GET /admin/analytics** - Get analytics
- [+ 10 more subscription & domain endpoints]

### Academic (20 endpoints)
- **POST /academic/classes** - Create class
- **GET /academic/classes** - List classes
- **PUT /academic/classes/{id}** - Update class
- **DELETE /academic/classes/{id}** - Delete class
- **POST /academic/subjects** - Create subject
- **GET /academic/subjects** - List subjects
- [+ 14 more class, section, subject endpoints]

### Students (10 endpoints)
- **POST /students** - Create student
- **GET /students** - List students
- **GET /students/{id}** - Get student
- **PUT /students/{id}** - Update student
- **DELETE /students/{id}** - Delete student
- **POST /students/bulk-import** - Bulk import
- [+ 4 more document & profile endpoints]

### Employees (15 endpoints)
- **POST /employees** - Create employee
- **GET /employees** - List employees
- **GET /employees/{id}** - Get employee
- **PUT /employees/{id}** - Update employee
- **DELETE /employees/{id}** - Delete employee
- **POST /employees/departments** - Create department
- [+ 9 more dept, designation, leave endpoints]

### Attendance (6 endpoints)
- **POST /attendance** - Mark attendance
- **GET /attendance** - Get report
- **GET /attendance/monthly** - Monthly summary
- **GET /attendance/stats** - Statistics
- **POST /attendance/bulk-upload** - Bulk upload
- [+ 1 more endpoint]

### Fees (10 endpoints)
- **POST /fees** - Create fee
- **GET /fees** - List fees
- **POST /fees/collect** - Collect fee
- **GET /fees/pending** - Get pending fees
- **POST /fees/groups** - Create fee group
- [+ 5 more fee type, allocation, receipt endpoints]

### Exams (10 endpoints)
- **POST /exams** - Create exam
- **GET /exams** - List exams
- **POST /exams/{examId}/marks** - Enter marks
- **GET /exams/{examId}/results** - Get results
- **GET /exams/{examId}/report-card** - Report card
- [+ 5 more subject, grade, ranking endpoints]

### Timetable (7 endpoints)
- **POST /timetable/periods** - Create period
- **GET /timetable/periods** - List periods
- **POST /timetable/slots** - Create slot
- **GET /timetable/slots** - List slots
- **GET /timetable/classes/{id}** - Class schedule
- **GET /timetable/teachers/{id}** - Teacher schedule
- [+ 1 more endpoint]

### Notifications (10 endpoints)
- **POST /notifications** - Create notification
- **GET /notifications** - Get notifications
- **PUT /notifications/{id}/read** - Mark as read
- **DELETE /notifications/{id}** - Delete notification
- [+ 6 more endpoints]

---

## How to Use Swagger UI

### 1. Authenticate
1. Click "Authorize" button
2. Paste your JWT token from login
3. Click "Authorize" to set header
4. All subsequent requests will include token

### 2. Try Endpoints
1. Expand endpoint category
2. Click endpoint you want to test
3. Click "Try it out"
4. Fill in parameters/body
5. Click "Execute"
6. View response

### 3. View Examples
1. Click "Schema" section
2. See request/response schemas
3. Click "Example" to see sample data
4. Use for building client code

### 4. Check Status Codes
- **200** - Success
- **201** - Created
- **400** - Bad request
- **401** - Unauthorized
- **403** - Forbidden
- **404** - Not found
- **500** - Server error

---

## Request/Response Examples

### Login Request
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "admin@school.com",
  "password": "Password123!"
}
```

### Login Response (201)
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user-123",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@school.com",
      "role": "SCHOOL_ADMIN",
      "schoolId": "school-456"
    }
  },
  "message": "Login successful"
}
```

### Create Student Request
```bash
POST /students
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "dateOfBirth": "2010-01-15",
  "gender": "MALE",
  "sectionId": "section-123",
  "rollNumber": "001"
}
```

### Create Student Response (201)
```json
{
  "success": true,
  "data": {
    "id": "student-789",
    "schoolId": "school-456",
    "userId": "user-789",
    "rollNumber": "001",
    "sectionId": "section-123",
    "dateOfBirth": "2010-01-15",
    "gender": "MALE",
    "admissionDate": "2024-12-15T10:30:00Z"
  },
  "message": "Student created successfully"
}
```

### List Students Request
```bash
GET /students?page=1&limit=20&sectionId=section-123
Authorization: Bearer <accessToken>
```

### List Students Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "student-789",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "rollNumber": "001",
      "sectionId": "section-123"
    },
    {
      "id": "student-790",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "rollNumber": "002",
      "sectionId": "section-123"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

## Schema Definitions

### User Schema
```json
{
  "id": "uuid",
  "firstName": "string",
  "lastName": "string",
  "email": "email",
  "phone": "string",
  "role": "SUPER_ADMIN | SCHOOL_ADMIN | PRINCIPAL | TEACHER | ACCOUNTANT | STUDENT | PARENT",
  "schoolId": "uuid",
  "isActive": "boolean",
  "createdAt": "date-time"
}
```

### School Schema
```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "email": "email",
  "phone": "string",
  "address": "string",
  "city": "string",
  "state": "string",
  "country": "string",
  "logo": "uri",
  "isActive": "boolean"
}
```

### Student Schema
```json
{
  "id": "uuid",
  "schoolId": "uuid",
  "userId": "uuid",
  "rollNumber": "string",
  "sectionId": "uuid",
  "dateOfBirth": "date",
  "gender": "MALE | FEMALE | OTHER",
  "photo": "uri",
  "admissionDate": "date-time"
}
```

---

## Common Query Parameters

### Pagination
```
page=1         # Page number (default: 1)
limit=20       # Records per page (default: 20, max: 100)
```

### Filtering
```
sectionId=xxx           # Filter by section
departmentId=xxx        # Filter by department
from=2024-12-01         # Filter from date
to=2024-12-31           # Filter to date
status=PRESENT          # Filter by status
```

### Sorting
```
sortBy=name             # Sort by field
order=asc|desc          # Ascending or descending
```

---

## Authorization

### Bearer Token
All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Steps
1. Login: `POST /auth/login`
2. Get `accessToken` from response
3. Add to header: `Authorization: Bearer <token>`
4. Token expires in 15 minutes
5. Use refresh token to get new access token

### Refresh Token
```bash
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": "Error message",
  "message": "Additional context (optional)"
}
```

### Common Errors

**400 Bad Request**
```json
{
  "success": false,
  "error": "Validation failed",
  "message": "email is required"
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "error": "No token provided"
}
```

**403 Forbidden**
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": "Student not found"
}
```

**500 Server Error**
```json
{
  "success": false,
  "error": "Internal server error"
}
```

---

## Testing Workflow

### 1. Authentication Flow
1. POST /auth/login
2. Save accessToken
3. POST /auth/refresh (to test refresh)
4. GET /auth/me (to verify user)
5. POST /auth/logout

### 2. Admin Flow
1. POST /admin/schools (create)
2. GET /admin/schools (list)
3. GET /admin/schools/{id} (read)
4. PUT /admin/schools/{id} (update)
5. POST /admin/schools/{id}/activate
6. GET /admin/analytics

### 3. Student Flow
1. POST /students (create)
2. GET /students (list)
3. GET /students/{id} (read)
4. PUT /students/{id} (update)
5. POST /students/{id}/documents (add doc)
6. DELETE /students/{id} (delete)

### 4. Attendance Flow
1. POST /attendance (mark)
2. GET /attendance (report)
3. GET /attendance/monthly
4. GET /attendance/stats

### 5. Fees Flow
1. POST /fees (create)
2. POST /fees/collect (collect)
3. GET /fees/pending
4. POST /fees/groups

### 6. Exam Flow
1. POST /exams (create)
2. POST /exams/{id}/marks (enter marks)
3. GET /exams/{id}/results
4. GET /exams/{id}/report-card

---

## Tips & Tricks

### Using Swagger UI Effectively
1. **Persistent Auth**: Authorize once, all requests include token
2. **Request Samples**: Copy example JSON from schema
3. **Test Parameters**: Try different filters/pagination
4. **Check Headers**: View what headers are being sent
5. **Response Time**: See API response timing
6. **Save Requests**: Browser history saves requests

### Common Workflows
- **Bulk Operations**: Use POST endpoints with arrays
- **Pagination**: Always include page & limit
- **Filtering**: Combine multiple query params
- **Date Range**: Use from & to for reports
- **Error Debugging**: Check status code and error message

---

## Integration with Frontend

### Using Swagger for Frontend Development
1. Reference endpoint paths: `/api/v1/students`
2. Check request body schema
3. Check response data format
4. Implement error handling for status codes
5. Handle pagination in list responses
6. Store and use accessToken for all requests

### Generating Client Code
Many tools can generate client code from swagger.json:
- **OpenAPI Generator**: https://openapi-generator.tech
- **Swagger Codegen**: https://swagger.io/tools/swagger-codegen
- **ng-openapi-gen**: For Angular
- **openapi-ts**: For TypeScript

---

## Maintenance

### Updating Documentation
1. Modify `swagger.json`
2. Update schemas if needed
3. Add new endpoints
4. Update parameter docs
5. Add new examples

### Keeping in Sync
- Update whenever API changes
- Add new endpoints immediately
- Document breaking changes
- Version your API (v1, v2, etc.)
- Provide migration guide

---

## Troubleshooting

### Swagger UI Not Loading
- Check swagger.json path
- Verify CORS enabled
- Clear browser cache
- Check browser console for errors

### Authorization Not Working
- Ensure BearerAuth scheme is defined
- Token must be valid JWT
- Token must not be expired
- Include "Bearer " prefix

### Endpoint Not Showing
- Check swagger.json syntax
- Verify endpoint path matches
- Check tags are defined
- Validate schema references

### CORS Errors
- Enable CORS in app.ts
- Check origin whitelist
- Verify credentials flag

---

## Resources

- **OpenAPI 3.0 Spec**: https://spec.openapis.org/oas/v3.0.3
- **Swagger UI Docs**: https://swagger.io/tools/swagger-ui/
- **Swagger Editor**: https://editor.swagger.io
- **ReDoc Docs**: https://redoc.ly/

---

**Status**: ✅ Complete API Documentation
**Endpoints**: 111 documented
**Schemas**: 10+ defined
**Ready for**: Frontend integration, API testing, client code generation
