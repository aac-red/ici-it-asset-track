// ============================================================
// QR CODE UTILITY
// ============================================================

export function itemDeepLink(itemId) {
  const base = window.location.origin +
    window.location.pathname.replace(/items\.html.*$/, 'items.html');
  return `${base}?id=${itemId}`;
}

export function renderQRCode(container, text, size = 96) {
  if (typeof QRCode === 'undefined') {
    container.innerHTML = '<p style="font-size:12px;color:#D62A2B;">QR library failed to load. Check your internet connection.</p>';
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
 * Wait for QRCode.js to finish rendering before reading the data URL.
 * QRCode.js draws asynchronously — reading img.src/canvas.toDataURL()
 * immediately after renderQRCode() often returns empty/blank data.
 */
export function waitForQRDataUrl(box, timeoutMs = 1500, intervalMs = 50) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const img = box.querySelector('img');
      const canvas = box.querySelector('canvas');
      let dataUrl = null;
      try {
        dataUrl = img && img.src && img.src !== 'about:blank'
          ? img.src
          : canvas ? canvas.toDataURL('image/png') : null;
      } catch { dataUrl = null; }
      if (dataUrl && dataUrl.length > 100) {
        resolve(dataUrl);
      } else if (Date.now() - start > timeoutMs) {
        resolve(null);
      } else {
        setTimeout(check, intervalMs);
      }
    };
    check();
  });
}

export function printSingleSticker(item, qrDataUrl, copies = 1) {
  const count = Math.max(1, Math.min(20, copies));
  const stickerHTML = `
    <div class="sticker">
      <img src="${qrDataUrl}" alt="QR code">
      <span class="tag">${escapeHTML(item.asset_tag)}</span>
      <span class="name">${escapeHTML(item.name)}</span>
    </div>`;
  const isSingle = count === 1;
  const win = window.open('', '_blank', isSingle ? 'width=320,height=420' : 'width=700,height=800');
  win.document.write(`
    <html>
      <head>
        <title>Print sticker — ${escapeHTML(item.asset_tag)} (${count}×)</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 16px;
            ${isSingle ? 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;' : ''} }
          .sheet { display:grid; grid-template-columns:repeat(${count === 1 ? 1 : count === 2 ? 2 : 3},auto); gap:10px; justify-content:${isSingle ? 'center' : 'start'}; }
          .sticker { border:1px dashed #999; border-radius:6px; padding:14px; display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; break-inside:avoid; }
          img { width:120px; height:120px; }
          .tag { font-family:'Courier New',monospace; font-size:13px; font-weight:700; background:#F68B37; color:#4D2305; padding:2px 8px; border-radius:4px; }
          .name { font-size:12px; color:#221F20; max-width:140px; }
          @media print { body { margin:8px; } }
        </style>
      </head>
      <body onload="window.print()">
        <div class="sheet">${stickerHTML.repeat(count)}</div>
      </body>
    </html>`);
  win.document.close();
}

export function printStickerSheet(entries) {
  const win = window.open('', '_blank', 'width=700,height=800');
  const stickersHTML = entries.map(({ item, dataUrl }) => `
    <div class="sticker">
      <img src="${dataUrl}" alt="QR code">
      <span class="tag">${escapeHTML(item.asset_tag)}</span>
      <span class="name">${escapeHTML(item.name)}</span>
    </div>`).join('');
  win.document.write(`
    <html>
      <head>
        <title>Print sticker sheet</title>
        <style>
          * { box-sizing:border-box; }
          body { font-family:Arial,sans-serif; margin:16px; }
          .sheet { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
          .sticker { border:1px dashed #999; border-radius:6px; padding:10px; display:flex; flex-direction:column; align-items:center; gap:5px; text-align:center; break-inside:avoid; }
          img { width:90px; height:90px; }
          .tag { font-family:'Courier New',monospace; font-size:12px; font-weight:700; background:#F68B37; color:#4D2305; padding:1px 6px; border-radius:4px; }
          .name { font-size:11px; color:#221F20; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="sheet">${stickersHTML}</div>
      </body>
    </html>`);
  win.document.close();
}

function escapeHTML(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
