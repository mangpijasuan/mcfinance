import React, { useState } from 'react';
import { X, DollarSign, CheckCircle2 } from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { Loan } from '../../types';

interface RecordLoanPaymentModalProps {
  loan: Loan | null;
  onClose: () => void;
}

export const RecordLoanPaymentModal: React.FC<RecordLoanPaymentModalProps> = ({ loan, onClose }) => {
  const { recordLoanPayment } = useClub();
  const [repaymentAmount, setRepaymentAmount] = useState<number>(300);
  const [note, setNote] = useState('');

  if (!loan) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repaymentAmount <= 0) {
      alert('Please enter a valid repayment amount');
      return;
    }

    recordLoanPayment(loan.id || loan.loanNumber, Number(repaymentAmount), note.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-white space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Record Loan Repayment</h2>
            <p className="text-xs text-amber-400 font-semibold mt-0.5">
              Loan #{loan.loanNumber} • {loan.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loan Balance Info */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block">Original Loan</span>
            <span className="font-bold text-white font-mono">${loan.loanAmount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Total Paid</span>
            <span className="font-bold text-emerald-400 font-mono">${loan.paid.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Remaining</span>
            <span className="font-extrabold text-amber-400 font-mono text-sm">${loan.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Repayment Amount ($) *</label>
            <input
              type="number"
              required
              step="10"
              max={loan.balance}
              value={repaymentAmount}
              onChange={(e) => setRepaymentAmount(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white font-mono font-bold text-base focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Payment Note / Method (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Cash collected by Pu Tuang, Zelle, Check #104"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-950/40 cursor-pointer text-sm"
          >
            Confirm & Log Repayment
          </button>
        </form>

      </div>
    </div>
  );
};
