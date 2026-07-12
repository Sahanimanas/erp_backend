-- CreateTable
CREATE TABLE "WhatsAppMessageStat" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "read" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessageStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppMessageStat_schoolId_idx" ON "WhatsAppMessageStat"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessageStat_schoolId_date_key" ON "WhatsAppMessageStat"("schoolId", "date");
