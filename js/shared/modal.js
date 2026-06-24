// ============================================================
// MODAL UTILITY
// Minimal, dependency-free modal opener/closer used across pages.
// ============================================================

let activeOverlay = null;
let lastFocusedEl = null;

/**
 * Open a modal with the given inner HTML.
 * @param {string} innerHTML - full .modal markup (header/body/footer)
 * @param {object} opts
 * @param {boolean} opts.dismissible - click-outside / Esc closes it (default true)
 * @returns {HTMLElement} the overlay element, for attaching listeners
 */
export function openModal(innerHTML, { dismissible = true } = {}) {
  closeModal(); // only one at a time

  lastFocusedEl = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = innerHTML;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  activeOverlay = overlay;

  if (dismissible) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', escListener);
  }

  // Focus the first focusable element inside the modal
  const focusable = overlay.querySelector('input, select, textarea, button');
  if (focusable) focusable.focus();

  return overlay;
}

function escListener(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  if (!activeOverlay) return;
  activeOverlay.remove();
  activeOverlay = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', escListener);
  if (lastFocusedEl && lastFocusedEl.focus) lastFocusedEl.focus();
}

/**
 * Convenience: open a confirm dialog, returns a Promise<boolean>.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    const overlay = openModal(`
      <div class="modal" style="max-width: 360px;">
        <div class="modal-body confirm-dialog-body">
          <div class="confirm-dialog-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z"/></svg>
          </div>
          <h3>${title}</h3>
          <p>${message}</p>
        </div>
        <div class="modal-footer" style="justify-content:center;">
          <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmOk">${confirmLabel}</button>
        </div>
      </div>
    `);

    overlay.querySelector('#confirmCancel').addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
    overlay.querySelector('#confirmOk').addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}
