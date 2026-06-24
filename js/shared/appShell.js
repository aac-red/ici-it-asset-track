// ============================================================
// APP SHELL
// Builds the sidebar / topbar / bottom-nav chrome shared by every
// authenticated page. Call mountShell() once per page with the
// current profile and the active page key.
// ============================================================
import { logout } from '../auth/auth.js';

// Inline SVG icons (stroke-based, 24x24 viewbox) — no external icon
// dependency needed for the handful we use.
const ICONS = {
  dashboard: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  items: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  borrowers: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>',
  transactions: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5"/></svg>',
  reports: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7"/></svg>',
  inventory: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>',
  users: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M2 19c0-3 3-5 7-5s7 2 7 5M16 4.5c1.7.3 3 1.8 3 3.5s-1.3 3.2-3 3.5M19 14c2 .4 3.5 1.8 3.5 3.5"/></svg>',
  logout: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
};

// Primary nav — visible to all authenticated roles
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'dashboard', inBottomNav: true },
  { key: 'items', label: 'Items', href: 'items.html', icon: 'items', inBottomNav: true },
  { key: 'borrowers', label: 'Borrowers', href: 'borrowers.html', icon: 'borrowers', inBottomNav: false },
  { key: 'transactions', label: 'Transactions', href: 'transactions.html', icon: 'transactions', inBottomNav: true },
  { key: 'inventory', label: 'Inventory', href: 'inventory.html', icon: 'inventory', inBottomNav: false },
  { key: 'reports', label: 'Reports', href: 'reports.html', icon: 'reports', inBottomNav: false },
];

// Future module placeholders — none currently. Kept as an empty array so
// the "Coming Soon" rendering path in navLinkHTML remains available for
// any future module without needing shell changes.
const FUTURE_NAV_ITEMS = [];

// Admin-only nav
const ADMIN_NAV_ITEMS = [
  { key: 'users', label: 'Manage Users', href: 'users.html', icon: 'users', inBottomNav: false },
];

function navLinkHTML(item, activeKey) {
  const isActive = item.key === activeKey;
  if (item.comingSoon) {
    return `
      <span class="nav-link is-disabled" aria-disabled="true" title="Coming soon">
        ${ICONS[item.icon]}
        <span>${item.label}</span>
        <span class="nav-soon-tag">Soon</span>
      </span>`;
  }
  return `
    <a href="${item.href}" class="nav-link${isActive ? ' active' : ''}">
      ${ICONS[item.icon]}
      <span>${item.label}</span>
    </a>`;
}

function initials(fullName) {
  if (!fullName) return '?';
  return fullName.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/**
 * Mount the app shell chrome into the page.
 * @param {object} profile - current user's profile row
 * @param {string} activeKey - which nav item is active (e.g. 'dashboard')
 * @param {string} pageTitle - shown in the topbar
 */
export function mountShell(profile, activeKey, pageTitle) {
  const isAdmin = profile.role === 'admin';
  const allNavItems = [...NAV_ITEMS, ...FUTURE_NAV_ITEMS, ...(isAdmin ? ADMIN_NAV_ITEMS : [])];
  const bottomNavItems = NAV_ITEMS.filter(i => i.inBottomNav);

  // ---- Sidebar ----
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <img class="brand-mark" src="assets/icon-mark.png" alt="Innovative Controls">
      <div>
        <div class="brand-name">AssetTrack</div>
        <div class="brand-sub">IT Borrowing System</div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-nav-group">
        <div class="sidebar-nav-label">Operations</div>
        ${NAV_ITEMS.map(i => navLinkHTML(i, activeKey)).join('')}
      </div>
      ${FUTURE_NAV_ITEMS.length > 0 ? `
      <div class="sidebar-nav-group">
        <div class="sidebar-nav-label">Coming Soon</div>
        ${FUTURE_NAV_ITEMS.map(i => navLinkHTML(i, activeKey)).join('')}
      </div>` : ''}
      ${isAdmin ? `
      <div class="sidebar-nav-group">
        <div class="sidebar-nav-label">Administration</div>
        ${ADMIN_NAV_ITEMS.map(i => navLinkHTML(i, activeKey)).join('')}
      </div>` : ''}
    </nav>
    <div class="sidebar-footer">
      <div class="user-chip">
        <div class="avatar">${initials(profile.full_name)}</div>
        <div class="user-meta">
          <div class="user-name">${profile.full_name}</div>
          <div class="user-role">${profile.role}</div>
        </div>
        <button class="btn-ghost" id="logoutBtn" title="Sign out" aria-label="Sign out" style="padding:8px;">
          ${ICONS.logout}
        </button>
      </div>
    </div>
  `;

  // ---- Scrim (mobile drawer backdrop) ----
  const scrim = document.createElement('div');
  scrim.className = 'sidebar-scrim';
  scrim.id = 'sidebarScrim';

  // ---- Main area: topbar + content slot ----
  const mainArea = document.createElement('div');
  mainArea.className = 'main-area';

  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div style="display:flex; align-items:center; gap: var(--sp-3);">
      <button class="menu-toggle" id="menuToggle" aria-label="Open menu">${ICONS.menu}</button>
      <h1>${pageTitle}</h1>
    </div>
    <div class="topbar-actions" id="topbarActions"></div>
  `;

  const contentSlot = document.createElement('div');
  contentSlot.className = 'content';
  contentSlot.id = 'pageContent';

  mainArea.appendChild(topbar);
  mainArea.appendChild(contentSlot);

  // ---- Bottom nav (mobile only, via CSS) ----
  const bottomNav = document.createElement('nav');
  bottomNav.className = 'bottom-nav';
  bottomNav.innerHTML = bottomNavItems.map(item => `
    <a href="${item.href}" class="bottom-nav-link${item.key === activeKey ? ' active' : ''}">
      ${ICONS[item.icon]}
      <span>${item.label}</span>
    </a>
  `).join('');

  // ---- Assemble ----
  const shellRoot = document.createElement('div');
  shellRoot.className = 'app-shell';
  shellRoot.appendChild(sidebar);
  shellRoot.appendChild(mainArea);

  document.body.innerHTML = '';
  document.body.appendChild(shellRoot);
  document.body.appendChild(scrim);
  document.body.appendChild(bottomNav);

  // ---- Behavior: mobile drawer open/close ----
  const menuToggle = document.getElementById('menuToggle');
  menuToggle.addEventListener('click', () => {
    sidebar.classList.add('is-open');
    scrim.classList.add('is-visible');
  });
  scrim.addEventListener('click', () => {
    sidebar.classList.remove('is-open');
    scrim.classList.remove('is-visible');
  });

  // ---- Behavior: logout ----
  document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
  });

  return { contentSlot, topbarActions: document.getElementById('topbarActions') };
}

/**
 * Set a numeric badge on a nav item (sidebar + bottom nav) after the
 * shell has mounted — e.g. an overdue-loans count. Pass 0 to clear it.
 */
export function setNavBadge(navKey, count) {
  document.querySelectorAll(`.sidebar-nav a.nav-link, .bottom-nav a.bottom-nav-link`).forEach((link) => {
    const isMatch = link.getAttribute('href') === NAV_ITEMS.find(i => i.key === navKey)?.href;
    if (!isMatch) return;

    let badge = link.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        link.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : String(count);
    } else if (badge) {
      badge.remove();
    }
  });
}
