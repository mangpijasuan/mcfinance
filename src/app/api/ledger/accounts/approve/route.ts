import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, readJsonObject, requiredString } from '@/lib/http'
import { requirePermission } from '@/modules/auth'
import { auditContext, recordAudit } from '@/modules/audit'
import { approveAccounts } from '@/modules/accounting/ledger'

// Records that the club's accountant has confirmed the proposed chart of
// accounts (Gate #1 A13). Until then the ledger accepts no postings.
export async function POST(req: NextRequest) {
  const auth = await requirePermission('ledger.manage_accounts')
  if (auth.error) return auth.error

  const body = await readJsonObject(req)
  if (!body) return badRequest('Invalid request body.')
  const note = requiredString(body.note)
  if (!note || note.length < 10) {
    return badRequest('Say who confirmed the chart of accounts and when (for example the accountant’s name and the date of their letter).')
  }
  if (body.confirm !== true) return badRequest('Confirm that the accountant has approved these accounts.')

  const result = await prisma.$transaction(async (tx) => {
    const proposed = await tx.ledgerAccount.findMany({ where: { status: 'proposed' }, orderBy: { code: 'asc' } })
    if (proposed.length === 0) return null
    const count = await approveAccounts(tx, { codes: proposed.map((a) => a.code), approvedBy: auth.principal.id, note })
    await recordAudit(tx, auditContext(req, auth.principal), {
      action: 'ledger.accounts.approve', entityType: 'ledger', entityId: 'chart-of-accounts',
      before: proposed.map((a) => ({ code: a.code, name: a.name, type: a.type, status: a.status })),
      metadata: { approved: count, note },
    })
    return count
  })
  if (result === null) return NextResponse.json({ error: 'There are no proposed accounts to approve.' }, { status: 409 })
  return NextResponse.json({ approved: result })
}
