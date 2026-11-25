# Decision log: MC Finance, MCC and production priorities

Decisions the founder gave on **2026-11-25**, recorded here so the code, the documents and later reviews agree. Where a decision needs a signature or an outside approval, that is stated: nothing below is a legal, tax or accounting opinion.

| # | Decision | Recorded status |
|---|---|---|
| D-20 | **Brand and domain.** The product is **MC Finance**; the official domain is **mcfinance.us**. *Millionaires Club* remains the membership organization and the named party in agreements. The GitHub repository keeps the name `mcfinancial`. | Decided. Brand change in review (PR #52). |
| D-21 | **Hosting.** Production runs on **Contabo**. The stack is unchanged (Docker Compose: app, PostgreSQL, Caddy). | Decided and deployed; repository documentation and migration verification in [deploy-contabo.md](../operations/deploy-contabo.md). |
| D-22 | **Priority.** Financial integrity and production readiness come before additional cryptocurrency features. MC Wallet and the MCC ecosystem continue after those foundations are verified. | Decided. |
| D-23 | **Tokenomics v1 parameters** are recorded as the founder's planning parameters (below). They are **planning values**, not an issuance, sale or commitment. | Recorded as stated by the founder. Founder to confirm and sign in the Gate #1 Part B decision record (open). |
| D-24 | **What is not authorized.** Public token issuance, live trading, guaranteed or promised returns, conversion of points to tokens, wallet withdrawal and liquidity deployment. Each needs separate legal, tax, accounting and treasury review and a separate founder approval. | In force. |
| D-25 | **The smart contract stays a local laboratory** (`web3/mcc-lab`, token `tMCC`, local chain only). No public testnet or mainnet deployment, no deployment script, no real keys. | In force. |
| D-26 | **Work split.** Claude Code: Contabo documentation and migration verification, rewards ledger protections, rewards permissions and maker/checker, membership correction workflow, tests and readiness documents. Codex: the MC Finance rebrand (PR #52), the membership card redesign, UI/UX and mobile testing, and the MC Wallet simulation after the core fixes. MCC contract architecture and testnet preparation are a later milestone. Overlapping files are coordinated, not edited in parallel. | Decided. |

## D-23: Tokenomics v1 parameters (planning)

- **Maximum supply (proposed):** 100,000,000,000 MCC. Allocation ceilings: membership tenure rewards 75B, liquidity reserve 10B, community development 5B, ecosystem 3B, MCC Earn reserve 2B, treasury 5B. An allocation is a ceiling, not circulating supply.
- **Membership:** up to 1,000,000 non-transferable internal tenure points per member over ten years of verified active membership, so at most 75,000 lifetime enrolments. Internal points have no cash value and no guaranteed conversion.
- **MCC Earn (testnet-only design):** lock terms of 3, 6, 12, 24 and 36 months at simple annual rates of 2%, 3%, 5%, 10% and 15%, paid in MCC from a 2B reserve, reserved in full before a lock is accepted. Only verified DEX purchases would qualify. **No return is guaranteed**; rewards are denominated in MCC, not dollars.
- Full detail: [15-mcc-tokenomics-v1.md](15-mcc-tokenomics-v1.md).

## Questions that remain open before any live token

1. Independent legal review of Earn (fixed rewards for locking tokens can look like an investment product) and of the points-to-token conversion.
2. A purchase-verification mechanism for "DEX-only eligibility" (plain ERC-20 tokens cannot carry their origin; see the review in [production-readiness.md](../operations/production-readiness.md)).
3. Contract governance: issuer key management, multisig, pause, rolling issuance limits, an independent audit.
4. Accounting treatment of points, the card fee and any token.
