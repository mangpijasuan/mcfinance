import { NextRequest, NextResponse } from 'next/server'

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

export function notFound(error = 'Not found') {
  return NextResponse.json({ error }, { status: 404 })
}

/** Parses a JSON object body; null when the body is missing, malformed or not an object. */
export async function readJsonObject(req: NextRequest): Promise<Record<string, any> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/** A non-empty trimmed string, or null. */
export function requiredString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** A valid Date from a string/number input, or null. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
