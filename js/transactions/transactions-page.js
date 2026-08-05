// ============================================================
// TRANSACTIONS PAGE CONTROLLER
// Supports issuing multiple items to one borrower in one flow.
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell, setNavBadge } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal } from '../shared/modal.js';
import {
  fetchTransactions, fetchAvailableItems,
  issueMultipleItems, returnItem, displayStatus,
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

// ------------------------------------------------------------
// Page shell
// ------------------------------------------------------------
function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-primary" id="issueItemBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Issue Item(s)
    </button>`;
  document.getElementById('issueItemBtn').addEventListener('click', () => openIssueFlow());

  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-filters">
        <select id="statusFilter" aria-label="Filter by status">
          <option value="">All transactions</option>
          <option value="active">Active loans</option>
          <option value="overdue">Overdue</option>
          <option value="returned">Returned</option>
        </select>
      </div>
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by item or borrower…" aria-label="Search">
      </div>
    </div>
    <div class="list-meta"><span id="resultCount">Loading…</span></div>
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
    </div>`;

  document.getElementById('statusFilter').addEventListener('change', (e) => { state.filter = e.target.value; loadAndRenderTransactions(); });
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => { state.search = e.target.value; loadAndRenderTransactions(); }, 300);
  });
}

// ------------------------------------------------------------
// Load + render
// ------------------------------------------------------------
async function loadAndRenderTransactions() {
  const tbody = document.getElementById('txTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(5);
  try {
    const txs = await fetchTransactions(state);
    resultCount.textContent = `${txs.length} record${txs.length === 1 ? '' : 's'}`;
    if (txs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:var(--sp-10);">
        <div class="empty-state"><h3>No transactions found</h3>
        <p>${state.search || state.filter ? 'Try adjusting your search or filter.' : 'Issue your first item to get started.'}</p>
        ${!state.search && !state.filter ? '<button class="btn btn-primary" id="emptyIssueBtn">Issue Item(s)</button>' : ''}</div>
      </td></tr>`;
      document.getElementById('emptyIssueBtn')?.addEventListener('click', () => openIssueFlow());
      return;
    }
    tbody.innerHTML = txs.map(renderTxRow).join('');
    txs.forEach((tx) => {
      document.getElementById(`return-${tx.id}`)?.addEventListener('click', () => handleReturn(tx));
    });

    // Update overdue badge on sidebar
    try {
      const { overdue } = await import('../transactions/transactionsApi.js').then(m => m.fetchTransactionStats());
      const { setNavBadge } = await import('../shared/appShell.js');
      setNavBadge('transactions', overdue);
    } catch { /* non-critical */ }
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
      <td data-label="Due" style="${overdue ? 'color:var(--color-rust);font-weight:600;' : ''}">${formatDate(tx.due_date)}</td>
      <td data-label="Status"><span class="badge badge-${status}">${capitalize(status)}</span></td>
      <td class="cell-actions">
        ${tx.status === 'active'
          ? `<button class="btn btn-secondary btn-sm" id="return-${tx.id}">Return</button>`
          : `<span class="cell-muted" style="font-size:var(--fs-xs);">${tx.return_date ? 'Returned ' + formatDate(tx.return_date) : ''}</span>`}
      </td>
    </tr>`;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width:120px;"></div></td>
      <td><div class="skeleton-bar" style="width:100px;"></div></td>
      <td><div class="skeleton-bar" style="width:80px;"></div></td>
      <td><div class="skeleton-bar" style="width:80px;"></div></td>
      <td><div class="skeleton-bar" style="width:70px;"></div></td>
      <td></td>
    </tr>`).join('');
}

// ------------------------------------------------------------
// ISSUE FLOW — 4 steps:
// 1. Select items (checkboxes, searchable)
// 2. Select borrower (searchable)
// 3. Set due dates (one per item)
// 4. Confirm & issue
// ------------------------------------------------------------
async function openIssueFlow() {
  const flowState = { selectedItems: [], borrower: null, step: 1 };

  const overlay = openModal(`
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h3>Issue Item(s)</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" id="issueFlowBody"></div>
      <div class="modal-footer" id="issueFlowFooter"></div>
    </div>`);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  await renderIssueStep(overlay, flowState);
}

function stepIndicatorHTML(current) {
  const steps = ['Items', 'Borrower', 'Due Dates', 'Confirm'];
  return `<div class="step-indicator">
    ${steps.map((label, i) => {
      const n = i + 1;
      const cls = n < current ? 'is-done' : n === current ? 'is-active' : '';
      return `<span class="step ${cls}"><span class="step-num">${n}</span>${label}</span>${n < steps.length ? '<span class="step-divider"></span>' : ''}`;
    }).join('')}
  </div>`;
}

async function renderIssueStep(overlay, flowState) {
  const body = overlay.querySelector('#issueFlowBody');
  const footer = overlay.querySelector('#issueFlowFooter');

  // ---- STEP 1: Select items ----
  if (flowState.step === 1) {
    body.innerHTML = stepIndicatorHTML(1) + `<div id="itemsSlot"><p class="cell-muted">Loading available items…</p></div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="nextBtn" disabled>Next →</button>`;
    footer.querySelector('#cancelBtn').addEventListener('click', closeModal);

    const nextBtn = footer.querySelector('#nextBtn');

    try {
      const items = await fetchAvailableItems();
      const slot = body.querySelector('#itemsSlot');
      if (!items.length) {
        slot.innerHTML = `<div class="empty-state"><h3>No items available</h3><p>All equipment is currently borrowed, in maintenance, or retired.</p></div>`;
        return;
      }

      slot.innerHTML = `
        <div class="field" style="margin-bottom:var(--sp-3);">
          <input type="search" id="itemPickerSearch" placeholder="Search by name, tag…">
        </div>
        <div style="font-size:var(--fs-xs);color:var(--color-slate-soft);margin-bottom:var(--sp-2);">
          Select one or more items to issue
        </div>
        <div class="picker-list" id="itemPickerList" style="max-height:280px;"></div>`;

      const listEl = slot.querySelector('#itemPickerList');

      const renderList = (filtered) => {
        if (!filtered.length) {
          listEl.innerHTML = `<p class="cell-muted" style="padding:var(--sp-4);">No items match.</p>`;
          return;
        }
        listEl.innerHTML = filtered.map(item => `
          <label class="picker-option" style="cursor:pointer;">
            <input type="checkbox" name="itemPick" value="${item.id}"
              style="width:18px;height:18px;accent-color:var(--color-tag-gold);"
              ${flowState.selectedItems.find(i => i.id === item.id) ? 'checked' : ''}>
            <div class="picker-main">
              <div class="picker-title">${escapeHTML(item.name)}</div>
              <div class="picker-sub">
                <span class="tag-chip" style="font-size:0.6875rem;padding:1px 8px 1px 6px;">${escapeHTML(item.asset_tag)}</span>
                ${item.department_code ? `· ${item.department_code}` : ''}
              </div>
            </div>
          </label>`).join('');

        listEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
          cb.addEventListener('change', () => {
            if (cb.checked) {
              const item = filtered.find(i => i.id === cb.value);
              if (item && !flowState.selectedItems.find(i => i.id === item.id)) {
                flowState.selectedItems.push(item);
              }
            } else {
              flowState.selectedItems = flowState.selectedItems.filter(i => i.id !== cb.value);
            }
            nextBtn.disabled = flowState.selectedItems.length === 0;
            nextBtn.textContent = flowState.selectedItems.length > 0
              ? `Next → (${flowState.selectedItems.length} selected)`
              : 'Next →';
          });
        });
      };

      renderList(items);

      // Restore checked state
      nextBtn.disabled = flowState.selectedItems.length === 0;
      if (flowState.selectedItems.length) {
        nextBtn.textContent = `Next → (${flowState.selectedItems.length} selected)`;
      }

      slot.querySelector('#itemPickerSearch').addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        renderList(term ? items.filter(i =>
          i.name.toLowerCase().includes(term) ||
          i.asset_tag.toLowerCase().includes(term) ||
          (i.department_code || '').toLowerCase().includes(term)
        ) : items);
      });

      if (!('ontouchstart' in window)) slot.querySelector('#itemPickerSearch').focus();
    } catch (err) {
      body.querySelector('#itemsSlot').innerHTML = `<div class="empty-state"><h3>Couldn't load items</h3><p>${escapeHTML(err.message)}</p></div>`;
    }

    footer.querySelector('#nextBtn').addEventListener('click', () => {
      if (!flowState.selectedItems.length) return;
      flowState.step = 2;
      renderIssueStep(overlay, flowState);
    });
    return;
  }

  // ---- STEP 2: Select borrower ----
  if (flowState.step === 2) {
    body.innerHTML = stepIndicatorHTML(2) + `
      <div class="picker-selected-summary" style="margin-bottom:var(--sp-3);">
        <span class="cell-primary">${flowState.selectedItems.length} item(s) selected</span>
        <button class="btn-ghost btn-sm" id="changeItemsBtn">Change</button>
      </div>
      <div id="borrowerSlot"><p class="cell-muted">Loading borrowers…</p></div>`;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="backBtn">← Back</button>
      <button class="btn btn-primary" id="nextBtn" disabled>Next →</button>`;

    body.querySelector('#changeItemsBtn').addEventListener('click', () => { flowState.step = 1; renderIssueStep(overlay, flowState); });
    footer.querySelector('#backBtn').addEventListener('click', () => { flowState.step = 1; renderIssueStep(overlay, flowState); });

    const nextBtn = footer.querySelector('#nextBtn');

    try {
      const borrowers = await fetchBorrowers({});
      const slot = body.querySelector('#borrowerSlot');
      if (!borrowers.length) {
        slot.innerHTML = `<div class="empty-state"><h3>No borrowers yet</h3><p>Add a borrower first from the Borrowers page.</p></div>`;
        return;
      }

      slot.innerHTML = `
        <div class="field" style="margin-bottom:var(--sp-3);">
          <input type="search" id="borrowerSearch" placeholder="Search by name or department…">
        </div>
        <div class="picker-list" id="borrowerList" style="max-height:260px;"></div>`;

      const listEl = slot.querySelector('#borrowerList');

      const renderList = (filtered) => {
        if (!filtered.length) { listEl.innerHTML = `<p class="cell-muted" style="padding:var(--sp-4);">No borrowers match.</p>`; return; }
        listEl.innerHTML = filtered.map(b => `
          <label class="picker-option ${flowState.borrower?.id === b.id ? 'selected' : ''}">
            <input type="radio" name="borrowerPick" value="${b.id}" ${flowState.borrower?.id === b.id ? 'checked' : ''}>
            <div class="picker-main">
              <div class="picker-title">${escapeHTML(b.full_name)}</div>
              <div class="picker-sub">${escapeHTML(b.department || 'No department')}</div>
            </div>
          </label>`).join('');

        listEl.querySelectorAll('.picker-option').forEach(opt => {
          opt.addEventListener('click', () => {
            const bid = opt.querySelector('input').value;
            flowState.borrower = filtered.find(b => b.id === bid);
            nextBtn.disabled = false;
          });
        });
      };

      renderList(borrowers);
      if (flowState.borrower) nextBtn.disabled = false;

      slot.querySelector('#borrowerSearch').addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        renderList(term ? borrowers.filter(b =>
          b.full_name.toLowerCase().includes(term) ||
          (b.department || '').toLowerCase().includes(term)
        ) : borrowers);
      });

      if (!('ontouchstart' in window)) slot.querySelector('#borrowerSearch').focus();
    } catch (err) {
      body.querySelector('#borrowerSlot').innerHTML = `<div class="empty-state"><h3>Couldn't load borrowers</h3><p>${escapeHTML(err.message)}</p></div>`;
    }

    footer.querySelector('#nextBtn').addEventListener('click', () => {
      if (!flowState.borrower) return;
      flowState.step = 3;
      renderIssueStep(overlay, flowState);
    });
    return;
  }

  // ---- STEP 3: Set due dates per item ----
  if (flowState.step === 3) {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 7);
    const defaultDueStr = defaultDue.toISOString().split('T')[0];

    body.innerHTML = stepIndicatorHTML(3) + `
      <div class="picker-selected-summary" style="margin-bottom:var(--sp-4);">
        <span class="cell-primary">Issuing to: <strong>${escapeHTML(flowState.borrower.full_name)}</strong></span>
        <button class="btn-ghost btn-sm" id="changeBorrowerBtn">Change</button>
      </div>
      <p style="font-size:var(--fs-sm);color:var(--color-slate);margin-bottom:var(--sp-3);">
        Set a due date for each item:
      </p>
      <div id="dueDatesContainer">
        ${flowState.selectedItems.map((item, idx) => `
          <div class="form-grid" style="margin-bottom:var(--sp-4);padding-bottom:var(--sp-4);border-bottom:1px solid var(--color-border);">
            <div style="grid-column:1/-1;display:flex;align-items:center;gap:var(--sp-3);">
              <span class="tag-chip">${escapeHTML(item.asset_tag)}</span>
              <span class="cell-primary">${escapeHTML(item.name)}</span>
            </div>
            <div class="field">
              <label for="due-${idx}">Due date</label>
              <input type="date" id="due-${idx}" min="${todayStr}" value="${defaultDueStr}" required>
            </div>
            <div class="field">
              <label for="notes-${idx}">Notes (optional)</label>
              <input type="text" id="notes-${idx}" placeholder="Condition, accessories…">
            </div>
          </div>`).join('')}
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="backBtn">← Back</button>
      <button class="btn btn-primary" id="nextBtn">Review →</button>`;

    body.querySelector('#changeBorrowerBtn').addEventListener('click', () => { flowState.step = 2; renderIssueStep(overlay, flowState); });
    footer.querySelector('#backBtn').addEventListener('click', () => { flowState.step = 2; renderIssueStep(overlay, flowState); });

    footer.querySelector('#nextBtn').addEventListener('click', () => {
      // Collect due dates and notes
      flowState.itemEntries = flowState.selectedItems.map((item, idx) => ({
        item,
        dueDate: document.getElementById(`due-${idx}`)?.value || defaultDueStr,
        notes: document.getElementById(`notes-${idx}`)?.value.trim() || '',
      }));
      flowState.step = 4;
      renderIssueStep(overlay, flowState);
    });
    return;
  }

  // ---- STEP 4: Confirm & Issue ----
  if (flowState.step === 4) {
    body.innerHTML = stepIndicatorHTML(4) + `
      <p style="font-size:var(--fs-sm);margin-bottom:var(--sp-4);">
        Issuing <strong>${flowState.itemEntries.length} item(s)</strong> to
        <strong>${escapeHTML(flowState.borrower.full_name)}</strong>:
      </p>
      <div class="table-wrap" style="margin-bottom:var(--sp-4);">
        <table class="data-table">
          <thead><tr><th>Item</th><th>Due Date</th><th>Notes</th></tr></thead>
          <tbody>
            ${flowState.itemEntries.map(e => `
              <tr>
                <td><span class="tag-chip" style="font-size:0.7rem;">${escapeHTML(e.item.asset_tag)}</span>
                    <div class="cell-primary" style="font-size:var(--fs-sm);margin-top:2px;">${escapeHTML(e.item.name)}</div></td>
                <td class="cell-muted">${formatDate(e.dueDate)}</td>
                <td class="cell-muted">${escapeHTML(e.notes || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    footer.innerHTML = `
      <button class="btn btn-secondary" id="backBtn">← Back</button>
      <button class="btn btn-primary" id="confirmBtn">
        <span class="btn-loading-spinner"></span>
        <span class="btn-label">Issue ${flowState.itemEntries.length} Item(s)</span>
      </button>`;

    footer.querySelector('#backBtn').addEventListener('click', () => { flowState.step = 3; renderIssueStep(overlay, flowState); });

    footer.querySelector('#confirmBtn').addEventListener('click', async () => {
      const btn = footer.querySelector('#confirmBtn');
      btn.classList.add('is-loading');
      btn.disabled = true;

      try {
        const { results, failed } = await issueMultipleItems({
          items: flowState.itemEntries.map(e => ({
            itemId: e.item.id,
            dueDate: e.dueDate,
            notes: e.notes,
          })),
          borrowerId: flowState.borrower.id,
          issuedBy: profile.id,
        });

        if (failed.length) {
          showToast(`${results.length} issued, ${failed.length} failed. Check items page.`, 'error');
        } else {
          showToast(`${results.length} item(s) issued to ${flowState.borrower.full_name}`, 'success');
        }

        // Log activity for each successful issue
        results.forEach(({ tx, itemId }) => {
          const entry = flowState.itemEntries.find(e => e.item.id === itemId);
          logActivity(profile.id, 'item_issued', 'transaction', tx.id, {
            item_name: entry?.item.name,
            asset_tag: entry?.item.asset_tag,
            borrower_name: flowState.borrower.full_name,
            due_date: entry?.dueDate,
          });
        });

        // Send one combined email listing all successfully issued items
        if (results.length && flowState.borrower.email) {
          const now = new Date();
          const batchRef = `BCH-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
          triggerEmail('issued_batch', flowState.borrower.email, {
            borrowerName: flowState.borrower.full_name,
            issuerName: profile.full_name,
            issuerEmail: profile.email,
            batchRef,
            items: flowState.itemEntries
              .filter(e => results.find(r => r.itemId === e.item.id))
              .map(e => ({
                itemName: e.item.name,
                assetTag: e.item.asset_tag,
                dueDate: e.dueDate,
              })),
          });
        }

        closeModal();
        await loadAndRenderTransactions();
      } catch (err) {
        showToast(err.message, 'error');
        btn.classList.remove('is-loading');
        btn.disabled = false;
      }
    });
    return;
  }
}

// ------------------------------------------------------------
// RETURN FLOW
// ------------------------------------------------------------
async function handleReturn(tx) {
  const overlay = openModal(`
    <div class="modal" style="max-width:420px;">
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
        <p class="cell-muted" style="margin-bottom:var(--sp-4);">Borrowed by ${escapeHTML(tx.borrowers?.full_name || '—')}</p>
        <div class="field">
          <label for="returnCondition">Condition on return</label>
          <select id="returnCondition">
            ${CONDITIONS.map(c => `<option value="${c}">${capitalize(c)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-primary" id="confirmReturnBtn">
          <span class="btn-loading-spinner"></span>
          <span class="btn-label">Mark Returned</span>
        </button>
      </div>
    </div>`);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelBtn').addEventListener('click', closeModal);
  overlay.querySelector('#confirmReturnBtn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#confirmReturnBtn');
    btn.classList.add('is-loading');
    btn.disabled = true;
    try {
      await returnItem(tx.id, tx.item_id, { condition: overlay.querySelector('#returnCondition').value });
      showToast('Item marked as returned', 'success');

      logActivity(profile.id, 'item_returned', 'transaction', tx.id, {
        item_name: tx.items?.name,
        asset_tag: tx.items?.asset_tag,
        borrower_name: tx.borrowers?.full_name,
      });

      triggerEmail('returned', tx.borrowers?.email, {
        itemName: tx.items?.name,
        assetTag: tx.items?.asset_tag,
        borrowerName: tx.borrowers?.full_name,
        issuerName: profile.full_name,
        issuerEmail: profile.email,
        txId: tx.id,
      });

      closeModal();
      await loadAndRenderTransactions();
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
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function escapeHTML(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
