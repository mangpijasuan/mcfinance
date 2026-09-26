import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { makerCheckerEnforced, viewRequests } from '@/modules/approvals'

// The approval queue: pending requests (oldest first), or recent decisions.
export async function GET(req: NextRequest) {
  const auth = await requirePermission('approvals.view')
  if (auth.error) return auth.error
  const view = new URL(req.url).searchParams.get('view') === 'decided' ? 'decided' : 'pending'
  const rows = await prisma.approvalRequest.findMany({
    where: view === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } },
    orderBy: view === 'pending' ? { requestedAt: 'asc' } : { decidedAt: 'desc' },
    take: 100,
    include: { decisions: { orderBy: { at: 'asc' } } },
  })
  return NextResponse.json({
    makerCheckerEnforced: makerCheckerEnforced(),
    requests: await viewRequests(prisma, rows, auth.principal),
  })
}
