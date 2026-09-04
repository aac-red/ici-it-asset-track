import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { exportToCSV } from '../shared/csvExport.js';
import { fetchRecentActivity } from './dashboardApi.js';

// ===== Local helpers =====
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatRelativeTime(isoString) {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ===== Constants =====
const ACTION_LABELS = {
  item_created: 'Item Created',
  item_updated: 'Item Updated',
  item_deleted: 'Item Deleted',
  item_issued: 'Item Issued',
  item_returned: 'Item Returned',
};

const ACTION_BADGE = {
  item_created: 'badge-available',
  item_updated: 'badge-maintenance',
  item_deleted: 'badge-overdue',
  item_issued: 'badge-borrowed',
  item_returned: 'badge-returned',
};

// ===== State =====
let currentProfile = null;
let contentSlot = null;
let topbarActions = null;
let searchDebounceTimer = null;
let allLogs = [];

const state = {
  search: '',
  action: '',
  dateFrom: '',
  dateTo: '',
};

// ===== Main init =====
(async function init() {
  try {
    currentProfile = await requireAuth({ requireAdmin: true });
    const shell = mountShell(currentProfile, 'activity-log', 'Activity Log');
    contentSlot = shell.contentSlot;
    topbarActions = shell.topbarActions;
    renderPageShell();
    await loadAndRender();
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to initialize activity log', 'error');
  }
})();

// ===== Render page shell =====
function renderPageShell() {
  // Topbar actions
  topbarActions.innerHTML = `
    <button class="btn btn-secondary" id="exportCsvBtn">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Export CSV</span>
    </button>
  `;

  // Main content
  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="searchInput" placeholder="Search by actor, action, or detail…" aria-label="Search">
      </div>
      <div class="toolbar-filters">
        <select id="actionFilter" aria-label="Filter by action">
          <option value="">All actions</option>
          <option value="item_created">Item Created</option>
          <option value="item_updated">Item Updated</option>
          <option value="item_deleted">Item Deleted</option>
          <option value="item_issued">Item Issued</option>
          <option value="item_returned">Item Returned</option>
        </select>
        <input type="date" id="dateFrom" aria-label="From date" title="From date">
        <input type="date" id="dateTo" aria-label="To date" title="To date">
      </div>
    </div>

    <div class="list-meta">
      <span id="resultCount">Loading…</span>
    </div>

    <div class="table-wrap">
      <table class="data-table" data-mobile-cards>
        <thead>
          <tr>
            <th>Actor</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Details</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody id="logTbody"></tbody>
      </table>
    </div>
  `;

  // Wire events
  const searchInput = document.getElementById('searchInput');
  const actionFilter = document.getElementById('actionFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  const exportBtn = document.getElementById('exportCsvBtn');

  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      applyFiltersAndRender();
    }, 300);
  });

  actionFilter?.addEventListener('change', (e) => {
    state.action = e.target.value;
    applyFiltersAndRender();
  });

  dateFrom?.addEventListener('change', (e) => {
    state.dateFrom = e.target.value;
    applyFiltersAndRender();
  });

  dateTo?.addEventListener('change', (e) => {
    state.dateTo = e.target.value;
    applyFiltersAndRender();
  });

  exportBtn?.addEventListener('click', handleExport);
}

// ===== Load and render =====
async function loadAndRender() {
  try {
    allLogs = await fetchRecentActivity(500);
    applyFiltersAndRender();
  } catch (err) {
    console.error('Failed to load activity log:', err);
    contentSlot.innerHTML = `
      <div class="empty-state">
        <h3>Failed to load activity log</h3>
        <p>${escapeHTML(err.message)}</p>
      </div>
    `;
    showToast('Failed to load activity log', 'error');
  }
}

// ===== Filter and render =====
function applyFiltersAndRender() {
  let filtered = allLogs;

  // Filter by action
  if (state.action) {
    filtered = filtered.filter(a => a.action === state.action);
  }

  // Filter by date range
  if (state.dateFrom) {
    filtered = filtered.filter(a => a.created_at.slice(0, 10) >= state.dateFrom);
  }
  if (state.dateTo) {
    filtered = filtered.filter(a => a.created_at.slice(0, 10) <= state.dateTo);
  }

  // Filter by search
  if (state.search) {
    const searchLower = state.search.toLowerCase();
    filtered = filtered.filter(a => {
      const actor = a.profiles?.full_name || 'System';
      const detailsStr = JSON.stringify(a.details || {});
      return actor.toLowerCase().includes(searchLower) ||
             a.action.toLowerCase().includes(searchLower) ||
             (a.entity_type || '').toLowerCase().includes(searchLower) ||
             detailsStr.toLowerCase().includes(searchLower);
    });
  }

  renderRows(filtered);
}

// ===== Render rows =====
function renderRows(rows) {
  const tbody = document.getElementById('logTbody');
  const resultCount = document.getElementById('resultCount');

  if (!tbody) return;

  // Update count
  if (resultCount) {
    resultCount.textContent = `Showing ${rows.length} of ${allLogs.length} entries`;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="5"><div class="empty-state"><p>No activity matches your filters.</p></div></td></tr>
    `;
    return;
  }

  let html = '';
  for (const row of rows) {
    const actor = row.profiles?.full_name || 'System';
    const actionLabel = ACTION_LABELS[row.action] || row.action;
    const badgeClass = ACTION_BADGE[row.action] || 'badge';
    const entityType = row.entity_type || '';
    const entityId = row.entity_id || '';
    const truncatedId = entityId.length > 8 ? entityId.slice(0, 8) + '…' : entityId;
    const entityDisplay = entityType ? `${entityType} ${truncatedId}` : truncatedId;

    // Format details
    let detailsHtml = '';
    const details = row.details || {};
    if (row.action === 'item_issued' && details.item_name && details.borrower_name) {
      detailsHtml = `${escapeHTML(details.item_name)} → ${escapeHTML(details.borrower_name)}`;
    } else if (row.action === 'item_created' && details.name) {
      detailsHtml = escapeHTML(details.name);
    } else if (row.action === 'item_updated' && details.name) {
      detailsHtml = escapeHTML(details.name);
    } else if (row.action === 'item_deleted' && details.name) {
      detailsHtml = escapeHTML(details.name);
    } else if (row.action === 'item_returned' && details.item_name) {
      detailsHtml = escapeHTML(details.item_name);
    } else {
      const jsonStr = JSON.stringify(details);
      detailsHtml = jsonStr.length > 80 ? jsonStr.slice(0, 80) + '…' : jsonStr;
    }

    const createdDate = new Date(row.created_at);
    const fullDate = createdDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    html += `
      <tr>
        <td data-label="Actor">${escapeHTML(actor)}</td>
        <td data-label="Action"><span class="badge ${badgeClass}">${escapeHTML(actionLabel)}</span></td>
        <td data-label="Entity">${escapeHTML(entityDisplay)}</td>
        <td data-label="Details">${detailsHtml}</td>
        <td data-label="Time" style="white-space:nowrap;">
          ${formatRelativeTime(row.created_at)}
          <span class="cell-muted" style="font-size:var(--fs-xs);display:block;">${fullDate}</span>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

// ===== Export =====
function handleExport() {
  // Get currently filtered rows
  let filtered = allLogs;

  if (state.action) {
    filtered = filtered.filter(a => a.action === state.action);
  }
  if (state.dateFrom) {
    filtered = filtered.filter(a => a.created_at.slice(0, 10) >= state.dateFrom);
  }
  if (state.dateTo) {
    filtered = filtered.filter(a => a.created_at.slice(0, 10) <= state.dateTo);
  }
  if (state.search) {
    const searchLower = state.search.toLowerCase();
    filtered = filtered.filter(a => {
      const actor = a.profiles?.full_name || 'System';
      const detailsStr = JSON.stringify(a.details || {});
      return actor.toLowerCase().includes(searchLower) ||
             a.action.toLowerCase().includes(searchLower) ||
             (a.entity_type || '').toLowerCase().includes(searchLower) ||
             detailsStr.toLowerCase().includes(searchLower);
    });
  }

  const csvData = filtered.map(a => ({
    'Actor': a.profiles?.full_name || 'System',
    'Action': ACTION_LABELS[a.action] || a.action,
    'Entity Type': a.entity_type || '',
    'Entity ID': a.entity_id || '',
    'Details': JSON.stringify(a.details || {}),
    'Timestamp': new Date(a.created_at).toISOString()
  }));

  const today = new Date().toISOString().slice(0, 10);
  const filename = `activity-log-${today}.csv`;

  try {
    exportToCSV(csvData, filename);
    showToast('CSV exported successfully', 'success');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Failed to export CSV', 'error');
  }
}