-- Student enrollment status + fee-billing cutoff (additive, non-destructive).
-- Existing students default to active (isActive = true); the two cutoff columns
-- are nullable and start empty, so no existing data is changed.
ALTER TABLE "Student"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "leftDate" TIMESTAMP(3),
  ADD COLUMN "billedUntilMonth" TEXT;
