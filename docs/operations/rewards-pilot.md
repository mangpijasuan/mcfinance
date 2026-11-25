# MC Points pilot

This first increment adds an internal points ledger and a member history screen. It is disabled by default. Each award or correction has an activity reference unique to that member. Reusing that reference with the same details returns the existing entry.

Staff with the existing staff-management permission can record approved activity and corrections. The member can see their own points and recent activity only. Balances are separate from dues, contribution balances and loans. Points have no cash value.

To run an approved pilot, apply the database migration and set MC_REWARDS_ENABLED=true in .env.production, then recreate the app. The navigation links appear on both workspaces. Before enabling, choose an approved activity list and specify who reviews each activity. The initial pilot uses manual recording, whole points, an entry limit of 1,000 points and a balance limit of 1,000,000 points. These are engineering guardrails, not a final rewards policy.

For the separate membership-tenure pilot, also set `MC_MEMBERSHIP_ACCRUAL_ENABLED=true` after reviewing the migration. In Admin → Rewards, find a member, verify historical active days from club records and enter a verification note. The member sees accrued internal tenure points in the portal. Status changes automatically pause or resume accrual. Do not enter sensitive details in the note. Disable the pilot flags to hide the features; accumulated history remains intact. Review the [MCC tokenomics specification](../architecture/15-mcc-tokenomics-v1.md) before enabling.

Configurable participation reward rules, benefits and redemption remain future work. Any on-chain token, conversion and wallet linking are future work. See the [roadmap](../architecture/14-member-rewards-roadmap.md).


## Who can do what (maker/checker)

- **Finance** (`rewards.record`) proposes every award or correction. Nothing is recorded yet: it appears in *Approvals*.
- **Treasurer or Board** (`rewards.approve`) approves it, and only then do the points appear. The person who proposed an entry can never approve it.
- Everyone who can view finances (`rewards.read`) sees members' points. The Administrator role has no access.
- An entry that would break a limit (inactive member, balance outside 0 to 1,000,000, a reused reference with different details) is refused when proposed.

## What the database enforces

Not only the application: the database refuses, whatever connects to it, to change or delete a points entry (the table is append-only, like the audit log), to record a balance outside 0 to 1,000,000, an entry outside ±1,000, a blank reference or reason, an unknown staff account, or the same person as proposer and approver. A wrong entry is corrected with a new, offsetting entry (also approved by a second person). Each entry records who proposed it and who approved it.

## Verifying and correcting membership history

Ten-year membership points depend on each member's verified active days, so both the first verification and every later correction need two people and leave a permanent record.

- **Verify (first time):** Finance enters the confirmed active days and the evidence (for example the sheet or application it came from). It is sent to *Approvals*; the Treasurer or a Board member checks the evidence and approves. Until then the member sees "Awaiting verification".
- **Correct:** *MC Rewards* → the member → **Correct membership history** shows the stored days and the join date in use. Finance enters the days to add or take away (not a new total, so a late approval cannot overwrite days earned in the meantime) and the reason with its evidence. If the stored days change before approval, the approval is refused and a new correction must be proposed. A correction can never make the days negative or more than the days elapsed since the join date.
- **Join date drift:** if the member record's join date is edited after verification, the screen says so, and a correction can adopt the new date (it must still fit the stored days).
- **History:** every verification and correction is listed on the member's screen (who proposed it, who approved it, before and after, the reason), written to the audit log, and kept in an append-only table the database will not let anyone edit or delete. Accrual rows themselves cannot be deleted, and the database refuses verified days beyond the elapsed days, an unknown staff account, or the same person as proposer and approver.
