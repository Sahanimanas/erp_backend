-- CreateTable
CREATE TABLE "WhatsAppAuthFile" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAuthFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppAuthFile_schoolId_idx" ON "WhatsAppAuthFile"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAuthFile_schoolId_name_key" ON "WhatsAppAuthFile"("schoolId", "name");
