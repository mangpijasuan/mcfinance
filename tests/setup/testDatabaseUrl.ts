// The database tests run against. It is wiped before every run, so the
// name must end in "_test" — a guard against pointing tests at real data.
const DEFAULT_TEST_DATABASE_URL =
  'postgresql://mcfinance:mcfinance_dev@127.0.0.1:5434/mcfinance_test?schema=public'

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests against "${name}": the test database name must end in "_test".`)
  }
  return url
}
