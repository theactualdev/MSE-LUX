-- Provision a public."Profile" row for every Supabase auth user.
--
-- Phase 3 modelled Profile.id as the Supabase auth.users.id but nothing created the row;
-- this closes that gap. Supabase Auth remains the sole owner of credentials — this trigger
-- only mirrors identity into the application's own profile table.
--
-- Security notes (per Supabase's security checklist):
--   * The function is SECURITY DEFINER because it must write to public."Profile" during an
--     auth.users insert, so it deliberately lives in a NON-EXPOSED schema (auth_hooks, not
--     public) and has EXECUTE revoked from PUBLIC/anon/authenticated. A SECURITY DEFINER
--     function sitting in `public` would be callable by anyone as an ad-hoc API endpoint.
--   * search_path is pinned to '' and every identifier below is fully qualified, so the
--     function cannot be hijacked by a shadowing object on a caller-controlled search_path.
--   * raw_user_meta_data is user-editable, so it is read ONLY for the display name. The role
--     is never taken from metadata — it falls back to the column default (CUSTOMER).
--     Reading a role from user metadata would let any user self-promote to admin.

CREATE SCHEMA IF NOT EXISTS auth_hooks;

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
  -- Untargeted so it absorbs a conflict on either the id or the unique email; a replayed
  -- insert must never break sign-up.
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION auth_hooks.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_hooks.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION auth_hooks.handle_new_user() FROM authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth_hooks.handle_new_user();

-- Backfill: any auth user predating this trigger gets a profile now.
INSERT INTO public."Profile" (id, email, name, "createdAt", "updatedAt")
SELECT
  u.id,
  u.email,
  NULLIF(TRIM(COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    ''
  )), ''),
  NOW(),
  NOW()
FROM auth.users AS u
WHERE u.email IS NOT NULL
ON CONFLICT DO NOTHING;
