import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { fromBigInt } from '@/lib/money'

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
