-- The project is renamed mcfinancial: move the default admin account's
-- placeholder address with it (DEFAULT_ADMIN_EMAIL in src/lib/brand.ts).
UPDATE "Admin"
SET "email" = 'admin@mcfinancial.local'
WHERE "email" = 'admin@mcfinance.local'
  AND NOT EXISTS (
    SELECT 1 FROM "Admin" existing
    WHERE existing."email" = 'admin@mcfinancial.local'
  );
