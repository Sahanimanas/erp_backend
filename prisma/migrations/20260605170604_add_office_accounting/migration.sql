-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'CASH',
    "accountNumber" TEXT,
    "bankName" TEXT,
    "openingBalance" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherHead" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VoucherHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "voucherHeadId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "reference" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_schoolId_idx" ON "Account"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_schoolId_name_key" ON "Account"("schoolId", "name");

-- CreateIndex
CREATE INDEX "VoucherHead_schoolId_idx" ON "VoucherHead"("schoolId");

-- CreateIndex
CREATE INDEX "VoucherHead_type_idx" ON "VoucherHead"("type");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherHead_schoolId_name_key" ON "VoucherHead"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Transaction_schoolId_idx" ON "Transaction"("schoolId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_voucherHeadId_idx" ON "Transaction"("voucherHeadId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_voucherHeadId_fkey" FOREIGN KEY ("voucherHeadId") REFERENCES "VoucherHead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
