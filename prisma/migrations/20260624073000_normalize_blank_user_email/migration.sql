-- Blank emails must be NULL, never '' — otherwise multiple email-less users in the
-- same school collide on the @@unique([email, schoolId]) constraint
-- ("User_email_schoolId_key"). NULLs are distinct in Postgres; empty strings are not.

-- 1) Clean up existing rows that were saved as '' (or whitespace).
UPDATE "User" SET "email" = NULL
WHERE "email" IS NOT NULL AND btrim("email") = '';

-- 2) Guard every future write (app OR manual DB edit): coerce blank email -> NULL.
CREATE OR REPLACE FUNCTION normalize_user_email() RETURNS trigger AS $$
BEGIN
  IF NEW."email" IS NOT NULL AND btrim(NEW."email") = '' THEN
    NEW."email" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_email_normalize ON "User";
CREATE TRIGGER user_email_normalize
  BEFORE INSERT OR UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION normalize_user_email();
