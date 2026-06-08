-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'TRIAL';

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "enabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SchoolDomain" ADD COLUMN     "dnsStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "sslStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'subdomain',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
