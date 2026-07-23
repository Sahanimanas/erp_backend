-- Additive migration: rich class timetable (video-style) + per-cell details.
-- Creates two NEW tables only; touches no existing table's data.

-- CreateTable
CREATE TABLE "ClassTimetable" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "session" TEXT NOT NULL DEFAULT 'DEFAULT',
    "academicYearId" TEXT,
    "maxPeriods" INTEGER NOT NULL DEFAULT 8,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "classTeacherId" TEXT,
    "periodLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassTimetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTimetableCell" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "timetableId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "onlineLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassTimetableCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassTimetable_schoolId_idx" ON "ClassTimetable"("schoolId");
CREATE INDEX "ClassTimetable_sectionId_idx" ON "ClassTimetable"("sectionId");
CREATE UNIQUE INDEX "ClassTimetable_schoolId_sectionId_session_academicYearId_key" ON "ClassTimetable"("schoolId", "sectionId", "session", "academicYearId");

-- CreateIndex
CREATE INDEX "ClassTimetableCell_timetableId_idx" ON "ClassTimetableCell"("timetableId");
CREATE INDEX "ClassTimetableCell_schoolId_day_idx" ON "ClassTimetableCell"("schoolId", "day");
CREATE INDEX "ClassTimetableCell_schoolId_teacherId_idx" ON "ClassTimetableCell"("schoolId", "teacherId");
CREATE UNIQUE INDEX "ClassTimetableCell_timetableId_day_periodIndex_key" ON "ClassTimetableCell"("timetableId", "day", "periodIndex");

-- AddForeignKey
ALTER TABLE "ClassTimetable" ADD CONSTRAINT "ClassTimetable_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTimetableCell" ADD CONSTRAINT "ClassTimetableCell_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "ClassTimetable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
