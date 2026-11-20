/** Isolated, in-memory model. Never reads wallets, signs transactions or moves real MCC. */
export const EARN_RESERVE = 2_000_000_000
export const SIMULATED_PRINCIPAL_LIMIT = 98_000_000_000
const LAST_SCENARIO_DATE = '2099-12-31'
export const EARN_TERMS = [
  { months: 3, aprBps: 200 }, { months: 6, aprBps: 300 },
  { months: 12, aprBps: 500 }, { months: 24, aprBps: 1000 }, { months: 36, aprBps: 1500 },
] as const
export type Wallet = 'A' | 'B'
export type Source = 'dex' | 'membership' | 'unverified'
type Balance = { available: number; eligible: number }
export type Lock = { id: number; wallet: Wallet; principal: number; months: number; aprBps: number; reward: number; opened: string; matures: string; claimed: boolean }
export type EarnSimulation = {
  date: string; wallets: Record<Wallet, Balance>; receipts: string[]; deposited: number;
  reserve: number; reserved: number; paid: number; locks: Lock[];
}

export function createSimulation(date = '2026-01-01'): EarnSimulation {
  return { date, wallets: { A: { available: 0, eligible: 0 }, B: { available: 0, eligible: 0 } }, receipts: [], deposited: 0, reserve: EARN_RESERVE, reserved: 0, paid: 0, locks: [] }
}

function amountCheck(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a positive whole MCC amount.')
}

export function calculateEarnReward(principal: number, months: number) {
  amountCheck(principal)
  if (principal > SIMULATED_PRINCIPAL_LIMIT) throw new Error('Amount exceeds the simulation supply limit.')
  const term = EARN_TERMS.find(t => t.months === months)
  if (!term) throw new Error('Choose a supported lock period.')
  // Exact integer arithmetic, rounded down to whole simulated MCC.
  return Number(BigInt(principal) * BigInt(term.aprBps) * BigInt(months) / BigInt(120000))
}

function maturity(date: string, months: number) {
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months + 1, 0))
  end.setUTCDate(Math.min(start.getUTCDate(), end.getUTCDate()))
  return end.toISOString().slice(0, 10)
}

export function simulateDeposit(state: EarnSimulation, wallet: Wallet, receipt: string, amount: number, source: Source): EarnSimulation {
  amountCheck(amount)
  const id = receipt.trim().toLowerCase()
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('Enter a unique synthetic receipt ID (letters, numbers, hyphens).')
  if (state.receipts.includes(id)) throw new Error('Receipt already recorded.')
  if (amount > SIMULATED_PRINCIPAL_LIMIT - state.deposited) throw new Error('Simulation supply limit exceeded.')
  const b = state.wallets[wallet]
  return { ...state, deposited: state.deposited + amount, receipts: [...state.receipts, id], wallets: { ...state.wallets, [wallet]: { available: b.available + amount, eligible: b.eligible + (source === 'dex' ? amount : 0) } } }
}

export function simulateTransfer(state: EarnSimulation, from: Wallet, amount: number): EarnSimulation {
  amountCheck(amount)
  const to = from === 'A' ? 'B' : 'A'
  const sender = state.wallets[from], recipient = state.wallets[to]
  if (amount > sender.available) throw new Error('Insufficient available simulated MCC.')
  // Conservative proposed rule: outgoing tokens consume eligibility first;
  // transfers never produce new eligibility, even back to the original wallet.
  return { ...state, wallets: { [from]: { available: sender.available - amount, eligible: Math.max(0, sender.eligible - amount) }, [to]: { ...recipient, available: recipient.available + amount } } as Record<Wallet, Balance> }
}

export function simulateLock(state: EarnSimulation, wallet: Wallet, principal: number, months: number): EarnSimulation {
  const reward = calculateEarnReward(principal, months)
  const term = EARN_TERMS.find(t => t.months === months)!
  const balance = state.wallets[wallet]
  if (principal > balance.eligible || principal > balance.available) throw new Error('Only unused verified DEX purchase eligibility can be locked.')
  if (reward === 0) throw new Error('Amount is too small for a whole-MCC reward.')
  if (reward > state.reserve - state.reserved - state.paid) throw new Error('Insufficient uncommitted MCC Earn reserve.')
  const matures = maturity(state.date, months)
  if (matures > LAST_SCENARIO_DATE) throw new Error('Maturity exceeds the simulation date limit.')
  const lock: Lock = { id: state.locks.length + 1, wallet, principal, months, aprBps: term.aprBps, reward, opened: state.date, matures, claimed: false }
  return { ...state, reserved: state.reserved + reward, locks: [...state.locks, lock], wallets: { ...state.wallets, [wallet]: { available: balance.available - principal, eligible: balance.eligible - principal } } }
}

export function advanceSimulation(state: EarnSimulation, days: number): EarnSimulation {
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) throw new Error('Advance by 1–3,650 whole days.')
  const next = new Date(`${state.date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  const date = next.toISOString().slice(0, 10)
  if (date > LAST_SCENARIO_DATE) throw new Error('Simulation date limit exceeded.')
  return { ...state, date }
}

export function simulateClaim(state: EarnSimulation, wallet: Wallet, id: number): EarnSimulation {
  const lock = state.locks.find(l => l.id === id && l.wallet === wallet)
  if (!lock || lock.claimed) throw new Error('No unclaimed lock for this wallet.')
  if (state.date < lock.matures) throw new Error('Lock has not matured.')
  const balance = state.wallets[wallet]
  return { ...state, reserved: state.reserved - lock.reward, paid: state.paid + lock.reward,
    locks: state.locks.map(l => l.id === id ? { ...l, claimed: true } : l),
    wallets: { ...state.wallets, [wallet]: { ...balance, available: balance.available + lock.principal + lock.reward } },
  }
}
