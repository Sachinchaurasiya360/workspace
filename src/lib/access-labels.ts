import type { AccessLevel } from "@prisma/client";

// Client-safe labels for access levels — shared by the team page, member
// dialogs and the profile page.
//
// Only these single-purpose access levels can be assigned to members.
export const ACCESS_OPTIONS: { value: AccessLevel; label: string; description: string }[] = [
  { value: "TASK_BASED", label: "Task based", description: "Tasks and projects" },
  { value: "SALES_BASED", label: "Sales based", description: "Sales KPIs, daily activity and leads" },
  { value: "ENGINEERING", label: "Engineering", description: "Engineering tasks, projects and delivery" },
  { value: "ADMIN", label: "Admin", description: "Organisation-wide oversight only" },
];

// Combined access levels are retired — no longer offered when adding or
// editing a member. They stay in the enum (and here, for labels) so existing
// users who already have one keep working until they're moved to a single type.
export const LEGACY_ACCESS_OPTIONS: { value: AccessLevel; label: string; description: string }[] = [
  { value: "SALES_TASK_BASED", label: "Sales + Task based", description: "Sales KPIs plus tasks and projects" },
  { value: "ADMIN_TASK_BASED", label: "Admin + Task based", description: "Oversight plus own tasks and projects" },
  { value: "ADMIN_SALES_BASED", label: "Admin + Sales based", description: "Oversight plus own sales KPIs and leads" },
];

export const ALL_ACCESS_OPTIONS = [...ACCESS_OPTIONS, ...LEGACY_ACCESS_OPTIONS];

export const ASSIGNABLE_ACCESS = new Set<AccessLevel>(ACCESS_OPTIONS.map((o) => o.value));

export const ACCESS_LABEL = Object.fromEntries(ALL_ACCESS_OPTIONS.map((o) => [o.value, o.label])) as Record<
  AccessLevel,
  string
>;
