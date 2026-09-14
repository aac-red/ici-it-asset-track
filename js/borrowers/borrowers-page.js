// ============================================================
// BORROWERS PAGE CONTROLLER
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal, confirmDialog } from '../shared/modal.js';
import {
  fetchBorrowers, createBorrower, updateBorrower, deleteBorrower, countActiveLoans,
} from './borrowersApi.js';

let contentSlot = null;
let topbarActions = null;
const state = { search: '' };
let searchDebounceTimer = null;

(async function init() {
  const profile = await requireAuth();
  const shell = mountShell(profile, 'borrowers', 'Borrowers');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  renderPageShell();
  await loadAndRenderBorrowers();
})();

function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-primary" id="addBorrowerBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      <span>Add Borrower</span>
    </button>
  `;
  document.getElementById('addBorrowerBtn').addEventListener('click', () => openBorrowerForm());

  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by name, department, email…" aria-label="Search borrowers">
      </div>
    </div>

    <div class="list-meta">
      <span id="resultCount">Loading…</span>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Department</th>
            <th>Employee ID</th>
            <th>Contact</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="borrowersTbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      state.search = value;
      loadAndRenderBorrowers();
    }, 300);
  });
}

async function loadAndRenderBorrowers() {
  const tbody = document.getElementById('borrowersTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(5);

  try {
    const borrowers = await fetchBorrowers(state);
    resultCount.textContent = `${borrowers.length} borrower${borrowers.length === 1 ? '' : 's'}`;

    if (borrowers.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="padding: var(--sp-10);">
          <div class="empty-state">
            <h3>No borrowers found</h3>
            <p>${state.search ? 'Try a different search.' : 'Add the people who\'ll be borrowing equipment.'}</p>
            ${!state.search ? '<button class="btn btn-primary" id="emptyAddBtn">Add Borrower</button>' : ''}
          </div>
        </td></tr>`;
      document.getElementById('emptyAddBtn')?.addEventListener('click', () => openBorrowerForm());
      return;
    }

    tbody.innerHTML = borrowers.map(renderBorrowerRow).join('');
    borrowers.forEach((b) => {
      document.getElementById(`edit-${b.id}`)?.addEventListener('click', () => openBorrowerForm(b));
      document.getElementById(`delete-${b.id}`)?.addEventListener('click', () => handleDelete(b));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>Couldn't load borrowers</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderBorrowerRow(b) {
  const displayInitials = (b.initials || autoInitials(b.full_name)).toUpperCase();
  return `
    <tr>
      <td data-label="Name" class="cell-stacked-title">
        <div style="display:flex; align-items:center; gap: var(--sp-3);">
          <div class="avatar" style="width:32px;height:32px;border-radius:50%;background:var(--color-border);color:var(--color-ink);display:flex;align-items:center;justify-content:center;font-size:var(--fs-xs);font-weight:600;flex-shrink:0;">${escapeHTML(displayInitials)}</div>
          <span class="cell-primary">${escapeHTML(b.full_name)}</span>
        </div>
      </td>
      <td data-label="Department">${escapeHTML(b.department || '—')}</td>
      <td data-label="Employee ID" class="cell-muted">${escapeHTML(b.employee_id || '—')}</td>
      <td data-label="Contact" class="cell-muted">${escapeHTML(b.email || b.phone || '—')}</td>
      <td class="cell-actions">
        ${b.notes ? `<span title="${escapeAttr(b.notes)}" style="margin-right:4px; color:var(--color-slate-soft); display:inline-flex; vertical-align:middle;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></span>` : ''}
        <button class="btn-ghost" id="edit-${b.id}" title="Edit" aria-label="Edit ${escapeHTML(b.full_name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="btn-ghost" id="delete-${b.id}" title="Delete" aria-label="Delete ${escapeHTML(b.full_name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width: 140px;"></div></td>
      <td><div class="skeleton-bar" style="width: 100px;"></div></td>
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 120px;"></div></td>
      <td></td>
    </tr>
  `).join('');
}

async function openBorrowerForm(borrower = null) {
  const isEdit = !!borrower;
  const overlay = openModal(`
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <h3>${isEdit ? 'Edit Borrower' : 'Add Borrower'}</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <form id="borrowerForm">
        <div class="modal-body">
          <div class="form-grid">
            <div class="field field-full" id="nameField">
              <label for="fullName">Full name</label>
              <input type="text" id="fullName" value="${borrower ? escapeAttr(borrower.full_name) : ''}" required>
              <div class="error-msg">Name is required.</div>
            </div>
            <div class="field">
              <label for="initials">Initials</label>
              <input type="text" id="initials" maxlength="6" style="text-transform:uppercase;" value="${borrower ? escapeAttr(borrower.initials || '') : ''}" placeholder="e.g. JDC">
              <div class="hint">Up to 3 letters. Used on the avatar; auto-filled from the name if left blank.</div>
            </div>
            <div class="field">
              <label for="department">Department</label>
              <input type="text" id="department" value="${borrower ? escapeAttr(borrower.department || '') : ''}" placeholder="e.g. Finance">
            </div>
            <div class="field">
              <label for="employeeId">Employee ID</label>
              <input type="text" id="employeeId" value="${borrower ? escapeAttr(borrower.employee_id || '') : ''}" placeholder="Optional">
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input type="email" id="email" value="${borrower ? escapeAttr(borrower.email || '') : ''}" placeholder="Optional">
            </div>
            <div class="field">
              <label for="phone">Phone</label>
              <input type="tel" id="phone" value="${borrower ? escapeAttr(borrower.phone || '') : ''}" placeholder="Optional">
            </div>
            <div class="field field-full">
              <label for="borrowerNotes">Notes</label>
              <textarea id="borrowerNotes" placeholder="Optional">${borrower ? escapeHTML(borrower.notes || '') : ''}</textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelFormBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveBorrowerBtn">
            <span class="btn-loading-spinner"></span>
            <span class="btn-label">${isEdit ? 'Save Changes' : 'Add Borrower'}</span>
          </button>
        </div>
      </form>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelFormBtn').addEventListener('click', closeModal);
  overlay.querySelector('#borrowerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveBorrower(overlay, borrower);
  });
}

async function handleSaveBorrower(overlay, existingBorrower) {
  const get = (id) => overlay.querySelector(`#${id}`);
  const saveBtn = get('saveBorrowerBtn');
  const fullName = get('fullName').value.trim();

  const nameField = get('nameField');
  nameField.classList.toggle('has-error', !fullName);
  if (!fullName) return;

  const payload = {
    full_name: fullName,
    initials: (get('initials').value.trim() || autoInitials(fullName)).toUpperCase().slice(0, 6) || null,
    department: get('department').value.trim() || null,
    employee_id: get('employeeId').value.trim() || null,
    email: get('email').value.trim() || null,
    phone: get('phone').value.trim() || null,
    notes: get('borrowerNotes').value.trim() || null,
  };

  saveBtn.classList.add('is-loading');
  saveBtn.disabled = true;

  try {
    if (existingBorrower) {
      await updateBorrower(existingBorrower.id, payload);
      showToast('Borrower updated', 'success');
    } else {
      await createBorrower(payload);
      showToast('Borrower added', 'success');
    }
    closeModal();
    await loadAndRenderBorrowers();
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.classList.remove('is-loading');
    saveBtn.disabled = false;
  }
}

async function handleDelete(borrower) {
  const activeLoans = await countActiveLoans(borrower.id);
  if (activeLoans > 0) {
    showToast(`${borrower.full_name} has ${activeLoans} active loan(s) and can't be deleted.`, 'error');
    return;
  }

  const confirmed = await confirmDialog({
    title: 'Delete this borrower?',
    message: `"${escapeHTML(borrower.full_name)}" will be permanently removed. This can't be undone.`,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;

  try {
    await deleteBorrower(borrower.id);
    showToast('Borrower deleted', 'success');
    await loadAndRenderBorrowers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  if (str == null) return '';
  return String(str).replace(/"/g, '&quot;');
}

/** Derive 2-letter initials from a full name, used as a fallback when no explicit initials are set. */
function autoInitials(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
