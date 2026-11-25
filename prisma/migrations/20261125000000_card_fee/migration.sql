-- The card fee collected on top of an online payment, in cents.
ALTER TABLE "PortalPayment" ADD COLUMN "feeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PortalPayment" ADD CONSTRAINT "PortalPayment_feeCents_check" CHECK ("feeCents" >= 0);
