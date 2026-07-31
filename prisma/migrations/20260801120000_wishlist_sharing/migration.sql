-- Wishlist sharing + gift orders (Phase 10c). Create-only; the developer
-- applies it with `prisma migrate deploy`.

ALTER TABLE "Wishlist" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "Wishlist" ADD COLUMN "shareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Wishlist" ADD COLUMN "giftAddressId" TEXT;

CREATE UNIQUE INDEX "Wishlist_shareToken_key" ON "Wishlist"("shareToken");

ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_giftAddressId_fkey"
  FOREIGN KEY ("giftAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "giftRecipientName" TEXT;
