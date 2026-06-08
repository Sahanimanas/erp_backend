-- AlterTable
ALTER TABLE "AdmissionEnquiry" ADD COLUMN     "admittedStudentId" TEXT;

-- CreateTable
CREATE TABLE "ClassFeeType" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'Monthly',
    "months" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incomeHead" TEXT,
    "isTransport" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClassFeeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassFeeStructure" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "feeTypeId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassFeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassFeeType_schoolId_idx" ON "ClassFeeType"("schoolId");

-- CreateIndex
CREATE INDEX "ClassFeeType_isTransport_idx" ON "ClassFeeType"("isTransport");

-- CreateIndex
CREATE UNIQUE INDEX "ClassFeeType_schoolId_name_key" ON "ClassFeeType"("schoolId", "name");

-- CreateIndex
CREATE INDEX "ClassFeeStructure_schoolId_idx" ON "ClassFeeStructure"("schoolId");

-- CreateIndex
CREATE INDEX "ClassFeeStructure_classId_idx" ON "ClassFeeStructure"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassFeeStructure_classId_feeTypeId_key" ON "ClassFeeStructure"("classId", "feeTypeId");

-- CreateIndex
CREATE INDEX "TransportRoute_schoolId_idx" ON "TransportRoute"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRoute_schoolId_name_key" ON "TransportRoute"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "ClassFeeStructure" ADD CONSTRAINT "ClassFeeStructure_feeTypeId_fkey" FOREIGN KEY ("feeTypeId") REFERENCES "ClassFeeType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
