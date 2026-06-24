// ============================================================
// INVENTORY PAGE CONTROLLER
// Manages the "asset record-keeping" side of items — location,
// quantity, purchase cost, warranty — separate from the day-to-day
// borrowing fields (status/condition) that live on the Items page.
// Reuses the same `items` table; this is a different view onto it.
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal } from '../shared/modal.js';
import { fetchAllItemsForInventory, updateItem, isWarrantyExpiringSoon } from '../items/itemsApi.js';

let contentSlot = null;
const state = { search: '' };
let searchDebounceTimer = null;

(async function init() {
  const profile = await requireAuth();
  const shell = mountShell(profile, 'inventory', 'Inventory');
  contentSlot = shell.contentSlot;

  renderPageShell();
  await loadAndRenderInventory();
})();

function renderPageShell() {
  contentSlot.innerHTML = `
    <div class="card" style="margin-bottom: var(--sp-5); background: var(--color-paper); border: none;">
      <p style="margin:0; font-size: var(--fs-sm);">
        Track where equipment lives, what it cost, and when warranties expire —
        separate from day-to-day borrowing. Click any row to edit its inventory details.
      </p>
    </div>

    <div class="toolbar">
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="searchInput" placeholder="Search by tag, name, location, supplier…" aria-label="Search inventory">
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
            <th>Location</th>
            <th>Qty</th>
            <th>Purchased</th>
            <th>Warranty</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="invTbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      state.search = value;
      loadAndRenderInventory();
    }, 300);
  });
}

async function loadAndRenderInventory() {
  const tbody = document.getElementById('invTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(5);

  try {
    const items = await fetchAllItemsForInventory(state);
    resultCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: var(--sp-10);"><div class="empty-state"><h3>No items found</h3><p>Add items from the Items page first — they'll show up here automatically.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(renderInventoryRow).join('');
    items.forEach((item) => {
      document.getElementById(`invEdit-${item.id}`)?.addEventListener('click', () => openInventoryForm(item));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>Couldn't load inventory</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderInventoryRow(item) {
  const warrantyWarn = isWarrantyExpiringSoon(item);
  return `
    <tr>
      <td data-label="Asset Tag" class="cell-stacked-title">
        <span class="tag-chip">${escapeHTML(item.asset_tag)}</span>
      </td>
      <td data-label="Name" class="cell-primary">${escapeHTML(item.name)}</td>
      <td data-label="Location" class="cell-muted">${escapeHTML(item.location || '—')}</td>
      <td data-label="Qty">${item.quantity_in_stock ?? 1}</td>
      <td data-label="Purchased" class="cell-muted">${item.purchase_date ? formatDate(item.purchase_date) : '—'}${item.purchase_cost ? `<div style="font-size:var(--fs-xs);">${formatCurrency(item.purchase_cost)}</div>` : ''}</td>
      <td data-label="Warranty">
        ${item.warranty_expiry
          ? `<span class="${warrantyWarn ? 'badge badge-overdue' : 'cell-muted'}">${formatDate(item.warranty_expiry)}</span>`
          : '<span class="cell-muted">—</span>'}
      </td>
      <td class="cell-actions">
        <button class="btn-ghost" id="invEdit-${item.id}" title="Edit inventory details" aria-label="Edit inventory details for ${escapeHTML(item.name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 130px;"></div></td>
      <td><div class="skeleton-bar" style="width: 90px;"></div></td>
      <td><div class="skeleton-bar" style="width: 30px;"></div></td>
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td><div class="skeleton-bar" style="width: 80px;"></div></td>
      <td></td>
    </tr>
  `).join('');
}

function openInventoryForm(item) {
  const overlay = openModal(`
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <h3>Inventory Details</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <form id="inventoryForm">
        <div class="modal-body">
          <div class="picker-selected-summary">
            <span class="tag-chip">${escapeHTML(item.asset_tag)}</span>
            <span class="cell-primary">${escapeHTML(item.name)}</span>
          </div>

          <div class="field">
            <label for="location">Location</label>
            <input type="text" id="location" value="${escapeAttr(item.location || '')}" placeholder="e.g. 3rd Floor Storage, IT Cage">
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="quantity">Quantity in stock</label>
              <input type="number" id="quantity" min="0" value="${item.quantity_in_stock ?? 1}">
            </div>
            <div class="field">
              <label for="purchaseCost">Purchase cost</label>
              <input type="number" id="purchaseCost" min="0" step="0.01" value="${item.purchase_cost ?? ''}" placeholder="0.00">
            </div>
            <div class="field">
              <label for="purchaseDate">Purchase date</label>
              <input type="date" id="purchaseDate" value="${item.purchase_date || ''}">
            </div>
            <div class="field">
              <label for="warrantyExpiry">Warranty expiry</label>
              <input type="date" id="warrantyExpiry" value="${item.warranty_expiry || ''}">
            </div>
          </div>

          <div class="field field-full">
            <label for="supplier">Supplier</label>
            <input type="text" id="supplier" value="${escapeAttr(item.supplier || '')}" placeholder="e.g. Dell Philippines">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelFormBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveInvBtn">
            <span class="btn-loading-spinner"></span>
            <span class="btn-label">Save</span>
          </button>
        </div>
      </form>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelFormBtn').addEventListener('click', closeModal);
  overlay.querySelector('#inventoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveInventory(overlay, item);
  });
}

async function handleSaveInventory(overlay, item) {
  const get = (id) => overlay.querySelector(`#${id}`);
  const saveBtn = get('saveInvBtn');

  const payload = {
    location: get('location').value.trim() || null,
    quantity_in_stock: get('quantity').value ? parseInt(get('quantity').value, 10) : 1,
    purchase_cost: get('purchaseCost').value ? parseFloat(get('purchaseCost').value) : null,
    purchase_date: get('purchaseDate').value || null,
    warranty_expiry: get('warrantyExpiry').value || null,
    supplier: get('supplier').value.trim() || null,
  };

  saveBtn.classList.add('is-loading');
  saveBtn.disabled = true;

  try {
    await updateItem(item.id, payload);
    showToast('Inventory details updated', 'success');
    closeModal();
    await loadAndRenderInventory();
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.classList.remove('is-loading');
    saveBtn.disabled = false;
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PHP' }).format(value);
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
