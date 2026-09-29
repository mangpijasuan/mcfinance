ALTER TABLE "LoanAgreement"
ALTER COLUMN "lenderName" SET DEFAULT 'MC Finance';

UPDATE "LoanAgreement"
SET "lenderName" = 'MC Finance'
WHERE "lenderName" = 'Millionaires Club';

UPDATE "Admin"
SET "email" = 'admin@mcfinance.local', "name" = 'MC Finance Admin'
WHERE "email" = 'admin@millionairesclub.com'
  AND NOT EXISTS (
    SELECT 1 FROM "Admin" existing
    WHERE existing."email" = 'admin@mcfinance.local'
  );
