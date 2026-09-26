export async function recalcMemberLoanState(tx: any, memberId: string) {
  const [borrowerAgg, cosignerAgg, writtenOff] = await Promise.all([
    tx.loan.aggregate({
      where: { borrowerId: memberId, status: 'Active' },
      _count: { loanId: true },
      _sum: { balanceRemaining: true },
    }),
    tx.loan.aggregate({
      where: { cosignerId: memberId, status: 'Active' },
      _count: { loanId: true },
    }),
    tx.loan.count({ where: { borrowerId: memberId, lifecycle: 'charged_off' } }),
  ])

  const activeAsBorrower = (borrowerAgg._count.loanId ?? 0) > 0 ? 1 : 0
  const activeAsCosigner = (cosignerAgg._count.loanId ?? 0) > 0 ? 1 : 0
  const currentLoanBalance = borrowerAgg._sum.balanceRemaining ?? 0

  await tx.member.update({
    where: { id: memberId },
    data: {
      activeAsBorrower,
      activeAsCosigner,
      currentLoanBalance,
      eligible: writtenOff > 0 ? 'NO - Loan written off'
        : activeAsBorrower === 0 && activeAsCosigner === 0 ? 'YES' : 'NO - Active Loan/Cosign',
    },
  })
}

