// add-portal-fields.js
// Run ONCE after updating the schema:
//   npx prisma db push
//   node add-portal-fields.js
//
// This script just verifies the fields were added correctly.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('\n Checking portal fields...\n')

  // Try to read a member with the new fields
  const member = await prisma.member.findFirst({
    select: { id: true, legalName: true, portalEnabled: true },
  })

  if (!member) {
    console.log(' No members found. Run npm run db:seed first.')
    return
  }

  console.log(` ✅ Portal fields are working!`)
  console.log(`    Sample: ${member.legalName} — portal ${member.portalEnabled ? 'enabled' : 'disabled'}`)
  console.log(`\n Now you can enable portal access for members from:`)
  console.log(`    Admin → Members → [click any member] → "Portal access" button\n`)
}

main().catch(e => {
  console.error('\n Error:', e.message)
  console.error('\n Make sure you ran: npx prisma db push\n')
  process.exit(1)
}).finally(() => prisma.$disconnect())
