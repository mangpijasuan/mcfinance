# Member rewards and token roadmap

Status — proposal for discussion. This document adds an implementation sequence to the existing Web3 research. Supply, network, ticker and conversion terms remain undecided.

## Naming decision

| Candidate | Proposed meaning | Assessment |
| --- | --- | --- |
| MCC | Millionaires Club Coin | Existing working name in this repository. Recommended for consistency while exploring feasibility. |
| MCT | Millionaires Club Token | Alternative if the club prefers the word Token. Requires updates across product copy and architecture. |
| MC Points | Member recognition points | Proposed pilot name while benefit use is measured. |

The dollar prefix is a display convention for a proposed ticker. Name, ticker and trademark checks are still outstanding. Neither candidate is reserved by this document.

## Product goal

Recognize member participation and let members redeem earned rewards for benefits the club can actually provide. Candidate activities are verified educational sessions, volunteer participation and approved community events. Validate these with members before choosing earning rules.

## Delivery sequence

| Phase | Deliverable | Evidence to continue |
| --- | --- | --- |
| Public information | Landing page with member sign-in, services and clearly proposed roadmap | Links work on phone and desktop; member feedback recorded |
| Benefit design | Written benefit catalogue, eligibility, earning limits, corrections and support rules | Each benefit has an owner, a delivery cost and funding |
| Points pilot | Private member balance, activity history, benefit redemption and officer review | Members can understand, earn and use benefits; budget stays within its approved limit |
| Token feasibility | Compare the benefits of external wallets against points, research naming and network costs, obtain relevant specialist review | Written decision covering purpose, costs, operating responsibilities and distribution terms |
| Test environment | If selected, test contracts, wallet linking, capped issuance, claims and reconciliation with synthetic records | Supply invariants, replay resistance, access controls, recovery and independent review findings resolved |
| Release decision | Final terms, member instructions, support ownership and monitoring | Named decision maker accepts reviewed release evidence and funded operations |

These are proposed deliverables, with release decisions made when the relevant facts are available.

## Points implementation

Use PostgreSQL alongside the existing member database. Keep rewards accounting separate from USD contributions and loans.

- RewardRule records the activity, points, validity window, maximum awards and rule version.
- RewardEvent stores member ID, signed integer points, activity reference, rule version, actor, timestamp and a unique idempotency key. Corrections append reversing entries referencing the original.
- Benefit records an available benefit, points cost, capacity and fulfilment owner.
- Redemption records the member, benefit, points spent, pending/fulfilled/cancelled state and request idempotency key.
- Award and redemption services run inside database transactions. Lock the member reward account before spending, enforce capacity atomically, and append refunds on cancellation.
- Member endpoints read only the signed-in member's balance, history and redemptions. Officer permissions control award review and benefit management. Reuse existing authentication and audit events.
- Show available points, pending redemptions and completed benefits as separate values with plain explanations.

## Potential token architecture

If an external token is selected, keep identity, financial records and wallet links private in PostgreSQL. A contract would track token supply and issuance limits. A treasury wallet with multiple signers would control authorised administration. A settlement worker would reconcile uniquely identified claims against on-chain receipts before marking them complete.

Specify chain, transferability, supply cap, issuance schedule, treasury allocation, fees and key recovery only after the purpose and budget are agreed. Do not imply a points-to-token exchange rate or a market price while these are undecided. Public content should describe the approved stage accurately.

## Proposed milestones and acceptance

1. Ship the landing page and gather member questions.
2. Agree on the name and benefit catalogue.
3. Implement points behind a feature flag with award/reversal and concurrent redemption tests.
4. Pilot with a small member group and measure participation, redemption completion, support requests and benefit cost.
5. Decide whether outside-wallet usage adds sufficient value to proceed with token engineering.

The initial engineering scope is the landing page and this plan. Points accounting, contracts, token sales and blockchain deployment are future deliverables.
