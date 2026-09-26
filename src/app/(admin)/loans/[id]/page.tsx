'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Card, LoanStatusBadge, Button, Spinner } from '@/components/ui'
import { fmt$, fmtDate } from '@/lib/utils'

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const [loan, setLoan] = useState<any>(null)

  useEffect(() => { fetch(`/api/loans/${id}`).then(r => r.json()).then(setLoan) }, [id])

  if (!loan) return <div className="p-8"><Spinner /></div>

  const pct = Math.round((loan.totalPaid / loan.loanAmount) * 100)

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/loans')}><ArrowLeft size={15} /> Back</Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{loan.loanId}</h1>
            <LoanStatusBadge status={loan.status} overdue={loan.overdue} />
          </div>
          <p className="text-sm text-gray-500">{loan.borrowerName} {loan.cosignerName ? `· Co-signer: ${loan.cosignerName}` : ''}</p>
        </div>
      </div>

      {/* Progress */}
      <Card className="p-5 mb-6">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-gray-500">Repayment progress</span>
          <span className="font-semibold">{pct}% paid</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
          <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><p className="text-xs text-gray-400">Loan amount</p><p className="text-lg font-bold text-gray-900">{fmt$(loan.loanAmount)}</p></div>
          <div><p className="text-xs text-gray-400">Total paid</p><p className="text-lg font-bold text-green-600">{fmt$(loan.totalPaid)}</p></div>
          <div><p className="text-xs text-gray-400">Balance remaining</p><p className="text-lg font-bold text-gray-900">{fmt$(loan.balanceRemaining)}</p></div>
        </div>
      </Card>

      {/* Details */}
      <Card className="p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            ['Loan date', fmtDate(loan.loanDate)],
            ['Term', `${loan.termMonths} months`],
            ['Monthly due', fmt$(loan.monthlyDue)],
            ['End date', fmtDate(loan.endDate)],
            ['Next due', fmtDate(loan.nextDueDate)],
            ['Borrower ID', loan.borrowerId],
            ['Co-signer', loan.cosignerName || '—'],
            ['Notes', loan.notes || '—'],
          ].map(([l, v]) => (
            <div key={l} className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-0.5">{l}</p>
              <p className="font-medium text-gray-900">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Payment history */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Payment history ({loan.payments?.length || 0})</h2>
        </div>
        {loan.payments?.length === 0
          ? <p className="py-10 text-center text-sm text-gray-400">No payments recorded yet.</p>
          : <div className="divide-y divide-gray-100">
            {loan.payments?.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.paymentId}</p>
                  <p className="text-xs text-gray-400">{fmtDate(p.paymentDate)} · {p.paymentMethod || '—'} {p.receivedBy ? `· ${p.receivedBy}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-700">{fmt$(p.amount)}</p>
                  {p.comments && <p className="text-xs text-gray-400">{p.comments}</p>}
                </div>
              </div>
            ))}
          </div>
        }
      </Card>
    </div>
  )
}
