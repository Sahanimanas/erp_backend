import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const missingVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar]
);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}`
  );
}

export const config = {
  // Server
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Database
  databaseUrl: process.env.DATABASE_URL!,

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
  },

  // Storage
  storage: {
    r2: {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucketName: process.env.R2_BUCKET_NAME || 'school-erp-files',
      publicUrl: process.env.R2_PUBLIC_URL || 'https://files.schoolerp.com',
    },
    s3: {
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      bucket: process.env.AWS_S3_BUCKET,
    },
  },

  // Email
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'noreply@schoolerp.com',
  },

  // SMS
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // Domain
  domain: {
    platform: process.env.PLATFORM_DOMAIN || 'globalschoolmitra.com',
    apiVersion: process.env.API_VERSION || 'v1',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Pagination
  pagination: {
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
    maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100', 10),
  },

  // File Upload
  fileUpload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
    maxFiles: parseInt(process.env.MAX_UPLOAD_FILES || '10', 10),
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,pdf,doc,docx,xls,xlsx').split(','),
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  },

  // Cloudinary (image/asset hosting)
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'school-erp',
    get configured() {
      return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      );
    },
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // Debugging
  debug: process.env.DEBUG === 'true',

  // Environment checks
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

export default config;
