const { PrismaClient } = require('@prisma/client')

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@millionairesclub.com'
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'admin123'
const MEMBER_PASSWORD = process.env.SMOKE_MEMBER_PASSWORD || 'SmokeTest123!'

const prisma = new PrismaClient()

class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  addFromResponse(res) {
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : splitSetCookieHeader(res.headers.get('set-cookie'))

    for (const header of setCookies) {
      const [pair] = header.split(';')
      const eqIndex = pair.indexOf('=')
      if (eqIndex === -1) continue
      const name = pair.slice(0, eqIndex).trim()
      const value = pair.slice(eqIndex + 1).trim()
      this.cookies.set(name, value)
    }
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }
}

function splitSetCookieHeader(header) {
  if (!header) return []
  return header.split(/,(?=\s*[^;=]+=[^;]+)/)
}

async function request(jar, path, options = {}) {
  const headers = new Headers(options.headers || {})
  const cookieHeader = jar.header()
  if (cookieHeader) headers.set('cookie', cookieHeader)

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: options.redirect || 'manual',
  })
  jar.addFromResponse(res)
  return res
}

async function json(res) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

async function login(provider, credentials) {
  const jar = new CookieJar()

  const csrfRes = await request(jar, '/api/auth/csrf')
  if (!csrfRes.ok) {
    throw new Error(`CSRF request failed: ${csrfRes.status}`)
  }
  const csrfBody = await json(csrfRes)
  const form = new URLSearchParams({
    csrfToken: csrfBody.csrfToken,
    callbackUrl: `${BASE_URL}/dashboard`,
    json: 'true',
    redirect: 'false',
    ...credentials,
  })

  const loginRes = await request(jar, `/api/auth/callback/${provider}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const loginBody = await json(loginRes)
  if (!loginRes.ok) {
    throw new Error(`Login failed for ${provider}: ${loginRes.status} ${JSON.stringify(loginBody)}`)
  }

  const sessionRes = await request(jar, '/api/auth/session')
  const session = await json(sessionRes)
  if (!session?.user) {
    throw new Error(`No session for ${provider}`)
  }

  return { jar, session, loginBody }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const runId = Date.now().toString().slice(-8)
  const borrowerName = `Smoke Borrower ${runId}`
  const cosignerName = `Smoke Cosigner ${runId}`
  const nowIso = new Date().toISOString()
  const oneYearAgoIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

  const admin = await login('admin', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  assert(admin.session.user.role === 'admin', 'Admin session role mismatch')

  const createBorrowerRes = await request(admin.jar, '/api/members', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      legalName: borrowerName,
      joinDate: nowIso,
      status: 'Active',
      email: `smoke-borrower-${runId}@example.com`,
      beneficiary: 'Smoke Test Beneficiary',
      notes: 'Automated smoke test borrower',
    }),
  })
  const borrower = await json(createBorrowerRes)
  assert(createBorrowerRes.status === 201, `Borrower create failed: ${createBorrowerRes.status} ${JSON.stringify(borrower)}`)

  const createCosignerRes = await request(admin.jar, '/api/members', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      legalName: cosignerName,
      joinDate: nowIso,
      status: 'Active',
      email: `smoke-cosigner-${runId}@example.com`,
      notes: 'Automated smoke test cosigner',
    }),
  })
  const cosigner = await json(createCosignerRes)
  assert(createCosignerRes.status === 201, `Cosigner create failed: ${createCosignerRes.status} ${JSON.stringify(cosigner)}`)

  const setPasswordRes = await request(admin.jar, `/api/members/${borrower.id}/set-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      password: MEMBER_PASSWORD,
      enabled: true,
    }),
  })
  const passwordResult = await json(setPasswordRes)
  assert(setPasswordRes.ok, `Set member password failed: ${setPasswordRes.status} ${JSON.stringify(passwordResult)}`)
  assert(passwordResult.portalEnabled === true, 'Member portal was not enabled')

  const borrowerFixtureRes = await request(admin.jar, `/api/members/${borrower.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      joinDate: oneYearAgoIso,
      monthsActive: 12,
      eligible: 'YES',
      thisMonth: 'NOT PAID',
    }),
  })
  const borrowerFixture = await json(borrowerFixtureRes)
  assert(borrowerFixtureRes.ok, `Borrower fixture patch failed: ${borrowerFixtureRes.status} ${JSON.stringify(borrowerFixture)}`)

  const cosignerFixtureRes = await request(admin.jar, `/api/members/${cosigner.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      joinDate: oneYearAgoIso,
      monthsActive: 12,
      eligible: 'YES',
    }),
  })
  const cosignerFixture = await json(cosignerFixtureRes)
  assert(cosignerFixtureRes.ok, `Cosigner fixture patch failed: ${cosignerFixtureRes.status} ${JSON.stringify(cosignerFixture)}`)

  const contributionRes = await request(admin.jar, '/api/contributions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      memberId: borrower.id,
      paymentDate: nowIso,
      amount: 250,
      paymentMethod: 'Cash',
      receivedBy: 'Smoke Test',
      comments: 'Smoke contribution',
    }),
  })
  const contribution = await json(contributionRes)
  assert(contributionRes.status === 201, `Contribution failed: ${contributionRes.status} ${JSON.stringify(contribution)}`)

  const loanRes = await request(admin.jar, '/api/loans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      borrowerId: borrower.id,
      cosignerId: cosigner.id,
      loanDate: nowIso,
      loanAmount: 600,
      termMonths: 6,
      borrowerAddress: '123 Smoke St',
      borrowerCity: 'Tulsa',
      borrowerState: 'OK',
      notes: 'Smoke test loan',
    }),
  })
  const loan = await json(loanRes)
  assert(loanRes.status === 201, `Loan failed: ${loanRes.status} ${JSON.stringify(loan)}`)

  const paymentRes = await request(admin.jar, '/api/loan-payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      loanId: loan.loanId,
      paymentDate: nowIso,
      amount: 100,
      paymentMethod: 'Cash',
      receivedBy: 'Smoke Test',
      comments: 'Smoke repayment',
    }),
  })
  const payment = await json(paymentRes)
  assert(paymentRes.status === 201, `Loan payment failed: ${paymentRes.status} ${JSON.stringify(payment)}`)

  const fullExitRes = await request(admin.jar, '/api/withdrawals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      memberId: borrower.id,
      withdrawalDate: nowIso,
      amount: 25,
      type: 'Full Exit',
      processedBy: 'Smoke Test',
      reason: 'Should be blocked',
    }),
  })
  const fullExit = await json(fullExitRes)
  assert(fullExitRes.status === 409, `Full exit should be blocked, got ${fullExitRes.status} ${JSON.stringify(fullExit)}`)

  const member = await login('member', {
    memberId: borrower.id,
    password: MEMBER_PASSWORD,
  })
  assert(member.session.user.role === 'member', 'Member session role mismatch')

  const portalAgreementRes = await request(member.jar, `/api/agreements/${loan.agreementId}`)
  const portalAgreement = await json(portalAgreementRes)
  assert(portalAgreementRes.ok, `Portal agreement fetch failed: ${portalAgreementRes.status} ${JSON.stringify(portalAgreement)}`)

  const signAgreementRes = await request(member.jar, `/api/agreements/${loan.agreementId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      signerType: 'borrower',
      signatureText: borrowerName,
      borrowerAddress: '123 Smoke St',
      borrowerCity: 'Tulsa',
      borrowerState: 'OK',
    }),
  })
  const signedAgreement = await json(signAgreementRes)
  assert(signAgreementRes.ok, `Agreement signing failed: ${signAgreementRes.status} ${JSON.stringify(signedAgreement)}`)

  const dbBorrower = await prisma.member.findUnique({
    where: { id: borrower.id },
    select: {
      id: true,
      legalName: true,
      portalEnabled: true,
      contributions2026: true,
      overallContributions: true,
      thisMonth: true,
      currentLoanBalance: true,
      activeAsBorrower: true,
      activeAsCosigner: true,
      eligible: true,
    },
  })
  const dbLoan = await prisma.loan.findUnique({
    where: { loanId: loan.loanId },
    select: {
      loanId: true,
      totalPaid: true,
      balanceRemaining: true,
      status: true,
    },
  })
  const dbAgreement = await prisma.loanAgreement.findUnique({
    where: { agreementId: loan.agreementId },
    select: {
      agreementId: true,
      status: true,
      borrowerSignature: true,
      borrowerSignedAt: true,
      cosignerSignature: true,
      lenderSignature: true,
    },
  })

  assert(dbBorrower?.portalEnabled === true, 'Borrower portal should be enabled')
  assert(dbBorrower?.thisMonth === 'PAID', `Expected thisMonth=PAID, got ${dbBorrower?.thisMonth}`)
  assert((dbBorrower?.contributions2026 || 0) >= 250, 'Contribution total did not update')
  assert(dbLoan?.balanceRemaining === 500, `Expected balanceRemaining=500, got ${dbLoan?.balanceRemaining}`)
  assert(dbLoan?.totalPaid === 100, `Expected totalPaid=100, got ${dbLoan?.totalPaid}`)
  assert(dbAgreement?.status === 'borrower_signed', `Expected agreement status borrower_signed, got ${dbAgreement?.status}`)
  assert(!!dbAgreement?.borrowerSignature, 'Borrower signature missing')

  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    borrower: dbBorrower,
    cosigner: { id: cosigner.id, legalName: cosigner.legalName },
    contributionId: contribution.transactionId,
    loan: dbLoan,
    paymentId: payment.paymentId,
    blockedFullExit: fullExit,
    agreement: dbAgreement,
    createdRecords: {
      borrowerId: borrower.id,
      cosignerId: cosigner.id,
      loanId: loan.loanId,
      agreementId: loan.agreementId,
    },
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
