/**
 * NUCLEO WORK MANAGEMENT APP
 * SINGLE-SOURCE-OF-TRUTH BACKEND
 *
 * IMPORTANT:
 * - This code NEVER creates new Google Sheet tabs.
 * - It NEVER creates Nucleo Comments, Activity Log, Audit, Notifications, or Users tabs.
 * - Allowed existing tabs only:
 *     Events, Event Overview, Approvals, Task Mastersheet,
 *     Team Role, Project Master sheet, Daily logs, KPI Targets (optional).
 * - Comments are stored in Task Mastersheet column "Approval / Notes".
 * - Daily activity is stored in Daily logs.
 *
 * PRODUCTION: bind this script to the NEW live spreadsheet (Extensions → Apps Script
 * on that workbook), or set CONFIG.PRODUCTION_SPREADSHEET_ID. Do not point this copy
 * at the sample/dev workbooks.
 */

const CONFIG = {
  /* Blank = use the spreadsheet this Apps Script project is bound to.
     Set only for a standalone script. Never the sample/dev workbook IDs. */
  PRODUCTION_SPREADSHEET_ID: '',
  /* Independent archive workbook (Events tab). Blank = skip archival until set.
     Never the sample/dev archive workbook. */
  ARCHIVE_SPREADSHEET_ID: ''
};

const SPREADSHEET_ID = CONFIG.PRODUCTION_SPREADSHEET_ID;
const ARCHIVE_SPREADSHEET_ID = CONFIG.ARCHIVE_SPREADSHEET_ID;

const ALLOWED_TAB_ALIASES = {
  tasks: ['task mastersheet', 'task master sheet', 'task tracker', 'nucleohq — task tracker'],
  projects: ['project master sheet', 'project mastersheet', 'project master'],
  team: ['team role', 'team roles'],
  dailyLogs: ['daily logs', 'daily log'],
  events: ['events'],
  approvals: ['approvals', 'approval'],
  eventOverview: ['event overview'],
  kpiTargets: ['kpi targets', 'kpi target'],
  comments: ['nucleo comments', 'comments']
};

const FORBIDDEN_TAB_NAMES = [
  'activity log', 'activity logs',
  'nucleo activity log', 'nuclear activity log', 'audit log',
  'notifications', 'users', 'organizations', 'sales activities'
];

/**
 * Identity is resolved from the signed-in / entered email against Team Role.
 * Team Role is the only user directory. No default person and no sample emails.
 */
const DEFAULT_USER_NAME = '';

const PHASE1_SINGLE_USER_MODE = false;
const PHASE1_TEST_EMAIL = '';
const PHASE1_TEST_NAME = '';

/* Optional override if Team Role has no Email column. Leave blank in production;
   founders/admins are read from Team Role. */
const APPROVAL_EMAIL = '';
const FOUNDER_APPROVAL_EMAILS = [
  'vittal@nucleohq.com',
  'neel@nucleohq.com'
];
const APPROVAL_SECRET_PROPERTY = 'NUCLEO_APPROVAL_SECRET';
const EVENTS_KEEP_RECENT_DAYS = 30;
var REQUEST_CACHE = {sheets:{},tables:{},headers:{},headerRows:{}};
var REQUEST_CLAIMED_EMAIL = '';

const TABLES = {
  tasks: {
    required: ['Task Description', 'Linked Project Name', 'Assignee', 'Status'],
    optional: ['Priority', 'Due Date', 'Approval / Notes', 'Description', 'Created By', 'Task']
  },
  projects: {
    required: ['Project Name', 'Lead'],
    optional: ['Project ID', 'Department / Workstream', 'Overall Status', 'Target Month', 'Progress %']
  },
  team: {
    required: ['Name', 'Role'],
    optional: ['Notes', 'Email', 'Access', 'E-mail']
  },
  dailyLogs: {
    required: ['Timestamp', 'Team Member'],
    optional: ['Calls Made', 'Follow-ups', 'Deals Closed', 'Meetings', 'Activities Done', 'Event Selection / Custom', 'Outbound Reach', 'Discovery & Demos', 'Profiles & Signups']
  },
  events: {
    required: ['City', 'Event Name', 'Date'],
    optional: ['Timestamp', 'Time', 'Venue', 'Registration Status', 'Registration Deadline', 'Target Audience', 'Key Highlights', 'Price', 'Link']
  },
  approvals: {
    required: ['Approval ID', 'Requested By', 'Status'],
    optional: ['Event Name', 'Approved By', 'Request Type', 'Task ID', 'Task Row', 'Task Description', 'Project', 'Comment']
  },
  eventOverview: {
    required: ['Team Member', 'Event Name', 'Status'],
    optional: ['Date', 'City', 'Link', 'Time', 'Venue', 'Notes']
  },
  kpiTargets: {
    required: ['Team Member', 'KPI', 'Target'],
    optional: ['Period', 'Weight']
  },
  comments: {
    required: ['Comment ID', 'Entity Type', 'Entity ID', 'User', 'User Email', 'Comment', 'Created At', 'Updated At'],
    optional: ['Entity Row']
  }
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.approvalAction && params.approvalId && params.token) {
    return handleApprovalAction(params.approvalId, params.approvalAction, params.token);
  }

  var output;
  var names = ['index', 'Index', 'index.html', 'Index.html'];
  var lastError = '';
  for (var i = 0; i < names.length; i++) {
    try {
      output = HtmlService.createHtmlOutputFromFile(names[i]);
      break;
    } catch (err) {
      lastError = String(err && err.message ? err.message : err);
    }
  }
  if (!output) {
    output = HtmlService.createHtmlOutput(
      '<div style="font-family:Arial;padding:40px;background:#070b16;color:#fff">' +
      '<h2>Nucleo could not find the HTML file.</h2>' +
      '<p>In Apps Script the HTML file must be named <b>index</b> (left sidebar). Last error: ' +
      String(lastError).replace(/</g,'') + '</p></div>'
    );
  }
  return output
    .setTitle('Nucleo Work Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function getDatabase() {
  const configured = String(CONFIG.PRODUCTION_SPREADSHEET_ID || SPREADSHEET_ID || '').trim();
  if (configured) return SpreadsheetApp.openById(configured);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error(
    'The production Google Sheet could not be opened. ' +
    'Bind this Apps Script to the live workbook, or set CONFIG.PRODUCTION_SPREADSHEET_ID. ' +
    'No new spreadsheet or tab was created.'
  );
}

function sheetNameKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isForbiddenSheet(sheet) {
  const key = sheetNameKey(sheet.getName());
  return FORBIDDEN_TAB_NAMES.indexOf(key) >= 0;
}

/**
 * Finds an existing tab by alias, then by header fingerprint.
 * Scans the first 8 rows so title rows (Task Mastersheet) do not break loading.
 * NEVER creates a tab.
 */
function jsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
}

function writeOk(extra) {
  extra = extra || {};
  extra.ok = true;
  extra.reload = false;
  return jsonSafe(extra);
}

function appendRowsAtomic(sheet, values) {
  if (!values || !values.length) return sheet.getLastRow();
  const width = values[0].length;
  const start = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(start, 1, values.length, width).setValues(values);
  return start;
}

function locateTable(tableKey) {
  if (REQUEST_CACHE.sheets[tableKey]) {
    return {
      sheet: REQUEST_CACHE.sheets[tableKey],
      headerRow: REQUEST_CACHE.headerRows[tableKey] || 1
    };
  }
  const spec = TABLES[tableKey];
  if (!spec) throw new Error('Unknown table: ' + tableKey);

  const ss = getDatabase();
  const aliases = ALLOWED_TAB_ALIASES[tableKey] || [];
  const sheets = ss.getSheets();
  const named = [];
  const others = [];

  sheets.forEach(sheet => {
    if (isForbiddenSheet(sheet)) return;
    const nameKey = sheetNameKey(sheet.getName());
    const aliasHit = aliases.some(alias => nameKey === alias || nameKey.indexOf(alias) >= 0);
    if (aliasHit) named.push(sheet);
    else others.push(sheet);
  });

  const scanList = named.length ? named : others;
  const candidates = [];

  scanList.forEach(sheet => {
    const lc = Math.min(sheet.getLastColumn() || 0, 40);
    const lr = sheet.getLastRow();
    if (!lc || !lr) return;
    const scanRows = Math.min(8, lr);
    const block = sheet.getRange(1, 1, scanRows, lc).getDisplayValues();
    const nameKey = sheetNameKey(sheet.getName());
    const aliasHit = aliases.some(alias => nameKey === alias || nameKey.indexOf(alias) >= 0);

    for (let r = 0; r < block.length; r++) {
      const headers = block[r].map(normalizeHeader);
      const requiredMatches = spec.required.filter(h => headers.indexOf(normalizeHeader(h)) >= 0).length;
      const optionalMatches = spec.optional.filter(h => headers.indexOf(normalizeHeader(h)) >= 0).length;
      const headerScore = requiredMatches * 100 + optionalMatches;
      if (requiredMatches === spec.required.length || (aliasHit && requiredMatches >= Math.max(1, spec.required.length - 1))) {
        candidates.push({
          sheet: sheet,
          headerRow: r + 1,
          score: headerScore + (aliasHit ? 50 : 0) + (r === 0 ? 1 : 0)
        });
        break;
      }
    }
  });

  if (!candidates.length) {
    throw new Error(
      'Could not find the existing sheet for "' + tableKey +
      '". Create the tab yourself if it is missing. No new tab was created by the app.'
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  REQUEST_CACHE.sheets[tableKey] = winner.sheet;
  REQUEST_CACHE.headerRows[tableKey] = winner.headerRow;
  return winner;
}

function getTableSheet(tableKey) {
  return locateTable(tableKey).sheet;
}

function getHeaderRowNumber(tableKey, sheet) {
  if (REQUEST_CACHE.headerRows[tableKey]) return REQUEST_CACHE.headerRows[tableKey];
  return locateTable(tableKey).headerRow;
}

/**
 * Adds missing support columns onto EXISTING allowed sheets only.
 * Headers are written on the detected header row, never as a new tab.
 */
function ensureWorkspaceColumns() {
  const requirements = {
    tasks: ['Description', 'Created By'],
    approvals: ['Request Type', 'Task ID', 'Task Row', 'Task Description', 'Project', 'Comment'],
    dailyLogs: ['Outbound Reach', 'Discovery & Demos', 'Profiles & Signups']
  };

  Object.keys(requirements).forEach(key => {
    let located;
    try {
      located = locateTable(key);
    } catch (err) {
      return;
    }
    const sheet = located.sheet;
    const headerRow = located.headerRow;
    const existing = getHeaders(sheet, headerRow).map(normalizeHeader);
    requirements[key].forEach(header => {
      if (existing.indexOf(normalizeHeader(header)) >= 0) return;
      const nextCol = Math.max(sheet.getLastColumn(), 1) + 1;
      sheet.getRange(headerRow, nextCol).setValue(header);
      REQUEST_CACHE.headers[sheet.getSheetId()] = null;
      REQUEST_CACHE.tables[key] = null;
      existing.push(normalizeHeader(header));
    });
  });
}

function getTableData(tableKey) {
  if (REQUEST_CACHE.tables[tableKey]) return REQUEST_CACHE.tables[tableKey];
  const located = locateTable(tableKey);
  const sheet = located.sheet;
  const headerRow = located.headerRow;
  const lr = sheet.getLastRow();
  const lc = sheet.getLastColumn();
  const headers = getHeaders(sheet, headerRow);
  if (lr <= headerRow) {
    REQUEST_CACHE.tables[tableKey] = { sheet: sheet, headers: headers, rows: [], headerRow: headerRow, startRow: headerRow + 1 };
    return REQUEST_CACHE.tables[tableKey];
  }
  const values = sheet.getRange(headerRow, 1, lr - headerRow + 1, lc).getValues();
  REQUEST_CACHE.tables[tableKey] = {
    sheet: sheet,
    headers: values[0].map(v => String(v || '').trim()),
    rows: values.slice(1),
    headerRow: headerRow,
    startRow: headerRow + 1
  };
  return REQUEST_CACHE.tables[tableKey];
}

function tableRowNumber(table, index) {
  return (table.startRow || 2) + index;
}

function getHeaders(sheet, headerRow) {
  const key = sheet.getSheetId() + ':' + (headerRow || 1);
  if (REQUEST_CACHE.headers[key]) return REQUEST_CACHE.headers[key];
  if (!sheet.getLastColumn()) return [];
  const row = headerRow || 1;
  REQUEST_CACHE.headers[key] = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(v => String(v || '').trim());
  return REQUEST_CACHE.headers[key];
}

function tryTableData(tableKey) {
  try {
    return getTableData(tableKey);
  } catch (err) {
    return { sheet: null, headers: [], rows: [], headerRow: 1, startRow: 2, missing: true, error: err.message };
  }
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^e[- ]?mail$/i, 'email')
    .replace(/^task$/i, 'task description')
    .replace(/^task name$/i, 'task description')
    .replace(/^task title$/i, 'task description')
    .replace(/^assigned to$/i, 'assignee')
    .replace(/^linked project$/i, 'linked project name')
    .replace(/^project name$/i, 'linked project name')
    .replace(/^project\/category$/i, 'linked project name')
    .replace(/^registration$/i, 'registration status')
    .replace(/^deadline$/i, 'due date')
    .replace(/^comments\/notes$/i, 'approval / notes');
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (map[key] === undefined) {
      map[key] = index;
    } else if (map[key + ' 2'] === undefined) {
      map[key + ' 2'] = index;
    }
  });
  return map;
}

function col(map, name) {
  const index = map[normalizeHeader(name)];
  return index === undefined ? -1 : index;
}

function cell(row, map, name, fallback) {
  const index = col(map, name);
  if (index < 0) return fallback === undefined ? '' : fallback;
  const value = row[index];
  return value === null || value === undefined
    ? (fallback === undefined ? '' : fallback)
    : value;
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function cleanName(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function normalizeNameForMatch(value) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function taskTitleFromRow(row, map) {
  const names = ['Task Description', 'Task Name', 'Task Title', 'Task', 'Description'];
  for (let i = 0; i < names.length; i++) {
    const v = cleanName(cell(row, map, names[i], ''));
    if (v) return v;
  }
  return '';
}

function taskProjectFromRow(row, map) {
  const names = ['Linked Project Name', 'Linked Project', 'Project', 'Project Name'];
  for (let i = 0; i < names.length; i++) {
    const header = names[i];
    if (normalizeHeader(header) === 'project name' && col(map, 'Linked Project Name') >= 0) continue;
    const v = cleanName(cell(row, map, header, ''));
    if (v) return v;
  }
  return '';
}

function formatDate(value, pattern) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return text(value);
  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone(),
    pattern || 'dd-MMM-yyyy'
  );
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const raw = text(value);
  if (!raw) return null;

  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function serializeDate(value, pattern) {
  return value ? formatDate(value, pattern || 'dd-MMM-yyyy') : '';
}

function toISODate(value) {
  const d = toDate(value);
  if (!d) return '';
  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}

/* =========================
   CURRENT USER
   ========================= */

function getGoogleActiveEmail() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e1) { return ''; }
}

function getGoogleEffectiveEmail() {
  try { return String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (e2) { return ''; }
}

function takeClaimedEmail_(value) {
  if (value == null || value === '') return;
  if (typeof value === 'object') {
    value = value._asEmail || value.claimedEmail || '';
  }
  const s = normalizeEmailForMatch_(value);
  if (s) REQUEST_CLAIMED_EMAIL = s;
}

function rowEmail_(row, map) {
  return normalizeEmailForMatch_(cell(row, map, 'Email', ''));
}

function listWorkspacePeople() {
  return getTeam().map(m => ({
    name: m.name,
    role: m.role || 'Team Member',
    email: String(m.email || '').trim().toLowerCase(),
    access: m.access || ''
  })).filter(m => m.name);
}

function findTeamMemberByEmail_(email) {
  const wanted = normalizeEmailForMatch_(email);
  if (!wanted || wanted.indexOf('@') < 0) return null;
  const team = getTableData('team');
  const teamMap = buildHeaderMap(team.headers);
  for (let i = 0; i < team.rows.length; i++) {
    const rowEmail = rowEmail_(team.rows[i], teamMap);
    if (rowEmail && rowEmail === wanted) {
      return teamMemberFromRow(team.rows[i], teamMap, wanted);
    }
  }
  return null;
}

function getPing() {
  var email = getGoogleActiveEmail();
  var effective = getGoogleEffectiveEmail();
  var spreadsheet = '';
  try {
    var ss = getDatabase();
    spreadsheet = ss ? ss.getName() : '';
  } catch (e3) {}
  var matched = null;
  try {
    matched = email ? findTeamMemberByEmail_(email) : null;
  } catch (e4) {
    matched = null;
  }
  return jsonSafe({
    ok: true,
    build: 'I-20260820a',
    email: email,
    effectiveEmail: effective,
    identityLocked: !!(matched && matched.name),
    matchedName: matched ? matched.name : '',
    spreadsheet: spreadsheet
  });
}

function teamMemberFromRow(row, map, email) {
  return {
    email: email || text(cell(row, map, 'Email', '')),
    name: cleanName(cell(row, map, 'Name', '')),
    role: cleanName(cell(row, map, 'Role', '')) || 'Team Member',
    access: cleanName(cell(row, map, 'Access', '')) || ''
  };
}

function normalizeEmailForMatch_(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}
function getCurrentUser() {
  const active = normalizeEmailForMatch_(getGoogleActiveEmail());
  if (active) {
    const hit = findTeamMemberByEmail_(active);
    if (hit) return hit;
  }

  const claimed = normalizeEmailForMatch_(REQUEST_CLAIMED_EMAIL);
  if (claimed) {
    const byEmail = findTeamMemberByEmail_(claimed);
    if (byEmail) return byEmail;
    throw new Error('That email is not in Team Role. Use the exact E-mail from your row.');
  }

  if (active) {
    throw new Error(
      'Signed in as ' + active + ' but that address is not in Team Role column E-mail. ' +
      'Sign in with your NUCLEO organization email (for example neel@nucleohq.com).'
    );
  }

  throw new Error('NUCLEO_NEEDS_SIGNIN');
}

function signInWithTeamEmail(email) {
  try {
    const want = normalizeEmailForMatch_(email);
    if (!want || want.indexOf('@') < 0) {
      return jsonSafe({ ok: false, error: 'Enter your NUCLEO organization email.' });
    }
    const hit = findTeamMemberByEmail_(want);
    if (!hit) {
      return jsonSafe({ ok: false, error: 'That email is not in Team Role. Use the exact E-mail next to your name.' });
    }
    return jsonSafe({
      ok: true,
      email: String(hit.email || want).trim().toLowerCase(),
      name: hit.name,
      role: hit.role,
      access: hit.access || ''
    });
  } catch (err) {
    return jsonSafe({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Role-specific dashboard classification.
 *
 * ACCESS:
 * - admin: can view/edit/comment on any member dashboard.
 * - member: can view/edit/comment only on their own dashboard.
 *
 * DASHBOARD:
 * - founder: founder/admin overview.
 * - task: task/progress dashboard.
 * - sales: existing six-KPI sales dashboard.
 */
function parseAccessFlags(user) {
  const accessRaw = text(user && user.access).toLowerCase().replace(/\s+/g, ' ').trim();
  const role = text(user && user.role).toLowerCase().replace(/\s+/g, ' ').trim();
  const isFounder = /founder|co-founder|cofounder/.test(role);
  const isBusinessOpsLead =
    /business operations lead/.test(role) ||
    /business ops lead/.test(role) ||
    /business operation lead/.test(role);
  const hasAdmin = /\badmin\b/.test(accessRaw) || isFounder || isBusinessOpsLead;
  const hasSales = /sales/.test(accessRaw) || /deal based/.test(accessRaw) || /deal-based/.test(accessRaw);
  const hasTask = /task/.test(accessRaw);
  let sales = hasSales;
  let task = hasTask;
  let admin = hasAdmin;
  if (admin && !sales && !task) task = !isFounder;
  if (!admin && !sales && !task) {
    const roleLooksSales =
      /sales/.test(role) ||
      /business development/.test(role) ||
      /(^|[^a-z])bd([^a-z]|$)/.test(role) ||
      /account executive/.test(role) ||
      /revenue/.test(role) ||
      /inside sales/.test(role) ||
      /enterprise account/.test(role) ||
      /venture success/.test(role) ||
      /investor success/.test(role);
    sales = roleLooksSales;
    task = !roleLooksSales;
  }
  if (sales) task = true;
  return { admin: admin, sales: sales, task: task, isFounder: isFounder, isBusinessOpsLead: isBusinessOpsLead };
}

function getRoleProfile(user) {
  const flags = parseAccessFlags(user);
  const types = [];
  if (flags.admin) types.push('Admin');
  if (flags.sales) types.push('Sales');
  if (flags.task) types.push('Task');
  let dashboardType = 'task';
  if (flags.isFounder) dashboardType = 'founder';
  else if (flags.sales && !flags.admin) dashboardType = 'sales';
  else if (flags.admin) dashboardType = flags.isBusinessOpsLead ? 'task' : 'founder';
  return {
    access: flags.admin ? 'admin' : 'member',
    dashboardType: dashboardType,
    label: types.join(' + ') || 'Task Based',
    canViewAll: flags.admin === true,
    hasAdmin: flags.admin,
    hasSales: flags.sales,
    hasTask: flags.task,
    canOpenPersonalWorkspace: flags.admin && (flags.task || flags.sales)
  };
}

function canViewAll(user) {
  return getRoleProfile(user).canViewAll === true;
}

function getDashboardModeLabel(type) {
  if (type === 'founder') return 'Founder Overview';
  if (type === 'sales') return 'Sales Dashboard';
  return 'Task Dashboard';
}

function resolveDashboardUser(currentUser, requestedName) {
  if (!requestedName || !canViewAll(currentUser)) return currentUser;

  const match = getTeam().find(
    m => normalizeNameForMatch(m.name) === normalizeNameForMatch(requestedName)
  );

  return match
    ? {
        email: match.email || currentUser.email,
        name: match.name,
        role: match.role || 'Team Member',
        access: match.access || ''
      }
    : currentUser;
}

function getTeamDashboardOverview() {
  const team = getTeam();
  const taskTable = tryTableData('tasks');
  const taskMap = buildHeaderMap(taskTable.headers || []);

  const stats = {};
  team.forEach(member => {
    stats[normalizeNameForMatch(member.name)] = {
      total: 0,
      completed: 0
    };
  });

  taskTable.rows.forEach(row => {
    const assignee = cleanName(cell(row, taskMap, 'Assignee', ''));
    const key = normalizeNameForMatch(assignee);
    if (!key || !stats[key]) return;

    stats[key].total++;
    if (text(cell(row, taskMap, 'Status', '')).toLowerCase() === 'completed') {
      stats[key].completed++;
    }
  });

  let totalTasks = 0;
  let completedTasks = 0;

  const members = team.map(member => {
    const s = stats[normalizeNameForMatch(member.name)] || { total: 0, completed: 0 };
    const progress = s.total ? Math.round((s.completed / s.total) * 100) : 0;

    let status = 'No Tasks';
    let statusClass = 'neutral';

    if (s.total) {
      if (progress >= 65) {
        status = 'On Track';
        statusClass = 'success';
      } else if (progress >= 40) {
        status = 'Needs Focus';
        statusClass = 'warning';
      } else {
        status = 'At Risk';
        statusClass = 'danger';
      }
    }

    if (!/founder|co-founder|cofounder/i.test(text(member.role))) {
      totalTasks += s.total;
      completedTasks += s.completed;
    }

    return {
      id: member.id,
      name: member.name,
      role: member.role || 'Team Member',
      email: member.email || '',
      notes: member.notes || '',
      totalTasks: s.total,
      completedTasks: s.completed,
      progress: progress,
      status: status,
      statusClass: statusClass,
      dashboardType: getRoleProfile(member).dashboardType
    };
  });

  const overallProgress = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const onTrack = members.filter(m => m.status === 'On Track').length;
  const needsFocus = members.filter(m => m.status === 'Needs Focus').length;
  const atRisk = members.filter(m => m.status === 'At Risk').length;

  return {
    members: members,
    overallProgress: overallProgress,
    totalTasks: totalTasks,
    completedTasks: completedTasks,
    onTrack: onTrack,
    needsFocus: needsFocus,
    atRisk: atRisk
  };
}

function periodRange(period) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start = new Date(0);
  const p = String(period || 'month').toLowerCase();
  if (p === 'week') {
    start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (p === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (p === 'quarter') {
    const q = Math.floor(end.getMonth() / 3) * 3;
    start = new Date(end.getFullYear(), q, 1);
  } else if (p === 'year') {
    start = new Date(end.getFullYear(), 0, 1);
  }
  return { start: start, end: end, key: p };
}

function inPeriod(value, range) {
  if (!range || range.key === 'all') return true;
  const d = toDate(value);
  if (!d) return false;
  return d.getTime() >= range.start.getTime() && d.getTime() <= range.end.getTime();
}

function previousPeriodRange(range) {
  const span = Math.max(1, range.end.getTime() - range.start.getTime());
  return {
    start: new Date(range.start.getTime() - span),
    end: new Date(range.start.getTime() - 1),
    key: 'prev'
  };
}

function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function readDailyLogNumeric(row, map, names) {
  let fallback = null;
  const seen = {};
  for (let i = 0; i < names.length; i++) {
    const idx = col(map, names[i]);
    if (idx < 0 || seen[idx]) continue;
    seen[idx] = true;
    const v = numberValue(cell(row, map, names[i], 0));
    if (fallback == null) fallback = v;
    if (v) return v;
  }
  return fallback;
}

function getAllDailyLogRows() {
  const table = tryTableData('dailyLogs');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);
  return table.rows.map(row => {
    const meetingsRaw = cell(row, map, 'Meetings', cell(row, map, 'Event Selection / Custom', ''));
    const outbound = readDailyLogNumeric(row, map, ['Outbound Reach', 'Outbound Reach / Calls', 'Calls Made']);
    const demosDedicated = readDailyLogNumeric(row, map, ['Discovery & Demos', 'Discovery and Demos', 'Demos']);
    const profiles = readDailyLogNumeric(row, map, ['Profiles & Signups', 'Profiles and Signups', 'Follow-ups']);
    const deals = readDailyLogNumeric(row, map, ['Deals Closed']);
    const meetingCount = numberValue(meetingsRaw);
    const demos = demosDedicated == null ? meetingCount : (demosDedicated || meetingCount);
    return {
      timestamp: cell(row, map, 'Timestamp', ''),
      member: cleanName(cell(row, map, 'Team Member', '')),
      outbound: outbound == null ? 0 : outbound,
      demos: (demosDedicated == null ? numberValue(meetingsRaw) : demosDedicated) || numberValue(meetingsRaw),
      profiles: profiles == null ? 0 : profiles,
      deals: deals == null ? 0 : deals,
      meetings: cleanName(meetingsRaw)
    };
  }).filter(r => r.member);
}

/**
 * Organization-wide founder/admin aggregation.
 * One pass over Team Role, Task Mastersheet, Event Overview, Daily logs, Projects.
 * Overall progress = completed tasks / all tasks across non-founder members (not the founder row).
 * Pipeline stages are summed from sales-access daily logs (no extra CRM tab):
 *   Contacted = outbound/calls, Profiled = profiles/signups,
 *   Signed = discovery/demos, Closed = deals closed,
 *   Active = max(0, profiled - closed).
 */
function buildFounderExec(period) {
  const range = periodRange(period);
  const prev = previousPeriodRange(range);
  const overview = getTeamDashboardOverview();
  const members = overview.members || [];
  const taskTable = tryTableData('tasks');
  const taskMap = buildHeaderMap(taskTable.headers || []);
  const eventTable = tryTableData('eventOverview');
  const eventMap = buildHeaderMap(eventTable.headers || []);
  const logs = getAllDailyLogRows();
  const projects = getAllProjectsForAdmin();
  const approvals = getTaskApprovals();
  const teamByName = {};
  getTeam().forEach(m => { teamByName[normalizeNameForMatch(m.name)] = m; });

  const memberExtra = {};
  members.forEach(m => {
    memberExtra[normalizeNameForMatch(m.name)] = { events: 0, deals: 0, outbound: 0 };
  });

  (eventTable.rows || []).forEach(row => {
    const key = normalizeNameForMatch(cell(row, eventMap, 'Team Member', ''));
    if (!memberExtra[key]) return;
    const st = normalizeOverviewEventStatusServer(cell(row, eventMap, 'Status', ''));
    if (st === 'Attended' || st === 'Conducted' || st === 'Registered') memberExtra[key].events++;
  });

  logs.forEach(log => {
    const key = normalizeNameForMatch(log.member);
    if (!memberExtra[key]) return;
    memberExtra[key].deals += log.deals;
    memberExtra[key].outbound += log.outbound;
  });

  const enriched = members.map(m => {
    const extra = memberExtra[normalizeNameForMatch(m.name)] || { events: 0, deals: 0, outbound: 0 };
    return Object.assign({}, m, {
      tasksCount: m.totalTasks || 0,
      eventsCount: extra.events,
      dealsCount: extra.deals,
      outboundCount: extra.outbound
    });
  });

  let eventsConducted = 0, eventsConductedPrev = 0, peopleEngaged = 0, peoplePrev = 0;
  (eventTable.rows || []).forEach(row => {
    const dateVal = cell(row, eventMap, 'Date', '');
    const st = normalizeOverviewEventStatusServer(cell(row, eventMap, 'Status', ''));
    if (st === 'Conducted' && inPeriod(dateVal, range)) eventsConducted++;
    if (st === 'Conducted' && inPeriod(dateVal, prev)) eventsConductedPrev++;
    if ((st === 'Registered' || st === 'Attended' || st === 'Conducted') && inPeriod(dateVal, range)) peopleEngaged++;
    if ((st === 'Registered' || st === 'Attended' || st === 'Conducted') && inPeriod(dateVal, prev)) peoplePrev++;
  });

  let outbound = 0, demos = 0, profiles = 0, deals = 0;
  let outboundPrev = 0, demosPrev = 0, profilesPrev = 0, dealsPrev = 0;
  logs.forEach(log => {
    const member = teamByName[normalizeNameForMatch(log.member)];
    const sales = member ? getRoleProfile(member).hasSales : false;
    if (!sales) return;
    if (inPeriod(log.timestamp, range)) {
      outbound += log.outbound; demos += log.demos; profiles += log.profiles; deals += log.deals;
    }
    if (inPeriod(log.timestamp, prev)) {
      outboundPrev += log.outbound; demosPrev += log.demos; profilesPrev += log.profiles; dealsPrev += log.deals;
    }
  });
  peopleEngaged += profiles;
  peoplePrev += profilesPrev;

  const activeDeals = Math.max(0, profiles - deals);
  const projectProgress = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length)
    : 0;

  function kpiCard(label, value, prevValue) {
    const change = pctChange(value, prevValue);
    return {
      label: label,
      value: value,
      trend: change == null ? '' : ((change >= 0 ? '↑ ' : '↓ ') + Math.abs(change) + '% vs prior period')
    };
  }

  const pending = approvals.filter(a => {
    const st = text(a.status).toLowerCase();
    return st === 'request raised' || st === 'pending' || st === 'pending approval' || st === 'discussion needed';
  });
  const approved = approvals.filter(a => text(a.status).toLowerCase() === 'approved');
  const rejected = approvals.filter(a => text(a.status).toLowerCase() === 'rejected');

  const buckets = [];
  const span = Math.max(1, range.end.getTime() - range.start.getTime());
  const n = 4;
  for (let i = 0; i < n; i++) {
    const bStart = new Date(range.start.getTime() + (span * i / n));
    const bEnd = new Date(range.start.getTime() + (span * (i + 1) / n) - 1);
    const slice = { start: bStart, end: bEnd, key: 'b' };
    let c = 0, a = 0, cl = 0;
    logs.forEach(log => {
      const member = teamByName[normalizeNameForMatch(log.member)];
      if (!member || !getRoleProfile(member).hasSales) return;
      if (!inPeriod(log.timestamp, slice)) return;
      c += log.outbound;
      cl += log.deals;
      a += Math.max(0, log.profiles - log.deals);
    });
    buckets.push({
      label: 'P' + (i + 1),
      contacted: c,
      active: a,
      closed: cl
    });
  }

  const approvalRows = pending.map(a => {
    const member = teamByName[normalizeNameForMatch(a.requestedBy)] || {};
    return {
      id: a.id,
      task: a.taskDescription || a.taskId || 'Task',
      submittedBy: a.requestedBy || '',
      team: member.role || a.project || '',
      due: '',
      status: a.status || 'Pending',
      taskRow: a.taskRow || 0,
      project: a.project || ''
    };
  });
  approvalRows.forEach(row => {
    if (!row.taskRow) return;
    const idx = Number(row.taskRow) - (taskTable.startRow || 2);
    if (idx >= 0 && taskTable.rows && taskTable.rows[idx]) {
      row.due = serializeDate(cell(taskTable.rows[idx], taskMap, 'Due Date', ''));
    }
  });

  const recentProjects = projects.slice().sort((a, b) => (b.rowNumber || 0) - (a.rowNumber || 0)).slice(0, 8).map(p => ({
    name: p.name,
    owner: p.lead || '',
    team: p.department || '',
    progress: p.progress || 0,
    status: p.status || '',
    updated: p.targetMonth || ''
  }));

  return {
    period: range.key,
    overallProgress: overview.overallProgress,
    totalTasks: overview.totalTasks,
    completedTasks: overview.completedTasks,
    kpis: [
      kpiCard('Tasks Activity', overview.totalTasks, null),
      kpiCard('Events Conducted', eventsConducted, eventsConductedPrev),
      kpiCard('People Engaged', peopleEngaged, peoplePrev),
      kpiCard('Deals Progress', deals, dealsPrev),
      kpiCard('Projects Progress', projectProgress, null),
      kpiCard('KPI Achievement', overview.overallProgress, null)
    ],
    pipeline: {
      contacted: outbound,
      profiled: profiles,
      signed: demos,
      active: activeDeals,
      closed: deals,
      trend: buckets,
      hasData: !!(outbound || profiles || demos || deals),
      records: logs.filter(log => {
        const member = teamByName[normalizeNameForMatch(log.member)];
        return member && getRoleProfile(member).hasSales && inPeriod(log.timestamp, range);
      }).map(log => ({
        member: log.member,
        timestamp: serializeDate(log.timestamp),
        contacted: log.outbound,
        profiled: log.profiles,
        signed: log.demos,
        closed: log.deals
      }))
    },
    approvals: {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      rows: approvalRows
    },
    projects: recentProjects,
    members: enriched
  };
}

function getFounderExecData(period, claimedEmail) {
  try {
    takeClaimedEmail_(claimedEmail);
    const current = getCurrentUser();
    if (!canViewAll(current)) {
      return jsonSafe({ __nucleoError: 'Founder aggregation is available only to admin-level users.' });
    }
    REQUEST_CACHE = { sheets: {}, tables: {}, headers: {}, headerRows: {} };
    return jsonSafe({ founderExec: buildFounderExec(period || 'month'), founderPeriod: period || 'month' });
  } catch (err) {
    return jsonSafe({ __nucleoError: String(err && err.message ? err.message : err) });
  }
}

function reviewTaskApproval(approvalId, action, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const current = getCurrentUser();
  if (!canViewAll(current)) throw new Error('Only a founder/admin can approve or reject task completions.');
  const result = updateTaskApprovalStatus(approvalId, action);

  let project = null;
  if (result && Number(result.taskRow) >= 2) {
    project = syncProjectProgressForTask_(result.project || '');
  }

  let task = null;
  if (result && Number(result.taskRow) >= 2) {
    try {
      const taskTable = getTableData('tasks');
      const taskMap = buildHeaderMap(taskTable.headers);
      const r = Number(result.taskRow);
      if (r <= taskTable.sheet.getLastRow()) {
        const row = taskTable.sheet.getRange(r, 1, 1, taskTable.headers.length).getValues()[0];
        const due = cell(row, taskMap, 'Due Date', '');
        const status = normalizeTaskStatus(cell(row, taskMap, 'Status', ''));
        task = {
          id: 'TASK-' + r,
          rowNumber: r,
          title: taskTitleFromRow(row, taskMap),
          project: taskProjectFromRow(row, taskMap),
          assignee: cleanName(cell(row, taskMap, 'Assignee', '')),
          status: status,
          priority: cleanName(cell(row, taskMap, 'Priority', 'Medium')) || 'Medium',
          dueDate: serializeDate(due),
          dueISO: toISODate(due),
          dueRaw: text(due),
          notes: cleanName(cell(row, taskMap, 'Approval / Notes', '')),
          descriptionHtml: sanitizeRichHtml_(cell(row, taskMap, 'Description', '')),
          createdBy: cleanName(cell(row, taskMap, 'Created By', '')),
          completed: status === 'Completed'
        };
      }
    } catch (taskErr) { task = null; }
  }

  return writeOk({ entity:'taskApproval', approvalId:approvalId, action:action, result:result, project:project, task:task });
}

function canonicalProjectKey(value) {
  return normalizeNameForMatch(value).replace(/[^a-z0-9]/g, '');
}

function buildProjectIndex_() {
  const out = { byId: {}, byName: {} };
  const table = tryTableData('projects');
  if (table.missing) return out;
  const map = buildHeaderMap(table.headers || []);
  (table.rows || []).forEach((row, i) => {
    const name = cleanName(cell(row, map, 'Project Name', ''));
    if (!name) return;
    const id = cleanName(cell(row, map, 'Project ID', '')) || 'PRJ-' + tableRowNumber(table, i);
    const item = { id: id, name: name, rowNumber: tableRowNumber(table, i) };
    out.byId[id] = item;
    out.byName[canonicalProjectKey(name)] = item;
  });
  return out;
}

function enrichTaskProject_(task, projectIndex) {
  projectIndex = projectIndex || buildProjectIndex_();
  const hit = projectIndex.byName[canonicalProjectKey(task.project || '')];
  if (hit) {
    task.projectId = hit.id;
    task.projectName = hit.name;
  } else {
    task.projectId = task.projectId || '';
    task.projectName = task.projectName || task.project || '';
  }
  return task;
}

function syncProjectProgressForTask_(projectName) {
  const projectKey = canonicalProjectKey(projectName);
  if (!projectKey) return null;
  const projectTable = tryTableData('projects');
  const taskTable = tryTableData('tasks');
  if (projectTable.missing || taskTable.missing) return null;
  const projectMap = buildHeaderMap(projectTable.headers || []);
  const taskMap = buildHeaderMap(taskTable.headers || []);
  let projectRowNumber = null;
  let projectId = '';
  let projectActualName = '';
  for (let i = 0; i < projectTable.rows.length; i++) {
    const row = projectTable.rows[i];
    const name = cleanName(cell(row, projectMap, 'Project Name', ''));
    if (canonicalProjectKey(name) !== projectKey) continue;
    projectRowNumber = tableRowNumber(projectTable, i);
    projectId = cleanName(cell(row, projectMap, 'Project ID', '')) || 'PRJ-' + projectRowNumber;
    projectActualName = name;
    break;
  }
  if (!projectRowNumber) return null;

  let total = 0;
  let completed = 0;
  (taskTable.rows || []).forEach(row => {
    if (canonicalProjectKey(cell(row, taskMap, 'Linked Project Name', '')) !== projectKey) return;
    total++;
    if (normalizeTaskStatus(cell(row, taskMap, 'Status', '')) === 'Completed') completed++;
  });
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const projectRow = projectTable.sheet.getRange(projectRowNumber, 1, 1, projectTable.headers.length).getValues()[0];
  if (col(projectMap, 'Progress %') >= 0) setCell(projectRow, projectMap, 'Progress %', progress);
  if (col(projectMap, 'Overall Status') >= 0 && progress >= 100) {
    setCell(projectRow, projectMap, 'Overall Status', 'Completed');
  }
  projectTable.sheet.getRange(projectRowNumber, 1, 1, projectRow.length).setValues([projectRow]);
  REQUEST_CACHE.tables.projects = null;
  return {
    id: projectId,
    rowNumber: projectRowNumber,
    name: projectActualName,
    progress: progress,
    totalTasks: total,
    completedTasks: completed,
    status: cleanName(cell(projectRow, projectMap, 'Overall Status', ''))
  };
}

function computeProjectStatsFromTasks(taskRows, taskMap, projectName) {
  const key = canonicalProjectKey(projectName);
  let total = 0;
  let completed = 0;
  (taskRows || []).forEach(row => {
    if (canonicalProjectKey(cell(row, taskMap, 'Linked Project Name', '')) !== key) return;
    total++;
    if (normalizeTaskStatus(cell(row, taskMap, 'Status', '')) === 'Completed') completed++;
  });
  return {
    totalTasks: total,
    completedTasks: completed,
    progress: total ? Math.round((completed / total) * 100) : 0
  };
}

function getAllProjectsForAdmin() {
  const table = tryTableData('projects');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);
  const taskTable = tryTableData('tasks');
  const taskMap = buildHeaderMap(taskTable.headers || []);
  const projectRefs = table.rows.map(function(row, i) { return { type: 'Project', id: cleanName(cell(row, map, 'Project ID', '')) || 'PRJ-' + tableRowNumber(table, i) }; });
  const projectCommentCounts = getProjectAndEventCommentCounts_(projectRefs);
  return table.rows
    .map((row, i) => {
      const name = cleanName(cell(row, map, 'Project Name', ''));
      const stats = computeProjectStatsFromTasks(taskTable.rows || [], taskMap, name);
      return {
        id: cleanName(cell(row, map, 'Project ID', '')) || 'PRJ-' + tableRowNumber(table, i),
        rowNumber: tableRowNumber(table, i),
        name: name,
        department: cleanName(cell(row, map, 'Department / Workstream', '')),
        lead: cleanName(cell(row, map, 'Lead', '')),
        status: cleanName(cell(row, map, 'Overall Status', '')),
        targetMonth: cleanName(cell(row, map, 'Target Month', '')),
        totalTasks: stats.totalTasks,
        completedTasks: stats.completedTasks,
        progress: stats.progress,
        commentCount: Number(projectCommentCounts['Project|' + (cleanName(cell(row, map, 'Project ID', '')) || 'PRJ-' + tableRowNumber(table, i))] || 0)
      };
    })
    .filter(proj => proj.name);
}

function getInitialAppData(viewAsName, forcePersonalTask, claimedEmail) {
  try {
    takeClaimedEmail_(claimedEmail);
    const dashboard = getDashboardData(viewAsName, forcePersonalTask);
    let discovery = { events: [], approvals: [], metrics: {}, alerts: [] };
    let board = null;
    try { discovery = getDiscoveryData(); } catch (e1) {
      discovery = { events: [], approvals: [], metrics: {}, alerts: [], __nucleoError: String(e1 && e1.message ? e1.message : e1) };
    }
    try {
      if (dashboard && dashboard.canSwitchDashboard) board = getWorkspaceBoardData(viewAsName);
    } catch (e2) { board = null; }
    return jsonSafe({
      dashboard: dashboard,
      discovery: discovery,
      board: board,
      build: 'I-20260827-task-overview-v3'
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg === 'NUCLEO_NEEDS_SIGNIN') {
      return jsonSafe({ needsSignIn: true, build: 'I-20260827-task-overview-v3' });
    }
    return jsonSafe({ __nucleoError: msg });
  }
}

function getDashboardData(viewAsName, forcePersonalTask, claimedEmail) {
  try {
    takeClaimedEmail_(claimedEmail);
    REQUEST_CACHE = {sheets:{},tables:{},headers:{},headerRows:{}};
    ensureWorkspaceColumns();
    const currentUser = getCurrentUser();
    const currentProfile = getRoleProfile(currentUser);
    const requested = cleanName(viewAsName || '');
    const viewing = resolveDashboardUser(currentUser, requested);
    const isViewingOther =
      canViewAll(currentUser) &&
      normalizeNameForMatch(viewing.name) !== normalizeNameForMatch(currentUser.name);
    const viewingProfile = getRoleProfile(viewing);
    const dashboardMode = forcePersonalTask
      ? (viewingProfile.hasSales ? 'sales' : 'task')
      : (isViewingOther ? viewingProfile.dashboardType : currentProfile.dashboardType);
    const isFounderHome = !isViewingOther && currentProfile.dashboardType === 'founder' && !forcePersonalTask;
    const isAdminTaskHome = !isViewingOther && currentProfile.hasAdmin && currentProfile.dashboardType !== 'founder' && !forcePersonalTask;
    const isAdminHome = isFounderHome || isAdminTaskHome;
    const loadPersonalWorkspace = !isAdminHome || isViewingOther || !!forcePersonalTask;
    const showKpis = loadPersonalWorkspace && (dashboardMode === 'sales' || viewingProfile.hasSales);
    const teamOverview = canViewAll(currentUser) ? getTeamDashboardOverview() : null;
    const personalTasks = loadPersonalWorkspace ? getTasks(viewing) : [];
    const personalProjects = loadPersonalWorkspace ? getProjects(viewing) : [];
    return jsonSafe({
      user: currentUser,
      viewing: viewing,
      profile: currentProfile,
      viewingProfile: viewingProfile,
      dashboardMode: dashboardMode,
      dashboardModeLabel: getDashboardModeLabel(dashboardMode),
      canSwitchDashboard: canViewAll(currentUser),
      canEditViewedDashboard: canViewAll(currentUser) || !isViewingOther,
      isViewingOther: isViewingOther,
      showFounderOverview: isFounderHome,
      showAdminOverview: isFounderHome || isAdminTaskHome,
      showTeamOverview: isAdminTaskHome,
      showKpis: showKpis,
      showDailyLog: loadPersonalWorkspace,
      hasTaskAccess: viewingProfile.hasTask || currentProfile.hasTask,
      hasSalesAccess: viewingProfile.hasSales || currentProfile.hasSales,
      canOpenPersonalWorkspace: currentProfile.canOpenPersonalWorkspace,
      personalWorkspace: !!(forcePersonalTask && canViewAll(currentUser)),
      kpis: showKpis ? calculateKPIs(viewing) : null,
      founderExec: isAdminHome ? buildFounderExec('month') : null,
      founderPeriod: isAdminHome ? 'month' : '',
      tasks: personalTasks,
      projects: personalProjects,
      eventOverviewEvents: loadPersonalWorkspace ? getEventOverviewEvents(viewing) : [],
      activities: loadPersonalWorkspace ? getRecentActivities(viewing) : [],
      team: canViewAll(currentUser) ? getTeam() : [viewing],
      teamOverview: teamOverview,
      allProjects: canViewAll(currentUser) ? getAllProjectsForAdmin() : personalProjects,
      allTasks: canViewAll(currentUser) ? getAllTasksForAdmin() : personalTasks,
      taskApprovals: canViewAll(currentUser) ? getTaskApprovals() : [],
      allowedTabs: Object.keys(ALLOWED_TAB_ALIASES)
    });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg === 'NUCLEO_NEEDS_SIGNIN') {
      return jsonSafe({ needsSignIn: true });
    }
    return jsonSafe({
      __nucleoError: msg
    });
  }
}

function getWorkspaceBoardData(viewAsName, claimedEmail) {
  try {
    takeClaimedEmail_(claimedEmail);
    const currentUser = getCurrentUser();
    if (!canViewAll(currentUser)) {
      const viewing = resolveDashboardUser(currentUser, cleanName(viewAsName || currentUser.name));
      return jsonSafe({
        viewing: viewing,
        allProjects: getProjects(viewing),
        allTasks: getTasks(viewing)
      });
    }
    const viewing = resolveDashboardUser(currentUser, cleanName(viewAsName || currentUser.name));
    return jsonSafe({
      viewing: viewing,
      allProjects: getAllProjectsForAdmin(),
      allTasks: getAllTasksForAdmin()
    });
  } catch (err) {
    return jsonSafe({ __nucleoError: String(err && err.message ? err.message : err) });
  }
}

function getPersonalDashboardData(claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const currentUser = getCurrentUser();
  const profile = getRoleProfile(currentUser);
  if (!profile.canOpenPersonalWorkspace && !profile.hasTask && !profile.hasSales) {
    throw new Error('Personal workspace is not available for this account.');
  }
  return getDashboardData(currentUser.name, true);
}

function getFormDropdownData(viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const currentUser = getCurrentUser();
  const viewing = resolveDashboardUser(currentUser, cleanName(viewAsName || currentUser.name));
  return jsonSafe({
    team: canViewAll(currentUser) ? getTeam() : [viewing],
    projects: canViewAll(currentUser) ? getAllProjectsForAdmin() : getProjects(viewing)
  });
}

function moveTaskOnBoard(taskRowNumber, newStatus, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const access = assertTaskAccess(taskRowNumber, viewAsName);
  access._rowNumber = Number(taskRowNumber);
  const result = applyTaskStatusChange(access, newStatus);
  const viewing = access.viewing;
  const taskTable = getTableData('tasks');
  const map = buildHeaderMap(taskTable.headers);
  const idx = Number(taskRowNumber) - (taskTable.startRow || 2);
  const row = (idx >= 0 && idx < taskTable.rows.length) ? taskTable.rows[idx] : access.row;
  const due = cell(row, map, 'Due Date', '');
  const status = result.status;
  const projectName = taskProjectFromRow(row, map);
  const project = syncProjectProgressForTask_(projectName);
  return jsonSafe({
    success: true,
    taskStatusResult: result,
    project: project,
    task: {
      id: 'TASK-' + Number(taskRowNumber),
      rowNumber: Number(taskRowNumber),
      title: taskTitleFromRow(row, map),
      project: taskProjectFromRow(row, map),
      assignee: cleanName(cell(row, map, 'Assignee', '')),
      status: status,
      priority: cleanName(cell(row, map, 'Priority', 'Medium')) || 'Medium',
      dueDate: serializeDate(due),
      dueISO: toISODate(due),
      dueRaw: text(due),
      notes: cleanName(cell(row, map, 'Approval / Notes', '')),
      descriptionHtml: sanitizeRichHtml_(cell(row, map, 'Description', '')),
      createdBy: cleanName(cell(row, map, 'Created By', '')),
      completed: status === 'Completed'
    }
  });
}

/**
 * Compatibility endpoint for the older dashboard code.
 */
function getInitialData() {
  const data = getDashboardData();

  return {
    user: data.user,
    teamMembers: data.team,
    projects: data.projects,
    tasks: data.tasks,
    events: data.eventOverviewEvents,
    eventOverviewEvents: data.eventOverviewEvents,
    activities: data.activities
  };
}

function getTeam() {
  const table = getTableData('team');
  const map = buildHeaderMap(table.headers);

  return table.rows
    .map((row, i) => ({
      id: 'TEAM-' + tableRowNumber(table, i),
      name: cleanName(cell(row, map, 'Name', '')),
      role: cleanName(cell(row, map, 'Role', '')),
      access: cleanName(cell(row, map, 'Access', '')),
      notes: cleanName(cell(row, map, 'Notes', '')),
      email: text(cell(row, map, 'Email', ''))
    }))
    .filter(m => m.name);
}

function legacyTaskCommentCount_(taskRow, map) {
  const raw = text(cell(taskRow, map, 'Approval / Notes', ''));
  if (!raw) return 0;
  return raw.split(/\r?\n/).filter(line => /^\[[^\]]+\s·\s[^\]]+\]\s+/.test(line)).length;
}

function getTaskCommentCounts_(taskIds) {
  const out = {};
  (taskIds || []).forEach(id => { if (id) out[String(id)] = 0; });
  if (!Object.keys(out).length) return out;

  // Preserve legacy comments already stored in Task Mastersheet > Approval / Notes.
  const taskTable = tryTableData('tasks');
  if (!taskTable.missing) {
    const taskMap = buildHeaderMap(taskTable.headers || []);
    (taskTable.rows || []).forEach((row, i) => {
      const id = 'TASK-' + tableRowNumber(taskTable, i);
      if (Object.prototype.hasOwnProperty.call(out, id)) {
        out[id] += legacyTaskCommentCount_(row, taskMap);
      }
    });
  }

  // Count new comments from the dedicated existing Nucleo Comments sheet in one read.
  const table = tryTableData('comments');
  if (table.missing) return out;
  const map = buildHeaderMap(table.headers || []);
  const typeIdx = col(map, 'Entity Type');
  const idIdx = col(map, 'Entity ID');
  if (typeIdx < 0 || idIdx < 0) return out;
  (table.rows || []).forEach(row => {
    const type = text(row[typeIdx]).toLowerCase();
    if (type !== 'task') return;
    const id = text(row[idIdx]);
    if (Object.prototype.hasOwnProperty.call(out, id)) out[id]++;
  });
  return out;
}


function getTaskComments(rowNumber, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const access = assertTaskAccess(rowNumber, viewAsName);
  const taskId = 'TASK-' + Number(rowNumber);
  const rows = [];

  // Existing legacy comments are preserved from Approval / Notes and are read-only here.
  const legacyRaw = text(cell(access.row, access.map, 'Approval / Notes', ''));
  if (legacyRaw) {
    legacyRaw.split(/\r?\n/).forEach((line, idx) => {
      const match = line.match(/^\[([^·\]]+)\s·\s([^\]]+)\]\s+([\s\S]*)$/);
      if (!match) return;
      rows.push({
        id: 'LEGACY-' + Number(rowNumber) + '-' + idx,
        user: cleanName(match[2]),
        userEmail: '',
        comment: text(match[3]),
        createdAt: text(match[1]),
        updatedAt: text(match[1]),
        _legacy: true,
        _sort: idx
      });
    });
  }

  const table = tryTableData('comments');
  if (table.missing) {
    // The task still has a usable legacy conversation even if the dedicated sheet is unavailable.
    rows.sort((a, b) => (b._sort || 0) - (a._sort || 0));
    return jsonSafe({
      taskId: taskId,
      rowNumber: Number(rowNumber),
      task: {
        id: taskId, rowNumber: Number(rowNumber), title: taskTitleFromRow(access.row, access.map),
        project: taskProjectFromRow(access.row, access.map),
        status: normalizeTaskStatus(cell(access.row, access.map, 'Status', '')),
        priority: cleanName(cell(access.row, access.map, 'Priority', 'Medium')) || 'Medium',
        assignee: cleanName(cell(access.row, access.map, 'Assignee', '')),
        dueDate: serializeDate(cell(access.row, access.map, 'Due Date', '')),
        dueISO: toISODate(cell(access.row, access.map, 'Due Date', '')),
        descriptionHtml: sanitizeRichHtml_(cell(access.row, access.map, 'Description', '')),
        createdBy: cleanName(cell(access.row, access.map, 'Created By', ''))
      },
      count: rows.length,
      comments: rows.map(c => ({ id:c.id, user:c.user, userEmail:c.userEmail, comment:c.comment, createdAt:c.createdAt, updatedAt:c.updatedAt }))
    });
  }

  const map = buildHeaderMap(table.headers || []);
  (table.rows || []).forEach((row, i) => {
    const entityType = text(cell(row, map, 'Entity Type', ''));
    const entityId = text(cell(row, map, 'Entity ID', ''));
    if (entityType.toLowerCase() !== 'task' || entityId !== taskId) return;
    const created = cell(row, map, 'Created At', '');
    const createdDate = toDate(created);
    rows.push({
      id: text(cell(row, map, 'Comment ID', '')) || 'COM-' + tableRowNumber(table, i),
      user: cleanName(cell(row, map, 'User', '')),
      userEmail: text(cell(row, map, 'User Email', '')),
      comment: text(cell(row, map, 'Comment', '')),
      createdAt: serializeDateTime_(created),
      updatedAt: serializeDateTime_(cell(row, map, 'Updated At', '') || created),
      _legacy: false,
      _sort: createdDate ? createdDate.getTime() : tableRowNumber(table, i)
    });
  });

  rows.sort((a, b) => (Number(b._sort) || 0) - (Number(a._sort) || 0));
  return jsonSafe({
    taskId: taskId,
    rowNumber: Number(rowNumber),
    task: {
      id: taskId, rowNumber: Number(rowNumber), title: taskTitleFromRow(access.row, access.map),
      project: taskProjectFromRow(access.row, access.map),
      status: normalizeTaskStatus(cell(access.row, access.map, 'Status', '')),
      priority: cleanName(cell(access.row, access.map, 'Priority', 'Medium')) || 'Medium',
      assignee: cleanName(cell(access.row, access.map, 'Assignee', '')),
      dueDate: serializeDate(cell(access.row, access.map, 'Due Date', '')),
      dueISO: toISODate(cell(access.row, access.map, 'Due Date', '')),
      descriptionHtml: sanitizeRichHtml_(cell(access.row, access.map, 'Description', '')),
      createdBy: cleanName(cell(access.row, access.map, 'Created By', ''))
    },
    count: rows.length,
    comments: rows.map(c => ({
      id: c.id,
      user: c.user,
      userEmail: c.userEmail,
      comment: c.comment,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  });
}

function serializeDateTime_(value) {
  if (!value) return '';
  const d = toDate(value);
  if (!d) return text(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy, h:mm a');
}


function sanitizeRichHtml_(value) {
  var html = String(value == null ? '' : value);
  if (!html) return '';
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*\/?>/gi, '');
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s+(href|src|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/<\s*(p|br|strong|b|em|i|u|ul|ol|li|div|span)\b[^>]*>/gi, function(m, tag){ return '<' + tag.toLowerCase() + '>'; });
  html = html.replace(/<\s*\/\s*(p|strong|b|em|i|u|ul|ol|li|div|span)\s*>/gi, function(m, tag){ return '</' + tag.toLowerCase() + '>'; });
  html = html.replace(/<\s*br\s*\/?>/gi, '<br>');
  html = html.replace(/<(?!\/?(?:p|br|strong|b|em|i|u|ul|ol|li|div|span)(?:\s|>))/gi, '&lt;');
  return html.trim();
}

function getProjectAndEventCommentCounts_(entityRefs) {
  var out = {};
  (entityRefs || []).forEach(function(ref) {
    if (ref && ref.id) out[String(ref.type) + '|' + String(ref.id)] = 0;
  });
  if (!Object.keys(out).length) return out;
  var table = tryTableData('comments');
  if (table.missing) return out;
  var map = buildHeaderMap(table.headers || []);
  var typeIdx = col(map, 'Entity Type');
  var idIdx = col(map, 'Entity ID');
  if (typeIdx < 0 || idIdx < 0) return out;
  (table.rows || []).forEach(function(row) {
    var key = text(row[typeIdx]).trim().toLowerCase() + '|' + text(row[idIdx]).trim();
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key]++;
  });
  return out;
}
function getAllTasksForAdmin() {
  const table = tryTableData('tasks');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);
  const sheet = table.sheet;
  const commentIds = table.rows.map((row, i) => 'TASK-' + tableRowNumber(table, i));
  const commentCounts = getTaskCommentCounts_(commentIds);
  const projectIndex = buildProjectIndex_();
  const lastModified = readLastModifiedBulk(
    sheet,
    table.rows.length,
    col(map, 'Task Description'),
    table.startRow
  );

  return table.rows.map((row, i) => {
    const due = cell(row, map, 'Due Date', '');
    const rowNumber = tableRowNumber(table, i);
    const status = normalizeTaskStatus(cell(row, map, 'Status', ''));

    return {
      id: 'TASK-' + rowNumber,
      rowNumber: rowNumber,
      title: taskTitleFromRow(row, map),
      project: taskProjectFromRow(row, map),
      assignee: cleanName(cell(row, map, 'Assignee', '')),
      status: status,
      priority: cleanName(cell(row, map, 'Priority', 'Medium')) || 'Medium',
      dueDate: serializeDate(due),
      dueISO: toISODate(due),
      dueRaw: text(due),
      notes: cleanName(cell(row, map, 'Approval / Notes', '')),
      descriptionHtml: sanitizeRichHtml_(cell(row, map, 'Description', '')),
      createdBy: cleanName(cell(row, map, 'Created By', '')),
      projectId: (projectIndex.byName[canonicalProjectKey(taskProjectFromRow(row, map))] || {}).id || '',
      projectName: (projectIndex.byName[canonicalProjectKey(taskProjectFromRow(row, map))] || {}).name || taskProjectFromRow(row, map),
      commentCount: Number(commentCounts['TASK-' + rowNumber] || 0),
      completed: ['completed','done'].indexOf(status.toLowerCase()) >= 0,
      lastModified: lastModified[i] || 0
    };
  }).filter(t => t.title)
    .sort((a,b) => (b.lastModified-a.lastModified) || (b.rowNumber-a.rowNumber));
}

function getTasks(user) {
  const table = tryTableData('tasks');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);
  const sheet = table.sheet;
  const person = normalizeNameForMatch(user.name);
  const commentIds = table.rows.map((row, i) => 'TASK-' + tableRowNumber(table, i));
  const commentCounts = getTaskCommentCounts_(commentIds);
  const projectIndex = buildProjectIndex_();
  const lastModified = readLastModifiedBulk(
    sheet,
    table.rows.length,
    col(map, 'Task Description'),
    table.startRow
  );

  return table.rows
    .map((row, i) => {
      const due = cell(row, map, 'Due Date', '');
      const rowNumber = tableRowNumber(table, i);
      const status = normalizeTaskStatus(cell(row, map, 'Status', ''));

      return {
        id: 'TASK-' + rowNumber,
        rowNumber: rowNumber,
        title: taskTitleFromRow(row, map),
        project: taskProjectFromRow(row, map),
        assignee: cleanName(cell(row, map, 'Assignee', '')),
        status: status,
        priority: cleanName(cell(row, map, 'Priority', 'Medium')) || 'Medium',
        dueDate: serializeDate(due),
        dueISO: toISODate(due),
        dueRaw: text(due),
        notes: cleanName(cell(row, map, 'Approval / Notes', '')),
        descriptionHtml: sanitizeRichHtml_(cell(row, map, 'Description', '')),
        createdBy: cleanName(cell(row, map, 'Created By', '')),
        projectId: (projectIndex.byName[canonicalProjectKey(taskProjectFromRow(row, map))] || {}).id || '',
        projectName: (projectIndex.byName[canonicalProjectKey(taskProjectFromRow(row, map))] || {}).name || taskProjectFromRow(row, map),
        commentCount: Number(commentCounts['TASK-' + rowNumber] || 0),
        completed: ['completed','done'].indexOf(status.toLowerCase()) >= 0,
        lastModified: lastModified[i] || 0
      };
    })
    .filter(t => t.title)
    .filter(t => normalizeNameForMatch(t.assignee) === person)
    .sort((a, b) => (b.lastModified - a.lastModified) || (b.rowNumber - a.rowNumber));
}

function getProjects(user) {
  const projectTable = tryTableData('projects');
  const taskTable = tryTableData('tasks');
  if (taskTable.missing) return [];
  const projectMap = buildHeaderMap(projectTable.headers || []);
  const taskMap = buildHeaderMap(taskTable.headers);
  const person = normalizeNameForMatch(user.name);

  const userProjectStats = {};

  taskTable.rows.forEach(row => {
    const assignee = cleanName(cell(row, taskMap, 'Assignee', ''));
    if (normalizeNameForMatch(assignee) !== person) return;

    const projectName = cleanName(cell(row, taskMap, 'Linked Project Name', ''));
    if (!projectName) return;

    const key = normalizeNameForMatch(projectName);
    if (!userProjectStats[key]) {
      userProjectStats[key] = {
        name: projectName,
        total: 0,
        completed: 0
      };
    }

    userProjectStats[key].total++;

    if (text(cell(row, taskMap, 'Status', '')).toLowerCase() === 'completed') {
      userProjectStats[key].completed++;
    }
  });

  const projects = [];
  const projectRefs = (projectTable.rows || []).map(function(row, i) { return { type: 'Project', id: cleanName(cell(row, projectMap, 'Project ID', '')) || 'PRJ-' + tableRowNumber(projectTable, i) }; });
  const projectCommentCounts = getProjectAndEventCommentCounts_(projectRefs);
  const matchedKeys = {};

  // First use the existing Project Master metadata for projects that are
  // actually linked to this person's tasks.
  (projectTable.rows || []).forEach((row, i) => {
    const projectName = cleanName(cell(row, projectMap, 'Project Name', ''));
    if (!projectName) return;

    const key = normalizeNameForMatch(projectName);
    const stats = userProjectStats[key];
    if (!stats) return;

    matchedKeys[key] = true;

    projects.push({
      id: cleanName(cell(row, projectMap, 'Project ID', '')) || 'PRJ-' + tableRowNumber(projectTable, i),
      rowNumber: tableRowNumber(projectTable, i),
      name: projectName,
      department: cleanName(cell(row, projectMap, 'Department / Workstream', '')),
      lead: cleanName(cell(row, projectMap, 'Lead', '')),
      status: cleanName(cell(row, projectMap, 'Overall Status', '')),
      targetMonth: cleanName(cell(row, projectMap, 'Target Month', '')),
      totalTasks: stats.total,
      completedTasks: stats.completed,
      progress: stats.total ? Math.round((stats.completed / stats.total) * 100) : 0,
      commentCount: Number(projectCommentCounts['Project|' + (cleanName(cell(row, projectMap, 'Project ID', '')) || 'PRJ-' + tableRowNumber(projectTable, i))] || 0)
    });
  });

  // If a task references a project name that is not present in Project Master,
  // still show that project because the task itself is the person's linkage.
  Object.keys(userProjectStats).forEach(key => {
    if (matchedKeys[key]) return;
    const stats = userProjectStats[key];
    projects.push({
      id: 'TASK-LINK-' + key,
      rowNumber: null,
      name: stats.name,
      department: '',
      lead: '',
      status: 'From linked tasks',
      targetMonth: '',
      totalTasks: stats.total,
      completedTasks: stats.completed,
      progress: 0
    });
  });

  return projects;
}

function getEvents(user) {
  const table = tryTableData('events');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);
  const eventRefs = (table.rows || []).map(function(row, i) { return { type: 'Event', id: 'EVENT-' + tableRowNumber(table, i) }; });
  const eventCommentCounts = getProjectAndEventCommentCounts_(eventRefs);

  return table.rows
    .map((row, i) => {
      const dateRaw = cell(row, map, 'Date', '');
      const firstDeadline = cell(row, map, 'Registration Deadline', '');
      const secondDeadline = col(map, 'Registration Deadline 2') >= 0 ? cell(row, map, 'Registration Deadline 2', '') : '';
      const looksLikeType = /rsvp|ticket|free|paid|direct|via /i.test(text(firstDeadline));
      const deadlineRaw = (looksLikeType && secondDeadline) ? secondDeadline : (secondDeadline || firstDeadline);
      const registrationType = looksLikeType ? firstDeadline : cell(row, map, 'Registration Status', '');

      return {
        id: 'EVENT-' + tableRowNumber(table, i),
        rowNumber: tableRowNumber(table, i),
        city: cleanName(
          cell(row, map, 'City', '')
        ),
        name: cleanName(
          cell(row, map, 'Event Name', '')
        ),
        date: serializeDate(dateRaw),
        dateISO: toISODate(dateRaw),
        time: cleanName(
          cell(row, map, 'Time', '')
        ),
        venue: cleanName(
          cell(row, map, 'Venue', '')
        ),
        registrationStatus: cleanName(registrationType || cell(row, map, 'Registration Status', '')),
        deadline: serializeDate(deadlineRaw),
        deadlineISO: toISODate(deadlineRaw),
        target: cleanName(
          cell(row, map, 'Target Audience', '')
        ),
        highlights: cleanName(
          cell(row, map, 'Key Highlights', '')
        ),
        price: cleanName(
          cell(row, map, 'Price', '')
        ),
        link: cleanName(
          cell(row, map, 'Link', '')
        ),
        commentCount: Number(eventCommentCounts['Event|EVENT-' + tableRowNumber(table, i)] || 0)
      };
    })
    .filter(e => e.name);
}

/**
 * Returns only events that belong to the user's Event Overview workflow.
 *
 * Event Overview is intentionally separate from Event Discovery:
 * - Event Overview = events the selected dashboard member has Attended,
 *   Conducted, Registered, or has In Plan.
 * - Event Discovery = the broader discovery listing returned by
 *   getDiscoveryData().
 *
 * The two payloads have separate functions and separate frontend state.
 */
function getEventOverviewEvents(user) {
  // Primary source: the existing Event Overview sheet. It remains separate
  // from Event Discovery so historical/attended events are never removed.
  try {
    const table = getTableData('eventOverview');
    const map = buildHeaderMap(table.headers);
    const person = normalizeNameForMatch(user.name);
    const sheet = table.sheet;
    const eventRefs = (table.rows || []).map(function(row, i) { return { type: 'Event', id: 'OV-' + tableRowNumber(table, i) }; });
    const eventCommentCounts = getProjectAndEventCommentCounts_(eventRefs);

    return table.rows.map((row, i) => {
      const member = cleanName(cell(row, map, 'Team Member', ''));
      if (normalizeNameForMatch(member) !== person) return null;
      const rawDate = cell(row, map, 'Date', '');
      const rawStatus = cell(row, map, 'Status', '');
      const rowNumber = tableRowNumber(table, i);
      return {
        id: 'OV-' + rowNumber,
        rowNumber: rowNumber,
        teamMember: member,
        name: cleanName(cell(row, map, 'Event Name', '')),
        date: serializeDate(rawDate),
        dateISO: toISODate(rawDate),
        status: normalizeOverviewEventStatusServer(rawStatus) || 'In Plan',
        registrationStatus: normalizeOverviewEventStatusServer(rawStatus) || 'In Plan',
        city: cleanName(cell(row, map, 'City', '')),
        link: cleanName(cell(row, map, 'Link', '')),
        time: cleanName(cell(row, map, 'Time', '')),
        venue: cleanName(cell(row, map, 'Venue', '')),
        notes: cleanName(cell(row, map, 'Notes', '')),
        lastModified: readLastModified(sheet, rowNumber, map, 'Event Name'),
        commentCount: Number(eventCommentCounts['Event|OV-' + rowNumber] || 0)
      };
    }).filter(Boolean).filter(e => e.name)
      .sort((a, b) => (b.lastModified - a.lastModified) || (b.rowNumber - a.rowNumber));
  } catch (err) {
    return getLegacyEventOverviewEvents(user);
  }
}

function getLegacyEventOverviewEvents(user) {
  const events = getEvents(user);
  const approvals = getApprovals();
  const dailyLogs = getDailyLogRows(user);
  const person = normalizeNameForMatch(user.name);
  const approvalByEvent = {};
  approvals.forEach(a => {
    const key = normalizeNameForMatch(a.eventName);
    if (!key || normalizeNameForMatch(a.requestedBy) !== person) return;
    const status = text(a.status).toLowerCase();
    if (status === 'rejected') return;
    approvalByEvent[key] = status;
  });
  const logByEvent = {};
  dailyLogs.forEach(log => {
    const custom = text(log.custom);
    if (!custom) return;
    events.forEach(event => {
      const key = normalizeNameForMatch(event.name);
      if (!key || normalizeNameForMatch(custom).indexOf(key) < 0) return;
      const logText = (custom + ' ' + text(log.activities)).toLowerCase();
      logByEvent[key] = logText.indexOf('conduct') >= 0 ? 'Conducted' : 'Attended';
    });
  });
  return events.map(event => {
    const key = normalizeNameForMatch(event.name);
    const approvalStatus = approvalByEvent[key];
    const logStatus = logByEvent[key];
    if (!approvalStatus && !logStatus) return null;
    let status = logStatus || '';
    if (!status && approvalStatus) {
      if (approvalStatus === 'approved') status = 'Registered';
      else if (['request raised','pending','pending approval'].indexOf(approvalStatus) >= 0) status = 'In Plan';
      else status = normalizeOverviewEventStatusServer(event.registrationStatus) || 'In Plan';
    }
    return Object.assign({}, event, { registrationStatus: status || 'In Plan', status: status || 'In Plan' });
  }).filter(Boolean);
}

function normalizeOverviewEventStatusServer(value) {
  const s = text(value).toLowerCase();

  if (s.indexOf('conduct') >= 0) return 'Conducted';
  if (s.indexOf('attend') >= 0) return 'Attended';
  if (s.indexOf('register') >= 0 || s.indexOf('approv') >= 0) return 'Registered';
  if (s.indexOf('plan') >= 0 || s.indexOf('pending') >= 0 ||
      s.indexOf('open') >= 0 || s.indexOf('not started') >= 0) return 'In Plan';

  return '';
}

function getApprovals() {
  const table = tryTableData('approvals');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);

  return table.rows
    .map((row, i) => ({
      id:
        cleanName(cell(row, map, 'Approval ID', '')) ||
        'APP-' + tableRowNumber(table, i),
      rowNumber: tableRowNumber(table, i),
      eventName: cleanName(
        cell(row, map, 'Event Name', '')
      ),
      requestedBy: cleanName(
        cell(row, map, 'Requested By', '')
      ),
      status: cleanName(
        cell(row, map, 'Status', '')
      ),
      approvedBy: cleanName(
        cell(row, map, 'Approved By', '')
      )
    }))
    .filter(a => a.eventName);
}


function getTaskApprovals() {
  const table = tryTableData('approvals');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);

  return table.rows
    .map((row, i) => {
      const requestType = cleanName(cell(row, map, 'Request Type', ''));
      const taskId = cleanName(cell(row, map, 'Task ID', ''));
      const taskRow = numberValue(cell(row, map, 'Task Row', ''));
      const taskDescription = cleanName(cell(row, map, 'Task Description', ''));
      const project = cleanName(cell(row, map, 'Project', ''));
      return {
        id: cleanName(cell(row, map, 'Approval ID', '')) || 'TAPP-' + tableRowNumber(table, i),
        rowNumber: tableRowNumber(table, i),
        requestType: requestType,
        taskId: taskId,
        taskRow: taskRow,
        taskDescription: taskDescription,
        project: project,
        requestedBy: cleanName(cell(row, map, 'Requested By', '')),
        status: cleanName(cell(row, map, 'Status', '')),
        approvedBy: cleanName(cell(row, map, 'Approved By', '')),
        comment: cleanName(cell(row, map, 'Comment', ''))
      };
    })
    .filter(a => a.requestType.toLowerCase() === 'task' || a.taskId);
}

function getEventAlerts() {
  const events = getEvents({ name: '', role: '' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts = [];

  events.forEach(event => {
    const eventDate = toDate(event.dateISO || event.date);
    const deadline = toDate(event.deadlineISO || event.deadline);

    [
      { date: eventDate, type: 'Event' },
      { date: deadline, type: 'Registration deadline' }
    ].forEach(item => {
      if (!item.date) return;
      item.date.setHours(0, 0, 0, 0);
      const days = Math.round((item.date.getTime() - today.getTime()) / 86400000);
      if (days >= 0 && days <= 7) {
        alerts.push({
          eventName: event.name,
          type: item.type,
          daysLeft: days,
          date: formatDate(item.date),
          dateISO: toISODate(item.date),
          city: event.city || '',
          link: event.link || ''
        });
      }
    });
  });

  alerts.sort((a, b) => a.daysLeft - b.daysLeft || String(a.eventName).localeCompare(String(b.eventName)));
  return alerts.slice(0, 12);
}

function getRecentActivities(user) {
  const table = tryTableData('dailyLogs');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);

  const rows = table.rows
    .map((row, i) => ({
      id: 'LOG-' + tableRowNumber(table, i),
      timestamp: cell(
        row,
        map,
        'Timestamp',
        ''
      ),
      member: cleanName(
        cell(row, map, 'Team Member', '')
      ),
      calls: numberValue(
        cell(row, map, 'Calls Made', 0)
      ),
      followups: numberValue(
        cell(row, map, 'Follow-ups', 0)
      ),
      deals: numberValue(
        cell(row, map, 'Deals Closed', 0)
      ),
      activities: cleanName(
        cell(row, map, 'Activities Done', '')
      ),
      meetings: cleanName(
        cell(
          row,
          map,
          'Meetings',
          cell(row, map, 'Event Selection / Custom', '')
        )
      )
    }))
    .filter(r => r.member)
    .filter(
      r =>
        normalizeNameForMatch(r.member) ===
        normalizeNameForMatch(user.name)
    );

  rows.sort((a, b) => {
    const da = toDate(a.timestamp);
    const db = toDate(b.timestamp);

    return (
      (db ? db.getTime() : 0) -
      (da ? da.getTime() : 0)
    );
  });

  return rows.slice(0, 8).map(r => ({
    id: r.id,
    user: r.member,
    text: buildActivityText(r),
    activitiesHtml: sanitizeDailyLogHtmlServer_(r.activities),
    activitiesText: stripHtmlTextServer_(r.activities),
    calls: r.calls || 0,
    followups: r.followups || 0,
    deals: r.deals || 0,
    meetings: r.meetings || '',
    time: formatActivityTime(r.timestamp),
    type: 'Daily Log'
  }));
}

function sanitizeDailyLogHtmlServer_(html) {
  const source = String(html || '').trim();
  if (!source) return '';
  const allowed = {
    B:1, STRONG:1, I:1, EM:1, U:1, P:1, BR:1, UL:1, OL:1, LI:1
  };
  return source.replace(/<[^>]*>/g, function(tag) {
    const match = tag.match(/^<\/?\s*([a-z0-9]+)/i);
    if (!match) return '';
    const name = String(match[1]).toUpperCase();
    if (!allowed[name]) return '';
    if (/^<\s*\//.test(tag)) return '</' + name.toLowerCase() + '>';
    if (name === 'BR') return '<br>';
    return '<' + name.toLowerCase() + '>';
  });
}

function stripHtmlTextServer_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>(?!$)/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildActivityText(row) {
  const parts = [];

  if (row.calls) parts.push(row.calls + ' calls');
  if (row.followups) parts.push(row.followups + ' follow-ups');
  if (row.deals) parts.push(row.deals + ' deals closed');
  if (row.meetings) parts.push('Meetings: ' + row.meetings);
  if (row.activities) parts.push(row.activities);

  return parts.length
    ? parts.join(' · ')
    : 'Daily activity logged';
}

function formatActivityTime(value) {
  const d = toDate(value);

  if (!d) return text(value);

  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone(),
    'dd MMM, h:mm a'
  );
}

/* =========================
   KPI CALCULATIONS
   ========================= */

function calculateKPIs(user) {
  const now = new Date();
  const todayKey = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const monthKey = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthKey = Utilities.formatDate(previousMonth, Session.getScriptTimeZone(), 'yyyy-MM');

  const logs = getDailyLogRows(user);
  let cumulativeOutbound = 0, cumulativeDemos = 0, cumulativeProfiles = 0, cumulativeDeals = 0;

  logs.forEach(row => {
    cumulativeOutbound += row.outbound;
    cumulativeDemos += row.demos;
    cumulativeProfiles += row.profiles;
    cumulativeDeals += row.deals;
  });

  const overview = getEventOverviewEvents(user);
  let attended = 0, conducted = 0, previousAttended = 0, previousConducted = 0;
  overview.forEach(event => {
    const month = (event.dateISO || '').slice(0, 7);
    const status = normalizeOverviewEventStatusServer(event.status || event.registrationStatus);
    if (month === monthKey && status === 'Attended') attended++;
    if (month === monthKey && status === 'Conducted') conducted++;
    if (month === previousMonthKey && status === 'Attended') previousAttended++;
    if (month === previousMonthKey && status === 'Conducted') previousConducted++;
  });

  const tasks = getTasks(user);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const progress = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const targets = getCurrentMonthKpiTargets(user);

  function withTarget(actualMetric, kpiName) {
    const target = targets[kpiName];
    if (!target) return actualMetric;
    const actual = numberValue(actualMetric && actualMetric.value);
    const pct = target ? Math.round((actual / target) * 100) : 0;
    return {
      value: actual,
      target: target,
      trend: actual + ' / ' + target + ' (' + pct + '%)'
    };
  }

  return {
    outbound: withTarget({ value: cumulativeOutbound, trend: 'cumulative' }, 'calls'),
    calls: withTarget({ value: cumulativeOutbound, trend: 'cumulative' }, 'calls'),
    demos: withTarget({ value: cumulativeDemos, trend: 'cumulative' }, 'discovery'),
    profiles: withTarget({ value: cumulativeProfiles, trend: 'cumulative' }, 'profiles'),
    followups: withTarget({ value: cumulativeProfiles, trend: 'cumulative' }, 'follow-ups'),
    deals: withTarget({ value: cumulativeDeals, trend: 'cumulative' }, 'deals closed'),
    attended: withTarget(metric(attended, previousAttended, 'vs last month'), 'events attended'),
    conducted: withTarget(metric(conducted, previousConducted, 'vs last month'), 'events conducted'),
    overallProgress: { value: progress, trend: completedTasks + '/' + totalTasks + ' tasks completed' },
    tasksCompleted: withTarget({ value: completedTasks, trend: completedTasks + '/' + totalTasks + ' tasks' }, 'tasks completed')
  };
}

function getCurrentMonthKpiTargets(user) {
  const table = tryTableData('kpiTargets');
  const out = {};
  if (table.missing) return out;
  const map = buildHeaderMap(table.headers);
  const now = new Date();
  const monthName = Utilities.formatDate(now, Session.getScriptTimeZone(), 'MMMM yyyy').toLowerCase();
  const monthShort = Utilities.formatDate(now, Session.getScriptTimeZone(), 'MMM yyyy').toLowerCase();
  const person = normalizeNameForMatch(user.name);
  table.rows.forEach(row => {
    const member = cleanName(cell(row, map, 'Team Member', ''));
    if (member && normalizeNameForMatch(member) !== person && normalizeNameForMatch(member) !== 'all' && normalizeNameForMatch(member) !== 'organization') return;
    const period = text(cell(row, map, 'Period', '')).toLowerCase();
    if (period && period.indexOf(monthName.split(' ')[0]) < 0 && period.indexOf(monthShort.split(' ')[0]) < 0 && period.indexOf(String(now.getFullYear())) < 0) {
      if (!/this month|current|all/i.test(period)) return;
    }
    const kpi = text(cell(row, map, 'KPI', '')).toLowerCase();
    const target = numberValue(cell(row, map, 'Target', 0));
    if (!kpi || !target) return;
    out[kpi] = target;
    if (/call|outbound|reach/.test(kpi)) out['calls'] = target;
    if (/demo|discover/.test(kpi)) out['discovery'] = target;
    if (/profile|signup/.test(kpi)) out['profiles'] = target;
    if (/follow/.test(kpi)) out['follow-ups'] = target;
    if (/deal/.test(kpi)) out['deals closed'] = target;
    if (/attend/.test(kpi)) out['events attended'] = target;
    if (/conduct/.test(kpi)) out['events conducted'] = target;
    if (/task/.test(kpi)) out['tasks completed'] = target;
  });
  return out;
}

function getDailyLogRows(user) {
  const table = tryTableData('dailyLogs');
  if (table.missing) return [];
  const map = buildHeaderMap(table.headers);

  return table.rows
    .map(row => {
      const meetingsRaw = cell(row, map, 'Meetings', cell(row, map, 'Event Selection / Custom', ''));
      const outbound = readDailyLogNumeric(row, map, ['Outbound Reach', 'Outbound Reach / Calls', 'Calls Made']);
      const demosDedicated = readDailyLogNumeric(row, map, ['Discovery & Demos', 'Discovery and Demos', 'Demos']);
      const profiles = readDailyLogNumeric(row, map, ['Profiles & Signups', 'Profiles and Signups', 'Follow-ups']);
      const deals = readDailyLogNumeric(row, map, ['Deals Closed']);
      return {
        timestamp: cell(row, map, 'Timestamp', ''),
        member: cleanName(cell(row, map, 'Team Member', '')),
        outbound: outbound == null ? 0 : outbound,
        calls: outbound == null ? 0 : outbound,
        demos: (demosDedicated == null ? numberValue(meetingsRaw) : demosDedicated) || numberValue(meetingsRaw),
        profiles: profiles == null ? 0 : profiles,
        followups: profiles == null ? 0 : profiles,
        deals: deals == null ? 0 : deals,
        activities: cleanName(cell(row, map, 'Activities Done', '')),
        meetings: cleanName(meetingsRaw)
      };
    })
    .filter(r => r.member)
    .filter(
      r =>
        normalizeNameForMatch(r.member) ===
        normalizeNameForMatch(user.name)
    );
}

function numberValue(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function metric(current, previous, label) {
  return {
    value: current,
    trend: calcTrend(
      current,
      previous,
      label
    )
  };
}

function calcTrend(current, previous, label) {
  if (previous === 0) {
    return current > 0 ? String(current) + ' this period' : '';
  }

  const pct = Math.round(
    ((current - previous) / previous) * 100
  );

  return (
    (pct >= 0 ? '↑ ' : '↓ ') +
    Math.abs(pct) +
    '% ' +
    label
  );
}

/* =========================
   PERMISSION HELPERS
   ========================= */

function assertDashboardAccess(targetName) {
  const current = getCurrentUser();
  const target = cleanName(targetName || current.name);
  if (canViewAll(current)) return resolveDashboardUser(current, target);
  if (normalizeNameForMatch(target) !== normalizeNameForMatch(current.name)) {
    throw new Error('You can only modify your own workspace.');
  }
  return current;
}

function assertTaskAccess(rowNumber, targetName) {
  const current = getCurrentUser();
  const viewing = assertDashboardAccess(targetName);
  const table = getTableData('tasks');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const r = Number(rowNumber);
  if (!r || r <= (table.headerRow || 1) || r > sheet.getLastRow()) throw new Error('Invalid task row.');
  const row = sheet.getRange(r, 1, 1, headers.length).getValues()[0];
  const assignee = cleanName(cell(row, map, 'Assignee', ''));
  if (!canViewAll(current) && normalizeNameForMatch(assignee) !== normalizeNameForMatch(viewing.name)) {
    throw new Error('This task does not belong to your dashboard.');
  }
  return { viewing: viewing, sheet: sheet, headers: headers, map: map, row: row, _rowNumber: r };
}

function assertEventOverviewAccess(rowNumber, targetName) {
  const current = getCurrentUser();
  const viewing = assertDashboardAccess(targetName);
  const table = getTableData('eventOverview');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const r = Number(rowNumber);
  if (!r || r <= (table.headerRow || 1) || r > sheet.getLastRow()) throw new Error('Invalid Event Overview row.');
  const row = sheet.getRange(r, 1, 1, headers.length).getValues()[0];
  const member = cleanName(cell(row, map, 'Team Member', ''));
  if (!canViewAll(current) && normalizeNameForMatch(member) !== normalizeNameForMatch(viewing.name)) {
    throw new Error('This event does not belong to your dashboard.');
  }
  return { viewing: viewing, sheet: sheet, headers: headers, map: map, row: row };
}

function normalizePriceIsFree(value) {
  const s = text(value).toLowerCase().replace(/\s+/g, '');
  return !s || s === 'free' || s === 'freenow' || s.indexOf('free') === 0;
}

/* =========================
   WRITE OPERATIONS
   EXISTING TABS ONLY
   ========================= */

function addNewTask(payload, skipReload) {
  payload = payload || {};
  ensureWorkspaceColumns();
  takeClaimedEmail_(payload);
  const current = getCurrentUser();
  const requestedAssignee = cleanName(payload.assignee || current.name);
  if (!canViewAll(current) && normalizeNameForMatch(requestedAssignee) !== normalizeNameForMatch(current.name)) {
    throw new Error('Team members can only create tasks for themselves.');
  }
  const table = getTableData('tasks');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const row = new Array(headers.length).fill('');

  setCell(
    row,
    map,
    'Task Description',
    payload.title
  );

  setCell(
    row,
    map,
    'Linked Project Name',
    payload.project
  );

  setCell(
    row,
    map,
    'Assignee',
    requestedAssignee
  );

  setCell(
    row,
    map,
    'Status',
    payload.status || 'To Do'
  );

  setCell(
    row,
    map,
    'Priority',
    payload.priority || 'Medium'
  );

  setCell(
    row,
    map,
    'Due Date',
    payload.dueDate || ''
  );

  setCell(
    row,
    map,
    'Approval / Notes',
    payload.notes || ''
  );

  if (col(map, 'Description') >= 0) setCell(row, map, 'Description', sanitizeRichHtml_(payload.descriptionHtml || ''));
  if (col(map, 'Created By') >= 0) setCell(row, map, 'Created By', cleanName(payload.createdBy || current.name));

  const newRowNumber = sheet.getLastRow() + 1;
  let requestedStatus = normalizeTaskStatus(payload.status || 'To Do');
  if (requestedStatus === 'Completed' && !isFounderUser(current)) {
    requestedStatus = 'Pending Approval';
  }
  setCell(row, map, 'Status', requestedStatus);
  sheet.getRange(newRowNumber, 1, 1, row.length).setValues([row]);
  REQUEST_CACHE.tables.tasks = null;

  let approvalResult = null;
  if (requestedStatus === 'Pending Approval') {
    approvalResult = requestTaskCompletionApproval(newRowNumber, {
      viewing: current,
      sheet: sheet,
      headers: headers,
      map: map,
      row: row,
      _rowNumber: newRowNumber
    });
  }

  if (skipReload) return null;
  return writeOk({
    clientId: payload.clientId || '',
    entity: 'task',
    rowNumber: newRowNumber,
    taskStatusResult: { status: requestedStatus, approval: approvalResult },
    task: {
      id: 'TASK-' + newRowNumber,
      rowNumber: newRowNumber,
      title: cleanName(payload.title),
      project: cleanName(payload.project),
      assignee: requestedAssignee,
      status: requestedStatus,
      priority: cleanName(payload.priority || 'Medium') || 'Medium',
      dueDate: payload.dueDate || '',
      dueISO: payload.dueDate || '',
      dueRaw: payload.dueDate || '',
      notes: cleanName(payload.notes || ''),
      descriptionHtml: sanitizeRichHtml_(payload.descriptionHtml || ''),
      createdBy: cleanName(payload.createdBy || current.name),
      commentCount: 0,
      completed: requestedStatus === 'Completed'
    }
  });
}

function normalizeTaskStatus(value) {
  const s = text(value).toLowerCase().replace(/\s+/g, ' ').trim();
  if (s === 'todo' || s === 'to do' || s === 'not started') return 'To Do';
  if (s === 'in progress' || s === 'doing') return 'In Progress';
  if (s === 'review' || s === 'in review') return 'Review';
  if (s === 'pending approval' || s === 'awaiting approval') return 'Pending Approval';
  if (s === 'completed' || s === 'done' || s === 'complete') return 'Completed';
  return cleanName(value) || 'To Do';
}

function isFounderUser(user) {
  return /founder|co-founder|cofounder/i.test(text(user && user.role));
}

function getPendingTaskApprovalForRow(rowNumber) {
  const approvals = getTaskApprovals();
  return approvals.find(a =>
    Number(a.taskRow) === Number(rowNumber) &&
    ['request raised','pending','pending approval','discussion needed'].indexOf(text(a.status).toLowerCase()) >= 0
  ) || null;
}

function requestTaskCompletionApproval(rowNumber, access) {
  ensureWorkspaceColumns();
  const existing = getPendingTaskApprovalForRow(rowNumber);
  if (existing) return { approval: existing, emailSent: false, emailTo: getApprovalRecipientEmail(), existing: true };

  const map = access.map;
  const row = access.row;
  const taskName = cleanName(cell(row, map, 'Task Description', ''));
  const project = cleanName(cell(row, map, 'Linked Project Name', ''));
  const requester = getCurrentUser();
  const table = getTableData('approvals');
  const sheet = table.sheet;
  const headers = table.headers;
  const approvalMap = buildHeaderMap(headers);
  const rowOut = new Array(headers.length).fill('');
  const approvalId = generateTaskApprovalId(sheet, approvalMap);

  setCell(rowOut, approvalMap, 'Approval ID', approvalId);
  setCell(rowOut, approvalMap, 'Event Name', '');
  setCell(rowOut, approvalMap, 'Requested By', requester.name);
  setCell(rowOut, approvalMap, 'Status', 'Request Raised');
  setCell(rowOut, approvalMap, 'Approved By', '');
  setCell(rowOut, approvalMap, 'Request Type', 'TASK');
  setCell(rowOut, approvalMap, 'Task ID', 'TASK-' + rowNumber);
  setCell(rowOut, approvalMap, 'Task Row', Number(rowNumber));
  setCell(rowOut, approvalMap, 'Task Description', taskName);
  setCell(rowOut, approvalMap, 'Project', project);
  setCell(rowOut, approvalMap, 'Comment', '');

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowOut.length).setValues([rowOut]);
  REQUEST_CACHE.tables.approvals = null;

  const emailResult = sendTaskApprovalEmail(
    approvalId,
    {
      taskName: taskName,
      project: project,
      requester: requester.name,
      rowNumber: Number(rowNumber)
    },
    requester.name
  );

  return {
    approval: {
      id: approvalId,
      taskDescription: taskName,
      project: project,
      requestedBy: requester.name,
      status: 'Request Raised',
      taskRow: Number(rowNumber),
      taskId: 'TASK-' + Number(rowNumber)
    },
    emailSent: emailResult.sent,
    emailTo: emailResult.emailTo,
    existing: false
  };
}

function applyTaskStatusChange(access, requestedStatus) {
  const status = normalizeTaskStatus(requestedStatus);
  const current = getCurrentUser();

  // Only completion requires founder approval. All earlier workflow states are direct.
  if (status === 'Completed' && !isFounderUser(current)) {
    // write after changing the in-memory row
    setCell(access.row, access.map, 'Status', 'Pending Approval');
    access.sheet.getRange(Number(access._rowNumber), 1, 1, access.row.length).setValues([access.row]);
    touchLastModified(access.sheet, Number(access._rowNumber), access.map, 'Task Description');
    const approval = requestTaskCompletionApproval(access._rowNumber, access);
    REQUEST_CACHE.tables.tasks = null;
    return { status: 'Pending Approval', approval: approval };
  }

  setCell(access.row, access.map, 'Status', status);
  access.sheet.getRange(Number(access._rowNumber), 1, 1, access.row.length).setValues([access.row]);
  touchLastModified(access.sheet, Number(access._rowNumber), access.map, 'Task Description');
  REQUEST_CACHE.tables.tasks = null;
  return { status: status, approval: null };
}

function updateTaskStatus(taskRowNumber, newStatus, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  return moveTaskOnBoard(taskRowNumber, newStatus, viewAsName, claimedEmail);
}

function updateTask(payload) {
  payload = payload || {};
  ensureWorkspaceColumns();
  takeClaimedEmail_(payload);
  const access = assertTaskAccess(payload.rowNumber, payload.viewAsName);
  access._rowNumber = Number(payload.rowNumber);
  const map = access.map, row = access.row;
  const previousProjectName = taskProjectFromRow(row, map);

  if (payload.title !== undefined) setCell(row, map, 'Task Description', cleanName(payload.title));
  if (payload.project !== undefined) setCell(row, map, 'Linked Project Name', cleanName(payload.project));
  if (payload.assignee !== undefined && canViewAll(getCurrentUser())) {
    setCell(row, map, 'Assignee', cleanName(payload.assignee));
  }
  if (payload.priority !== undefined) setCell(row, map, 'Priority', cleanName(payload.priority));
  if (payload.dueDate !== undefined) setCell(row, map, 'Due Date', payload.dueDate || '');
  if (payload.notes !== undefined) setCell(row, map, 'Approval / Notes', cleanName(payload.notes));
  if (payload.descriptionHtml !== undefined && col(map, 'Description') >= 0) setCell(row, map, 'Description', sanitizeRichHtml_(payload.descriptionHtml));

  let statusResult = null;
  if (payload.status !== undefined) {
    statusResult = applyTaskStatusChange(access, payload.status);
  } else {
    access.sheet.getRange(Number(payload.rowNumber), 1, 1, row.length).setValues([row]);
    touchLastModified(access.sheet, Number(payload.rowNumber), map, 'Task Description');
    REQUEST_CACHE.tables.tasks = null;
  }
  const newProjectName = taskProjectFromRow(access.row, map);
  const syncedProject = syncProjectProgressForTask_(newProjectName);
  if (canonicalProjectKey(previousProjectName) !== canonicalProjectKey(newProjectName)) {
    syncProjectProgressForTask_(previousProjectName);
  }

  return writeOk({
    clientId: payload.clientId || '',
    entity: 'task',
    rowNumber: Number(payload.rowNumber),
    taskStatusResult: statusResult,
    project: syncedProject
  });
}

function deleteTask(rowNumber, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const access = assertTaskAccess(rowNumber, viewAsName);
  access.sheet.deleteRow(Number(rowNumber));
  REQUEST_CACHE.tables.tasks = null;
  return writeOk({ entity: 'task', rowNumber: Number(rowNumber), deleted: true });
}

function addTaskComment(rowNumber, comment, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const access = assertTaskAccess(rowNumber, viewAsName);
  const current = getCurrentUser();
  const cleanComment = String(comment == null ? '' : comment).trim();
  if (!cleanComment) throw new Error('Comment cannot be empty.');

  const table = getTableData('comments');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const row = new Array(headers.length).fill('');
  const now = new Date();

  setCell(row, map, 'Comment ID', 'COM-' + Utilities.getUuid());
  setCell(row, map, 'Entity Type', 'Task');
  setCell(row, map, 'Entity ID', 'TASK-' + Number(rowNumber));
  setCell(row, map, 'Entity Row', Number(rowNumber));
  setCell(row, map, 'User', current.name);
  setCell(row, map, 'User Email', current.email || '');
  setCell(row, map, 'Comment', cleanComment);
  setCell(row, map, 'Created At', now);
  setCell(row, map, 'Updated At', now);

  const newRowNumber = sheet.getLastRow() + 1;
  sheet.getRange(newRowNumber, 1, 1, row.length).setValues([row]);
  REQUEST_CACHE.tables.comments = null;

  return writeOk({
    entity: 'taskComment',
    rowNumber: Number(rowNumber),
    comment: {
      id: text(cell(row, map, 'Comment ID', '')),
      user: current.name,
      userEmail: current.email || '',
      comment: cleanComment,
      createdAt: serializeDateTime_(now),
      updatedAt: serializeDateTime_(now)
    },
    commentCount: getTaskCommentCounts_(['TASK-' + Number(rowNumber)])['TASK-' + Number(rowNumber)] || 0
  });
}
function addNewProject(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  const current = getCurrentUser();
  if (!canViewAll(current) && payload.lead && normalizeNameForMatch(payload.lead) !== normalizeNameForMatch(current.name)) {
    throw new Error('Team members can only create projects for themselves.');
  }
  const table = getTableData('projects');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const row = new Array(headers.length).fill('');

  setCell(
    row,
    map,
    'Project ID',
    payload.id ||
      generateProjectId(sheet, map)
  );

  setCell(
    row,
    map,
    'Project Name',
    payload.name
  );

  setCell(
    row,
    map,
    'Department / Workstream',
    payload.department || ''
  );

  setCell(
    row,
    map,
    'Lead',
    payload.lead || ''
  );

  setCell(
    row,
    map,
    'Overall Status',
    payload.status || 'Not Started'
  );

  setCell(
    row,
    map,
    'Target Month',
    payload.targetMonth || ''
  );

  if (col(map, 'Progress %') >= 0) {
    setCell(row, map, 'Progress %', Math.max(0, Math.min(100, numberValue(payload.progress))));
  }

  const newRow = appendRowsAtomic(sheet, [row]);
  REQUEST_CACHE.tables.projects = null;
  return writeOk({
    clientId: payload.clientId || '',
    entity: 'project',
    rowNumber: newRow,
    project: {
      id: cleanName(payload.id) || ('PRJ-' + newRow),
      rowNumber: newRow,
      name: cleanName(payload.name),
      department: cleanName(payload.department || ''),
      lead: cleanName(payload.lead || ''),
      status: cleanName(payload.status || 'Not Started'),
      targetMonth: cleanName(payload.targetMonth || ''),
      progress: 0,
      totalTasks: 0,
      completedTasks: 0
    }
  });
}

function updateProject(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  const current = getCurrentUser();
  const table = getTableData('projects');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const rowNumber = Number(payload.rowNumber);
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) throw new Error('Invalid project row.');
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const lead = cleanName(cell(row, map, 'Lead', ''));
  if (!canViewAll(current) && normalizeNameForMatch(lead) !== normalizeNameForMatch(current.name)) throw new Error('This project is not editable from your workspace.');
  if (payload.name !== undefined) setCell(row, map, 'Project Name', cleanName(payload.name));
  if (payload.department !== undefined) setCell(row, map, 'Department / Workstream', cleanName(payload.department));
  if (payload.lead !== undefined) setCell(row, map, 'Lead', cleanName(payload.lead));
  if (payload.status !== undefined) setCell(row, map, 'Overall Status', cleanName(payload.status));
  if (payload.targetMonth !== undefined) setCell(row, map, 'Target Month', cleanName(payload.targetMonth));
  if (payload.progress !== undefined && col(map, 'Progress %') >= 0) {
    setCell(row, map, 'Progress %', Math.max(0, Math.min(100, numberValue(payload.progress))));
  }
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  REQUEST_CACHE.tables.projects = null;
  return writeOk({ clientId: payload.clientId || '', entity: 'project', rowNumber: rowNumber });
}

function deleteProject(rowNumber, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const current = getCurrentUser();
  const table = getTableData('projects');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const r = Number(rowNumber);
  if (!r || r < 2 || r > sheet.getLastRow()) throw new Error('Invalid project row.');
  const row = sheet.getRange(r, 1, 1, headers.length).getValues()[0];
  const lead = cleanName(cell(row, map, 'Lead', ''));
  if (!canViewAll(current) && normalizeNameForMatch(lead) !== normalizeNameForMatch(current.name)) throw new Error('This project is not editable from your workspace.');
  sheet.deleteRow(r);
  REQUEST_CACHE.tables.projects = null;
  return writeOk({ entity: 'project', rowNumber: r, deleted: true });
}

function generateProjectId(
  sheet,
  map
) {
  const existing = [];
  const idCol = col(
    map,
    'Project ID'
  );

  if (
    idCol >= 0 &&
    sheet.getLastRow() > 1
  ) {
    const values = sheet
      .getRange(
        2,
        idCol + 1,
        sheet.getLastRow() - 1,
        1
      )
      .getDisplayValues();

    values.forEach(r => {
      const match = text(r[0]).match(
        /^PRJ-(\d+)$/i
      );

      if (match)
        existing.push(Number(match[1]));
    });
  }

  const next = existing.length
    ? Math.max.apply(null, existing) + 1
    : 1;

  return (
    'PRJ-' +
    String(next).padStart(2, '0')
  );
}

function addNewEvent(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  const table = getTableData('events');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const row = new Array(headers.length).fill('');

  setCell(
    row,
    map,
    'City',
    payload.city || ''
  );

  setCell(
    row,
    map,
    'Event Name',
    payload.name || ''
  );

  setCell(
    row,
    map,
    'Date',
    payload.date || ''
  );

  setCell(
    row,
    map,
    'Time',
    payload.time || ''
  );

  setCell(
    row,
    map,
    'Venue',
    payload.venue || ''
  );

  setCell(
    row,
    map,
    'Registration Status',
    payload.registrationStatus || 'Open'
  );

  setCell(
    row,
    map,
    'Registration Deadline',
    payload.deadline || ''
  );

  setCell(
    row,
    map,
    'Target Audience',
    payload.target || ''
  );

  setCell(
    row,
    map,
    'Key Highlights',
    payload.highlights || ''
  );

  setCell(
    row,
    map,
    'Price',
    payload.price || 'Free'
  );

  setCell(
    row,
    map,
    'Link',
    payload.link || ''
  );

  if (col(map, 'Timestamp') >= 0) setCell(row, map, 'Timestamp', new Date());
  else if (headers[0] && /time|stamp|added/i.test(String(headers[0]))) row[0] = new Date();
  const newRow = appendRowsAtomic(sheet, [row]);
  REQUEST_CACHE.tables.events = null;
  return writeOk({
    clientId: payload.clientId || '',
    entity: 'event',
    rowNumber: newRow,
    event: {
      id: 'EVENT-' + newRow,
      rowNumber: newRow,
      city: cleanName(payload.city || ''),
      name: cleanName(payload.name || ''),
      date: payload.date || '',
      dateISO: payload.date || '',
      time: cleanName(payload.time || ''),
      venue: cleanName(payload.venue || ''),
      price: cleanName(payload.price || 'Free'),
      link: cleanName(payload.link || ''),
      highlights: cleanName(payload.highlights || ''),
      deadline: payload.deadline || ''
    }
  });
}

function submitApproval(eventName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const user = getCurrentUser();
  const events = getEvents(user);
  const event = events.find(e => normalizeNameForMatch(e.name) === normalizeNameForMatch(eventName));
  if (!event) throw new Error('The selected event was not found in Event Discovery.');
  if (normalizePriceIsFree(event.price)) throw new Error('Approval is only required for paid events. Use Add to My Events for free events.');

  const table = getTableData('approvals');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const existing = getApprovals().find(a =>
    normalizeNameForMatch(a.eventName) === normalizeNameForMatch(eventName) &&
    normalizeNameForMatch(a.requestedBy) === normalizeNameForMatch(user.name) &&
    text(a.status).toLowerCase() !== 'rejected'
  );

  if (existing) {
    const emailResult = sendApprovalEmail(existing.id, event, user);
    return writeOk({ entity: 'approval', emailSent: emailResult.sent, emailTo: emailResult.emailTo, existing: true });
  }

  const row = new Array(headers.length).fill('');
  const approvalId = generateApprovalId(sheet, map);
  setCell(row, map, 'Approval ID', approvalId);
  setCell(row, map, 'Event Name', eventName);
  setCell(row, map, 'Requested By', user.name);
  setCell(row, map, 'Status', 'Request Raised');
  setCell(row, map, 'Approved By', '');
  appendRowsAtomic(sheet, [row]);
  REQUEST_CACHE.tables.approvals = null;

  const emailResult = sendApprovalEmail(approvalId, event, user);
  return writeOk({ entity: 'approval', emailSent: emailResult.sent, emailTo: emailResult.emailTo, existing: false, approvalId: approvalId });
}

function getApprovalRecipientEmail() {
  const seen = {};
  const list = [];
  (FOUNDER_APPROVAL_EMAILS || []).forEach(function (raw) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0 || seen[email]) return;
    seen[email] = true;
    list.push(email);
  });
  return list.join(',');
}

function getApprovalSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty(APPROVAL_SECRET_PROPERTY);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(APPROVAL_SECRET_PROPERTY, secret);
  }
  return secret;
}

function createApprovalToken(approvalId, action) {
  const raw = approvalId + '|' + action;
  const bytes = Utilities.computeHmacSha256Signature(raw, getApprovalSecret());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function verifyApprovalToken(approvalId, action, token) {
  return createApprovalToken(approvalId, action) === token;
}

function getWebAppUrl() {
  return ScriptApp.getService().getUrl() || '';
}

function sendApprovalEmail(approvalId, event, requester) {
  const emailTo = getApprovalRecipientEmail();
  if (!emailTo) return { sent: false, emailTo: '' };
  const base = getWebAppUrl();
  if (!base) return { sent: false, emailTo: emailTo };
  const actions = { approve: 'Approve', reject: 'Reject', discuss: 'Discussion Needed' };
  const buttons = Object.keys(actions).map(action => {
    const url = base + '?approvalAction=' + encodeURIComponent(action) + '&approvalId=' + encodeURIComponent(approvalId) + '&token=' + encodeURIComponent(createApprovalToken(approvalId, action));
    const bg = action === 'approve' ? '#16a34a' : (action === 'reject' ? '#dc2626' : '#d97706');
    return '<a href="' + url + '" style="display:inline-block;margin:0 8px 8px 0;padding:10px 15px;border-radius:8px;background:' + bg + ';color:#fff;text-decoration:none;font-weight:600">' + actions[action] + '</a>';
  }).join('');
  const subject = 'Nucleo Event Approval Request — ' + event.name;
  const html = '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827"><h2>Event Approval Request</h2><p><strong>Event:</strong> ' + escapeHtmlServer(event.name) + '</p><p><strong>Requested by:</strong> ' + escapeHtmlServer(requester.name) + '</p><p><strong>Date:</strong> ' + escapeHtmlServer(event.date) + '<br><strong>City:</strong> ' + escapeHtmlServer(event.city) + '<br><strong>Price:</strong> ' + escapeHtmlServer(event.price) + '</p><p>Please choose an action:</p><div>' + buttons + '</div><p style="font-size:12px;color:#6b7280">Approval ID: ' + escapeHtmlServer(approvalId) + '</p></div>';
  MailApp.sendEmail({ to: emailTo, subject: subject, htmlBody: html, body: 'Event approval requested: ' + event.name + ' by ' + requester.name + '. Approval ID: ' + approvalId });
  return { sent: true, emailTo: emailTo };
}

function escapeHtmlServer(value) {
  return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function handleApprovalAction(approvalId, action, token) {
  const allowed = ['approve','reject','discuss'];
  if (allowed.indexOf(action) < 0 || !verifyApprovalToken(approvalId, action, token)) {
    return HtmlService.createHtmlOutput('<div style="font-family:Arial;padding:40px;text-align:center"><h2>Invalid approval link</h2><p>This approval action could not be verified.</p></div>');
  }
  const approvals = getApprovals();
  const taskApprovals = getTaskApprovals();
  const isTask = taskApprovals.some(a => a.id === approvalId);

  if (isTask) {
    const result = updateTaskApprovalStatus(approvalId, action);
    const title = action === 'approve' ? 'Approved' : (action === 'reject' ? 'Rejected / Sent Back' : 'Discussion Needed');
    const color = action === 'approve' ? '#16a34a' : (action === 'reject' ? '#dc2626' : '#d97706');
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:70px auto;padding:28px;text-align:center;border:1px solid #e5e7eb;border-radius:16px">' +
      '<div style="font-size:36px;color:' + color + '">✓</div>' +
      '<h2>Task ' + title + '</h2>' +
      '<p>' + escapeHtmlServer(result.taskName) + '</p>' +
      '<p style="color:#6b7280">The Nucleo task workflow has been updated.</p>' +
      '</div>'
    ).setTitle('Nucleo Task Approval');
  }

  const result = updateApprovalStatus(approvalId, action);
  const title = action === 'approve' ? 'Approved' : (action === 'reject' ? 'Rejected' : 'Discussion Needed');
  const color = action === 'approve' ? '#16a34a' : (action === 'reject' ? '#dc2626' : '#d97706');
  return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;max-width:560px;margin:70px auto;padding:28px;text-align:center;border:1px solid #e5e7eb;border-radius:16px"><div style="font-size:36px;color:' + color + '">✓</div><h2>Approval ' + title + '</h2><p>' + escapeHtmlServer(result.eventName) + '</p><p style="color:#6b7280">The Nucleo approval tracker has been updated.</p></div>').setTitle('Nucleo Approval');
}

function updateApprovalStatus(approvalId, action) {
  const table = getTableData('approvals');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const idCol = col(map, 'Approval ID');
  if (idCol < 0) throw new Error('Approval ID column was not found.');
  const values = sheet.getRange(2, idCol + 1, Math.max(sheet.getLastRow() - 1, 0), 1).getDisplayValues();
  let rowNumber = 0;
  for (let i = 0; i < values.length; i++) { if (text(values[i][0]) === approvalId) { rowNumber = i + 2; break; } }
  if (!rowNumber) throw new Error('Approval request was not found.');
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const status = action === 'approve' ? 'Approved' : (action === 'reject' ? 'Rejected' : 'Discussion Needed');
  setCell(row, map, 'Status', status);
  const actorEmail = (Session.getActiveUser().getEmail() || '').trim();
  setCell(row, map, 'Approved By', actorEmail || 'Email Action');
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  REQUEST_CACHE.tables.approvals = null;

  if (status === 'Approved') {
    const eventName = cleanName(cell(row, map, 'Event Name', ''));
    const requestedBy = cleanName(cell(row, map, 'Requested By', ''));
    const event = getEvents({name:'Approval Action',role:'Founder'}).find(e => normalizeNameForMatch(e.name) === normalizeNameForMatch(eventName));
    if (event && requestedBy) upsertEventOverviewForMember(requestedBy, event, 'Registered');
  }
  return { eventName: cleanName(cell(row, map, 'Event Name', '')), status: status };
}


function generateTaskApprovalId(sheet, map) {
  const idCol = col(map, 'Approval ID');
  const values = idCol >= 0 && sheet.getLastRow() > 1
    ? sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    : [];
  let max = 0;
  values.forEach(r => {
    const m = text(r[0]).match(/^TAPP-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'TAPP-' + (max + 1);
}

function sendTaskApprovalEmail(approvalId, task, requester) {
  const emailTo = getApprovalRecipientEmail();
  if (!emailTo) return {sent:false, emailTo:''};

  const base = getWebAppUrl();
  if (!base) return {sent:false, emailTo:emailTo};

  const actions = {approve:'Approve Task', reject:'Reject / Send Back', discuss:'Discussion Needed'};
  const buttons = Object.keys(actions).map(action => {
    const url = base +
      '?approvalAction=' + encodeURIComponent(action) +
      '&approvalId=' + encodeURIComponent(approvalId) +
      '&token=' + encodeURIComponent(createApprovalToken(approvalId, action));

    const bg = action === 'approve' ? '#16a34a' : (action === 'reject' ? '#dc2626' : '#d97706');
    return '<a href="' + url + '" style="display:inline-block;margin:0 8px 8px 0;padding:11px 16px;border-radius:8px;background:' + bg + ';color:#fff;text-decoration:none;font-weight:600">' + actions[action] + '</a>';
  }).join('');

  const subject = 'Nucleo Task Completion Approval — ' + task.taskName;
  const html =
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">' +
    '<h2>Task Completion Approval</h2>' +
    '<p><strong>Task:</strong> ' + escapeHtmlServer(task.taskName) + '</p>' +
    '<p><strong>Project:</strong> ' + escapeHtmlServer(task.project || '—') + '</p>' +
    '<p><strong>Requested by:</strong> ' + escapeHtmlServer(requester) + '</p>' +
    '<p>The task has been moved to <strong>Pending Approval</strong>. Please review the completion and choose an action:</p>' +
    '<div>' + buttons + '</div>' +
    '<p style="font-size:12px;color:#6b7280">Approval ID: ' + escapeHtmlServer(approvalId) + '</p>' +
    '</div>';

  MailApp.sendEmail({
    to: emailTo,
    subject: subject,
    htmlBody: html,
    body: 'Task completion approval requested: ' + task.taskName + ' by ' + requester + '. Approval ID: ' + approvalId
  });

  return {sent:true, emailTo:emailTo};
}

function updateTaskApprovalStatus(approvalId, action) {
  const table = getTableData('approvals');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const idCol = col(map, 'Approval ID');
  if (idCol < 0) throw new Error('Approval ID column was not found.');

  const values = sheet.getLastRow() > 1
    ? sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    : [];
  let rowNumber = 0;
  for (let i = 0; i < values.length; i++) {
    if (text(values[i][0]) === approvalId) { rowNumber = i + 2; break; }
  }
  if (!rowNumber) throw new Error('Task approval request was not found.');

  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const taskRow = Number(cell(row, map, 'Task Row', 0));
  const status = action === 'approve'
    ? 'Approved'
    : (action === 'reject' ? 'Rejected' : 'Discussion Needed');

  setCell(row, map, 'Status', status);
  const actorEmail = (Session.getActiveUser().getEmail() || '').trim();
  setCell(row, map, 'Approved By', actorEmail || 'Email Action');

  if (action === 'discuss') {
    setCell(row, map, 'Comment', 'Discussion Needed — founder requested discussion before completion.');
  }

  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

  if (taskRow >= 2) {
    const taskTable = getTableData('tasks');
    const taskSheet = taskTable.sheet;
    const taskHeaders = taskTable.headers;
    const taskMap = buildHeaderMap(taskHeaders);
    if (taskRow <= taskSheet.getLastRow()) {
      const task = taskSheet.getRange(taskRow, 1, 1, taskHeaders.length).getValues()[0];
      if (action === 'approve') {
        setCell(task, taskMap, 'Status', 'Completed');
      } else if (action === 'reject') {
        setCell(task, taskMap, 'Status', 'Review');
      }
      taskSheet.getRange(taskRow, 1, 1, task.length).setValues([task]);
      touchLastModified(taskSheet, taskRow, taskMap, 'Task Description');
      REQUEST_CACHE.tables.tasks = null;
    }
  }

  REQUEST_CACHE.tables.approvals = null;
  return {
    taskName: cleanName(cell(row, map, 'Task Description', '')),
    project: cleanName(cell(row, map, 'Project', '')),
    taskRow: taskRow,
    taskId: taskRow >= 2 ? 'TASK-' + taskRow : '',
    status: status
  };
}

function generateApprovalId(
  sheet,
  map
) {
  const ids = [];
  const idCol = col(
    map,
    'Approval ID'
  );

  if (
    idCol >= 0 &&
    sheet.getLastRow() > 1
  ) {
    const values = sheet
      .getRange(
        2,
        idCol + 1,
        sheet.getLastRow() - 1,
        1
      )
      .getDisplayValues();

    values.forEach(r => {
      const match = text(r[0]).match(
        /^APP-(\d+)$/i
      );

      if (match)
        ids.push(Number(match[1]));
    });
  }

  if (!ids.length) {
    return 'APP-' + Date.now();
  }

  return (
    'APP-' +
    (Math.max.apply(null, ids) + 1)
  );
}

function upsertEventOverviewForMember(memberName, event, status) {
  const table = getTableData('eventOverview');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const existing = getTableData('eventOverview').rows;
  const memberKey = normalizeNameForMatch(memberName);
  const eventKey = normalizeNameForMatch(event.name);
  for (let i = 0; i < existing.length; i++) {
    const row = existing[i];
    if (normalizeNameForMatch(cell(row, map, 'Team Member', '')) === memberKey && normalizeNameForMatch(cell(row, map, 'Event Name', '')) === eventKey) {
      const updated = row.slice();
      setCell(updated, map, 'Status', status || 'Registered');
      setCell(updated, map, 'Date', event.dateISO || event.date || '');
      setCell(updated, map, 'City', event.city || '');
      setCell(updated, map, 'Link', event.link || '');
      if (col(map,'Time') >= 0) setCell(updated, map, 'Time', event.time || '');
      if (col(map,'Venue') >= 0) setCell(updated, map, 'Venue', event.venue || '');
      sheet.getRange(tableRowNumber(table, i), 1, 1, updated.length).setValues([updated]);
      REQUEST_CACHE.tables.eventOverview = null;
      return tableRowNumber(table, i);
    }
  }
  const row = new Array(headers.length).fill('');
  setCell(row, map, 'Team Member', memberName);
  setCell(row, map, 'Event Name', event.name);
  setCell(row, map, 'Date', event.dateISO || event.date || '');
  setCell(row, map, 'Status', status || 'Registered');
  setCell(row, map, 'City', event.city || '');
  setCell(row, map, 'Link', event.link || '');
  if (col(map,'Time') >= 0) setCell(row, map, 'Time', event.time || '');
  if (col(map,'Venue') >= 0) setCell(row, map, 'Venue', event.venue || '');
  const newRowNumber = sheet.getLastRow() + 1;
  sheet.getRange(newRowNumber, 1, 1, row.length).setValues([row]);
  touchLastModified(sheet, newRowNumber, map, 'Event Name');
  REQUEST_CACHE.tables.eventOverview = null;
  return newRowNumber;
}

function addEventOverview(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  const current = getCurrentUser();
  const target = assertDashboardAccess(payload.viewAsName || current.name);
  const event = {
    name: cleanName(payload.name),
    date: payload.date || '',
    dateISO: payload.date || '',
    status: normalizeOverviewEventStatusServer(payload.status) || 'In Plan',
    city: cleanName(payload.city),
    link: cleanName(payload.link),
    time: cleanName(payload.time),
    venue: cleanName(payload.venue)
  };
  if (!event.name) throw new Error('Event name is required.');
  upsertEventOverviewForMember(target.name, event, event.status);
  return writeOk({
    clientId: payload.clientId || '',
    entity: 'eventOverview',
    event: Object.assign({}, event, { status: event.status, registrationStatus: event.status })
  });
}

function updateEventOverview(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  const access = assertEventOverviewAccess(payload.rowNumber, payload.viewAsName);
  const row = access.row, map = access.map;
  if (payload.name !== undefined) setCell(row, map, 'Event Name', cleanName(payload.name));
  if (payload.date !== undefined) setCell(row, map, 'Date', payload.date || '');
  if (payload.status !== undefined) setCell(row, map, 'Status', normalizeOverviewEventStatusServer(payload.status) || 'In Plan');
  if (payload.city !== undefined) setCell(row, map, 'City', cleanName(payload.city));
  if (payload.link !== undefined) setCell(row, map, 'Link', cleanName(payload.link));
  if (payload.time !== undefined && col(map,'Time') >= 0) setCell(row, map, 'Time', cleanName(payload.time));
  if (payload.venue !== undefined && col(map,'Venue') >= 0) setCell(row, map, 'Venue', cleanName(payload.venue));
  if (payload.notes !== undefined && col(map,'Notes') >= 0) setCell(row, map, 'Notes', cleanName(payload.notes));
  access.sheet.getRange(Number(payload.rowNumber), 1, 1, row.length).setValues([row]);
  touchLastModified(access.sheet, Number(payload.rowNumber), map, 'Event Name');
  REQUEST_CACHE.tables.eventOverview = null;
  return writeOk({ clientId: payload.clientId || '', entity: 'eventOverview', rowNumber: Number(payload.rowNumber) });
}

function deleteEventOverview(rowNumber, viewAsName, claimedEmail) {
  takeClaimedEmail_(claimedEmail);
  const access = assertEventOverviewAccess(rowNumber, viewAsName);
  access.sheet.deleteRow(Number(rowNumber));
  REQUEST_CACHE.tables.eventOverview = null;
  return writeOk({ entity: 'eventOverview', rowNumber: Number(rowNumber), deleted: true });
}

function addTeamMember(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  const current = getCurrentUser();
  if (!canViewAll(current)) throw new Error('Only an admin-level user can add team members.');
  const table = getTableData('team');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const row = new Array(headers.length).fill('');

  setCell(
    row,
    map,
    'Name',
    payload.name
  );

  setCell(
    row,
    map,
    'Role',
    payload.role || 'Team Member'
  );

  setCell(
    row,
    map,
    'Notes',
    payload.notes || ''
  );
  setCell(row, map, 'Email', payload.email || '');
  setCell(row, map, 'Access', payload.access || 'Task based');

  const newMemberRow = appendRowsAtomic(sheet, [row]);
  REQUEST_CACHE.tables.team = null;
  return writeOk({
    clientId: payload.clientId || '',
    entity: 'member',
    rowNumber: newMemberRow,
    member: {
      name: cleanName(payload.name),
      role: cleanName(payload.role || 'Team Member'),
      email: cleanName(payload.email || ''),
      access: cleanName(payload.access || 'Task based')
    }
  });
}

/**
 * Uses the existing Daily Logs tab.
 * It NEVER creates Activity_Log.
 */
function submitDailyLog(payload) {
  payload = payload || {};
  takeClaimedEmail_(payload);
  ensureWorkspaceColumns();
  REQUEST_CACHE.tables.dailyLogs = null;

  const currentUser = getCurrentUser();
  const user = assertDashboardAccess(payload.viewAsName || currentUser.name);
  const profile = getRoleProfile(user);
  const isSales = profile.hasSales === true;

  const taskTable = getTableData('tasks');
  const taskSheet = taskTable.sheet;
  const taskMap = buildHeaderMap(taskTable.headers);

  const outbound = numberValue(payload.outbound != null ? payload.outbound : payload.calls);
  const demos = numberValue(payload.demos != null ? payload.demos : 0);
  const profiles = numberValue(payload.profiles != null ? payload.profiles : payload.followups);
  const deals = numberValue(payload.deals);
  const meetings = String(demos || text(payload.meetings || payload.custom) || '');
  const activitiesInput = text(payload.activities);

  /* Sales funnel fields are cumulative daily increments. Zero is a valid entry. */

  const statusCol = col(taskMap, 'Status');
  const taskUpdates = Array.isArray(payload.taskUpdates) ? payload.taskUpdates : [];

  if (statusCol >= 0 && taskUpdates.length) {
    taskUpdates.forEach(u => {
      const access = assertTaskAccess(u.rowNumber, user.name);
      const r = Number(u.rowNumber);
      const s = cleanName(u.status);

      if (r >= 2 && s) {
        const access = assertTaskAccess(r, user.name);
        access._rowNumber = r;
        applyTaskStatusChange(access, s);
      }
    });

    REQUEST_CACHE.tables.tasks = null;
  }

  if (Array.isArray(payload.additionalTasks)) {
    const extras = payload.additionalTasks.filter(t => cleanName(t.title));
    if (extras.length) {
      const taskTable = getTableData('tasks');
      const taskHeaders = taskTable.headers;
      const extraMap = buildHeaderMap(taskHeaders);
      const extraRows = extras.map(t => {
        const extra = new Array(taskHeaders.length).fill('');
        setCell(extra, extraMap, 'Task Description', cleanName(t.title));
        setCell(extra, extraMap, 'Linked Project Name', cleanName(t.project || ''));
        setCell(extra, extraMap, 'Assignee', user.name);
        setCell(extra, extraMap, 'Status', normalizeTaskStatus(t.status || 'In Progress'));
        setCell(extra, extraMap, 'Priority', cleanName(t.priority || 'Medium') || 'Medium');
        setCell(extra, extraMap, 'Approval / Notes', 'Added from Daily Update');
        return extra;
      });
      appendRowsAtomic(taskTable.sheet, extraRows);
      REQUEST_CACHE.tables.tasks = null;
    }
  }

  const completedUpdates = taskUpdates.filter(
    t => String(t.status || '').toLowerCase() === 'completed'
  ).length;

  const taskSummary = taskUpdates.length
    ? 'Tasks updated: ' + taskUpdates.length +
      ' · ' + completedUpdates + ' completed'
    : '';

  const combinedActivities = [activitiesInput, taskSummary]
    .filter(Boolean)
    .join(' · ');

  const table = getTableData('dailyLogs');
  const sheet = table.sheet;
  const headers = table.headers;
  const map = buildHeaderMap(headers);
  const row = new Array(headers.length).fill('');

  setCell(row, map, 'Timestamp', payload.timestamp ? new Date(payload.timestamp) : new Date());
  setCell(row, map, 'Team Member', user.name);
  setCell(row, map, 'Calls Made', outbound);
  setCell(row, map, 'Follow-ups', profiles);
  setCell(row, map, 'Deals Closed', deals);
  if (col(map, 'Outbound Reach') >= 0) setCell(row, map, 'Outbound Reach', outbound);
  if (col(map, 'Discovery & Demos') >= 0) setCell(row, map, 'Discovery & Demos', demos);
  if (col(map, 'Profiles & Signups') >= 0) setCell(row, map, 'Profiles & Signups', profiles);

  if (col(map, 'Meetings') >= 0) {
    setCell(row, map, 'Meetings', meetings);
  } else {
    setCell(row, map, 'Event Selection / Custom', meetings);
  }

  if (col(map, 'Activities Done') >= 0) {
    setCell(row, map, 'Activities Done', combinedActivities);
  }

  appendRowsAtomic(sheet, [row]);
  REQUEST_CACHE.tables.dailyLogs = null;
  REQUEST_CACHE.tables.tasks = null;
  let kpis = null;
  let tasksOut = [];
  try { kpis = calculateKPIs(user); } catch (kpiErr) { kpis = null; }
  try { tasksOut = getTasks(user); } catch (taskErr) { tasksOut = []; }
  return writeOk({
    clientId: payload.clientId || '',
    entity: 'dailyLog',
    kpis: kpis,
    tasks: tasksOut,
    activity: {
      user: user.name,
      text: combinedActivities || ('Log · ' + outbound + ' outbound'),
      activitiesHtml: sanitizeDailyLogHtmlServer_(activitiesInput),
      activitiesText: stripHtmlTextServer_(activitiesInput),
      time: 'Just now',
      calls: outbound,
      outbound: outbound,
      demos: demos,
      followups: profiles,
      profiles: profiles,
      deals: deals
    }
  });
}

function setCell(
  row,
  map,
  header,
  value
) {
  const index = col(map, header);

  if (index >= 0) {
    row[index] =
      value === undefined ||
      value === null
        ? ''
        : value;
  }
}

/**
 * Stores the last in-app edit timestamp as an invisible cell note.
 * This does not add columns or change the visible sheet structure.
 */
function touchLastModified(sheet, rowNumber, map, anchorHeader) {
  const index = col(map, anchorHeader);
  if (index < 0 || !rowNumber) return;
  const range = sheet.getRange(Number(rowNumber), index + 1);
  const existing = range.getNote() || '';
  const marker = '[NUCLEO_LAST_MODIFIED:';
  const timestamp = new Date().toISOString();
  const cleaned = existing.replace(/\s*\[NUCLEO_LAST_MODIFIED:[^\]]+\]\s*/g, '\n').trim();
  range.setNote((cleaned ? cleaned + '\n\n' : '') + marker + timestamp + ']');
}

function readLastModifiedBulk(sheet, rowCount, anchorColumnIndex, startRow) {
  if (!sheet || rowCount <= 0 || anchorColumnIndex < 0) return [];
  const from = startRow || 2;

  const notes = sheet
    .getRange(from, anchorColumnIndex + 1, rowCount, 1)
    .getNotes();

  return notes.map(row => {
    const note = row && row[0] ? String(row[0]) : '';
    const match = note.match(/\[NUCLEO_LAST_MODIFIED:([^\]]+)\]/);
    if (!match) return 0;

    const ms = new Date(match[1]).getTime();
    return isNaN(ms) ? 0 : ms;
  });
}

function readLastModified(sheet, rowNumber, map, anchorHeader) {
  const index = col(map, anchorHeader);
  if (index < 0 || !rowNumber) return 0;
  const note = sheet.getRange(Number(rowNumber), index + 1).getNote() || '';
  const match = note.match(/\[NUCLEO_LAST_MODIFIED:([^\]]+)\]/);
  if (!match) return 0;
  const ms = new Date(match[1]).getTime();
  return isNaN(ms) ? 0 : ms;
}

/* =========================
   DISCOVERY
   ========================= */

function getDiscoveryEvents(user) {
  // Event Discovery is global, but expired event dates are no longer discoverable.
  // Event Overview is intentionally untouched and can retain historical events.
  const events = getEvents(user);
  const todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return events.filter(event => !event.dateISO || event.dateISO >= todayKey);
}

function getDiscoveryData(claimedEmail) {
  try {
    takeClaimedEmail_(claimedEmail);
    const user = getCurrentUser();
    const events = getDiscoveryEvents(user);
    const allApprovals = getApprovals();
    const approvals = canViewAll(user)
      ? allApprovals
      : allApprovals.filter(a => normalizeNameForMatch(a.requestedBy) === normalizeNameForMatch(user.name));
    return jsonSafe({
      user: user,
      events: events,
      approvals: approvals,
      metrics: {
        totalRequests: approvals.length,
        totalApproved: approvals.filter(a => text(a.status).toLowerCase() === 'approved').length,
        pending: approvals.filter(a => ['request raised','pending'].indexOf(text(a.status).toLowerCase()) >= 0).length,
        rejected: approvals.filter(a => text(a.status).toLowerCase() === 'rejected').length
      },
      alerts: getEventAlerts()
    });
  } catch (err) {
    return jsonSafe({ __nucleoError: String(err && err.message ? err.message : err) });
  }
}

/* =========================
   DIAGNOSTIC
   ========================= */

function testDatabaseConnection() {
  const ss = getDatabase();

  const result = {
    spreadsheetName: ss.getName(),
    spreadsheetId: ss.getId(),
    tabs: ss.getSheets().map(
      s => s.getName()
    ),
    tables: {}
  };

  Object.keys(TABLES).forEach(key => {
    try {
      const sheet = getTableSheet(key);

      result.tables[key] = {
        found: true,
        tabName: sheet.getName(),
        headers: getHeaders(sheet, REQUEST_CACHE.headerRows[key] || 1)
      };
    } catch (err) {
      result.tables[key] = {
        found: false,
        error: err.message
      };
    }
  });

  return result;
}


/**
 * Returns the current multi-user access configuration for troubleshooting.
 * This does not grant Google Web App access; deployment settings control that.
 */
function getAccessDiagnostics() {
  const user = getCurrentUser();
  const out = {
    signedInAs: { name: user.name, role: user.role, access: user.access },
    webAppUrl: getWebAppUrl(),
    productionSpreadsheet: String(CONFIG.PRODUCTION_SPREADSHEET_ID || '(bound workbook)'),
    archiveSpreadsheet: String(CONFIG.ARCHIVE_SPREADSHEET_ID || '(not configured)'),
    note: 'Google Web App access itself must be set in Deploy > Manage deployments > Web app > Anyone with Google account.'
  };
  if (canViewAll(user)) {
    out.registeredAccounts = getTeam().map(m => ({
      name: m.name,
      role: m.role,
      access: m.access
    }));
  }
  return out;
}

/**
 * Events-tab only archival.
 * Never touches Event Overview, Tasks, Daily logs, or any other tab.
 * Column A = Timestamp. Rows younger than 30 days stay in the live Events sheet.
 * Older rows are copied to the archive workbook Events tab, then removed from live.
 */
function archiveOldDiscoveryEvents() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) {
    return jsonSafe({ ok: false, skipped: 'busy' });
  }
  try {
    REQUEST_CACHE = { sheets: {}, tables: {}, headers: {}, headerRows: {} };
    const located = locateTable('events');
    const sheet = located.sheet;
    const headerRow = located.headerRow || 1;
    const last = sheet.getLastRow();
    const lastCol = Math.min(sheet.getLastColumn() || 0, 40);
    if (last <= headerRow || !lastCol) {
      return jsonSafe({ ok: true, archived: 0, kept: 0 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const values = sheet.getRange(headerRow + 1, 1, last - headerRow, lastCol).getValues();
    const keep = [];
    const move = [];

    values.forEach(row => {
      const ts = toDate(row[0]);
      if (!ts) {
        keep.push(row);
        return;
      }
      ts.setHours(0, 0, 0, 0);
      const daysOld = Math.round((today.getTime() - ts.getTime()) / 86400000);
      if (daysOld >= EVENTS_KEEP_RECENT_DAYS) move.push(row);
      else keep.push(row);
    });

    if (!move.length) {
      return jsonSafe({ ok: true, archived: 0, kept: keep.length, keepRecentDays: EVENTS_KEEP_RECENT_DAYS });
    }

    const archiveId = String(CONFIG.ARCHIVE_SPREADSHEET_ID || ARCHIVE_SPREADSHEET_ID || '').trim();
    if (!archiveId) {
      return jsonSafe({
        ok: true,
        archived: 0,
        kept: keep.length,
        skipped: 'Archive spreadsheet is not configured on this production instance.'
      });
    }

    const archiveSs = SpreadsheetApp.openById(archiveId);
    let dest = null;
    archiveSs.getSheets().forEach(s => {
      if (sheetNameKey(s.getName()) === 'events') dest = s;
    });
    if (!dest) {
      return jsonSafe({
        ok: false,
        archived: 0,
        error: 'Archive spreadsheet has no Events tab. Live Events rows were not moved.'
      });
    }

    appendRowsAtomic(dest, move);

    if (keep.length) {
      sheet.getRange(headerRow + 1, 1, keep.length, lastCol).setValues(keep);
    }
    const leftover = values.length - keep.length;
    if (leftover > 0) {
      sheet.getRange(headerRow + 1 + keep.length, 1, leftover, lastCol).clearContent();
    }
    REQUEST_CACHE.tables.events = null;
    return jsonSafe({
      ok: true,
      archived: move.length,
      kept: keep.length,
      keepRecentDays: EVENTS_KEEP_RECENT_DAYS,
      archiveSpreadsheetId: archiveId
    });
  } catch (err) {
    return jsonSafe({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}