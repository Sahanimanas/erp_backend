-- DropIndex
DROP INDEX "Exam_schoolId_name_key";

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

-- CreateTable
CREATE TABLE "ExamSchedule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '12:00',
    "room" TEXT,
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "minMarks" INTEGER NOT NULL DEFAULT 33,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamHall" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomNo" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExamHall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSeat" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "seatNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScale" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" INTEGER NOT NULL,
    "maxPercent" INTEGER NOT NULL,
    "gradePoint" DOUBLE PRECISION,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamSchedule_schoolId_idx" ON "ExamSchedule"("schoolId");

-- CreateIndex
CREATE INDEX "ExamSchedule_examId_idx" ON "ExamSchedule"("examId");

-- CreateIndex
CREATE INDEX "ExamSchedule_classId_idx" ON "ExamSchedule"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSchedule_examId_classId_subjectId_key" ON "ExamSchedule"("examId", "classId", "subjectId");

-- CreateIndex
CREATE INDEX "ExamHall_schoolId_idx" ON "ExamHall"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamHall_schoolId_name_key" ON "ExamHall"("schoolId", "name");

-- CreateIndex
CREATE INDEX "ExamSeat_schoolId_idx" ON "ExamSeat"("schoolId");

-- CreateIndex
CREATE INDEX "ExamSeat_examId_hallId_idx" ON "ExamSeat"("examId", "hallId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_examId_studentId_key" ON "ExamSeat"("examId", "studentId");

-- CreateIndex
CREATE INDEX "GradingScale_schoolId_idx" ON "GradingScale"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingScale_schoolId_grade_key" ON "GradingScale"("schoolId", "grade");

-- CreateIndex
CREATE INDEX "ExamAttendance_schoolId_idx" ON "ExamAttendance"("schoolId");

-- CreateIndex
CREATE INDEX "ExamAttendance_scheduleId_idx" ON "ExamAttendance"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttendance_scheduleId_studentId_key" ON "ExamAttendance"("scheduleId", "studentId");

-- CreateIndex
CREATE INDEX "Exam_academicYearId_idx" ON "Exam"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_schoolId_academicYearId_name_key" ON "Exam"("schoolId", "academicYearId", "name");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSchedule" ADD CONSTRAINT "ExamSchedule_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSchedule" ADD CONSTRAINT "ExamSchedule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSchedule" ADD CONSTRAINT "ExamSchedule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "ExamHall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttendance" ADD CONSTRAINT "ExamAttendance_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ExamSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttendance" ADD CONSTRAINT "ExamAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

