// add-historical-loans.js
// Run: node add-historical-loans.js
const { PrismaClient } = require('@prisma/client')
const data = require('./prisma/historical-loans.json')

const prisma = new PrismaClient()

async function main() {
  console.log('\n Importing historical loans (2021–2025)...\n')

  // Push the new schema model first
  let added = 0, skipped = 0

  for (const loan of data) {
    try {
      await prisma.historicalLoan.upsert({
        where: { loanId: loan.loanId },
        update: {},
        create: {
          loanId: loan.loanId,
          year: loan.year,
          borrowerName: loan.borrowerName,
          cosignerName: loan.cosignerName || null,
          loanDate: new Date(loan.loanDate),
          endDate: loan.endDate ? new Date(loan.endDate) : null,
          loanAmount: loan.loanAmount,
          totalPaid: loan.totalPaid,
          balanceRemaining: loan.balanceRemaining,
          status: loan.status,
        },
      })
      added++
    } catch (e) {
      console.log(`  Skipped ${loan.loanId}: ${e.message}`)
      skipped++
    }
  }

  console.log(`\n ✅ Done!`)
  console.log(`   Added/updated: ${added} loans`)
  if (skipped) console.log(`   Skipped: ${skipped}`)
  console.log(`\n Breakdown by year:`)
  const byYear = {}
  for (const l of data) {
    if (!byYear[l.year]) byYear[l.year] = { count: 0, total: 0 }
    byYear[l.year].count++
    byYear[l.year].total += l.loanAmount
  }
  for (const [year, stats] of Object.entries(byYear).sort()) {
    console.log(`   ${year}: ${stats.count} loans  $${stats.total.toLocaleString()}`)
  }
}

main()
  .catch(e => {
    console.error('\n Error:', e.message)
    console.error('Make sure you ran: npx prisma db push\n')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
