import { Loan } from '../types';

export interface EligibilityResult {
  isEligible: boolean;
  status: 'eligible' | 'active_borrower' | 'active_cosigner' | 'cooldown' | 'same_person';
  reason?: string;
  activeLoanNumber?: number;
  activeBalance?: number;
  availableDate?: string;
}

/**
 * Checks if a person (borrower or cosigner) is eligible for a loan according to MC Board policy:
 * 1. Active Loan/Cosign check: If someone currently has an active loan (balance > 0) or is a cosigner on an active loan (balance > 0), they are NOT eligible to borrow or cosign.
 * 2. Cosigner Release: Cosigner is immediately released as soon as the loan is paid off (balance = 0).
 * 3. Borrower 3-Month Cooling Period: Borrowers must wait 3 months after their loan payoff / end date before taking out a new loan.
 */
export function checkPersonLoanEligibility(
  personName: string,
  loans: Loan[],
  isBorrowerRole: boolean = true
): EligibilityResult {
  if (!personName || !personName.trim()) {
    return { isEligible: true, status: 'eligible' };
  }

  const normalized = personName.trim().toLowerCase();

  // 1. Check for Active Loans (balance > 0)
  for (const loan of loans) {
    if (loan.balance > 0) {
      const isBorrowerOnActive = loan.name.trim().toLowerCase() === normalized;
      const isCosignerOnActive = loan.cosignName.trim().toLowerCase() === normalized;

      if (isBorrowerOnActive) {
        return {
          isEligible: false,
          status: 'active_borrower',
          reason: `${personName} currently has an active loan (#${loan.loanNumber} with balance $${loan.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}) and is not eligible to ${isBorrowerRole ? 'take out another loan' : 'act as a cosigner'}.`,
          activeLoanNumber: loan.loanNumber,
          activeBalance: loan.balance,
        };
      }

      if (isCosignerOnActive) {
        return {
          isEligible: false,
          status: 'active_cosigner',
          reason: `${personName} is currently an active cosigner on Loan #${loan.loanNumber} (Borrower: ${loan.name}, balance $${loan.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}) and cannot ${isBorrowerRole ? 'borrow a loan' : 'cosign another loan'} until it is paid off.`,
          activeLoanNumber: loan.loanNumber,
          activeBalance: loan.balance,
        };
      }
    }
  }

  // 2. Check for Borrower 3-Month Cooling Off Period
  // Cosigners are released immediately upon payoff (no cooling period for cosigners),
  // but BORROWERS must wait 3 months after loan payoff / end date.
  if (isBorrowerRole) {
    // Find all paid off loans where person was the borrower
    const paidOffBorrowerLoans = loans.filter(
      (l) => l.balance === 0 && l.name.trim().toLowerCase() === normalized
    );

    for (const loan of paidOffBorrowerLoans) {
      // Determine end / payoff date
      let payoffDate = new Date(loan.end);
      if (isNaN(payoffDate.getTime())) {
        payoffDate = new Date(loan.start);
      }
      if (isNaN(payoffDate.getTime())) {
        payoffDate = new Date();
      }

      // Add 3 calendar months for cooling period
      const eligibleDate = new Date(payoffDate);
      eligibleDate.setMonth(eligibleDate.getMonth() + 3);

      const today = new Date();

      if (today < eligibleDate) {
        const dateFormatted = eligibleDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const payoffFormatted = payoffDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        return {
          isEligible: false,
          status: 'cooldown',
          reason: `${personName} paid off Loan #${loan.loanNumber} on ${payoffFormatted}. MC Policy requires a mandatory 3-month cooling-off period until ${dateFormatted} before applying for a new loan.`,
          availableDate: dateFormatted,
        };
      }
    }
  }

  return { isEligible: true, status: 'eligible' };
}
