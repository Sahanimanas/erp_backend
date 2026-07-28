-- Transport Management
-- Strictly additive: one new enum, new nullable/defaulted columns on the
-- existing TransportRoute, and five new tables. No column is dropped, retyped
-- or narrowed; no existing row is touched and no data is deleted.
--
-- TransportRoute is deliberately EXTENDED rather than replaced: Fee Management
-- already creates rows in it (name + fee) and the payments ledger reads them,
-- so the Transport module shares the same table instead of forking a second
-- source of routes.

-- 1. Where a stop sits in a route's running order.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransportStopType') THEN
    CREATE TYPE "TransportStopType" AS ENUM ('START_POINT', 'STOPPAGE_POINT', 'END_POINT');
  END IF;
END$$;

-- 2. Operational detail on the existing route table. All nullable (or defaulted)
--    so routes already created from Fee Management stay valid untouched.
ALTER TABLE "TransportRoute" ADD COLUMN IF NOT EXISTS "routeFrom" TEXT;
ALTER TABLE "TransportRoute" ADD COLUMN IF NOT EXISTS "routeTo"   TEXT;
ALTER TABLE "TransportRoute" ADD COLUMN IF NOT EXISTS "vehicleId" TEXT;
ALTER TABLE "TransportRoute" ADD COLUMN IF NOT EXISTS "driverId"  TEXT;
ALTER TABLE "TransportRoute" ADD COLUMN IF NOT EXISTS "staffId"   TEXT;
ALTER TABLE "TransportRoute" ADD COLUMN IF NOT EXISTS "enabled"   BOOLEAN NOT NULL DEFAULT true;

-- 3. Fleet.
CREATE TABLE IF NOT EXISTS "TransportVehicle" (
  "id"            TEXT NOT NULL,
  "schoolId"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "vehicleNumber" TEXT NOT NULL,
  "vehicleModel"  TEXT,
  "gpsDeviceId"   TEXT,
  "seatCapacity"  INTEGER NOT NULL DEFAULT 0,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3),
  CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransportVehicle_schoolId_vehicleNumber_key" ON "TransportVehicle"("schoolId", "vehicleNumber");
CREATE INDEX IF NOT EXISTS "TransportVehicle_schoolId_idx" ON "TransportVehicle"("schoolId");

-- 4. Drivers.
CREATE TABLE IF NOT EXISTS "TransportDriver" (
  "id"        TEXT NOT NULL,
  "schoolId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "licenseNo" TEXT NOT NULL,
  "phone"     TEXT,
  "email"     TEXT,
  "age"       INTEGER,
  "address"   TEXT,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "TransportDriver_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TransportDriver_schoolId_idx" ON "TransportDriver"("schoolId");

-- 5. Stops. Lat/lng optional — a stop can be named now and pinned later.
CREATE TABLE IF NOT EXISTS "TransportStoppage" (
  "id"        TEXT NOT NULL,
  "schoolId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "latitude"  DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "TransportStoppage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransportStoppage_schoolId_name_key" ON "TransportStoppage"("schoolId", "name");
CREATE INDEX IF NOT EXISTS "TransportStoppage_schoolId_idx" ON "TransportStoppage"("schoolId");

-- 6. Stop ↔ route ordering.
CREATE TABLE IF NOT EXISTS "TransportRouteStoppage" (
  "id"         TEXT NOT NULL,
  "schoolId"   TEXT NOT NULL,
  "routeId"    TEXT NOT NULL,
  "stoppageId" TEXT NOT NULL,
  "time"       TEXT,
  "sequenceNo" INTEGER NOT NULL DEFAULT 0,
  "stopType"   "TransportStopType" NOT NULL DEFAULT 'STOPPAGE_POINT',
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "deletedAt"  TIMESTAMP(3),
  CONSTRAINT "TransportRouteStoppage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransportRouteStoppage_routeId_stoppageId_key" ON "TransportRouteStoppage"("routeId", "stoppageId");
CREATE INDEX IF NOT EXISTS "TransportRouteStoppage_schoolId_idx"   ON "TransportRouteStoppage"("schoolId");
CREATE INDEX IF NOT EXISTS "TransportRouteStoppage_routeId_idx"    ON "TransportRouteStoppage"("routeId");
CREATE INDEX IF NOT EXISTS "TransportRouteStoppage_stoppageId_idx" ON "TransportRouteStoppage"("stoppageId");

-- 7. Student ↔ route/stop. The FK link that replaces name-string matching.
CREATE TABLE IF NOT EXISTS "TransportStudentRoute" (
  "id"             TEXT NOT NULL,
  "schoolId"       TEXT NOT NULL,
  "routeId"        TEXT NOT NULL,
  "stoppageId"     TEXT NOT NULL,
  "studentId"      TEXT NOT NULL,
  "academicYearId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "TransportStudentRoute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TransportStudentRoute_studentId_academicYearId_key" ON "TransportStudentRoute"("studentId", "academicYearId");
CREATE INDEX IF NOT EXISTS "TransportStudentRoute_schoolId_idx"   ON "TransportStudentRoute"("schoolId");
CREATE INDEX IF NOT EXISTS "TransportStudentRoute_routeId_idx"    ON "TransportStudentRoute"("routeId");
CREATE INDEX IF NOT EXISTS "TransportStudentRoute_stoppageId_idx" ON "TransportStudentRoute"("stoppageId");
CREATE INDEX IF NOT EXISTS "TransportStudentRoute_studentId_idx"  ON "TransportStudentRoute"("studentId");

-- 8. Foreign keys. Guarded so re-running the migration is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportRoute_vehicleId_fkey') THEN
    ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_vehicleId_fkey"
      FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportRoute_driverId_fkey') THEN
    ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_driverId_fkey"
      FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportRouteStoppage_routeId_fkey') THEN
    ALTER TABLE "TransportRouteStoppage" ADD CONSTRAINT "TransportRouteStoppage_routeId_fkey"
      FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportRouteStoppage_stoppageId_fkey') THEN
    ALTER TABLE "TransportRouteStoppage" ADD CONSTRAINT "TransportRouteStoppage_stoppageId_fkey"
      FOREIGN KEY ("stoppageId") REFERENCES "TransportStoppage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportStudentRoute_routeId_fkey') THEN
    ALTER TABLE "TransportStudentRoute" ADD CONSTRAINT "TransportStudentRoute_routeId_fkey"
      FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportStudentRoute_stoppageId_fkey') THEN
    ALTER TABLE "TransportStudentRoute" ADD CONSTRAINT "TransportStudentRoute_stoppageId_fkey"
      FOREIGN KEY ("stoppageId") REFERENCES "TransportStoppage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransportStudentRoute_studentId_fkey') THEN
    ALTER TABLE "TransportStudentRoute" ADD CONSTRAINT "TransportStudentRoute_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
