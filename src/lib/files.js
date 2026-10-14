// حفظ/مشاركة ملف (تصدير Excel وWord وCSV والنسخ الاحتياطي).
// على الهاتف لا يعمل رابط التنزيل داخل التطبيق، فنكتب الملف ثم نفتح قائمة المشاركة (واتساب، Drive، الملفات...).
import { isNative } from './native.js';

const toBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

export async function saveFile(name, content, type = 'application/octet-stream') {
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    const safe = name.replace(/[\\/:*?"<>|]+/g, '-');
    const { uri } = await Filesystem.writeFile({ path: safe, data: toBase64(bytes), directory: Directory.Cache });
    // إلغاء المستخدم لقائمة المشاركة ليس خطأ.
    await Share.share({ title: safe, files: [uri], dialogTitle: safe }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
