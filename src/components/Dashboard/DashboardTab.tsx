import React from 'react';
import {
  TrendingUp,
  Landmark,
  Wallet,
  Coins,
  PiggyBank,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  ShieldAlert,
  Send,
  UserCheck,
  BellRing
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useClub } from '../../context/ClubContext';

interface DashboardTabProps {
  onNavigateTab: (tab: 'members' | 'loans' | 'reminders') => void;
  onRecordContribution: () => void;
  onIssueLoan: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  onNavigateTab,
  onRecordContribution,
  onIssueLoan
}) => {
  const { metrics, yearlyContributions, yearlyLoans, members, loans, activityLogs, sendReminder, reminderTemplates } = useClub();

  // Calculate cumulative contributions over time
  let cumulative = 0;
  const cumulativeData = yearlyContributions.map(y => {
    cumulative += y.total;
    return {
      year: y.year,
      yearlyTotal: y.total,
      cumulativeTotal: cumulative
    };
  });

  // Combine yearly contributions and loans for comparison
  const yearlyComparisonData = yearlyContributions.map(yc => {
    const loanMatch = yearlyLoans.find(yl => yl.year === yc.year);
    return {
      year: yc.year,
      Contribution: yc.total,
      LoanGranted: loanMatch ? loanMatch.totalLoan : 0,
      LoanOutstanding: loanMatch ? loanMatch.balance : 0
    };
  });

  // Calculate payment method breakdown
  const paymentMethodsCount = members.reduce((acc, m) => {
    acc[m.paymentType] = (acc[m.paymentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(paymentMethodsCount).map(([name, value]) => ({
    name,
    value
  }));

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B'];

  // Identify overdue members
  const overdueMembers = members.filter(
    m => m.status === 'overdue' || (m.comments && m.comments.toLowerCase().includes('nailo'))
  );

  // Active loan stats
  const totalActiveLoanAmount = loans.reduce((acc, l) => acc + l.loanAmount, 0);
  const totalActivePaidAmount = loans.reduce((acc, l) => acc + l.paid, 0);
  const totalActiveBalanceAmount = loans.reduce((acc, l) => acc + l.balance, 0);

  return (
    <div className="space-y-6">
      
      {/* Executive Financial Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        
        {/* Total Contributions */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 sm:w-24 sm:h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">Total Capital</span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Coins className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="text-base sm:text-3xl font-extrabold text-white tracking-tight truncate">
            ${metrics.totalContributions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center text-[10px] sm:text-xs text-emerald-400 font-medium truncate">
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5 shrink-0" />
            <span>Verified Member Capital</span>
          </div>
        </div>

        {/* Total Bank Balance */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xl relative overflow-hidden group hover:border-blue-500/50 transition-all">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 sm:w-24 sm:h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">Bank Balance</span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Landmark className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="text-base sm:text-3xl font-extrabold text-white tracking-tight truncate">
            ${metrics.totalBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center text-[10px] sm:text-xs text-slate-400 truncate">
            <span>Operating: </span>
            <span className="ml-1 text-blue-300 font-semibold truncate">${metrics.actualBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Total Loan Balance */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 sm:w-24 sm:h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">Loan Balance</span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="text-base sm:text-3xl font-extrabold text-white tracking-tight truncate">
            ${metrics.totalLoanBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center justify-between text-[10px] sm:text-xs text-slate-400 truncate">
            <span>2026 Ledger:</span>
            <span className="text-amber-400 font-semibold truncate">${totalActiveBalanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Investments */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-xl relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 sm:w-24 sm:h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">Investments</span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <PiggyBank className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="text-base sm:text-3xl font-extrabold text-white tracking-tight truncate">
            ${metrics.investment.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center text-[10px] sm:text-xs text-purple-300 font-medium truncate">
            <span>Investment Pool</span>
          </div>
        </div>

      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cumulative Fund Growth Chart */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Cumulative Fund Growth (2014 – 2026)
              </h2>
              <p className="text-xs text-slate-400">Total member contributions accumulation over 12 years</p>
            </div>
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full font-semibold self-start sm:self-auto">
              Total: $167,600.00
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fundColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="year" stroke="#94A3B8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} tickFormatter={(val) => `$${val / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                  formatter={(val: any) => [`$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Total Contributions']}
                />
                <Area type="monotone" dataKey="cumulativeTotal" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#fundColor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Preferences & Overdue Quick Actions */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Payment Method Breakdown</h2>
            <p className="text-xs text-slate-400 mb-4">Distribution across 111 active club members</p>

            <div className="h-48 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              {pieData.map((item, idx) => (
                <div key={item.name} className="bg-slate-800/60 rounded-lg p-2 text-center border border-slate-700/50">
                  <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <div className="text-[11px] text-slate-400 font-medium">{item.name}</div>
                  <div className="text-sm font-bold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('members')}
            className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>Manage All 111 Members</span>
          </button>
        </div>

      </div>

      {/* Yearly Loan vs Contribution Comparison & Overdue Alert Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Annual Contributions vs Loans Bar Chart */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Annual Contributions vs. Loan Volume</h2>
              <p className="text-xs text-slate-400">Comparing yearly incoming dues against active loan issuance</p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyComparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="year" stroke="#94A3B8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} tickFormatter={(val) => `$${val / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                  formatter={(val: any) => [`$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]}
                />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Bar dataKey="Contribution" fill="#10B981" radius={[4, 4, 0, 0]} name="Annual Dues ($)" />
                <Bar dataKey="LoanGranted" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Loans Issued ($)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overdue Payment Alert & Direct Actions */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                Urgent Reminders
              </h2>
              <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {overdueMembers.length} Flagged
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Members with outstanding unsubmitted dues or loan balances</p>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {overdueMembers.map((m) => (
                <div key={m.id} className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white">{m.name} <span className="text-slate-400 text-[11px]">({m.id})</span></div>
                    <div className="text-rose-400 text-[11px] font-medium mt-0.5">{m.comments || 'Unpaid Monthly Dues'}</div>
                  </div>
                  <button
                    onClick={() => {
                      sendReminder(m.id, reminderTemplates[1]?.id || 'tmpl-2', 'SMS');
                      alert(`Automated Zomi/English reminder sent to ${m.name}!`);
                    }}
                    className="bg-rose-600/30 hover:bg-rose-600 text-rose-200 border border-rose-500/40 px-2.5 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Remind</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('reminders')}
            className="w-full mt-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-950/40"
          >
            <BellRing className="w-4 h-4" />
            <span>Open Automated Reminders Center</span>
          </button>
        </div>

      </div>

      {/* Activity Log Stream */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Live Club Audit Stream & Activity
          </h2>
          <span className="text-xs text-slate-400">{activityLogs.length} events logged</span>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {activityLogs.slice(0, 6).map((log) => (
            <div key={log.id} className="bg-slate-800/40 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  log.category === 'Contribution' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  log.category === 'Loan' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  log.category === 'Reminder' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                  'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {log.category}
                </span>
                <span className="text-slate-200 font-medium">{log.details}</span>
              </div>
              <span className="text-slate-500 text-[11px] whitespace-nowrap">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
