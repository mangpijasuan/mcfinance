import React from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BellRing,
  TrendingUp,
  FileSpreadsheet,
  X,
  Landmark,
  ShieldCheck,
  Plus,
  DollarSign,
  ChevronRight,
  UserCheck,
  Mail,
  ArrowRightLeft,
  Sun,
  Moon
} from 'lucide-react';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export type TabType = 'dashboard' | 'members' | 'loans' | 'reminders' | 'analytics' | 'reports' | 'my_portal';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenRecordContribution: () => void;
  onOpenIssueLoan: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onClose,
  onOpenRecordContribution,
  onOpenIssueLoan
}) => {
  const { members, loans, metrics } = useClub();
  const { user, openLoginModal } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const overdueMembersCount = members.filter(
    m => m.status === 'overdue' || (m.comments && m.comments.toLowerCase().includes('nailo'))
  ).length;
  const activeLoansCount = loans.filter(l => l.balance > 0).length;

  const navItems = [
    {
      id: 'my_portal' as TabType,
      label: user?.role === 'member' ? 'My Personal Account' : 'Member Portal',
      icon: UserCheck,
      badge: user?.role === 'member' ? user.memberId || 'Active' : 'Portal View',
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    },
    {
      id: 'dashboard' as TabType,
      label: 'Executive Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'members' as TabType,
      label: 'Members & Monthly Dues',
      icon: Users,
      badge: `${members.length} Members`
    },
    {
      id: 'loans' as TabType,
      label: 'Operating Loan Ledger',
      icon: CreditCard,
      badge: `${activeLoansCount} Active`
    },
    {
      id: 'reminders' as TabType,
      label: 'Automated Reminders',
      icon: BellRing,
      badge: overdueMembersCount > 0 ? `${overdueMembersCount} Overdue` : null,
      badgeColor: 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
    },
    {
      id: 'analytics' as TabType,
      label: 'Fund Analytics & Audit',
      icon: TrendingUp,
      badge: null
    },
    {
      id: 'reports' as TabType,
      label: 'Official Financial Reports',
      icon: FileSpreadsheet,
      badge: null
    }
  ];

  const handleSelectTab = (tab: TabType) => {
    setActiveTab(tab);
    onClose();
  };

  return (
    <>
      {/* Backdrop Overlay when Left Sidebar Drawer is Open */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 transition-opacity duration-300 print:hidden"
        />
      )}

      {/* Left Sidebar Drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 max-w-[85vw] w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out text-slate-900 dark:text-white overflow-y-auto no-scrollbar print:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-5">
          
          {/* Header & Close Button */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-200 flex items-center justify-center text-slate-950 font-extrabold shadow-md shadow-amber-500/20 shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="flex flex-col justify-center">
                <h2 className="font-extrabold text-sm text-amber-100 whitespace-nowrap leading-tight">
                  Millionaires Club
                </h2>
                <div className="flex items-center flex-wrap gap-2 mt-0.5">
                  <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase whitespace-nowrap">
                    FINANCIAL SERVICE
                  </span>
                  <span className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/30 shrink-0">
                    <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                    Trust Fund
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer border border-slate-700/60"
              title="Close Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Account Role Card & Switch Button */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                user?.role === 'admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {user?.role === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-extrabold text-white truncate">
                  {user ? user.name : 'Guest User'}
                </span>
                <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">
                  {user ? `${user.role} mode` : 'Not Logged In'}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                openLoginModal();
                onClose();
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[10px] font-bold border border-amber-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
              title="Switch Portal Role"
            >
              <ArrowRightLeft className="w-3 h-3 text-amber-400" />
              <span>Switch</span>
            </button>
          </div>

          {/* Navigation Links List */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest px-2 block mb-1.5">
              {user?.role === 'member' ? 'Member Portal' : 'Navigation Menu'}
            </span>
            {navItems
              .filter((item) => (user?.role === 'member' ? item.id === 'my_portal' : true))
              .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md shadow-amber-500/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-slate-950' : 'text-amber-400/90 group-hover:text-amber-300'
                    }`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          item.badgeColor
                            ? item.badgeColor
                            : isActive
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-slate-800/90 text-slate-300 border border-slate-700/60'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${
                      isActive ? 'text-slate-950' : 'text-slate-500'
                    }`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Operations inside Sidebar (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="pt-3 space-y-2 border-t border-slate-800/80">
              <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest px-2 block mb-1.5">
                Quick Operations
              </span>
              <button
                onClick={() => {
                  onOpenRecordContribution();
                  onClose();
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950/30 active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Record Member Dues</span>
              </button>

              <button
                onClick={() => {
                  onOpenIssueLoan();
                  onClose();
                }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-950/30 active:scale-[0.98] cursor-pointer"
              >
                <DollarSign className="w-4 h-4" />
                <span>Issue New Loan Contract</span>
              </button>
            </div>
          )}

          {/* Quick Fund Snapshot Widget (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400 font-medium text-[11px]">
                <span>Operating Fund</span>
                <span className="text-emerald-400 font-bold font-mono text-xs">
                  ${metrics.totalContributions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400 text-[11px]">
                <span>Bank Balance</span>
                <span className="text-blue-400 font-mono font-semibold text-xs">
                  ${metrics.totalBankBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400 text-[11px]">
                <span>Active Loans</span>
                <span className="text-amber-400 font-mono font-semibold text-xs">
                  ${metrics.totalLoanBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Sidebar Footer & Theme Toggle */}
        <div className="pt-4 border-t border-slate-800/80 text-slate-500 text-[11px] space-y-3 mt-4">
          <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              {theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Dark Mode</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              )}
            </span>
            <button
              onClick={toggleTheme}
              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px] transition-all cursor-pointer"
            >
              Switch to {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-400">Millionaires Club</p>
            <p className="flex items-center gap-1 text-[10px]">
              <Mail className="w-3 h-3 text-slate-400" />
              info.millionairesclubusa@gmail.com
            </p>
            <p className="text-[10px] text-slate-600 pt-0.5">© 2026 Board of Directors</p>
          </div>
        </div>

      </aside>
    </>
  );
};
