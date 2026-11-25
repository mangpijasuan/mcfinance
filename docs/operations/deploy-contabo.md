# MC Finance on Contabo: deployment, backups, restore and migration checks

MC Finance runs on a **Contabo** server at **mcfinance.us** (founder decision, 2026-11-25). The GitHub repository stays `mangpijasuan/mcfinancial`, and the stack is still defined by `docker-compose.hetzner.yml`. That file name is historical: it is plain Docker Compose (the app, PostgreSQL and Caddy) and runs the same on any Docker host, so it was not renamed. Everything in [deploy-hetzner-postgres.md](deploy-hetzner-postgres.md) about the stack itself (environment files, migrations, the daily jobs, the bank balance) still applies; this page covers what is specific to Contabo and to the move from the earlier server.

> **Fill in, do not guess.** The repository cannot see the server. Sections marked ☐ are for an officer to complete from the Contabo customer panel and the server itself, then commit the finished page (without passwords or keys).

## 1. Server record ☐

| | |
|---|---|
| Provider / plan | Contabo, VPS ______ |
| Data centre region | ______ |
| IPv4 / IPv6 | ______ / ______ |
| Operating system | ______ (`lsb_release -a`) |
| Who can sign in to the Contabo panel | ______ (at least two officers; two-factor on) |
| Who can SSH in | ______ (keys only) |
| Date of the cutover from the earlier server | ______ |
| Earlier server (Hetzner `46.225.99.160`) | still running for rollback until ______ |

## 2. Contabo panel settings ☐

- **Two-factor sign-in** on every panel account, and the account e-mail an address the club controls (the panel can reinstall or erase the server).
- **Firewall:** allow only TCP 22, 80, 443 and UDP 443 (and ICMP). Restrict port 22 to the officers' addresses if they have fixed ones. Use the panel's firewall if your plan has one, and/or `ufw` on the server (`ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; ufw enable`). PostgreSQL (5432) must **not** be reachable from outside: the compose file does not publish it, keep it that way.
- **Never use Reinstall or Rescue** casually: reinstalling erases the disk. Note who may.
- **Snapshots / provider backups** are a convenience, not the backup: they live with the same provider and are not encrypted by the club. The encrypted off-site database backup in section 5 is the real one.
- **IPv6:** add `AAAA` records only after checking that IPv6 works from outside (`curl -6 https://app.mcfinance.us/api/health`).

## 3. The server itself ☐

- SSH: key login only (`PasswordAuthentication no`), root login by key only, or a sudo user. Confirm no unknown keys in `~/.ssh/authorized_keys`.
- Updates: `unattended-upgrades` for security fixes; reboot when asked (`/var/run/reboot-required`). Docker restarts the stack on boot (`restart: unless-stopped`).
- Time: `timedatectl` shows `System clock synchronized: yes`. The daily jobs and the membership accrual depend on correct dates.
- Disk: `df -h` has room for the database, the Docker images and the local backups (`/var/backups` or the configured directory). Alert at 80%.
- Docker: `docker compose -f docker-compose.hetzner.yml ps` shows `app` healthy.

## 4. Environment for mcfinance.us

In `.env` (next to the compose file): `DOMAIN=admin.mcfinance.us`, `APP_DOMAIN=app.mcfinance.us`, and `WWW_DOMAIN="mcfinance.us www.mcfinance.us"` once the public pages are approved. In `.env.production`: `NEXTAUTH_URL="https://admin.mcfinance.us"`. DNS `A` records for `admin`, `app`, `www` and the bare domain point at the Contabo address. Caddy fetches the HTTPS certificates itself once DNS resolves; the certificates are stored in the `caddy_data` volume, so **never `docker compose down -v`**.

After a cutover, also update (each in its own dashboard): the Stripe webhook address and Apple Pay domain, the QuickBooks redirect address, the e-mail sending domain's DNS records (SPF, DKIM), and the healthchecks.io check. Members and officers sign in again because cookies belong to the address.

## 5. Backups on this server

Follow [backup-and-restore.md](backup-and-restore.md) on the Contabo server: the nightly `scripts/ops/backup-postgres.sh` (encrypted with `age`, copied to Backblaze B2 with a write-only key) in the crontab, and the weekly restore check from an officer's computer. Re-create the **whole crontab** on the new server (backup, `dues:service`, `loans:service`): a cron table does not move with the database. Check that `.env.backup`, `~/.config/mc-backup/recipients.txt` and the `club/` folder (for example `club/zelle-qr.png`) were copied too.

The first backup after the cutover is made **on the new server** and must appear in the bucket the same night.

## 6. Verify the migration (old server → Contabo)

Do this at the cutover, in a quiet moment (a weekend morning), and keep the old server running until it passes.

1. **Freeze the old server:** `docker compose -f docker-compose.hetzner.yml stop app` (the database keeps running).
2. **Fingerprint the old database:** `./scripts/ops/verify-migration.sh > /tmp/fingerprint-old.txt`. The fingerprint lists applied migrations, every protective trigger and constraint, the next ids, and the row count and a checksum of every table. It only reads.
3. **Take a backup and move it:** `./scripts/ops/backup-postgres.sh` on the old server, then restore the dump on the new server's empty database with `scripts/ops/restore-postgres.sh` (see the backup guide). Do not copy the Docker volume by hand.
4. **On the new server, with `app` stopped:** `docker compose -f docker-compose.hetzner.yml up -d postgres`, then `./scripts/ops/verify-migration.sh > /tmp/fingerprint-new.txt`.
5. **Compare:** copy both files to one place and run `diff fingerprint-old.txt fingerprint-new.txt && echo SAME`. The result must be **SAME**. Any difference names the table, trigger or sequence: do not go live; find out why.
6. `docker compose -f docker-compose.hetzner.yml up -d --build`, then `docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate status` must say the schema is up to date, with nothing pending or failed.
7. **Business check (Treasurer):** the latest *Monthly report* (Contributions) on the new server shows the same totals as the old one, and one member's *Year by year* and loan page match. The audit log (*Administration → Audit*) shows the entries up to the freeze.
8. Point DNS at the new server (lower the TTL a day before). Test sign-in for an officer (with two-factor) and a member, a Zelle claim, and the Stripe/QuickBooks callbacks if they are in use.
9. **Rollback** (until the old server is switched off): point DNS back and `docker compose -f docker-compose.hetzner.yml up -d app` on the old server. Nothing was changed there. Anything entered on the new server since the cutover must be re-entered, so decide quickly.
10. **Keep the old server** for a week and at least two good nightly backups on the new one, then power it off. Before deleting it, rotate the secrets that lived on it (the Backblaze write key, `NEXTAUTH_SECRET`, Stripe and QuickBooks keys, the deploy key), and delete its snapshots.

Run the fingerprint again after a restore drill (section 7) and after any provider-side move of the server.

## 7. Restore drill (quarterly, and before the first real month-end)

On an officer's computer (never on the server): `scripts/ops/restore-postgres.sh verify` restores the newest backup into a throwaway database and checks it. To prove the backup matches production, restore into a scratch PostgreSQL and run `PSQL_URL=... ./scripts/ops/verify-migration.sh`, then compare with the production fingerprint taken right after that night's backup (the app being busy changes the session and audit tables, so compare the money tables: `Member`, `Contribution`, `Loan`, `LoanPayment`, `JournalEntry`, `JournalLine`). Record the date and the result.

## 8. After the move: checklist ☐

- [ ] Fingerprints identical (section 6, step 5)
- [ ] `prisma migrate status`: up to date
- [ ] `docker compose ... ps`: `app` healthy; Caddy has certificates for `admin.`, `app.` and `www.`
- [ ] Crontab re-created (backup, `dues:service`, `loans:service`) and each ran once by hand
- [ ] First encrypted backup of the new server is in the bucket; healthchecks.io is green
- [ ] One restore drill passed on the new server's backup
- [ ] Firewall: only 22, 80, 443; PostgreSQL not reachable from outside (`nmap` or the panel)
- [ ] Contabo panel two-factor on; two officers with access
- [ ] Stripe, QuickBooks, Apple Pay and e-mail addresses updated
- [ ] Old server powered off after a week; secrets rotated
- [ ] The go-live checklist's sections 1–4 updated to say Contabo (after PR #52 lands)
