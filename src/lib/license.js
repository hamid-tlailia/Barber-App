// الترخيص والتجربة المجانية (٧ أيام). في الوضع السحابي القرار للخادم؛ هنا نحسب الحالة للعرض وللعمل دون اتصال.
import { prefs } from './store.js';

export const TRIAL_DAYS = 7;
export const SALES_WHATSAPP = import.meta.env?.VITE_SALES_WHATSAPP || '97471009494';
const DAY = 86400000;

// يمنع إرجاع ساعة الجهاز للخلف لتمديد التجربة: نحفظ أكبر وقت شوهد.
export function trustedNow(serverAnchor) {
  const device = Date.now();
  const seen = Math.max(device, Number(prefs.get('clock-high', 0)));
  prefs.set('clock-high', seen);
  if (serverAnchor?.serverTime && serverAnchor?.fetchedAt) {
    const elapsed = Math.max(0, seen - serverAnchor.fetchedAt);
    return Math.max(new Date(serverAnchor.serverTime).getTime() + elapsed, seen - DAY);
  }
  return seen;
}

export function licenseState(shop, anchor) {
  if (!shop) return { status: 'none' };
  const now = trustedNow(anchor);
  const paidUntil = shop.paid_until ? new Date(shop.paid_until).getTime() : 0;
  const trialEnds = new Date(shop.trial_ends_at).getTime();
  if (shop.plan === 'suspended') return { status: 'suspended', locked: true };
  if (paidUntil > now) return { status: 'paid', plan: shop.plan, until: paidUntil, daysLeft: Math.ceil((paidUntil - now) / DAY), locked: false };
  if (trialEnds > now) return { status: 'trial', until: trialEnds, daysLeft: Math.ceil((trialEnds - now) / DAY), hoursLeft: Math.ceil((trialEnds - now) / 3600000), locked: false };
  return { status: paidUntil ? 'expired' : 'trial_ended', locked: true };
}

// وضع الجهاز الواحد بدون سحابة: التجربة تبدأ من أول تشغيل.
export function localShop() {
  let start = prefs.get('local-trial-start', null);
  if (!start) { start = Date.now(); prefs.set('local-trial-start', start); }
  return { id: 'local', name: '', role: 'owner', plan: 'trial', trial_ends_at: new Date(start + TRIAL_DAYS * DAY).toISOString(), paid_until: null };
}

export const plans = [
  { id: 'monthly', name: 'شهري', price: 149, note: 'يشمل السحابة وتحديثات مستمرة', period: '/ شهر' },
  { id: 'yearly', name: 'سنوي', price: 1499, note: 'شهران مجاناً + إعداد ونقل بياناتك', period: '/ سنة', best: true },
  { id: 'lifetime', name: 'مدى الحياة', price: 2999, note: 'دفعة واحدة + 499 ر.ق سنوياً للسحابة والدعم', period: 'مرة واحدة' },
];

export const buyLink = (shopName, plan) => `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(`مرحباً، أرغب في تفعيل اشتراك ${plan?.name || ''} لصالون «${shopName || ''}» في تطبيق مِقص.`)}`;
