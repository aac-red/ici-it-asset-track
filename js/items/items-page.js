// ============================================================
// ITEMS PAGE CONTROLLER
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal, confirmDialog } from '../shared/modal.js';
import {
  CATEGORIES, STATUSES, CONDITIONS,
  fetchItems, createItem, updateItem, deleteItem, suggestAssetTag, fetchItemById,
} from './itemsApi.js';
import { logActivity } from '../dashboard/dashboardApi.js';
import { itemDeepLink, renderQRCode, printSingleSticker } from './qrCode.js';

let profile = null;
let contentSlot = null;
let topbarActions = null;

// Current filter/search state
const state = { search: '', category: '', status: '' };
let searchDebounceTimer = null;

(async function init() {
  profile = await requireAuth();
  const shell = mountShell(profile, 'items', 'Items');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  renderPageShell();
  await loadAndRenderItems();
  await openDeepLinkedItemIfPresent();
})();

/**
 * If the page was opened as items.html?id=<itemId> (e.g. from a
 * scanned QR sticker), automatically open that item's edit modal.
 * Silently does nothing if there's no id param or the item is gone.
 */
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

  // Clean the URL so a page refresh doesn't keep reopening the modal
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, '', cleanUrl);
}

// ------------------------------------------------------------
// Page shell: toolbar + table container (rendered once)
// ------------------------------------------------------------
function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-primary" id="addItemBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      <span>Add Item</span>
    </button>
  `;
  document.getElementById('addItemBtn').addEventListener('click', () => openItemForm());

  contentSlot.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by tag, name, brand, serial…" aria-label="Search items">
      </div>
      <div class="toolbar-filters">
        <select id="categoryFilter" aria-label="Filter by category">
          <option value="">All categories</option>
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="statusFilter" aria-label="Filter by status">
          <option value="">All statuses</option>
          ${STATUSES.map(s => `<option value="${s}">${capitalize(s)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="list-meta">
      <span id="resultCount">Loading…</span>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Asset Tag</th>
            <th>Name</th>
            <th>Category</th>
            <th>Status</th>
            <th>Condition</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="itemsTbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      state.search = value;
      loadAndRenderItems();
    }, 300);
  });

  document.getElementById('categoryFilter').addEventListener('change', (e) => {
    state.category = e.target.value;
    loadAndRenderItems();
  });

  document.getElementById('statusFilter').addEventListener('change', (e) => {
    state.status = e.target.value;
    loadAndRenderItems();
  });
}

// ------------------------------------------------------------
// Load + render the table body
// ------------------------------------------------------------
async function loadAndRenderItems() {
  const tbody = document.getElementById('itemsTbody');
  const resultCount = document.getElementById('resultCount');

  tbody.innerHTML = renderSkeletonRows(5);

  try {
    const items = await fetchItems(state);
    resultCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" style="padding: var(--sp-10);">
          <div class="empty-state">
            <h3>No items found</h3>
            <p>${state.search || state.category || state.status
              ? 'Try adjusting your search or filters.'
              : 'Add your first piece of equipment to get started.'}</p>
            ${!state.search && !state.category && !state.status
              ? '<button class="btn btn-primary" id="emptyAddBtn">Add Item</button>' : ''}
          </div>
        </td></tr>
      `;
      const emptyAddBtn = document.getElementById('emptyAddBtn');
      if (emptyAddBtn) emptyAddBtn.addEventListener('click', () => openItemForm());
      return;
    }

    tbody.innerHTML = items.map(renderItemRow).join('');

    // Wire up row actions
    items.forEach((item) => {
      document.getElementById(`qr-${item.id}`)?.addEventListener('click', () => openQRPreview(item));
      document.getElementById(`edit-${item.id}`)?.addEventListener('click', () => openItemForm(item));
      document.getElementById(`delete-${item.id}`)?.addEventListener('click', () => handleDelete(item));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Couldn't load items</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderItemRow(item) {
  return `
    <tr>
      <td data-label="Asset Tag" class="cell-stacked-title">
        <span class="tag-chip">${escapeHTML(item.asset_tag)}</span>
      </td>
      <td data-label="Name">
        <div class="cell-primary">${escapeHTML(item.name)}</div>
        ${item.brand || item.model ? `<div class="cell-muted" style="font-size: var(--fs-xs);">${escapeHTML([item.brand, item.model].filter(Boolean).join(' · '))}</div>` : ''}
      </td>
      <td data-label="Category">${escapeHTML(item.category)}</td>
      <td data-label="Status"><span class="badge badge-${item.status}">${capitalize(item.status)}</span></td>
      <td data-label="Condition" class="cell-muted">${capitalize(item.condition || '—')}</td>
      <td class="cell-actions">
        <button class="btn-ghost" id="qr-${item.id}" title="QR code" aria-label="QR code for ${escapeHTML(item.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M17 20h3"/></svg>
        </button>
        <button class="btn-ghost" id="edit-${item.id}" title="Edit" aria-label="Edit ${escapeHTML(item.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="btn-ghost" id="delete-${item.id}" title="Delete" aria-label="Delete ${escapeHTML(item.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 140px;"></div></td>
      <td><div class="skeleton-bar" style="width: 90px;"></div></td>
      <td><div class="skeleton-bar" style="width: 70px;"></div></td>
      <td><div class="skeleton-bar" style="width: 60px;"></div></td>
      <td></td>
    </tr>
  `).join('');
}

// ------------------------------------------------------------
// Add / Edit form modal
// ------------------------------------------------------------
async function openItemForm(item = null) {
  const isEdit = !!item;

  const overlay = openModal(`
    <div class="modal" style="max-width: 560px;">
      <div class="modal-header">
        <h3>${isEdit ? 'Edit Item' : 'Add Item'}</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <form id="itemForm">
        <div class="modal-body">
          <div class="form-grid">
            <div class="field field-full" id="categoryField">
              <label for="category">Category</label>
              <select id="category" required>
                <option value="" disabled ${!item ? 'selected' : ''}>Select a category</option>
                ${CATEGORIES.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>

            <div class="field field-full" id="assetTagField">
              <label for="assetTag">Asset Tag</label>
              <div class="input-with-suffix">
                <input type="text" id="assetTag" value="${item ? escapeAttr(item.asset_tag) : ''}" placeholder="Pick a category first" required>
                <button type="button" class="btn btn-secondary btn-sm" id="suggestTagBtn">Suggest</button>
              </div>
              <div class="hint">Unique identifier, e.g. LAP-0001. Click "Suggest" after choosing a category.</div>
              <div class="error-msg">Asset tag is required.</div>
            </div>

            <div class="field field-full" id="nameField">
              <label for="name">Item name</label>
              <input type="text" id="name" value="${item ? escapeAttr(item.name) : ''}" placeholder="e.g. Dell Latitude 5440" required>
              <div class="error-msg">Item name is required.</div>
            </div>

            <div class="field">
              <label for="brand">Brand</label>
              <input type="text" id="brand" value="${item ? escapeAttr(item.brand || '') : ''}" placeholder="e.g. Dell">
            </div>
            <div class="field">
              <label for="model">Model</label>
              <input type="text" id="model" value="${item ? escapeAttr(item.model || '') : ''}" placeholder="e.g. Latitude 5440">
            </div>

            <div class="field field-full">
              <label for="serialNumber">Serial number</label>
              <input type="text" id="serialNumber" value="${item ? escapeAttr(item.serial_number || '') : ''}" placeholder="Optional">
            </div>

            <div class="field">
              <label for="status">Status</label>
              <select id="status">
                ${STATUSES.map(s => `<option value="${s}" ${item?.status === s ? 'selected' : (!item && s === 'available' ? 'selected' : '')}>${capitalize(s)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="condition">Condition</label>
              <select id="condition">
                ${CONDITIONS.map(c => `<option value="${c}" ${item?.condition === c ? 'selected' : (!item && c === 'good' ? 'selected' : '')}>${capitalize(c)}</option>`).join('')}
              </select>
            </div>

            <div class="field field-full">
              <label for="notes">Notes</label>
              <textarea id="notes" placeholder="Optional">${item ? escapeHTML(item.notes || '') : ''}</textarea>
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

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelFormBtn').addEventListener('click', closeModal);

  const categorySelect = overlay.querySelector('#category');
  const assetTagInput = overlay.querySelector('#assetTag');
  const suggestBtn = overlay.querySelector('#suggestTagBtn');

  suggestBtn.addEventListener('click', async () => {
    if (!categorySelect.value) {
      categorySelect.closest('.field').classList.add('has-error');
      categorySelect.focus();
      return;
    }
    suggestBtn.disabled = true;
    suggestBtn.textContent = '…';
    try {
      assetTagInput.value = await suggestAssetTag(categorySelect.value);
      assetTagInput.closest('.field').classList.remove('has-error');
    } catch {
      showToast("Couldn't generate a suggestion", 'error');
    } finally {
      suggestBtn.disabled = false;
      suggestBtn.textContent = 'Suggest';
    }
  });

  overlay.querySelector('#itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveItem(overlay, item);
  });
}

async function handleSaveItem(overlay, existingItem) {
  const get = (id) => overlay.querySelector(`#${id}`);
  const saveBtn = get('saveItemBtn');

  // Validate required fields
  let valid = true;
  [
    ['categoryField', get('category').value],
    ['assetTagField', get('assetTag').value.trim()],
    ['nameField', get('name').value.trim()],
  ].forEach(([fieldId, value]) => {
    const field = get(fieldId);
    const hasError = !value;
    field.classList.toggle('has-error', hasError);
    if (hasError) valid = false;
  });
  if (!valid) return;

  const payload = {
    category: get('category').value,
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
// Delete flow
// ------------------------------------------------------------
async function handleDelete(item) {
  if (item.status === 'borrowed') {
    showToast('This item is currently borrowed and can\'t be deleted.', 'error');
    return;
  }

  const confirmed = await confirmDialog({
    title: 'Delete this item?',
    message: `"${escapeHTML(item.name)}" (${escapeHTML(item.asset_tag)}) will be permanently removed. This can't be undone.`,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;

  try {
    await deleteItem(item.id);
    showToast('Item deleted', 'success');
    logActivity(profile.id, 'item_deleted', 'item', item.id, { name: item.name, asset_tag: item.asset_tag });
    await loadAndRenderItems();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ------------------------------------------------------------
// QR code preview + print
// ------------------------------------------------------------
function openQRPreview(item) {
  const overlay = openModal(`
    <div class="modal" style="max-width: 340px;">
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
            <p class="cell-muted" style="font-size: var(--fs-xs); margin-top: var(--sp-2);">Scanning opens this item's record (sign-in required).</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="closeBtn2">Close</button>
        <button class="btn btn-primary" id="printStickerBtn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
          <span>Print Sticker</span>
        </button>
      </div>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#closeBtn2').addEventListener('click', closeModal);

  // Kept intentionally small (96px) per request — just enough to scan reliably on a sticker.
  const canvasBox = overlay.querySelector('#qrCanvasBox');
  renderQRCode(canvasBox, itemDeepLink(item.id), 96);

  overlay.querySelector('#printStickerBtn').addEventListener('click', () => {
    // QRCode.js renders either an <img> or a <canvas> depending on browser
    // support — grab whichever it produced to get a printable data URL.
    const img = canvasBox.querySelector('img');
    const canvas = canvasBox.querySelector('canvas');
    const dataUrl = img ? img.src : canvas?.toDataURL('image/png');
    if (!dataUrl) {
      showToast("Couldn't prepare the sticker for printing.", 'error');
      return;
    }
    printSingleSticker(item, dataUrl);
  });
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
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
