# MCC local contract laboratory

**Not a deployable production or public testnet release.** This prototype uses the symbol `tMCC` and refuses deployment unless the chain ID is 31337. Tests run exclusively on an ephemeral in-process EVM, without RPC access, keys, public transactions or member records. No deployment script is included. This is a reversible engineering exercise; the existing Gate #2 and legal-review requirements remain in force for actual contract development/deployment.

## Run

Use Node.js 22 or newer. From this directory:

```sh
npm ci --ignore-scripts
npm test
```

Tests compile the Solidity source with pinned solc and OpenZeppelin versions and exercise the resulting bytecode in an isolated network. The wrong-chain test intentionally checks chain ID 84532 in a second **local** simulation. It sends nothing to Base Sepolia.

## Behavior

- The OpenZeppelin ERC-20 has zero initial supply, 18 decimals, and an immutable 100B-unit cap.
- A single immutable lab minter is the only mint authority. Six distinct fictional operators have a separate hard lifetime cap for each allocation (75B membership, 10B liquidity, 5B community, 3B ecosystem, 2B Earn, 5B treasury).
- The prototype requires positive synthetic amounts, unique synthetic receipts and independent per-allocation 30-day test-window ceilings. The test fixtures deliberately choose these limits; no production issuance rate has been approved.
- Wallet transfers are normal ERC-20 transfers within the local EVM. No DEX, live wallet, conversion, member reward claim, MCC Earn settlement, or real liquidity mechanism is implemented.

## Production boundaries

Do not reuse the lab source as a production deployment artifact or change the chain guard to bypass the release gate. Before preparing a separate public-testnet candidate, obtain Gate #2 and legal/accounting approval; decide chain, production issuance cadence, per-member eligibility and settlement, multisig/timelock and emergency mint pause governance, contract audits and independent testnet release approvals. No actual member identity or financial records (including hashed identifiers) belong on-chain. The approved tokenomics determine proposed maxima—not the timing, price, or guarantee of issuance. No mainnet deployment or token sales are authorized.
