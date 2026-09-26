import React, { useState } from 'react';
import {
  BellRing,
  Send,
  MessageSquare,
  Mail,
  Smartphone,
  Sparkles,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus
} from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import { ReminderTemplate } from '../../types';

export const RemindersTab: React.FC = () => {
  const {
    members,
    loans,
    reminderTemplates,
    reminderLogs,
    sendReminder,
    sendBulkReminders,
    saveReminderTemplate
  } = useClub();

  const [activeSubTab, setActiveSubTab] = useState<'queue' | 'templates' | 'logs'>('queue');
  const [selectedChannel, setSelectedChannel] = useState<'SMS' | 'Email' | 'WhatsApp'>('SMS');
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);

  const overdueMembers = members.filter(
    m => m.status === 'overdue' || (m.comments && m.comments.toLowerCase().includes('nailo'))
  );

  const activeBorrowers = loans.filter(l => l.balance > 0);

  const handleBulkOverdueSend = () => {
    const count = sendBulkReminders('overdue_members', selectedChannel);
    alert(`Successfully dispatched automated ${selectedChannel} payment reminders to ${count} members with pending dues!`);
  };

  const handleBulkLoanSend = () => {
    const count = sendBulkReminders('all_active_loans', selectedChannel);
    alert(`Successfully dispatched automated ${selectedChannel} repayment alerts to ${count} active loan contract holders!`);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    saveReminderTemplate(editingTemplate);
    setEditingTemplate(null);
    alert('Template saved successfully!');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-white">Automated Payment Reminders Engine</h2>
            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-rose-400" /> Auto-Dispatch Ready
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automate monthly dues notifications and loan payment alerts in Zomi, English, and Burmese across SMS, Email, and WhatsApp.
          </p>
        </div>

        {/* Sub-tab Toggle */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-1 flex items-center self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab('queue')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'queue' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Dispatch Queue ({overdueMembers.length})
          </button>
          <button
            onClick={() => setActiveSubTab('templates')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'templates' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Templates ({reminderTemplates.length})
          </button>
          <button
            onClick={() => setActiveSubTab('logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'logs' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Audit History ({reminderLogs.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'queue' && (
        <div className="space-y-6">
          
          {/* Bulk Dispatch Control Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Target Communication Channel</label>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedChannel('SMS')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedChannel === 'SMS'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> SMS Text
                </button>
                <button
                  onClick={() => setSelectedChannel('Email')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedChannel === 'Email'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button
                  onClick={() => setSelectedChannel('WhatsApp')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    selectedChannel === 'WhatsApp'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                </button>
              </div>
            </div>

            <button
              onClick={handleBulkOverdueSend}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all shadow-lg shadow-rose-950/40 cursor-pointer flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Bulk Remind All Overdue Members ({overdueMembers.length})</span>
            </button>

            <button
              onClick={handleBulkLoanSend}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all shadow-lg shadow-amber-950/40 cursor-pointer flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Send Loan Installment Notices ({activeBorrowers.length})</span>
            </button>

          </div>

          {/* Overdue Dues List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Overdue Members Column */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Pending Monthly Dues Queue
              </h3>
              <p className="text-xs text-slate-400 mb-4">Members flagged in report with unsubmitted monthly contributions</p>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {overdueMembers.map((m) => (
                  <div key={m.id} className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white text-sm">{m.name} <span className="text-amber-400 font-mono text-xs">({m.id})</span></div>
                      <div className="text-rose-300 text-xs font-medium mt-0.5">{m.comments || 'Pending monthly payment'}</div>
                      <div className="text-slate-400 text-[11px] mt-1">Method: {m.paymentType} • Rate: ${m.monthlyAmount}/mo</div>
                    </div>

                    <button
                      onClick={() => {
                        sendReminder(m.id, reminderTemplates[1]?.id || 'tmpl-2', selectedChannel);
                        alert(`Sent ${selectedChannel} reminder to ${m.name}`);
                      }}
                      className="bg-rose-600/30 hover:bg-rose-600 text-rose-200 border border-rose-500/40 px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Remind</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Loan Borrowers Due Column */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-400" />
                Active Loan Installments Queue
              </h3>
              <p className="text-xs text-slate-400 mb-4">Borrowers with active outstanding loan balances</p>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {activeBorrowers.map((l) => (
                  <div key={l.loanNumber} className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white text-sm">Loan #{l.loanNumber}: {l.name}</div>
                      <div className="text-amber-300 font-mono text-xs mt-0.5">Remaining Balance: ${l.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      <div className="text-slate-400 text-[11px] mt-1">Cosigner: {l.cosignName} • Term: {l.start} – {l.end}</div>
                    </div>

                    <button
                      onClick={() => {
                        sendReminder(`Loan #${l.loanNumber}`, reminderTemplates[2]?.id || 'tmpl-3', selectedChannel);
                        alert(`Sent loan notice to ${l.name}`);
                      }}
                      className="bg-amber-600/30 hover:bg-amber-600 text-amber-200 border border-amber-500/40 px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Alert</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {activeSubTab === 'templates' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reminderTemplates.map((t) => (
              <div key={t.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                      {t.language}
                    </span>
                    <button
                      onClick={() => setEditingTemplate(t)}
                      className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{t.title}</h3>
                  <p className="text-xs font-semibold text-slate-300 mb-3">{t.subject}</p>
                  <p className="text-xs text-slate-400 bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 leading-relaxed font-mono">
                    {t.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {editingTemplate && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-xs space-y-4 max-w-2xl mx-auto">
              <h3 className="text-base font-bold text-white">Edit Template: {editingTemplate.title}</h3>
              <form onSubmit={handleSaveTemplate} className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Subject Header</label>
                  <input
                    type="text"
                    value={editingTemplate.subject}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Message Body (Placeholders: &#123;MEMBER_NAME&#125;, &#123;MC_NUMBER&#125;, &#123;AMOUNT_DUE&#125;, &#123;CURRENT_MONTH&#125;)</label>
                  <textarea
                    value={editingTemplate.body}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-amber-500"
                    rows={4}
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'logs' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Sent Reminder Dispatch History
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {reminderLogs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No reminders sent yet in this session.</p>
            ) : (
              reminderLogs.map((log) => (
                <div key={log.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white">{log.memberName}</span>
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded font-mono">{log.memberId}</span>
                      <span className="bg-blue-500/20 text-blue-300 text-[10px] px-2 py-0.5 rounded uppercase font-bold">{log.channel}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1 italic font-mono">{log.message}</p>
                  </div>
                  <span className="text-slate-500 text-[10px] whitespace-nowrap">{new Date(log.date).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
};
