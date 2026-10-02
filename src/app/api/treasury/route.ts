import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/modules/auth'
import { treasuryPosition } from '@/modules/treasury'

// The cash position, the minimum reserve and the lending capacity (Gate #1 A10).
export async function GET() {
  const auth = await requirePermission('treasury.read')
  if (auth.error) return auth.error
  return NextResponse.json(await treasuryPosition(prisma))
}
