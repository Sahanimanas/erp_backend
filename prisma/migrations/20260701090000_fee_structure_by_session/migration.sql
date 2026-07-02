-- Make the per-class fee structure session-aware so each academic session can
-- carry its own amounts instead of every session sharing one row.

-- AlterTable
ALTER TABLE "ClassFeeStructure" ADD COLUMN "academicYearId" TEXT;

-- Backfill existing structures to their class's academic session so the fees
-- already configured stay visible under that session (rather than vanishing).
UPDATE "ClassFeeStructure" cfs
SET "academicYearId" = c."academicYearId"
FROM "Class" c
WHERE cfs."classId" = c."id";

-- DropIndex (old unique keyed only on class + fee type)
DROP INDEX "ClassFeeStructure_classId_feeTypeId_key";

-- CreateIndex (new unique now includes the session)
CREATE UNIQUE INDEX "ClassFeeStructure_classId_feeTypeId_academicYearId_key" ON "ClassFeeStructure"("classId", "feeTypeId", "academicYearId");

-- CreateIndex
CREATE INDEX "ClassFeeStructure_academicYearId_idx" ON "ClassFeeStructure"("academicYearId");

-- AddForeignKey
ALTER TABLE "ClassFeeStructure" ADD CONSTRAINT "ClassFeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
