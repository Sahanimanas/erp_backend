-- Platform billing: the ERP vendor's fixed payment QR + the payments schools
-- report against it.
--
-- Strictly additive: two brand-new tables and nothing else. No existing table,
-- column or row is touched, so a live school sees no change until the new
-- screens are opened.

CREATE TABLE IF NOT EXISTS "platform_qr" (
  "id"        TEXT NOT NULL DEFAULT 'singleton',
  "qrImage"   TEXT,
  "upiId"     TEXT,
  "payeeName" TEXT,
  "note"      TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_qr_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "platform_payments" (
  "id"         TEXT NOT NULL,
  "schoolId"   TEXT NOT NULL,
  "amount"     BIGINT NOT NULL DEFAULT 0,
  "reference"  TEXT,
  "method"     TEXT NOT NULL DEFAULT 'UPI',
  "paidDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "screenshot" TEXT,
  "note"       TEXT,
  "status"     TEXT NOT NULL DEFAULT 'REPORTED',
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "platform_payments_schoolId_idx" ON "platform_payments"("schoolId");
CREATE INDEX IF NOT EXISTS "platform_payments_paidDate_idx" ON "platform_payments"("paidDate");
CREATE INDEX IF NOT EXISTS "platform_payments_status_idx"   ON "platform_payments"("status");
