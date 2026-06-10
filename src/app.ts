import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from '@config/environment';
import { tenantMiddleware, requireSchool, schoolIsolation } from '@common/middleware/tenant';
import { authenticate, requireAuth } from '@common/middleware/auth';

// ─────────────────────────────────────────────────────────────────────────
// GLOBAL BigInt JSON SERIALIZATION
// Prisma returns BigInt for money/size columns (salaries, fee amounts, storage).
// JSON.stringify throws on BigInt by default, which crashes any endpoint that
// returns such a model. Serialize BigInt as a JS number (safe for all values
// in this domain, which are well below Number.MAX_SAFE_INTEGER).
// ─────────────────────────────────────────────────────────────────────────
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();

// ─────────────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────

app.use(helmet());

// FRONTEND_URL may be a comma-separated list of allowed origins.
const allowedOrigins = [
  ...(config.frontendUrl || '').split(',').map((s) => s.trim()),
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

// The platform root domain — every tenant subdomain (www, dps, …) is allowed.
const ROOT_DOMAIN = config.domain.platform; // e.g. globalschoolmitra.com

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Render health checks)
      if (!origin) return callback(null, true);
      let host = '';
      try { host = new URL(origin).hostname; } catch { /* ignore */ }
      const allowed =
        allowedOrigins.some((o) => origin === o) ||
        origin.endsWith('.vercel.app') ||
        host === ROOT_DOMAIN ||
        host.endsWith(`.${ROOT_DOMAIN}`); // www. / dps. / any tenant subdomain
      if (allowed) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// ─────────────────────────────────────────────────────────────────────────
// LOGGING MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────

if (config.isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ─────────────────────────────────────────────────────────────────────────
// BODY PARSING MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES (No auth required, before middleware)
// ─────────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API version info
app.get(`/api/${config.domain.apiVersion}`, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'School ERP API',
    version: config.domain.apiVersion,
    timestamp: new Date().toISOString(),
  });
});

// Module routes will be imported here
import authRoutes from '@modules/auth/routes';
import dashboardRoutes from '@modules/dashboard/routes';
import schoolRoutes from '@modules/school/routes';
import adminRoutes from '@modules/admin/routes';
import academicRoutes from '@modules/academic/routes';
import studentRoutes from '@modules/student/routes';
import sectionRoutes from '@modules/section/routes';
import parentRoutes from '@modules/parent/routes';
import employeeRoutes from '@modules/employee/routes';
import attendanceRoutes from '@modules/attendance/routes';
import feesRoutes from '@modules/fees/routes';
import accountingRoutes from '@modules/accounting/routes';
import examsRoutes from '@modules/exams/routes';
import timetableRoutes from '@modules/timetable/routes';
import notificationRoutes from '@modules/notifications/routes';
import admissionRoutes from '@modules/admission/routes';
import feeMgmtRoutes from '@modules/feemgmt/routes';
import paymentsRoutes from '@modules/payments/routes';
import uploadRoutes from '@modules/upload/routes';

// Auth routes (public, no school context needed)
app.use(`/api/${config.domain.apiVersion}/auth`, authRoutes);

// ─────────────────────────────────────────────────────────────────────────
// MULTI-TENANT & AUTHENTICATION MIDDLEWARE (for protected routes)
// ─────────────────────────────────────────────────────────────────────────

app.use(tenantMiddleware);
app.use(schoolIsolation);
app.use(`/api/${config.domain.apiVersion}`, authenticate);

// Protected routes (require school context & auth)
app.use(`/api/${config.domain.apiVersion}/dashboard`, dashboardRoutes);
app.use(`/api/${config.domain.apiVersion}/schools`, schoolRoutes);
app.use(`/api/${config.domain.apiVersion}/admin`, adminRoutes);
app.use(`/api/${config.domain.apiVersion}/academic`, academicRoutes);
app.use(`/api/${config.domain.apiVersion}/admission`, admissionRoutes);
app.use(`/api/${config.domain.apiVersion}/fee-management`, feeMgmtRoutes);
app.use(`/api/${config.domain.apiVersion}/payments`, paymentsRoutes);
app.use(`/api/${config.domain.apiVersion}/students`, studentRoutes);
app.use(`/api/${config.domain.apiVersion}/sections`, sectionRoutes);
app.use(`/api/${config.domain.apiVersion}/parents`, parentRoutes);
app.use(`/api/${config.domain.apiVersion}/employees`, employeeRoutes);
app.use(`/api/${config.domain.apiVersion}/attendance`, attendanceRoutes);
app.use(`/api/${config.domain.apiVersion}/fees`, feesRoutes);
app.use(`/api/${config.domain.apiVersion}/accounting`, accountingRoutes);
app.use(`/api/${config.domain.apiVersion}/exams`, examsRoutes);
app.use(`/api/${config.domain.apiVersion}/timetable`, timetableRoutes);
app.use(`/api/${config.domain.apiVersion}/notifications`, notificationRoutes);
app.use(`/api/${config.domain.apiVersion}/uploads`, uploadRoutes);

// ─────────────────────────────────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────────────────────────────────

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
});

// Global error handler
app.use(
  (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Global error handler:', err);

    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
      success: false,
      error: message,
      ...(config.isDevelopment && { stack: err.stack }),
    });
  }
);

export default app;
