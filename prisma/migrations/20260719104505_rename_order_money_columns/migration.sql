-- Rename the order money columns to be currency-neutral.
--
-- `Order.currency` already records the currency explicitly, so `*NgnMinor` names were both
-- redundant and a trap: an order in another currency would put that currency's minor units
-- in a column named "Ngn", and any reporting query summing `totalNgnMinor` without filtering
-- on `currency` would silently add cents to kobo.
--
-- Hand-written as RENAME rather than Prisma's generated DROP + ADD. The generated form is
-- destructive: replayed against a database that already holds orders it would discard the
-- financial history these columns exist to preserve. RENAME is non-destructive and safe to
-- replay whether or not the table has rows.

-- AlterTable
ALTER TABLE "Order" RENAME COLUMN "subtotalNgnMinor" TO "subtotalMinor";
ALTER TABLE "Order" RENAME COLUMN "shippingNgnMinor" TO "shippingMinor";
ALTER TABLE "Order" RENAME COLUMN "taxNgnMinor" TO "taxMinor";
ALTER TABLE "Order" RENAME COLUMN "totalNgnMinor" TO "totalMinor";

-- AlterTable
ALTER TABLE "OrderLine" RENAME COLUMN "unitPriceNgnMinor" TO "unitPriceMinor";
ALTER TABLE "OrderLine" RENAME COLUMN "lineTotalNgnMinor" TO "lineTotalMinor";
