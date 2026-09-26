// Reset (or create) an admin account's password without a hard-coded default.
//
//   ADMIN_EMAIL_TO_RESET=admin@millionairesclub.com \
//   NEW_ADMIN_PASSWORD='a long passphrase' \
//   npm run admin:reset-password
//
// The password is read from the environment so it never lands in shell
// history as an argument, and it is never printed.
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const MIN_LENGTH = 12

async function main() {
  const email = process.env.ADMIN_EMAIL_TO_RESET?.trim().toLowerCase()
  const password = process.env.NEW_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL_TO_RESET and NEW_ADMIN_PASSWORD.')
  }
  if (password.length < MIN_LENGTH) {
    throw new Error(`NEW_ADMIN_PASSWORD must be at least ${MIN_LENGTH} characters.`)
  }

  const prisma = new PrismaClient()
  try {
    const hashed = await bcrypt.hash(password, 10)
    const existing = await prisma.admin.findUnique({ where: { email } })
    // Recorded in the audit log like any other change (system actor).
    const audit = (action: string, entityId: string) => ({
      actorType: 'system', actorLabel: 'cli:reset-admin-password',
      action, entityType: 'admin', entityId, metadata: { email, passwordChanged: true },
    })
    if (existing) {
      await prisma.$transaction([
        prisma.admin.update({ where: { email }, data: { password: hashed } }),
        prisma.auditLog.create({ data: audit('admin.password.reset', existing.id) }),
      ])
      console.log(`Password updated for ${email}.`)
    } else {
      await prisma.$transaction(async (tx) => {
        const created = await tx.admin.create({
          data: { email, name: 'Club Admin', password: hashed, role: 'super_admin' },
        })
        await tx.auditLog.create({ data: audit('admin.create', created.id) })
      })
      console.log(`Created super admin ${email}.`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
