# MC Points pilot

This first increment adds an internal points ledger and a member history screen. It is disabled by default. Each award or correction has an activity reference unique to that member. Reusing that reference with the same details returns the existing entry.

Staff with the existing staff-management permission can record approved activity and corrections. The member can see their own points and recent activity only. Balances are separate from dues, contribution balances and loans. Points have no cash value.

To run an approved pilot, apply the database migration and set MC_REWARDS_ENABLED=true in .env.production, then recreate the app. The navigation links appear on both workspaces. Before enabling, choose an approved activity list and specify who reviews each activity. The initial pilot uses manual recording, whole points, an entry limit of 1,000 points and a balance limit of 1,000,000 points. These are engineering guardrails, not a final rewards policy.

The next increment adds configurable reward rules, benefits, a redemption request workflow and separate approval permissions. Any on-chain token, conversion and wallet linking are future work. See the [roadmap](../architecture/14-member-rewards-roadmap.md).
