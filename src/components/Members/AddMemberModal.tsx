import React, { useState } from 'react';
import { X, UserPlus, DollarSign, Calendar, CreditCard, User, Mail, Phone, FileText } from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { PaymentType } from '../../types';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose }) => {
  const { addMember, members } = useClub();

  const nextMcNumber = `MC-${members.length + 10001}`;

  const [formData, setFormData] = useState({
    name: '',
    otherName: '',
    dor: new Date().toLocaleDateString('en-US'),
    monthlyAmount: 20.00,
    paymentType: 'Auto-pay' as PaymentType,
    receivedBy: '',
    phone: '',
    email: '',
    comments: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter member full name');
      return;
    }

    addMember({
      name: formData.name.trim(),
      otherName: formData.otherName.trim() || undefined,
      dor: formData.dor,
      monthlyAmount: Number(formData.monthlyAmount),
      paymentType: formData.paymentType,
      receivedBy: formData.receivedBy.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      comments: formData.comments.trim() || undefined,
      status: 'active',
      isAutoPayEnabled: formData.paymentType === 'Auto-pay',
      autoPayDay: 1,
      autoPayMethod: 'Credit Card',
      autoPayStatus: formData.paymentType === 'Auto-pay' ? 'active' : 'paused'
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
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Register New Club Member</h2>
              <p className="text-xs text-slate-400">Assigned MC ID: <strong className="text-amber-400 font-mono">{nextMcNumber}</strong></p>
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
            <label className="block text-slate-300 font-semibold mb-1">Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Mang Sian Pau"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Other Name / Nickname</label>
              <input
                type="text"
                placeholder="e.g. Pa Mangpi"
                value={formData.otherName}
                onChange={(e) => setFormData({ ...formData, otherName: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Date of Registration</label>
              <input
                type="text"
                value={formData.dor}
                onChange={(e) => setFormData({ ...formData, dor: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Monthly Dues ($)</label>
              <input
                type="number"
                step="5"
                value={formData.monthlyAmount}
                onChange={(e) => setFormData({ ...formData, monthlyAmount: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Payment Type</label>
              <select
                value={formData.paymentType}
                onChange={(e) => setFormData({ ...formData, paymentType: e.target.value as PaymentType })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="Auto-pay">Auto-pay</option>
                <option value="Cash">Cash</option>
                <option value="Online">Online / Credit Card</option>
                <option value="Zelle">Zelle Transfer</option>
                <option value="Check">Check</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Received By / Collector Officer (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Nangpi, PuTuang, Mangpi"
              value={formData.receivedBy}
              onChange={(e) => setFormData({ ...formData, receivedBy: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="123-456-7890"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
              <input
                type="email"
                placeholder="member@millionairesclub.org"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Comments / Notes</label>
            <textarea
              placeholder="e.g. Advance paid, loan comment, etc."
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
              rows={2}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer mt-2 text-sm"
          >
            Submit & Save Member Profile
          </button>
        </form>

      </div>
    </div>
  );
};
