// Simple in-memory sliding-window limiter for login attempts.
// Single-process only — fine for this app's SQLite/small-deployment scale,
// but resets on restart and doesn't share state across multiple instances.

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

const attempts = new Map<string, number[]>()

function prune(timestamps: number[], now: number) {
  return timestamps.filter((t) => now - t < WINDOW_MS)
}

export function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = prune(attempts.get(key) || [], now)
  attempts.set(key, recent)
  return recent.length >= MAX_ATTEMPTS
}

export function recordFailedAttempt(key: string) {
  const now = Date.now()
  const recent = prune(attempts.get(key) || [], now)
  recent.push(now)
  attempts.set(key, recent)
}

export function clearAttempts(key: string) {
  attempts.delete(key)
}
