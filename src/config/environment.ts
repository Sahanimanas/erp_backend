import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const backendRoot = path.resolve(__dirname, '../..');
const resolveBackendPath = (value: string) => (
  path.isAbsolute(value) ? value : path.resolve(backendRoot, value)
);

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
    // Long-lived on purpose: sessions are not auto-terminated, so the refresh
    // token has to outlive any realistic gap between two visits. A session ends
    // when the user logs out (which revokes the token), not on a clock.
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '365d',
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
      publicUrl: (process.env.R2_PUBLIC_URL || 'https://files.schoolerp.com').replace(/\/+$/, ''),
      get configured() {
        return Boolean(
          process.env.R2_ACCOUNT_ID &&
          process.env.R2_ACCESS_KEY_ID &&
          process.env.R2_SECRET_ACCESS_KEY &&
          process.env.R2_BUCKET_NAME &&
          process.env.R2_PUBLIC_URL
        );
      },
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

  // WhatsApp (Baileys — WhatsApp Web multi-device)
  // Each school links its own number once (QR / pairing code); credentials are
  // persisted per-school under `sessionDir/<schoolId>` so the same number is
  // reused to send messages and media to many recipients.
  whatsapp: {
    sessionDir: resolveBackendPath(process.env.WHATSAPP_SESSION_DIR || 'storage/whatsapp'),
    // Friendly device name shown in WhatsApp → Linked Devices.
    deviceName: process.env.WHATSAPP_DEVICE_NAME || 'School ERP',
    // Anti-ban throttling — one serial send queue per linked number. During a
    // burst (bulk / broadcast) each send is spaced a RANDOM gap in this range
    // apart; lone interactive sends after an idle period are not delayed.
    minSendDelayMs: parseInt(process.env.WHATSAPP_MIN_SEND_DELAY_MS || '3000', 10),
    maxSendDelayMs: parseInt(process.env.WHATSAPP_MAX_SEND_DELAY_MS || '10000', 10),
    // Bulk / broadcast sends are spaced much wider (≈1 min, jittered) so a large
    // run looks human and avoids the rate-based failures WhatsApp throws when a
    // number fires many messages/PDFs back-to-back.
    bulkMinSendDelayMs: parseInt(process.env.WHATSAPP_BULK_MIN_SEND_DELAY_MS || '60000', 10),
    bulkMaxSendDelayMs: parseInt(process.env.WHATSAPP_BULK_MAX_SEND_DELAY_MS || '75000', 10),
    // Number of concurrent sends per account (WhatsApp tolerates 1–2; keep low).
    sendConcurrency: parseInt(process.env.WHATSAPP_SEND_CONCURRENCY || '1', 10),
    // Check the recipient actually has a WhatsApp account before sending.
    // WhatsApp ACCEPTS a send to an unregistered number and delivers nothing, so
    // without this a bad number is reported as sent. Escape hatch: set to
    // "false" if the lookup ever starts rejecting numbers that do work.
    verifyRecipient: (process.env.WHATSAPP_VERIFY_RECIPIENT || 'true') !== 'false',
    // Address recipients by their `@lid` identity instead of their phone JID.
    // Baileys 6.x CANNOT deliver to a `@lid` address (the send is accepted and
    // silently dropped), so this must stay false until the library is on 7.x.
    // Turn it on after that upgrade, or if sends start failing with error 463.
    preferLid: (process.env.WHATSAPP_PREFER_LID || 'false') === 'true',
    // Baileys' own log level. 'silent' in normal operation; set to 'debug' to
    // see the protocol traffic (stanzas, acks, key uploads) when diagnosing a
    // session that looks connected but isn't delivering.
    logLevel: process.env.WHATSAPP_LOG_LEVEL || 'silent',
    // Exponential backoff for a failed send: base * 2^attempt (+ jitter), capped.
    sendRetries: parseInt(process.env.WHATSAPP_SEND_RETRIES || '3', 10),
    sendRetryBaseMs: parseInt(process.env.WHATSAPP_SEND_RETRY_BASE_MS || '2000', 10),
    // Exponential backoff for reconnecting a dropped socket (never deletes creds).
    reconnectBaseMs: parseInt(process.env.WHATSAPP_RECONNECT_BASE_MS || '2000', 10),
    reconnectMaxMs: parseInt(process.env.WHATSAPP_RECONNECT_MAX_MS || '60000', 10),
    // Give up after this many consecutive failed reconnects and wait for a
    // deliberate relink. An endless reconnect loop re-registers the number over
    // and over, which WhatsApp reads as suspicious and bans for.
    reconnectMaxAttempts: parseInt(process.env.WHATSAPP_RECONNECT_MAX_ATTEMPTS || '8', 10),
    // Minimum gap between two socket-start attempts for the same school. Status
    // polling used to be able to spawn a start on every request.
    startCooldownMs: parseInt(process.env.WHATSAPP_START_COOLDOWN_MS || '15000', 10),

    // ── Volume caps (the single biggest ban lever) ─────────────────────────
    // A personal number that suddenly sends hundreds of messages a day is the
    // classic ban profile. Sends are refused once the school's number reaches
    // the daily cap, and the queue parks until the next hour once it reaches
    // the hourly one — nothing is silently dropped.
    dailySendCap: parseInt(process.env.WHATSAPP_DAILY_SEND_CAP || '400', 10),
    hourlySendCap: parseInt(process.env.WHATSAPP_HOURLY_SEND_CAP || '60', 10),
    // Warm-up: a freshly linked number starts at `warmupStartCap` messages/day
    // and ramps to the full cap over `warmupDays`. New numbers are the ones
    // WhatsApp blocks fastest, so the first week is deliberately conservative.
    warmupDays: parseInt(process.env.WHATSAPP_WARMUP_DAYS || '7', 10),
    warmupStartCap: parseInt(process.env.WHATSAPP_WARMUP_START_CAP || '50', 10),
    // Show "typing…" for a moment before each send. Cheap, and it makes the
    // traffic pattern look like a person rather than a script.
    simulateTyping: (process.env.WHATSAPP_SIMULATE_TYPING || 'true') !== 'false',
    // Circuit breaker: after this many consecutive send failures (or any
    // explicit rate-limit error) the account stops sending for `cooldownMs`.
    // Hammering on through a rate-limit is what turns a warning into a ban.
    failureCooldownAfter: parseInt(process.env.WHATSAPP_FAILURE_COOLDOWN_AFTER || '5', 10),
    cooldownMs: parseInt(process.env.WHATSAPP_COOLDOWN_MS || '900000', 10), // 15 min
    // Drop a bulk message that repeats the exact same content to the same
    // number inside this window (double-clicked broadcasts are a spam signal).
    duplicateWindowMs: parseInt(process.env.WHATSAPP_DUPLICATE_WINDOW_MS || '300000', 10), // 5 min
    // Optional quiet hours for the BULK lane, as local hours (0–23), e.g.
    // WHATSAPP_QUIET_START=21, WHATSAPP_QUIET_END=8 holds broadcasts overnight.
    // Empty (default) = send around the clock.
    quietStartHour: process.env.WHATSAPP_QUIET_START ? parseInt(process.env.WHATSAPP_QUIET_START, 10) : null,
    quietEndHour: process.env.WHATSAPP_QUIET_END ? parseInt(process.env.WHATSAPP_QUIET_END, 10) : null,

    // ── Media / file sharing ───────────────────────────────────────────────
    // Uploaded attachments are stored per school and referenced by mediaId, so
    // a 20 MB PDF is uploaded once and reused for the whole broadcast.
    mediaDir: resolveBackendPath(process.env.WHATSAPP_MEDIA_DIR || 'storage/whatsapp-media'),
    mediaMaxBytes: parseInt(process.env.WHATSAPP_MEDIA_MAX_BYTES || String(64 * 1024 * 1024), 10),
    // Uploaded files are swept after this many days (a queued broadcast only
    // needs them for a few hours).
    mediaRetentionDays: parseInt(process.env.WHATSAPP_MEDIA_RETENTION_DAYS || '7', 10),
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
