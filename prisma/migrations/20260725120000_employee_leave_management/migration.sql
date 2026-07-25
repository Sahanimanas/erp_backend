-- Employee Leave Management
-- Strictly additive: new enum value, new nullable/defaulted columns, two new
-- tables. No column is dropped, retyped or narrowed; no data is deleted.

-- 1. New leave status for cancelled applications.
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2. How often a leave type's entitlement resets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveValidity') THEN
    CREATE TYPE "LeaveValidity" AS ENUM ('MONTHLY', 'YEARLY', 'SESSION', 'ON_OCCASION');
  END IF;
END$$;

-- 3. LeaveType gains paid/unpaid, validity, enabled flag and soft delete.
ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "paid"      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "validity"  "LeaveValidity" NOT NULL DEFAULT 'YEARLY';
ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "enabled"   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeaveType" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- 4. Leave gains the holiday-adjusted day count and an action timestamp.
ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "actualDays" INTEGER;
ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "actionDate" TIMESTAMP(3);

-- Existing rows: assume no holidays fell inside them, so actual = total.
UPDATE "Leave" SET "actualDays" = "days" WHERE "actualDays" IS NULL;

-- 5. Per-employee entitlement overrides.
CREATE TABLE IF NOT EXISTS "LeaveAssignment" (
  "id"          TEXT NOT NULL,
  "schoolId"    TEXT NOT NULL,
  "employeeId"  TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveAssignment_employeeId_leaveTypeId_key" ON "LeaveAssignment"("employeeId", "leaveTypeId");
CREATE INDEX IF NOT EXISTS "LeaveAssignment_schoolId_idx"    ON "LeaveAssignment"("schoolId");
CREATE INDEX IF NOT EXISTS "LeaveAssignment_leaveTypeId_idx" ON "LeaveAssignment"("leaveTypeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveAssignment_employeeId_fkey') THEN
    ALTER TABLE "LeaveAssignment" ADD CONSTRAINT "LeaveAssignment_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveAssignment_leaveTypeId_fkey') THEN
    ALTER TABLE "LeaveAssignment" ADD CONSTRAINT "LeaveAssignment_leaveTypeId_fkey"
      FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- 6. Holiday calendar (days excluded from the actual leave count).
CREATE TABLE IF NOT EXISTS "Holiday" (
  "id"        TEXT NOT NULL,
  "schoolId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_schoolId_date_key" ON "Holiday"("schoolId", "date");
CREATE INDEX IF NOT EXISTS "Holiday_schoolId_idx" ON "Holiday"("schoolId");
