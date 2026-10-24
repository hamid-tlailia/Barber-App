// الترخيص والتجربة المجانية (٧ أيام). في الوضع السحابي القرار للخادم؛ هنا نحسب الحالة للعرض وللعمل دون اتصال.
import { prefs } from './store.js';
import { L } from '../i18n.js';

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
  if (shop.member_suspended) return { status: 'member_suspended', locked: true };
  if (shop.plan === 'suspended') return { status: 'suspended', locked: true };
  if (paidUntil > now) return { status: 'paid', plan: shop.plan, until: paidUntil, daysLeft: Math.ceil((paidUntil - now) / DAY), locked: false };
  // مهلة السداد: يعمل التطبيق حتى نهايتها ثم يتوقف تماماً.
  const graceUntil = shop.grace_until ? new Date(shop.grace_until).getTime() : 0;
  if (graceUntil > now) return { status: 'grace', plan: shop.plan, until: graceUntil, daysLeft: Math.ceil((graceUntil - now) / DAY), locked: false };
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
  { id: 'monthly', name: L('شهري', 'Monthly'), price: 149, note: L('يشمل السحابة وتحديثات مستمرة', 'Includes cloud sync and ongoing updates'), period: L('/ شهر', '/ month') },
  { id: 'yearly', name: L('سنوي', 'Yearly'), price: 1499, note: L('شهران مجاناً + إعداد ونقل بياناتك', 'Two months free + setup and data migration'), period: L('/ سنة', '/ year'), best: true },
  { id: 'lifetime', name: L('مدى الحياة', 'Lifetime'), price: 2999, note: L('دفعة واحدة + 499 ر.ق سنوياً للسحابة والدعم', 'One-time payment + QAR 499/year for cloud and support'), period: L('مرة واحدة', 'one-time') },
];

// إضافات اختيارية فوق الباقة الأساسية — اشتراك منفصل بسعر واضح للعميل.
// رصيد «واتساب الذكي» الشهري: كل تذكير أو عرض أو تقرير يومي = رسالة. ردود المساعد داخل المحادثة لا تُحسب.
export const WA_INCLUDED = 500;
export const WA_EXTRA = { messages: 500, price: 29 };
export const waExtraLink = shopName => `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(L(`مرحباً، أرغب في إضافة ${WA_EXTRA.messages} رسالة واتساب (${WA_EXTRA.price} ر.ق) لصالون «${shopName || ''}» في تطبيق مِقص.`, `Hello, I would like to add ${WA_EXTRA.messages} WhatsApp messages (QAR ${WA_EXTRA.price}) for "${shopName || ''}" in the Miqass app.`))}`;

export const addons = [
  { id: 'wa', name: L('واتساب الذكي', 'Smart WhatsApp'), monthly: 49, yearly: 490, points: L(['تذكير تلقائي لكل عميل قبل موعده', 'العميل يرد 1 للتأكيد أو 2 للإلغاء ويتحدث الجدول وحده', 'تقرير يومي لك كل ليلة: الدخل والمواعيد والغياب', `يشمل ${WA_INCLUDED} رسالة شهرياً — وكل ${WA_EXTRA.messages} رسالة إضافية بـ${WA_EXTRA.price} ر.ق`], ['Automatic reminder to every client before their appointment', 'Clients reply 1 to confirm or 2 to cancel, and the schedule updates itself', 'A nightly report for you: revenue, appointments and no-shows', `Includes ${WA_INCLUDED} messages a month — each extra ${WA_EXTRA.messages} for QAR ${WA_EXTRA.price}`]) },
  { id: 'ai', name: L('المساعد الذكي (AI)', 'AI Assistant'), monthly: 99, yearly: 990, requires: 'wa', points: L(['يرد على عملائك في واتساب 24/7 بالعربي', 'يجيب عن الأسعار ويقترح الأوقات ويحجز مباشرة', 'لا تفوتك حجوزات الليل وأوقات الانشغال'], ['Replies to your clients on WhatsApp 24/7', 'Answers price questions, suggests times and books directly', 'Never miss late-night or busy-hour bookings']) },
];

export const addonLink = (shopName, addon) => `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(L(`مرحباً، أرغب في إضافة «${addon.name}» (${addon.monthly} ر.ق شهرياً أو ${addon.yearly} ر.ق سنوياً) لصالون «${shopName || ''}» في تطبيق مِقص.`, `Hello, I would like to add "${addon.name}" (QAR ${addon.monthly}/month or QAR ${addon.yearly}/year) for "${shopName || ''}" in the Miqass app.`))}`;

export const deletionLink = (shopName, reason) => `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(L(`مرحباً، أطلب حذف صالون «${shopName || ''}» وحسابي وكل بياناته من تطبيق مِقص.\nالسبب: ${reason}`, `Hello, I am requesting deletion of the salon "${shopName || ''}", my account and all its data from the Miqass app.\nReason: ${reason}`))}`;
export const buyLink = (shopName, plan) => `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(L(`مرحباً، أرغب في تفعيل اشتراك ${plan?.name || ''} لصالون «${shopName || ''}» في تطبيق مِقص.`, `Hello, I would like to activate the ${plan?.name || ''} plan for "${shopName || ''}" in the Miqass app.`))}`;
