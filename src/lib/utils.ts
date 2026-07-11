import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtDateInput(d: Date | string | null | undefined) {
  if (!d) return ''
  return new Date(d).toISOString().split('T')[0]
}

export function monthYearOptions() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const year = new Date().getFullYear()
  return months.map(m => `${m}-${year}`)
}
