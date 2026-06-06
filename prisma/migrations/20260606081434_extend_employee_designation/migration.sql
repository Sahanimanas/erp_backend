-- AlterTable
ALTER TABLE "Designation" ADD COLUMN     "description" TEXT,
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "level" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "husbandName" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "reportingToId" TEXT,
ADD COLUMN     "rfidNumber" TEXT,
ALTER COLUMN "dateOfBirth" DROP NOT NULL,
ALTER COLUMN "gender" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EmployeeExperience" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "role" TEXT,
    "totalExperience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeExperience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeExperience_schoolId_idx" ON "EmployeeExperience"("schoolId");

-- CreateIndex
CREATE INDEX "EmployeeExperience_employeeId_idx" ON "EmployeeExperience"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeeExperience" ADD CONSTRAINT "EmployeeExperience_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
