import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, CreditCard, UserCheck, Sparkles } from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { PaymentType } from '../../types';

interface RecordContributionModalProps {
  isOpen: boolean;
  preSelectedMemberId?: string | null;
  onClose: () => void;
}

export const RecordContributionModal: React.FC<RecordContributionModalProps> = ({
  isOpen,
  preSelectedMemberId,
  onClose
}) => {
  const { members, recordContribution } = useClub();

  const activeDefaultMember = members.find(m => m.status === 'active') || members[0];
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    preSelectedMemberId || activeDefaultMember?.id || ''
  );
  const [month, setMonth] = useState<string>('2026-02');
  const [amount, setAmount] = useState<number>(20);
  const [paymentType, setPaymentType] = useState<PaymentType>('Auto-pay');
  const [note, setNote] = useState<string>('');

  const activeMembers = members.filter(m => m.status !== 'inactive');
  const inactiveMembers = members.filter(m => m.status === 'inactive');

  useEffect(() => {
    if (preSelectedMemberId) {
      setSelectedMemberId(preSelectedMemberId);
      const m = members.find(mem => mem.id === preSelectedMemberId);
      if (m) {
        setAmount(m.monthlyAmount);
        setPaymentType(m.paymentType);
      }
    }
  }, [preSelectedMemberId, members]);

  if (!isOpen) return null;

  const selectedMember = members.find(m => m.id === selectedMemberId);

  const handleMemberChange = (id: string) => {
    setSelectedMemberId(id);
    const m = members.find(mem => mem.id === id);
    if (m) {
      setAmount(m.monthlyAmount);
      setPaymentType(m.paymentType);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) {
      alert('Please select a member');
      return;
    }

    recordContribution(selectedMemberId, month, Number(amount), paymentType, note.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-white space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Record Monthly Dues</h2>
              <p className="text-xs text-slate-400">Log incoming member contribution</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Select Member *</label>
            <select
              value={selectedMemberId}
              onChange={(e) => handleMemberChange(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <optgroup label="Active Members">
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} - {m.name} {m.otherName ? `(${m.otherName})` : ''}
                  </option>
                ))}
              </optgroup>
              {inactiveMembers.length > 0 && (
                <optgroup label="Inactive Members">
                  {inactiveMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} - {m.name} {m.otherName ? `(${m.otherName})` : ''} [INACTIVE]
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Payment Month</label>
              <input
                type="text"
                placeholder="2026-02"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Dues Amount ($)</label>
              <input
                type="number"
                step="5"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Payment Method</label>
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as PaymentType)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="Auto-pay">Auto-pay</option>
              <option value="Cash">Cash</option>
              <option value="Online">Online / Credit Card</option>
              <option value="Zelle">Zelle Transfer</option>
              <option value="Check">Check</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Collector / Receipt Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Received by Nangpi"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-950/40 cursor-pointer text-sm"
          >
            Submit & Add to Fund Balance
          </button>
        </form>

      </div>
    </div>
  );
};
