// ============================================================
// DASHBOARD PAGE CONTROLLER (Phase 6 — full version)
// Stat cards, category/status charts, top-borrowed items, and a
// live activity feed.
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell, setNavBadge } from '../shared/appShell.js';
import {
  fetchDashboardStats, fetchItemsByCategory, fetchItemsByStatus,
  fetchMostBorrowedItems, fetchRecentActivity,
} from './dashboardApi.js';

let charts = {};

(async function init() {
  const profile = await requireAuth();
  const { contentSlot } = mountShell(profile, 'dashboard', 'Dashboard');

  renderSkeleton(contentSlot, profile);
  await loadDashboardData(profile);
})();

function renderSkeleton(contentSlot, profile) {
  contentSlot.innerHTML = `
    <p style="margin-bottom: var(--sp-5); color: var(--color-slate);">Welcome back, ${escapeHTML(profile.full_name.split(' ')[0])}.</p>

    <div class="stat-grid" id="statGrid">
      ${renderStatSkeleton()}
      ${renderStatSkeleton()}
      ${renderStatSkeleton()}
      ${renderStatSkeleton()}
    </div>

    <div class="dashboard-grid">
      <div>
        <div class="chart-card">
          <h3>Items by Category</h3>
          <div class="chart-canvas-wrap"><canvas id="categoryChart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Most Borrowed Items</h3>
          <div class="top-items-list" id="topItemsList"><p class="cell-muted">Loading…</p></div>
        </div>
      </div>
      <div>
        <div class="chart-card">
          <h3>Items by Status</h3>
          <div class="chart-canvas-wrap" style="height:200px;"><canvas id="statusChart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Recent Activity</h3>
          <div class="activity-feed" id="activityFeed"><p class="cell-muted">Loading…</p></div>
        </div>
      </div>
    </div>
  `;
}

function renderStatSkeleton() {
  return `<div class="stat-card"><div class="skeleton-bar" style="width:60px; height:11px;"></div><div class="skeleton-bar" style="width:50px; height:28px; margin-top:6px;"></div></div>`;
}

async function loadDashboardData(profile) {
  try {
    const [stats, byCategory, byStatus, topItems, activity] = await Promise.all([
      fetchDashboardStats(),
      fetchItemsByCategory(),
      fetchItemsByStatus(),
      fetchMostBorrowedItems(5),
      fetchRecentActivity(8),
    ]);

    renderStatCards(stats);
    renderCategoryChart(byCategory);
    renderStatusChart(byStatus);
    renderTopItems(topItems);
    renderActivityFeed(activity);

    setNavBadge('transactions', stats.overdue);
  } catch (err) {
    document.getElementById('statGrid').innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;"><h3>Couldn't load dashboard data</h3><p>${escapeHTML(err.message)}</p></div>
    `;
  }
}

function renderStatCards(stats) {
  const cards = [
    { label: 'Total Items', value: stats.totalItems, sub: `${stats.available} available`, icon: iconBox, warn: false },
    { label: 'Active Loans', value: stats.activeLoans, sub: 'currently out', icon: iconLoan, warn: false },
    { label: 'Overdue', value: stats.overdue, sub: stats.overdue > 0 ? 'needs attention' : 'all clear', icon: iconAlert, warn: stats.overdue > 0 },
    { label: 'Available Now', value: stats.available, sub: 'ready to issue', icon: iconCheck, warn: false },
  ];

  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card${c.warn ? ' stat-warn' : ''}">
      <div class="stat-label">
        <span class="stat-icon" style="background:${c.warn ? 'var(--color-rust-bg)' : 'var(--color-paper)'}; color:${c.warn ? 'var(--color-rust)' : 'var(--color-slate)'};">${c.icon}</span>
        ${c.label}
      </div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-sub">${c.sub}</div>
    </div>
  `).join('');
}

function renderCategoryChart(byCategory) {
  const ctx = document.getElementById('categoryChart');
  const labels = Object.keys(byCategory);
  const values = Object.values(byCategory);

  if (labels.length === 0) {
    ctx.closest('.chart-canvas-wrap').innerHTML = '<div class="empty-state"><p>No items yet.</p></div>';
    return;
  }

  charts.category?.destroy();
  charts.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: '#F68B37',
        borderRadius: 6,
        maxBarThickness: 40,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E6E1DF' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderStatusChart(byStatus) {
  const ctx = document.getElementById('statusChart');
  const colorMap = {
    available: '#2D6A4F',
    borrowed: '#8A6508',
    maintenance: '#5E5658',
    retired: '#CFC8C5',
  };
  const labels = Object.keys(byStatus).filter(k => byStatus[k] > 0);
  const values = labels.map(l => byStatus[l]);

  if (labels.length === 0) {
    ctx.closest('.chart-canvas-wrap').innerHTML = '<div class="empty-state"><p>No items yet.</p></div>';
    return;
  }

  charts.status?.destroy();
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.map(capitalize),
      datasets: [{
        data: values,
        backgroundColor: labels.map(l => colorMap[l]),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });
}

function renderTopItems(topItems) {
  const el = document.getElementById('topItemsList');
  if (topItems.length === 0) {
    el.innerHTML = `<p class="cell-muted">No loan history yet.</p>`;
    return;
  }
  el.innerHTML = topItems.map((item, i) => `
    <div class="top-item-row">
      <div class="rank">${i + 1}</div>
      <div class="top-item-main">
        <div class="top-item-name">${escapeHTML(item.name)}</div>
        <div class="top-item-count">${escapeHTML(item.assetTag)} · borrowed ${item.count}×</div>
      </div>
    </div>
  `).join('');
}

function renderActivityFeed(activity) {
  const el = document.getElementById('activityFeed');
  if (activity.length === 0) {
    el.innerHTML = `<p class="cell-muted">No activity yet.</p>`;
    return;
  }

  const ACTION_LABELS = {
    item_created: (d) => `added item <strong>${escapeHTML(d.name || '')}</strong>`,
    item_updated: (d) => `updated item <strong>${escapeHTML(d.name || '')}</strong>`,
    item_deleted: (d) => `deleted item <strong>${escapeHTML(d.name || '')}</strong>`,
    item_issued: (d) => `issued <strong>${escapeHTML(d.item_name || '')}</strong> to ${escapeHTML(d.borrower_name || '')}`,
    item_returned: (d) => `marked <strong>${escapeHTML(d.item_name || '')}</strong> as returned`,
  };
  const ACTION_CLASS = {
    item_created: 'activity-create',
    item_issued: 'activity-issue',
    item_returned: 'activity-return',
    item_deleted: 'activity-delete',
  };

  el.innerHTML = activity.map((a) => {
    const describe = ACTION_LABELS[a.action] || (() => a.action);
    const actorName = a.profiles?.full_name || 'Someone';
    return `
      <div class="activity-item ${ACTION_CLASS[a.action] || ''}">
        <div class="activity-dot"></div>
        <div>
          <div class="activity-text">${escapeHTML(actorName)} ${describe(a.details || {})}</div>
          <div class="activity-time">${formatRelativeTime(a.created_at)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Inline icon constants
const iconBox = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
const iconLoan = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5"/></svg>';
const iconAlert = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z"/></svg>';
const iconCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
