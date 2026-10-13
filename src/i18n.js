// اللغة: العربية (افتراضي) أو الإنجليزية. كل نص في الواجهة يُكتب L('عربي', 'English').
// تغيير اللغة يعيد تحميل التطبيق لتتحدث كل النصوص والاتجاه دفعة واحدة.
export const LANG = (() => { try { return localStorage.getItem('miqass-lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; } })();
export const isEn = LANG === 'en';
export const L = (ar, en) => (isEn && en !== undefined ? en : ar);

export function setLang(lang) {
  try { localStorage.setItem('miqass-lang', lang === 'en' ? 'en' : 'ar'); } catch { /* ignore */ }
  window.location.reload();
}

// يضبط اتجاه الصفحة ولغتها قبل أول رسم.
if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG;
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';
}
