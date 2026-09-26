// Generates prisma/demo-data.json: a SYNTHETIC club for development, demos
// and screenshots (Gate #1 A15). Every person, amount and date is invented
// by a seeded random generator; nothing is derived from real member data.
// The output is deterministic, so re-running produces the same file.
//
//   node scripts/generate-demo-data.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// mulberry32: small, deterministic PRNG
let state = 0x5eed2026
function rand() {
  state |= 0; state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (xs) => xs[Math.floor(rand() * xs.length)]
const chance = (p) => rand() < p
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const FIRST = ['Avery', 'Blake', 'Casey', 'Dana', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Tatum', 'Umber', 'Vale', 'Wren', 'Xen', 'Yael', 'Zion']
const LAST = ['Ashdown', 'Birchfield', 'Coldwater', 'Dunmore', 'Elderberry', 'Foxglove', 'Greystone', 'Hollowell', 'Ironwood', 'Juniper', 'Kestrel', 'Larkspur', 'Mapleton', 'Northcote', 'Oakhurst', 'Pinecrest', 'Quarrington', 'Rookwood', 'Silverbirch', 'Thornbury']

// "Today" for the demo club, so the data never drifts.
const AS_OF = { year: 2026, month: 9 }
const MONTHLY = 20
const MEMBER_COUNT = 64

const members = []
const yearlyTotals = []
const contributions = []
const usedNames = new Set()

for (let i = 0; i < MEMBER_COUNT; i++) {
  let name
  do { name = `${pick(FIRST)} ${pick(LAST)}` } while (usedNames.has(name))
  usedNames.add(name)
  const id = `MC-${90001 + i}`
  const joinYear = 2013 + Math.floor(rand() * 12) // 2013–2024
  const joinMonth = 1 + Math.floor(rand() * 12)
  const active = chance(0.7)

  // Yearly archive totals up to the end of last year.
  let archive = 0
  for (let y = joinYear; y < AS_OF.year; y++) {
    const months = y === joinYear ? 13 - joinMonth : 12
    const paidMonths = active ? months : Math.max(0, months - Math.floor(rand() * months))
    const amount = paidMonths * (y < 2020 ? 15 : MONTHLY)
    if (amount > 0) yearlyTotals.push({ memberId: id, year: y, amount })
    archive += amount
  }

  // This year's contributions, month by month.
  let thisYear = 0
  let last = null
  const method = pick(['Auto-pay', 'Auto-pay', 'Online', 'Cash'])
  if (active) {
    for (let m = 1; m <= AS_OF.month; m++) {
      if (chance(0.08)) continue // an occasional missed month
      const day = method === 'Auto-pay' ? 15 : 1 + Math.floor(rand() * 27)
      contributions.push({
        transactionId: `CON-D${String(contributions.length + 1).padStart(5, '0')}`,
        memberId: id,
        memberName: name,
        paymentDate: iso(AS_OF.year, m, day),
        monthYear: `${MONTHS[m - 1]}-${AS_OF.year}`,
        amount: MONTHLY,
        paymentMethod: method,
        receivedBy: method === 'Cash' ? 'Demo Treasurer' : null,
        comments: null,
        source: MONTH_NAMES[m - 1],
      })
      thisYear += MONTHLY
      last = iso(AS_OF.year, m, day)
    }
  }

  const monthsActive = (AS_OF.year - joinYear) * 12 + (AS_OF.month - joinMonth)
  members.push({
    id,
    legalName: name,
    nickname: chance(0.3) ? name.split(' ')[0] : null,
    joinDate: iso(joinYear, joinMonth, 1),
    status: active ? 'Active' : 'Inactive',
    phoneNo: chance(0.6) ? `555-01${String(i).padStart(2, '0')}` : null,
    email: chance(0.6) ? `${name.toLowerCase().replace(' ', '.')}@example.test` : null,
    beneficiary: null,
    notes: null,
    archiveLifetime: archive,
    contributions2026: thisYear,
    overallContributions: archive + thisYear,
    monthsActive,
    maxLoanAmount: active && monthsActive >= 12 ? 5000 : 0,
    currentLoanBalance: 0,
    eligible: active && monthsActive >= 12 ? 'YES' : active ? 'NO - Under 12 months' : 'NO - Inactive',
    activeAsBorrower: 0,
    activeAsCosigner: 0,
    lastContributionDate: last,
    thisMonth: contributions.some((c) => c.memberId === id && c.monthYear === `${MONTHS[AS_OF.month - 1]}-${AS_OF.year}`) ? 'PAID' : 'NOT PAID',
    riskFlag: 'LOW',
  })
}

// Loans: a handful of active ones with repayments, between eligible members.
const eligible = members.filter((m) => m.eligible === 'YES')
const loans = []
const loanPayments = []
for (let i = 0; i < 6; i++) {
  const borrower = eligible[i * 3]
  const cosigner = eligible[i * 3 + 1]
  const amount = pick([600, 1000, 1500, 2400, 3000, 5000])
  const term = pick([6, 10, 12, 24])
  const startMonth = 1 + i
  const monthly = Math.round((amount / term) * 100) / 100
  let paid = 0
  for (let m = startMonth + 1; m <= AS_OF.month && paid < amount; m++) {
    const pay = Math.min(monthly, Math.round((amount - paid) * 100) / 100)
    loanPayments.push({
      paymentId: `LP-D${String(loanPayments.length + 1).padStart(4, '0')}`,
      loanId: `LD${String(i + 1).padStart(2, '0')}`,
      borrowerId: borrower.id,
      borrowerName: borrower.legalName,
      paymentDate: iso(AS_OF.year, m, 10),
      amount: pay,
      paymentMethod: 'Online',
      receivedBy: null,
      comments: null,
      source: 'Demo',
      monthYear: `${MONTHS[m - 1]}-${AS_OF.year}`,
    })
    paid = Math.round((paid + pay) * 100) / 100
  }
  const balance = Math.round((amount - paid) * 100) / 100
  const end = new Date(Date.UTC(AS_OF.year, startMonth - 1 + term, 10)).toISOString()
  loans.push({
    loanId: `LD${String(i + 1).padStart(2, '0')}`,
    borrowerId: borrower.id,
    borrowerName: borrower.legalName,
    cosignerId: cosigner.id,
    cosignerName: cosigner.legalName,
    loanDate: iso(AS_OF.year, startMonth, 5),
    termMonths: term,
    loanAmount: amount,
    monthlyDue: monthly,
    totalPaid: paid,
    balanceRemaining: balance,
    status: balance > 0 ? 'Active' : 'Paid Off',
    endDate: end,
    nextDueDate: balance > 0 ? iso(AS_OF.year, AS_OF.month + 1, 10) : null,
    overdue: i === 2 && balance > 0,
  })
  if (balance > 0) {
    borrower.activeAsBorrower = 1
    borrower.currentLoanBalance = balance
    borrower.eligible = 'NO - Active Loan/Cosign'
    cosigner.activeAsCosigner = 1
    cosigner.eligible = 'NO - Active Loan/Cosign'
  }
}

// Historical (pre-system) loans, all repaid, for the Loan History screen.
const historicalLoans = []
for (let i = 0; i < 24; i++) {
  const year = 2021 + (i % 5)
  const borrower = pick(members)
  const cosigner = pick(members)
  const amount = pick([500, 1000, 1500, 2000, 3000])
  historicalLoans.push({
    loanId: `HD${year}${String(i + 1).padStart(2, '0')}`,
    year,
    borrowerName: borrower.legalName,
    cosignerName: cosigner.id === borrower.id ? null : cosigner.legalName,
    loanDate: iso(year, 1 + (i % 12), 1),
    endDate: iso(year + 1, 1 + (i % 12), 1),
    loanAmount: amount,
    totalPaid: amount,
    balanceRemaining: 0,
    status: 'Paid Off',
  })
}

const out = {
  _notice: 'SYNTHETIC DEMO DATA generated by scripts/generate-demo-data.mjs. No real people. Never load into production.',
  members, yearlyTotals, contributions, loans, loanPayments, historicalLoans,
}
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'demo-data.json')
writeFileSync(file, JSON.stringify(out, null, 1) + '\n')
console.log(`wrote ${path.relative(process.cwd(), file)}: ${members.length} members, ${yearlyTotals.length} yearly totals, ${contributions.length} contributions, ${loans.length} loans, ${loanPayments.length} loan payments, ${historicalLoans.length} historical loans`)
