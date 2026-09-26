import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'

const MAX_LIMIT = 100

// Newest first, cursor-paginated by id. Filters: action (prefix, e.g.
// "payment."), entityType, entityId, actor (matches id or label).
export async function GET(req: NextRequest) {
  const auth = await requirePermission('audit.read')
  if (auth.error) return auth.error

  const s = new URL(req.url).searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(s.get('limit') || '50') || 50))
  const cursor = s.get('cursor')
  const action = s.get('action')?.trim()
  const entityType = s.get('entityType')?.trim()
  const entityId = s.get('entityId')?.trim()
  const actor = s.get('actor')?.trim()

  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = { startsWith: action }
  if (entityType) where.entityType = entityType
  if (entityId) where.entityId = entityId
  if (actor) {
    where.OR = [
      { actorId: actor },
      { actorLabel: { contains: actor, mode: 'insensitive' } },
    ]
  }
  if (cursor && /^\d+$/.test(cursor)) where.id = { lt: BigInt(cursor) }

  const rows = await prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 })
  const page = rows.slice(0, limit)

  return NextResponse.json({
    entries: page.map((row) => ({ ...row, id: row.id.toString() })),
    nextCursor: rows.length > limit ? page[page.length - 1].id.toString() : null,
  })
}
