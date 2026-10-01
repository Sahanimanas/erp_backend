-- Mid-session promotion: carry the outstanding due forward instead of
-- re-pricing past months at the new class's rate.
--
-- Strictly additive: two new nullable/defaulted columns on "Student" and one
-- brand-new table. No existing column is dropped, retyped or narrowed, and no
-- row is deleted or rewritten. Existing students get feeStartMonth = NULL and
-- carriedDue = 0, which reproduces today's behaviour exactly.

-- 1. Billing window + frozen carry-forward on the student.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "feeStartMonth" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "carriedDue" BIGINT NOT NULL DEFAULT 0;

-- 2. Promotion history — one row per move, with the pre-move billing state so
--    a mistaken promotion can be undone.
CREATE TABLE IF NOT EXISTS "StudentPromotion" (
  "id"                    TEXT NOT NULL,
  "schoolId"              TEXT NOT NULL,
  "studentId"             TEXT NOT NULL,
  "fromSectionId"         TEXT,
  "toSectionId"           TEXT NOT NULL,
  "effectiveMonth"        TEXT NOT NULL,
  "carriedDue"            BIGINT NOT NULL DEFAULT 0,
  "previousFeeStartMonth" TEXT,
  "previousCarriedDue"    BIGINT NOT NULL DEFAULT 0,
  "createdBy"             TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPromotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudentPromotion_schoolId_idx"  ON "StudentPromotion"("schoolId");
CREATE INDEX IF NOT EXISTS "StudentPromotion_studentId_idx" ON "StudentPromotion"("studentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentPromotion_studentId_fkey') THEN
    ALTER TABLE "StudentPromotion" ADD CONSTRAINT "StudentPromotion_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
