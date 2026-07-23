-- Additive migration: Class Management module.
-- Adds nullable/defaulted columns to existing tables (no data loss) and 4 new tables.

-- AlterTable: AcademicYear (Sessions)
ALTER TABLE "AcademicYear" ADD COLUMN "sessionCode" TEXT;
ALTER TABLE "AcademicYear" ADD COLUMN "timetableSession" TEXT;
ALTER TABLE "AcademicYear" ADD COLUMN "description" TEXT;
ALTER TABLE "AcademicYear" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Class
ALTER TABLE "Class" ADD COLUMN "classCode" TEXT;
ALTER TABLE "Class" ADD COLUMN "classType" TEXT;
ALTER TABLE "Class" ADD COLUMN "classSequence" INTEGER;
ALTER TABLE "Class" ADD COLUMN "noOfSessions" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Class" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Class" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Subject
ALTER TABLE "Subject" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subject" ADD COLUMN "totalMarks" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Subject" ADD COLUMN "passingMarks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subject" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: ClassDetail
CREATE TABLE "ClassDetail" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "yearIndex" INTEGER NOT NULL,
    "name" TEXT,
    "classCode" TEXT,
    "maxInternalExam" INTEGER,
    "bestInternalExamCount" INTEGER,
    "noOfElectiveSubject" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NonSubject
CREATE TABLE "NonSubject" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT,
    "name" TEXT NOT NULL,
    "totalMarks" INTEGER NOT NULL DEFAULT 100,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NonSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Syllabus
CREATE TABLE "Syllabus" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Syllabus_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeSubjectMap
CREATE TABLE "EmployeeSubjectMap" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "subjectId" TEXT,
    "nonSubjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeSubjectMap_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ClassDetail_classId_yearIndex_key" ON "ClassDetail"("classId", "yearIndex");
CREATE INDEX "ClassDetail_schoolId_idx" ON "ClassDetail"("schoolId");
CREATE INDEX "ClassDetail_classId_idx" ON "ClassDetail"("classId");
CREATE INDEX "NonSubject_schoolId_idx" ON "NonSubject"("schoolId");
CREATE INDEX "NonSubject_classId_idx" ON "NonSubject"("classId");
CREATE INDEX "Syllabus_schoolId_idx" ON "Syllabus"("schoolId");
CREATE INDEX "Syllabus_classId_idx" ON "Syllabus"("classId");
CREATE INDEX "EmployeeSubjectMap_schoolId_idx" ON "EmployeeSubjectMap"("schoolId");
CREATE INDEX "EmployeeSubjectMap_employeeId_idx" ON "EmployeeSubjectMap"("employeeId");
CREATE INDEX "EmployeeSubjectMap_classId_idx" ON "EmployeeSubjectMap"("classId");

-- Foreign keys
ALTER TABLE "ClassDetail" ADD CONSTRAINT "ClassDetail_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
