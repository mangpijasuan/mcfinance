import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Landmark,
  ShieldCheck,
  FileText,
  DollarSign,
  Check,
  Edit3,
  Calendar,
  User,
  MapPin,
  Sparkles,
  Table,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Loan, Member } from '../../types';

interface LoanAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan?: Loan | null;
  members?: Member[];
}

export const LoanAgreementModal: React.FC<LoanAgreementModalProps> = ({
  isOpen,
  onClose,
  loan,
  members = []
}) => {
  if (!isOpen) return null;

  // View state: 'agreement' | 'schedule' | 'both'
  const [activeTab, setActiveTab] = useState<'agreement' | 'schedule' | 'both'>('both');

  // Derive initial values from passed loan or default values
  const [amount, setAmount] = useState<number>(loan?.loanAmount || 5000);
  const [date, setDate] = useState<string>(
    loan ? loan.start : new Date().toLocaleDateString('en-US')
  );
  const [borrowerName, setBorrowerName] = useState<string>(
    loan?.name || ''
  );
  const [borrowerAddress, setBorrowerAddress] = useState<string>(
    '123 Financial Way, Suite 400'
  );
  const [city, setCity] = useState<string>('Indianapolis');
  const [state, setState] = useState<string>('IN');
  const [cosignerName, setCosignerName] = useState<string>(
    loan?.cosignName || ''
  );
  const [lenderName, setLenderName] = useState<string>(
    'Millionaires Club Board of Directors'
  );

  // Installment & Schedule details
  const [loanPeriodMonths, setLoanPeriodMonths] = useState<number>(24);
  const [monthlyInstallment, setMonthlyInstallment] = useState<number>(
    loan ? Math.round(loan.loanAmount / 24) || 200 : 200
  );
  const [startDate, setStartDate] = useState<string>(
    loan?.start || new Date().toLocaleDateString('en-US')
  );
  const [endDate, setEndDate] = useState<string>(
    loan?.end || new Date(Date.now() + 86400000 * 365 * 2).toLocaleDateString('en-US')
  );
  const [lateFee, setLateFee] = useState<number>(5.0);
  const [totalPaid, setTotalPaid] = useState<number>(loan?.paid || 0);

  // Editing toggle
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Synchronize when loan prop changes
  useEffect(() => {
    if (loan) {
      setAmount(loan.loanAmount);
      setDate(loan.start);
      setBorrowerName(loan.name);
      setCosignerName(loan.cosignName);
      setStartDate(loan.start);
      setEndDate(loan.end);
      setMonthlyInstallment(Math.round(loan.loanAmount / 24) || 200);
      setTotalPaid(loan.paid);
    }
  }, [loan]);

  // Recalculate monthly installment when amount or period changes
  useEffect(() => {
    if (loanPeriodMonths > 0) {
      setMonthlyInstallment(Math.round((amount / loanPeriodMonths) * 100) / 100);
    }
  }, [amount, loanPeriodMonths]);

  const handlePrint = () => {
    window.print();
  };

  // Helper to generate the schedule rows
  const generateSchedule = () => {
    const schedule = [];
    const est = loanPeriodMonths > 0 ? amount / loanPeriodMonths : 0;
    let runningPaid = totalPaid;

    let baseDate = new Date(startDate);
    if (isNaN(baseDate.getTime())) {
      baseDate = new Date();
    }

    for (let i = 1; i <= loanPeriodMonths; i++) {
      const pmtDate = new Date(baseDate);
      pmtDate.setMonth(baseDate.getMonth() + (i - 1));

      let actual = 0;
      if (runningPaid >= est) {
        actual = est;
        runningPaid -= est;
      } else if (runningPaid > 0) {
        actual = runningPaid;
        runningPaid = 0;
      }

      const formattedDate = pmtDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });

      schedule.push({
        pmtNo: i,
        date: formattedDate,
        estimated: est,
        actual: actual,
        isFullyPaid: actual >= est - 0.01 && est > 0,
        isPartial: actual > 0 && actual < est - 0.01,
      });
    }
    return schedule;
  };

  const scheduleRows = generateSchedule();
  const currentPaidCount = scheduleRows.filter(r => r.isFullyPaid).length;
  const currentBalance = Math.max(0, amount - totalPaid);

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      
      {/* Container - Handles screen view vs print view */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-4 sm:p-8 shadow-2xl relative text-slate-100 space-y-6 my-auto print:p-0 print:m-0 print:border-none print:shadow-none print:bg-white print:text-slate-900">
        
        {/* Modal Controls Header (Hidden during print) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Official Loan Documents & Payment Ledger
                {loan && (
                  <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    Loan #{loan.loanNumber}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Sleek Official Contract & Amortization Schedule • Millionaires Club Financial Services
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isEditing
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Done Editing' : 'Edit Parameters'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold px-4 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Document</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Hidden during print) */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('both')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'both'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Full Loan Package (Agreement + Schedule)</span>
            </button>

            <button
              onClick={() => setActiveTab('agreement')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'agreement'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Loan Agreement Contract Only</span>
            </button>

            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'schedule'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Payment Schedule & Ledger</span>
            </button>
          </div>
        </div>

        {/* Editing Controls Form Panel (Hidden during print) */}
        {isEditing && (
          <div className="bg-slate-950 border border-amber-500/30 rounded-2xl p-4 space-y-3 text-xs animate-fadeIn print:hidden">
            <div className="text-amber-400 font-bold flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Sparkles className="w-4 h-4" />
              <span>Customize Agreement Parameters & Payment Schedule</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Principal Loan Amount ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Total Paid To Date ($)</label>
                <input
                  type="number"
                  value={totalPaid}
                  onChange={(e) => setTotalPaid(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-emerald-400 font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Contract Date</label>
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Borrower Name</label>
                <input
                  type="text"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Cosigner / Guarantor Name</label>
                <input
                  type="text"
                  value={cosignerName}
                  onChange={(e) => setCosignerName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-amber-300 font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Loan Term (Months)</label>
                <input
                  type="number"
                  value={loanPeriodMonths}
                  onChange={(e) => setLoanPeriodMonths(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Mailing Address</label>
                <input
                  type="text"
                  value={borrowerAddress}
                  onChange={(e) => setBorrowerAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------------------------ */}
        {/* DOCUMENT 1: OFFICIAL LOAN AGREEMENT CONTRACT                                               */}
        {/* ------------------------------------------------------------------------------------------ */}
        {(activeTab === 'agreement' || activeTab === 'both') && (
          <div
            id="printable-loan-agreement"
            className="bg-white text-slate-900 p-6 sm:p-10 rounded-2xl shadow-inner font-serif space-y-6 print:shadow-none print:p-0 print:bg-transparent page-break-after"
          >
            {/* HEADER LOGO & BRANDING */}
            <div className="flex flex-col items-center justify-center text-center space-y-1.5 border-b-2 border-slate-900 pb-5">
              <div className="flex items-center justify-center gap-3">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-xl shadow-md shrink-0 border border-slate-800">
                  MC
                </div>
                
                <div className="text-left">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-sans uppercase leading-none">
                    Millionaires Club
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] sm:text-xs font-black text-amber-700 tracking-[0.25em] font-sans uppercase border-t-2 border-amber-600 pt-0.5 block w-full">
                      FINANCIAL SERVICES
                    </span>
                  </div>
                </div>
              </div>

              <a
                href="mailto:info.millionairesclubusa@gmail.com"
                className="text-xs font-mono font-medium text-blue-700 hover:underline pt-1 block"
              >
                info.millionairesclubusa@gmail.com
              </a>
            </div>

            {/* DOCUMENT TITLE */}
            <div className="text-center pt-1">
              <h2 className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 uppercase font-sans border-b border-slate-300 pb-1 inline-block px-6">
                LOAN AGREEMENT
              </h2>
            </div>

            {/* TOP AMOUNT & DATE BAR */}
            <div className="grid grid-cols-2 gap-4 font-sans text-sm font-bold bg-slate-50 p-3.5 rounded-xl border border-slate-300">
              <div className="flex items-center space-x-2">
                <span className="text-slate-600 font-serif">Principal Loan Amount:</span>
                <span className="text-base font-extrabold text-slate-900 font-mono underline decoration-amber-500 decoration-2">
                  ${amount ? amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '____________________'}
                </span>
              </div>
              <div className="flex items-center justify-end space-x-2">
                <span className="text-slate-600 font-serif">Date:</span>
                <span className="text-sm font-extrabold text-slate-900 font-mono underline">
                  {date || '_____________________'}
                </span>
              </div>
            </div>

            {/* INTRODUCTORY AGREEMENT CLAUSE */}
            <div className="text-sm sm:text-base leading-relaxed text-slate-800 text-justify font-serif space-y-2">
              <p>
                For above value received by{' '}
                <strong className="underline font-sans text-slate-900 px-1">
                  {borrowerName || '_______________________________________________'}
                </strong>{' '}
                with a mailing address of{' '}
                <strong className="underline font-sans text-slate-900 px-1">
                  {borrowerAddress || '____________________________________________________________'}
                </strong>
                , City of{' '}
                <strong className="underline font-sans text-slate-900 px-1">
                  {city || '_____________________'}
                </strong>
                , State of{' '}
                <strong className="underline font-sans text-slate-900 px-1">
                  {state || '______________'}
                </strong>
                , agrees to pay <strong className="font-bold font-sans text-slate-900">Millionaires Club</strong> with <span className="font-extrabold underline">no interest</span>.
              </p>
            </div>

            {/* TERM OF REPAYMENT SECTION */}
            <div className="space-y-3 font-sans pt-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider border-b-2 border-slate-800 pb-1 font-sans">
                TERM OF REPAYMENT
              </h3>

              <div className="space-y-3 text-xs sm:text-sm text-slate-800 pl-2">
                {/* Clause A */}
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                    A. Payment:
                  </p>
                  <p className="font-serif leading-relaxed text-slate-800 pl-4">
                    The unpaid principal shall be payable in fixed monthly installments of{' '}
                    <strong className="font-sans font-extrabold underline text-slate-900">
                      ${monthlyInstallment ? monthlyInstallment.toFixed(2) : '________'}
                    </strong>
                    , beginning on{' '}
                    <strong className="font-sans font-bold underline text-slate-900">
                      {startDate || '_______/_______/_______'}
                    </strong>{' '}
                    and ending on{' '}
                    <strong className="font-sans font-bold underline text-slate-900">
                      {endDate || '________/________/________'}
                    </strong>
                    , at this time the remaining unpaid balance shall be due in full.
                  </p>
                </div>

                {/* Clause B */}
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                    B. Late Fee:
                  </p>
                  <p className="font-serif leading-relaxed text-slate-800 pl-4">
                    The borrower agrees to pay a late charge of{' '}
                    <strong className="font-sans font-extrabold underline text-slate-900">
                      ${lateFee ? lateFee.toFixed(2) : '5.00'}
                    </strong>{' '}
                    for each installment that remains unpaid more than 15 days after its Due Date.
                  </p>
                </div>

                {/* Clause C */}
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                    C. Prepayment:
                  </p>
                  <p className="font-serif leading-relaxed text-slate-800 pl-4">
                    The borrower has the right to pay back the loan in full or make additional payments at any time with no penalty.
                  </p>
                </div>

                {/* Clause D */}
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                    D. Platform & Development Fee:
                  </p>
                  <p className="font-serif leading-relaxed text-slate-800 pl-4">
                    For installments paid online through the club's payment portal (card or ACH bank transfer), the borrower agrees to pay an additional fee of{' '}
                    <strong className="font-sans font-extrabold underline text-slate-900">1.5%</strong>{' '}
                    of the payment amount, shown as a separate line item before payment is confirmed. This fee covers third-party payment processing costs and funds the ongoing development, hosting, and maintenance of the club's digital management platform. It does not apply to payments made by cash, check, or Zelle.
                  </p>
                </div>
              </div>
            </div>

            {/* SIGNATURE BLOCKS */}
            <div className="pt-6 font-sans">
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                
                {/* Row 1: Lender */}
                <div className="space-y-1">
                  <div className="border-b-2 border-slate-900 min-h-[32px] flex items-end pb-1 font-bold text-slate-900 text-xs sm:text-sm">
                    {lenderName}
                  </div>
                  <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Lender's Name
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="border-b-2 border-slate-900 min-h-[32px] flex items-end pb-1 italic text-slate-400 text-xs">
                    (Authorized Representative Signature)
                  </div>
                  <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Lender's Signature
                  </p>
                </div>

                {/* Row 2: Borrower */}
                <div className="space-y-1">
                  <div className="border-b-2 border-slate-900 min-h-[32px] flex items-end pb-1 font-bold text-slate-900 text-xs sm:text-sm">
                    {borrowerName || '_______________________________________'}
                  </div>
                  <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Borrower's Name
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="border-b-2 border-slate-900 min-h-[32px] flex items-end pb-1 italic text-slate-400 text-xs">
                    (Signature of Borrower)
                  </div>
                  <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Borrower's Signature
                  </p>
                </div>

                {/* Row 3: Cosigner */}
                <div className="space-y-1">
                  <div className="border-b-2 border-slate-900 min-h-[32px] flex items-end pb-1 font-bold text-slate-900 text-xs sm:text-sm bg-yellow-100/50 px-1">
                    {cosignerName || '_______________________________________'}
                  </div>
                  <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                    Cosigner's Name<sup className="text-amber-600 font-black">1</sup>
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="border-b-2 border-slate-900 min-h-[32px] flex items-end pb-1 italic text-slate-400 text-xs">
                    (Signature of Cosigner / Guarantor)
                  </div>
                  <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                    Cosigner's Signature
                  </p>
                </div>

              </div>
            </div>

            {/* FOOTNOTE & FOOTER */}
            <div className="pt-4 border-t border-slate-300 font-sans text-[11px] text-slate-600 space-y-2">
              <p className="bg-amber-50 p-2 rounded-lg border border-amber-200 text-slate-800 leading-snug">
                <sup className="text-amber-700 font-extrabold">1</sup> A person who signs a loan application agreeing to guarantee payment if the signer is unable to repay the loan.
              </p>

              <div className="flex items-center justify-between text-slate-500 text-[10px] pt-1">
                <span>Millionaires Club Financial Services • Official Loan Instrument</span>
                <span className="font-mono font-bold">©2026 MC-BOD</span>
              </div>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------------------------------ */}
        {/* DOCUMENT 2: SLEEK LOAN PAYMENT SCHEDULE & LEDGER TABLE                                      */}
        {/* ------------------------------------------------------------------------------------------ */}
        {(activeTab === 'schedule' || activeTab === 'both') && (
          <div
            id="printable-loan-schedule"
            className="bg-white text-slate-900 p-6 sm:p-10 rounded-2xl shadow-inner font-sans space-y-5 print:shadow-none print:p-0 print:bg-transparent"
          >
            {/* SLEEK HEADER BANNER */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b-4 border-amber-500">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <Table className="w-6 h-6 text-amber-400" />
                  Loan Payment Schedule
                </h2>
                <p className="text-xs text-amber-300/90 font-mono mt-0.5">
                  Official Amortization Ledger & Tracking Schedule
                </p>
              </div>

              <div className="text-left sm:text-right font-sans">
                <h3 className="text-lg font-black text-amber-400 uppercase tracking-wide">
                  Millionaires Club
                </h3>
                <span className="text-[10px] font-extrabold tracking-[0.2em] text-slate-300 uppercase block">
                  FINANCIAL SERVICES
                </span>
                <a href="mailto:info.millionairesclubusa@gmail.com" className="text-[11px] font-mono text-slate-400 hover:underline">
                  info.millionairesclubusa@gmail.com
                </a>
              </div>
            </div>

            {/* THREE METRIC GRIDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              
              {/* Box 1: Borrower Info */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 font-black uppercase tracking-wider text-slate-800 border-b border-slate-300 flex items-center justify-between">
                  <span>Borrower's Information</span>
                  <User className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-bold">Borrower:</span>
                    <span className="font-extrabold text-slate-900">{borrowerName || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Cosigner:</span>
                    <span className="font-extrabold text-amber-800">{cosignerName || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Box 2: Loan Information */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 font-black uppercase tracking-wider text-slate-800 border-b border-slate-300 flex items-center justify-between">
                  <span>Loan Information</span>
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-bold">Loan Period:</span>
                    <span className="font-extrabold font-mono text-slate-900">{loanPeriodMonths} Months</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-bold">Loan Issue Date:</span>
                    <span className="font-extrabold font-mono text-slate-900">{startDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Loan Amount:</span>
                    <span className="font-extrabold font-mono text-slate-900">${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Box 3: Summary To Date */}
              <div className="border border-slate-300 rounded-xl overflow-hidden bg-slate-50/50">
                <div className="bg-slate-200 px-3 py-1.5 font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 flex items-center justify-between">
                  <span>Summary To Date</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-600 font-bold">Total Payment:</span>
                    <span className="font-extrabold font-mono text-emerald-700">${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-1">
                    <span className="text-slate-600 font-bold">Principle Balance:</span>
                    <span className="font-extrabold font-mono text-amber-800">${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-bold">Payment Number:</span>
                    <span className="font-extrabold font-mono text-slate-900">{currentPaidCount} of {loanPeriodMonths}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* PAYMENT SCHEDULE TABLE */}
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
                Payment Schedules
              </h3>

              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[11px] border-b border-slate-800">
                      <th className="py-2.5 px-3 border-r border-slate-800 w-32">Payment Number</th>
                      <th className="py-2.5 px-3 border-r border-slate-800">Date</th>
                      <th className="py-2.5 px-3 border-r border-slate-800 text-right">Estimated Payment</th>
                      <th className="py-2.5 px-3 text-right">Actual Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono">
                    {scheduleRows.map((row) => (
                      <tr
                        key={row.pmtNo}
                        className={`transition-colors ${
                          row.isFullyPaid
                            ? 'bg-emerald-50/70 font-semibold'
                            : row.isPartial
                            ? 'bg-amber-50/70 font-semibold'
                            : row.pmtNo % 2 === 0
                            ? 'bg-slate-50'
                            : 'bg-white'
                        }`}
                      >
                        <td className="py-2 px-3 border-r border-slate-200 font-bold font-sans text-slate-800">
                          Pmt # {row.pmtNo}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 text-slate-700">
                          {row.date}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 text-right font-bold text-slate-800">
                          ${row.estimated.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold">
                          {row.isFullyPaid ? (
                            <span className="text-emerald-700 inline-flex items-center justify-end gap-1">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ${row.actual.toFixed(2)}
                            </span>
                          ) : row.isPartial ? (
                            <span className="text-amber-700">
                              ${row.actual.toFixed(2)} (Partial)
                            </span>
                          ) : (
                            <span className="text-slate-300">
                              $0.00
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* LEDGER FOOTER */}
            <div className="pt-3 border-t border-slate-300 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>Millionaires Club Financial Services • Loan Payment Ledger</span>
              <span>Audited Ledger • Printable A4 Format</span>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
