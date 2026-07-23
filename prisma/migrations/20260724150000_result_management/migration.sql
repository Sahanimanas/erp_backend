-- Additive migration: Result Management. Four new tables only; no existing data touched.

-- CreateTable
CREATE TABLE "NonSubjectMark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "nonSubjectId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "marks" INTEGER,
    "grade" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NonSubjectMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardRemark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "term" TEXT NOT NULL DEFAULT '',
    "remark" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportCardRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReportCard" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sectionId" TEXT,
    "academicYearId" TEXT,
    "term" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GeneratedReportCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamResultPublish" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamResultPublish_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "NonSubjectMark_studentId_nonSubjectId_term_key" ON "NonSubjectMark"("studentId", "nonSubjectId", "term");
CREATE INDEX "NonSubjectMark_schoolId_idx" ON "NonSubjectMark"("schoolId");
CREATE INDEX "NonSubjectMark_studentId_idx" ON "NonSubjectMark"("studentId");

CREATE UNIQUE INDEX "ReportCardRemark_studentId_academicYearId_term_key" ON "ReportCardRemark"("studentId", "academicYearId", "term");
CREATE INDEX "ReportCardRemark_schoolId_idx" ON "ReportCardRemark"("schoolId");

CREATE UNIQUE INDEX "GeneratedReportCard_studentId_academicYearId_term_key" ON "GeneratedReportCard"("studentId", "academicYearId", "term");
CREATE INDEX "GeneratedReportCard_schoolId_idx" ON "GeneratedReportCard"("schoolId");
CREATE INDEX "GeneratedReportCard_sectionId_idx" ON "GeneratedReportCard"("sectionId");

CREATE UNIQUE INDEX "ExamResultPublish_examId_sectionId_key" ON "ExamResultPublish"("examId", "sectionId");
CREATE INDEX "ExamResultPublish_schoolId_idx" ON "ExamResultPublish"("schoolId");
