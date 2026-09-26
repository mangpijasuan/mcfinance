import { PrismaClient } from '@prisma/client'

// Money is stored as BigInt cents in the new tables. JSON has no BigInt,
// so a row returned as-is by a route would throw; serialise BigInts as
// strings (lossless), as the Prisma documentation recommends. Routes that
// show money build explicit views with numbers (see src/lib/money).
declare global {
  interface BigInt {
    toJSON(): string
  }
}
if (!Object.prototype.hasOwnProperty.call(BigInt.prototype, 'toJSON')) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value(this: bigint) { return this.toString() },
    writable: true,
    configurable: true,
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
