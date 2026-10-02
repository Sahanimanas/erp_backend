-- Per-school settings that have no column of their own, stored per section as
-- JSON. Strictly additive: one brand-new table, nothing existing is touched.

CREATE TABLE IF NOT EXISTS "school_settings" (
  "id"        TEXT NOT NULL,
  "schoolId"  TEXT NOT NULL,
  "section"   TEXT NOT NULL,
  "value"     JSONB NOT NULL DEFAULT '{}',
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "school_settings_schoolId_section_key" ON "school_settings"("schoolId", "section");
CREATE INDEX IF NOT EXISTS "school_settings_schoolId_idx" ON "school_settings"("schoolId");
