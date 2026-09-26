import { Member } from '../types';

export type DuesStatus = 'paid' | 'unpaid' | 'advance' | 'overdue' | 'n/a';

// Converts a member's Date of Registration ("MM/DD/YYYY") into a "YYYY-MM" key.
export function dorToMonthKey(dor: string | undefined): string | null {
  if (!dor) return null;
  const parts = dor.split('/');
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(year) || year < 2000) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Single source of truth for a member's dues status in a given month ("YYYY-MM").
// Rules:
// 1. An explicit record in member.payments always wins.
// 2. Months before the member's join date are not applicable ('n/a').
// 3. Months before 2025 are assumed settled (legacy history, not tracked month-by-month).
// 4. Jan-Aug 2025 default to paid (club's confirmed baseline for that period).
// 5. Sep 2025 onward defaults to unpaid until explicitly confirmed.
export function getDuesStatus(member: Member, monthKey: string): DuesStatus {
  const recorded = member.payments?.[monthKey];
  if (recorded) return recorded;

  const dorKey = dorToMonthKey(member.dor);
  if (dorKey && monthKey < dorKey) return 'n/a';

  if (member.status === 'overdue' && monthKey >= '2025-09') return 'overdue';

  if (monthKey < '2025-09') return 'paid';

  return 'unpaid';
}
