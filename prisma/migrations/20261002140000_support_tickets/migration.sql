-- Support threads: a school raises an issue / feedback / question, the vendor
-- answers it.
--
-- Strictly additive: two brand-new tables and nothing else. No existing table,
-- column or row is touched.

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"            TEXT NOT NULL,
  "schoolId"      TEXT NOT NULL,
  "type"          TEXT NOT NULL DEFAULT 'ISSUE',
  "subject"       TEXT NOT NULL,
  "message"       TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'OPEN',
  "priority"      TEXT NOT NULL DEFAULT 'NORMAL',
  "createdBy"     TEXT,
  "createdByName" TEXT,
  "lastReplyAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_tickets_schoolId_idx"  ON "support_tickets"("schoolId");
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx"    ON "support_tickets"("status");
CREATE INDEX IF NOT EXISTS "support_tickets_type_idx"      ON "support_tickets"("type");
CREATE INDEX IF NOT EXISTS "support_tickets_createdAt_idx" ON "support_tickets"("createdAt");

CREATE TABLE IF NOT EXISTS "support_replies" (
  "id"           TEXT NOT NULL,
  "ticketId"     TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "authorId"     TEXT,
  "authorName"   TEXT,
  "fromPlatform" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_replies_ticketId_idx" ON "support_replies"("ticketId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_replies_ticketId_fkey') THEN
    ALTER TABLE "support_replies" ADD CONSTRAINT "support_replies_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
