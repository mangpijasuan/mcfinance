import { prisma } from '@/lib/prisma'

// Append-only tables whose triggers also refuse TRUNCATE. The test reset
// switches those triggers off for a moment (the table owner may), which
// the application itself never does.
const LEDGER_TABLES = ['JournalLine', 'JournalEntry', 'LedgerComparison']

/**
 * Empties every application table and returns the chart of accounts to
 * "proposed". Migration history, the chart itself and the audit log are
 * kept (the audit log cannot be truncated; tests read entries written
 * after a marker instead — see auditEntriesSince()).
 */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'AuditLog', 'LedgerAccount')`
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$transaction([
    ...LEDGER_TABLES.map((t) => prisma.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`)),
    prisma.$executeRawUnsafe('ALTER TABLE "LedgerAccount" DISABLE TRIGGER USER'),
    prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`),
    prisma.$executeRawUnsafe(`UPDATE "LedgerAccount" SET status = 'proposed', "approvedAt" = NULL, "approvedBy" = NULL, "approvalNote" = NULL`),
    prisma.$executeRawUnsafe('ALTER TABLE "LedgerAccount" ENABLE TRIGGER USER'),
    ...LEDGER_TABLES.map((t) => prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ENABLE TRIGGER USER`)),
  ])
}

/** The id of the newest audit entry, to pass to auditEntriesSince(). */
export async function auditMarker(): Promise<bigint> {
  const last = await prisma.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  return last?.id ?? BigInt(0)
}

export function auditEntriesSince(marker: bigint) {
  return prisma.auditLog.findMany({ where: { id: { gt: marker } }, orderBy: { id: 'asc' } })
}

export { prisma }
