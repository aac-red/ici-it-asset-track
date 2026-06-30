// ============================================================
// QR CODE UTILITY
// Uses the QRCode.js CDN library (loaded via script tag in
// items.html). Generates a QR that deep-links to the item's
// record inside the app: items.html?id=<item-id>
//
// Scanning requires being logged in — there is no public/unauth
// view of item data. This is intentional: the QR is a shortcut
// to open the right record fast, not a public lookup.
// ============================================================

/** Build the deep-link URL a QR code should encode for a given item. */
export function itemDeepLink(itemId) {
  const base = window.location.origin + window.location.pathname.replace(/items\.html.*$/, 'items.html');
  return `${base}?id=${itemId}`;
}

/**
 * Render a QR code into a container element.
 * @param {HTMLElement} container
 * @param {string} text - the URL/text to encode
 * @param {number} size - pixel size (kept small per request — default 96)
 */
export function renderQRCode(container, text, size = 96) {
  if (typeof QRCode === 'undefined') {
    container.innerHTML = '<p style="font-size:12px; color:#D62A2B;">QR library failed to load. Check your internet connection.</p>';
    return;
  }
  container.innerHTML = '';
  new QRCode(container, {
    text,
    width: size,
    height: size,
    colorDark: '#221F20',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

/**
 * Open a small browser print window with a single sticker
 * (QR + asset tag + name) ready to print.
 */
export function printSingleSticker(item, qrDataUrl) {
  const win = window.open('', '_blank', 'width=320,height=420');
  win.document.write(`
    <html>
      <head>
        <title>Print sticker — ${escapeHTML(item.asset_tag)}</title>
        <style>
          body { font-family: Arial, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
          .sticker { border:1px dashed #999; border-radius:6px; padding:14px; display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; }
          img { width:120px; height:120px; }
          .tag { font-family: 'Courier New', monospace; font-size:13px; font-weight:700; background:#F68B37; color:#4D2305; padding:2px 8px; border-radius:4px; }
          .name { font-size:12px; color:#221F20; max-width:140px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="sticker">
          <img src="${qrDataUrl}" alt="QR code">
          <span class="tag">${escapeHTML(item.asset_tag)}</span>
          <span class="name">${escapeHTML(item.name)}</span>
        </div>
      </body>
    </html>
  `);
  win.document.close();
}

/**
 * Open a print window containing a full sticker sheet (3 per row)
 * for a list of items — each with its own freshly-generated QR.
 * @param {Array<{item: object, dataUrl: string}>} entries
 */
export function printStickerSheet(entries) {
  const win = window.open('', '_blank', 'width=700,height=800');
  const stickersHTML = entries.map(({ item, dataUrl }) => `
    <div class="sticker">
      <img src="${dataUrl}" alt="QR code">
      <span class="tag">${escapeHTML(item.asset_tag)}</span>
      <span class="name">${escapeHTML(item.name)}</span>
    </div>
  `).join('');

  win.document.write(`
    <html>
      <head>
        <title>Print sticker sheet</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 16px; }
          .sheet { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
          .sticker { border:1px dashed #999; border-radius:6px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:5px; text-align:center; break-inside: avoid; }
          img { width:90px; height:90px; }
          .tag { font-family: 'Courier New', monospace; font-size:12px; font-weight:700; background:#F68B37; color:#4D2305; padding:1px 6px; border-radius:4px; }
          .name { font-size:11px; color:#221F20; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="sheet">${stickersHTML}</div>
      </body>
    </html>
  `);
  win.document.close();
}

function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
