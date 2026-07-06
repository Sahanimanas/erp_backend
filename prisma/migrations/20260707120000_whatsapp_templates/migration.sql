-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "event" TEXT NOT NULL DEFAULT 'MANUAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_schoolId_idx" ON "WhatsAppTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_schoolId_event_idx" ON "WhatsAppTemplate"("schoolId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_schoolId_name_key" ON "WhatsAppTemplate"("schoolId", "name");

