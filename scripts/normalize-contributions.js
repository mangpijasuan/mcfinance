const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function monthYearFromDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.getMonth()]}-${date.getFullYear()}`
}

async function main() {
  const contributions = await prisma.contribution.findMany({
    select: { id: true, transactionId: true, paymentDate: true, monthYear: true },
  })

  let updated = 0

  for (const contribution of contributions) {
    const paymentDate = new Date(contribution.paymentDate)
    if (Number.isNaN(paymentDate.getTime())) continue

    const expectedMonthYear = monthYearFromDate(paymentDate)
    if (contribution.monthYear !== expectedMonthYear) {
      await prisma.contribution.update({
        where: { id: contribution.id },
        data: { monthYear: expectedMonthYear },
      })
      updated += 1
    }
  }

  console.log(`Normalized ${updated} contribution record${updated === 1 ? '' : 's'}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })