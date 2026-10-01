import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { clubDuesReport } from '@/modules/contributions/views'

// Collection by month and members in arrears (amounts in cents).
export async function GET() {
  const auth = await requirePermission('contributions.read')
  if (auth.error) return auth.error
  return NextResponse.json(await clubDuesReport(prisma))
}
