// حفظ/مشاركة ملف (تصدير Excel وWord وCSV والنسخ الاحتياطي).
// على الهاتف لا يعمل رابط التنزيل داخل التطبيق، فنكتب الملف ثم نفتح قائمة المشاركة (واتساب، Drive، الملفات...).
import { isNative } from './native.js';

const toBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

export async function saveFile(name, content, type = 'application/octet-stream', { text } = {}) {
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    const safe = name.replace(/[\\/:*?"<>|]+/g, '-');
    const { uri } = await Filesystem.writeFile({ path: safe, data: toBase64(bytes), directory: Directory.Cache });
    // إلغاء المستخدم لقائمة المشاركة ليس خطأ.
    await Share.share({ title: safe, files: [uri], dialogTitle: safe, ...(text ? { text } : {}) }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// طباعة عنصر (الفاتورة): window.print لا يعمل داخل تطبيق أندرويد، فنرسل HTML لخدمة الطباعة في النظام.
export async function printElement(element, name = 'Invoice') {
  if (!isNative) { window.print(); return; }
  const { Printer } = await import('@capgo/capacitor-printer');
  const dir = document.documentElement.dir || 'rtl';
  const html = `<!doctype html><html dir="${dir}" lang="${document.documentElement.lang}"><head><meta charset="utf-8"><style>
    body { font-family: 'IBM Plex Sans Arabic', 'Tajawal', sans-serif; color: #000; margin: 24px; }
    .invoice { display: grid; gap: 10px; max-width: 420px; margin: 0 auto; }
    .invoice header { display: flex; justify-content: space-between; align-items: baseline; font-size: 20px; }
    .invoice header small { font-family: monospace; color: #555; }
    .invoice-meta { display: flex; justify-content: space-between; gap: 10px; color: #555; font-size: 14px; padding-bottom: 8px; border-bottom: 1px solid #ccc; flex-wrap: wrap; }
    .invoice-line { display: flex; justify-content: space-between; gap: 10px; }
    .invoice-line.total { padding-top: 10px; border-top: 1px solid #ccc; font-size: 18px; font-weight: 800; }
    .invoice-line.muted { font-size: 13px; color: #555; }
    .invoice footer { text-align: center; color: #555; font-size: 13px; margin-top: 6px; }
  </style></head><body>${element.outerHTML}</body></html>`;
  await Printer.printHtml({ name, html });
}

// مشاركة رابط (رابط الحجز): قائمة المشاركة في الهاتف، أو نسخه في المتصفح. يعيد true إذا نُسخ فقط.
export async function shareLink(url, text = '') {
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ text, url }).catch(() => {});
    return false;
  }
  if (navigator.share) { await navigator.share({ text, url }).catch(() => {}); return false; }
  await navigator.clipboard.writeText(url);
  return true;
}
