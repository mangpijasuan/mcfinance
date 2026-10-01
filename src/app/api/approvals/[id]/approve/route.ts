import { NextRequest, NextResponse } from 'next/server'
import { readJsonObject } from '@/lib/http'
import { operationErrorResponse } from '@/lib/operationError'
import { requirePermission } from '@/modules/auth'
import { decideApproval } from '@/modules/approvals'

// A checker approves: the operation runs now, in the same transaction.
// Who may decide depends on the action (D-06); the maker never may.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('approvals.view')
  if (auth.error) return auth.error
  const { id } = await params
  const body = (await readJsonObject(req)) ?? {}
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : null
  try {
    return NextResponse.json(await decideApproval(id, auth.principal, 'approve', note, req))
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
