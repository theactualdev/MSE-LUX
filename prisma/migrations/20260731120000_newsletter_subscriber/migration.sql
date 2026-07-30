-- Newsletter subscribers (Phase 10a). Create-only; applied by the developer
-- via `prisma migrate deploy`. RLS is enabled with NO policies, matching the
-- Phase 4 posture: the app reaches this table through the direct Prisma
-- connection (table owner, not subject to RLS); Supabase's anon/authenticated
-- PostgREST roles get nothing.

CREATE TYPE "SubscriberStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED');

CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

CREATE UNIQUE INDEX "Subscriber_token_key" ON "Subscriber"("token");

ALTER TABLE "Subscriber" ENABLE ROW LEVEL SECURITY;
