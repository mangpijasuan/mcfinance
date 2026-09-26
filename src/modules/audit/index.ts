// Append-only audit log: who did what, to which record, with the record
// before and after. Call recordAudit() inside the same transaction as the
// change so the entry and the change commit (or roll back) together.
import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export type AuditActorType = 'admin' | 'member' | 'system' | 'anonymous'

export type AuditContext = {
  actorType: AuditActorType
  actorId: string | null
  actorLabel: string | null
  requestId: string | null
  ip: string | null
  userAgent: string | null
}

export type AuditEntry = {
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  metadata?: unknown
}

type HeaderSource = { headers: { get(name: string): string | null } }

const MAX_TEXT = 300

function clip(value: string | null | undefined): string | null {
  if (!value) return null
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value
}

function requestFields(req?: HeaderSource | null) {
  const headers = req?.headers
  // Caddy sets X-Forwarded-For; the first entry is the client.
  const forwarded = headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
  return {
    requestId: clip(headers?.get('x-request-id')) ?? randomUUID(),
    ip: clip(forwarded || headers?.get('x-real-ip')),
    userAgent: clip(headers?.get('user-agent')),
  }
}

/** Context for a request made by a signed-in admin or member. */
export function auditContext(req: HeaderSource | null | undefined, session: unknown): AuditContext {
  const user = (session as { user?: Record<string, any> } | null)?.user
  if (user?.role === 'admin') {
    return { actorType: 'admin', actorId: user.id ?? null, actorLabel: clip(user.email ?? user.name), ...requestFields(req) }
  }
  if (user?.role === 'member') {
    return { actorType: 'member', actorId: user.memberId ?? null, actorLabel: clip(user.memberId), ...requestFields(req) }
  }
  return { actorType: 'anonymous', actorId: null, actorLabel: null, ...requestFields(req) }
}

/** Context for work done by the system itself (webhooks, scheduled jobs). */
export function systemAuditContext(label: string, req?: HeaderSource | null): AuditContext {
  return { actorType: 'system', actorId: null, actorLabel: label, ...requestFields(req) }
}

/** Context for an unauthenticated attempt, e.g. a login, labelled with what was typed. */
export function anonymousAuditContext(label: string | null, req?: HeaderSource | null): AuditContext {
  return { actorType: 'anonymous', actorId: null, actorLabel: clip(label), ...requestFields(req) }
}

const SECRET_KEY = /password|secret|token|hash|apikey|api_key/i

/** JSON-safe copy with secrets replaced; Dates become ISO strings, BigInts strings. */
export function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  const json = JSON.stringify(value, (key, v) => {
    // Only string values are secrets; flags like passwordChanged: true are kept.
    if (key && SECRET_KEY.test(key) && typeof v === 'string') return '[redacted]'
    if (typeof v === 'bigint') return v.toString()
    return v
  })
  return json === undefined ? undefined : (JSON.parse(json) as Prisma.InputJsonValue)
}

export async function recordAudit(db: Db, ctx: AuditContext, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      ...ctx,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: redact(entry.before),
      after: redact(entry.after),
      metadata: redact(entry.metadata),
    },
  })
}
