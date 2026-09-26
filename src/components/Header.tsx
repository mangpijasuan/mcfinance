import React from 'react';
import { DollarSign, Plus, Landmark, ShieldCheck, Menu, UserCheck, LogIn, ArrowRightLeft, Sun, Moon } from 'lucide-react';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenRecordContribution: () => void;
  onOpenIssueLoan: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onOpenRecordContribution,
  onOpenIssueLoan
}) => {
  const { metrics } = useClub();
  const { user, openLoginModal } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm dark:shadow-md transition-colors print:hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-3">
        
        {/* Brand & Identity with Hamburger Menu Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer focus:outline-none active:scale-95 flex items-center justify-center gap-1.5"
            title="Toggle Left Sidebar Menu"
            aria-label="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
            <span className="hidden md:inline text-xs font-bold text-slate-700 dark:text-slate-300">Menu</span>
          </button>

          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-200 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20 shrink-0">
            <Landmark className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          <div className="flex flex-col justify-center">
            <h1 className="font-extrabold text-sm sm:text-lg text-amber-800 dark:text-amber-100 tracking-tight whitespace-nowrap leading-tight">
              Millionaires Club
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] sm:text-[10px] font-bold text-amber-400 tracking-widest uppercase">
                FINANCIAL SERVICE
              </span>
              <span className="hidden xs:inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-medium text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/30 shrink-0">
                <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
                Trust Fund
              </span>
            </div>
          </div>
        </div>

        {/* Live Quick Financial Badges (Board Admin Only for Privacy) */}
        {user?.role === 'admin' ? (
          <div className="hidden xl:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
              <span className="text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Total Fund:</span>
              <span className="font-bold text-emerald-400 text-sm font-mono">${metrics.totalContributions.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
              <span className="text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Bank Balance:</span>
              <span className="font-bold text-blue-400 text-sm font-mono">${metrics.totalBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg">
              <span className="text-slate-400 uppercase tracking-wider font-semibold text-[10px]">Loans Active:</span>
              <span className="font-bold text-amber-400 text-sm font-mono">${metrics.totalLoanBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-3.5 py-1.5 rounded-xl text-xs">
            <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-blue-200 font-bold">Private Member Account</span>
            {user?.memberId && (
              <span className="bg-blue-500/20 text-blue-300 font-mono font-bold px-2 py-0.5 rounded text-[11px] ml-1">
                {user.memberId}
              </span>
            )}
          </div>
        )}

        {/* User Account / Portal Switcher & Action Buttons */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5">
          
          {/* Theme Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer focus:outline-none active:scale-95 flex items-center gap-1.5 shrink-0"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden lg:inline text-xs font-semibold text-slate-200">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span className="hidden lg:inline text-xs font-semibold text-slate-800">Dark</span>
              </>
            )}
          </button>

          {/* User Auth Portal Badge */}
          <button
            onClick={() => openLoginModal()}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              user?.role === 'admin'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 hover:bg-amber-500/20'
                : 'bg-blue-500/10 border-blue-500/40 text-blue-200 hover:bg-blue-500/20'
            }`}
            title="Click to Switch Portal or Log Out"
          >
            {user?.role === 'admin' ? (
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            ) : (
              <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
            )}
            
            <div className="flex flex-col text-left">
              <span className="font-bold leading-tight text-white max-w-[80px] xs:max-w-[120px] sm:max-w-[160px] truncate text-[11px] sm:text-xs">
                {user ? user.name : 'Guest User'}
              </span>
              <span className="text-[8px] sm:text-[9px] uppercase font-bold text-amber-400/90 tracking-wider">
                {user ? `${user.role.toUpperCase()} PORTAL` : 'LOGIN PORTAL'}
              </span>
            </div>

            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 hidden sm:block ml-0.5" />
          </button>

          {/* Quick Actions (Shown mainly for Admin or all) */}
          {user?.role === 'admin' && (
            <>
              <button
                onClick={onOpenRecordContribution}
                className="hidden sm:flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-900/30 active:scale-95 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Record Dues</span>
              </button>

              <button
                onClick={onOpenIssueLoan}
                className="hidden md:flex items-center space-x-1.5 bg-amber-600 hover:bg-amber-500 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shadow-amber-900/30 active:scale-95 cursor-pointer shrink-0"
              >
                <DollarSign className="w-4 h-4" />
                <span>Issue Loan</span>
              </button>
            </>
          )}

        </div>

      </div>
    </header>
  );
};

