-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "linkedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "nickname" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "phoneNo" TEXT,
    "email" TEXT,
    "beneficiary" TEXT,
    "notes" TEXT,
    "archiveLifetime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contributions2026" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallContributions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthsActive" INTEGER NOT NULL DEFAULT 0,
    "maxLoanAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentLoanBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eligible" TEXT NOT NULL DEFAULT 'NO',
    "activeAsBorrower" INTEGER NOT NULL DEFAULT 0,
    "activeAsCosigner" INTEGER NOT NULL DEFAULT 0,
    "lastContributionDate" TIMESTAMP(3),
    "thisMonth" TEXT NOT NULL DEFAULT 'NOT PAID',
    "riskFlag" TEXT NOT NULL DEFAULT 'LOW',
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YearlyTotal" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "YearlyTotal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "monthYear" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "receivedBy" TEXT,
    "comments" TEXT,
    "source" TEXT,
    "entryTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "cosignerId" TEXT,
    "cosignerName" TEXT,
    "loanDate" TIMESTAMP(3) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "loanAmount" DOUBLE PRECISION NOT NULL,
    "monthlyDue" DOUBLE PRECISION NOT NULL,
    "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceRemaining" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "endDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "overdue" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "receivedBy" TEXT,
    "comments" TEXT,
    "source" TEXT,
    "monthYear" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalLoan" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "cosignerName" TEXT,
    "loanDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "loanAmount" DOUBLE PRECISION NOT NULL,
    "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceRemaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Paid Off',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "withdrawalDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Partial',
    "reason" TEXT,
    "processedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanAgreement" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "borrowerAddress" TEXT,
    "borrowerCity" TEXT,
    "borrowerState" TEXT,
    "cosignerName" TEXT,
    "cosignerId" TEXT,
    "lenderName" TEXT NOT NULL DEFAULT 'Millionaires Club',
    "applicationFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanAmount" DOUBLE PRECISION NOT NULL,
    "monthlyPayment" DOUBLE PRECISION NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "borrowerSignature" TEXT,
    "borrowerSignedAt" TIMESTAMP(3),
    "cosignerSignature" TEXT,
    "cosignerSignedAt" TIMESTAMP(3),
    "lenderSignature" TEXT,
    "lenderSignedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalPayment" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "loanId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "zelleReference" TEXT,
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "contributionId" TEXT,
    "loanPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_linkedMemberId_key" ON "Admin"("linkedMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "YearlyTotal_memberId_year_key" ON "YearlyTotal"("memberId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_transactionId_key" ON "Contribution"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_loanId_key" ON "Loan"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPayment_paymentId_key" ON "LoanPayment"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalLoan_loanId_key" ON "HistoricalLoan"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_withdrawalId_key" ON "Withdrawal"("withdrawalId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanAgreement_agreementId_key" ON "LoanAgreement"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanAgreement_loanId_key" ON "LoanAgreement"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalPayment_publicId_key" ON "PortalPayment"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalPayment_stripeSessionId_key" ON "PortalPayment"("stripeSessionId");

-- AddForeignKey
ALTER TABLE "YearlyTotal" ADD CONSTRAINT "YearlyTotal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_cosignerId_fkey" FOREIGN KEY ("cosignerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("loanId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAgreement" ADD CONSTRAINT "LoanAgreement_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("loanId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalPayment" ADD CONSTRAINT "PortalPayment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

