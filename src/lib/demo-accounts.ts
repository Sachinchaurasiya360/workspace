import type { AccessLevel } from "@prisma/client";

// TEMPORARY — testing only. One demo login per access level, shown on the
// login page and created by scripts/seed-demo-accounts.ts. Remove this file,
// the login page panel (src/app/(auth)/login/demo-logins.tsx) and the seed
// script before real use, and delete these users when the DB is cleaned.
export const DEMO_PASSWORD = "Demo@1234";

export const DEMO_ACCOUNTS: {
  name: string;
  email: string;
  role: string;
  access: AccessLevel;
  isFounder: boolean;
}[] = [
  { name: "Demo Founder", email: "demo.admin@nucleohq.com", role: "Founder", access: "ADMIN", isFounder: true },
  // Combined access levels are retired — see LEGACY_ACCESS_OPTIONS in access-labels.ts.
  // { name: "Demo Admin Task", email: "demo.admintask@nucleohq.com", role: "Operations lead", access: "ADMIN_TASK_BASED", isFounder: false },
  // { name: "Demo Admin Sales", email: "demo.adminsales@nucleohq.com", role: "Sales lead", access: "ADMIN_SALES_BASED", isFounder: false },
  { name: "Demo Sales", email: "demo.sales@nucleohq.com", role: "Sales executive", access: "SALES_BASED", isFounder: false },
  // { name: "Demo Sales Task", email: "demo.salestask@nucleohq.com", role: "Growth associate", access: "SALES_TASK_BASED", isFounder: false },
  { name: "Demo Task", email: "demo.task@nucleohq.com", role: "Associate", access: "TASK_BASED", isFounder: false },
  { name: "Demo Engineer", email: "demo.engineer@nucleohq.com", role: "Engineer", access: "ENGINEERING", isFounder: false },
];
