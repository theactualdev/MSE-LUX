-- Fixes a live defect: a re-signed-up user can end up with no public."Profile" row.
--
-- Root cause: Profile.email was @unique, and auth_hooks.handle_new_user() (from
-- prisma/migrations/20260719130757_profile_provisioning/migration.sql) inserted with an
-- UNTARGETED `ON CONFLICT DO NOTHING`. There was also no foreign key from public."Profile"
-- to auth.users, so deleting an auth user orphaned its Profile row instead of cleaning it
-- up. The next signup reusing that email then collided on the Profile-level unique email
-- index, the untargeted ON CONFLICT silently absorbed it, and the new auth user was left
-- with no Profile row at all — getProfile() returns null and every profile field (including
-- the auth-sourced email) renders blank.
--
-- Fix, in order:
--   a. Drop the Profile.email unique index (Prisma-generated, from removing @unique in
--      schema.prisma). Email now mirrors auth.users.email, which Supabase Auth already
--      keeps unique; the Profile-level unique added no integrity value and was the direct
--      cause of the silent-skip. Email is read-only in the app, always set by the trigger.
--   b. Delete orphan Profile rows (rows whose id has no matching auth.users row) — the
--      leftover from earlier delete-recreate testing that a cascade FK will prevent going
--      forward.
--   c. Backfill a Profile for every auth.users row that doesn't already have one — closes
--      the gap for the currently-affected re-signed-up user.
--   d. Add a cascade FK from public."Profile".id to auth.users.id so that deleting an auth
--      user cleans up its Profile row instead of orphaning it, structurally preventing this
--      class of bug from recurring.
--   e. Retarget the trigger's ON CONFLICT to the id column specifically (`ON CONFLICT (id) DO
--      NOTHING`), restoring the idempotent-replay-only intent now that email is no longer
--      unique and an id conflict is the only one that can occur.
--
-- Every statement below that references auth.users (or the auth schema) is guarded on
-- to_regnamespace('auth') and issued via EXECUTE, following the pattern established in
-- prisma/migrations/20260719130757_profile_provisioning/migration.sql: the `auth` schema is
-- created by Supabase's GoTrue service, not by these migrations, so it does not exist in the
-- throwaway shadow database `prisma migrate dev` builds to validate migration history.
-- Referencing auth.users unguarded would make every future `migrate dev` (including
-- `--create-only`) fail with 'schema "auth" does not exist'.

-- a. Prisma-generated: Profile.email is no longer @unique.
-- DropIndex
DROP INDEX IF EXISTS "Profile_email_key";

-- b. Delete orphan Profile rows left behind by deleting an auth user that had no cascade FK.
DO $$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public."Profile" p
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    ';
  END IF;
END
$$;

-- c. Backfill a Profile for every auth.users row lacking one (same shape as the backfill in
-- 20260719130757_profile_provisioning/migration.sql, retargeted to ON CONFLICT (id)). The
-- second NOW() is "updatedAt" — Prisma's @updatedAt is applied client-side, so the column has
-- no database default and must be set explicitly here.
DO $$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO public."Profile" (id, email, name, "createdAt", "updatedAt")
      SELECT
        u.id,
        u.email,
        NULLIF(TRIM(COALESCE(
          u.raw_user_meta_data ->> ''full_name'',
          u.raw_user_meta_data ->> ''name'',
          ''''
        )), ''''),
        NOW(),
        NOW()
      FROM auth.users AS u
      WHERE u.email IS NOT NULL
      ON CONFLICT (id) DO NOTHING
    ';
  END IF;
END
$$;

-- d. Cascade FK: deleting an auth user now cleans up its Profile row instead of orphaning it.
-- Idempotent (checked via pg_constraint) so this migration can be safely re-applied.
DO $$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'Profile_id_fkey' AND conrelid = 'public."Profile"'::regclass
    ) THEN
      EXECUTE '
        ALTER TABLE public."Profile"
          ADD CONSTRAINT "Profile_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
      ';
    END IF;
  END IF;
END
$$;

-- e. Retarget the trigger function's ON CONFLICT to (id) now that email is no longer unique,
-- so an id conflict (idempotent replay) is the only one that can occur. CREATE OR REPLACE
-- FUNCTION keeps the existing on_auth_user_created trigger bound — the trigger itself is not
-- dropped or recreated. All security properties are preserved unchanged: lives outside
-- public in auth_hooks, SECURITY DEFINER, search_path pinned to '', every identifier fully
-- qualified, EXECUTE revoked from PUBLIC/anon/authenticated, and user_metadata is read only
-- for the display name.
CREATE OR REPLACE FUNCTION auth_hooks.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Providers in use (email+password, Google) always supply an email, and Profile.email is
  -- NOT NULL. If a future provider omits it, skip rather than raise — a missing profile is
  -- recoverable, whereas a raising trigger would block sign-up entirely.
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public."Profile" (id, email, name, "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    NOW(),
    -- Prisma's @updatedAt is applied client-side, so this column has no database default.
    NOW()
  )
  -- Targeted on id: email is no longer unique on Profile, so an id conflict (a replayed
  -- insert) is the only conflict that can occur. A replayed insert must never break sign-up.
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION auth_hooks.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_hooks.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION auth_hooks.handle_new_user() FROM authenticated;
