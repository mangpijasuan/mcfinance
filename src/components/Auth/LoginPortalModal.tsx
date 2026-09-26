import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClub } from '../../context/ClubContext';
import { ShieldCheck, UserCheck, Lock, Landmark, KeyRound, X, Eye, EyeOff } from 'lucide-react';
import { deriveFallbackPin, sha256Hex } from '../../utils/authCrypto';

interface LoginPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginPortalModal: React.FC<LoginPortalModalProps> = ({ isOpen, onClose }) => {
  const { loginAsAdmin, loginAsMember, user, initialModalTab } = useAuth();
  const { members } = useClub();

  const [activeTab, setActiveTab] = useState<'admin' | 'member'>(initialModalTab || 'admin');

  React.useEffect(() => {
    if (isOpen && initialModalTab) {
      setActiveTab(initialModalTab);
    }
  }, [isOpen, initialModalTab]);

  // Admin form state
  const [adminEmail, setAdminEmail] = useState('treasurer@millionairesclub.org');
  const [adminPass, setAdminPass] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Member form state
  const [memberIdInput, setMemberIdInput] = useState('');
  const [memberPass, setMemberPass] = useState('');
  const [showMemberPass, setShowMemberPass] = useState(false);
  const [memberError, setMemberError] = useState('');

  if (!isOpen) return null;

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    if (!adminEmail.trim()) {
      setAdminError('Please enter a valid administrator email.');
      return;
    }
    if (!adminPass) {
      setAdminError('Please enter the administrator security passkey.');
      return;
    }

    const expectedHash = import.meta.env.VITE_ADMIN_PASSWORD_HASH as string | undefined;
    if (!expectedHash) {
      setAdminError('Admin login is not configured. Set VITE_ADMIN_PASSWORD_HASH in .env to enable admin access.');
      return;
    }

    setIsVerifying(true);
    const enteredHash = await sha256Hex(adminPass);
    setIsVerifying(false);

    if (enteredHash !== expectedHash) {
      setAdminError('Incorrect administrator passkey.');
      return;
    }

    loginAsAdmin(adminEmail, 'Mangpi', 'Board Executive');
    onClose();
  };

  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');
    const cleanId = memberIdInput.trim().toUpperCase();
    if (!cleanId) {
      setMemberError('Please enter your official Member ID (e.g. MC-10001).');
      return;
    }
    if (!memberPass) {
      setMemberError('Please enter your Security PIN.');
      return;
    }

    const targetMember = members.find((m) => m.id.toUpperCase() === cleanId);
    if (!targetMember) {
      setMemberError('Invalid Member ID or PIN. Please verify and try again.');
      return;
    }

    setIsVerifying(true);
    const enteredHash = await sha256Hex(memberPass);
    const expectedHash = targetMember.pin || (await sha256Hex(deriveFallbackPin(targetMember.id, targetMember.phone)));
    setIsVerifying(false);

    if (enteredHash !== expectedHash) {
      // Deliberately identical to the "member not found" message above so a wrong
      // PIN can't be used to confirm which Member IDs exist.
      setMemberError('Invalid Member ID or PIN. Please verify and try again.');
      return;
    }

    loginAsMember(targetMember.id, targetMember.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative text-white space-y-6">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-full transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          title="Close Modal"
          aria-label="Close Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-200 flex items-center justify-center text-slate-950 font-extrabold mx-auto shadow-lg shadow-amber-500/20">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-amber-100 tracking-tight">Millionaires Club Portal</h2>
            <p className="text-xs text-amber-400/90 font-bold tracking-widest uppercase mt-0.5">
              SECURE ACCESS SYSTEM
            </p>
          </div>
        </div>

        {/* Portal Role Selector Tabs */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950 border border-slate-800 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Admin Portal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('member')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === 'member'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Member Portal</span>
          </button>
        </div>

        {/* ADMIN LOGIN FORM */}
        {activeTab === 'admin' && (
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 sm:p-5 text-xs text-amber-300 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                <strong className="text-amber-200">Board Administrator Access:</strong> Full authority to record contributions, disburse loans, send automated SMS/Email reminders, and manage directory records.
              </span>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Administrator Email / Username
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                    placeholder="treasurer@millionairesclub.org"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Security Passkey / Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showAdminPass ? 'text' : 'password'}
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title={showAdminPass ? 'Hide password' : 'Show password'}
                  >
                    {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {adminError && <p className="text-xs text-rose-400">{adminError}</p>}

            <div className="space-y-2.5 pt-2">
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isVerifying ? 'Verifying…' : 'Authenticate as Admin'}
              </button>
            </div>
          </form>
        )}

        {/* MEMBER LOGIN FORM */}
        {activeTab === 'member' && (
          <form onSubmit={handleMemberSubmit} className="space-y-4">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 sm:p-5 text-xs text-slate-300 flex items-start gap-3">
              <UserCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                <strong className="text-amber-200">Member Personal Portal:</strong> Enter your assigned Member ID to securely log in to your personal dues ledger, loan schedules, and financial records.
              </span>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Your Member ID
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={memberIdInput}
                    onChange={(e) => {
                      setMemberIdInput(e.target.value);
                      setMemberError('');
                    }}
                    placeholder="Enter Member ID (e.g. MC-10001)"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all uppercase font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Member Security PIN / Passkey
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type={showMemberPass ? 'text' : 'password'}
                    value={memberPass}
                    onChange={(e) => setMemberPass(e.target.value)}
                    placeholder="Enter Security PIN"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMemberPass(!showMemberPass)}
                    className="absolute right-3 top-2.5 p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title={showMemberPass ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showMemberPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {memberError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-medium">
                {memberError}
              </div>
            )}

            <div className="space-y-2.5 pt-2">
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isVerifying ? 'Verifying…' : 'Log In to Member Portal'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

