# MC Finance domain migration

MC Finance is the platform brand. Millionaires Club remains the membership organization and the named agreement party. The Git repository, Compose project, database name, existing member numbers and Apple Pass Type ID remain unchanged.

1. Confirm ownership of `mcfinance.us` and the current server address in the Hetzner console. Point DNS A records for `@`, `www`, `app`, and `admin` to that address. Only add AAAA records after verifying IPv6 connectivity.
2. Take and verify a database backup; retain private copies of the existing `.env` and `.env.production` files for rollback. Do not replace either with example files or rotate existing secrets.
3. In the existing `.env`, update `DOMAIN=admin.mcfinance.us`, `APP_DOMAIN=app.mcfinance.us`. After public copy approval set `WWW_DOMAIN="mcfinance.us www.mcfinance.us"`. Otherwise leave `WWW_DOMAIN` empty.
4. In `.env.production`, update `NEXTAUTH_URL="https://admin.mcfinance.us"`. If payment or email providers are already in use, coordinate callback URLs and webhook changes in their dashboards, and verify the new sending domain before changing addresses. Existing Apple Wallet identifiers and certificates must not be renamed.
5. Deploy with the existing [Hetzner instructions](deploy-hetzner-postgres.md), applying migrations before the new app starts. Recreate both app and Caddy with the new configuration. Test HTTPS, public links, admin login/MFA, member login, and provider callbacks. Members and officers may need to sign in again because cookies are host-specific.
6. If the cutover fails, restore the previous private configuration files and recreate both app and Caddy. Do not drop volumes or reset the database.

The existing downloadable membership-card artwork retains the original printed legacy brand until a revised asset is approved and its preview and download layout are visually verified. Apple Wallet organization metadata uses MC Finance without changing membership identity or pass identifiers.
