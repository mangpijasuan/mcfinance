import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Member,
  Loan,
  YearlyContributionStat,
  YearlyLoanStat,
  ClubMetrics,
  ReminderTemplate,
  ReminderLog,
  ActivityLog,
  PaymentType,
} from '../types';
import {
  INITIAL_METRICS,
  INITIAL_YEARLY_CONTRIBUTIONS,
  INITIAL_YEARLY_LOANS,
  INITIAL_LOANS,
  INITIAL_MEMBERS,
  INITIAL_REMINDER_TEMPLATES,
} from '../data/initialData';

interface ClubContextType {
  metrics: ClubMetrics;
  members: Member[];
  loans: Loan[];
  yearlyContributions: YearlyContributionStat[];
  yearlyLoans: YearlyLoanStat[];
  reminderTemplates: ReminderTemplate[];
  reminderLogs: ReminderLog[];
  activityLogs: ActivityLog[];
  
  // Actions
  addMember: (member: Omit<Member, 'id'>) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  togglePaymentMonth: (memberId: string, monthKey: string) => void;
  recordContribution: (memberId: string, month: string, amount: number, paymentType: PaymentType, note?: string) => void;
  
  issueLoan: (loan: Omit<Loan, 'loanNumber' | 'paid' | 'balance' | 'status'>) => void;
  recordLoanPayment: (loanIdentifier: number | string, amount: number, note?: string, platformFeeAmount?: number) => void;
  updateLoan: (loanIdentifier: number | string, updates: Partial<Loan>) => void;
  
  sendReminder: (memberId: string, templateId: string, channel: 'SMS' | 'Email' | 'WhatsApp') => void;
  sendBulkReminders: (target: 'overdue_members' | 'all_active_loans', channel: 'SMS' | 'Email' | 'WhatsApp') => number;
  
  saveReminderTemplate: (template: ReminderTemplate) => void;
  resetData: () => void;
  
  // Auto Payment Actions
  toggleMemberAutoPay: (
    memberId: string,
    enabled: boolean,
    settings?: {
      autoPayDay?: number;
      autoPayMethod?: 'Credit Card' | 'ACH Bank Debit' | 'Zelle Auto';
      autoPayStatus?: 'active' | 'paused' | 'failed';
    }
  ) => void;
  processBatchAutoPayments: (monthKey?: string) => { processedCount: number; totalCollected: number; processedMembers: string[] };
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'millionaires_club_v2_data';

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<ClubMetrics>(INITIAL_METRICS);
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [loans, setLoans] = useState<Loan[]>(INITIAL_LOANS);
  const [yearlyContributions, setYearlyContributions] = useState<YearlyContributionStat[]>(INITIAL_YEARLY_CONTRIBUTIONS);
  const [yearlyLoans, setYearlyLoans] = useState<YearlyLoanStat[]>(INITIAL_YEARLY_LOANS);
  const [reminderTemplates, setReminderTemplates] = useState<ReminderTemplate[]>(INITIAL_REMINDER_TEMPLATES);
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([
    {
      id: 'log-1',
      memberId: 'MC-10017',
      memberName: 'Lian Suan Khup',
      date: new Date(Date.now() - 86400000 * 2).toISOString(),
      type: 'Monthly Dues',
      channel: 'SMS',
      status: 'Sent',
      message: 'Automated reminder sent for Sep-Dec 2025 dues ($80.00).'
    },
    {
      id: 'log-2',
      memberId: 'MC-10096',
      memberName: 'Pau Neih Cing',
      date: new Date(Date.now() - 86400000 * 4).toISOString(),
      type: 'Monthly Dues',
      channel: 'Email',
      status: 'Sent',
      message: 'Email notification for 2025 Q4 pending contributions.'
    }
  ]);
  
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([
    {
      id: 'act-1',
      timestamp: new Date().toLocaleDateString('en-US') + ' 10:30 AM',
      user: 'Mangpi',
      action: 'Report Sync',
      category: 'System',
      details: 'Loaded official Millionaires Club report with 111 members and 10 active loans.'
    }
  ]);

  // Load from localStorage on init
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.metrics) setMetrics({ ...INITIAL_METRICS, ...parsed.metrics });
        if (parsed.members) setMembers(parsed.members);
        if (parsed.loans) setLoans(parsed.loans);
        if (parsed.yearlyContributions) setYearlyContributions(parsed.yearlyContributions);
        if (parsed.yearlyLoans) setYearlyLoans(parsed.yearlyLoans);
        if (parsed.reminderLogs) setReminderLogs(parsed.reminderLogs);
        if (parsed.activityLogs) setActivityLogs(parsed.activityLogs);
      }
    } catch (e) {
      console.error('Failed to load state from localStorage:', e);
    }
  }, []);

  // Save to localStorage on state change
  useEffect(() => {
    try {
      const payload = {
        metrics,
        members,
        loans,
        yearlyContributions,
        yearlyLoans,
        reminderLogs,
        activityLogs,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }, [metrics, members, loans, yearlyContributions, yearlyLoans, reminderLogs, activityLogs]);

  const logActivity = (action: string, category: ActivityLog['category'], details: string) => {
    const newLog: ActivityLog = {
      id: 'act-' + Date.now(),
      timestamp: new Date().toLocaleDateString('en-US') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      user: 'Board Officer',
      action,
      category,
      details,
    };
    setActivityLogs(prev => [newLog, ...prev]);
  };

  const addMember = (memberData: Omit<Member, 'id'>) => {
    const nextNum = members.length + 10001;
    const newId = `MC-${nextNum}`;
    const newMember: Member = {
      ...memberData,
      id: newId,
      status: memberData.status || 'active',
      payments: {}
    };

    setMembers(prev => [newMember, ...prev]);
    logActivity('Added New Member', 'Member', `Added member ${newMember.name} (${newId}) with $${newMember.monthlyAmount}/month commitment.`);
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    logActivity('Updated Member', 'Member', `Updated profile/details for member ${id}.`);
  };

  const togglePaymentMonth = (memberId: string, monthKey: string) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const currentPayments = m.payments || {};
      const currentStatus = currentPayments[monthKey] || 'unpaid';
      const nextStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
      
      return {
        ...m,
        payments: {
          ...currentPayments,
          [monthKey]: nextStatus
        }
      };
    }));
  };

  const recordContribution = (memberId: string, month: string, amount: number, paymentType: PaymentType, note?: string) => {
    const targetMember = members.find(m => m.id === memberId);
    if (!targetMember) return;

    // Mark payment in member record
    togglePaymentMonth(memberId, month);

    // Update club metrics
    setMetrics(prev => ({
      ...prev,
      totalContributions: prev.totalContributions + amount,
      totalBankBalance: prev.totalBankBalance + amount,
      actualBankBalance: prev.actualBankBalance + amount,
      trustFund: prev.trustFund + amount,
    }));

    // Update current year total contribution
    const currentYear = new Date().getFullYear();
    setYearlyContributions(prev => prev.map(y => {
      if (y.year === currentYear) {
        return { ...y, total: y.total + amount };
      }
      return y;
    }));

    logActivity('Recorded Monthly Contribution', 'Contribution', `Received $${amount} from ${targetMember.name} (${memberId}) via ${paymentType} for ${month}. ${note ? `Note: ${note}` : ''}`);
  };

  const issueLoan = (loanData: Omit<Loan, 'loanNumber' | 'paid' | 'balance' | 'status'>) => {
    const newLoanNumber = loans.length + 1;
    const newLoan: Loan = {
      ...loanData,
      loanNumber: newLoanNumber,
      paid: 0.00,
      balance: loanData.loanAmount,
      status: 'active',
      repaymentHistory: []
    };

    setLoans(prev => [newLoan, ...prev]);

    // Adjust balances: Loan issuance reduces bank balance, increases loan balance
    setMetrics(prev => ({
      ...prev,
      totalBankBalance: Math.max(0, prev.totalBankBalance - loanData.loanAmount),
      actualBankBalance: Math.max(0, prev.actualBankBalance - loanData.loanAmount),
      totalLoanBalance: prev.totalLoanBalance + loanData.loanAmount,
      capital: prev.capital + loanData.loanAmount,
    }));

    // Update current year total loans
    const currentYear = new Date().getFullYear();
    setYearlyLoans(prev => prev.map(y => {
      if (y.year === currentYear) {
        return {
          ...y,
          totalLoan: y.totalLoan + loanData.loanAmount,
          balance: y.balance + loanData.loanAmount,
        };
      }
      return y;
    }));

    logActivity('Issued New Loan', 'Loan', `Issued Loan #${newLoanNumber} of $${loanData.loanAmount} to ${loanData.name} (Cosigner: ${loanData.cosignName}).`);
  };

  const recordLoanPayment = (loanIdentifier: number | string, amount: number, note?: string, platformFeeAmount: number = 0) => {
    const loan = loans.find(l => l.id === loanIdentifier || l.loanNumber === loanIdentifier);
    if (!loan) return;

    const newPaid = loan.paid + amount;
    const newBalance = Math.max(0, loan.balance - amount);
    const newStatus = newBalance === 0 ? 'paid_off' : 'active';

    const paymentItem = {
      id: 'p-' + Date.now(),
      date: new Date().toLocaleDateString('en-US'),
      amount,
      note
    };

    setLoans(prev => prev.map(l => {
      if ((loan.id && l.id === loan.id) || (!loan.id && l.loanNumber === loan.loanNumber)) {
        return {
          ...l,
          paid: newPaid,
          balance: newBalance,
          status: newStatus,
          repaymentHistory: [...(l.repaymentHistory || []), paymentItem]
        };
      }
      return l;
    }));

    // Update club metrics: loan repayment increases bank balance, decreases total loan balance.
    // Platform & Development Fee (per Loan Agreement) is tracked separately, not mixed into
    // club fund balances, so it stays auditable as its own line.
    setMetrics(prev => ({
      ...prev,
      totalBankBalance: prev.totalBankBalance + amount,
      actualBankBalance: prev.actualBankBalance + amount,
      totalLoanBalance: Math.max(0, prev.totalLoanBalance - amount),
      platformFeesCollected: prev.platformFeesCollected + platformFeeAmount,
    }));

    // Update current year loan balances
    const currentYear = new Date().getFullYear();
    setYearlyLoans(prev => prev.map(y => {
      if (y.year === currentYear) {
        return { ...y, balance: Math.max(0, y.balance - amount) };
      }
      return y;
    }));

    logActivity('Recorded Loan Payment', 'Loan', `Received repayment of $${amount} for Loan #${loan.loanNumber} (${loan.name}). Remaining balance: $${(newBalance || 0).toFixed(2)}.`);
  };

  const updateLoan = (loanIdentifier: number | string, updates: Partial<Loan>) => {
    const loan = loans.find(l => (l.id && l.id === loanIdentifier) || l.loanNumber === loanIdentifier);
    if (!loan) return;

    setLoans(prev => prev.map(l => {
      const isMatch = (loan.id && l.id === loan.id) || (!loan.id && l.loanNumber === loan.loanNumber);
      if (isMatch) {
        const updated = { ...l, ...updates };
        // Automatically adjust balance if principal or paid changes, unless balance is explicitly overridden
        if ((updates.loanAmount !== undefined || updates.paid !== undefined) && updates.balance === undefined) {
          updated.balance = Math.max(0, updated.loanAmount - updated.paid);
        }
        if (updated.balance === 0 && updated.status === 'active') {
          updated.status = 'paid_off';
        }
        return updated;
      }
      return l;
    }));

    logActivity('Adjusted Loan Details', 'Loan', `Admin adjusted Loan #${loan.loanNumber} for ${loan.name}.`);
  };

  const sendReminder = (memberId: string, templateId: string, channel: 'SMS' | 'Email' | 'WhatsApp') => {
    const member = members.find(m => m.id === memberId);
    const template = reminderTemplates.find(t => t.id === templateId) || reminderTemplates[0];
    if (!member) return;

    const formattedMessage = template.body
      .replace('{MEMBER_NAME}', member.name)
      .replace('{MC_NUMBER}', member.id)
      .replace('{AMOUNT_DUE}', (member.monthlyAmount || 20).toString())
      .replace('{CURRENT_MONTH}', new Date().toLocaleString('default', { month: 'long', year: 'numeric' }))
      .replace('{PAYMENT_METHOD}', member.paymentType);

    const logEntry: ReminderLog = {
      id: 'rem-' + Date.now(),
      memberId: member.id,
      memberName: member.name,
      date: new Date().toISOString(),
      type: 'Monthly Dues',
      channel,
      status: 'Sent',
      message: formattedMessage,
    };

    setReminderLogs(prev => [logEntry, ...prev]);
    logActivity('Sent Individual Reminder', 'Reminder', `Sent ${channel} reminder to ${member.name} (${member.id}) using template "${template.title}".`);
  };

  const sendBulkReminders = (target: 'overdue_members' | 'all_active_loans', channel: 'SMS' | 'Email' | 'WhatsApp') => {
    let count = 0;
    if (target === 'overdue_members') {
      const overdueList = members.filter(m => m.status === 'overdue' || (m.comments && m.comments.toLowerCase().includes('nailo')));
      overdueList.forEach(member => {
        const logEntry: ReminderLog = {
          id: 'rem-bulk-' + Date.now() + '-' + member.id,
          memberId: member.id,
          memberName: member.name,
          date: new Date().toISOString(),
          type: 'Monthly Dues',
          channel,
          status: 'Sent',
          message: `Automated ${channel} reminder: Dear ${member.name}, your monthly dues for Millionaires Club are pending (${member.comments || 'Unpaid'}). Please submit payment.`
        };
        setReminderLogs(prev => [logEntry, ...prev]);
        count++;
      });
      logActivity('Sent Bulk Reminders', 'Reminder', `Dispatched automated ${channel} reminders to ${count} overdue members.`);
    } else {
      const activeLoans = loans.filter(l => l.balance > 0);
      activeLoans.forEach(loan => {
        const logEntry: ReminderLog = {
          id: 'rem-loan-' + Date.now() + '-' + loan.loanNumber,
          memberId: `Loan #${loan.loanNumber}`,
          memberName: loan.name,
          date: new Date().toISOString(),
          type: 'Loan Repayment',
          channel,
          status: 'Sent',
          message: `Automated ${channel} notice: Dear ${loan.name}, your loan balance of $${(loan.balance || 0).toFixed(2)} for Loan #${loan.loanNumber} is due for scheduled repayment.`
        };
        setReminderLogs(prev => [logEntry, ...prev]);
        count++;
      });
      logActivity('Sent Loan Payment Alerts', 'Reminder', `Dispatched automated ${channel} alerts to ${count} active loan borrowers.`);
    }
    return count;
  };

  const saveReminderTemplate = (template: ReminderTemplate) => {
    setReminderTemplates(prev => {
      const exists = prev.some(t => t.id === template.id);
      if (exists) {
        return prev.map(t => t.id === template.id ? template : t);
      } else {
        return [...prev, template];
      }
    });
    logActivity('Saved Reminder Template', 'Reminder', `Updated template "${template.title}".`);
  };

  const toggleMemberAutoPay = (
    memberId: string,
    enabled: boolean,
    settings?: {
      autoPayDay?: number;
      autoPayMethod?: 'Credit Card' | 'ACH Bank Debit' | 'Zelle Auto';
      autoPayStatus?: 'active' | 'paused' | 'failed';
    }
  ) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const paymentType = enabled ? 'Auto-pay' : (m.paymentType === 'Auto-pay' ? 'Online' : m.paymentType);
      return {
        ...m,
        isAutoPayEnabled: enabled,
        paymentType,
        autoPayDay: settings?.autoPayDay ?? m.autoPayDay ?? 1,
        autoPayMethod: settings?.autoPayMethod ?? m.autoPayMethod ?? 'Credit Card',
        autoPayStatus: enabled ? (settings?.autoPayStatus ?? 'active') : 'paused',
      };
    }));
    logActivity('Auto-Pay Config Updated', 'Member', `Configured auto-pay for member ${memberId} (Status: ${enabled ? 'Enabled' : 'Disabled'}).`);
  };

  const processBatchAutoPayments = (monthKeyParam?: string) => {
    const currentMonthKey = monthKeyParam || new Date().toISOString().substring(0, 7);
    let count = 0;
    let total = 0;
    const processedList: string[] = [];

    setMembers(prev => prev.map(m => {
      const autoEnabled = m.isAutoPayEnabled ?? (m.paymentType === 'Auto-pay');
      if (!autoEnabled) return m;
      if (m.status === 'inactive' || m.autoPayStatus === 'paused') return m;

      const currentPayments = m.payments || {};
      if (currentPayments[currentMonthKey] === 'paid') return m;

      count += 1;
      total += m.monthlyAmount;
      processedList.push(`${m.name} (${m.id})`);

      const dateStr = new Date().toLocaleDateString('en-US');

      return {
        ...m,
        isAutoPayEnabled: true,
        autoPayLastProcessed: dateStr,
        payments: {
          ...currentPayments,
          [currentMonthKey]: 'paid'
        }
      };
    }));

    if (count > 0) {
      setMetrics(prev => ({
        ...prev,
        totalContributions: prev.totalContributions + total,
        totalBankBalance: prev.totalBankBalance + total,
        actualBankBalance: prev.actualBankBalance + total,
      }));

      logActivity(
        'Batch Auto-Pay Executed',
        'Contribution',
        `Auto-collected $${(total || 0).toFixed(2)} from ${count} members for ${currentMonthKey}.`
      );
    }

    return { processedCount: count, totalCollected: total, processedMembers: processedList };
  };

  const resetData = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setMetrics(INITIAL_METRICS);
    setMembers(INITIAL_MEMBERS);
    setLoans(INITIAL_LOANS);
    setYearlyContributions(INITIAL_YEARLY_CONTRIBUTIONS);
    setYearlyLoans(INITIAL_YEARLY_LOANS);
    setReminderTemplates(INITIAL_REMINDER_TEMPLATES);
    setReminderLogs([]);
    setActivityLogs([{
      id: 'act-reset',
      timestamp: new Date().toLocaleDateString('en-US') + ' 10:30 AM',
      user: 'Administrator',
      action: 'Reset System',
      category: 'System',
      details: 'Restored original official Millionaires Club report dataset.'
    }]);
  };

  return (
    <ClubContext.Provider
      value={{
        metrics,
        members,
        loans,
        yearlyContributions,
        yearlyLoans,
        reminderTemplates,
        reminderLogs,
        activityLogs,
        addMember,
        updateMember,
        togglePaymentMonth,
        recordContribution,
        issueLoan,
        recordLoanPayment,
        updateLoan,
        sendReminder,
        sendBulkReminders,
        saveReminderTemplate,
        resetData,
        toggleMemberAutoPay,
        processBatchAutoPayments,
      }}
    >
      {children}
    </ClubContext.Provider>
  );
};

export const useClub = () => {
  const context = useContext(ClubContext);
  if (!context) throw new Error('useClub must be used within a ClubProvider');
  return context;
};
