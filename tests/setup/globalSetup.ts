import { execSync } from 'node:child_process'
import { testDatabaseUrl } from './testDatabaseUrl'

// Rebuild the test database from the committed migrations, so every run
// also proves the migrations apply cleanly.
export default function setup() {
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  })
}
