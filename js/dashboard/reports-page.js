// ============================================================
// REPORTS PAGE CONTROLLER
// Filterable transaction history with CSV export.
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { exportToCSV } from '../shared/csvExport.js';
import { fetchTransactions, displayStatus } from '../transactions/transactionsApi.js';

let contentSlot = null;
let topbarActions = null;
const state = { filter: '', search: '', dateFrom: '', dateTo: '' };
let searchDebounceTimer = null;
let currentResults = [];

(async function init() {
  const profile = await requireAuth();
  const shell = mountShell(profile, 'reports', 'Reports');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  renderPageShell();
  await loadAndRenderReport();
})();

function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-secondary" id="exportCsvBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      <span>Export CSV</span>
    </button>
  `;
  document.getElementById('exportCsvBtn').addEventListener('click', handleExport);

  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by item or borrower…" aria-label="Search">
      </div>
      <div class="toolbar-filters">
        <select id="statusFilter" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active loans</option>
          <option value="overdue">Overdue</option>
          <option value="returned">Returned</option>
        </select>
        <input type="date" id="dateFrom" aria-label="From date" title="From date">
        <input type="date" id="dateTo" aria-label="To date" title="To date">
      </div>
    </div>

    <div class="list-meta">
      <span id="resultCount">Loading…</span>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Borrower</th>
            <th>Issued</th>
            <th>Due</th>
            <th>Returned</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="reportTbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('statusFilter').addEventListener('change', (e) => {
    state.filter = e.target.value;
    loadAndRenderReport();
  });
  document.getElementById('dateFrom').addEventListener('change', (e) => {
    state.dateFrom = e.target.value;
    loadAndRenderReport();
  });
  document.getElementById('dateTo').addEventListener('change', (e) => {
    state.dateTo = e.target.value;
    loadAndRenderReport();
  });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      state.search = value;
      loadAndRenderReport();
    }, 300);
  });
}

async function loadAndRenderReport() {
  const tbody = document.getElementById('reportTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(6);

  try {
    const results = await fetchTransactions(state);
    currentResults = results;
    resultCount.textContent = `${results.length} record${results.length === 1 ? '' : 's'}`;

    if (results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: var(--sp-10);"><div class="empty-state"><h3>No records found</h3><p>Try adjusting your filters.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = results.map(renderReportRow).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Couldn't load report</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderReportRow(tx) {
  const status = displayStatus(tx);
  return `
    <tr>
      <td data-label="Item" class="cell-stacked-title">
        <span class="tag-chip${tx.items ? '' : ' tag-chip-muted'}">${escapeHTML(tx.items?.asset_tag || 'Deleted')}</span>
        <div class="cell-primary" style="margin-top:4px;">${escapeHTML(tx.items?.name || '—')}</div>
      </td>
      <td data-label="Borrower">${escapeHTML(tx.borrowers?.full_name || 'Deleted')}</td>
      <td data-label="Issued" class="cell-muted">${formatDate(tx.issue_date)}</td>
      <td data-label="Due" class="cell-muted">${formatDate(tx.due_date)}</td>
      <td data-label="Returned" class="cell-muted">${tx.return_date ? formatDate(tx.return_date) : '—'}</td>
      <td data-label="Status"><span class="badge badge-${status}">${capitalize(status)}</span></td>
    </tr>
  `;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width: 120px;"></div></td>
      <td><div class="skeleton-bar" style="width: 100px;"></div></td>
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 70px;"></div></td>
    </tr>
  `).join('');
}

function handleExport() {
  if (currentResults.length === 0) {
    showToast('Nothing to export with the current filters.', 'error');
    return;
  }

  const rows = currentResults.map(tx => ({
    asset_tag: tx.items?.asset_tag || '',
    item_name: tx.items?.name || '',
    category: tx.items?.category || '',
    borrower_name: tx.borrowers?.full_name || '',
    borrower_department: tx.borrowers?.department || '',
    issue_date: formatDate(tx.issue_date),
    due_date: formatDate(tx.due_date),
    return_date: tx.return_date ? formatDate(tx.return_date) : '',
    status: capitalize(displayStatus(tx)),
    issued_by: tx.profiles?.full_name || '',
    notes: tx.notes || '',
  }));

  const columns = [
    { key: 'asset_tag', label: 'Asset Tag' },
    { key: 'item_name', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'borrower_name', label: 'Borrower' },
    { key: 'borrower_department', label: 'Department' },
    { key: 'issue_date', label: 'Issue Date' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'return_date', label: 'Return Date' },
    { key: 'status', label: 'Status' },
    { key: 'issued_by', label: 'Issued By' },
    { key: 'notes', label: 'Notes' },
  ];

  const today = new Date().toISOString().split('T')[0];
  exportToCSV(rows, columns, `assettrack-report-${today}.csv`);
  showToast(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'}`, 'success');
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
