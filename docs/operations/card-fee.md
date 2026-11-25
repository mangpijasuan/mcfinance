# Card fee and online payment methods

Members choose how to pay on the **Pay** page. In order of cost to the club:

| Choice | Fee to the member | Cost to the club (Stripe, check current prices) | How it is credited |
|---|---|---|---|
| **Zelle** | none | none | An officer confirms the claim once the money shows in the bank |
| **Bank (ACH)** | none | about 0.8%, capped at $5 | Automatically, when the bank debit settles (a few days) |
| **Card or Apple Pay** | the card fee, if switched on | about 2.9% + 30¢ | Automatically, at once |

Apple Pay and Google Pay are charged as cards, so they carry the card fee too.

## Switching the card fee on

It is **off** until `CARD_FEE_PERCENT` is set in `.env.production` and the stack restarted:

```
CARD_FEE_PERCENT="3"
```

- The value can never be above **3**; a higher number is treated as 3. Empty, `0` or a non-number means no fee.
- Before switching it on, the board and counsel confirm the surcharge is allowed where the club and its members are (see below), and the notices to the card networks are done. This is a board decision (Q-11), like the other switches in the [go-live checklist §8](go-live-checklist.md#8-left-off-on-purpose).

## What the member sees and what is recorded

- On the Pay page, choosing **Card or Apple Pay** shows their payment, the fee, and the **total charged to the card**, before they continue. Stripe's page shows the same two lines (the payment, and "Card fee (3%)").
- The member is credited the amount they chose. The fee is never part of a contribution or a loan repayment, so balances, *Year by year* and the monthly report are unaffected.
- The fee is kept on the online payment record (`PortalPayment.feeCents`), shown in the member's payment requests list, and noted on the contribution or repayment's comment ("card fee 0.75 collected separately").
- The fee is not posted to the ledger as income yet. Its accounting treatment (income, or a recovery of Stripe's fee) is for the accountant to decide before the ledger cutover.

## Rules to check (not legal advice)

- The card networks cap a surcharge at **3%**, and it cannot be more than what the club pays to accept the card. On small payments Stripe's 30¢ makes the real cost higher than 3%.
- Surcharging **debit** cards is not allowed, and the app cannot tell credit from debit before the member enters the card. Counsel decides whether a flat fee on all cards is acceptable, or whether to offer card only as a fee-free-to-the-club choice.
- A few places restrict or ban card surcharges (for example Connecticut, Massachusetts, Puerto Rico; Colorado caps it at 2%). Check the state of the club and of its members.
- The fee must be shown before payment (the Pay page does) and on the receipt.
- Visa and Mastercard ask the merchant to notify them before starting a surcharge; Stripe has its own surcharging rules in the Dashboard.

## Setting up Stripe for these methods

1. Open the club's Stripe account and add its bank account.
2. *Settings → Payment methods*: turn on **Cards** (with Apple Pay and Google Pay) and **ACH Direct Debit**.
3. *Settings → Branding*: the logo, colours and name members see.
4. *Settings → Payment methods → Apple Pay*: add the member app's domain (the real `app.` address, once `mcfinancial.us` exists; Apple Pay does not work on the trial `sslip.io` address).
5. *Developers → Webhooks*: add `https://<member app address>/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and the `charge.refunded` / `charge.dispute.*` events. Put the key and the signing secret in `.env.production` as `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
6. Make one real test: a small payment by bank, then one by card, and check each appears in *Contributions* with the right amount.

A bank debit can be returned days later (for example for insufficient funds). Stripe reports it as a failed payment or a dispute; the app holds those events for the Treasurer to reverse the contribution the normal way (*Contributions → Reverse*), and Stripe charges the club a fee for the return.
