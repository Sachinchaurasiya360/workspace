# Nucleo Workspace — Implementation Task List

Gap analysis against *NUCLEO WORKSPACE — KEY PRODUCT FEATURES.docx*. Tick as each lands.

## Foundation
- [x] T1 — Schema: user phone, project members, MEETINGS KPI, approval request note, daily-log task updates, Lead + LeadActivity (one migration)
- [x] T2 — Fixes: new-member temp password shown to admin, project-page & comment access checks, admins complete tasks without approval
- [x] T3 — Toast notifications (sonner) on every form/action
- [x] T4 — Audit log helper written from every action (feeds activity feed + history)

## People
- [x] T5 — Profile page: view name/email/phone/role/access/joined, edit name & phone, change password
- [x] T6 — Team management: edit member (role, access, phone, founder, active), reset password

## Work
- [x] T7 — Tasks: assignee picker/reassign, All Tasks page with filters, overdue flags, task history
- [x] T8 — Projects: lead, members, start/due date, target month in form; project activity history
- [x] T9 — Kanban: drag-and-drop between columns, horizontal scroll on small screens

## Events
- [x] T10 — Discovery: search (name/city/venue/audience/highlights), filters (date/city/status), full event form, hide expired
- [x] T11 — Event alerts: upcoming events + registration deadlines, configurable window, on dashboard too
- [x] T12 — Event overview: mark Attended / Conducted (feeds KPIs)
- [x] T13 — Approvals: Discuss action, founder comment, requester note, full details, history

## Performance
- [x] T14 — KPIs: Meetings metric, period filter (today/week/month/quarter/year), role-based KPI sets, weights + weighted score
- [x] T15 — Daily updates: tasks worked on + status change, history view, admin team view
- [x] T16 — Dashboards: role-based, admin "View dashboard" mode, performance cards, deadlines/overdue, activity feed, charts

## Discovery & reporting
- [x] T17 — Global search (members, tasks, projects, events, leads)
- [x] T18 — Leads: CRUD, stages, owner, log calls/follow-ups/meetings against a lead
- [x] T19 — Reports page (admin) with charts

## Wrap-up
- [x] T20 — Type-check, lint, tests, production build

## Added during the work
- [x] Engineering access level (engineering dashboard, execution KPIs, no sales counters/leads)
- [x] Fixed-locale date formatting (en-IN / Asia/Kolkata) — fixes hydration mismatches
- [x] Password reset by an admin forces a new password even on a live session

## Audit fixes (29 Sep 2026)
- [x] Delete a team member (hand over tasks/leads/projects, name confirmation, history kept as "Deleted user")
- [x] Admin + Sales access level
- [x] KPI targets carry forward month to month; weekly target no longer doubled across a month boundary
- [x] "Tasks completed" counted by completion time (new completedAt), not last edit
- [x] All day/week/month boundaries in IST, regardless of server time zone
- [x] Free/paid detection: any amount (or no price) needs approval; legacy registration note used
- [x] Stale completion requests withdrawn automatically; approvals can't be double-decided
- [x] Task permissions: creator / project lead can edit; assignee can't delete others' tasks; read-only view otherwise
- [x] Tasks can only be filed under projects you lead or belong to
- [x] Password reset/change signs out other sessions; deactivated users signed out cleanly
- [x] Only founders manage founder status; last founder protected
- [x] Admins can edit/delete events; only admins + sales can add events; closed registrations blocked
- [x] Form state bugs (lead/task/project/KPI dialogs), notification panel, filters, search links, tile counts

## Remaining gaps closed (30 Sep 2026)
- [x] Separate participation (Registered → Attended) and execution (In plan → Conducted) per event, each timestamped
- [x] Events recorded in the daily update (attended / conducted today)
- [x] Leads linked to projects; follow-up tasks created from a lead
- [x] Month-by-month performance history (dashboard + reports)
- [x] Workspace activity feed for everyone (scoped by visibility) with Discussions filter
- [x] Live notifications (30s polling + toast)
- [x] CSV export of team performance and tasks

## Future
- Email notifications (approvals, invitations) — deferred; needs an email provider (e.g. Resend) + API key
