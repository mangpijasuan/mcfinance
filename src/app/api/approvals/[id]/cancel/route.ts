import { NextRequest, NextResponse } from 'next/server'
import { operationErrorResponse } from '@/lib/operationError'
import { requirePermission } from '@/modules/auth'
import { cancelApproval } from '@/modules/approvals'

// The maker withdraws their own pending request.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('approvals.view')
  if (auth.error) return auth.error
  const { id } = await params
  try {
    return NextResponse.json(await cancelApproval(id, auth.principal, req))
  } catch (err) {
    const res = operationErrorResponse(err)
    if (res) return res
    throw err
  }
}
