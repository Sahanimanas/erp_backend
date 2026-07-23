-- Exam schedule: full paper details + multiple papers per subject.
-- Purely additive: existing rows keep their data and become the "Theory" paper.

ALTER TABLE "ExamSchedule" ADD COLUMN IF NOT EXISTS "paperName"     TEXT    NOT NULL DEFAULT 'Theory';
ALTER TABLE "ExamSchedule" ADD COLUMN IF NOT EXISTS "examCode"      TEXT;
ALTER TABLE "ExamSchedule" ADD COLUMN IF NOT EXISTS "invigilatorId" TEXT;
ALTER TABLE "ExamSchedule" ADD COLUMN IF NOT EXISTS "subSubject"    BOOLEAN NOT NULL DEFAULT false;

-- A subject may now hold several papers (Theory / Oral / Practical), so the
-- uniqueness key gains paperName. Old rows are already 'Theory' via the default.
DROP INDEX IF EXISTS "ExamSchedule_examId_classId_subjectId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ExamSchedule_examId_classId_subjectId_paperName_key"
  ON "ExamSchedule" ("examId", "classId", "subjectId", "paperName");

CREATE INDEX IF NOT EXISTS "ExamSchedule_invigilatorId_idx"
  ON "ExamSchedule" ("invigilatorId");

DO $$
BEGIN
  ALTER TABLE "ExamSchedule"
    ADD CONSTRAINT "ExamSchedule_invigilatorId_fkey"
    FOREIGN KEY ("invigilatorId") REFERENCES "Employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
