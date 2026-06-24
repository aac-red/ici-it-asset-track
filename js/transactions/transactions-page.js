// ============================================================
// TRANSACTIONS PAGE CONTROLLER
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal, confirmDialog } from '../shared/modal.js';
import {
  fetchTransactions, fetchAvailableItems, issueItem, returnItem, displayStatus, isOverdue,
} from './transactionsApi.js';
import { fetchBorrowers } from '../borrowers/borrowersApi.js';
import { CONDITIONS } from '../items/itemsApi.js';
import { triggerEmail } from '../shared/emailTrigger.js';
import { logActivity } from '../dashboard/dashboardApi.js';

let profile = null;
let contentSlot = null;
let topbarActions = null;
const state = { filter: '', search: '' };
let searchDebounceTimer = null;

(async function init() {
  profile = await requireAuth();
  const shell = mountShell(profile, 'transactions', 'Transactions');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  renderPageShell();
  await loadAndRenderTransactions();
})();

function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-primary" id="issueItemBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      <span>Issue Item</span>
    </button>
  `;
  document.getElementById('issueItemBtn').addEventListener('click', () => openIssueFlow());

  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-filters" role="tablist" aria-label="Filter transactions">
        <select id="statusFilter" aria-label="Filter by status">
          <option value="">All transactions</option>
          <option value="active">Active loans</option>
          <option value="overdue">Overdue</option>
          <option value="returned">Returned</option>
        </select>
      </div>
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by item or borrower…" aria-label="Search transactions">
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
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="txTbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('statusFilter').addEventListener('change', (e) => {
    state.filter = e.target.value;
    loadAndRenderTransactions();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      state.search = value;
      loadAndRenderTransactions();
    }, 300);
  });
}

async function loadAndRenderTransactions() {
  const tbody = document.getElementById('txTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(5);

  try {
    const txs = await fetchTransactions(state);
    resultCount.textContent = `${txs.length} record${txs.length === 1 ? '' : 's'}`;

    if (txs.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" style="padding: var(--sp-10);">
          <div class="empty-state">
            <h3>No transactions found</h3>
            <p>${state.search || state.filter ? 'Try adjusting your search or filter.' : 'Issue your first item to get started.'}</p>
            ${!state.search && !state.filter ? '<button class="btn btn-primary" id="emptyIssueBtn">Issue Item</button>' : ''}
          </div>
        </td></tr>`;
      document.getElementById('emptyIssueBtn')?.addEventListener('click', () => openIssueFlow());
      return;
    }

    tbody.innerHTML = txs.map(renderTxRow).join('');
    txs.forEach((tx) => {
      document.getElementById(`return-${tx.id}`)?.addEventListener('click', () => handleReturn(tx));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Couldn't load transactions</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderTxRow(tx) {
  const status = displayStatus(tx);
  const overdue = status === 'overdue';
  return `
    <tr>
      <td data-label="Item" class="cell-stacked-title">
        <span class="tag-chip${tx.items ? '' : ' tag-chip-muted'}">${escapeHTML(tx.items?.asset_tag || 'Deleted')}</span>
        <div class="cell-primary" style="margin-top:4px;">${escapeHTML(tx.items?.name || '—')}</div>
      </td>
      <td data-label="Borrower">${escapeHTML(tx.borrowers?.full_name || 'Deleted')}</td>
      <td data-label="Issued" class="cell-muted">${formatDate(tx.issue_date)}</td>
      <td data-label="Due" class="${overdue ? '' : 'cell-muted'}" style="${overdue ? 'color: var(--color-rust); font-weight:600;' : ''}">${formatDate(tx.due_date)}</td>
      <td data-label="Status"><span class="badge badge-${status}">${capitalize(status)}</span></td>
      <td class="cell-actions">
        ${tx.status === 'active' ? `
        <button class="btn btn-secondary btn-sm" id="return-${tx.id}">Return</button>
        ` : `<span class="cell-muted" style="font-size: var(--fs-xs);">${tx.return_date ? 'Returned ' + formatDate(tx.return_date) : ''}</span>`}
      </td>
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
      <td><div class="skeleton-bar" style="width: 70px;"></div></td>
      <td></td>
    </tr>
  `).join('');
}

// ------------------------------------------------------------
// ISSUE ITEM FLOW — 3 steps: pick item, pick borrower, set due date
// ------------------------------------------------------------
async function openIssueFlow() {
  const flowState = { item: null, borrower: null, step: 1 };

  const overlay = openModal(`
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <h3>Issue Item</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" id="issueFlowBody"></div>
      <div class="modal-footer" id="issueFlowFooter"></div>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);

  await renderIssueStep(overlay, flowState);
}

function stepIndicatorHTML(currentStep) {
  const steps = ['Item', 'Borrower', 'Due date'];
  return `
    <div class="step-indicator">
      ${steps.map((label, i) => {
        const n = i + 1;
        const cls = n < currentStep ? 'is-done' : n === currentStep ? 'is-active' : '';
        return `<span class="step ${cls}"><span class="step-num">${n}</span>${label}</span>${n < 3 ? '<span class="step-divider"></span>' : ''}`;
      }).join('')}
    </div>
  `;
}

async function renderIssueStep(overlay, flowState) {
  const body = overlay.querySelector('#issueFlowBody');
  const footer = overlay.querySelector('#issueFlowFooter');

  if (flowState.step === 1) {
    body.innerHTML = stepIndicatorHTML(1) + `<div id="itemPickerSlot"><p class="cell-muted">Loading available items…</p></div>`;
    footer.innerHTML = `<button class="btn btn-secondary" id="cancelBtn">Cancel</button>`;
    footer.querySelector('#cancelBtn').addEventListener('click', closeModal);

    try {
      const items = await fetchAvailableItems();
      const slot = body.querySelector('#itemPickerSlot');
      if (items.length === 0) {
        slot.innerHTML = `<div class="empty-state"><h3>No items available</h3><p>All equipment is currently borrowed, in maintenance, or retired.</p></div>`;
        return;
      }
      slot.innerHTML = `
        <div class="picker-list">
          ${items.map(item => `
            <label class="picker-option" data-item-id="${item.id}">
              <input type="radio" name="itemPick" value="${item.id}">
              <div class="picker-main">
                <div class="picker-title">${escapeHTML(item.name)}</div>
                <div class="picker-sub"><span class="tag-chip" style="font-size:0.6875rem; padding:1px 8px 1px 6px;">${escapeHTML(item.asset_tag)}</span> · ${escapeHTML(item.category)}</div>
              </div>
            </label>
          `).join('')}
        </div>
      `;
      slot.querySelectorAll('.picker-option').forEach((opt) => {
        opt.addEventListener('click', () => {
          const itemId = opt.dataset.itemId;
          flowState.item = items.find(i => i.id === itemId);
          flowState.step = 2;
          renderIssueStep(overlay, flowState);
        });
      });
    } catch (err) {
      body.querySelector('#itemPickerSlot').innerHTML = `<div class="empty-state"><h3>Couldn't load items</h3><p>${escapeHTML(err.message)}</p></div>`;
    }
    return;
  }

  if (flowState.step === 2) {
    body.innerHTML = stepIndicatorHTML(2) + `
      <div class="picker-selected-summary">
        <span class="tag-chip">${escapeHTML(flowState.item.asset_tag)}</span>
        <span class="cell-primary">${escapeHTML(flowState.item.name)}</span>
        <button class="btn-ghost btn-sm" id="changeItemBtn">Change</button>
      </div>
      <div id="borrowerPickerSlot"><p class="cell-muted">Loading borrowers…</p></div>
    `;
    footer.innerHTML = `<button class="btn btn-secondary" id="backBtn">Back</button>`;
    footer.querySelector('#backBtn').addEventListener('click', () => {
      flowState.step = 1;
      renderIssueStep(overlay, flowState);
    });
    body.querySelector('#changeItemBtn').addEventListener('click', () => {
      flowState.step = 1;
      renderIssueStep(overlay, flowState);
    });

    try {
      const borrowers = await fetchBorrowers({});
      const slot = body.querySelector('#borrowerPickerSlot');
      if (borrowers.length === 0) {
        slot.innerHTML = `<div class="empty-state"><h3>No borrowers yet</h3><p>Add a borrower first from the Borrowers page.</p></div>`;
        return;
      }
      slot.innerHTML = `
        <div class="picker-list">
          ${borrowers.map(b => `
            <label class="picker-option" data-borrower-id="${b.id}">
              <input type="radio" name="borrowerPick" value="${b.id}">
              <div class="picker-main">
                <div class="picker-title">${escapeHTML(b.full_name)}</div>
                <div class="picker-sub">${escapeHTML(b.department || 'No department')}</div>
              </div>
            </label>
          `).join('')}
        </div>
      `;
      slot.querySelectorAll('.picker-option').forEach((opt) => {
        opt.addEventListener('click', () => {
          const borrowerId = opt.dataset.borrowerId;
          flowState.borrower = borrowers.find(b => b.id === borrowerId);
          flowState.step = 3;
          renderIssueStep(overlay, flowState);
        });
      });
    } catch (err) {
      body.querySelector('#borrowerPickerSlot').innerHTML = `<div class="empty-state"><h3>Couldn't load borrowers</h3><p>${escapeHTML(err.message)}</p></div>`;
    }
    return;
  }

  if (flowState.step === 3) {
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 7);
    const defaultDueStr = defaultDue.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    body.innerHTML = stepIndicatorHTML(3) + `
      <div class="picker-selected-summary">
        <span class="tag-chip">${escapeHTML(flowState.item.asset_tag)}</span>
        <span class="cell-primary">${escapeHTML(flowState.borrower.full_name)}</span>
      </div>
      <div class="field" id="dueDateField">
        <label for="dueDate">Due date</label>
        <input type="date" id="dueDate" min="${todayStr}" value="${defaultDueStr}" required>
        <div class="error-msg">Pick a due date.</div>
      </div>
      <div class="field">
        <label for="issueNotes">Notes</label>
        <textarea id="issueNotes" placeholder="Optional"></textarea>
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-secondary" id="backBtn">Back</button>
      <button class="btn btn-primary" id="confirmIssueBtn">
        <span class="btn-loading-spinner"></span>
        <span class="btn-label">Issue Item</span>
      </button>
    `;
    footer.querySelector('#backBtn').addEventListener('click', () => {
      flowState.step = 2;
      renderIssueStep(overlay, flowState);
    });
    footer.querySelector('#confirmIssueBtn').addEventListener('click', async () => {
      const dueDateInput = body.querySelector('#dueDate');
      if (!dueDateInput.value) {
        document.getElementById('dueDateField').classList.add('has-error');
        return;
      }
      const confirmBtn = footer.querySelector('#confirmIssueBtn');
      confirmBtn.classList.add('is-loading');
      confirmBtn.disabled = true;

      try {
        const tx = await issueItem({
          itemId: flowState.item.id,
          borrowerId: flowState.borrower.id,
          dueDate: dueDateInput.value,
          notes: body.querySelector('#issueNotes').value.trim(),
          issuedBy: profile.id,
        });
        showToast(`${flowState.item.name} issued to ${flowState.borrower.full_name}`, 'success');
        closeModal();
        await loadAndRenderTransactions();

        logActivity(profile.id, 'item_issued', 'transaction', tx.id, {
          item_name: flowState.item.name,
          asset_tag: flowState.item.asset_tag,
          borrower_name: flowState.borrower.full_name,
          due_date: dueDateInput.value,
        });

        // Email is fire-and-forget — never blocks the UI or rolls back the loan
        triggerEmail('issued', flowState.borrower.email, {
          itemName: flowState.item.name,
          assetTag: flowState.item.asset_tag,
          dueDate: dueDateInput.value,
          borrowerName: flowState.borrower.full_name,
        });
      } catch (err) {
        showToast(err.message, 'error');
        confirmBtn.classList.remove('is-loading');
        confirmBtn.disabled = false;
      }
    });
  }
}

// ------------------------------------------------------------
// RETURN FLOW
// ------------------------------------------------------------
async function handleReturn(tx) {
  const overlay = openModal(`
    <div class="modal" style="max-width: 420px;">
      <div class="modal-header">
        <h3>Return Item</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="picker-selected-summary">
          <span class="tag-chip">${escapeHTML(tx.items?.asset_tag || '—')}</span>
          <span class="cell-primary">${escapeHTML(tx.items?.name || '—')}</span>
        </div>
        <p class="cell-muted" style="margin-bottom: var(--sp-4);">Borrowed by ${escapeHTML(tx.borrowers?.full_name || '—')}</p>
        <div class="field">
          <label for="returnCondition">Condition on return</label>
          <select id="returnCondition">
            ${CONDITIONS.map(c => `<option value="${c}">${capitalize(c)}</option>`).join('')}
          </select>
          <div class="hint">Updates the item's recorded condition.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelReturnBtn">Cancel</button>
        <button class="btn btn-primary" id="confirmReturnBtn">
          <span class="btn-loading-spinner"></span>
          <span class="btn-label">Mark Returned</span>
        </button>
      </div>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelReturnBtn').addEventListener('click', closeModal);
  overlay.querySelector('#confirmReturnBtn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#confirmReturnBtn');
    btn.classList.add('is-loading');
    btn.disabled = true;
    try {
      await returnItem(tx.id, tx.item_id, { condition: overlay.querySelector('#returnCondition').value });
      showToast('Item marked as returned', 'success');
      closeModal();
      await loadAndRenderTransactions();

      logActivity(profile.id, 'item_returned', 'transaction', tx.id, {
        item_name: tx.items?.name,
        asset_tag: tx.items?.asset_tag,
        borrower_name: tx.borrowers?.full_name,
      });

      triggerEmail('returned', tx.borrowers?.email, {
        itemName: tx.items?.name,
        assetTag: tx.items?.asset_tag,
        borrowerName: tx.borrowers?.full_name,
      });
    } catch (err) {
      showToast(err.message, 'error');
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  });
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
