/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ClubProvider } from './context/ClubContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { DashboardTab } from './components/Dashboard/DashboardTab';
import { MembersTab } from './components/Members/MembersTab';
import { MemberDetailModal } from './components/Members/MemberDetailModal';
import { AddMemberModal } from './components/Members/AddMemberModal';
import { LoansTab } from './components/Loans/LoansTab';
import { IssueLoanModal } from './components/Loans/IssueLoanModal';
import { RecordLoanPaymentModal } from './components/Loans/RecordLoanPaymentModal';
import { RemindersTab } from './components/Reminders/RemindersTab';
import { AnalyticsTab } from './components/Analytics/AnalyticsTab';
import { ReportsTab } from './components/Reports/ReportsTab';
import { MemberPortalTab } from './components/MemberPortal/MemberPortalTab';
import { LoginPortalModal } from './components/Auth/LoginPortalModal';
import { RecordContributionModal } from './components/Modals/RecordContributionModal';
import { Member, Loan } from './types';

function MainContent() {
  const { user, isLoginModalOpen, closeLoginModal } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Automatically default members to my_portal tab
  React.useEffect(() => {
    if (user?.role === 'member') {
      setActiveTab('my_portal');
    }
  }, [user]);

  const effectiveTab = user?.role === 'member' ? 'my_portal' : activeTab;

  // Modal States
  const [isRecordContributionOpen, setIsRecordContributionOpen] = useState(false);
  const [recordContributionMemberId, setRecordContributionMemberId] = useState<string | null>(null);

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedDetailMember, setSelectedDetailMember] = useState<Member | null>(null);

  const [isIssueLoanOpen, setIsIssueLoanOpen] = useState(false);
  const [selectedRepaymentLoan, setSelectedRepaymentLoan] = useState<Loan | null>(null);

  // Handlers
  const handleOpenRecordContribution = (memberId?: string) => {
    setRecordContributionMemberId(memberId || null);
    setIsRecordContributionOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950 transition-colors">
      
      {/* Top Bar Header */}
      <Header
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenRecordContribution={() => handleOpenRecordContribution()}
        onOpenIssueLoan={() => setIsIssueLoanOpen(true)}
      />

      {/* Navigation Tabs & Left Sidebar Drawer */}
      <Sidebar
        activeTab={effectiveTab}
        setActiveTab={setActiveTab}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenRecordContribution={() => handleOpenRecordContribution()}
        onOpenIssueLoan={() => setIsIssueLoanOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 print:p-0 print:m-0 print:max-w-none print:w-full">
        {effectiveTab === 'my_portal' && <MemberPortalTab />}

        {effectiveTab === 'dashboard' && user?.role === 'admin' && (
          <DashboardTab
            onNavigateTab={setActiveTab}
            onRecordContribution={() => handleOpenRecordContribution()}
            onIssueLoan={() => setIsIssueLoanOpen(true)}
          />
        )}

        {effectiveTab === 'members' && user?.role === 'admin' && (
          <MembersTab
            onSelectMember={(member) => setSelectedDetailMember(member)}
            onOpenAddMember={() => setIsAddMemberOpen(true)}
            onRecordContributionForMember={(memberId) => handleOpenRecordContribution(memberId)}
          />
        )}

        {effectiveTab === 'loans' && user?.role === 'admin' && (
          <LoansTab
            onOpenIssueLoan={() => setIsIssueLoanOpen(true)}
            onOpenRecordRepayment={(loan) => setSelectedRepaymentLoan(loan)}
          />
        )}

        {effectiveTab === 'reminders' && user?.role === 'admin' && <RemindersTab />}

        {effectiveTab === 'analytics' && user?.role === 'admin' && <AnalyticsTab />}

        {effectiveTab === 'reports' && user?.role === 'admin' && <ReportsTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 Millionaires Club Board of Directors. All rights reserved.</span>
          <span className="text-slate-400">info.millionairesclubusa@gmail.com</span>
        </div>
      </footer>

      {/* Auth Login Portal Modal */}
      <LoginPortalModal
        isOpen={isLoginModalOpen}
        onClose={closeLoginModal}
      />

      {/* Modals */}
      <RecordContributionModal
        isOpen={isRecordContributionOpen}
        preSelectedMemberId={recordContributionMemberId}
        onClose={() => setIsRecordContributionOpen(false)}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
      />

      <MemberDetailModal
        member={selectedDetailMember}
        onClose={() => setSelectedDetailMember(null)}
        onRecordContribution={(memberId) => {
          setSelectedDetailMember(null);
          handleOpenRecordContribution(memberId);
        }}
      />

      <IssueLoanModal
        isOpen={isIssueLoanOpen}
        onClose={() => setIsIssueLoanOpen(false)}
      />

      <RecordLoanPaymentModal
        loan={selectedRepaymentLoan}
        onClose={() => setSelectedRepaymentLoan(null)}
      />

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ClubProvider>
          <MainContent />
        </ClubProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
