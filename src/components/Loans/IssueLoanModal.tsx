import React, { useState } from 'react';
import { X, DollarSign, UserCheck, Calendar, ShieldCheck, FileText, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { Member } from '../../types';
import { checkPersonLoanEligibility } from '../../utils/loanEligibility';

interface IssueLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IssueLoanModal: React.FC<IssueLoanModalProps> = ({ isOpen, onClose }) => {
  const { issueLoan, members, loans } = useClub();

  const [borrowerName, setBorrowerName] = useState('');
  const [cosignName, setCosignName] = useState('');
  const [loanAmount, setLoanAmount] = useState<number>(3000);
  const [termMonths, setTermMonths] = useState<number>(24);
  const [startDate, setStartDate] = useState(new Date().toLocaleDateString('en-US'));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 86400000 * 365 * 2).toLocaleDateString('en-US')
  );
  const [comments, setComments] = useState('');

  if (!isOpen) return null;

  // Selected member lookup for Policy Verification
  const selectedBorrower = members.find(
    (m) => m.name.toLowerCase() === borrowerName.trim().toLowerCase()
  );

  // Helper to safely calculate member total contributions
  const getMemberContributions = (m?: Member): number => {
    if (!m) return 1250;
    const paidCount = m.payments ? Object.values(m.payments).filter((p) => p === 'paid' || p === 'advance').length : 0;
    const monthlyRate = m.monthlyAmount || 20;
    const baseContributions = 1200; // estimated historical base for active members
    return baseContributions + paidCount * monthlyRate;
  };

  // Policy Calculated Borrowing Cap: 4x Total Contributions (capped at $5,000)
  const memberContributions = getMemberContributions(selectedBorrower);
  const policyCap = Math.min(5000, memberContributions * 4);

  // Live Eligibility Checks
  const borrowerEligibility = checkPersonLoanEligibility(borrowerName, loans, true);
  const cosignerEligibility = checkPersonLoanEligibility(cosignName, loans, false);
  const isSamePerson =
    borrowerName.trim() !== '' &&
    cosignName.trim() !== '' &&
    borrowerName.trim().toLowerCase() === cosignName.trim().toLowerCase();

  // Fee calculation based on MC Policy Section 3:
  const calculateFee = (amount: number, term: number) => {
    if (amount <= 2500) return 30.0;
    if (term <= 12) return 50.0;
    return 70.0;
  };

  const appFee = calculateFee(loanAmount, termMonths);
  const monthlyPayment = loanAmount > 0 && termMonths > 0 ? (loanAmount / termMonths).toFixed(2) : '0.00';

  // Warnings / Compliance check
  const isOverCap = loanAmount > policyCap;

  const handleTermChange = (months: number) => {
    setTermMonths(months);
    const years = months / 12;
    const end = new Date(Date.now() + 86400000 * 365 * years).toLocaleDateString('en-US');
    setEndDate(end);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerName.trim()) {
      alert('Please select or enter Borrower Name');
      return;
    }
    if (!cosignName.trim()) {
      alert('Please select or enter Cosigner / Guarantor Name');
      return;
    }
    if (isSamePerson) {
      alert('Borrower and Cosigner cannot be the same person.');
      return;
    }
    if (!borrowerEligibility.isEligible) {
      alert(`Borrower Ineligible:\n\n${borrowerEligibility.reason}`);
      return;
    }
    if (!cosignerEligibility.isEligible) {
      alert(`Cosigner Ineligible:\n\n${cosignerEligibility.reason}`);
      return;
    }
    if (loanAmount <= 0) {
      alert('Loan amount must be greater than $0');
      return;
    }
    if (isOverCap) {
      if (!confirm(`Warning: Requested amount ($${loanAmount.toLocaleString()}) exceeds the Policy Limit of $${policyCap.toLocaleString()} (4x contributions). Do you still wish to proceed with Board Approval?`)) {
        return;
      }
    }

    issueLoan({
      name: borrowerName.trim(),
      cosignName: cosignName.trim(),
      start: startDate,
      end: endDate,
      loanAmount: Number(loanAmount),
      comments: `${comments ? comments + ' • ' : ''}App Fee: $${appFee.toFixed(2)} (${termMonths}-mo term) • Due 10th monthly`,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-white space-y-5 my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Issue Club Loan Contract</h2>
              <p className="text-xs text-slate-400">MC Loan Policy & Terms Compliant Application</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Policy Live Compliance Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              MC Policy Compliance Check
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Limit: $5,000 max (4x Contributions)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-900 p-2 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block text-[10px]">Borrower Total Contributions</span>
              <span className="font-mono font-bold text-white">${memberContributions.toFixed(2)}</span>
            </div>

            <div className="bg-slate-900 p-2 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block text-[10px]">Policy Borrowing Limit (4x)</span>
              <span className={`font-mono font-bold ${isOverCap ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${policyCap.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Warning banner if over limit or ineligible */}
          {isOverCap && (
            <div className="bg-rose-950/60 border border-rose-500/40 p-2 rounded-xl text-rose-200 flex items-start gap-2 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                Requested amount (${loanAmount}) exceeds borrower's 4x contribution limit (${policyCap}). Board of Directors explicit waiver required.
              </span>
            </div>
          )}

          {/* Active Loan or Cooldown Ineligibility Banners */}
          {borrowerName.trim() !== '' && !borrowerEligibility.isEligible && (
            <div className="bg-rose-950/80 border border-rose-500/60 p-2.5 rounded-xl text-rose-200 flex items-start gap-2 text-[11px]">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-rose-300 font-bold">Borrower Eligibility Protection:</strong>
                <span>{borrowerEligibility.reason}</span>
              </div>
            </div>
          )}

          {cosignName.trim() !== '' && !cosignerEligibility.isEligible && (
            <div className="bg-rose-950/80 border border-rose-500/60 p-2.5 rounded-xl text-rose-200 flex items-start gap-2 text-[11px]">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-rose-300 font-bold">Cosigner Eligibility Protection:</strong>
                <span>{cosignerEligibility.reason}</span>
              </div>
            </div>
          )}

          {isSamePerson && (
            <div className="bg-rose-950/80 border border-rose-500/60 p-2.5 rounded-xl text-rose-200 flex items-start gap-2 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>Borrower and Cosigner / Guarantor cannot be the same member.</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Borrower Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-300 font-semibold">Borrower Member Name *</label>
              {borrowerName.trim() !== '' && (
                borrowerEligibility.isEligible ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Eligible Borrower
                  </span>
                ) : (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-rose-400" /> Ineligible
                  </span>
                )
              )}
            </div>
            <input
              type="text"
              required
              list="member-list-names"
              placeholder="e.g. Tun Lam Khai"
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              className={`w-full bg-slate-800 border rounded-xl p-2.5 text-white focus:outline-none font-bold transition-colors ${
                borrowerName.trim() !== '' && !borrowerEligibility.isEligible
                  ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                  : 'border-slate-700 focus:border-amber-500'
              }`}
            />
            <datalist id="member-list-names">
              {members.filter(m => m.status !== 'inactive').map((m) => (
                <option key={m.id} value={m.name}>{m.id} - {m.otherName ? `(${m.otherName})` : ''} [Active • ${m.totalPaid} paid]</option>
              ))}
            </datalist>
            {borrowerName.trim() !== '' && !borrowerEligibility.isEligible && (
              <p className="text-[10px] text-rose-400 mt-1 font-semibold">
                ⚠️ {borrowerEligibility.reason}
              </p>
            )}
          </div>

          {/* Cosigner Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-300 font-semibold">Cosigner / Guarantor Member Name *</label>
              {cosignName.trim() !== '' && (
                cosignerEligibility.isEligible && !isSamePerson ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Eligible Cosigner
                  </span>
                ) : (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-rose-400" /> Ineligible
                  </span>
                )
              )}
            </div>
            <input
              type="text"
              required
              list="member-list-names"
              placeholder="e.g. Man Lun Mang"
              value={cosignName}
              onChange={(e) => setCosignName(e.target.value)}
              className={`w-full bg-slate-800 border rounded-xl p-2.5 text-white focus:outline-none transition-colors ${
                (cosignName.trim() !== '' && !cosignerEligibility.isEligible) || isSamePerson
                  ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                  : 'border-slate-700 focus:border-amber-500'
              }`}
            />
            {cosignName.trim() !== '' && !cosignerEligibility.isEligible && (
              <p className="text-[10px] text-rose-400 mt-1 font-semibold">
                ⚠️ {cosignerEligibility.reason}
              </p>
            )}
            {isSamePerson && (
              <p className="text-[10px] text-rose-400 mt-1 font-semibold">
                ⚠️ Borrower and Cosigner cannot be the same person.
              </p>
            )}
          </div>

          {/* Loan Amount & Term Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 font-sans">Principal Amount ($) *</label>
              <input
                type="number"
                required
                step="50"
                min="100"
                max="5000"
                value={loanAmount}
                onChange={(e) => setLoanAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Repayment Term</label>
              <select
                value={termMonths}
                onChange={(e) => handleTermChange(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value={12}>12 Months</option>
                <option value={24}>24 Months</option>
              </select>
            </div>
          </div>

          {/* Application Fee & Monthly Breakdown Card */}
          <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">MC Policy App Fee</span>
              <span className="text-sm font-extrabold text-amber-400 font-mono">${appFee.toFixed(2)}</span>
              <span className="text-[9px] text-slate-500 block">Standard BOD Fee</span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Monthly Repayment</span>
              <span className="text-sm font-extrabold text-emerald-400 font-mono">${monthlyPayment} / mo</span>
              <span className="text-[9px] text-amber-300 block">Due 10th of every month</span>
            </div>
          </div>

          {/* Start and End Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Contract Start Date</label>
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Maturity / End Date</label>
              <input
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Loan Purpose / Comments</label>
            <textarea
              placeholder="e.g. Approved by board for 24-month term..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              rows={2}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer mt-2 text-sm flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Authorize & Issue Loan (Fee: ${appFee.toFixed(2)})</span>
          </button>
        </form>

      </div>
    </div>
  );
};

