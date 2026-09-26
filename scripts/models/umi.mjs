// Universal Member Income (UMI) funding model (research only).
// Run: node scripts/models/umi.mjs
// All money is integer cents; rates are basis points. Every cost parameter is
// an assumption to be replaced with real quotes before any decision.

const MEMBER_COUNTS = [100, 1_000, 10_000, 100_000, 1_000_000]
const MONTHLY_BENEFIT_CENTS = [500, 1_000, 2_500] // $5, $10, $25 per member per month

const PAYOUT_COST_CENTS = 30 // per individual monthly payout
const ADMIN_BPS = 800 // 8% of gross: operations, support, compliance
const FRAUD_BPS = 200 // 2% of gross lost to fraud / errors
const KYC_CENTS_PER_MEMBER_YEAR = 150 // identity re-verification, amortised
const RESERVE_MONTHS = 6 // months of gross benefit held in reserve
const ENDOWMENT_YIELD_BPS = 400 // sustainable real yield if funded from an endowment

// Anchors from the current database / loan policy
const ACTIVE_MEMBERS = 114
const CONTRIBUTIONS_2025_CENTS = 2_512_000 // $25,120 recorded for 2025
const LOANS_PER_YEAR = 24
const AVG_APPLICATION_FEE_CENTS = 5_000 // $30–$70 by policy; fees are not recorded in the system today

const bps = (cents, rate) => Math.round((cents * rate) / 10_000)
const usd = (cents) => `$${Math.round(cents / 100).toLocaleString('en-US')}`

function model(members, benefit) {
  const gross = members * benefit * 12
  const payout = members * 12 * PAYOUT_COST_CENTS
  const admin = bps(gross, ADMIN_BPS)
  const fraud = bps(gross, FRAUD_BPS)
  const kyc = members * KYC_CENTS_PER_MEMBER_YEAR
  const total = gross + payout + admin + fraud + kyc
  return {
    monthly: members * benefit,
    gross,
    overhead: payout + admin + fraud + kyc,
    total,
    reserve: members * benefit * RESERVE_MONTHS,
    endowment: Math.round((total * 10_000) / ENDOWMENT_YIELD_BPS),
  }
}

const out = []
out.push('| Members | Benefit/mo | Monthly payout | Annual benefit | Annual overhead | Annual funding needed | Reserve | Endowment @4% |')
out.push('|---:|---:|---:|---:|---:|---:|---:|---:|')
for (const n of MEMBER_COUNTS) {
  for (const b of MONTHLY_BENEFIT_CENTS) {
    const r = model(n, b)
    out.push(`| ${n.toLocaleString('en-US')} | ${usd(b)} | ${usd(r.monthly)} | ${usd(r.gross)} | ${usd(r.overhead)} | ${usd(r.total)} | ${usd(r.reserve)} | ${usd(r.endowment)} |`)
  }
}
out.push('')
out.push(`Current club (${ACTIVE_MEMBERS} active members) against its own inflows:`)
out.push('')
out.push('| Benefit/mo | Annual funding needed | % of 2025 contributions | Years of estimated fee revenue |')
out.push('|---:|---:|---:|---:|')
const feeRevenue = LOANS_PER_YEAR * AVG_APPLICATION_FEE_CENTS
for (const b of MONTHLY_BENEFIT_CENTS) {
  const r = model(ACTIVE_MEMBERS, b)
  out.push(`| ${usd(b)} | ${usd(r.total)} | ${((r.total * 100) / CONTRIBUTIONS_2025_CENTS).toFixed(0)}% | ${(r.total / feeRevenue).toFixed(1)} |`)
}
out.push('')
out.push(`Estimated non-contribution revenue: ${LOANS_PER_YEAR} loans × ${usd(AVG_APPLICATION_FEE_CENTS)} average application fee ≈ ${usd(feeRevenue)}/yr (loans are interest-free).`)

console.log(out.join('\n'))
