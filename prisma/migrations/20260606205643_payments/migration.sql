-- CreateTable
CREATE TABLE "FeePayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeTypeId" TEXT,
    "feeTypeName" TEXT,
    "month" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "fine" BIGINT NOT NULL DEFAULT 0,
    "paidDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiptNo" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'CASH',
    "kind" TEXT NOT NULL DEFAULT 'PAID',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateFeeRule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "session" TEXT,
    "applicableFeeType" TEXT,
    "lateFeeType" TEXT,
    "lateFeeAmount" BIGINT NOT NULL DEFAULT 0,
    "chargeAfterDueDays" INTEGER NOT NULL DEFAULT 0,
    "startFromCurrentMonth" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LateFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeePayment_schoolId_idx" ON "FeePayment"("schoolId");

-- CreateIndex
CREATE INDEX "FeePayment_studentId_idx" ON "FeePayment"("studentId");

-- CreateIndex
CREATE INDEX "FeePayment_feeTypeId_idx" ON "FeePayment"("feeTypeId");

-- CreateIndex
CREATE INDEX "FeePayment_receiptNo_idx" ON "FeePayment"("receiptNo");

-- CreateIndex
CREATE INDEX "FeePayment_paidDate_idx" ON "FeePayment"("paidDate");

-- CreateIndex
CREATE INDEX "LateFeeRule_schoolId_idx" ON "LateFeeRule"("schoolId");
