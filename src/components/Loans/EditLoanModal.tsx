import React, { useState, useEffect } from 'react';
import { X, Edit3, DollarSign, Calendar, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { Loan } from '../../types';

interface EditLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan | null;
}

export const EditLoanModal: React.FC<EditLoanModalProps> = ({ isOpen, onClose, loan }) => {
  const { updateLoan } = useClub();

  const [name, setName] = useState('');
  const [cosignName, setCosignName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [year, setYear] = useState<number>(2026);
  const [loanAmount, setLoanAmount] = useState<number>(0);
  const [paid, setPaid] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [status, setStatus] = useState<'active' | 'paid_off' | 'defaulted'>('active');
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (loan) {
      setName(loan.name);
      setCosignName(loan.cosignName);
      setStart(loan.start);
      setEnd(loan.end);
      setYear(loan.year || 2026);
      setLoanAmount(loan.loanAmount);
      setPaid(loan.paid);
      setBalance(loan.balance);
      setStatus(loan.status);
      setComments(loan.comments || '');
    }
  }, [loan]);

  if (!isOpen || !loan) return null;

  const handlePrincipalChange = (newAmount: number) => {
    setLoanAmount(newAmount);
    setBalance(Math.max(0, newAmount - paid));
  };

  const handlePaidChange = (newPaid: number) => {
    setPaid(newPaid);
    const calculatedBalance = Math.max(0, loanAmount - newPaid);
    setBalance(calculatedBalance);
    if (calculatedBalance === 0) {
      setStatus('paid_off');
    } else if (status === 'paid_off' && calculatedBalance > 0) {
      setStatus('active');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter Borrower Name');
      return;
    }
    if (!cosignName.trim()) {
      alert('Please enter Guarantor / Cosigner Name');
      return;
    }

    updateLoan(loan.id || loan.loanNumber, {
      name: name.trim(),
      cosignName: cosignName.trim(),
      start,
      end,
      year: Number(year),
      loanAmount: Number(loanAmount),
      paid: Number(paid),
      balance: Number(balance),
      status,
      comments: comments.trim()
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl w-full max-w-xl p-6 sm:p-8 space-y-6 shadow-2xl relative my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl">
              <Edit3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  Loan #{loan.loanNumber}
                </span>
                {loan.year && (
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {loan.year}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-white">Adjust / Edit Loan Contract</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Borrower & Cosigner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Borrower Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Guarantor / Cosigner Name</label>
              <input
                type="text"
                value={cosignName}
                onChange={(e) => setCosignName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* Start Date, End Date, Year */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> Start Date
              </label>
              <input
                type="text"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                placeholder="MM/DD/YYYY"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> Maturity Date
              </label>
              <input
                type="text"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                placeholder="MM/DD/YYYY"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Loan Batch Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
            </div>
          </div>

          {/* Financial Amounts: Principal, Paid, Balance */}
          <div className="grid grid-cols-3 gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-blue-400" /> Loan Principal
              </label>
              <input
                type="number"
                step="0.01"
                value={loanAmount}
                onChange={(e) => handlePrincipalChange(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Total Paid
              </label>
              <input
                type="number"
                step="0.01"
                value={paid}
                onChange={(e) => handlePaidChange(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" /> Remaining Balance
              </label>
              <input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* Loan Status & Comments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Contract Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="active">Active Outstanding</option>
                <option value="paid_off">Paid In Full</option>
                <option value="defaulted">Defaulted / Written Off</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Contract Comments / Notes
              </label>
              <input
                type="text"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Optional notes or board adjustments..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-center gap-2 text-amber-300 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              Admin Adjustment: Modifying this loan contract will update official reports and ledger balance sheets across the system.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20 transition-all flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Loan Adjustments</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
