import { prisma } from '@/lib/prisma'

/**
 * Empties every application table. Migration history is kept, and so is
 * the audit log, which cannot be truncated (it is append-only); tests read
 * audit entries written after a marker instead — see auditEntriesSince().
 */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'AuditLog')`
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

export { prisma }

/** The id of the newest audit entry, to pass to auditEntriesSince(). */
export async function auditMarker(): Promise<bigint> {
  const last = await prisma.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  return last?.id ?? BigInt(0)
}

export function auditEntriesSince(marker: bigint) {
  return prisma.auditLog.findMany({ where: { id: { gt: marker } }, orderBy: { id: 'asc' } })
}
