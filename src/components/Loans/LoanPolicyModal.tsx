import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Globe,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  AlertTriangle,
  Clock,
  Zap,
  Calculator,
  Calendar
} from 'lucide-react';

interface LoanPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoanPolicyModal: React.FC<LoanPolicyModalProps> = ({ isOpen, onClose }) => {
  const [lang, setLang] = useState<'EN' | 'ZOMI'>('EN');

  // Interactive Fee & Repayment Calculator inside Policy Modal
  const [calcAmount, setCalcAmount] = useState<number>(3000);
  const [calcTerm, setCalcTerm] = useState<number>(24); // 12 or 24 months

  if (!isOpen) return null;

  // Calculate fee based on policy rules:
  // Under $2,500 (12-month term): $30.00
  // $2,501 - $5,000 (12-month term): $50.00
  // $2,501 - $5,000 (24-month term): $70.00
  const getPolicyFee = (amount: number, termMonths: number) => {
    if (amount <= 2500) {
      return 30.0;
    } else {
      if (termMonths <= 12) {
        return 50.0;
      } else {
        return 70.0;
      }
    }
  };

  const calculatedFee = getPolicyFee(calcAmount, calcTerm);
  const monthlyPayment = calcAmount > 0 && calcTerm > 0 ? (calcAmount / calcTerm).toFixed(2) : '0.00';
  const requiredContributions = (calcAmount / 4).toFixed(2);

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl relative text-white space-y-6 my-auto">
        
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                MC Loan Policy and Terms
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  Official BOD Rules
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Millionaires Club • Executive Board Rules & Guidelines
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Language Switcher Toggle */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1">
              <button
                onClick={() => setLang('EN')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  lang === 'EN'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLang('ZOMI')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  lang === 'ZOMI'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Zomi
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Fee & Eligibility Calculator Widget */}
        <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-amber-400" />
              Policy Quick Estimator & Fee Calculator
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Max Loan: $5,000 (4x Contributions)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Desired Loan ($)</label>
              <input
                type="number"
                min="100"
                max="5000"
                step="100"
                value={calcAmount}
                onChange={(e) => setCalcAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Repayment Term</label>
              <select
                value={calcTerm}
                onChange={(e) => setCalcTerm(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white font-bold"
              >
                <option value={12}>12 Months</option>
                <option value={24}>24 Months</option>
              </select>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl text-center flex flex-col justify-center">
              <span className="text-[10px] text-slate-400 uppercase">Application Fee</span>
              <span className="text-base font-extrabold text-amber-400 font-mono">${calculatedFee.toFixed(2)}</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl text-center flex flex-col justify-center">
              <span className="text-[10px] text-slate-400 uppercase">Monthly (Due 10th)</span>
              <span className="text-base font-extrabold text-emerald-400 font-mono">${monthlyPayment}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Required Member Contribution (at least 1/4th): <strong className="text-slate-200 font-mono">${requiredContributions}</strong></span>
            <span>Grace Period / Due Date: <strong className="text-slate-200">10th of every month</strong></span>
          </div>
        </div>

        {/* POLICY CONTENT ACCORDION / CARDS */}
        {lang === 'EN' ? (
          <div className="space-y-4 text-xs sm:text-sm text-slate-200">
            
            {/* Section 1 */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>1. Membership and Contribution Requirements</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Eligibility for Loans:</strong> A new member is eligible to borrow funds only after completing six (6) months of active membership.
                </li>
                <li>
                  <strong className="text-white">Monthly Contributions:</strong> The standard monthly contribution for all members is <span className="text-amber-300 font-bold">$20</span>. Members may contribute more than $20 per month if they choose to do so.
                </li>
                <li>
                  <strong className="text-white">Automated Payment Requirement:</strong> To ensure convenience and consistency of fund collection, all members are required to set up automatic payments for their contributions.
                </li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span>2. Loan Eligibility and Limit</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Maximum Borrowing Cap:</strong> Each member may borrow up to a maximum of <span className="text-amber-300 font-bold">$5,000</span>, based on their total contributions (calculated as <strong className="text-emerald-400">four times</strong> the amount contributed).
                </li>
                <li>
                  <strong className="text-white">Cooldown Period:</strong> Borrowers must wait a minimum of <strong className="text-amber-300">three (3) months</strong> after paying off a loan before applying for a new loan.
                </li>
              </ul>
            </div>

            {/* Section 3 */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>3. Loan Application Fees Schedule</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">Loans under $2,500 (12-mo)</span>
                  <span className="text-sm font-extrabold text-amber-400">$30.00 Fee</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">$2,501 - $5,000 (12-mo)</span>
                  <span className="text-sm font-extrabold text-amber-400">$50.00 Fee</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">$2,501 - $5,000 (24-mo)</span>
                  <span className="text-sm font-extrabold text-amber-400">$70.00 Fee</span>
                </div>
              </div>
            </div>

            {/* Section 4 */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>4. Loan Repayment Terms & Late Charge</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Installment Calculation:</strong> The loan principal will be divided equally by the loan period (in months) to determine the fixed monthly payment.
                </li>
                <li>
                  <strong className="text-white">Due Date:</strong> Monthly payments are due on the <strong className="text-emerald-400">10th of each month</strong>.
                </li>
                <li>
                  <strong className="text-white">Late Fee:</strong> A late charge of <span className="text-rose-400 font-bold">$5.00</span> will be charged for payments not made by the due date.
                </li>
              </ul>
            </div>

            {/* Section 5 */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>5. Platform & Development Fee (Online Loan Repayments)</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Rate:</strong> A <span className="text-amber-300 font-bold">1.5%</span> fee is added to loan repayments made online through the club's payment portal (card or ACH bank transfer). It is shown as a separate line item before you confirm payment.
                </li>
                <li>
                  <strong className="text-white">Purpose:</strong> This fee covers third-party payment processing costs and funds the ongoing development, hosting, and maintenance of the club's digital management platform.
                </li>
                <li>
                  <strong className="text-white">Not charged on:</strong> Cash, check, or Zelle loan payments, and not applied to monthly dues payments.
                </li>
              </ul>
            </div>

          </div>
        ) : (
          /* ZOMI VERSION */
          <div className="space-y-4 text-xs sm:text-sm text-slate-200">
            
            {/* Section 1 Zomi */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>1. Kipawlna Sungah Akihelmi Khat i Sumkhol Daan leh Akisamte</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Sum Leitawi Theih Daan:</strong> Kipawlna sungah akihelmi khat in akihel zawh kha guk (6 months) khit ciangin sum leitawi thei pan hi.
                </li>
                <li>
                  <strong className="text-white">Khasim Sumkhol Daan:</strong> Kipawlna sungah akihel khempeuh in khasim in <span className="text-amber-300 font-bold">$20</span> sumkhol ding hi. Khasim sumkhol $20 sangin atamzaw akhol nuamte in amau utzah khol thei hi.
                </li>
                <li>
                  <strong className="text-white">Bank Pan Auto a Sum Dok Ding Kisam:</strong> Ih sum kaihkhopna anopzawdeuh nadingin, kipawlna a kihel khempeuh in bank pan in sum auto in dok ding kisam hi.
                </li>
              </ul>
            </div>

            {/* Section 2 Zomi */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span>2. Sum Leitawi Theih Zah</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Max Sum Leitawi Limit:</strong> Kipawlna sungah akihel khat in sum akholzah dungzui in, <span className="text-amber-300 font-bold">$5,000</span> ciang leitawi thei ding hi. (Sum Kholzah i azahli / 4x leitawi thei hi).
                </li>
                <li>
                  <strong className="text-white">Ngak Ding Hun:</strong> Sum Leitawite in aleitawite a piakkhit ciangin atawmpen <strong className="text-amber-300">kha thum (3 months)</strong> ngak ding a, tua khit ciang athakin leitawi kik thei pan ding hi.
                </li>
              </ul>
            </div>

            {/* Section 3 Zomi */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>3. Sum Leitawi Man (Application Fees)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">$2,500 nuaisiah (Kha 12 sung)</span>
                  <span className="text-sm font-extrabold text-amber-400">$30.00 Fee</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">$2,501 pan $5,000 (Kha 12 sung)</span>
                  <span className="text-sm font-extrabold text-amber-400">$50.00 Fee</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center space-y-1">
                  <span className="text-[10px] text-slate-400 block font-sans">$2,501 pan $5,000 (Kha 24 sung)</span>
                  <span className="text-sm font-extrabold text-amber-400">$70.00 Fee</span>
                </div>
              </div>
            </div>

            {/* Section 4 Zomi */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>4. Sum Leitawite Piakkik Daan</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Khasim Sum Piak Zah:</strong> Sum leitawi zah pen sum leitawi hun (kha) tawh kihawm dinga, tua pen khasim piak ding hi pah hi.
                </li>
                <li>
                  <strong className="text-white">Sum Piak Ni:</strong> Khasim sum piak ni ding pen, kha i <strong className="text-emerald-400">ni 10 ni</strong> ta hi ding hi.
                </li>
                <li>
                  <strong className="text-white">Ziakai Man (Late Fee):</strong> Sum piak hun cingkhin a, sum na piak nai kei leh, na ziakai man <span className="text-rose-400 font-bold">$5.00</span> hong kila ding hi.
                </li>
              </ul>
            </div>

            {/* Section 5 Zomi */}
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>5. Platform & Development Man (Online Sum Leitawi Piakna)</span>
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-300 text-xs sm:text-sm">
                <li>
                  <strong className="text-white">Man Zah:</strong> Kipawlna a online portal tungtawn (card ahihkeileh ACH bank) a sum leitawi piakna tungah <span className="text-amber-300 font-bold">1.5%</span> man kibelap ding hi. Na sum na piak masiah hih man kilangsak khin ding hi.
                </li>
                <li>
                  <strong className="text-white">Bang Dingin?</strong> Hih man in third-party (Stripe) sum kaikhia man leh kipawlna a software/portal khang zawh, enkholh, leh zui nading dingin zang ding hi.
                </li>
                <li>
                  <strong className="text-white">Kigawpna Om Lo:</strong> Cash, check, ahihkeileh Zelle tungtawn a sum leitawi piakna leh khasim sumkhol tungah hih man kigawp kei ding hi.
                </li>
              </ul>
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-500">
          <span>Millionaires Club • Board of Directors</span>
          <span>© 2026 MC-BOD</span>
        </div>

      </div>
    </div>
  );
};
