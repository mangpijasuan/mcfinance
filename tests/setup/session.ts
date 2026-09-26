import { vi } from 'vitest'

// Route handlers read the session through next-auth's getServerSession.
// Tests choose who is signed in with signInAs() from tests/helpers/actors.
vi.mock('next-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-auth')>()
  return {
    ...actual,
    getServerSession: async () => (globalThis as any).__testSession ?? null,
  }
})
