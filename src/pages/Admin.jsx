// لوحة المالك (أنت): متابعة الصالونات، تفعيل الاشتراكات والمهلة، الإضافات المدفوعة ونصوص الرسائل لكل صالون.
import React, { useEffect, useState } from 'react';
import {
  Ban, Bot, CalendarClock, CalendarPlus, Check, Copy, Crown, ExternalLink, Eye, EyeOff, MessageCircle, MessageSquareText, RefreshCw, Store, Timer, UsersRound,
} from 'lucide-react';
import { defaultSettings, num, roleText, whatsappLink, LOCALE } from '../data.js';
import { api, bookingUrl, errorText } from '../lib/sync.js';
import { plans } from '../lib/license.js';
import { prefs } from '../lib/store.js';
import { notifyNow } from '../lib/native.js';
import { Alert, Badge, Button, Confirm, Empty, Field, Row, SearchBox, Section, Segmented, Sheet, Stat, Toggle, openExternal, useApp } from '../ui.jsx';
import { L, isEn } from '../i18n.js';

const DAY = 86400000;
const time = value => (value ? new Date(value).getTime() : 0);
const dateText = value => new Date(value).toLocaleDateString(LOCALE);
const days = n => `${n} ${Number(n) === 1 ? 'day' : 'days'}`;
const statusOf = s => {
  if (s.plan === 'suspended') return 'suspended';
  if (time(s.paid_until) > Date.now()) return 'paid';
  if (time(s.grace_until) > Date.now()) return 'grace';
  if (time(s.trial_ends_at) > Date.now()) return 'trial';
  return 'expired';
};
const labels = { paid: [L('مشترك', 'Subscribed'), 'green'], grace: [L('في المهلة', 'Grace period'), 'orange'], trial: [L('تجربة', 'Trial'), 'blue'], expired: [L('منتهي', 'Expired'), 'red'], suspended: [L('موقوف', 'Suspended'), 'muted'] };
const daysLeft = s => Math.ceil((time({ paid: s.paid_until, grace: s.grace_until, trial: s.trial_ends_at }[statusOf(s)]) - Date.now()) / DAY);
// يحتاج متابعة: ينتهي خلال يومين، أو في المهلة، أو انتهى اشتراكه المدفوع خلال آخر أسبوع.
const needsFollowUp = s => {
  const status = statusOf(s);
  if (status === 'grace') return true;
  if ((status === 'paid' && s.plan !== 'lifetime') || status === 'trial') return daysLeft(s) <= 2;
  return status === 'expired' && s.paid_until && Date.now() - time(s.paid_until) < 7 * DAY;
};
const reminderText = s => statusOf(s) === 'grace'
  ? L(`مرحباً ${s.name} 👋 انتهى اشتراككم في تطبيق مِقص، ولديكم مهلة حتى ${dateText(s.grace_until)} ثم يتوقف التطبيق. للتجديد يسعدنا خدمتكم.`,
    `Hello ${s.name} 👋 Your Miqass subscription has ended. You have a grace period until ${dateText(s.grace_until)}, after which the app will stop working. We'd be happy to help you renew.`)
  : statusOf(s) === 'trial'
    ? L(`مرحباً ${s.name} 👋 تنتهي فترة تجربة تطبيق مِقص قريباً. هل نفعّل لكم الاشتراك لتستمروا دون انقطاع؟`,
      `Hello ${s.name} 👋 Your Miqass free trial ends soon. Shall we activate your subscription so you can continue without interruption?`)
    : L(`مرحباً ${s.name} 👋 تذكير: ينتهي اشتراككم في تطبيق مِقص بتاريخ ${dateText(s.paid_until)}. للتجديد يسعدنا خدمتكم.`,
      `Hello ${s.name} 👋 Reminder: your Miqass subscription ends on ${dateText(s.paid_until)}. We'd be happy to help you renew.`);

export default function Admin() {
  const { toast, reloadShops } = useApp();
  const [shops, setShops] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.admin.shops().then(setShops).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []);

  // تنبيه على الجهاز مرة يومياً بالصالونات التي تحتاج متابعة.
  useEffect(() => {
    if (!shops) return;
    const due = shops.filter(needsFollowUp);
    const today = new Date().toISOString().slice(0, 10);
    if (due.length && prefs.get('admin-followup-day', '') !== today) {
      prefs.set('admin-followup-day', today);
      notifyNow(L(`⏰ ${num(due.length)} صالون يحتاج متابعة`, `⏰ ${num(due.length)} ${due.length === 1 ? 'salon needs' : 'salons need'} follow-up`), due.slice(0, 3).map(s => s.name).join(L('، ', ', ')));
    }
  }, [shops]);

  const act = async (fn, message, close = false) => {
    try { await fn(); toast(message); if (close) setOpen(null); await load(); reloadShops(); } catch (e) { toast(errorText(e), 'error'); }
  };
  if (!shops) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  const counts = shops.reduce((c, s) => ({ ...c, [statusOf(s)]: (c[statusOf(s)] || 0) + 1 }), {});
  const followUp = shops.filter(needsFollowUp);
  const list = shops.filter(s => (filter === 'all' || statusOf(s) === filter) && (!query || s.name.includes(query) || (s.owner_email || '').includes(query) || (s.phone || '').includes(query)));
  const current = open && shops.find(s => s.id === open);

  return <div className="stack">
    <div className="stats">
      <Stat icon={Store} label={L('كل الصالونات', 'All salons')} value={num(shops.length)} />
      <Stat icon={Crown} tone="green" label={L('مشتركون', 'Subscribed')} value={num(counts.paid || 0)} onClick={() => setFilter('paid')} />
      <Stat icon={Timer} tone="blue" label={L('في التجربة', 'On trial')} value={num(counts.trial || 0)} onClick={() => setFilter('trial')} />
      <Stat icon={Ban} tone="red" label={L('منتهي', 'Expired')} value={num((counts.expired || 0) + (counts.grace || 0))} onClick={() => setFilter('expired')} />
    </div>
    {followUp.length > 0 && <Section title={L(`تحتاج متابعة (${num(followUp.length)})`, `Needs follow-up (${num(followUp.length)})`)}>
      <div className="list">{followUp.map(s => <Row key={s.id} leading={<span className="dot-icon tone-orange"><Timer size={18} /></span>} title={s.name}
        subtitle={`${labels[statusOf(s)][0]}${statusOf(s) !== 'expired' ? L(` · باقٍ ${num(Math.max(0, daysLeft(s)))} يوم`, ` · ${days(num(Math.max(0, daysLeft(s))))} left`) : L(' · لم يجدد', ' · Not renewed')}`}
        trailing={s.phone ? <Button size="sm" variant="secondary" icon={MessageCircle} onClick={event => { event.stopPropagation(); openExternal(whatsappLink(s.phone, reminderText(s))); }}>{L('تذكير', 'Remind')}</Button> : null}
        onClick={() => setOpen(s.id)} />)}</div>
    </Section>}
    <div className="page-head"><Segmented size="sm" items={[{ id: 'all', label: L('الكل', 'All') }, { id: 'trial', label: L('تجربة', 'Trial') }, { id: 'expired', label: L('منتهي', 'Expired') }, { id: 'paid', label: L('مشترك', 'Subscribed') }]} value={filter} onChange={setFilter} /><Button variant="ghost" icon={RefreshCw} onClick={load} /></div>
    <SearchBox value={query} onChange={setQuery} placeholder={L('اسم، بريد، رقم', 'Name, email, phone')} />
    {list.length ? <div className="list">{list.map(s => {
      const [label, tone] = labels[statusOf(s)];
      const left = daysLeft(s);
      const addons = [s.wa_addon && L('واتساب', 'WhatsApp'), s.ai_addon && 'AI'].filter(Boolean).join(' + ');
      const plan = statusOf(s) === 'paid' ? plans.find(p => p.id === s.plan)?.name : '';
      return <Row key={s.id} title={s.name} subtitle={[s.owner_email, plan, left > 0 && statusOf(s) !== 'suspended' ? L(`باقٍ ${num(left)} يوم`, `${days(num(left))} left`) : '', L(`${num(s.members)} حساب`, `${num(s.members)} ${Number(s.members) === 1 ? 'account' : 'accounts'}`), addons].filter(Boolean).join(' · ')}
        trailing={<span className="row-end">{s.duplicate_of && <Badge tone="red">{L('مكرر؟', 'Duplicate?')}</Badge>}<Badge tone={tone}>{label}</Badge></span>} onClick={() => setOpen(s.id)} />;
    })}</div> : <Empty icon={Store} title={L('لا نتائج', 'No results')} />}

    {current && <ShopSheet shop={current} act={act} onClose={() => setOpen(null)} />}
  </div>;
}

function ShopSheet({ shop, act, onClose }) {
  const [confirm, setConfirm] = useState(null);
  const status = statusOf(shop);
  const paid = status === 'paid';
  // تجديد بنفس الخطة يُضاف من نهاية الاشتراك الحالي، والتغيير يبدأ من اليوم.
  const untilFor = plan => {
    if (plan.id === 'lifetime') return '2999-12-31T00:00:00Z';
    const from = new Date(paid && shop.plan === plan.id ? time(shop.paid_until) : Date.now());
    from.setMonth(from.getMonth() + (plan.id === 'yearly' ? 12 : 1));
    return from.toISOString();
  };
  const choosePlan = plan => {
    const same = paid && shop.plan === plan.id;
    const currentName = plans.find(p => p.id === shop.plan)?.name;
    const end = plan.id === 'lifetime' ? L('مدى الحياة', 'lifetime') : dateText(untilFor(plan));
    setConfirm({
      title: same ? L(`تجديد ${plan.name}؟`, `Renew ${plan.name}?`) : paid ? L(`تغيير الخطة إلى ${plan.name}؟`, `Change plan to ${plan.name}?`) : L(`تفعيل اشتراك ${plan.name}؟`, `Activate ${plan.name} subscription?`),
      text: same
        ? L(`يُضاف ${plan.id === 'yearly' ? 'سنة' : 'شهر'} بعد ${dateText(shop.paid_until)} — حتى ${dateText(untilFor(plan))}.`, `Adds one ${plan.id === 'yearly' ? 'year' : 'month'} after ${dateText(shop.paid_until)} — until ${dateText(untilFor(plan))}.`)
        : paid ? L(`الخطة الحالية «${currentName}» حتى ${dateText(shop.paid_until)}. الخطة الجديدة تبدأ من اليوم حتى ${plan.id === 'lifetime' ? 'مدى الحياة' : dateText(untilFor(plan))}.`, `Current plan "${currentName}" runs until ${dateText(shop.paid_until)}. The new plan starts today and runs ${plan.id === 'lifetime' ? 'for' : 'until'} ${end}.`)
          : L(`يُفعَّل الصالون فوراً حتى ${plan.id === 'lifetime' ? 'مدى الحياة' : dateText(untilFor(plan))}.`, `The salon is activated immediately ${plan.id === 'lifetime' ? 'for' : 'until'} ${end}.`),
      label: same ? L('تجديد', 'Renew') : L('تأكيد', 'Confirm'),
      run: () => act(() => api.admin.setLicense(shop.id, plan.id, untilFor(plan)), same ? L('تم التجديد', 'Renewed') : L('تم تفعيل الخطة', 'Plan activated')),
    });
  };
  const canGrace = shop.paid_until && status !== 'suspended' && status !== 'grace' && (status === 'expired' || daysLeft(shop) <= 2) && !(time(shop.grace_until) > time(shop.paid_until));

  return <Sheet title={shop.name} subtitle={shop.owner_email} onClose={onClose} size="lg">
    <div className="stack">
      <div className="list">
        <Row title={L('الحالة', 'Status')} trailing={<Badge tone={labels[status][1]}>{labels[status][0]}</Badge>} />
        <Row title={L('تاريخ التسجيل', 'Signed up')} trailing={dateText(shop.created_at)} />
        {!shop.paid_until && <Row title={L('نهاية التجربة', 'Trial ends')} trailing={dateText(shop.trial_ends_at)} />}
        {shop.paid_until && <Row title={paid ? L('مدفوع حتى', 'Paid until') : L('انتهى في', 'Ended on')} trailing={shop.plan === 'lifetime' ? L('مدى الحياة', 'Lifetime') : dateText(shop.paid_until)} />}
        {status === 'grace' && <Row title={L('المهلة حتى', 'Grace until')} trailing={<strong className="red">{dateText(shop.grace_until)}</strong>} />}
        <Row title={L('آخر نشاط', 'Last activity')} trailing={shop.last_activity ? dateText(shop.last_activity) : '—'} />
      </div>
      {shop.duplicate_of && <Alert tone="red">{L(`قد يكون نفس صاحب صالون «${shop.duplicate_of}» بحساب جديد (نفس الهاتف أو الجهاز) — لا تُمنح له تجربة جديدة تلقائياً.`, `May be the same owner as “${shop.duplicate_of}” with a new account (same phone or device) — no new free trial was granted automatically.`)}</Alert>}
      {shop.phone && <Button variant="secondary" icon={MessageCircle} block onClick={() => openExternal(whatsappLink(shop.phone, needsFollowUp(shop) ? reminderText(shop) : L(`مرحباً ${shop.name} 👋 كيف وجدتم تطبيق مِقص؟`, `Hello ${shop.name} 👋 How are you finding the Miqass app?`)))}>{L('تواصل مع الصالون', 'Contact salon')}</Button>}

      <Section title={L('الاشتراك', 'Subscription')}>
        <div className="plan-picker">{plans.map(plan => {
          const active = paid && shop.plan === plan.id;
          return <button type="button" key={plan.id} className={`plan-option ${active ? 'active' : ''}`} onClick={() => choosePlan(plan)}>
            {active ? <Check size={18} /> : plan.id === 'lifetime' ? <Crown size={18} /> : <CalendarClock size={18} />}
            <strong>{plan.name}</strong>
            <small>{active ? (plan.id === 'lifetime' ? L('الحالية', 'Current') : L('الحالية · اضغط للتجديد', 'Current · tap to renew')) : `${plan.price.toLocaleString(LOCALE)} ${L('ر.ق', 'QAR')}`}</small>
          </button>;
        })}</div>
        {status === 'grace' && <Alert tone="orange" icon={Timer}>{L(`الصالون في مهلة السداد حتى ${dateText(shop.grace_until)} ويرى تنبيهاً بذلك. بعدها يتوقف التطبيق تماماً.`, `The salon is in a payment grace period until ${dateText(shop.grace_until)} and sees a warning about it. After that the app stops completely.`)}</Alert>}
        <div className="action-grid">
          {!shop.paid_until && status !== 'suspended' && <Button variant="secondary" icon={CalendarPlus} onClick={() => setConfirm({ title: L(`تمديد التجربة ${num(7)} أيام؟`, `Extend trial by ${num(7)} days?`), text: L('للصالونات التي لم تشترك بعد.', "For salons that haven't subscribed yet."), label: L('تمديد', 'Extend'), run: () => act(() => api.admin.extendTrial(shop.id, 7), L('تم تمديد التجربة', 'Trial extended')) })}>{L(`تمديد التجربة ${num(7)} أيام`, `Extend trial ${num(7)} days`)}</Button>}
          {canGrace && <Button variant="secondary" icon={Timer} onClick={() => setConfirm({
            title: L('لم يجدد بعد — مهلة 3 أيام؟', 'Not renewed yet — 3-day grace period?'),
            text: L(`هل جدد الصالون اشتراكه؟ إذا نعم اختر الخطة أعلاه. وإذا تريد إمهاله: يعمل التطبيق ${num(3)} أيام إضافية مع تنبيه لصاحب الصالون، ثم يتوقف تماماً إن لم يسدد.`, `Has the salon renewed? If so, choose the plan above. To give them more time: the app keeps working for ${num(3)} more days with a warning to the salon owner, then stops completely if unpaid.`),
            label: L(`منح مهلة ${num(3)} أيام`, `Grant ${num(3)}-day grace`), run: () => act(() => api.admin.grantGrace(shop.id), L('تم منح المهلة', 'Grace period granted')),
          })}>{L(`مهلة ${num(3)} أيام`, `${num(3)}-day grace`)}</Button>}
          {status !== 'suspended' && <Button variant="danger-ghost" icon={Ban} onClick={() => setConfirm({ title: L('إيقاف الصالون؟', 'Suspend salon?'), text: L('يتوقف التطبيق فوراً لصاحب الصالون وكل موظفيه. يمكنك إعادة التفعيل باختيار خطة.', 'The app stops immediately for the salon owner and all staff. You can reactivate it by choosing a plan.'), label: L('إيقاف', 'Suspend'), danger: true, run: () => act(() => api.admin.setLicense(shop.id, 'suspended', null), L('تم الإيقاف', 'Suspended')) })}>{L('إيقاف', 'Suspend')}</Button>}
        </div>
      </Section>

      <Overview shopId={shop.id} />
      <Addons shopId={shop.id} onSaved={() => act(async () => {}, L('تم حفظ الإضافات', 'Add-ons saved'))} />
      <Templates shopId={shop.id} />
    </div>
    {confirm && <Confirm title={confirm.title} text={confirm.text} confirmLabel={confirm.label} danger={confirm.danger} onConfirm={confirm.run} onClose={() => setConfirm(null)} />}
  </Sheet>;
}

// كل شيء عن الصالون باستثناء الأموال.
function Overview({ shopId }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.admin.overview(shopId).then(setV).catch(e => setError(errorText(e))); }, [shopId]);
  if (!v) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  const weekdays = isEn
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const closed = (v.hours?.closedDays || []).map(d => weekdays[d]).filter(Boolean);
  return <Section title={L('نظرة عامة على الصالون', 'Salon overview')}>
    <div className="stats">
      <Stat icon={UsersRound} label={L('الموظفون', 'Staff')} value={num(v.staff)} />
      <Stat icon={UsersRound} tone="blue" label={L('العملاء', 'Clients')} value={num(v.clients)} />
      <Stat icon={CalendarClock} tone="green" label={L('مواعيد آخر 30 يوماً', 'Appointments, last 30 days')} value={num(v.appointments_30d)} />
      <Stat icon={CalendarPlus} tone="orange" label={L('مواعيد قادمة', 'Upcoming appointments')} value={num(v.upcoming)} />
    </div>
    <div className="list">
      <Row title={L('ساعات العمل', 'Working hours')} trailing={v.hours ? `${v.hours.open} – ${v.hours.close}` : '—'} />
      <Row title={L('أيام العمل', 'Working days')} subtitle={closed.length ? L(`مغلق: ${closed.join('، ')}`, `Closed: ${closed.join(', ')}`) : L('كل أيام الأسبوع', 'Every day of the week')} />
      <Row title={L('الخدمات', 'Services')} trailing={num(v.services)} />
      <Row title={L('كل المواعيد', 'All appointments')} trailing={num(v.appointments)} />
      <Row title={L('حجوزات أونلاين وواتساب', 'Online & WhatsApp bookings')} trailing={num(v.online)} />
      <Row title={L('المنتجات', 'Products')} trailing={num(v.products)} />
      {v.slug ? <Row title={L('رابط الحجز', 'Booking link')} subtitle={<span dir="ltr" className="link-text">{bookingUrl(v.slug)}</span>}
        trailing={<Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => openExternal(bookingUrl(v.slug))}>{L('فتح', 'Open')}</Button>} />
        : <Row title={L('رابط الحجز', 'Booking link')} trailing={L('غير مفعّل', 'Not enabled')} />}
      <Row title={L('أجهزة الإشعارات', 'Notification devices')} trailing={num(v.devices)} />
    </div>
    <div className="list">{(v.members || []).map((m, i) => <Row key={i} title={m.name} subtitle={roleText[m.role] || m.role} trailing={m.suspended ? <Badge tone="muted">{L('موقوف', 'Suspended')}</Badge> : null} />)}</div>
  </Section>;
}

// حقل سري: مخفي كنقاط، مع زر إظهار ونسخ.
function SecretInput({ value, onChange, placeholder }) {
  const { toast } = useApp();
  const [shown, setShown] = useState(false);
  return <div className="secret-input">
    <input dir="ltr" type={shown ? 'text' : 'password'} autoComplete="off" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value.trim())} />
    <button type="button" className="icon-btn" aria-label={shown ? L('إخفاء', 'Hide') : L('إظهار', 'Show')} onClick={() => setShown(!shown)}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    <button type="button" className="icon-btn" aria-label={L('نسخ', 'Copy')} disabled={!value} onClick={async () => { try { await navigator.clipboard.writeText(value); toast(L('تم النسخ', 'Copied')); } catch { setShown(true); } }}><Copy size={18} /></button>
  </div>;
}

// الإضافات المدفوعة لكل صالون: لا يراها صاحب الصالون ولا يستطيع تعديلها.
function Addons({ shopId, onSaved }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setV(null);
    api.admin.integration(shopId).then(row => setV({
      waAddon: row.wa_addon, aiAddon: row.ai_addon, aiProvider: row.ai_provider || 'anthropic', phoneNumberId: row.wa_phone_number_id,
      token: row.wa_token || '', aiKey: row.ai_key || '', savedAiKey: Boolean(row.has_ai_key), tokenHidden: row.has_token && !row.wa_token, keyHidden: row.has_ai_key && !row.ai_key,
    })).catch(e => setError(errorText(e)));
  }, [shopId]);
  const save = async () => {
    setError('');
    // الحقل الفارغ يعني حذف المفتاح المحفوظ.
    try { await api.admin.setIntegration(shopId, { ...v, clearToken: !v.token && !v.tokenHidden, clearAiKey: !v.aiKey && !v.keyHidden }); onSaved(); } catch (e) { setError(errorText(e)); }
  };
  if (!v) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  return <Section title={L('الإضافات المدفوعة', 'Paid add-ons')}>
    <div className="stack">
      <Toggle checked={v.waAddon} onChange={on => setV({ ...v, waAddon: on, aiAddon: on && v.aiAddon })} label={L('واتساب الذكي', 'Smart WhatsApp')} hint={L('تذكيرات تلقائية + ردود 1/2 + تقرير يومي', 'Automatic reminders + 1/2 replies + daily report')} />
      {v.waAddon && <>
        <Field label={L('Phone Number ID (اختياري)', 'Phone Number ID (optional)')} hint={L('فارغ = يُرسل من رقم المنصة. ضعه فقط إذا ربطت رقم الصالون الخاص.', "Empty = sent from the platform number. Only fill this in if you've connected the salon's own number.")}>
          <input dir="ltr" value={v.phoneNumberId} onChange={e => setV({ ...v, phoneNumberId: e.target.value.trim() })} />
        </Field>
        {v.phoneNumberId && <Field label={L('Access Token لرقم الصالون', "Access Token for the salon's number")}><SecretInput value={v.token} onChange={token => setV({ ...v, token })} /></Field>}
        <Toggle checked={v.aiAddon} onChange={on => setV({ ...v, aiAddon: on })} label={L('المساعد الذكي (AI)', 'AI assistant')} hint={L('يرد ويحجز في واتساب 24/7', 'Replies and books on WhatsApp 24/7')} />
        {v.aiAddon && <>
          <Field label={L('مزوّد الذكاء الاصطناعي', 'AI provider')}>
            <Segmented items={[{ id: 'anthropic', label: 'Claude' }, { id: 'openai', label: 'OpenAI' }]} value={v.aiProvider} onChange={aiProvider => setV({ ...v, aiProvider, aiKey: aiProvider === v.aiProvider ? v.aiKey : '' })} />
          </Field>
          <Field label={v.aiProvider === 'openai' ? L('مفتاح OpenAI الخاص بالصالون', "Salon's OpenAI key") : L('مفتاح Anthropic الخاص بالصالون', "Salon's Anthropic key")} hint={v.aiKey ? L('لحذف المفتاح امسح الحقل ثم احفظ', 'To remove the key, clear the field and save') : L('فارغ = يُستخدم مفتاح المنصة إن وُجد', "Empty = the platform's key is used, if set")}>
            <SecretInput value={v.aiKey} onChange={aiKey => setV({ ...v, aiKey })} placeholder={v.aiProvider === 'openai' ? 'sk-proj-...' : 'sk-ant-...'} />
          </Field>
          {v.savedAiKey ? <Alert tone="green" icon={Check}>{L('المساعد مفعّل — المفتاح مسجّل ✓', 'Assistant active — key saved ✓')}{v.keyHidden ? L(' (شغّل ملف 0006 لعرضه هنا)', ' (run migration 0006 to show it here)') : ''}</Alert> : <Alert tone="orange">{L('لا يوجد مفتاح محفوظ بعد', 'No key saved yet')}</Alert>}
        </>}
      </>}
      <Alert>{error}</Alert>
      <Button icon={Bot} block onClick={save}>{L('حفظ الإضافات', 'Save add-ons')}</Button>
    </div>
  </Section>;
}

// نصوص رسائل الصالون: من أسرار المالك، يعدّلها لكل صالون حسب أسلوبه.
function Templates({ shopId }) {
  const { toast } = useApp();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const defaults = defaultSettings().templates;
  const fields = { reminder: L('تذكير بالموعد', 'Appointment reminder'), recovery: L('استرجاع عميل منقطع', 'Win back a lapsed client'), thanks: L('شكر بعد الزيارة', 'Thank-you after visit'), waitlist: L('عرض من قائمة الانتظار', 'Waitlist offer'), birthday: L('تهنئة عيد ميلاد', 'Birthday greeting') };
  useEffect(() => { api.admin.templates(shopId).then(saved => setT({ ...defaults, ...saved })).catch(e => setError(errorText(e))); }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  return <Section title={L('نصوص الرسائل', 'Message templates')}>
    <div className="stack">
      <small className="muted">{L('المتغيرات:', 'Variables:')} {'{name} {shop} {date} {time} {link}'} — {L('لا تظهر هذه النصوص لصاحب الصالون.', 'These templates are not visible to the salon owner.')}</small>
      {Object.entries(fields).map(([key, label]) => <Field key={key} label={label}><textarea rows="3" value={t[key] || ''} onChange={e => setT({ ...t, [key]: e.target.value })} /></Field>)}
      <Alert>{error}</Alert>
      <Button variant="secondary" icon={MessageSquareText} block onClick={async () => {
        try { await api.admin.setTemplates(shopId, t); toast(L('تم حفظ نصوص الصالون', 'Salon templates saved')); } catch (e) { setError(errorText(e)); }
      }}>{L('حفظ النصوص', 'Save templates')}</Button>
    </div>
  </Section>;
}
