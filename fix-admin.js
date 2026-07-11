// fix-admin.js — run with: node fix-admin.js
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('\n Fixing admin account...\n')

  const password = 'admin123'
  const hashed = await bcrypt.hash(password, 10)

  const admin = await prisma.admin.upsert({
    where: { email: 'admin@millionairesclub.com' },
    update: { password: hashed, name: 'Club Admin' },
    create: {
      email: 'admin@millionairesclub.com',
      name: 'Club Admin',
      password: hashed,
      role: 'admin',
    },
  })

  console.log(' Admin account ready!')
  console.log('   Email:    ' + admin.email)
  console.log('   Password: ' + password)
  console.log('\n Now run:  npm run dev')
  console.log(' Then go to: http://localhost:3000\n')
}

main()
  .catch(e => {
    console.error('\n Error:', e.message)
    console.error('\n Make sure you ran setup.bat first.\n')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
