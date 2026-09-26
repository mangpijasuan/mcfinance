export type UserRole = 'admin' | 'member';

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  memberId?: string; // e.g. MC-10017
  title?: string; // e.g. Treasurer / Board Director or Club Member
}

export type PaymentType = 'Auto-pay' | 'Cash' | 'Online' | 'Zelle' | 'Check';

export interface Member {
  id: string; // e.g. MC-10001
  name: string;
  otherName?: string;
  dor: string; // Date of Registration e.g. 12/25/2013
  monthlyAmount: number; // e.g. 20.00 or 30.00
  paymentType: PaymentType;
  receivedBy?: string;
  comments?: string;
  phone?: string;
  email?: string;
  status: 'active' | 'inactive' | 'overdue';
  // Monthly payment status map for key years like "2025-09": "paid" | "unpaid" | "waived"
  payments?: Record<string, 'paid' | 'unpaid' | 'advance'>;

  // Auto Payment Settings (Admin Configurable)
  isAutoPayEnabled?: boolean;
  autoPayDay?: number; // e.g., 1, 5, 15, 28 of each month
  autoPayMethod?: 'Credit Card' | 'ACH Bank Debit' | 'Zelle Auto';
  autoPayStatus?: 'active' | 'paused' | 'failed';
  autoPayLastProcessed?: string; // e.g., "2026-02-01"

  // SHA-256 hash of the member's Member Portal login PIN. If unset, a fallback
  // PIN derived from their phone number is used (see utils/authCrypto.ts).
  pin?: string;
}

export interface Loan {
  loanNumber: number;
  year?: number;
  id?: string;
  name: string;
  cosignName: string;
  start: string; // e.g. 01/10/2026
  end: string;   // e.g. 01/10/2028
  loanAmount: number;
  paid: number;
  balance: number;
  status: 'active' | 'paid_off' | 'defaulted';
  comments?: string;
  repaymentHistory?: LoanPayment[];
}

export interface LoanPayment {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

export interface YearlyContributionStat {
  year: number;
  total: number;
}

export interface YearlyLoanStat {
  year: number;
  totalLoan: number;
  balance: number;
}

export interface ClubMetrics {
  totalContributions: number;
  totalBankBalance: number;
  totalLoanBalance: number;
  investment: number;
  actualBankBalance: number;
  contactEmail: string;
  trustFund: number;
  capital: number;
  investmentFund: number;
  // Cumulative Platform & Development Fee revenue collected on Stripe loan repayments
  // (see Loan Agreement fee disclosure). Tracked separately from club funds for auditability.
  platformFeesCollected: number;
}

export interface ReminderTemplate {
  id: string;
  title: string;
  language: 'English' | 'Zomi' | 'Burmese';
  subject: string;
  body: string;
}

export interface ReminderLog {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  type: 'Monthly Dues' | 'Loan Repayment' | 'Annual Statement';
  channel: 'SMS' | 'Email' | 'WhatsApp';
  status: 'Sent' | 'Failed' | 'Scheduled';
  message: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  category: 'Contribution' | 'Loan' | 'Member' | 'Reminder' | 'System';
  details: string;
}
