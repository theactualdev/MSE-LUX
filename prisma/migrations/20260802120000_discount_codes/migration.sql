-- Discount codes (Phase 10b). Create-only; the developer applies it with
-- `prisma migrate deploy`.

CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id"),
    -- Defence in depth, not a replacement for the engine's own enforcement
    -- (`resolveUsableCode`/`computeDiscountMinor` in
    -- `@/features/discounts/discount.ts` still clamp/refuse regardless of
    -- what reaches this table). Closes the direct-DB-edit / future-bulk-
    -- import hole that clamping exists to work around: a bad row can no
    -- longer reach this table at all.
    CONSTRAINT "DiscountCode_percentOff_check" CHECK ("percentOff" BETWEEN 1 AND 100),
    CONSTRAINT "DiscountCode_maxUses_check" CHECK ("maxUses" IS NULL OR "maxUses" > 0),
    CONSTRAINT "DiscountCode_timesUsed_check" CHECK ("timesUsed" >= 0)
);

CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

ALTER TABLE "DiscountCode" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Order" ADD COLUMN "discountCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "discountPercent" INTEGER;
ALTER TABLE "Order" ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0;
