# MCC tokenomics v1 — internal pilot and proposed token design

Founder-approved planning parameters; **not an issuance, sale, conversion commitment, or live investment product**. This supersedes the preliminary allocation models for planning only. Production issuance requires separate legal, accounting, treasury and technical approval.

## Supply allocation

| Purpose | MCC | Share |
|---|---:|---:|
| Membership tenure rewards | 75,000,000,000 | 75% |
| Liquidity reserve | 10,000,000,000 | 10% |
| Community development | 5,000,000,000 | 5% |
| Ecosystem | 3,000,000,000 | 3% |
| MCC Earn reserve | 2,000,000,000 | 2% |
| Treasury | 5,000,000,000 | 5% |
| **Maximum** | **100,000,000,000** | **100%** |

An allocation is a ceiling, not circulating supply. Membership reserves one million units per enrolled member, supporting at most 75,000 lifetime enrollments. Do not recycle a departed member's reservation without a separately approved policy.

## Membership pilot

- Earn up to 1,000,000 non-transferable internal tenure points over ten years of active membership, calculated as floor(eligible days × 1,000,000 / days to tenth anniversary). February 29 anniversaries fall on February 28 when necessary. Rounding never exceeds the cap.
- Staff verifies original join date and eligible historical active days before enrollment. Members with ten verified years show the full amount immediately; do not assume uninterrupted historical activity without records.
- Each completed active calendar day counts; inactive days do not. The club time zone is captured at enrollment. Status transitions checkpoint accrued days atomically in PostgreSQL. Read-time calculations need no daily cron job.
- Keep tenure points distinct from participation points, contributions, loans, cash, and withdrawal balances. No exchange rate, conversion, redemption or transfer exists in this release.
- Enable only for a controlled pilot with `MC_REWARDS_ENABLED=true` and `MC_MEMBERSHIP_ACCRUAL_ENABLED=true`. Both default off. The admin Rewards screen verifies history and the member Rewards screen shows progress. Historical corrections after enrollment require a separately designed audited workflow.

## MCC Earn — proposed testnet-only design

| Lock duration | Simple annual rate | Total reward at maturity |
|---|---:|---:|
| 3 months | 2% | 0.5% |
| 6 months | 3% | 1.5% |
| 1 year | 5% | 5% |
| 2 years | 10% | 20% |
| 3 years | 15% | 45% |

Only verified purchases through a supported DEX integration qualify. Ordinary membership allocations, transfers, gifts and unverified purchases do not generate eligibility. Since fungible tokens cannot carry reliable origin by themselves, a future supported purchase router must record net MCC acquired by the authenticated wallet; credit nontransferable purchase eligibility, consume it once at lock acceptance, and never infer purchase provenance solely from wallet balance. Require wallet authorization, replay protection, finalized purchase receipts and independent review of eligibility and transfer-handling policy before testnet acceptance. No production contract is implemented here.

Reserve the full promised token reward before accepting a lock; reject if the remaining 2B MCC Earn reserve is insufficient. A 1M MCC three-year lock would reserve 450,000 MCC in the simulation. Rewards are denominated in MCC, not guaranteed dollars. Define custody, maturity, cancellation, transfer handling and reward treatment before any pilot involving real assets.

### Implemented simulation lab

The staff-only Rewards page exposes the lab when both `MC_REWARDS_ENABLED=true` and `MC_EARN_SIMULATOR_ENABLED=true`. It operates on two synthetic wallets and an adjustable scenario clock. Mock DEX receipts are explicitly selected by the operator; these are not verified blockchain purchases. A case-insensitive unique receipt ID prevents replay within the scenario. Membership and unverified deposits create balance but not eligibility. Outgoing transfers invalidate sender eligibility first and do not create recipient eligibility. Locks consume eligibility and available balance permanently; at maturity principal and rounded-down whole-MCC rewards return to the wallet without eligibility. No early exit or compounding is modeled.

The reserve invariant is `available = 2B − reserved − paid`. Lock acceptance reserves the full reward; claim moves the amount from reserved to paid without replenishing the reserve. Synthetic deposits cannot exceed 98B MCC, leaving room for the 2B reward reserve. This aggregate ceiling does not model allocation-specific issuance or market prices. Calendar-month maturity clamps month ends; the scenario clock starts on a fixed synthetic date and advances only by operator action. All state is browser memory, resettable, and never persists to a database, real wallet, member record, or financial ledger. Testnet implementation requires a separate design for receipt finality, canonical chain/transaction identity, wallet authorization, custody, and legal review.

## Illustrative liquidity scenario

A hypothetical pool of 10M MCC and $1,000 of quote assets begins at a ratio of $0.0001 per MCC before fees and price impact, implying a $10M fully diluted valuation at the 100B cap. This is arithmetic, not a price forecast, market capitalization, funding guarantee, or commitment to provide liquidity. Do not use member contributions, operating reserves or loan capital for the pool. The remaining liquidity allocation is not automatically deployed.

## Release gates

An isolated local EVM prototype lives in [`web3/mcc-lab`](../../web3/mcc-lab/README.md). It uses fictional `tMCC`, zero initial supply, fixed allocation ceilings and synthetic receipt replay checks. It is **not** a public-testnet candidate; it rejects non-local chain IDs and has no deployment script. Gate #2 and the legal-review requirement remain unchanged.

1. Internal tenure accrual pilot and historical verification.
2. Separate MCC Earn simulation with reward reservation and purchase eligibility tests.
3. Independent legal, tax, accounting and treasury review; testnet contracts and audit only after approval.
4. Separate founder approval for any live issuance, trading, wallet withdrawal or liquidity deployment.
