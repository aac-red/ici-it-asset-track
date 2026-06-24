// ============================================================
// TOAST UTILITY
// Lightweight feedback messages. Usage: showToast('Saved', 'success')
// ============================================================

let stackEl = null;

function ensureStack() {
  if (!stackEl) {
    stackEl = document.createElement('div');
    stackEl.className = 'toast-stack';
    document.body.appendChild(stackEl);
  }
  return stackEl;
}

/**
 * @param {string} message
 * @param {'default'|'success'|'error'} type
 * @param {number} duration ms before auto-dismiss
 */
export function showToast(message, type = 'default', duration = 3200) {
  const stack = ensureStack();
  const toast = document.createElement('div');
  toast.className = `toast${type !== 'default' ? ` toast-${type}` : ''}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  stack.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 150ms ease-out';
    setTimeout(() => toast.remove(), 150);
  }, duration);
}
