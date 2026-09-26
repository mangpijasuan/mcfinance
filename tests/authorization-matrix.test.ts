// Authorisation matrix: every API route × every method × every kind of
// caller → allowed or denied. A new route cannot be added without an
// entry here (the coverage test below fails), which is how the class of
// bug found in the audit (a route missing its role check) stays fixed.
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { ACTORS, type Actor, signInAs } from './helpers/actors'
import { resetDatabase } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'

type Policy =
  | 'public' // no session needed
  | 'signed_in' // any session; object ownership is checked in the handler (see ownership tests)
  | 'member'
  | 'admin' // admin or super admin
  | 'super_admin'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

const MATRIX: Record<string, Partial<Record<Method, Policy>>> = {
  'admins': { GET: 'super_admin', POST: 'super_admin' },
  'admins/[id]': { PATCH: 'super_admin', DELETE: 'super_admin' },
  'audit': { GET: 'super_admin' },
  'agreements': { GET: 'signed_in' },
  'agreements/[id]': { GET: 'signed_in', PATCH: 'signed_in' }, // no DELETE (Gate #1 A3)
  'contributions': { GET: 'admin', POST: 'admin' },
  'dashboard': { GET: 'admin' },
  'health': { GET: 'public' },
  'loan-history': { GET: 'admin' },
  'loan-payments': { GET: 'admin', POST: 'admin' },
  'loans': { GET: 'admin', POST: 'admin' },
  'loans/[id]': { GET: 'admin', PATCH: 'admin' },
  'loans/check-policy': { POST: 'admin' },
  'members': { GET: 'admin', POST: 'admin' },
  'members/[id]': { GET: 'admin', PATCH: 'admin' }, // no DELETE (Gate #1 A3)
  'members/[id]/promote-admin': { POST: 'super_admin' },
  'members/[id]/set-password': { POST: 'admin' },
  'notifications': { GET: 'admin', POST: 'admin' },
  'payments': { GET: 'admin' },
  'payments/[id]/confirm': { POST: 'admin' },
  'payments/[id]/reject': { POST: 'admin' },
  'portal/history': { GET: 'member' },
  'portal/me': { GET: 'member' },
  'portal/payments': { GET: 'member' },
  'portal/payments/checkout': { POST: 'member' },
  // Authenticated by the Stripe signature, not a session.
  'webhooks/stripe': { POST: 'public' },
  'withdrawals': { GET: 'admin', POST: 'admin' },
}

// NextAuth's own sign-in endpoints.
const EXCLUDED = new Set(['auth/[...nextauth]'])

const API_DIR = path.resolve(__dirname, '../src/app/api')
const METHODS: Method[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']

function discoverRoutes(): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts') found.push(path.relative(API_DIR, dir).split(path.sep).join('/'))
    }
  }
  walk(API_DIR)
  return found.sort()
}

function allowed(policy: Policy, actor: Actor): boolean {
  switch (policy) {
    case 'public':
      return true
    case 'signed_in':
      return actor !== 'anonymous'
    case 'member':
      return actor === 'member'
    case 'admin':
      return actor === 'admin' || actor === 'super_admin'
    case 'super_admin':
      return actor === 'super_admin'
  }
}

async function call(route: string, method: Method) {
  const mod = await import(path.join(API_DIR, route, 'route.ts'))
  const handler = mod[method] as (req: NextRequest, ctx: unknown) => Promise<Response>
  const url = `http://localhost/api/${route.replace('[id]', 'does-not-exist')}`
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } }
  if (method !== 'GET') init.body = '{}'
  return handler(new NextRequest(url, init as any), { params: Promise.resolve({ id: 'does-not-exist' }) })
}

describe('authorization matrix', () => {
  beforeAll(async () => {
    await resetDatabase()
    await createBaseFixtures()
  })

  it('covers every API route and method', async () => {
    const routes = discoverRoutes().filter((r) => !EXCLUDED.has(r))
    expect(routes).toEqual(Object.keys(MATRIX).sort())
    for (const route of routes) {
      const mod = await import(path.join(API_DIR, route, 'route.ts'))
      const exported = METHODS.filter((m) => typeof mod[m] === 'function')
      expect(exported, route).toEqual(METHODS.filter((m) => MATRIX[route][m]))
    }
  })

  const cases = Object.entries(MATRIX).flatMap(([route, methods]) =>
    Object.entries(methods).flatMap(([method, policy]) =>
      ACTORS.map((actor) => ({ route, method: method as Method, policy: policy as Policy, actor })),
    ),
  )

  it.each(cases)('$method /api/$route as $actor ($policy)', async ({ route, method, policy, actor }) => {
    signInAs(actor)
    const res = await call(route, method)
    if (allowed(policy, actor)) {
      expect([401, 403], `expected ${actor} to get past the auth check`).not.toContain(res.status)
    } else if (actor === 'anonymous') {
      expect(res.status).toBe(401)
    } else {
      expect([401, 403]).toContain(res.status)
    }
  })
})
