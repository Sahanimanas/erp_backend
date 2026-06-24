-- CreateEnum
CREATE TYPE "BiometricModality" AS ENUM ('RFID', 'FINGERPRINT', 'FACE');

-- CreateEnum
CREATE TYPE "PunchDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "BiometricDevice" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" "BiometricModality" NOT NULL,
    "serialNumber" TEXT,
    "apiKey" TEXT NOT NULL,
    "ipAddress" TEXT,
    "location" TEXT,
    "lateAfterMinutes" INTEGER NOT NULL DEFAULT 540,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricEnrollment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "modality" "BiometricModality" NOT NULL,
    "deviceUserId" TEXT,
    "cardNumber" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePunch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "deviceId" TEXT,
    "studentId" TEXT,
    "rawUserId" TEXT,
    "cardNumber" TEXT,
    "modality" "BiometricModality" NOT NULL,
    "direction" "PunchDirection" NOT NULL DEFAULT 'IN',
    "eventTime" TIMESTAMP(3) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendancePunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_apiKey_key" ON "BiometricDevice"("apiKey");

-- CreateIndex
CREATE INDEX "BiometricDevice_schoolId_idx" ON "BiometricDevice"("schoolId");

-- CreateIndex
CREATE INDEX "BiometricDevice_serialNumber_idx" ON "BiometricDevice"("serialNumber");

-- CreateIndex
CREATE INDEX "BiometricEnrollment_schoolId_idx" ON "BiometricEnrollment"("schoolId");

-- CreateIndex
CREATE INDEX "BiometricEnrollment_studentId_idx" ON "BiometricEnrollment"("studentId");

-- CreateIndex
CREATE INDEX "BiometricEnrollment_cardNumber_idx" ON "BiometricEnrollment"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricEnrollment_schoolId_deviceUserId_key" ON "BiometricEnrollment"("schoolId", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricEnrollment_schoolId_cardNumber_key" ON "BiometricEnrollment"("schoolId", "cardNumber");

-- CreateIndex
CREATE INDEX "AttendancePunch_schoolId_idx" ON "AttendancePunch"("schoolId");

-- CreateIndex
CREATE INDEX "AttendancePunch_deviceId_idx" ON "AttendancePunch"("deviceId");

-- CreateIndex
CREATE INDEX "AttendancePunch_studentId_idx" ON "AttendancePunch"("studentId");

-- CreateIndex
CREATE INDEX "AttendancePunch_eventTime_idx" ON "AttendancePunch"("eventTime");

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricEnrollment" ADD CONSTRAINT "BiometricEnrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricEnrollment" ADD CONSTRAINT "BiometricEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricEnrollment" ADD CONSTRAINT "BiometricEnrollment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
