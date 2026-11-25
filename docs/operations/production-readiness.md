# Production readiness: status after the review of 2026-11-25

A working application and a production-ready financial platform are not the same. This page tracks what the review of the MC Points, tenure accrual, MCC Earn simulator, MCC contract laboratory and the rebrand found, who is fixing it, and what still stands between today and a production release. See also the [go-live checklist](go-live-checklist.md) and the [decision log](../architecture/16-decision-log.md).

Nothing here authorizes public token issuance, live trading or guaranteed returns.

## Critical findings

| | Finding | Status |
|---|---|---|
| C1 | No Contabo configuration or migration procedure in the repository | **In review:** [deploy-contabo.md](deploy-contabo.md) and `scripts/ops/verify-migration.sh` (PR #55). An officer must fill in the server record and run the fingerprint comparison. |
| C2 | Tokenomics approval not recorded; Earn needs counsel | **Recorded** in the [decision log](../architecture/16-decision-log.md) (D-23, D-24). Founder confirmation and counsel review remain open. |
| C3 | "DEX-only eligibility" cannot be enforced by a plain ERC-20 | **Open, designed for later:** needs a purchase-verification mechanism (router with receipts) before any testnet. The simulator and the lab make no claim to enforce it. |
| C4 | Contract: single fixed issuers, no governance, fixed-window limits, "receipts" are not proofs | **Accepted for the laboratory.** Known behaviours are now pinned by tests (window boundary, no admin functions, invariants). Production needs multisig/roles, pause, rolling limits, on-chain receipt checks and an independent audit. |
| C5 | Rewards ledger had no database protection, no dedicated permissions, no second approver | **In review:** PR #53 |
| C6 | Membership history could not be corrected, enrolment had no second person, join date could drift | **In review:** PR #54 (stacked on #53) |
| C7 | Operational checklist incomplete | **Open:** see "Before a production release" below. |

## Recommended improvements

- Rebrand (PR #52, Codex): merge after #51 and the Contabo documents; update the go-live checklist and the domain runbook, which still say Hetzner, in the same change. Add redirects from the old addresses; check the e-mail sending domain, Stripe/QuickBooks callbacks and the Apple Pay domain.
- Add `rewards.*` modules to the 100% coverage gate once #53 and #54 are merged.
- Browser tests (including phone width and accessibility) for the rewards screens and the Earn simulator.
- Dated, approved snapshots of tenure points before any conversion is designed; define the points-to-MCC relationship in writing.
- Post the card fee (PR #51) to the ledger once the accountant decides its treatment.
- A written incident runbook (who is called, how to stop the app, how to restore).

## Before a production release (financial integrity first)

- [ ] Contabo: server record completed, firewall (22/80/443 only), two officers with panel access and two-factor, old server retired after a week
- [ ] Migration verified: `verify-migration.sh` fingerprints identical; `prisma migrate status` up to date
- [ ] Encrypted off-site backups running from the Contabo server; one restore drill passed; weekly restore check scheduled
- [ ] Three officers named with staff logins and two-factor; `MAKER_CHECKER_ENFORCED=true`
- [ ] Treasurer's data check complete (members, 2026 months against the sheets, yearly totals, loans); differences corrected in the app
- [ ] Daily jobs in the crontab; bank balance recorded; real Zelle details
- [ ] `mcfinance.us` HTTPS for `admin.` and `app.`; provider callbacks updated
- [ ] Rewards and membership accrual flags remain **off** until the controlled pilot is approved
- [ ] Stripe account opened and tested (bank, then card); card fee only after counsel confirms
- [ ] One-month pilot completed and passed ([pilot guide](pilot-guide.md))

## Future development (after the foundations are verified)

MC Wallet simulation; rewards rules, benefits and redemption approvals; a purchase-verification design and a testnet-ready contract architecture (governance, pause, rolling limits, audit); wallet pass updates and revocation; member self-service password page; public status page.

## How the review is checked

- Unit and integration tests with a 100% gate on the money modules; database-level tests for the rewards and membership protections.
- The contract laboratory has its own CI job (`.github/workflows/mcc-lab.yml`): dependency audit plus the local-EVM tests.
- Each fix is its own pull request, merged only after review and a green CI run.
