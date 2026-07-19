-- Enable Row Level Security on every table in `public`, with policies matching the real
-- access model.
--
-- WHAT THIS IS AND IS NOT:
--   Prisma connects as a privileged role through the pooler and BYPASSES RLS entirely, so
--   these policies are not what protects data today — server-side guards and per-user query
--   scoping are. RLS here is defense-in-depth for two futures: if anyone later grants
--   anon/authenticated access to these tables, or if the browser ever queries Supabase
--   directly. Since 2026-04-28 new tables in `public` are not auto-exposed to the Data API
--   and we grant nothing, so today the browser cannot reach them at all.
--
-- CONVENTIONS (per Supabase's security checklist):
--   * Every policy names its target role via TO; the deprecated auth.role() is never used
--     (it silently passes for anonymous users once anonymous sign-ins are enabled).
--   * TO authenticated is never used alone — every non-catalog policy carries an ownership
--     predicate, otherwise it is authentication without authorization (BOLA/IDOR).
--   * UPDATE policies carry BOTH USING and WITH CHECK, so a row cannot be re-pointed at
--     another user by rewriting its owner column.
--   * auth.uid() is wrapped as (select auth.uid()) so the planner evaluates it once.
--   * No policy permits changing Profile.role. Role changes are server-only; a client-writable
--     role is a privilege-escalation path to admin.

-- ---------------------------------------------------------------------------
-- Enable RLS (enumerated explicitly so this migration stays reviewable)
-- ---------------------------------------------------------------------------
ALTER TABLE public."Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Wishlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WishlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrderLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductOptionType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductOptionValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VariantOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subcategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProductCollection" ENABLE ROW LEVEL SECURITY;
-- Migration history must never be client-readable: RLS on, deliberately no policies, which
-- denies everything to anon/authenticated while the privileged role still bypasses.
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Identity: a user sees and edits only their own profile
-- ---------------------------------------------------------------------------
CREATE POLICY "Profile is selectable by its owner"
  ON public."Profile" FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Profile is updatable by its owner"
  ON public."Profile" FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
-- No INSERT policy: profiles are created by the auth.users trigger.
-- No DELETE policy: account deletion is a server-side flow (deferred).

-- ---------------------------------------------------------------------------
-- Addresses: fully owner-scoped CRUD
-- ---------------------------------------------------------------------------
CREATE POLICY "Address is selectable by its owner"
  ON public."Address" FOR SELECT TO authenticated
  USING ((select auth.uid()) = "profileId");

CREATE POLICY "Address is insertable by its owner"
  ON public."Address" FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = "profileId");

CREATE POLICY "Address is updatable by its owner"
  ON public."Address" FOR UPDATE TO authenticated
  USING ((select auth.uid()) = "profileId")
  WITH CHECK ((select auth.uid()) = "profileId");

CREATE POLICY "Address is deletable by its owner"
  ON public."Address" FOR DELETE TO authenticated
  USING ((select auth.uid()) = "profileId");

-- ---------------------------------------------------------------------------
-- Cart & wishlist: owner-scoped; child rows scoped through their parent.
-- Guest rows (profileId IS NULL) match no policy and are therefore unreachable via
-- the Data API — intentional; guest carts stay client-side until Phase 5.
-- ---------------------------------------------------------------------------
CREATE POLICY "Cart is selectable by its owner"
  ON public."Cart" FOR SELECT TO authenticated
  USING ((select auth.uid()) = "profileId");

CREATE POLICY "Cart is insertable by its owner"
  ON public."Cart" FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = "profileId");

CREATE POLICY "Cart is updatable by its owner"
  ON public."Cart" FOR UPDATE TO authenticated
  USING ((select auth.uid()) = "profileId")
  WITH CHECK ((select auth.uid()) = "profileId");

CREATE POLICY "Cart is deletable by its owner"
  ON public."Cart" FOR DELETE TO authenticated
  USING ((select auth.uid()) = "profileId");

CREATE POLICY "CartItem is selectable via its cart"
  ON public."CartItem" FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Cart" c
    WHERE c.id = public."CartItem"."cartId" AND c."profileId" = (select auth.uid())
  ));

CREATE POLICY "CartItem is insertable via its cart"
  ON public."CartItem" FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Cart" c
    WHERE c.id = public."CartItem"."cartId" AND c."profileId" = (select auth.uid())
  ));

CREATE POLICY "CartItem is updatable via its cart"
  ON public."CartItem" FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Cart" c
    WHERE c.id = public."CartItem"."cartId" AND c."profileId" = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Cart" c
    WHERE c.id = public."CartItem"."cartId" AND c."profileId" = (select auth.uid())
  ));

CREATE POLICY "CartItem is deletable via its cart"
  ON public."CartItem" FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Cart" c
    WHERE c.id = public."CartItem"."cartId" AND c."profileId" = (select auth.uid())
  ));

CREATE POLICY "Wishlist is selectable by its owner"
  ON public."Wishlist" FOR SELECT TO authenticated
  USING ((select auth.uid()) = "profileId");

CREATE POLICY "Wishlist is insertable by its owner"
  ON public."Wishlist" FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = "profileId");

CREATE POLICY "Wishlist is updatable by its owner"
  ON public."Wishlist" FOR UPDATE TO authenticated
  USING ((select auth.uid()) = "profileId")
  WITH CHECK ((select auth.uid()) = "profileId");

CREATE POLICY "Wishlist is deletable by its owner"
  ON public."Wishlist" FOR DELETE TO authenticated
  USING ((select auth.uid()) = "profileId");

CREATE POLICY "WishlistItem is selectable via its wishlist"
  ON public."WishlistItem" FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Wishlist" w
    WHERE w.id = public."WishlistItem"."wishlistId" AND w."profileId" = (select auth.uid())
  ));

CREATE POLICY "WishlistItem is insertable via its wishlist"
  ON public."WishlistItem" FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Wishlist" w
    WHERE w.id = public."WishlistItem"."wishlistId" AND w."profileId" = (select auth.uid())
  ));

CREATE POLICY "WishlistItem is deletable via its wishlist"
  ON public."WishlistItem" FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Wishlist" w
    WHERE w.id = public."WishlistItem"."wishlistId" AND w."profileId" = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Orders: read-only to their owner. Orders are written server-side only, so no client
-- INSERT/UPDATE/DELETE policy exists anywhere — financial history must never be
-- client-mutable.
-- ---------------------------------------------------------------------------
CREATE POLICY "Order is selectable by its owner"
  ON public."Order" FOR SELECT TO authenticated
  USING ((select auth.uid()) = "profileId");

CREATE POLICY "OrderLine is selectable via its order"
  ON public."OrderLine" FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Order" o
    WHERE o.id = public."OrderLine"."orderId" AND o."profileId" = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Catalog: publicly readable, never client-writable. Child rows are gated on the parent
-- product being ACTIVE so a draft product cannot leak through its images, variants, or
-- options.
-- ---------------------------------------------------------------------------
CREATE POLICY "Active products are publicly readable"
  ON public."Product" FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE');

CREATE POLICY "Variants of active products are publicly readable"
  ON public."ProductVariant" FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Product" p
    WHERE p.id = public."ProductVariant"."productId" AND p.status = 'ACTIVE'
  ));

CREATE POLICY "Images of active products are publicly readable"
  ON public."ProductImage" FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Product" p
    WHERE p.id = public."ProductImage"."productId" AND p.status = 'ACTIVE'
  ));

CREATE POLICY "Option types of active products are publicly readable"
  ON public."ProductOptionType" FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Product" p
    WHERE p.id = public."ProductOptionType"."productId" AND p.status = 'ACTIVE'
  ));

CREATE POLICY "Option values of active products are publicly readable"
  ON public."ProductOptionValue" FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public."ProductOptionType" t
    JOIN public."Product" p ON p.id = t."productId"
    WHERE t.id = public."ProductOptionValue"."optionTypeId" AND p.status = 'ACTIVE'
  ));

CREATE POLICY "Variant options of active products are publicly readable"
  ON public."VariantOption" FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public."ProductVariant" v
    JOIN public."Product" p ON p.id = v."productId"
    WHERE v.id = public."VariantOption"."variantId" AND p.status = 'ACTIVE'
  ));

CREATE POLICY "Collection membership of active products is publicly readable"
  ON public."ProductCollection" FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Product" p
    WHERE p.id = public."ProductCollection"."productId" AND p.status = 'ACTIVE'
  ));

CREATE POLICY "Categories are publicly readable"
  ON public."Category" FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Subcategories are publicly readable"
  ON public."Subcategory" FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Collections are publicly readable"
  ON public."Collection" FOR SELECT TO anon, authenticated
  USING (true);
