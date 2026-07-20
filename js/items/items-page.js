// ============================================================
// ITEMS PAGE CONTROLLER
// Phase B: Department-based asset tagging (ICI-DEPT-YEAR-NNNN)
// Category removed from UI; department replaces it.
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal, confirmDialog } from '../shared/modal.js';
import {
  STATUSES, CONDITIONS,
  fetchItems, createItem, updateItem, deleteItem, fetchItemById,
} from './itemsApi.js';
import { fetchDepartments, suggestAssetTag } from '../departments/departmentsApi.js';
import { logActivity } from '../dashboard/dashboardApi.js';
import { itemDeepLink, renderQRCode, printSingleSticker, printStickerSheet, waitForQRDataUrl } from './qrCode.js';

let profile = null;
let contentSlot = null;
let topbarActions = null;
let departments = []; // cached for form use

const state = { search: '', status: '' };
let searchDebounceTimer = null;
let currentItems = [];
const selectedIds = new Set();

(async function init() {
  profile = await requireAuth();
  const shell = mountShell(profile, 'items', 'Items');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  // Pre-load departments for the form
  departments = await fetchDepartments({ activeOnly: true });

  renderPageShell();
  await loadAndRenderItems();
  await openDeepLinkedItemIfPresent();
})();

async function openDeepLinkedItemIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;
  try {
    const item = await fetchItemById(id);
    openItemForm(item);
  } catch {
    showToast("Couldn't find that item — it may have been deleted.", 'error');
  }
  window.history.replaceState({}, '', window.location.pathname);
}

// ------------------------------------------------------------
// Page shell
// ------------------------------------------------------------
function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-secondary" id="printSelectedBtn" style="display:none;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
      <span id="printSelectedLabel">Print Selected</span>
    </button>
    <button class="btn btn-primary" id="addItemBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      <span>Add Item</span>
    </button>
  `;
  document.getElementById('addItemBtn').addEventListener('click', () => openItemForm());
  document.getElementById('printSelectedBtn').addEventListener('click', handlePrintSelected);

  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by tag, name, brand, serial…" aria-label="Search items">
      </div>
      <div class="toolbar-filters">
        <select id="statusFilter" aria-label="Filter by status">
          <option value="">All statuses</option>
          ${STATUSES.map(s => `<option value="${s}">${capitalize(s)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="list-meta"><span id="resultCount">Loading…</span></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:36px;"><input type="checkbox" id="selectAllCheckbox" aria-label="Select all"></th>
            <th>Asset Tag</th>
            <th>Name</th>
            <th>Department</th>
            <th>Status</th>
            <th>Condition</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="itemsTbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('selectAllCheckbox').addEventListener('change', (e) => handleSelectAll(e.target.checked));
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => { state.search = e.target.value; selectedIds.clear(); loadAndRenderItems(); }, 300);
  });
  document.getElementById('statusFilter').addEventListener('change', (e) => {
    state.status = e.target.value; selectedIds.clear(); loadAndRenderItems();
  });
}

// ------------------------------------------------------------
// Load + render table
// ------------------------------------------------------------
async function loadAndRenderItems() {
  const tbody = document.getElementById('itemsTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(5);

  try {
    const items = await fetchItems(state);
    currentItems = items;
    resultCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" style="padding: var(--sp-10);">
          <div class="empty-state">
            <h3>No items found</h3>
            <p>${state.search || state.status ? 'Try adjusting your search or filters.' : 'Add your first piece of equipment to get started.'}</p>
            ${!state.search && !state.status ? '<button class="btn btn-primary" id="emptyAddBtn">Add Item</button>' : ''}
          </div>
        </td></tr>`;
      document.getElementById('emptyAddBtn')?.addEventListener('click', () => openItemForm());
      updatePrintSelectedButton();
      return;
    }

    tbody.innerHTML = items.map(renderItemRow).join('');
    items.forEach((item) => {
      document.getElementById(`select-${item.id}`)?.addEventListener('change', (e) => handleSelectItem(item.id, e.target.checked));
      document.getElementById(`qr-${item.id}`)?.addEventListener('click', () => openQRPreview(item));
      document.getElementById(`edit-${item.id}`)?.addEventListener('click', () => openItemForm(item));
      document.getElementById(`delete-${item.id}`)?.addEventListener('click', () => handleDelete(item));
    });

    syncSelectAllCheckbox();
    updatePrintSelectedButton();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>Couldn't load items</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderItemRow(item) {
  const deptLabel = item.departments
    ? `${item.departments.code} — ${item.departments.name}`
    : '<span class="cell-muted">No dept</span>';
  const needsTag = !item.asset_tag?.startsWith('ICI-') && item.department_code;

  return `
    <tr>
      <td class="cell-checkbox"><input type="checkbox" id="select-${item.id}" ${selectedIds.has(item.id) ? 'checked' : ''}></td>
      <td data-label="Asset Tag" class="cell-stacked-title">
        <span class="tag-chip${needsTag ? '' : ''}">${escapeHTML(item.asset_tag)}</span>
        ${needsTag ? '<span class="badge badge-maintenance" style="font-size:0.6rem; margin-left:4px;">Old format</span>' : ''}
      </td>
      <td data-label="Name">
        <div class="cell-primary">${escapeHTML(item.name)}</div>
        ${item.brand || item.model ? `<div class="cell-muted" style="font-size:var(--fs-xs);">${escapeHTML([item.brand, item.model].filter(Boolean).join(' · '))}</div>` : ''}
      </td>
      <td data-label="Department">${deptLabel}</td>
      <td data-label="Status"><span class="badge badge-${item.status}">${capitalize(item.status)}</span></td>
      <td data-label="Condition" class="cell-muted">${capitalize(item.condition || '—')}</td>
      <td class="cell-actions">
        <button class="btn-ghost" id="qr-${item.id}" title="QR code">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M17 20h3"/></svg>
        </button>
        <button class="btn-ghost" id="edit-${item.id}" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="btn-ghost" id="delete-${item.id}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
        </button>
      </td>
    </tr>`;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td></td>
      <td><div class="skeleton-bar" style="width:120px;"></div></td>
      <td><div class="skeleton-bar" style="width:140px;"></div></td>
      <td><div class="skeleton-bar" style="width:100px;"></div></td>
      <td><div class="skeleton-bar" style="width:70px;"></div></td>
      <td><div class="skeleton-bar" style="width:60px;"></div></td>
      <td></td>
    </tr>`).join('');
}

// ------------------------------------------------------------
// Batch selection
// ------------------------------------------------------------
function handleSelectItem(itemId, checked) {
  if (checked) selectedIds.add(itemId); else selectedIds.delete(itemId);
  syncSelectAllCheckbox();
  updatePrintSelectedButton();
}

function handleSelectAll(checked) {
  currentItems.forEach((item) => {
    if (checked) selectedIds.add(item.id); else selectedIds.delete(item.id);
    const cb = document.getElementById(`select-${item.id}`);
    if (cb) cb.checked = checked;
  });
  updatePrintSelectedButton();
}

function syncSelectAllCheckbox() {
  const cb = document.getElementById('selectAllCheckbox');
  if (!cb || currentItems.length === 0) return;
  const n = currentItems.filter(i => selectedIds.has(i.id)).length;
  cb.checked = n === currentItems.length;
  cb.indeterminate = n > 0 && n < currentItems.length;
}

function updatePrintSelectedButton() {
  const btn = document.getElementById('printSelectedBtn');
  const label = document.getElementById('printSelectedLabel');
  if (!btn || !label) return;
  btn.style.display = selectedIds.size > 0 ? '' : 'none';
  label.textContent = `Print Selected (${selectedIds.size})`;
}

async function handlePrintSelected() {
  const itemsToPrint = currentItems.filter(i => selectedIds.has(i.id));
  if (!itemsToPrint.length) return;
  const btn = document.getElementById('printSelectedBtn');
  btn.disabled = true;
  document.getElementById('printSelectedLabel').textContent = 'Preparing…';

  const offscreen = document.createElement('div');
  offscreen.style.cssText = 'visibility:hidden;position:absolute;pointer-events:none;';
  document.body.appendChild(offscreen);

  try {
    const entries = [];
    for (const item of itemsToPrint) {
      const box = document.createElement('div');
      offscreen.appendChild(box);
      renderQRCode(box, itemDeepLink(item.id), 96);
      const dataUrl = await waitForQRDataUrl(box);
      if (dataUrl) entries.push({ item, dataUrl });
    }
    if (!entries.length) { showToast("Couldn't generate QR codes.", 'error'); return; }
    printStickerSheet(entries);
    showToast(`Prepared ${entries.length} sticker(s) for printing`, 'success');
  } finally {
    offscreen.remove();
    btn.disabled = false;
    updatePrintSelectedButton();
  }
}

// ------------------------------------------------------------
// Add / Edit form — UPDATED for department-based tagging
// ------------------------------------------------------------
async function openItemForm(item = null) {
  const isEdit = !!item;
  const currentDeptCode = item?.department_code || '';
  const isOldFormat = isEdit && item.asset_tag && !item.asset_tag.startsWith('ICI-');

  const deptOptions = departments.map(d =>
    `<option value="${d.code}" ${currentDeptCode === d.code ? 'selected' : ''}>${d.code} — ${escapeHTML(d.name)}</option>`
  ).join('');

  const overlay = openModal(`
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h3>${isEdit ? 'Edit Item' : 'Add Item'}</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <form id="itemForm">
        <div class="modal-body">
          <div class="form-grid">

            <div class="field field-full" id="deptField">
              <label for="deptCode">Department</label>
              <select id="deptCode" required>
                <option value="" disabled ${!currentDeptCode ? 'selected' : ''}>Select department</option>
                ${deptOptions}
              </select>
              <div class="error-msg">Select a department.</div>
            </div>

            <div class="field field-full" id="assetTagField">
              <label for="assetTag">Asset Tag</label>
              <div class="input-with-suffix">
                <input type="text" id="assetTag" value="${item ? escapeAttr(item.asset_tag) : ''}" placeholder="Select department first" required>
                <button type="button" class="btn btn-secondary btn-sm" id="suggestTagBtn">Suggest</button>
                ${isOldFormat ? `<button type="button" class="btn btn-secondary btn-sm" id="regenTagBtn" style="background:var(--color-amber-bg);color:var(--color-amber);">Regen</button>` : ''}
              </div>
              <div class="hint">Format: ICI-DEPT-YEAR-NNNN${isOldFormat ? ' — click Regen to convert old tag to new format' : ''}</div>
              <div class="error-msg">Asset tag is required.</div>
            </div>

            <div class="field field-full" id="nameField">
              <label for="name">Item name</label>
              <input type="text" id="name" value="${item ? escapeAttr(item.name) : ''}" placeholder="e.g. Dell Latitude 5440" required>
              <div class="error-msg">Item name is required.</div>
            </div>

            <div class="field">
              <label for="brand">Brand</label>
              <input type="text" id="brand" value="${escapeAttr(item?.brand || '')}" placeholder="e.g. Dell">
            </div>
            <div class="field">
              <label for="model">Model</label>
              <input type="text" id="model" value="${escapeAttr(item?.model || '')}" placeholder="e.g. Latitude 5440">
            </div>

            <div class="field field-full">
              <label for="serialNumber">Serial number</label>
              <input type="text" id="serialNumber" value="${escapeAttr(item?.serial_number || '')}" placeholder="Optional">
            </div>

            <div class="field">
              <label for="status">Status</label>
              <select id="status">
                ${STATUSES.map(s => `<option value="${s}" ${(item?.status || 'available') === s ? 'selected' : ''}>${capitalize(s)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="condition">Condition</label>
              <select id="condition">
                ${CONDITIONS.map(c => `<option value="${c}" ${(item?.condition || 'good') === c ? 'selected' : ''}>${capitalize(c)}</option>`).join('')}
              </select>
            </div>

            <div class="field field-full">
              <label for="notes">Notes</label>
              <textarea id="notes" placeholder="Optional">${escapeHTML(item?.notes || '')}</textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelFormBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveItemBtn">
            <span class="btn-loading-spinner"></span>
            <span class="btn-label">${isEdit ? 'Save Changes' : 'Add Item'}</span>
          </button>
        </div>
      </form>
    </div>
  `);

  const get = (id) => overlay.querySelector(`#${id}`);
  get('closeModalBtn').addEventListener('click', closeModal);
  get('cancelFormBtn').addEventListener('click', closeModal);

  // Suggest tag based on selected department
  get('suggestTagBtn').addEventListener('click', async () => {
    const deptCode = get('deptCode').value;
    if (!deptCode) {
      get('deptField').classList.add('has-error');
      get('deptCode').focus();
      return;
    }
    get('suggestTagBtn').disabled = true;
    get('suggestTagBtn').textContent = '…';
    try {
      get('assetTag').value = await suggestAssetTag(deptCode);
      get('assetTagField').classList.remove('has-error');
    } catch { showToast("Couldn't generate suggestion", 'error'); }
    finally { get('suggestTagBtn').disabled = false; get('suggestTagBtn').textContent = 'Suggest'; }
  });

  // Regenerate tag (for old-format items being converted)
  get('regenTagBtn')?.addEventListener('click', async () => {
    const deptCode = get('deptCode').value;
    if (!deptCode) { get('deptField').classList.add('has-error'); return; }
    const btn = get('regenTagBtn');
    btn.disabled = true; btn.textContent = '…';
    try {
      get('assetTag').value = await suggestAssetTag(deptCode);
      showToast('Tag regenerated to new format', 'success');
    } catch { showToast("Couldn't regenerate tag", 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Regen'; }
  });

  // Auto-suggest when department changes (only for new items)
  if (!isEdit) {
    get('deptCode').addEventListener('change', async (e) => {
      if (!e.target.value) return;
      get('deptField').classList.remove('has-error');
      get('assetTag').value = await suggestAssetTag(e.target.value);
    });
  }

  get('itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveItem(overlay, item);
  });
}

async function handleSaveItem(overlay, existingItem) {
  const get = (id) => overlay.querySelector(`#${id}`);
  const saveBtn = get('saveItemBtn');

  let valid = true;
  [['deptField', get('deptCode').value], ['assetTagField', get('assetTag').value.trim()], ['nameField', get('name').value.trim()]]
    .forEach(([fieldId, val]) => { const hasErr = !val; get(fieldId).classList.toggle('has-error', hasErr); if (hasErr) valid = false; });
  if (!valid) return;

  const payload = {
    department_code: get('deptCode').value,
    asset_tag: get('assetTag').value.trim(),
    name: get('name').value.trim(),
    brand: get('brand').value.trim() || null,
    model: get('model').value.trim() || null,
    serial_number: get('serialNumber').value.trim() || null,
    status: get('status').value,
    condition: get('condition').value,
    notes: get('notes').value.trim() || null,
  };

  saveBtn.classList.add('is-loading');
  saveBtn.disabled = true;

  try {
    if (existingItem) {
      const updated = await updateItem(existingItem.id, payload);
      showToast('Item updated', 'success');
      logActivity(profile.id, 'item_updated', 'item', updated.id, { name: updated.name, asset_tag: updated.asset_tag });
    } else {
      const created = await createItem(payload, profile.id);
      showToast('Item added', 'success');
      logActivity(profile.id, 'item_created', 'item', created.id, { name: created.name, asset_tag: created.asset_tag });
    }
    closeModal();
    await loadAndRenderItems();
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.classList.remove('is-loading');
    saveBtn.disabled = false;
  }
}

// ------------------------------------------------------------
// Delete
// ------------------------------------------------------------
async function handleDelete(item) {
  if (item.status === 'borrowed') { showToast("This item is currently borrowed and can't be deleted.", 'error'); return; }
  const confirmed = await confirmDialog({
    title: 'Delete this item?',
    message: `"${escapeHTML(item.name)}" (${escapeHTML(item.asset_tag)}) will be permanently removed.`,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;
  try {
    await deleteItem(item.id);
    showToast('Item deleted', 'success');
    logActivity(profile.id, 'item_deleted', 'item', item.id, { name: item.name, asset_tag: item.asset_tag });
    await loadAndRenderItems();
  } catch (err) { showToast(err.message, 'error'); }
}

// ------------------------------------------------------------
// QR Code preview
// ------------------------------------------------------------
function openQRPreview(item) {
  const overlay = openModal(`
    <div class="modal" style="max-width:340px;">
      <div class="modal-header">
        <h3>Asset QR Code</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="qr-preview-wrap">
          <div class="qr-preview-canvas-box" id="qrCanvasBox"></div>
          <div class="qr-preview-meta">
            <div class="tag-chip">${escapeHTML(item.asset_tag)}</div>
            <div class="cell-primary">${escapeHTML(item.name)}</div>
            <p class="cell-muted" style="font-size:var(--fs-xs);margin-top:var(--sp-2);">Scanning opens this item's record (sign-in required).</p>
          </div>
        </div>
        <div class="field" style="margin-top:var(--sp-4);margin-bottom:0;">
          <label for="copyCount" style="font-size:var(--fs-xs);font-weight:600;">Number of copies</label>
          <div style="display:flex;align-items:center;gap:var(--sp-3);">
            <input type="number" id="copyCount" min="1" max="20" value="1" style="width:80px;text-align:center;font-weight:600;">
            <span class="cell-muted" style="font-size:var(--fs-xs);">sticker(s)</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="closeBtn2">Close</button>
        <button class="btn btn-primary" id="printStickerBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
          Print Sticker
        </button>
      </div>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#closeBtn2').addEventListener('click', closeModal);

  const canvasBox = overlay.querySelector('#qrCanvasBox');
  renderQRCode(canvasBox, itemDeepLink(item.id), 96);

  overlay.querySelector('#printStickerBtn').addEventListener('click', async () => {
    const btn = overlay.querySelector('#printStickerBtn');
    btn.disabled = true;
    const dataUrl = await waitForQRDataUrl(canvasBox);
    btn.disabled = false;
    if (!dataUrl) { showToast("Couldn't prepare sticker for printing.", 'error'); return; }
    const copies = Math.max(1, Math.min(20, parseInt(overlay.querySelector('#copyCount').value, 10) || 1));
    printSingleSticker(item, dataUrl, copies);
  });
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function escapeHTML(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str) { return str ? String(str).replace(/"/g, '&quot;') : ''; }
