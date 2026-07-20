// ============================================================
// DEPARTMENTS PAGE CONTROLLER (Admin only)
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal, confirmDialog } from '../shared/modal.js';
import {
  fetchDepartments, createDepartment, updateDepartment, setDepartmentActive,
} from './departmentsApi.js';

let contentSlot = null;
let topbarActions = null;

(async function init() {
  const profile = await requireAuth({ requireAdmin: true });
  const shell = mountShell(profile, 'departments', 'Departments');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  renderPageShell();
  await loadAndRenderDepartments();
})();

function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-primary" id="addDeptBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Add Department
    </button>
  `;
  document.getElementById('addDeptBtn').addEventListener('click', () => openDeptForm());

  contentSlot.innerHTML = `
    <p class="cell-muted" style="margin-bottom: var(--sp-5); font-size: var(--fs-sm);">
      Department codes are used to generate asset tags in the format
      <span class="tag-chip" style="font-size: 0.7rem; vertical-align: middle;">ICI-DEPT-YEAR-0001</span>.
      Deactivating a department hides it from new item forms but preserves existing tags.
    </p>
    <div class="list-meta"><span id="resultCount">Loading…</span></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Department Name</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="deptTbody"></tbody>
      </table>
    </div>
  `;
}

async function loadAndRenderDepartments() {
  const tbody = document.getElementById('deptTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(4);

  try {
    const departments = await fetchDepartments();
    resultCount.textContent = `${departments.length} department${departments.length === 1 ? '' : 's'}`;

    if (departments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding: var(--sp-10);"><div class="empty-state"><h3>No departments yet</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = departments.map(renderDeptRow).join('');
    departments.forEach((d) => {
      document.getElementById(`edit-${d.id}`)?.addEventListener('click', () => openDeptForm(d));
      document.getElementById(`toggle-${d.id}`)?.addEventListener('click', () => handleToggleActive(d));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><h3>Couldn't load departments</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderDeptRow(d) {
  return `
    <tr>
      <td data-label="Code" class="cell-stacked-title">
        <span class="tag-chip">${escapeHTML(d.code)}</span>
      </td>
      <td data-label="Name" class="cell-primary">${escapeHTML(d.name)}</td>
      <td data-label="Status">
        <span class="badge ${d.is_active ? 'badge-available' : 'badge-retired'}">
          ${d.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="cell-actions">
        <button class="btn-ghost" id="edit-${d.id}" title="Edit name">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="btn-ghost" id="toggle-${d.id}" title="${d.is_active ? 'Deactivate' : 'Reactivate'}">
          ${d.is_active
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'}
        </button>
      </td>
    </tr>
  `;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width:70px;"></div></td>
      <td><div class="skeleton-bar" style="width:160px;"></div></td>
      <td><div class="skeleton-bar" style="width:70px;"></div></td>
      <td></td>
    </tr>
  `).join('');
}

function openDeptForm(dept = null) {
  const isEdit = !!dept;
  const overlay = openModal(`
    <div class="modal" style="max-width: 420px;">
      <div class="modal-header">
        <h3>${isEdit ? 'Edit Department' : 'Add Department'}</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <form id="deptForm">
        <div class="modal-body">
          ${!isEdit ? `
          <div class="field" id="codeField">
            <label for="deptCode">Department code</label>
            <input type="text" id="deptCode" maxlength="4" style="text-transform:uppercase; font-family: var(--font-mono);"
              placeholder="e.g. ADMN" required>
            <div class="hint">Exactly 4 letters. This becomes part of the asset tag: ICI-<strong>CODE</strong>-2026-0001</div>
            <div class="error-msg">Enter a 4-letter code (letters only).</div>
          </div>` : `
          <div class="field">
            <label>Department code</label>
            <div class="tag-chip" style="display:inline-flex;">${escapeHTML(dept.code)}</div>
            <p class="hint" style="margin-top: var(--sp-2);">Code cannot be changed after creation — it's embedded in existing asset tags.</p>
          </div>`}
          <div class="field" id="nameField">
            <label for="deptName">Department name</label>
            <input type="text" id="deptName" value="${isEdit ? escapeAttr(dept.name) : ''}"
              placeholder="e.g. Information Technology" required>
            <div class="error-msg">Name is required.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveDeptBtn">
            <span class="btn-loading-spinner"></span>
            <span class="btn-label">${isEdit ? 'Save Changes' : 'Add Department'}</span>
          </button>
        </div>
      </form>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelBtn').addEventListener('click', closeModal);

  if (!isEdit) {
    // Auto-uppercase the code as user types
    const codeInput = overlay.querySelector('#deptCode');
    codeInput.addEventListener('input', () => {
      const pos = codeInput.selectionStart;
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
      codeInput.setSelectionRange(pos, pos);
    });
  }

  overlay.querySelector('#deptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveDept(overlay, dept);
  });
}

async function handleSaveDept(overlay, existingDept) {
  const get = (id) => overlay.querySelector(`#${id}`);
  const saveBtn = get('saveDeptBtn');
  const isEdit = !!existingDept;

  const name = get('deptName').value.trim();
  get('nameField').classList.toggle('has-error', !name);
  if (!name) return;

  let code = existingDept?.code;
  if (!isEdit) {
    const rawCode = get('deptCode').value.trim().toUpperCase();
    const codeValid = /^[A-Z]{4}$/.test(rawCode);
    get('codeField').classList.toggle('has-error', !codeValid);
    if (!codeValid) return;
    code = rawCode;
  }

  saveBtn.classList.add('is-loading');
  saveBtn.disabled = true;

  try {
    if (isEdit) {
      await updateDepartment(existingDept.code, { name });
      showToast('Department updated', 'success');
    } else {
      await createDepartment({ code, name });
      showToast(`Department ${code} added`, 'success');
    }
    closeModal();
    await loadAndRenderDepartments();
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.classList.remove('is-loading');
    saveBtn.disabled = false;
  }
}

async function handleToggleActive(dept) {
  const willActivate = !dept.is_active;
  const confirmed = await confirmDialog({
    title: willActivate ? 'Reactivate department?' : 'Deactivate department?',
    message: willActivate
      ? `"${escapeHTML(dept.name)}" will appear in the department dropdown for new items.`
      : `"${escapeHTML(dept.name)}" will be hidden from the dropdown. Existing items with this code are unaffected.`,
    confirmLabel: willActivate ? 'Reactivate' : 'Deactivate',
    danger: !willActivate,
  });
  if (!confirmed) return;

  try {
    await setDepartmentActive(dept.code, willActivate);
    showToast(`${dept.name} ${willActivate ? 'reactivated' : 'deactivated'}`, 'success');
    await loadAndRenderDepartments();
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
