ALTER TABLE "LoanAgreement"
ALTER COLUMN "lenderName" SET DEFAULT 'Millionaires Club';

UPDATE "LoanAgreement"
SET "lenderName" = 'Millionaires Club'
WHERE "lenderName" = 'MC Finance';

UPDATE "Admin"
SET "name" = 'Millionaires Club Admin'
WHERE "email" = 'admin@mcfinance.local'
  AND "name" = 'MC Finance Admin';
