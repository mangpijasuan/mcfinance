import React, { useState } from 'react';
import {
  CreditCard,
  Plus,
  DollarSign,
  UserCheck,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  ArrowUpRight,
  Send,
  FileText,
  Printer,
  BookOpen,
  Edit3
} from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { Loan } from '../../types';
import { LoanAgreementModal } from './LoanAgreementModal';
import { LoanPolicyModal } from './LoanPolicyModal';
import { EditLoanModal } from './EditLoanModal';

interface LoansTabProps {
  onOpenIssueLoan: () => void;
  onOpenRecordRepayment: (loan: Loan) => void;
}

export const LoansTab: React.FC<LoansTabProps> = ({
  onOpenIssueLoan,
  onOpenRecordRepayment
}) => {
  const { loans, sendReminder, reminderTemplates } = useClub();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paid_off'>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const [selectedAgreementLoan, setSelectedAgreementLoan] = useState<Loan | null>(null);
  const [isAgreementOpen, setIsAgreementOpen] = useState<boolean>(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState<boolean>(false);

  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  const handleOpenAgreement = (loan?: Loan) => {
    setSelectedAgreementLoan(loan || null);
    setIsAgreementOpen(true);
  };

  const totalLoanAmount = loans.reduce((acc, l) => acc + l.loanAmount, 0);
  const totalPaidAmount = loans.reduce((acc, l) => acc + l.paid, 0);
  const totalBalanceAmount = loans.reduce((acc, l) => acc + l.balance, 0);

  const filteredLoans = loans.filter(l => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.cosignName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.loanNumber.toString().includes(searchTerm);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && l.balance > 0) ||
      (statusFilter === 'paid_off' && l.balance === 0);

    const matchesYear =
      yearFilter === 'all' ||
      (l.year && l.year.toString() === yearFilter) ||
      (!l.year && l.start.includes(yearFilter));

    return matchesSearch && matchesStatus && matchesYear;
  });

  return (
    <div className="space-y-6">
      
      {/* Financial Summary Cards for Loan Ledger */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Active Loan Volume</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            ${totalLoanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Across {loans.length} registered loan contracts
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Principal Repaid</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">
            ${totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-semibold">
            {(totalLoanAmount > 0 ? (totalPaidAmount / totalLoanAmount) * 100 : 0).toFixed(1)}% Repayment Complete Rate
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Outstanding Balance</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1">
            ${totalBalanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-xs text-amber-300 font-medium">
            Collectable Capital Assets
          </div>
        </div>

      </div>

      {/* Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search loan by Borrower Name, Cosigner, or Loan #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Years (2024 - 2026)</option>
            <option value="2024">2024 Loans (20)</option>
            <option value="2025">2025 Loans (24)</option>
            <option value="2026">2026 Loans (10)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Outstanding</option>
            <option value="paid_off">Paid In Full</option>
          </select>

          <button
            onClick={() => setIsPolicyOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all border border-slate-700 hover:border-amber-500/50 cursor-pointer"
            title="View MC Loan Policy, Application Fees & Terms (English / Zomi)"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>Policy & Terms</span>
          </button>

          <button
            onClick={() => handleOpenAgreement()}
            className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all border border-amber-500/30 cursor-pointer"
            title="Generate & Print Official Loan Agreement Contract & Payment Schedule Ledger"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Loan Contract & Schedule</span>
          </button>

          <button
            onClick={onOpenIssueLoan}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Issue New Loan</span>
          </button>
        </div>

      </div>

      {/* Loans Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700/80 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">#</th>
                <th className="py-3.5 px-4">Borrower Name</th>
                <th className="py-3.5 px-4">Cosigner / Guarantor</th>
                <th className="py-3.5 px-4">Term Dates</th>
                <th className="py-3.5 px-4">Loan Amt.</th>
                <th className="py-3.5 px-4">Paid</th>
                <th className="py-3.5 px-4">Remaining Balance</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLoans.map((loan) => {
                const isPaidOff = loan.balance === 0;
                const progressPct = loan.loanAmount > 0 ? (loan.paid / loan.loanAmount) * 100 : 0;
                const rowKey = loan.id || `${loan.year || 'loan'}-${loan.loanNumber}`;

                return (
                  <tr key={rowKey} className="hover:bg-slate-800/40 transition-all">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                      {loan.year ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-sans border border-slate-700">{loan.year}</span>
                          <span>#{loan.loanNumber}</span>
                        </span>
                      ) : (
                        `#${loan.loanNumber}`
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                      {loan.name}
                    </td>
                    <td className="py-3.5 px-4 text-amber-200/90 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>{loan.cosignName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-xs whitespace-nowrap">
                      {loan.start} – {loan.end}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                      ${loan.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      ${loan.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-extrabold text-amber-400 whitespace-nowrap">
                      ${loan.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {isPaidOff ? (
                        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Paid In Full
                        </span>
                      ) : (
                        <div className="w-28">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                            <span>{progressPct.toFixed(0)}% Paid</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, progressPct)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            setEditingLoan(loan);
                            setIsEditModalOpen(true);
                          }}
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 p-1.5 rounded-lg border border-amber-500/30 transition-all cursor-pointer"
                          title="Admin: Edit & Adjust Loan Details"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        </button>

                        <button
                          onClick={() => handleOpenAgreement(loan)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 rounded-lg border border-slate-700 transition-all cursor-pointer"
                          title="View & Print Official Loan Agreement"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                        </button>

                        {!isPaidOff ? (
                          <>
                            <button
                              onClick={() => onOpenRecordRepayment(loan)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-md shadow-emerald-950/30 cursor-pointer"
                            >
                              + Repay
                            </button>
                            <button
                              onClick={() => {
                                sendReminder(`Loan #${loan.loanNumber}`, reminderTemplates[2]?.id || 'tmpl-3', 'SMS');
                                alert(`Loan repayment notice dispatched to ${loan.name}!`);
                              }}
                              className="bg-slate-800 hover:bg-slate-700 text-amber-300 p-1.5 rounded-lg border border-amber-500/30 transition-all cursor-pointer"
                              title="Send Loan Due Alert"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-500 text-xs italic">Closed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loan Agreement Modal */}
      <LoanAgreementModal
        isOpen={isAgreementOpen}
        onClose={() => setIsAgreementOpen(false)}
        loan={selectedAgreementLoan}
      />

      {/* Loan Policy & Terms Modal */}
      <LoanPolicyModal
        isOpen={isPolicyOpen}
        onClose={() => setIsPolicyOpen(false)}
      />

      {/* Edit Loan Modal */}
      <EditLoanModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        loan={editingLoan}
      />

    </div>
  );
};
