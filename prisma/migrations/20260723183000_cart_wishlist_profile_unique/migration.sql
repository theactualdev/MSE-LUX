-- Enforces "one Cart / one Wishlist row per profile" at the database level.
--
-- Background: the Phase 5c server cart/wishlist data layers fetch-or-create a
-- user's Cart/Wishlist lazily on first write (findFirst by profileId -> create
-- if absent). Under Postgres's default READ COMMITTED isolation, two concurrent
-- first-writes by the SAME user can both see no row and both insert, producing
-- two Cart (or Wishlist) rows for one profile. That isn't a security hole —
-- reads scope by the profileId relation, so nothing leaks across users — but a
-- user's lines could scatter across two rows. A UNIQUE constraint on profileId
-- makes that impossible and lets the data layer move to an upsert-based
-- get-or-create later.
--
-- profileId is nullable, but the application never writes a null profileId for
-- these tables (guests never create rows). Postgres treats NULLs as distinct in
-- a unique index, so orphaned rows left by the `onDelete: SetNull` FK (a Profile
-- deleted out from under its cart) do NOT collide — which is the correct
-- behaviour here (unlike CartItem.variantId, this index must NOT be
-- NULLS NOT DISTINCT).
--
-- This replaces the plain `@@index([profileId])` (Cart_profileId_idx /
-- Wishlist_profileId_idx) from the init migration with a UNIQUE index; the
-- unique index also serves every lookup the plain index did, so nothing is lost.
--
-- PRE-FLIGHT (run before applying, especially if any server carts already
-- exist): confirm there are no existing duplicates, or `CREATE UNIQUE INDEX`
-- will fail loudly (by design — it will not delete data):
--     SELECT "profileId", COUNT(*) FROM "Cart"     GROUP BY "profileId" HAVING COUNT(*) > 1;
--     SELECT "profileId", COUNT(*) FROM "Wishlist" GROUP BY "profileId" HAVING COUNT(*) > 1;
-- If either returns rows, consolidate those carts/wishlists first, then apply.
-- (Phase 5c has not been deployed yet, so these tables are expected to be empty.)

-- DropIndex
DROP INDEX "Cart_profileId_idx";

-- DropIndex
DROP INDEX "Wishlist_profileId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Cart_profileId_key" ON "Cart"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_profileId_key" ON "Wishlist"("profileId");
