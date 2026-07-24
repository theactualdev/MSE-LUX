-- Order payment fields for Phase 6 (Paystack). `paystackReference` records the latest
-- attempt's reference (globally unique in Paystack); `paidAt` is the fulfilment
-- idempotency guard (set once, when payment is verified — its presence means the
-- order's stock has been decremented and the cart cleared, exactly once).
ALTER TABLE "Order" ADD COLUMN "paystackReference" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Order_paystackReference_key" ON "Order"("paystackReference");
