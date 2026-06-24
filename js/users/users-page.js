// ============================================================
// MANAGE USERS PAGE CONTROLLER (Admin only)
// ============================================================
import { requireAuth } from '../auth/auth.js';
import { mountShell } from '../shared/appShell.js';
import { showToast } from '../shared/toast.js';
import { openModal, closeModal, confirmDialog } from '../shared/modal.js';
import { fetchUsers, createUserAccount, setUserActive, setUserRole } from './usersApi.js';

let currentProfile = null;
let contentSlot = null;
let topbarActions = null;

(async function init() {
  currentProfile = await requireAuth({ requireAdmin: true });
  const shell = mountShell(currentProfile, 'users', 'Manage Users');
  contentSlot = shell.contentSlot;
  topbarActions = shell.topbarActions;

  renderPageShell();
  await loadAndRenderUsers();
})();

function renderPageShell() {
  topbarActions.innerHTML = `
    <button class="btn btn-primary" id="addUserBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      <span>Add User</span>
    </button>
  `;
  document.getElementById('addUserBtn').addEventListener('click', () => openCreateUserForm());

  contentSlot.innerHTML = `
    <div class="list-meta">
      <span id="resultCount">Loading…</span>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="usersTbody"></tbody>
      </table>
    </div>
  `;
}

async function loadAndRenderUsers() {
  const tbody = document.getElementById('usersTbody');
  const resultCount = document.getElementById('resultCount');
  tbody.innerHTML = renderSkeletonRows(4);

  try {
    const users = await fetchUsers();
    resultCount.textContent = `${users.length} user${users.length === 1 ? '' : 's'}`;
    tbody.innerHTML = users.map(renderUserRow).join('');

    users.forEach((u) => {
      document.getElementById(`toggleActive-${u.id}`)?.addEventListener('click', () => handleToggleActive(u));
      document.getElementById(`changeRole-${u.id}`)?.addEventListener('click', () => handleChangeRole(u));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>Couldn't load users</h3><p>${escapeHTML(err.message)}</p></div></td></tr>`;
  }
}

function renderUserRow(user) {
  const isSelf = user.id === currentProfile.id;
  return `
    <tr>
      <td data-label="Name" class="cell-stacked-title">
        <span class="cell-primary">${escapeHTML(user.full_name)}</span>
        ${isSelf ? '<span class="badge badge-available" style="margin-left:6px;">You</span>' : ''}
      </td>
      <td data-label="Email" class="cell-muted">${escapeHTML(user.email)}</td>
      <td data-label="Department">${escapeHTML(user.department || '—')}</td>
      <td data-label="Role"><span class="badge ${user.role === 'admin' ? 'badge-active' : 'badge-available'}">${capitalize(user.role)}</span></td>
      <td data-label="Status">
        <span class="badge ${user.is_active ? 'badge-available' : 'badge-retired'}">${user.is_active ? 'Active' : 'Deactivated'}</span>
      </td>
      <td class="cell-actions">
        ${isSelf ? `<span class="cell-muted" style="font-size:var(--fs-xs);">—</span>` : `
          <button class="btn-ghost btn-sm" id="changeRole-${user.id}" title="Change role">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg>
          </button>
          <button class="btn-ghost btn-sm" id="toggleActive-${user.id}" title="${user.is_active ? 'Deactivate' : 'Reactivate'}">
            ${user.is_active
              ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/></svg>'
              : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'}
          </button>
        `}
      </td>
    </tr>
  `;
}

function renderSkeletonRows(count) {
  return Array.from({ length: count }).map(() => `
    <tr class="skeleton-row">
      <td><div class="skeleton-bar" style="width: 120px;"></div></td>
      <td><div class="skeleton-bar" style="width: 160px;"></div></td>
      <td><div class="skeleton-bar" style="width: 90px;"></div></td>
      <td><div class="skeleton-bar" style="width: 70px;"></div></td>
      <td><div class="skeleton-bar" style="width: 70px;"></div></td>
      <td></td>
    </tr>
  `).join('');
}

// ------------------------------------------------------------
// Create user
// ------------------------------------------------------------
function openCreateUserForm() {
  const overlay = openModal(`
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <h3>Add User</h3>
        <button class="btn-ghost" id="closeModalBtn" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <form id="userForm">
        <div class="modal-body">
          <div class="field" id="fullNameField">
            <label for="fullName">Full name</label>
            <input type="text" id="fullName" required>
            <div class="error-msg">Name is required.</div>
          </div>
          <div class="field" id="emailField">
            <label for="newEmail">Email address</label>
            <input type="email" id="newEmail" required>
            <div class="hint">They'll use this to sign in.</div>
            <div class="error-msg">Enter a valid email.</div>
          </div>
          <div class="field" id="passwordField">
            <label for="newPassword">Temporary password</label>
            <input type="text" id="newPassword" required minlength="6">
            <div class="hint">At least 6 characters. Share this with them securely — they can change it later if you add that feature, or you can update it for them in Supabase.</div>
            <div class="error-msg">Password must be at least 6 characters.</div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="newRole">Role</label>
              <select id="newRole">
                <option value="staff" selected>Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="field">
              <label for="newDepartment">Department</label>
              <input type="text" id="newDepartment" placeholder="Optional">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelFormBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="saveUserBtn">
            <span class="btn-loading-spinner"></span>
            <span class="btn-label">Create Account</span>
          </button>
        </div>
      </form>
    </div>
  `);

  overlay.querySelector('#closeModalBtn').addEventListener('click', closeModal);
  overlay.querySelector('#cancelFormBtn').addEventListener('click', closeModal);
  overlay.querySelector('#userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleCreateUser(overlay);
  });
}

async function handleCreateUser(overlay) {
  const get = (id) => overlay.querySelector(`#${id}`);
  const saveBtn = get('saveUserBtn');

  const fullName = get('fullName').value.trim();
  const email = get('newEmail').value.trim();
  const password = get('newPassword').value;

  let valid = true;
  get('fullNameField').classList.toggle('has-error', !fullName);
  if (!fullName) valid = false;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  get('emailField').classList.toggle('has-error', !emailValid);
  if (!emailValid) valid = false;

  const passwordValid = password.length >= 6;
  get('passwordField').classList.toggle('has-error', !passwordValid);
  if (!passwordValid) valid = false;

  if (!valid) return;

  saveBtn.classList.add('is-loading');
  saveBtn.disabled = true;

  try {
    await createUserAccount({
      email,
      password,
      fullName,
      role: get('newRole').value,
      department: get('newDepartment').value.trim() || null,
    });
    showToast(`Account created for ${fullName}`, 'success');
    closeModal();
    await loadAndRenderUsers();
  } catch (err) {
    showToast(err.message, 'error');
    saveBtn.classList.remove('is-loading');
    saveBtn.disabled = false;
  }
}

// ------------------------------------------------------------
// Toggle active / change role
// ------------------------------------------------------------
async function handleToggleActive(user) {
  const willActivate = !user.is_active;
  const confirmed = await confirmDialog({
    title: willActivate ? 'Reactivate this account?' : 'Deactivate this account?',
    message: willActivate
      ? `${escapeHTML(user.full_name)} will be able to sign in again.`
      : `${escapeHTML(user.full_name)} will no longer be able to sign in. Their history is kept.`,
    confirmLabel: willActivate ? 'Reactivate' : 'Deactivate',
    danger: !willActivate,
  });
  if (!confirmed) return;

  try {
    await setUserActive(user.id, willActivate);
    showToast(`${user.full_name} ${willActivate ? 'reactivated' : 'deactivated'}`, 'success');
    await loadAndRenderUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleChangeRole(user) {
  const newRole = user.role === 'admin' ? 'staff' : 'admin';
  const confirmed = await confirmDialog({
    title: `Change role to ${capitalize(newRole)}?`,
    message: `${escapeHTML(user.full_name)} will become ${newRole === 'admin' ? 'an Admin with full access' : 'Staff with standard access'}.`,
    confirmLabel: 'Change Role',
    danger: false,
  });
  if (!confirmed) return;

  try {
    await setUserRole(user.id, newRole);
    showToast(`${user.full_name} is now ${capitalize(newRole)}`, 'success');
    await loadAndRenderUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
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
