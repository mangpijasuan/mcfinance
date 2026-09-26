import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { MoneyError, cents, formatUSD, fromBigInt, parseDollars } from '@/lib/money'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { LedgerError, validateEntry, type EntryInput } from '@/modules/accounting/ledger'
import { submitOrExecute } from '@/modules/approvals'

// The journal, newest first, cursor-paginated. Amounts are integer cents.
export async function GET(req: NextRequest) {
  const auth = await requirePermission('ledger.read')
  if (auth.error) return auth.error
  const s = new URL(req.url).searchParams
  const limit = Math.min(100, Math.max(1, parseInt(s.get('limit') || '25') || 25))
  const cursor = s.get('cursor')
  const rows = await prisma.journalEntry.findMany({
    orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lines: { orderBy: { lineNo: 'asc' } } },
  })
  const page = rows.slice(0, limit)
  return NextResponse.json({
    entries: page.map((e) => ({
      id: e.id, entryNumber: e.entryNumber, effectiveDate: e.effectiveDate.toISOString().slice(0, 10), type: e.type,
      description: e.description, reference: e.reference, reversesEntryId: e.reversesEntryId,
      createdBy: e.createdBy, approvedBy: e.approvedBy, postedAt: e.postedAt,
      lines: e.lines.map((l) => ({
        account: l.accountCode, memberId: l.memberId, loanId: l.loanId, memo: l.memo,
        debit: fromBigInt(l.debitCents), credit: fromBigInt(l.creditCents),
      })),
    })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  })
}

// Propose a manual journal entry (an adjustment). It always waits for a
// checker (D-06); amounts are dollar strings such as "12.50".
export async function POST(req: NextRequest) {
  const auth = await requirePermission('ledger.propose')
  if (auth.error) return auth.error
  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const description = requiredString(body.description)
  if (!description) return badRequest('Describe the adjustment and why it is needed.')
  if (!Array.isArray(body.lines)) return badRequest('lines must be a list.')

  let entry: EntryInput
  try {
    entry = {
      effectiveDate: String(body.effectiveDate ?? ''),
      type: 'adjustment',
      description,
      reference: requiredString(body.reference),
      idempotencyKey: `manual:${randomUUID()}`,
      lines: body.lines.map((l: any) => ({
        account: String(l?.account ?? ''),
        debit: l?.debit ? parseDollars(String(l.debit)) : undefined,
        credit: l?.credit ? parseDollars(String(l.credit)) : undefined,
        memberId: requiredString(l?.memberId),
        loanId: requiredString(l?.loanId),
        memo: requiredString(l?.memo),
      })),
    }
    const totals = validateEntry(entry)
    const codes = Array.from(new Set(entry.lines.map((l) => l.account)))
    const approved = await prisma.ledgerAccount.count({ where: { code: { in: codes }, status: 'approved' } })
    if (approved !== codes.length) {
      return NextResponse.json({ error: 'Every account must exist and be approved; the chart of accounts may still await the accountant.' }, { status: 422 })
    }
    const out = await submitOrExecute({
      action: 'journal.manual',
      principal: auth.principal,
      req,
      amountCents: totals.debits,
      entityType: 'journal_entry',
      entityId: entry.idempotencyKey,
      summary: `Manual entry (${entry.effectiveDate}): ${description} — ${formatUSD(cents(totals.debits))}`,
      payload: entry,
    })
    if ('queued' in out) return NextResponse.json({ approvalRequest: out.queued }, { status: 202 })
    return NextResponse.json(out.result, { status: 201 })
  } catch (err) {
    if (err instanceof MoneyError || err instanceof LedgerError) return badRequest(err.message)
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
