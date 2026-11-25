// The database itself protects the MC Points ledger (migration
// 20261125010000_rewards_ledger_protection): these tests go around the
// application, as a bug or a direct connection would.
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDatabase } from './helpers/db'
import { createBaseFixtures } from './helpers/factories'
import { staffId, TEST_IDS } from './helpers/actors'

const maker = staffId('finance')
const checker = staffId('treasurer')
const entry = (over: Record<string, unknown> = {}) => ({
  memberId: TEST_IDS.member, points: 10, reference: `r-${Math.random()}`, reason: 'Event', actorId: maker, approvedBy: checker, ...over,
})

beforeEach(async () => {
  await resetDatabase()
  await createBaseFixtures()
})

describe('the rewards table', () => {
  it('can be added to, but never changed, removed or emptied', async () => {
    const row = await prisma.rewardEntry.create({ data: entry() })
    await expect(prisma.rewardEntry.update({ where: { id: row.id }, data: { points: 999 } })).rejects.toThrow(/append-only/)
    await expect(prisma.rewardEntry.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE "RewardEntry" CASCADE')).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE "Member" CASCADE')).rejects.toThrow(/append-only/)
    expect(await prisma.rewardEntry.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ points: 10 })
  })

  it('holds the entry limits itself', async () => {
    for (const bad of [{ points: 1001 }, { points: -1001 }, { points: 0 }, { reference: '   ' }, { reference: 'x'.repeat(101) }, { reason: ' ' }, { reason: 'y'.repeat(301) }]) {
      await expect(prisma.rewardEntry.create({ data: entry(bad) }), JSON.stringify(bad).slice(0, 40)).rejects.toThrow()
    }
    expect(await prisma.rewardEntry.count()).toBe(0)
  })

  it('keeps each member’s balance between 0 and 1,000,000 points, even with entries made at once', async () => {
    await expect(prisma.rewardEntry.create({ data: entry({ points: -1 }) })).rejects.toThrow(/balance must stay/)
    for (let i = 0; i < 1000; i++) await prisma.rewardEntry.create({ data: entry({ points: 1000, reference: `fill-${i}` }) })
    await expect(prisma.rewardEntry.create({ data: entry({ points: 1 }) })).rejects.toThrow(/balance must stay/)
    await prisma.rewardEntry.create({ data: entry({ points: -1000, reference: 'back' }) })
    // Two entries at once against 1,000 points of room: only one fits.
    const results = await Promise.allSettled([
      prisma.rewardEntry.create({ data: entry({ points: 1000, reference: 'race-1' }) }),
      prisma.rewardEntry.create({ data: entry({ points: 1000, reference: 'race-2' }) }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await prisma.rewardEntry.aggregate({ where: { memberId: TEST_IDS.member }, _sum: { points: true } }))._sum.points).toBe(1_000_000)
    // Another member's balance is unaffected.
    await prisma.rewardEntry.create({ data: entry({ memberId: TEST_IDS.otherMember, points: 5 }) })
  }, 120_000)

  it('needs real staff accounts, and never the same person as maker and checker', async () => {
    await expect(prisma.rewardEntry.create({ data: entry({ actorId: 'nobody' }) })).rejects.toThrow()
    await expect(prisma.rewardEntry.create({ data: entry({ approvedBy: 'nobody' }) })).rejects.toThrow()
    await expect(prisma.rewardEntry.create({ data: entry({ approvedBy: maker }) })).rejects.toThrow()
  })
})
