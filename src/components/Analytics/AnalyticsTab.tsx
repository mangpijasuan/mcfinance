import React, { useState } from 'react';
import {
  TrendingUp,
  PieChart as PieIcon,
  Calculator,
  ShieldCheck,
  Award,
  ArrowUpRight,
  Layers,
  Banknote
} from 'lucide-react';
import { useClub } from '../../context/ClubContext';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

export const AnalyticsTab: React.FC = () => {
  const { metrics, yearlyContributions, yearlyLoans, members } = useClub();

  const [simulatedYears, setSimulatedYears] = useState<number>(3);
  const [memberGrowthRate, setMemberGrowthRate] = useState<number>(5);

  // Reconciliation Check
  const calculatedSum = metrics.trustFund + metrics.capital + metrics.investmentFund;
  const isReconciled = Math.abs(calculatedSum - metrics.totalContributions) < 1;

  // Portfolio allocation
  const portfolioData = [
    { name: 'Trust Bank Balance', value: metrics.trustFund, color: '#3B82F6' },
    { name: 'Loan Capital Assets', value: metrics.capital, color: '#F59E0B' },
    { name: 'Investment Fund', value: metrics.investmentFund, color: '#A855F7' },
  ];

  // Projection logic
  const currentMonthlyInflow = members.reduce((acc, m) => acc + m.monthlyAmount, 0);
  const currentAnnualInflow = currentMonthlyInflow * 12;

  const projectionData = [];
  let projectedFund = metrics.totalContributions;
  let currentMemberCount = members.length;

  for (let y = 1; y <= simulatedYears; y++) {
    currentMemberCount = Math.round(currentMemberCount * (1 + memberGrowthRate / 100));
    const annualDues = currentMemberCount * 20 * 12;
    projectedFund += annualDues;
    projectionData.push({
      year: `Year +${y}`,
      projectedFund,
      annualDues,
      projectedMembers: currentMemberCount
    });
  }

  return (
    <div className="space-y-6">
      
      {/* Official Balance Sheet Reconciliation Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-white">Trust Fund Balance Reconciliation Audit</h2>
              {isReconciled && (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  100% Balanced
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Official Millionaires Club Asset Allocation Formula: Total Contributions = Bank Balance + Outstanding Loans + Investment Fund
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 uppercase tracking-wider block font-semibold">Total Verified Assets</span>
            <span className="text-2xl font-extrabold text-emerald-400 font-mono">
              ${calculatedSum.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 text-xs">
            <span className="text-slate-400 block font-semibold">Trust Bank Balance</span>
            <span className="text-xl font-bold text-blue-400 font-mono mt-1 block">
              ${metrics.trustFund.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-400 text-[11px] mt-1 block">Liquid bank reserve</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 text-xs">
            <span className="text-slate-400 block font-semibold">Capital Loans Asset</span>
            <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">
              ${metrics.capital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-400 text-[11px] mt-1 block">Active loan portfolio balance</span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 text-xs">
            <span className="text-slate-400 block font-semibold">Investment Asset</span>
            <span className="text-xl font-bold text-purple-400 font-mono mt-1 block">
              ${metrics.investmentFund.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-slate-400 text-[11px] mt-1 block">Long-term growth investment</span>
          </div>
        </div>
      </div>

      {/* Visual Portfolio Allocation & Historical Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Portfolio Share Pie Chart */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-amber-400" />
              Capital Asset Allocation Share
            </h3>
            <p className="text-xs text-slate-400 mb-4">Relative weight of bank cash vs loans vs investments</p>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={portfolioData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {portfolioData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                    formatter={(val: any) => [`$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            {portfolioData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-300 font-semibold">{item.name}</span>
                </div>
                <span className="font-mono font-bold text-white">${item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Historical Audit Table (2014 – 2026) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Historical Yearly Contribution Ledger
          </h3>
          <p className="text-xs text-slate-400 mb-4">Annual dues collection records (2014 to present)</p>

          <div className="overflow-y-auto max-h-72 pr-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/80 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Year</th>
                  <th className="py-2.5 px-3">Annual Contributions</th>
                  <th className="py-2.5 px-3 text-right">Cumulative Sum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {yearlyContributions.map((yc, idx) => {
                  const runningTotal = yearlyContributions.slice(0, idx + 1).reduce((sum, item) => sum + item.total, 0);
                  return (
                    <tr key={yc.year} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-bold text-amber-400">{yc.year}</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">${yc.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-right text-white font-extrabold">${runningTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Projection Simulator Engine */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              Millionaires Club Fund Projection Simulator
            </h3>
            <p className="text-xs text-slate-400">Forecast fund growth based on monthly member additions and dues collection</p>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-0.5">Time Horizon</label>
              <select
                value={simulatedYears}
                onChange={(e) => setSimulatedYears(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white cursor-pointer"
              >
                <option value={1}>1 Year Horizon</option>
                <option value={3}>3 Year Horizon</option>
                <option value={5}>5 Year Horizon</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-0.5">Annual Member Growth (%)</label>
              <input
                type="number"
                value={memberGrowthRate}
                onChange={(e) => setMemberGrowthRate(Number(e.target.value))}
                className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {projectionData.map((p) => (
            <div key={p.year} className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 text-sm">{p.year} Projection</span>
                <span className="text-slate-400">{p.projectedMembers} Members</span>
              </div>
              <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                ${p.projectedFund.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-slate-400 text-[11px]">
                Estimated Annual Dues Inflow: +${p.annualDues.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
