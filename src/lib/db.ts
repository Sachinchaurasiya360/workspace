import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Uses the `pg` driver adapter rather than Prisma's native Rust query engine.
// On this machine the native engine binaries cannot reach the network (a
// local Windows firewall/AV restriction on the unrecognized .exe, confirmed
// via direct TCP/TLS/pg tests that all succeed independently) — the adapter
// routes all queries through the already-working `pg` driver instead.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
