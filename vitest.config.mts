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
