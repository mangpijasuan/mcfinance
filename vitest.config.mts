import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './tests/setup/testDatabaseUrl'

const databaseUrl = testDatabaseUrl()

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globalSetup: ['tests/setup/globalSetup.ts'],
    setupFiles: ['tests/setup/session.ts'],
    // The money path must be fully tested (docs/architecture/11 §3):
    // `npm run test:coverage` fails if any of these drops below 100%.
    coverage: {
      provider: 'v8',
      include: ['src/lib/money/**', 'src/modules/loans/amortization/**', 'src/modules/accounting/ledger/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      reporter: ['text-summary'],
    },
    // Integration tests share one database, so files run one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      NEXTAUTH_SECRET: 'test-only-secret',
      // 32 zero bytes: a test-only key for encrypting TOTP secrets.
      MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      SECURITY_ALERT_EMAIL: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      RESEND_API_KEY: '',
    },
  },
})
