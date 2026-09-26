import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClub } from '../../context/ClubContext';
import { PaymentType, Loan } from '../../types';
import { EditLoanModal } from '../Loans/EditLoanModal';
import { checkPersonLoanEligibility } from '../../utils/loanEligibility';
import { getDuesStatus } from '../../utils/duesStatus';
import {
  UserCheck,
  ShieldCheck,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Mail,
  Send,
  Building,
  CreditCard,
  PhoneCall,
  User,
  Info,
  History,
  Receipt,
  Download,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Tag,
  Lock,
  X,
  Loader2,
  ExternalLink,
  Zap,
  DollarSign as DollarIcon,
  Edit,
  Save,
  Edit3,
  Plus
} from 'lucide-react';

type SectionTab = 'contributions' | 'loans' | 'profile' | 'notify';

export const MemberPortalTab: React.FC = () => {
  const { user, openLoginModal, loginAsMember } = useAuth();
  const { members, loans, recordContribution, recordLoanPayment, updateMember, togglePaymentMonth } = useClub();

  const [activeSubTab, setActiveSubTab] = useState<SectionTab>('contributions');
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedLoanYear, setSelectedLoanYear] = useState<number>(2026);
  const [adminSelectedMemberId, setAdminSelectedMemberId] = useState<string>('');

  // Admin Loan Edit Modal State
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [isEditLoanModalOpen, setIsEditLoanModalOpen] = useState(false);

  const handleOpenEditLoan = (loan: Loan) => {
    setEditingLoan(loan);
    setIsEditLoanModalOpen(true);
  };

  const [notificationSent, setNotificationSent] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');

  // Admin Edit Modal & Form State
  const [adminEditModalOpen, setAdminEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    name: string;
    otherName: string;
    dor: string;
    monthlyAmount: number;
    paymentType: PaymentType;
    receivedBy: string;
    status: 'active' | 'inactive' | 'overdue';
    phone: string;
    email: string;
    comments: string;
  }>({
    name: '',
    otherName: '',
    dor: '',
    monthlyAmount: 20,
    paymentType: 'Auto-pay',
    receivedBy: '',
    status: 'active',
    phone: '',
    email: '',
    comments: ''
  });

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  // Stripe Payment State & Handlers
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{
    type: 'dues' | 'loan';
    memberId: string;
    memberName: string;
    monthKey?: string;
    monthName?: string;
    year?: number;
    loanNumber?: number;
    amount: number;
    description?: string;
  } | null>(null);

  const [isProcessingStripe, setIsProcessingStripe] = useState(false);
  const [stripeConfig, setStripeConfig] = useState<{ configured: boolean; publishableKey: string | null } | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<{ txnId: string; amount: number; description: string; platformFeeAmount?: number } | null>(null);

  // Payment Method Selection & Details State
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'ach' | 'card' | 'apple_pay' | 'zelle'>('ach');
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');

  // ACH Bank Details State
  const [achBankName, setAchBankName] = useState('Chase Bank');
  const [achRoutingNumber, setAchRoutingNumber] = useState('122000218');
  const [achAccountNumber, setAchAccountNumber] = useState('•••• •••• 9821');

  // Zelle Details State
  const [zelleSenderName, setZelleSenderName] = useState('');
  const [zelleConfirmationCode, setZelleConfirmationCode] = useState('');

  // Check Stripe config on load
  React.useEffect(() => {
    fetch('/api/stripe/config')
      .then(r => r.json())
      .then(data => setStripeConfig(data))
      .catch(() => setStripeConfig({ configured: false, publishableKey: null }));
  }, []);

  // Verify & record real Stripe payments after redirect back from Checkout.
  // The URL's query params are client-controlled and untrustworthy on their own - this asks
  // the server (which asks Stripe directly) whether the session actually completed before
  // anything gets recorded, so a member can't fake a "payment=success" URL for free credit.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const paymentParam = params.get('payment');
    if (!sessionId || paymentParam !== 'success') return;

    // Mark this session as claimed synchronously, before the async fetch even starts, so two
    // near-simultaneous effect firings (e.g. React StrictMode's dev double-invoke) can't both
    // slip past the check and each record the same payment.
    const PROCESSED_KEY = 'millionaires_club_processed_sessions';
    const processed: string[] = JSON.parse(localStorage.getItem(PROCESSED_KEY) || '[]');
    if (processed.includes(sessionId)) {
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    localStorage.setItem(PROCESSED_KEY, JSON.stringify([...processed, sessionId]));

    fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.verified) return;

        const note = `Stripe Checkout Settlement (Session #${sessionId.slice(-12)})`;
        if (data.isLoanPayment && data.loanNumber) {
          recordLoanPayment(data.loanNumber, data.baseAmount, note, data.platformFeeAmount);
        } else if (data.monthKey) {
          recordContribution(data.memberId, data.monthKey, data.baseAmount, 'Online', note);
        }

        setPaymentTarget({
          type: data.isLoanPayment ? 'loan' : 'dues',
          memberId: data.memberId,
          memberName: data.memberName,
          loanNumber: data.loanNumber,
          monthKey: data.monthKey,
          monthName: data.monthName,
          amount: data.baseAmount,
          description: data.isLoanPayment
            ? `Millionaires Club Loan Repayment #${data.loanNumber}`
            : `Millionaires Club Dues (${data.monthName} ${data.year})`
        });
        setPaymentSuccess({
          txnId: sessionId.slice(-12).toUpperCase(),
          amount: data.baseAmount,
          description: data.isLoanPayment ? `Loan Repayment #${data.loanNumber}` : `Dues (${data.monthName} ${data.year})`,
          platformFeeAmount: data.platformFeeAmount
        });
        setStripeModalOpen(true);
      })
      .catch(err => console.error('Stripe session verification failed:', err))
      .finally(() => {
        window.history.replaceState({}, '', window.location.pathname);
      });
  }, []);

  const handleOpenStripeDues = (monthName: string, monthKey: string, amount: number) => {
    if (!currentMember) return;
    setPaymentTarget({
      type: 'dues',
      memberId: currentMember.id,
      memberName: currentMember.name,
      monthKey,
      monthName,
      year: selectedYear,
      amount,
      description: `Millionaires Club Dues (${monthName} ${selectedYear})`
    });
    setStripeError(null);
    setPaymentSuccess(null);
    setStripeModalOpen(true);
  };

  const handleOpenStripeLoan = (loanNumber: number, borrowerName: string, defaultAmount: number) => {
    if (!currentMember) return;
    setPaymentTarget({
      type: 'loan',
      memberId: currentMember.id,
      memberName: borrowerName,
      loanNumber,
      amount: defaultAmount,
      description: `Millionaires Club Loan Repayment #${loanNumber}`
    });
    setStripeError(null);
    setPaymentSuccess(null);
    setStripeModalOpen(true);
  };

  const handleExecuteStripePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget || !currentMember) return;

    setIsProcessingStripe(true);
    setStripeError(null);

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: paymentTarget.memberId,
          memberName: paymentTarget.memberName,
          amount: paymentTarget.amount,
          monthName: paymentTarget.monthName,
          monthKey: paymentTarget.monthKey,
          year: paymentTarget.year,
          description: paymentTarget.description,
          isLoanPayment: paymentTarget.type === 'loan',
          loanNumber: paymentTarget.loanNumber
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize Stripe payment session');
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // Demo Mode or Simulated Payment
      const txnId = 'STR-' + Math.random().toString(36).substring(2, 9).toUpperCase();

      let methodLabel: PaymentType = 'Online';
      let methodNote = `Stripe Card Settlement (Txn Ref #${txnId})`;

      if (selectedPaymentMethod === 'apple_pay') {
        methodLabel = 'Online';
        methodNote = `Stripe Apple Pay Express (Txn Ref #${txnId})`;
      } else if (selectedPaymentMethod === 'ach') {
        methodLabel = 'Online';
        methodNote = `Stripe ACH Bank Debit (${achBankName}) (Txn Ref #${txnId})`;
      } else if (selectedPaymentMethod === 'zelle') {
        methodLabel = 'Zelle';
        const sender = zelleSenderName.trim() || currentMember?.name || 'Member';
        const code = zelleConfirmationCode.trim() || txnId;
        methodNote = `Zelle Express Transfer (${sender}) (Ref #${code})`;
      } else {
        methodLabel = 'Online';
        methodNote = `Stripe Card Settlement (Txn Ref #${txnId})`;
      }

      const platformFeeAmount = paymentTarget.type === 'loan'
        ? (data.paymentDetails?.platformFeeAmount ?? paymentTarget.amount * 0.015)
        : 0;

      if (paymentTarget.type === 'dues' && paymentTarget.monthKey) {
        recordContribution(
          paymentTarget.memberId,
          paymentTarget.monthKey,
          paymentTarget.amount,
          methodLabel,
          methodNote
        );
      } else if (paymentTarget.type === 'loan' && paymentTarget.loanNumber) {
        recordLoanPayment(
          paymentTarget.loanNumber,
          paymentTarget.amount,
          methodNote,
          platformFeeAmount
        );
      }

      setPaymentSuccess({
        txnId,
        amount: paymentTarget.amount,
        description: paymentTarget.description || 'Settlement completed',
        platformFeeAmount
      });

    } catch (err: any) {
      console.error('Stripe Payment Error:', err);
      setStripeError(err.message || 'Payment processing failed');
    } finally {
      setIsProcessingStripe(false);
    }
  };

  // Platform & Development Fee (1.5%) applies only to loan repayments, per the Loan Agreement's fee disclosure.
  const loanPaymentFee = paymentTarget?.type === 'loan' ? paymentTarget.amount * 0.015 : 0;
  const totalChargeAmount = (paymentTarget?.amount || 0) + loanPaymentFee;

  // Find target member record (Strictly the logged-in member for 'member' role)
  const currentMember = useMemo(() => {
    if (user?.role === 'member' && user.memberId) {
      return members.find((m) => m.id === user.memberId);
    }
    if (user?.role === 'admin') {
      if (adminSelectedMemberId) {
        return members.find((m) => m.id === adminSelectedMemberId) || members[0];
      }
      return members[0];
    }
    return undefined;
  }, [user, members, adminSelectedMemberId]);

  const handleOpenAdminEdit = () => {
    if (!currentMember) return;
    setEditFormData({
      name: currentMember.name,
      otherName: currentMember.otherName || '',
      dor: currentMember.dor || '01/01/2017',
      monthlyAmount: currentMember.monthlyAmount || 20,
      paymentType: currentMember.paymentType || 'Auto-pay',
      receivedBy: currentMember.receivedBy || 'Mangpi',
      status: currentMember.status || 'active',
      phone: currentMember.phone || '',
      email: currentMember.email || '',
      comments: currentMember.comments || ''
    });
    setAdminEditModalOpen(true);
  };

  const handleSaveAdminEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMember) return;
    updateMember(currentMember.id, editFormData);
    setAdminEditModalOpen(false);
  };

  const handleSaveNotes = () => {
    if (!currentMember) return;
    updateMember(currentMember.id, { comments: notesText });
    setIsEditingNotes(false);
  };
  
  // Find loans where current member is Borrower or Cosigner
  const memberLoansAsBorrower = currentMember ? loans.filter((l) =>
    l.name.toLowerCase().trim() === currentMember.name.toLowerCase().trim() ||
    (currentMember.otherName && l.name.toLowerCase().includes(currentMember.otherName.toLowerCase())) ||
    l.name.toLowerCase().includes(currentMember.name.toLowerCase())
  ) : [];

  const memberLoansAsCosigner = currentMember ? loans.filter((l) =>
    l.cosignName.toLowerCase().trim() === currentMember.name.toLowerCase().trim() ||
    (currentMember.otherName && l.cosignName.toLowerCase().includes(currentMember.otherName.toLowerCase())) ||
    l.cosignName.toLowerCase().includes(currentMember.name.toLowerCase())
  ) : [];

  const allMemberLoans = [...memberLoansAsBorrower, ...memberLoansAsCosigner];

  // Derive registration year from DOR (MM/DD/YYYY)
  const dorYear = (() => {
    if (!currentMember?.dor) return 2017;
    const parts = currentMember.dor.split('/');
    if (parts.length === 3) {
      const y = parseInt(parts[2], 10);
      if (!isNaN(y) && y > 2000) return y;
    }
    return 2017;
  })();

  // Determine max fiscal year dynamically (e.g., current calendar year or at least 2026)
  const currentMaxYear = useMemo(() => Math.max(new Date().getFullYear(), 2026), []);

  // Generate available years dynamically based on Member Since (dorYear) up to currentMaxYear
  const availableYears = useMemo(() => {
    const startYear = Math.min(dorYear, currentMaxYear);
    const years: number[] = [];
    for (let y = currentMaxYear; y >= startYear; y--) {
      years.push(y);
    }
    return years;
  }, [dorYear, currentMaxYear]);

  // Helper to get status for a month - delegates to the shared getDuesStatus so the
  // member portal always agrees with the admin views on what counts as paid.
  const getMonthStatus = (year: number, monthIndex: number) => {
    if (!currentMember) return 'n/a';
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return getDuesStatus(currentMember, monthKey);
  };

  // Generate 12 months for selected contribution year
  const monthsListData = useMemo(() => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const monthlyAmt = currentMember?.monthlyAmount || 60;

    return monthNames.map((name, idx) => {
      const status = getMonthStatus(selectedYear, idx);
      const isPaid = status === 'paid' || status === 'advance';
      const isOverdue = status === 'overdue';
      const isNA = status === 'n/a';

      return {
        monthIndex: idx,
        name,
        shortName: name.slice(0, 3),
        key: `${selectedYear}-${String(idx + 1).padStart(2, '0')}`,
        amount: isNA ? 0 : monthlyAmt,
        status,
        isPaid,
        isOverdue,
        isNA
      };
    });
  }, [selectedYear, currentMember, dorYear]);

  // Contribution Metrics for selected year
  const yearPaidCount = monthsListData.filter((m) => m.isPaid).length;
  const yearPaidTotal = yearPaidCount * (currentMember?.monthlyAmount || 60);
  const yearUnpaidCount = monthsListData.filter((m) => !m.isPaid && !m.isNA).length;
  const yearUnpaidTotal = yearUnpaidCount * (currentMember?.monthlyAmount || 60);

  // Lifetime Contribution Calculations based on Member Since (dorYear)
  const lifetimeMetrics = useMemo(() => {
    if (!currentMember) {
      return { paidTotal: 0, unpaidTotal: 0, expectedTotal: 0, monthsActive: 0, paidMonths: 0 };
    }
    const monthlyAmt = currentMember.monthlyAmount || 60;
    let paidMonths = 0;
    let unpaidMonths = 0;
    let totalMonths = 0;

    for (let yr = dorYear; yr <= currentMaxYear; yr++) {
      for (let m = 0; m < 12; m++) {
        const st = getMonthStatus(yr, m);
        if (st === 'paid' || st === 'advance') {
          paidMonths++;
          totalMonths++;
        } else if (st === 'unpaid' || st === 'overdue') {
          unpaidMonths++;
          totalMonths++;
        }
      }
    }

    return {
      paidTotal: paidMonths * monthlyAmt,
      unpaidTotal: unpaidMonths * monthlyAmt,
      expectedTotal: totalMonths * monthlyAmt,
      monthsActive: totalMonths,
      paidMonths,
      unpaidMonths
    };
  }, [currentMember, dorYear]);

  // Handle submit payment receipt note
  const handleSendPaymentNotice = (e: React.FormEvent) => {
    e.preventDefault();
    setNotificationSent(true);
    setTimeout(() => {
      setNotificationSent(false);
      setPaymentNote('');
    }, 4000);
  };

  // Render Access Required view if not logged in or member record not found
  if (!user || (!currentMember && user.role === 'member')) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center max-w-xl mx-auto my-12 space-y-4 shadow-2xl">
        <UserCheck className="w-12 h-12 text-amber-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Member Portal Access Required</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Please log in with your assigned Millionaires Club Member ID (e.g. MC-10017) to view your private dues ledger, loan balances, and payment statements.
        </p>
        <button
          onClick={openLoginModal}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          Open Member Portal Login
        </button>
      </div>
    );
  }

  if (!currentMember) return null;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Board Admin Inspection Selector & Quick Member Login Bar */}
      {user?.role === 'admin' && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4 flex flex-col lg:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Board Admin View — Inspecting member or switch to direct member login:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <select
              value={currentMember.id}
              onChange={(e) => setAdminSelectedMemberId(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-amber-200 text-xs font-bold rounded-xl px-3.5 py-2 focus:outline-none focus:border-amber-500 cursor-pointer flex-1 sm:w-60"
            >
              <optgroup label="Active Members">
                {members.filter(m => m.status !== 'inactive').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} - {m.name} ({m.otherName || 'No alias'})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Inactive Members">
                {members.filter(m => m.status === 'inactive').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} - {m.name} [INACTIVE]
                  </option>
                ))}
              </optgroup>
            </select>

            <button
              onClick={() => loginAsMember(currentMember.id, currentMember.name)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-900/30 cursor-pointer whitespace-nowrap active:scale-95"
              title={`Log in as Member: ${currentMember.name}`}
            >
              <UserCheck className="w-3.5 h-3.5 text-blue-200" />
              <span>Login as {currentMember.name.split(' ')[0]}</span>
            </button>

            <button
              onClick={handleOpenAdminEdit}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer whitespace-nowrap"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit Member</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Welcome Banner & Member Identification */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 border border-slate-200 dark:border-amber-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-8 relative overflow-hidden shadow-sm dark:shadow-2xl transition-colors">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 relative z-10">
          
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 border ${
                user?.role === 'member'
                  ? 'bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/30 dark:border-blue-500/40 text-blue-700 dark:text-blue-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
              }`}>
                <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
                {user?.role === 'member' ? 'Member Portal Logged In' : 'Member Personal Account'}
              </span>
              <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[10px] sm:text-[11px] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-mono font-bold border border-slate-300 dark:border-slate-700">
                {currentMember.id}
              </span>
              <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
                currentMember.status === 'active'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : currentMember.status === 'inactive'
                  ? 'bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                  : 'bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400'
              }`}>
                {currentMember.status} MEMBER
              </span>
              {user?.role === 'admin' && (
                <span className="bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/40 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Admin Inspection Mode
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-amber-100 tracking-tight leading-tight">
              {currentMember.name}
              {currentMember.otherName && (
                <span className="text-slate-500 dark:text-slate-400 text-sm sm:text-lg font-normal ml-1.5 sm:ml-2 block sm:inline">
                  ({currentMember.otherName})
                </span>
              )}
            </h1>

            <div className="flex items-center gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 flex-wrap pt-0.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                Member Since: <strong className="text-amber-700 dark:text-amber-200 ml-0.5">{currentMember.dor}</strong>
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                Dues Rate: <strong className="text-emerald-700 dark:text-emerald-300 ml-0.5">${(currentMember?.monthlyAmount || 20).toFixed(2)}/mo</strong>
              </span>
              <span className="flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                Payment: <strong className="text-purple-700 dark:text-purple-300 ml-0.5">{currentMember.paymentType}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap pt-2 sm:pt-0">
            {user?.role === 'admin' && (
              <button
                onClick={handleOpenAdminEdit}
                className="flex-1 sm:flex-initial bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-black transition-all shadow-md shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Edit Profile & Notes</span>
              </button>
            )}

            <button
              onClick={() => openLoginModal('member')}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border border-blue-500/30 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-900/30 cursor-pointer active:scale-95"
            >
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-200" />
              <span>{user?.role === 'member' ? 'Switch Member Account' : 'Member Portal Login'}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex-1 sm:flex-initial bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
              <span>Print Ledger</span>
            </button>
          </div>

        </div>
      </div>

      {/* Primary Portal Navigation Sub-Tabs */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 border-b border-slate-800 pb-2.5 overflow-x-auto no-scrollbar touch-pan-x px-0.5">
        <button
          onClick={() => setActiveSubTab('contributions')}
          className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'contributions'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Contributions Ledger</span>
        </button>

        <button
          onClick={() => setActiveSubTab('loans')}
          className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'loans'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Loan Contracts</span>
          {allMemberLoans.length > 0 && (
            <span className="ml-1 bg-slate-950/20 text-slate-950 px-1.5 py-0.5 rounded-md text-[10px] font-mono">
              {allMemberLoans.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('profile')}
          className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'profile'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Member Profile</span>
        </button>

        <button
          onClick={() => setActiveSubTab('notify')}
          className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'notify'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
          }`}
        >
          <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Notify Treasurer</span>
        </button>
      </div>

      {/* SECTION 1: MONTH-BY-MONTH & YEAR-BY-YEAR CONTRIBUTIONS LEDGER */}
      {activeSubTab === 'contributions' && (
        <div className="space-y-4 sm:space-y-6">
          
          {/* Summary Metric Cards for Selected Year & Lifetime Member Since */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>{selectedYear} Paid Dues</span>
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                ${(yearPaidTotal || 0).toFixed(2)}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                {yearPaidCount} of 12 months settled
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>{selectedYear} Unpaid</span>
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
                ${(yearUnpaidTotal || 0).toFixed(2)}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                {yearUnpaidCount} months pending
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-amber-500/30 rounded-2xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2 relative overflow-hidden bg-gradient-to-b from-amber-500/10 dark:from-amber-500/5 to-transparent shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center text-amber-700 dark:text-amber-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>Member Since ({currentMember.dor})</span>
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-amber-700 dark:text-amber-300 font-mono truncate">
                ${lifetimeMetrics.paidTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Total Paid since {currentMember.dor}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>Lifetime Cumulative Dues</span>
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-lg sm:text-2xl font-black text-blue-700 dark:text-blue-400 font-mono truncate">
                ${lifetimeMetrics.expectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Dues across {lifetimeMetrics.monthsActive} active months
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-1.5 sm:space-y-2 col-span-2 md:col-span-1 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                <span>Payment Method</span>
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-sm sm:text-lg font-extrabold text-purple-700 dark:text-purple-300 truncate">
                {currentMember.paymentType}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Collector: {currentMember.receivedBy || 'Treasurer'}
              </p>
            </div>
          </div>

          {/* Year Selector Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-6 shadow-sm dark:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-amber-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  Monthly Dues Ledger ({selectedYear})
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                  Select a fiscal year to view monthly contributions.
                </p>
              </div>

              {/* Year Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x py-1">
                {availableYears.map((y) => (
                  <button
                    key={y}
                    onClick={() => setSelectedYear(y)}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      selectedYear === y
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/60'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* 12 Months Grid Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {monthsListData.map((item) => {
                return (
                  <div
                    key={item.key}
                    className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border flex flex-col justify-between space-y-2 sm:space-y-3 transition-all ${
                      item.isNA
                        ? 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800/50 text-slate-400 dark:text-slate-600'
                        : item.isPaid
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 shadow-sm'
                        : item.isOverdue
                        ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-1">
                      <span className="font-extrabold text-[11px] sm:text-xs text-slate-900 dark:text-white truncate">
                        {item.name}
                      </span>
                      {item.isNA ? (
                        <span className="text-[8px] sm:text-[10px] text-slate-400 dark:text-slate-600 uppercase font-mono shrink-0">N/A</span>
                      ) : item.isPaid ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : item.isOverdue ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 shrink-0" />
                      )}
                    </div>

                    <div className="flex justify-between items-end border-t border-slate-200 dark:border-slate-800/60 pt-2 gap-1">
                      <div>
                        <span className="text-[9px] sm:text-[10px] text-slate-500 block">Dues</span>
                        <span className="font-bold font-mono text-xs sm:text-sm">
                          ${item.amount.toFixed(0)}
                        </span>
                      </div>

                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-wider ${
                          item.isNA
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500'
                            : item.isPaid
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                            : item.isOverdue
                            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
                            : 'bg-amber-100 dark:bg-slate-800 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {/* Admin Direct Override / Member Stripe Pay Button */}
                    {user?.role === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => togglePaymentMonth(currentMember.id, item.key)}
                        className={`w-full mt-1 py-1.5 px-2 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all border cursor-pointer active:scale-95 ${
                          item.isPaid
                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{item.isPaid ? 'Admin Mark Unpaid' : 'Admin Mark Paid'}</span>
                      </button>
                    ) : (
                      !item.isPaid && !item.isNA && (
                        <button
                          onClick={() => handleOpenStripeDues(item.name, item.key, item.amount)}
                          className="w-full mt-1 py-1.5 px-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-900/30 cursor-pointer"
                        >
                          <CreditCard className="w-3 h-3 text-indigo-200" />
                          <span>Pay ${item.amount}</span>
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            {/* Board Notes & Remarks for Member */}
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 text-xs text-amber-900 dark:text-amber-300 space-y-2">
              <div className="flex items-center justify-between font-bold text-amber-800 dark:text-amber-400">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Treasurer Board Ledger Notes & Remarks:</span>
                </div>
                {user?.role === 'admin' && !isEditingNotes && (
                  <button
                    onClick={() => {
                      setNotesText(currentMember.comments || '');
                      setIsEditingNotes(true);
                    }}
                    className="text-[10px] bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer font-bold border border-amber-300 dark:border-amber-500/40 transition-all"
                  >
                    <Edit className="w-3 h-3" />
                    <span>Edit Remarks</span>
                  </button>
                )}
              </div>

              {isEditingNotes ? (
                <div className="space-y-2 pt-1">
                  <textarea
                    rows={2}
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-500/50 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                    placeholder="e.g., loan $200, Sep+Oct 2025 pending, or member status comments..."
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingNotes(false)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs cursor-pointer font-bold border border-slate-300 dark:border-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs cursor-pointer font-bold flex items-center gap-1 shadow-md shadow-amber-500/20"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save Notes</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="pl-6 text-amber-900 dark:text-amber-200">
                  {currentMember.comments || 'No active board notes or loan remarks recorded.'}
                </p>
              )}
            </div>

          </div>

        </div>
      )}

      {/* SECTION 2: LOAN CONTRACTS & MONTHLY REPAYMENT SCHEDULE */}
      {activeSubTab === 'loans' && (() => {
        const borrowerCheck = checkPersonLoanEligibility(currentMember?.name || '', loans, true);
        const cosignerCheck = checkPersonLoanEligibility(currentMember?.name || '', loans, false);

        return (
          <div className="space-y-6">
            {/* Eligibility Banner Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    MC Board Loan Eligibility Status
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Member: {currentMember?.name}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className={`p-3 rounded-2xl border ${
                  borrowerCheck.isEligible
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Borrower Eligibility</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      borrowerCheck.isEligible ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {borrowerCheck.isEligible ? 'Eligible' : 'Ineligible'}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {borrowerCheck.isEligible
                      ? 'You currently have no active borrowing restrictions. Eligible to apply for a loan up to 4x your total contributions.'
                      : borrowerCheck.reason}
                  </p>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  cosignerCheck.isEligible
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Cosigner Eligibility</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      cosignerCheck.isEligible ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {cosignerCheck.isEligible ? 'Eligible' : 'Ineligible'}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {cosignerCheck.isEligible
                      ? 'You are eligible to act as a guarantor / cosigner for another member’s loan request.'
                      : cosignerCheck.reason}
                  </p>
                </div>
              </div>
            </div>

            {allMemberLoans.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
                <Building className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-white">No Loan Contracts Recorded</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  There are currently no active or historical loan contracts registered under member ID <strong>{currentMember.id}</strong> ({currentMember.name}).
                </p>
              </div>
            ) : (
            <div className="space-y-6">
              {allMemberLoans.map((loan) => {
                const isBorrower = loan.name.toLowerCase().includes(currentMember.name.toLowerCase());
                const isCosigner = loan.cosignName.toLowerCase().includes(currentMember.name.toLowerCase());

                // Calculate progress %
                const progressPct = Math.min(100, Math.round((loan.paid / loan.loanAmount) * 100));

                return (
                  <div
                    key={loan.loanNumber}
                    className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 space-y-4 sm:space-y-6 shadow-xl relative overflow-hidden"
                  >
                    {/* Loan Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-slate-800 pb-4 sm:pb-5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Loan #{loan.loanNumber}
                          </span>
                          {isBorrower && (
                            <span className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold">
                              PRIMARY BORROWER
                            </span>
                          )}
                          {isCosigner && (
                            <span className="bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold">
                              CO-SIGNER
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg sm:text-xl font-bold text-amber-100">
                          {loan.name}
                        </h3>

                        <p className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-2 sm:gap-3 flex-wrap">
                          <span>Term: <strong>{loan.start}</strong> to <strong>{loan.end}</strong></span>
                          <span className="hidden sm:inline">•</span>
                          <span>Guarantor: <strong>{loan.cosignName}</strong></span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3">
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleOpenEditLoan(loan)}
                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            title="Admin: Edit & Adjust Loan Contract"
                          >
                            <Edit className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden sm:inline">Adjust Loan</span>
                          </button>
                        )}
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider border ${
                            loan.status === 'active'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : loan.status === 'paid_off'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {loan.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Financial Figures Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800">
                      <div>
                        <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">
                          Loan Principal
                        </span>
                        <span className="text-sm sm:text-lg font-black font-mono text-white">
                          ${loan.loanAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div>
                        <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">
                          Total Repaid
                        </span>
                        <span className="text-sm sm:text-lg font-black font-mono text-emerald-400">
                          ${loan.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div>
                        <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">
                          Balance Due
                        </span>
                        <span className="text-sm sm:text-lg font-black font-mono text-amber-400">
                          ${loan.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div>
                        <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold block">
                          Progress
                        </span>
                        <span className="text-sm sm:text-lg font-black font-mono text-blue-400">
                          {progressPct}%
                        </span>
                      </div>
                    </div>

                    {/* Repayment Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400 font-semibold">
                        <span>Repayment Progress</span>
                        <span>{progressPct}% Settled</span>
                      </div>
                      <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Loan Comments or Special Instructions */}
                    {loan.comments && (
                      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start gap-2">
                        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span><strong>Contract Note:</strong> {loan.comments}</span>
                      </div>
                    )}

                    {/* Actions Row */}
                    <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleOpenEditLoan(loan)}
                            className="py-2 px-3.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <Edit className="w-3.5 h-3.5 text-amber-400" />
                            <span>Admin: Edit & Adjust Loan Contract</span>
                          </button>
                        )}
                      </div>

                      {loan.status === 'active' && loan.balance > 0 && (
                        <button
                          onClick={() => handleOpenStripeLoan(loan.loanNumber, loan.name, Math.min(loan.balance, 200))}
                          className="py-2 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4 text-indigo-200" />
                          <span>Make Loan Repayment</span>
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    })()}

      {/* SECTION 3: MEMBER PROFILE & ACCOUNT CREDENTIALS */}
      {activeSubTab === 'profile' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-amber-100 flex items-center gap-2">
                <User className="w-5 h-5 text-amber-400" />
                Member Directory File & Registration Details
              </h3>
              <p className="text-xs text-slate-400">
                Verified record maintained by the Board Secretary & Treasurer.
              </p>
            </div>
            {user?.role === 'admin' && (
              <button
                onClick={handleOpenAdminEdit}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Edit className="w-4 h-4" />
                <span>Edit Profile Record</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">
                  Personal Identity
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Full Legal Name:</span>
                    <span className="font-bold text-white">{currentMember.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Alias / Native Name:</span>
                    <span className="font-bold text-slate-200">{currentMember.otherName || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Official Member ID:</span>
                    <span className="font-bold font-mono text-amber-300">{currentMember.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Registration Date:</span>
                    <span className="font-bold text-white">{currentMember.dor}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">
                  Contact Information
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Primary Phone:</span>
                    <span className="font-bold text-slate-200">{currentMember.phone || 'On file with Treasurer'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Email Address:</span>
                    <span className="font-bold text-slate-200">{currentMember.email || 'info.millionairesclubusa@gmail.com'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">
                  Financial Agreement
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Monthly Dues Assessment:</span>
                    <span className="font-bold font-mono text-emerald-400">${(currentMember?.monthlyAmount || 20).toFixed(2)} / month</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Payment Collection Method:</span>
                    <span className="font-bold text-purple-300">{currentMember.paymentType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Assigned Board Collector:</span>
                    <span className="font-bold text-amber-200">{currentMember.receivedBy || 'Mangpi'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">
                  Account Standing
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Current Dues Standing:</span>
                    <span className={`font-bold uppercase ${currentMember.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currentMember.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Portal Security Tier:</span>
                    <span className="font-bold text-blue-300">Verified Member (Read & Notify)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* SECTION 4: NOTIFY TREASURER / SUBMIT PAYMENT RECEIPT */}
      {activeSubTab === 'notify' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 max-w-2xl mx-auto shadow-2xl">
          <div>
            <h3 className="text-lg font-bold text-amber-100 flex items-center gap-2">
              <Send className="w-5 h-5 text-amber-400" />
              Notify Board Treasurer of Dues / Loan Payment
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Have you submitted a Zelle, bank transfer, or cash payment? Send transaction details directly to Treasurer Mangpi for official ledger clearance.
            </p>
          </div>

          <form onSubmit={handleSendPaymentNotice} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Payment Confirmation Note / Transaction Reference
              </label>
              <textarea
                rows={4}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                required
                placeholder="e.g., Paid $60 via Zelle on Oct 12 for Oct-Dec dues. Ref: #ZELLE-88190"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {notificationSent && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-300 flex items-center gap-3 animate-fadeIn">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  Payment notice sent to Board Treasurer Mangpi. Your personal ledger will update upon verification!
                </span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Submit Payment Verification</span>
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-400">
            <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider">
              Board Support Line
            </h4>
            <div className="space-y-1 text-[11px]">
              <p className="flex items-center gap-2 text-slate-300">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>info.millionairesclubusa@gmail.com</span>
              </p>
              <p className="flex items-center gap-2 text-slate-300">
                <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
                <span>Treasurer Hotline: (918) 813-8821</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STRIPE PAYMENT MODAL */}
      {stripeModalOpen && paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 relative overflow-hidden text-white">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-1.5">
                    <span>Member Online Checkout</span>
                    <span className="bg-indigo-500/20 text-indigo-300 text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider border border-indigo-500/30">
                      SECURE
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span>256-Bit SSL Encrypted Settlement</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setStripeModalOpen(false);
                  setPaymentSuccess(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Payment Content */}
            {paymentSuccess ? (
              /* SUCCESS RECEIPT VIEW */
              <div className="py-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 mx-auto animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-xl font-extrabold text-white">Payment Successful!</h4>
                  <p className="text-xs text-slate-300">
                    Your contribution has been officially verified and recorded into the club ledger.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left space-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-500">Transaction Ref:</span>
                    <span className="text-amber-400 font-bold">{paymentSuccess.txnId}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-500">Member Name:</span>
                    <span className="text-white font-bold">{paymentTarget.memberName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-500">Settlement Category:</span>
                    <span className="text-indigo-300 font-bold">{paymentSuccess.description}</span>
                  </div>
                  {!!paymentSuccess.platformFeeAmount && (
                    <div className="flex justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-slate-500">Platform & Development Fee:</span>
                      <span className="text-slate-300">${paymentSuccess.platformFeeAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-sm font-black">
                    <span className="text-slate-400">Total Paid:</span>
                    <span className="text-emerald-400">${((paymentSuccess?.amount || 0) + (paymentSuccess?.platformFeeAmount || 0)).toFixed(2)} USD</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setStripeModalOpen(false);
                    setPaymentSuccess(null);
                  }}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  Done & Refresh Ledger
                </button>
              </div>
            ) : (
              /* PAYMENT EXECUTION FORM */
              <form onSubmit={handleExecuteStripePayment} className="space-y-4">
                
                {/* Live vs Demo Mode Indicator */}
                <div className={`p-3 rounded-2xl text-xs border flex items-start gap-2.5 ${
                  stripeConfig?.configured
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                }`}>
                  <Zap className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-[11px]">
                    <span className="font-bold block text-white">
                      {stripeConfig?.configured ? 'Online Payment Gateway Active' : 'Online Payment System Ready'}
                    </span>
                    <p className="text-slate-300">
                      {stripeConfig?.configured
                        ? 'Clicking pay will launch hosted checkout for secure credit card processing.'
                        : 'Simulated settlement active for member testing. Multi-channel support for Card, Apple Pay, ACH & Zelle.'}
                    </p>
                  </div>
                </div>

                {/* Target Payment Summary Card */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">Member Name:</span>
                    <span className="text-amber-300 font-extrabold">{paymentTarget.memberName} ({paymentTarget.memberId})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">Item Description:</span>
                    <span className="text-slate-200">{paymentTarget.description}</span>
                  </div>

                  {/* Editable Amount for Loan Payments */}
                  {paymentTarget.type === 'loan' ? (
                    <>
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300">Repayment Amount ($):</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={paymentTarget.amount}
                          onChange={(e) => setPaymentTarget({ ...paymentTarget, amount: parseFloat(e.target.value) || 0 })}
                          className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-right font-mono text-sm font-black text-emerald-400 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Platform & Development Fee (1.5%):</span>
                        <span className="text-slate-300 font-mono">${loanPaymentFee.toFixed(2)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-black">
                        <span className="text-slate-400">Total Charged Today:</span>
                        <span className="text-emerald-400 text-base font-mono">${totalChargeAmount.toFixed(2)} USD</span>
                      </div>
                    </>
                  ) : (
                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-black">
                      <span className="text-slate-400">Total Dues Amount:</span>
                      <span className="text-emerald-400 text-base font-mono">${(paymentTarget?.amount || 0).toFixed(2)} USD</span>
                    </div>
                  )}
                </div>

                {/* Payment Method Selector Tabs */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod('ach')}
                      className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        selectedPaymentMethod === 'ach'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <Building className="w-3.5 h-3.5" />
                      <span className="truncate">ACH Bank</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod('card')}
                      className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        selectedPaymentMethod === 'card'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span className="truncate">Card</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod('apple_pay')}
                      className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        selectedPaymentMethod === 'apple_pay'
                          ? 'bg-slate-100 text-slate-950 font-black shadow-md shadow-slate-100/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <span className="text-sm leading-none font-bold"></span>
                      <span className="truncate">Apple Pay</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPaymentMethod('zelle')}
                      className={`py-2 px-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        selectedPaymentMethod === 'zelle'
                          ? 'bg-purple-600 text-white font-extrabold shadow-md shadow-purple-600/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 fill-purple-200 text-purple-200" />
                      <span className="truncate">Zelle</span>
                    </button>
                  </div>
                </div>

                {/* Card Details Form */}
                {selectedPaymentMethod === 'card' && (
                  <div className="space-y-2.5 animate-fadeIn">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      Credit / Debit Card Details
                    </label>
                    
                    <div className="space-y-2 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Card Number</span>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="4242 4242 4242 4242"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Expires</span>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="MM/YY"
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">CVC</span>
                          <input
                            type="text"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            placeholder="CVC"
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Apple Pay Form / Preview */}
                {selectedPaymentMethod === 'apple_pay' && (
                  <div className="space-y-2.5 bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-center animate-fadeIn">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-slate-950 font-black text-xs mb-1">
                      <span className="text-base font-bold"></span> Pay Express
                    </div>
                    <p className="text-xs text-slate-300">
                      1-Touch biometric authentication (Face ID / Touch ID) enabled on Apple devices via Stripe.
                    </p>
                    <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1 text-left font-mono">
                      <div className="flex justify-between">
                        <span>Device Security:</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Secure Enclave Active
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Default Wallet Card:</span>
                        <span className="text-slate-200">Apple Card (•••• 1092)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ACH Direct Debit / Bank Transfer Form */}
                {selectedPaymentMethod === 'ach' && (
                  <div className="space-y-2.5 animate-fadeIn">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                      ACH Direct Debit / US Bank Transfer
                    </label>

                    <div className="space-y-2.5 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Select Bank Institution</span>
                        <select
                          value={achBankName}
                          onChange={(e) => setAchBankName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="Chase Bank">JPMorgan Chase Bank</option>
                          <option value="Bank of America">Bank of America</option>
                          <option value="Wells Fargo">Wells Fargo Bank</option>
                          <option value="Citibank">Citibank</option>
                          <option value="Capital One">Capital One Bank</option>
                          <option value="US Bank">US Bank</option>
                          <option value="PNC Bank">PNC Bank</option>
                          <option value="TD Bank">TD Bank</option>
                          <option value="Other Financial Institution">Other US Bank (Manual Routing)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Routing Number</span>
                          <input
                            type="text"
                            value={achRoutingNumber}
                            onChange={(e) => setAchRoutingNumber(e.target.value)}
                            placeholder="9-digit routing"
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Account Number</span>
                          <input
                            type="text"
                            value={achAccountNumber}
                            onChange={(e) => setAchAccountNumber(e.target.value)}
                            placeholder="Account number"
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-1">
                        <Building className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Direct ACH Bank Settlement — Verified secure electronic transfer.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Zelle Direct Transfer Form & Info */}
                {selectedPaymentMethod === 'zelle' && (
                  <div className="space-y-2.5 animate-fadeIn">
                    <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-purple-300 font-bold border-b border-purple-500/20 pb-2">
                        <span className="flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-purple-400 fill-purple-400" />
                          Official Club Zelle Recipient Info
                        </span>
                        <span className="text-[10px] bg-purple-500/20 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                          Zero Fees
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-400 uppercase block font-bold">Registered Zelle Email</span>
                          <span className="text-white font-mono font-bold select-all">zelle@millionairesclub.org</span>
                        </div>
                        <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-400 uppercase block font-bold">Account Name</span>
                          <span className="text-purple-200 font-bold">Millionaires Club Treasury</span>
                        </div>
                      </div>

                      <p className="text-[10px] text-purple-300/80 pt-0.5">
                        Send ${(paymentTarget?.amount || 0).toFixed(2)} via Zelle on your mobile banking app (Chase, BoA, Wells Fargo, etc.), then enter your details below:
                      </p>
                    </div>

                    <div className="space-y-2 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Your Zelle Sender Name / Bank Account Name</span>
                        <input
                          type="text"
                          value={zelleSenderName}
                          onChange={(e) => setZelleSenderName(e.target.value)}
                          placeholder={currentMember?.name || 'e.g. John Tuang'}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Zelle Confirmation # or Memo Note (Optional)</span>
                        <input
                          type="text"
                          value={zelleConfirmationCode}
                          onChange={(e) => setZelleConfirmationCode(e.target.value)}
                          placeholder="e.g. ZEL-948271 or Dues Feb 2026"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Message Display */}
                {stripeError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{stripeError}</span>
                  </div>
                )}

                {/* Modal Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStripeModalOpen(false)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isProcessingStripe}
                    className={`flex-1 py-3 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                      selectedPaymentMethod === 'apple_pay'
                        ? 'bg-slate-100 hover:bg-white text-slate-950 shadow-slate-100/20'
                        : selectedPaymentMethod === 'ach'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/40'
                        : selectedPaymentMethod === 'zelle'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/40'
                        : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 text-white shadow-purple-900/40'
                    }`}
                  >
                    {isProcessingStripe ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : selectedPaymentMethod === 'apple_pay' ? (
                      <>
                        <span className="text-base font-bold leading-none"></span>
                        <span>Pay ${totalChargeAmount.toFixed(2)} with Apple Pay</span>
                      </>
                    ) : selectedPaymentMethod === 'ach' ? (
                      <>
                        <Building className="w-4 h-4" />
                        <span>Debit Bank Account (${totalChargeAmount.toFixed(2)})</span>
                      </>
                    ) : selectedPaymentMethod === 'zelle' ? (
                      <>
                        <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                        <span>Submit Zelle Transfer (${totalChargeAmount.toFixed(2)})</span>
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>Pay ${totalChargeAmount.toFixed(2)}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-[10px] text-center text-slate-500 flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>256-Bit Encrypted Payment Gateway & Millionaires Club USA</span>
                </div>

              </form>
            )}

          </div>
        </div>
      )}

      {/* BOARD ADMIN MEMBER EDIT MODAL */}
      {adminEditModalOpen && currentMember && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-2xl w-full my-8 space-y-6 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Board Officer Editing Mode
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  Edit Member Directory Record: {currentMember.id}
                </h3>
              </div>
              <button
                onClick={() => setAdminEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdminEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Alias / Native Name</label>
                  <input
                    type="text"
                    value={editFormData.otherName}
                    onChange={(e) => setEditFormData({ ...editFormData, otherName: e.target.value })}
                    placeholder="e.g. Nickname"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Date of Registration (DOR)</label>
                  <input
                    type="text"
                    required
                    value={editFormData.dor}
                    onChange={(e) => setEditFormData({ ...editFormData, dor: e.target.value })}
                    placeholder="MM/DD/YYYY"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Monthly Dues Assessment ($)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="5"
                    value={editFormData.monthlyAmount}
                    onChange={(e) => setEditFormData({ ...editFormData, monthlyAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 font-mono font-bold text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Payment Method</label>
                  <select
                    value={editFormData.paymentType}
                    onChange={(e) => setEditFormData({ ...editFormData, paymentType: e.target.value as PaymentType })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="Auto-pay">Auto-pay</option>
                    <option value="Cash">Cash</option>
                    <option value="Online">Online</option>
                    <option value="Zelle">Zelle</option>
                    <option value="Check">Check</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Membership Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as 'active' | 'inactive' | 'overdue' })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500 cursor-pointer font-bold"
                  >
                    <option value="active" className="text-emerald-400 font-bold">Active Member</option>
                    <option value="inactive" className="text-slate-400 font-bold">Inactive / Archived Member</option>
                    <option value="overdue" className="text-rose-400 font-bold">Pending Dues / Overdue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Primary Phone</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="(555) 000-0000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Assigned Collector / Received By</label>
                  <input
                    type="text"
                    value={editFormData.receivedBy}
                    onChange={(e) => setEditFormData({ ...editFormData, receivedBy: e.target.value })}
                    placeholder="e.g. Mangpi"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Board Ledger Notes & Remarks</label>
                <textarea
                  rows={3}
                  value={editFormData.comments}
                  onChange={(e) => setEditFormData({ ...editFormData, comments: e.target.value })}
                  placeholder="e.g. loan $200, Sep+Oct 2025 pending..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdminEditModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Loan Modal */}
      <EditLoanModal
        isOpen={isEditLoanModalOpen}
        onClose={() => setIsEditLoanModalOpen(false)}
        loan={editingLoan}
      />

    </div>
  );
};
