import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  RotateCcw,
  ShieldCheck,
  FileText,
  Clock,
  User,
  DollarSign,
  Building2,
  TrendingUp,
  CreditCard,
  Users,
  CheckCircle2
} from 'lucide-react';
import { useClub } from '../../context/ClubContext';

export const ReportsTab: React.FC = () => {
  const { metrics, members, loans, yearlyContributions, yearlyLoans, resetData, activityLogs } = useClub();

  const [activeReportMode, setActiveReportMode] = useState<'financial_dashboard' | 'receipt'>('financial_dashboard');
  const [selectedReceiptMemberId, setSelectedReceiptMemberId] = useState<string>(members[0]?.id || '');
  const [receiptMonth, setReceiptMonth] = useState<string>('February 2026');
  const [receiptAmount, setReceiptAmount] = useState<number>(20.00);

  const selectedMember = members.find(m => m.id === selectedReceiptMemberId) || members[0];

  // Function to export the complete official report to CSV
  const handleExportCSV = () => {
    let csv = `Millionaires Club Official Financial Report\n`;
    csv += `Generated Date,${new Date().toLocaleDateString('en-US')}\n`;
    csv += `Contact Email,${metrics.contactEmail}\n\n`;
    
    csv += `EXECUTIVE METRICS SUMMARY\n`;
    csv += `Metric,Amount\n`;
    csv += `Total Contributions,"$${(metrics.totalContributions || 0).toFixed(2)}"\n`;
    csv += `Total Bank Balance,"$${(metrics.totalBankBalance || 0).toFixed(2)}"\n`;
    csv += `Total Outstanding Loan Balance,"$${(metrics.totalLoanBalance || 0).toFixed(2)}"\n`;
    csv += `Trust Reserve Fund,"$${(metrics.trustFund || 0).toFixed(2)}"\n`;
    csv += `Capital Reserve,"$${(metrics.capital || 0).toFixed(2)}"\n`;
    csv += `Investment Fund,"$${(metrics.investmentFund || 0).toFixed(2)}"\n\n`;

    csv += `YEARLY CONTRIBUTIONS & LOAN SUMMARY\n`;
    csv += `Year,Total Contributions Collected,Total Loan Disbursed,Outstanding Balance\n`;
    yearlyContributions.forEach((yc, idx) => {
      const loan = yearlyLoans[idx];
      const loanAmt = loan ? loan.totalLoan : 0;
      const loanBal = loan ? loan.balance : 0;
      csv += `${yc.year},"$${(yc.total || 0).toFixed(2)}","$${(loanAmt || 0).toFixed(2)}","$${(loanBal || 0).toFixed(2)}"\n`;
    });

    csv += `\n\nACTIVE LOAN REGISTRY\n`;
    csv += `Loan Number,Borrower Name,Cosigner,Start Date,End Date,Loan Amount,Paid Amount,Remaining Balance,Comments\n`;
    loans.forEach((l) => {
      csv += `${l.loanNumber},"${l.name}","${l.cosignName}",${l.start},${l.end},"$${(l.loanAmount || 0).toFixed(2)}","$${(l.paid || 0).toFixed(2)}","$${(l.balance || 0).toFixed(2)}","${l.comments || ''}"\n`;
    });

    csv += `\n\nMEMBER ROSTER LEDGER\n`;
    csv += `MC Member ID,Name,Other Name,DOR,Monthly Dues Rate,Payment Type,Received By,Comments\n`;
    members.forEach((m) => {
      csv += `${m.id},"${m.name}","${m.otherName || ''}",${m.dor},"$${(m.monthlyAmount || 20).toFixed(2)}",${m.paymentType},"${m.receivedBy || ''}","${m.comments || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Millionaires_Club_Official_Financial_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Control Actions (Hidden when printing) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm dark:shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 p-2 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Official Report Generator & Audit Center
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Generate and print official A4 financial dashboard reports, export CSV ledgers, or create individual member payment receipts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-900/20 cursor-pointer active:scale-95"
            title="Print Current Report for A4 Paper Output"
          >
            <Printer className="w-4 h-4" />
            <span>Print {activeReportMode === 'financial_dashboard' ? 'Financial Report' : 'Payment Receipt'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Are you sure you want to reset all data back to the initial report state?')) {
                resetData();
                alert('System restored to official initial report dataset.');
              }
            }}
            className="bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-rose-500/30 px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Restore Original Data"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Reset System</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs (Hidden when printing) */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 print:hidden">
        <button
          onClick={() => setActiveReportMode('financial_dashboard')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportMode === 'financial_dashboard'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Full A4 Financial Dashboard Statement</span>
        </button>

        <button
          onClick={() => setActiveReportMode('receipt')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeReportMode === 'receipt'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Member Dues Payment Receipt</span>
        </button>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* MODE 1: OFFICIAL A4 FINANCIAL DASHBOARD STATEMENT REPORT                   */}
      {/* -------------------------------------------------------------------------- */}
      {activeReportMode === 'financial_dashboard' && (
        <div
          id="printable-financial-report"
          className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 print:p-0 print:border-none print:shadow-none print:bg-white print:text-black font-sans"
        >
          {/* Letterhead Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm">
                  MC
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  Millionaires Club USA
                </h1>
              </div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mt-1">
                Official Executive Financial Statement & Audit Ledger
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Contact: {metrics.contactEmail} | Board of Directors Treasury
              </p>
            </div>

            <div className="text-left sm:text-right font-mono text-xs space-y-0.5 border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 w-full sm:w-auto">
              <div><strong className="text-slate-600">REPORT NO:</strong> <span className="text-amber-700 font-bold">FIN-REP-{new Date().getFullYear()}-0805</span></div>
              <div><strong className="text-slate-600">DATE ISSUED:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div><strong className="text-slate-600">STATUS:</strong> <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border border-emerald-300">Audited & Verified</span></div>
            </div>
          </div>

          {/* Section 1: Financial Overview Metrics */}
          <div className="space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-amber-600" />
              1. Executive Financial Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Contributions</span>
                <span className="text-base font-extrabold font-mono text-emerald-700">${(metrics.totalContributions || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Bank Balance</span>
                <span className="text-base font-extrabold font-mono text-blue-700">${(metrics.totalBankBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Loan Balance</span>
                <span className="text-base font-extrabold font-mono text-amber-700">${(metrics.totalLoanBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Trust Reserve</span>
                <span className="text-base font-extrabold font-mono text-purple-700">${(metrics.trustFund || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Capital Reserve</span>
                <span className="text-base font-extrabold font-mono text-indigo-700">${(metrics.capital || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Investment Fund</span>
                <span className="text-base font-extrabold font-mono text-cyan-700">${(metrics.investmentFund || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Yearly Contributions & Loan Portfolio Ledger */}
          <div className="space-y-2 break-inside-avoid">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              2. Multi-Year Contribution & Loan Portfolio Analysis (2020 - 2026)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300">Fiscal Year</th>
                    <th className="p-2 border-r border-slate-300 text-right">Total Dues Collected ($)</th>
                    <th className="p-2 border-r border-slate-300 text-right">Loans Disbursed ($)</th>
                    <th className="p-2 text-right">Outstanding Loan Balance ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {yearlyContributions.map((yc, idx) => {
                    const loan = yearlyLoans[idx];
                    return (
                      <tr key={yc.year} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-2 border-r border-slate-300 font-bold font-sans">{yc.year}</td>
                        <td className="p-2 border-r border-slate-300 text-right font-bold text-emerald-800">
                          ${(yc.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-right text-slate-700">
                          ${(loan?.totalLoan || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right font-bold text-amber-800">
                          ${(loan?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Active Loans Registry */}
          <div className="space-y-2 break-inside-avoid">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-purple-600" />
              3. Active Member Loan Accounts & Repayment Ledger
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300">Loan #</th>
                    <th className="p-2 border-r border-slate-300">Borrower Name</th>
                    <th className="p-2 border-r border-slate-300">Cosigner</th>
                    <th className="p-2 border-r border-slate-300">Term (Start - End)</th>
                    <th className="p-2 border-r border-slate-300 text-right">Principal ($)</th>
                    <th className="p-2 border-r border-slate-300 text-right">Paid ($)</th>
                    <th className="p-2 text-right">Balance ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {loans.map((l, idx) => (
                    <tr key={l.loanNumber} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 border-r border-slate-300 font-bold text-amber-800">{l.loanNumber}</td>
                      <td className="p-2 border-r border-slate-300 font-sans font-bold text-slate-900">{l.name}</td>
                      <td className="p-2 border-r border-slate-300 font-sans text-slate-600">{l.cosignName || 'N/A'}</td>
                      <td className="p-2 border-r border-slate-300 text-slate-600 text-[10px]">{l.start} to {l.end}</td>
                      <td className="p-2 border-r border-slate-300 text-right font-bold text-slate-800">${l.loanAmount.toFixed(2)}</td>
                      <td className="p-2 border-r border-slate-300 text-right font-bold text-emerald-800">${l.paid.toFixed(2)}</td>
                      <td className="p-2 text-right font-bold text-amber-800">${l.balance.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Member Roster Overview */}
          <div className="space-y-2 break-inside-avoid">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              4. Official Member Directory & Dues Classification (Total: {members.length} Members)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="p-1.5 border-r border-slate-300">MC ID</th>
                    <th className="p-1.5 border-r border-slate-300">Member Name</th>
                    <th className="p-1.5 border-r border-slate-300">Nickname</th>
                    <th className="p-1.5 border-r border-slate-300">Registration Date</th>
                    <th className="p-1.5 border-r border-slate-300 text-right">Dues Rate ($)</th>
                    <th className="p-1.5 border-r border-slate-300">Payment Type</th>
                    <th className="p-1.5">Collector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {members.map((m, idx) => (
                    <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-1.5 border-r border-slate-300 font-bold text-amber-800">{m.id}</td>
                      <td className="p-1.5 border-r border-slate-300 font-sans font-bold text-slate-900">{m.name}</td>
                      <td className="p-1.5 border-r border-slate-300 font-sans text-slate-600">{m.otherName || '-'}</td>
                      <td className="p-1.5 border-r border-slate-300 text-slate-600">{m.dor}</td>
                      <td className="p-1.5 border-r border-slate-300 text-right font-bold text-slate-800">${(m.monthlyAmount || 20).toFixed(2)}</td>
                      <td className="p-1.5 border-r border-slate-300 font-sans text-slate-700">{m.paymentType}</td>
                      <td className="p-1.5 font-sans text-slate-600">{m.receivedBy || 'Treasurer'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Official Sign-off & Audit Certification Footer */}
          <div className="border-t-2 border-slate-900 pt-6 mt-8 break-inside-avoid space-y-4">
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Report Prepared By:</span>
                  <span className="font-bold text-slate-900">Mangpi</span>
                  <span className="text-slate-500 block text-[10px]">Millionaires Club Executive Board</span>
                </div>
                <div className="border-t border-slate-400 pt-1 w-48">
                  <span className="text-[10px] text-slate-500 font-semibold block">Treasurer Signature</span>
                </div>
              </div>

              <div className="space-y-6 text-right flex flex-col items-end">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Certified & Approved By:</span>
                  <span className="font-bold text-slate-900">Board President & Audit Committee</span>
                  <span className="text-slate-500 block text-[10px]">Millionaires Club USA</span>
                </div>
                <div className="border-t border-slate-400 pt-1 w-48 text-center">
                  <span className="text-[10px] text-slate-500 font-semibold block">Official Board Approval Seal</span>
                </div>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-500 border-t border-slate-200 pt-2 font-mono">
              CONFIDENTIAL - FOR OFFICIAL MILLIONAIRES CLUB BOARD & MEMBER AUDIT USE ONLY - GENERATED VIA MILLIONAIRES CLUB PORTAL
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* MODE 2: PRINTABLE MEMBER DUES PAYMENT RECEIPT                              */}
      {/* -------------------------------------------------------------------------- */}
      {activeReportMode === 'receipt' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Receipt Controls (Hidden when printing) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl space-y-4 print:hidden transition-colors">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Official Member Dues Payment Receipt Creator
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate and customize a branded contribution receipt for member record keeping.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Select Member</label>
                <select
                  value={selectedReceiptMemberId}
                  onChange={(e) => setSelectedReceiptMemberId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.id} - {m.name} ({m.otherName || 'No Nickname'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Payment Month / Period</label>
                  <input
                    type="text"
                    value={receiptMonth}
                    onChange={(e) => setReceiptMonth(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Receipt Amount ($)</label>
                  <input
                    type="number"
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <button
                onClick={handlePrint}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Receipt</span>
              </button>
            </div>
          </div>

          {/* Live Printable Receipt Preview Card */}
          <div
            className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-6 shadow-xl space-y-4 print:p-8 print:border-none print:shadow-none"
            id="printable-receipt"
          >
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">Millionaires Club</h2>
                <p className="text-[11px] text-slate-600 font-semibold">Official Dues & Contribution Payment Receipt</p>
                <p className="text-[10px] text-slate-500">{metrics.contactEmail}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-slate-500">RECEIPT NO.</span>
                <div className="text-sm font-mono font-extrabold text-amber-600">REC-{Date.now().toString().substring(6)}</div>
                <span className="text-[10px] text-slate-500">{new Date().toLocaleDateString('en-US')}</span>
              </div>
            </div>

            {selectedMember && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">MEMBER NAME</span>
                    <span className="font-bold text-slate-900 text-sm">{selectedMember.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] font-bold">MC MEMBER ID</span>
                    <span className="font-bold text-amber-700 font-mono text-sm">{selectedMember.id}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[10px]">PAYMENT PERIOD</span>
                    <span className="font-bold text-slate-800">{receiptMonth}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">PAYMENT METHOD</span>
                    <span className="font-bold text-slate-800">{selectedMember.paymentType}</span>
                  </div>
                </div>

                <div className="border-t border-b border-slate-200 py-3 flex justify-between items-center">
                  <span className="font-bold text-slate-700 uppercase">Total Amount Received</span>
                  <span className="text-2xl font-black font-mono text-emerald-700">${(receiptAmount || 0).toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-end pt-4">
                  <div>
                    <span className="text-[10px] text-slate-500 block">RECEIVING OFFICER</span>
                    <span className="font-bold text-slate-800">{selectedMember.receivedBy || 'Mangpi'}</span>
                  </div>
                  <div className="text-center border-t border-slate-400 w-36 pt-1">
                    <span className="text-[10px] text-slate-500 block font-semibold">Authorized Signature</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* System Audit Logs (Hidden when printing) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-xl print:hidden transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          Complete System Audit Trail
        </h3>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
          {activityLogs.map((log) => (
            <div key={log.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center space-x-2">
                <span className="bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{log.category}</span>
                <span className="text-slate-900 dark:text-white font-medium">{log.details}</span>
              </div>
              <span className="text-slate-500 dark:text-slate-400 text-[10px] whitespace-nowrap">{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

