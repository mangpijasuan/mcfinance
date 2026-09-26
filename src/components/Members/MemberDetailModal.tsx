import React, { useState } from 'react';
import {
  X,
  User,
  Calendar,
  CreditCard,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  Phone,
  Mail,
  ShieldAlert,
  Zap,
  KeyRound
} from 'lucide-react';
import { Member } from '../../types';
import { useClub } from '../../context/ClubContext';
import { sha256Hex } from '../../utils/authCrypto';
import { getDuesStatus } from '../../utils/duesStatus';

interface MemberDetailModalProps {
  member: Member | null;
  onClose: () => void;
  onRecordContribution: (memberId: string) => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  member,
  onClose,
  onRecordContribution
}) => {
  const { loans, togglePaymentMonth, sendReminder, reminderTemplates, updateMember, toggleMemberAutoPay } = useClub();
  
  if (!member) return null;

  const [selectedTemplate, setSelectedTemplate] = useState<string>(reminderTemplates[1]?.id || reminderTemplates[0]?.id || '');
  const [selectedChannel, setSelectedChannel] = useState<'SMS' | 'Email' | 'WhatsApp'>('SMS');
  const [notes, setNotes] = useState<string>(member.comments || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinStatus, setPinStatus] = useState('');

  // Find if this member has an active loan in the loan ledger
  const memberLoans = loans.filter(l => l.name.toLowerCase().includes(member.name.toLowerCase()));

  const months = [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'
  ];

  const handleSaveNotes = () => {
    updateMember(member.id, { comments: notes });
    setIsEditingNotes(false);
  };

  const handleSendReminder = () => {
    sendReminder(member.id, selectedTemplate, selectedChannel);
    alert(`Payment reminder dispatched to ${member.name} via ${selectedChannel}!`);
  };

  const handleSetPin = async () => {
    const cleanPin = newPin.trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      setPinStatus('PIN must be 4-8 digits.');
      return;
    }
    const hash = await sha256Hex(cleanPin);
    updateMember(member.id, { pin: hash });
    setNewPin('');
    setPinStatus(`PIN updated. Share it with ${member.name} through a secure channel.`);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative my-8 text-white space-y-6">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Member Profile Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-extrabold text-xl shadow-lg">
              {member.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{member.name}</h2>
                <span className="bg-amber-500/20 text-amber-300 font-mono text-xs px-2.5 py-0.5 rounded-full border border-amber-500/30">
                  {member.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {member.otherName ? `Known as: ${member.otherName} • ` : ''}Member since {member.dor}
              </p>
            </div>
          </div>

          <button
            onClick={() => onRecordContribution(member.id)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer self-start sm:self-auto"
          >
            <DollarSign className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>

        {/* Key Attributes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block font-semibold">Monthly Commitment</span>
            <span className="text-base font-extrabold text-emerald-400">${(member.monthlyAmount || 20).toFixed(2)}</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block font-semibold">Payment Preference</span>
            <span className="text-sm font-bold text-white">{member.paymentType}</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block font-semibold">Receiving Officer</span>
            <span className="text-sm font-bold text-amber-300">{member.receivedBy || 'Direct Auto-pay'}</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block font-semibold mb-1">Membership Status</span>
            <select
              value={member.status}
              onChange={(e) => updateMember(member.id, { status: e.target.value as 'active' | 'inactive' | 'overdue' })}
              className={`w-full max-w-full truncate text-xs font-bold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${
                member.status === 'inactive'
                  ? 'bg-slate-700 text-slate-300 border-slate-600'
                  : member.status === 'overdue' || (member.comments && member.comments.includes('nailo'))
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}
            >
              <option value="active" className="bg-slate-900 text-emerald-400 font-bold">Active Member</option>
              <option value="inactive" className="bg-slate-900 text-slate-400 font-bold">Inactive / Archived</option>
              <option value="overdue" className="bg-slate-900 text-rose-400 font-bold">Overdue / Pending Dues</option>
            </select>
          </div>
        </div>

        {/* Admin Auto-Pay Settings Panel */}
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              Auto-Payment Setup & Administration
            </h3>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase border ${
              (member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay'))
                ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {(member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay')) ? 'Auto-Pay Active' : 'Auto-Pay Disabled'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Auto-Debit Enrollment</span>
              <button
                type="button"
                onClick={() => toggleMemberAutoPay(member.id, !(member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay')))}
                className={`w-full py-2 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  (member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay'))
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{(member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay')) ? 'Disable Auto-Pay' : 'Enable Auto-Pay'}</span>
              </button>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Scheduled Charge Day</span>
              <select
                disabled={!(member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay'))}
                value={member.autoPayDay || 1}
                onChange={(e) => toggleMemberAutoPay(member.id, true, { autoPayDay: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 disabled:opacity-40 cursor-pointer"
              >
                <option value={1}>1st of Month</option>
                <option value={5}>5th of Month</option>
                <option value={15}>15th of Month</option>
                <option value={28}>28th of Month</option>
              </select>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Payment Method</span>
              <select
                disabled={!(member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay'))}
                value={member.autoPayMethod || 'Credit Card'}
                onChange={(e) => toggleMemberAutoPay(member.id, true, { autoPayMethod: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 disabled:opacity-40 cursor-pointer"
              >
                <option value="Credit Card">Credit Card (Stripe)</option>
                <option value="ACH Bank Debit">ACH Bank Debit</option>
                <option value="Zelle Auto">Zelle Direct Auto</option>
              </select>
            </div>
          </div>
        </div>

        {/* Member Active Loan Section (If Any) */}
        {memberLoans.length > 0 && (
          <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              Active Member Loan Record
            </h3>
            {memberLoans.map((loan) => (
              <div key={loan.loanNumber} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs bg-slate-900/80 p-3 rounded-xl border border-slate-800 gap-2">
                <div>
                  <span className="font-bold text-white">Loan #{loan.loanNumber}</span>
                  <span className="text-slate-400 ml-2">({loan.start} – {loan.end})</span>
                  <p className="text-slate-400 text-[11px] mt-0.5">Cosigned by: <strong className="text-amber-200">{loan.cosignName}</strong></p>
                </div>
                <div className="text-right">
                  <span className="text-slate-400">Balance: </span>
                  <span className="font-mono font-bold text-rose-400 text-sm">${loan.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span className="text-slate-500 text-[10px] block">Original: ${loan.loanAmount.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2025–2026 Contribution Checklist */}
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-amber-400" />
            2025–2026 Monthly Dues History Checklist
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {months.map((m) => {
              const status = getDuesStatus(member, m);
              const isNA = status === 'n/a';
              const isPaid = status === 'paid' || status === 'advance';
              return (
                <button
                  key={m}
                  onClick={() => !isNA && togglePaymentMonth(member.id, m)}
                  disabled={isNA}
                  className={`p-2 rounded-xl text-center border text-xs transition-all cursor-pointer disabled:cursor-not-allowed ${
                    isNA
                      ? 'bg-slate-900/60 text-slate-600 border-slate-800'
                      : isPaid
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="font-mono text-[10px] text-slate-400">{m}</div>
                  <div className="font-bold mt-0.5">{isNA ? 'N/A' : isPaid ? 'PAID' : 'UNPAID'}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Member Notes / Comments Editor */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Special Notes / Ledger Comments
            </h3>
            {!isEditingNotes ? (
              <button
                onClick={() => setIsEditingNotes(true)}
                className="text-xs text-amber-400 hover:underline cursor-pointer"
              >
                Edit Note
              </button>
            ) : (
              <button
                onClick={handleSaveNotes}
                className="text-xs bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-bold hover:bg-amber-400 cursor-pointer"
              >
                Save
              </button>
            )}
          </div>

          {isEditingNotes ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              rows={2}
            />
          ) : (
            <p className="text-xs text-slate-300 italic">
              {member.comments || 'No specific ledger comments logged.'}
            </p>
          )}
        </div>

        {/* Member Portal Security PIN */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            Member Portal Security PIN
          </h3>
          <p className="text-[11px] text-slate-400">
            {member.pin
              ? 'A custom PIN is set for this member.'
              : 'No custom PIN set yet — this member is using the default fallback PIN (last 4 digits of their phone number).'}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => {
                setNewPin(e.target.value.replace(/\D/g, ''));
                setPinStatus('');
              }}
              placeholder="New 4-8 digit PIN"
              maxLength={8}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSetPin}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer"
            >
              Set PIN
            </button>
          </div>
          {pinStatus && <p className="text-[11px] text-amber-300">{pinStatus}</p>}
        </div>

        {/* Automated Payment Reminder Trigger */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-amber-300 flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-400" />
            Send Direct Automated Payment Reminder
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Select Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {reminderTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title} ({t.language})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Communication Channel</label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="SMS">SMS Message</option>
                <option value="Email">Email Notification</option>
                <option value="WhatsApp">WhatsApp Direct</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSendReminder}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>Dispatch Automated Reminder Now</span>
          </button>
        </div>

      </div>
    </div>
  );
};
