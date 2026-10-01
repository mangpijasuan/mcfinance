import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { type Cents, formatUSD, parseDollars } from '@/lib/money'
import { isIsoDate } from '@/lib/dates'
import { badRequest, readJsonObject } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { submitOrExecute } from '@/modules/approvals'
import { DEFAULT_CUTOVER, type OpeningInputs, checkOpening, planOpening, reconcile } from '@/modules/accounting/opening'

function dollars(value: unknown): Cents | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  try {
    return parseDollars(typeof value === 'number' ? value : String(value).replace(/^\$/, ''))
  } catch {
    return 'invalid'
  }
}

// The opening-balance report (M4): what would be posted, and every check.
export async function GET(req: NextRequest) {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error

  const q = new URL(req.url).searchParams
  const cutover = q.get('cutover') || DEFAULT_CUTOVER
  if (!isIsoDate(cutover)) return badRequest('cutover must be YYYY-MM-DD.')
  const bank = dollars(q.get('bankBalance'))
  if (bank === 'invalid') return badRequest('The bank balance must be a dollar amount.')
  const plan = await planOpening(prisma, { cutover, bankBalanceCents: bank, confirmedLoanBalances: {} })
  // Once posted, the checks compare the actual ledger with the old records.
  const actual = await reconcile(prisma)
  const checks = actual ? { memberCapital: actual.memberCapital, loans: actual.loans } : plan.report.checks
  return NextResponse.json({ ...plan.report, checks, openingHash: plan.openingHash })
}

// Propose posting them. Always needs a second person (ledger approval).
export async function POST(req: NextRequest) {
  const auth = await requirePermission('ledger.manage_accounts')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const cutover = body.cutover || DEFAULT_CUTOVER
  if (!isIsoDate(cutover)) return badRequest('cutover must be YYYY-MM-DD.')
  const bank = dollars(body.bankBalance)
  if (bank === 'invalid') return badRequest('The bank balance must be a dollar amount.')
  if (body.confirmLoans !== true) return badRequest('Confirm that the loan balances at the cutover have been checked.')
  const confirmed: Record<string, Cents> = {}
  for (const [loanId, value] of Object.entries(body.confirmedLoanBalances ?? {})) {
    const amount = dollars(value)
    if (amount === null || amount === 'invalid' || amount < 0) return badRequest(`Confirmed balance for ${loanId} must be a dollar amount.`)
    confirmed[loanId] = amount
  }
  const inputs: OpeningInputs = { cutover, bankBalanceCents: bank, confirmedLoanBalances: confirmed }

  try {
    const plan = await checkOpening(prisma, inputs)
    const r = plan.report
    const out = await submitOrExecute({
      action: 'ledger.opening_balances',
      principal: auth.principal,
      req,
      amountCents: null,
      entityType: 'ledger',
      entityId: 'opening-balances',
      summary: `Opening balances at ${r.openingDate}: member capital ${formatUSD(r.memberCapital.totalCents)}, bank ${formatUSD(r.bankCents!)}, loans ${formatUSD(r.loansTotalCents)}; opening equity (9000) ${formatUSD(r.openingEquityCents)}. ${r.anomalies.length} item(s) to review, ${r.checks.memberCapital.length + r.checks.loans.length} difference(s) with the old records.`,
      payload: { ...inputs, bankBalanceCents: bank!, openingHash: plan.openingHash },
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json(out.result)
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
