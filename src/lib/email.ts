// Email sending via Resend (https://resend.com — free tier: 3,000/month)
// Set RESEND_API_KEY in your .env file

import { APP_NAME, SUPPORT_EMAIL } from './brand'

const RESEND_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM || `${APP_NAME} <noreply@your-domain.example>`

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: 'RESEND_API_KEY not set in .env' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })
    if (!res.ok) {
      const err = await res.json()
      return { ok: false, error: err.message || 'Send failed' }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

// ── Templates ─────────────────────────────────────────────────────────────

function baseLayout(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f4f6fa; color:#1a1a1a; }
  .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
  .hdr  { background:#1B2A4A; padding:24px 32px; }
  .hdr h1 { margin:0; color:#fff; font-size:18px; font-weight:700; }
  .hdr p  { margin:4px 0 0; color:rgba(255,255,255,.6); font-size:13px; }
  .body { padding:28px 32px; }
  .body p { margin:0 0 16px; font-size:15px; line-height:1.6; color:#333; }
  .stat-row { display:flex; gap:12px; margin:20px 0; }
  .stat { flex:1; background:#f4f6fa; border-radius:8px; padding:14px 16px; }
  .stat .label { font-size:11px; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:.5px; }
  .stat .value { font-size:20px; font-weight:700; color:#1B2A4A; margin-top:4px; }
  .pill-green { display:inline-block; background:#d6f0d6; color:#1e6b1e; border-radius:100px; padding:3px 10px; font-size:12px; font-weight:600; }
  .pill-red   { display:inline-block; background:#fddede; color:#b22222; border-radius:100px; padding:3px 10px; font-size:12px; font-weight:600; }
  .pill-amber { display:inline-block; background:#fff3cc; color:#8b6000; border-radius:100px; padding:3px 10px; font-size:12px; font-weight:600; }
  .btn { display:inline-block; background:#1B2A4A; color:#fff; text-decoration:none; padding:11px 24px; border-radius:8px; font-size:14px; font-weight:600; margin-top:8px; }
  .divider { border:none; border-top:1px solid #eee; margin:20px 0; }
  .footer { padding:16px 32px; background:#f9fafb; text-align:center; font-size:12px; color:#aaa; }
  table { width:100%; border-collapse:collapse; margin:16px 0; }
  th { text-align:left; font-size:11px; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:.5px; padding:8px 12px; background:#f9fafb; }
  td { padding:10px 12px; font-size:14px; border-bottom:1px solid #f0f0f0; }
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>${APP_NAME}</h1><p>Financial Services</p></div>
  <div class="body">${content}</div>
  <div class="footer">${APP_NAME} · ${SUPPORT_EMAIL}</div>
</div></body></html>`
}

export function contributionReminderEmail(member: { legalName: string; id: string; monthsActive: number; archiveLifetime: number }) {
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const html = baseLayout(`
    <p>Hi <strong>${esc(member.legalName)}</strong>,</p>
    <p>This is a friendly reminder that your <strong>${esc(month)}</strong> contribution of <strong>$20</strong> is due.</p>
    <div class="stat-row">
      <div class="stat"><div class="label">Member ID</div><div class="value" style="font-size:15px">${esc(member.id)}</div></div>
      <div class="stat"><div class="label">Months active</div><div class="value">${member.monthsActive}</div></div>
      <div class="stat"><div class="label">Lifetime total</div><div class="value">$${member.archiveLifetime.toLocaleString()}</div></div>
    </div>
    <p>Please submit your payment to your collector as soon as possible to stay in good standing.</p>
    <p>Payment methods: <strong>Cash · Online · Zelle · Venmo · Auto-pay</strong></p>
    <hr class="divider">
    <p style="font-size:13px;color:#888">Questions? Contact your club admin.</p>
  `)
  return {
    subject: `[${APP_NAME}] ${month} contribution reminder - ${member.id}`,
    html,
  }
}

export function loanOverdueEmail(member: { legalName: string; id: string }, loan: { loanId: string; balanceRemaining: number; monthlyDue: number; nextDueDate: Date | null }) {
  const dueDate = loan.nextDueDate ? new Date(loan.nextDueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'overdue'
  const html = baseLayout(`
    <p>Hi <strong>${esc(member.legalName)}</strong>,</p>
    <p>Your loan payment for <span class="pill-red">Loan ${esc(loan.loanId)}</span> is <strong>overdue</strong>.</p>
    <div class="stat-row">
      <div class="stat"><div class="label">Monthly due</div><div class="value">$${loan.monthlyDue.toFixed(2)}</div></div>
      <div class="stat"><div class="label">Balance remaining</div><div class="value">$${loan.balanceRemaining.toLocaleString()}</div></div>
    </div>
    <p>The payment was due on <strong>${esc(dueDate)}</strong>. Please make your payment as soon as possible to avoid penalties.</p>
    <p>Contact your club admin to arrange payment.</p>
    <hr class="divider">
    <p style="font-size:13px;color:#888">Member ID: ${esc(member.id)} · Loan: ${esc(loan.loanId)}</p>
  `)
  return {
    subject: `[${APP_NAME}] Loan payment overdue - ${loan.loanId}`,
    html,
  }
}

export function adminSummaryEmail(stats: {
  activeMembers: number; totalContributions: number; unpaidThisMonth: number;
  activeLoans: number; overdueLoans: number; outstandingBalance: number;
  month: string; recentContribs: { memberName: string; amount: number; monthYear: string }[]
}) {
  const rows = stats.recentContribs.slice(0, 8).map(c =>
    `<tr><td>${esc(c.memberName)}</td><td>${esc(c.monthYear)}</td><td><strong>$${c.amount}</strong></td></tr>`
  ).join('')

  const html = baseLayout(`
    <p><strong>${stats.month} Summary</strong></p>
    <div class="stat-row">
      <div class="stat"><div class="label">Active members</div><div class="value">${stats.activeMembers}</div></div>
      <div class="stat"><div class="label">Contributions</div><div class="value">$${stats.totalContributions.toLocaleString()}</div></div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Unpaid this month</div><div class="value" style="color:#b22222">${stats.unpaidThisMonth}</div></div>
      <div class="stat"><div class="label">Overdue loans</div><div class="value" style="color:${stats.overdueLoans > 0 ? '#b22222' : '#1e6b1e'}">${stats.overdueLoans}</div></div>
      <div class="stat"><div class="label">Outstanding</div><div class="value">$${stats.outstandingBalance.toLocaleString()}</div></div>
    </div>
    ${rows ? `<table><tr><th>Member</th><th>Month</th><th>Amount</th></tr>${rows}</table>` : ''}
    <hr class="divider">
    <p style="font-size:13px;color:#888">This is an automated summary from your ${APP_NAME} administration system.</p>
  `)
  return {
    subject: `[${APP_NAME}] ${stats.month} admin summary`,
    html,
  }
}

export { sendEmail, esc as escapeHtml }
