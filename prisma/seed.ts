import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function upsertUser(data: {
  name: string;
  email: string;
  role: string;
  isFounder: boolean;
  access: "TASK_BASED" | "SALES_BASED" | "ADMIN" | "ADMIN_TASK_BASED" | "SALES_TASK_BASED";
}) {
  const passwordHash = await bcrypt.hash("nucleo123", 12);
  return db.user.upsert({
    where: { email: data.email },
    update: {},
    create: { ...data, passwordHash, mustChangePassword: true },
  });
}

async function main() {
  await upsertUser({
    name: "Neel",
    email: "neel@nucleohq.com",
    role: "Founder",
    isFounder: true,
    access: "ADMIN",
  });

  await upsertUser({
    name: "Prasad",
    email: "prasad@nucleohq.com",
    role: "Venture Success Associate",
    isFounder: false,
    access: "SALES_BASED",
  });

  await upsertUser({
    name: "Charulatha",
    email: "charulatha@nucleohq.com",
    role: "Business Operations Lead",
    isFounder: false,
    access: "ADMIN_TASK_BASED",
  });

  console.log("Seeded 3 users. Temp password for all: nucleo123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
