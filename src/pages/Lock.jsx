// قفل التطبيق بعد انتهاء التجربة، مع إبقاء خيار تصدير البيانات لأن البيانات ملك صاحب الصالون.
import React from 'react';
import { Check, Download, Lock as LockIcon, LogOut, MessageCircle, Sparkles, Store, Timer } from 'lucide-react';
import { localISO, money, toCSV, LOCALE } from '../data.js';
import { roi } from '../smart.js';
import { TRIAL_DAYS, buyLink, plans } from '../lib/license.js';
import { auth, cloudEnabled } from '../lib/sync.js';
import { Button, download, openExternal, useApp } from '../ui.jsx';

export function TrialBanner({ license, shop }) {
  const { data, go, can } = useApp();
  const value = roi(data, localISO(new Date(new Date(shop.trial_ends_at).getTime() - TRIAL_DAYS * 86400000)));
  const urgent = license.daysLeft <= 2;
  return <div className={`trial-banner ${urgent ? 'urgent' : ''}`}>
    <Timer size={18} />
    <span>{license.daysLeft <= 1 ? `تنتهي التجربة خلال ${license.hoursLeft} ساعة` : `باقي ${license.daysLeft} أيام من التجربة`}{value.total > 0 && <> · حقق لك التطبيق <b>{money(value.total)}</b></>}</span>
    {can('settings') && <button type="button" onClick={() => go('settings', { open: 'plan' })}>اشترك</button>}
  </div>;
}

export const exportAll = data => {
  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  download(`clients-${localISO()}.csv`, toCSV([['الاسم', 'الهاتف', 'ملاحظات'], ...data.clients.map(c => [c.name, c.phone, c.notes])]));
  download(`appointments-${localISO()}.csv`, toCSV([['التاريخ', 'الوقت', 'العميل', 'الخدمات', 'المبلغ', 'الحالة'], ...data.appointments.map(a => [a.date, a.time, clients[a.clientId]?.name, (a.items || []).map(i => i.name).join(' + '), a.price, a.status])]));
  download(`backup-${localISO()}.json`, JSON.stringify(data), 'application/json');
};

export default function Lock({ shop, data, license, shops, switchShop }) {
  const value = roi(data, '2000-01-01');
  // الموظفون يتوقفون مع صاحب الصالون، لكن لا نعرض لهم الأسعار ولا التصدير.
  const owner = (shop.role || 'owner') === 'owner';
  return <div className="auth lock">
    <div className="auth-card auth-card-wide">
      <div className="auth-brand">
        <span className="brand-mark brand-mark-lg lock-mark"><LockIcon size={28} /></span>
        <h1>{license.status === 'suspended' ? 'الحساب موقوف' : license.status === 'expired' ? 'انتهى الاشتراك' : 'انتهت فترة التجربة'}</h1>
        <p>{owner ? 'بياناتك محفوظة بأمان. اشترك لتكمل العمل من حيث توقفت.' : `اشتراك «${data.shopName || shop.name}» متوقف حالياً. تواصل مع صاحب الصالون لتفعيله — سيفتح التطبيق تلقائياً بعدها.`}</p>
      </div>
      {owner && <>
      {value.total > 0 && <div className="roi-hero"><Sparkles size={20} /><span>خلال التجربة حقق لك التطبيق</span><strong>{money(value.total)}</strong><small>{value.lines.filter(l => l.count).map(l => `${l.count} ${l.label}`).join(' · ')}</small></div>}
      <div className="plans">{plans.map(plan => <div key={plan.id} className={`plan ${plan.best ? 'plan-best' : ''}`}>
        {plan.best && <span className="plan-tag">الأوفر</span>}
        <strong>{plan.name}</strong>
        <div className="plan-price">{plan.price.toLocaleString(LOCALE)} <small>ر.ق {plan.period}</small></div>
        <p><Check size={14} /> {plan.note}</p>
        <Button variant={plan.best ? 'primary' : 'secondary'} icon={MessageCircle} block onClick={() => openExternal(buyLink(data.shopName, plan))}>اشترك عبر واتساب</Button>
      </div>)}</div>
      <p className="muted center small">بعد الدفع نفعّل حسابك خلال دقائق — يفتح التطبيق تلقائياً.</p>
      </>}
      <div className="row-buttons center">
        {owner && <Button variant="ghost" icon={Download} onClick={() => exportAll(data)}>تصدير بياناتي</Button>}
        {shops.length > 1 && shops.filter(s => s.id !== shop.id).map(s => <Button key={s.id} variant="ghost" icon={Store} onClick={() => switchShop(s.id)}>{s.name}</Button>)}
        {cloudEnabled && <Button variant="ghost" icon={LogOut} onClick={() => auth.signOut()}>خروج</Button>}
      </div>
    </div>
  </div>;
}
