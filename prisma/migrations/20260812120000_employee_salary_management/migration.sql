-- Employee Salary Management
-- Strictly additive: two brand-new tables. No existing column is dropped,
-- retyped or narrowed; no data is deleted or rewritten.

-- 1. Department-wide monthly salary template (one row per department).
CREATE TABLE IF NOT EXISTS "DepartmentSalary" (
  "id"           TEXT NOT NULL,
  "schoolId"     TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "basicSalary"  BIGINT NOT NULL,
  "allowances"   BIGINT NOT NULL DEFAULT 0,
  "deductions"   BIGINT NOT NULL DEFAULT 0,
  "remarks"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentSalary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentSalary_departmentId_key" ON "DepartmentSalary"("departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentSalary_schoolId_idx" ON "DepartmentSalary"("schoolId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DepartmentSalary_departmentId_fkey') THEN
    ALTER TABLE "DepartmentSalary" ADD CONSTRAINT "DepartmentSalary_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- 2. Salary disbursements. One row covers one or more months of a single year;
--    the per-month rate is frozen on the row so later structure edits never
--    rewrite payment history.
CREATE TABLE IF NOT EXISTS "SalaryPayment" (
  "id"            TEXT NOT NULL,
  "schoolId"      TEXT NOT NULL,
  "employeeId"    TEXT NOT NULL,
  "year"          INTEGER NOT NULL,
  "months"        INTEGER[],
  "monthCount"    INTEGER NOT NULL,
  "monthlySalary" BIGINT NOT NULL,
  "allowances"    BIGINT NOT NULL DEFAULT 0,
  "deductions"    BIGINT NOT NULL DEFAULT 0,
  "totalAmount"   BIGINT NOT NULL,
  "paymentMode"   TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PAID',
  "paidDate"      TIMESTAMP(3),
  "remarks"       TEXT,
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"     TIMESTAMP(3),
  CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalaryPayment_schoolId_idx"        ON "SalaryPayment"("schoolId");
CREATE INDEX IF NOT EXISTS "SalaryPayment_employeeId_idx"      ON "SalaryPayment"("employeeId");
CREATE INDEX IF NOT EXISTS "SalaryPayment_schoolId_year_idx"   ON "SalaryPayment"("schoolId", "year");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalaryPayment_employeeId_fkey') THEN
    ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
