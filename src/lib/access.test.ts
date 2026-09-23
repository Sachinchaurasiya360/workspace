import { describe, expect, it } from "vitest";

import {
  ForbiddenError,
  assertDashboardAccess,
  assertEventOverviewAccess,
  assertIsAdmin,
  assertProjectAccess,
  assertTaskAccess,
  canManageAll,
} from "@/lib/access";

const admin = { id: "admin-1", isFounder: false, access: "ADMIN" as const };
const founder = { id: "founder-1", isFounder: true, access: "TASK_BASED" as const };
const member = { id: "member-1", isFounder: false, access: "TASK_BASED" as const };
const otherMember = { id: "member-2", isFounder: false, access: "TASK_BASED" as const };

describe("canManageAll", () => {
  it("is true for admin access", () => {
    expect(canManageAll(admin)).toBe(true);
  });
  it("is true for founders regardless of access level", () => {
    expect(canManageAll(founder)).toBe(true);
  });
  it("is true for ADMIN_TASK_BASED access", () => {
    expect(canManageAll({ id: "x", isFounder: false, access: "ADMIN_TASK_BASED" })).toBe(true);
  });
  it("is false for a plain task-based member", () => {
    expect(canManageAll(member)).toBe(false);
  });
  it("is false for sales-based access", () => {
    expect(canManageAll({ id: "x", isFounder: false, access: "SALES_BASED" })).toBe(false);
  });
});

describe("assertTaskAccess", () => {
  it("allows the task's own assignee", () => {
    expect(() => assertTaskAccess(member, { assigneeId: member.id })).not.toThrow();
  });
  it("allows an admin to access anyone's task", () => {
    expect(() => assertTaskAccess(admin, { assigneeId: member.id })).not.toThrow();
  });
  it("allows a founder to access anyone's task", () => {
    expect(() => assertTaskAccess(founder, { assigneeId: member.id })).not.toThrow();
  });
  it("blocks a member from another member's task", () => {
    expect(() => assertTaskAccess(member, { assigneeId: otherMember.id })).toThrow(ForbiddenError);
  });
});

describe("assertProjectAccess", () => {
  it("allows the project lead", () => {
    expect(() => assertProjectAccess(member, { leadId: member.id })).not.toThrow();
  });
  it("blocks a non-lead, non-admin member", () => {
    expect(() => assertProjectAccess(member, { leadId: otherMember.id })).toThrow(ForbiddenError);
  });
  it("blocks everyone (including admins) when leadId is null, unless admin", () => {
    expect(() => assertProjectAccess(member, { leadId: null })).toThrow(ForbiddenError);
    expect(() => assertProjectAccess(admin, { leadId: null })).not.toThrow();
  });
});

describe("assertEventOverviewAccess", () => {
  it("allows the entry's own owner", () => {
    expect(() => assertEventOverviewAccess(member, { userId: member.id })).not.toThrow();
  });
  it("blocks a different member", () => {
    expect(() => assertEventOverviewAccess(member, { userId: otherMember.id })).toThrow(ForbiddenError);
  });
});

describe("assertDashboardAccess", () => {
  it("allows viewing your own dashboard", () => {
    expect(() => assertDashboardAccess(member, member.id)).not.toThrow();
  });
  it("blocks viewing another member's dashboard", () => {
    expect(() => assertDashboardAccess(member, otherMember.id)).toThrow(ForbiddenError);
  });
  it("allows an admin to view anyone's dashboard", () => {
    expect(() => assertDashboardAccess(admin, otherMember.id)).not.toThrow();
  });
});

describe("assertIsAdmin", () => {
  it("passes for admin/founder", () => {
    expect(() => assertIsAdmin(admin)).not.toThrow();
    expect(() => assertIsAdmin(founder)).not.toThrow();
  });
  it("throws for a regular member", () => {
    expect(() => assertIsAdmin(member)).toThrow(ForbiddenError);
  });
});
