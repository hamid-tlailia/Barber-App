// قفل التطبيق بعد انتهاء التجربة، مع إبقاء خيار تصدير البيانات لأن البيانات ملك صاحب الصالون.
import React from 'react';
import { Check, Download, Lock as LockIcon, LogOut, MessageCircle, Sparkles, Store, Timer } from 'lucide-react';
import { localISO, money, num, toCSV, LOCALE } from '../data.js';
import { roi } from '../smart.js';
import { TRIAL_DAYS, buyLink, plans } from '../lib/license.js';
import { auth, cloudEnabled } from '../lib/sync.js';
import { Button, download, openExternal, useApp } from '../ui.jsx';
import { L } from '../i18n.js';

export function TrialBanner({ license, shop }) {
  const { data, go, can } = useApp();
  const value = roi(data, localISO(new Date(new Date(shop.trial_ends_at).getTime() - TRIAL_DAYS * 86400000)));
  const urgent = license.daysLeft <= 2;
  return <div className={`trial-banner ${urgent ? 'urgent' : ''}`}>
    <Timer size={18} />
    <span>{license.daysLeft <= 1 ? L(`تنتهي التجربة خلال ${license.hoursLeft} ساعة`, `Trial ends in ${license.hoursLeft} ${license.hoursLeft === 1 ? 'hour' : 'hours'}`) : L(`باقي ${license.daysLeft} أيام من التجربة`, `${license.daysLeft} days left in your trial`)}{value.total > 0 && <> · {L('حقق لك التطبيق', 'The app has earned you')} <b>{money(value.total)}</b></>}</span>
    {can('settings') && <button type="button" onClick={() => go('settings', { open: 'plan' })}>{L('اشترك', 'Subscribe')}</button>}
  </div>;
}

// انتهى الاشتراك وهو في المهلة، أو قارب على الانتهاء: تنبيه واضح مع التواصل مع المالك.
export function SubscriptionBanner({ license, shop }) {
  const { data, isManager } = useApp();
  const grace = license.status === 'grace';
  if (!grace && !(license.status === 'paid' && license.plan !== 'lifetime' && license.daysLeft <= 2)) return null;
  const shopName = data.shopName || shop.name;
  const text = grace
    ? L(`انتهى الاشتراك — لديك مهلة ${num(license.daysLeft)} ${license.daysLeft === 1 ? 'يوم' : 'أيام'} ثم يتوقف التطبيق تماماً`, `Subscription expired — you have a ${num(license.daysLeft)}-day grace period, then the app will stop working`)
    : L(`ينتهي اشتراكك خلال ${num(license.daysLeft)} ${license.daysLeft === 1 ? 'يوم' : 'أيام'}`, `Your subscription ends in ${num(license.daysLeft)} ${license.daysLeft === 1 ? 'day' : 'days'}`);
  return <div className="trial-banner urgent">
    <Timer size={18} />
    <span>{text}</span>
    {isManager && <button type="button" onClick={() => openExternal(buyLink(shopName, plans.find(p => p.id === license.plan)))}>{L('جدّد الآن', 'Renew now')}</button>}
  </div>;
}

export const exportAll = async data => {
  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  await download(`clients-${localISO()}.csv`, toCSV([[L('الاسم', 'Name'), L('الهاتف', 'Phone'), L('ملاحظات', 'Notes')], ...data.clients.map(c => [c.name, c.phone, c.notes])]));
  await download(`appointments-${localISO()}.csv`, toCSV([[L('التاريخ', 'Date'), L('الوقت', 'Time'), L('العميل', 'Client'), L('الخدمات', 'Services'), L('المبلغ', 'Amount'), L('الحالة', 'Status')], ...data.appointments.map(a => [a.date, a.time, clients[a.clientId]?.name, (a.items || []).map(i => i.name).join(' + '), a.price, a.status])]));
  await download(`backup-${localISO()}.json`, JSON.stringify(data), 'application/json');
};

export default function Lock({ shop, data, license, shops, switchShop }) {
  // الموظفون يتوقفون مع صاحب الصالون، لكن لا نعرض لهم الأسعار ولا التصدير.
  const owner = (shop.role || 'owner') === 'owner' && license.status !== 'member_suspended';
  if (license.status === 'member_suspended') return <div className="auth lock">
    <div className="auth-card">
      <div className="auth-brand">
        <span className="brand-mark brand-mark-lg lock-mark"><LockIcon size={28} /></span>
        <h1>{L('تم إيقاف حسابك', 'Your account has been suspended')}</h1>
        <p>{L(`أوقف صاحب «${shop.name}» حسابك في الصالون. إذا كان ذلك خطأ تواصل معه لإعادة التفعيل.`, `The owner of "${shop.name}" has suspended your account. If this is a mistake, contact them to reactivate it.`)}</p>
      </div>
      <div className="row-buttons center">
        {shops.length > 1 && shops.filter(s => s.id !== shop.id).map(s => <Button key={s.id} variant="ghost" icon={Store} onClick={() => switchShop(s.id)}>{s.name}</Button>)}
        {cloudEnabled && <Button variant="ghost" icon={LogOut} onClick={() => auth.signOut()}>{L('خروج', 'Sign out')}</Button>}
      </div>
    </div>
  </div>;
  const value = roi(data, '2000-01-01');
  return <div className="auth lock">
    <div className="auth-card auth-card-wide">
      <div className="auth-brand">
        <span className="brand-mark brand-mark-lg lock-mark"><LockIcon size={28} /></span>
        <h1>{license.status === 'suspended' ? L('الحساب موقوف', 'Account suspended') : license.status === 'expired' ? L('انتهى الاشتراك', 'Subscription expired') : L('انتهت فترة التجربة', 'Your trial has ended')}</h1>
        <p>{owner ? L('بياناتك محفوظة بأمان. اشترك لتكمل العمل من حيث توقفت.', 'Your data is safe. Subscribe to pick up right where you left off.') : L(`اشتراك «${data.shopName || shop.name}» متوقف حالياً. تواصل مع صاحب الصالون لتفعيله — سيفتح التطبيق تلقائياً بعدها.`, `The subscription for "${data.shopName || shop.name}" is currently inactive. Contact the salon owner to activate it — the app will unlock automatically afterwards.`)}</p>
      </div>
      {owner && <>
      {value.total > 0 && <div className="roi-hero"><Sparkles size={20} /><span>{L('خلال التجربة حقق لك التطبيق', 'During the trial, the app earned you')}</span><strong>{money(value.total)}</strong><small>{value.lines.filter(l => l.count).map(l => `${l.count} ${l.label}`).join(' · ')}</small></div>}
      <div className="plans">{plans.map(plan => <div key={plan.id} className={`plan ${plan.best ? 'plan-best' : ''}`}>
        {plan.best && <span className="plan-tag">{L('الأوفر', 'Best value')}</span>}
        <strong>{plan.name}</strong>
        <div className="plan-price">{plan.price.toLocaleString(LOCALE)} <small>{L('ر.ق', 'QAR')} {plan.period}</small></div>
        <p><Check size={14} /> {plan.note}</p>
        <Button variant={plan.best ? 'primary' : 'secondary'} icon={MessageCircle} block onClick={() => openExternal(buyLink(data.shopName, plan))}>{L('اشترك عبر واتساب', 'Subscribe via WhatsApp')}</Button>
      </div>)}</div>
      <p className="muted center small">{L('بعد الدفع نفعّل حسابك خلال دقائق — يفتح التطبيق تلقائياً.', 'After payment we activate your account within minutes — the app unlocks automatically.')}</p>
      </>}
      <div className="row-buttons center">
        {owner && <Button variant="ghost" icon={Download} onClick={() => exportAll(data)}>{L('تصدير بياناتي', 'Export my data')}</Button>}
        {shops.length > 1 && shops.filter(s => s.id !== shop.id).map(s => <Button key={s.id} variant="ghost" icon={Store} onClick={() => switchShop(s.id)}>{s.name}</Button>)}
        {cloudEnabled && <Button variant="ghost" icon={LogOut} onClick={() => auth.signOut()}>{L('خروج', 'Sign out')}</Button>}
      </div>
    </div>
  </div>;
}
