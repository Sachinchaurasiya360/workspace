/**
 * TEMPORARY — creates one demo login per access level for testing, matching
 * the credentials listed on the login page (src/lib/demo-accounts.ts).
 * Re-running resets their password and clears the forced password change so
 * the shared credentials keep working after someone signs in.
 *
 * Run with: npx tsx scripts/seed-demo-accounts.ts
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo-accounts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const account of DEMO_ACCOUNTS) {
    await db.user.upsert({
      where: { email: account.email },
      update: { ...account, passwordHash, mustChangePassword: false },
      create: { ...account, passwordHash, mustChangePassword: false },
    });
  }
  console.log(`Seeded ${DEMO_ACCOUNTS.length} demo accounts. Password for all: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
