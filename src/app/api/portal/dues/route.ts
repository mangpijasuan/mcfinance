import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireMember } from '@/modules/auth'
import { memberDuesView } from '@/modules/contributions/views'

// The signed-in member's own dues: months paid, anything owed, receipts.
export async function GET() {
  const auth = await requireMember()
  if (auth.error) return auth.error
  return NextResponse.json(await memberDuesView(prisma, auth.principal.memberId))
}
