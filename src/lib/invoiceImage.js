// صورة الفاتورة (PNG) مع رمز QR برقم الفاتورة — تُرسل عبر واتساب، ويُفتح بها السجل عند مسح الرمز.
import qrcode from 'qrcode-generator';
import { isEn } from '../i18n.js';
import { isNative } from './native.js';
import { saveFile } from './files.js';

export function qrMatrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return { n, dark: (r, c) => qr.isDark(r, c) };
}

// lines: [{ label, value, strong?, muted? }]
export async function invoicePng({ shopName, number, client, when, lines, total, footer }) {
  await document.fonts?.ready;
  const W = 900; const pad = 60; const rowH = 58;
  const H = 420 + lines.length * rowH + 380;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const font = 'Tajawal, "IBM Plex Sans Arabic", sans-serif';
  const start = isEn ? pad : W - pad; const end = isEn ? W - pad : pad;
  ctx.direction = isEn ? 'ltr' : 'rtl';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b97932'; ctx.fillRect(0, 0, W, 14);

  let y = 100;
  ctx.textAlign = 'center'; ctx.fillStyle = '#1d1a16'; ctx.font = `800 48px ${font}`; ctx.fillText(shopName || '', W / 2, y);
  y += 50; ctx.fillStyle = '#8a8178'; ctx.font = `500 26px ui-monospace, monospace`; ctx.direction = 'ltr'; ctx.fillText(number, W / 2, y); ctx.direction = isEn ? 'ltr' : 'rtl';
  y += 60; ctx.font = `500 28px ${font}`;
  ctx.textAlign = isEn ? 'left' : 'right'; ctx.fillText(client || '', start, y);
  ctx.textAlign = isEn ? 'right' : 'left'; ctx.fillText(when, end, y);
  y += 30; ctx.strokeStyle = '#e4ddd3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();

  y += 20;
  for (const line of lines) {
    y += rowH;
    if (line.strong) { ctx.beginPath(); ctx.moveTo(pad, y - rowH + 12); ctx.lineTo(W - pad, y - rowH + 12); ctx.stroke(); }
    ctx.fillStyle = line.muted ? '#8a8178' : '#1d1a16';
    ctx.font = `${line.strong ? 800 : line.muted ? 500 : 600} ${line.strong ? 36 : line.muted ? 26 : 30}px ${font}`;
    ctx.textAlign = isEn ? 'left' : 'right'; ctx.fillText(line.label, start, y);
    ctx.textAlign = isEn ? 'right' : 'left'; ctx.fillText(line.value, end, y);
  }

  // رمز QR برقم الفاتورة.
  const { n, dark } = qrMatrix(number);
  const size = 220; const cell = Math.floor(size / n); const qrSize = cell * n;
  const qx = (W - qrSize) / 2; const qy = y + 60;
  ctx.fillStyle = '#1d1a16';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, cell, cell);
  ctx.textAlign = 'center'; ctx.fillStyle = '#8a8178'; ctx.font = `500 24px ${font}`;
  ctx.fillText(footer || '', W / 2, qy + qrSize + 60);
  ctx.fillStyle = '#b97932'; ctx.font = `800 34px ${font}`; ctx.fillText(total, W / 2, qy + qrSize + 110);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return blob;
}

// مشاركة الصورة (واتساب أو غيره) مع نص مرافق.
export async function shareImage(blob, name, text) {
  if (!isNative) {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }).catch(() => {}); return true; }
  }
  await saveFile(name, new Uint8Array(await blob.arrayBuffer()), 'image/png', { text });
  return true;
}
