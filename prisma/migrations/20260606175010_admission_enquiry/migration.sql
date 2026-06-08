-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ENQUIRY', 'CONTACTED', 'REGISTERED', 'ADMITTED', 'REJECTED');

-- CreateTable
CREATE TABLE "AdmissionEnquiry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "classApplying" TEXT,
    "parentName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'ENQUIRY',
    "source" TEXT,
    "reference" TEXT,
    "registrationNo" TEXT,
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdmissionEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionEnquiry_registrationNo_key" ON "AdmissionEnquiry"("registrationNo");

-- CreateIndex
CREATE INDEX "AdmissionEnquiry_schoolId_idx" ON "AdmissionEnquiry"("schoolId");

-- CreateIndex
CREATE INDEX "AdmissionEnquiry_status_idx" ON "AdmissionEnquiry"("status");

-- CreateIndex
CREATE INDEX "AdmissionEnquiry_createdAt_idx" ON "AdmissionEnquiry"("createdAt");

-- CreateIndex
CREATE INDEX "AdmissionEnquiry_phone_idx" ON "AdmissionEnquiry"("phone");
