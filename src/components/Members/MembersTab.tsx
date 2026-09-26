import React, { useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  CreditCard,
  User,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Zap,
  Settings,
  Play,
  Pause,
  Building,
  Check
} from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { Member, PaymentType } from '../../types';
import { getDuesStatus } from '../../utils/duesStatus';

interface MembersTabProps {
  onSelectMember: (member: Member) => void;
  onOpenAddMember: () => void;
  onRecordContributionForMember: (memberId: string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  onSelectMember,
  onOpenAddMember,
  onRecordContributionForMember
}) => {
  const {
    members,
    togglePaymentMonth,
    sendReminder,
    reminderTemplates,
    toggleMemberAutoPay,
    processBatchAutoPayments
  } = useClub();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'roster' | 'matrix' | 'autopay'>('roster');

  const [batchMonth, setBatchMonth] = useState<string>('2026-02');
  const [batchResult, setBatchResult] = useState<{ processedCount: number; totalCollected: number; processedMembers: string[] } | null>(null);

  // Months to display in the quick matrix view
  const matrixMonths = [
    '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04'
  ];

  // Auto-Pay Enrolled Members Count & Total
  const autoPayEnrolled = members.filter(m => m.isAutoPayEnabled || m.paymentType === 'Auto-pay');
  const totalAutoPayAmount = autoPayEnrolled.reduce((sum, m) => sum + (m.monthlyAmount || 20), 0);

  // Filter members
  const filteredMembers = members.filter(m => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.otherName && m.otherName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.comments && m.comments.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.receivedBy && m.receivedBy.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesPayment = paymentFilter === 'all' || m.paymentType === paymentFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'overdue' && (m.status === 'overdue' || (m.comments && m.comments.toLowerCase().includes('nailo')))) ||
      (statusFilter === 'inactive' && m.status === 'inactive') ||
      (statusFilter === 'active' && m.status === 'active' && !(m.comments && m.comments.toLowerCase().includes('nailo')));

    return matchesSearch && matchesPayment && matchesStatus;
  });

  const handleRunBatchAutoPay = () => {
    const res = processBatchAutoPayments(batchMonth);
    setBatchResult(res);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Search & Filter Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search member by Name, Other Name, MC-10001, officer, or note..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-all"
          />
        </div>

        {/* Filters & View Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Payment Type Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Payment Types</option>
            <option value="Auto-pay">Auto-pay</option>
            <option value="Cash">Cash</option>
            <option value="Online">Online</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Members (Active + Inactive)</option>
            <option value="active">Active Members Only</option>
            <option value="overdue">Pending / Overdue Dues</option>
            <option value="inactive">Inactive Members Only</option>
          </select>

          {/* View Mode Toggle */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-1 flex items-center">
            <button
              onClick={() => setViewMode('roster')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'roster' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Roster Table
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'matrix' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              2025/26 Matrix
            </button>
            <button
              onClick={() => setViewMode('autopay')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'autopay' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30' : 'text-amber-400 hover:text-amber-200 hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
              <span>Auto-Pay Settings</span>
            </button>
          </div>

          {/* Add Member Button */}
          <button
            onClick={onOpenAddMember}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>

        </div>

      </div>

      {/* Summary Count Header */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>Showing <strong className="text-white">{filteredMembers.length}</strong> of {members.length} club members</span>
        <span className="text-emerald-400 font-medium">Standard Dues: $20.00 / Month (New 2026 Rate: $30.00)</span>
      </div>

      {/* Main Table / Matrix Display */}
      {viewMode === 'roster' ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/80 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">MC Number</th>
                  <th className="py-3.5 px-4">Member Name</th>
                  <th className="py-3.5 px-4">Other Name</th>
                  <th className="py-3.5 px-4">Registration</th>
                  <th className="py-3.5 px-4">Rate</th>
                  <th className="py-3.5 px-4">Payment Method</th>
                  <th className="py-3.5 px-4">Received By</th>
                  <th className="py-3.5 px-4">Comments / Loan Note</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMembers.map((member) => {
                  const isOverdue = member.status === 'overdue' || (member.comments && member.comments.toLowerCase().includes('nailo'));
                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-800/40 transition-all group"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-amber-300 whitespace-nowrap">
                        {member.id}
                      </td>
                      <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSelectMember(member)}
                            className="hover:text-amber-400 text-left transition-colors cursor-pointer"
                          >
                            {member.name}
                          </button>
                          {member.status === 'inactive' && (
                            <span className="bg-slate-700/80 text-slate-300 border border-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                        {member.otherName || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap font-mono text-xs">
                        {member.dor}
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-400 whitespace-nowrap">
                        ${(member.monthlyAmount || 20).toFixed(2)}/mo
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          member.paymentType === 'Auto-pay'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : member.paymentType === 'Cash'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {member.paymentType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                        {member.receivedBy ? (
                          <span className="text-slate-200 font-medium">{member.receivedBy}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap max-w-xs truncate">
                        {member.comments ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            isOverdue
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {member.comments}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onSelectMember(member)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 rounded-lg text-xs transition-all cursor-pointer"
                            title="View Full Member Profile"
                          >
                            <Eye className="w-4 h-4 text-amber-400" />
                          </button>

                          <button
                            onClick={() => onRecordContributionForMember(member.id)}
                            className="bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 border border-emerald-500/40 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                            title="Record Payment"
                          >
                            + Pay
                          </button>

                          {isOverdue && (
                            <button
                              onClick={() => {
                                sendReminder(member.id, reminderTemplates[1]?.id || 'tmpl-2', 'SMS');
                                alert(`Automated reminder dispatched to ${member.name}!`);
                              }}
                              className="bg-rose-600/30 hover:bg-rose-600 text-rose-200 border border-rose-500/40 p-1.5 rounded-lg text-xs transition-all cursor-pointer"
                              title="Send Quick Reminder"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
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
      ) : (
        /* Monthly Payment Matrix Grid View */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                2025 – 2026 Monthly Contribution Matrix
              </h3>
              <p className="text-xs text-slate-400">Click any month cell to toggle payment verification status</p>
            </div>
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500" />
                <span className="text-slate-300">Paid</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-slate-800 border border-slate-700" />
                <span className="text-slate-400">Unpaid / Pending</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/80 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3">MC #</th>
                  <th className="py-3 px-3">Member Name</th>
                  {matrixMonths.map(m => (
                    <th key={m} className="py-3 px-2 text-center font-mono">
                      {m.substring(2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMembers.map((member) => {
                  return (
                    <tr key={member.id} className="hover:bg-slate-800/40 transition-all">
                      <td className="py-2 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                        {member.id}
                      </td>
                      <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                        {member.name}
                      </td>
                      {matrixMonths.map(monthKey => {
                        const status = getDuesStatus(member, monthKey);
                        const isNA = status === 'n/a';
                        const isPaid = status === 'paid' || status === 'advance';
                        return (
                          <td key={monthKey} className="py-2 px-2 text-center">
                            <button
                              onClick={() => !isNA && togglePaymentMonth(member.id, monthKey)}
                              disabled={isNA}
                              className={`w-7 h-7 rounded-lg font-mono text-[10px] font-bold transition-all flex items-center justify-center mx-auto cursor-pointer disabled:cursor-not-allowed ${
                                isNA
                                  ? 'bg-slate-900/40 text-slate-700 border border-slate-800'
                                  : isPaid
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/40'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-500 hover:text-white'
                              }`}
                              title={`${member.name} - ${monthKey}: ${isNA ? 'Not yet a member' : isPaid ? 'Paid' : 'Click to mark as paid'}`}
                            >
                              {isNA ? '·' : isPaid ? '✓' : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auto-Pay Settings Management View */}
      {viewMode === 'autopay' && (
        <div className="space-y-6">
          {/* Top Auto-Pay Admin Metrics & Batch Action Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-amber-500/30 p-4 rounded-2xl shadow-xl flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Zap className="w-6 h-6 fill-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Enrolled in Auto-Pay</p>
                <div className="flex items-baseline space-x-2 mt-0.5">
                  <span className="text-2xl font-extrabold text-white">{autoPayEnrolled.length}</span>
                  <span className="text-xs text-amber-300 font-semibold">/ {members.length} Members</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl shadow-xl flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Monthly Auto-Collection</p>
                <p className="text-2xl font-extrabold text-emerald-400 mt-0.5">${totalAutoPayAmount.toFixed(2)}</p>
              </div>
            </div>

            {/* Run Batch Action Card */}
            <div className="bg-gradient-to-r from-amber-950/60 to-slate-900 border border-amber-500/40 p-4 rounded-2xl shadow-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  Trigger Monthly Auto-Pay Batch
                </span>
                <select
                  value={batchMonth}
                  onChange={(e) => setBatchMonth(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-amber-200 focus:outline-none"
                >
                  <option value="2026-01">2026-01</option>
                  <option value="2026-02">2026-02</option>
                  <option value="2026-03">2026-03</option>
                  <option value="2026-04">2026-04</option>
                </select>
              </div>

              <button
                onClick={handleRunBatchAutoPay}
                className="w-full bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 transition-all cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Process Due Auto-Payments ({batchMonth})</span>
              </button>
            </div>
          </div>

          {/* Batch Result Banner */}
          {batchResult && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-2xl p-4 shadow-2xl animate-fadeIn space-y-2">
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
                <div className="flex items-center space-x-2 text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Batch Processing Complete for {batchMonth}!</span>
                </div>
                <button
                  onClick={() => setBatchResult(null)}
                  className="text-emerald-400 hover:text-white text-xs bg-emerald-900/50 px-2 py-1 rounded-lg"
                >
                  Dismiss
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-emerald-200">
                <span>Processed: <strong>{batchResult.processedCount} members</strong></span>
                <span>Total Collected: <strong className="text-emerald-300 text-sm">${batchResult.totalCollected.toFixed(2)}</strong></span>
              </div>

              {batchResult.processedMembers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {batchResult.processedMembers.map((m, idx) => (
                    <span key={idx} className="bg-emerald-900/60 text-emerald-200 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono">
                      ✓ {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-300/80 italic">All enrolled auto-pay members were already paid for {batchMonth}.</p>
              )}
            </div>
          )}

          {/* Admin Auto-Pay Settings Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-400" />
                  Admin Auto-Payment Member Roster & Settings
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure auto-debit preferences, charge schedule day, payment methods, and status for each member.
                </p>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <span>Enrolled Count: <strong className="text-amber-300 font-mono">{autoPayEnrolled.length} members</strong></span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/80 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Member ID</th>
                    <th className="py-3.5 px-4">Member Name</th>
                    <th className="py-3.5 px-4 text-center">Auto-Pay Enabled</th>
                    <th className="py-3.5 px-4">Charge Day</th>
                    <th className="py-3.5 px-4">Payment Method</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Last Processed</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredMembers.map((member) => {
                    const isEnrolled = member.isAutoPayEnabled ?? (member.paymentType === 'Auto-pay');
                    const chargeDay = member.autoPayDay || 1;
                    const method = member.autoPayMethod || 'Credit Card';
                    const status = member.autoPayStatus || (isEnrolled ? 'active' : 'paused');

                    return (
                      <tr key={member.id} className="hover:bg-slate-800/40 transition-all">
                        <td className="py-3 px-4 font-mono font-bold text-amber-300 whitespace-nowrap">
                          {member.id}
                        </td>
                        <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                          <button
                            onClick={() => onSelectMember(member)}
                            className="hover:text-amber-400 text-left transition-colors cursor-pointer"
                          >
                            {member.name}
                          </button>
                        </td>

                        {/* Enable/Disable Toggle Switch */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => toggleMemberAutoPay(member.id, !isEnrolled)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                              isEnrolled
                                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50 hover:bg-amber-600/50'
                                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            <Zap className={`w-3.5 h-3.5 ${isEnrolled ? 'fill-amber-300 text-amber-300' : ''}`} />
                            <span>{isEnrolled ? 'ENABLED' : 'OFF'}</span>
                          </button>
                        </td>

                        {/* Charge Day Selector */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            disabled={!isEnrolled}
                            value={chargeDay}
                            onChange={(e) => toggleMemberAutoPay(member.id, isEnrolled, { autoPayDay: Number(e.target.value) })}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-40 cursor-pointer"
                          >
                            <option value={1}>1st of Month</option>
                            <option value={5}>5th of Month</option>
                            <option value={15}>15th of Month</option>
                            <option value={28}>28th of Month</option>
                          </select>
                        </td>

                        {/* Payment Method Selector */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            disabled={!isEnrolled}
                            value={method}
                            onChange={(e) => toggleMemberAutoPay(member.id, isEnrolled, { autoPayMethod: e.target.value as any })}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-40 cursor-pointer"
                          >
                            <option value="Credit Card">Credit Card (Stripe)</option>
                            <option value="ACH Bank Debit">ACH Bank Debit</option>
                            <option value="Zelle Auto">Zelle Direct Auto</option>
                          </select>
                        </td>

                        {/* Status Badge & Selector */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isEnrolled ? (
                            <select
                              value={status}
                              onChange={(e) => toggleMemberAutoPay(member.id, true, { autoPayStatus: e.target.value as any })}
                              className={`rounded-lg px-2 py-1 text-xs font-bold border focus:outline-none cursor-pointer ${
                                status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : status === 'paused'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              }`}
                            >
                              <option value="active" className="bg-slate-900 text-emerald-300">Active</option>
                              <option value="paused" className="bg-slate-900 text-amber-300">Paused</option>
                              <option value="failed" className="bg-slate-900 text-rose-300">Failed</option>
                            </select>
                          ) : (
                            <span className="text-slate-500 text-xs italic">Disabled</span>
                          )}
                        </td>

                        {/* Last Processed */}
                        <td className="py-3 px-4 text-slate-400 font-mono text-xs whitespace-nowrap">
                          {member.autoPayLastProcessed || <span className="text-slate-600">—</span>}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => onSelectMember(member)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 rounded-lg text-xs transition-all cursor-pointer"
                              title="Edit Member Profile"
                            >
                              <Eye className="w-4 h-4 text-amber-400" />
                            </button>

                            <button
                              onClick={() => onRecordContributionForMember(member.id)}
                              className="bg-amber-600/30 hover:bg-amber-600 text-amber-200 border border-amber-500/40 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                              title="Record Single Payment"
                            >
                              + Pay
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
