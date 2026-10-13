// لوحة المالك (أنت): متابعة الصالونات، تفعيل الاشتراكات والمهلة، الإضافات المدفوعة ونصوص الرسائل لكل صالون.
import React, { useEffect, useState } from 'react';
import {
  Ban, Bot, CalendarClock, CalendarPlus, Check, Copy, Crown, Eye, EyeOff, MessageCircle, MessageSquareText, RefreshCw, Store, Timer, UsersRound,
} from 'lucide-react';
import { defaultSettings, num, roleText, whatsappLink, LOCALE } from '../data.js';
import { api, errorText } from '../lib/sync.js';
import { plans } from '../lib/license.js';
import { prefs } from '../lib/store.js';
import { notifyNow } from '../lib/native.js';
import { Alert, Badge, Button, Confirm, Empty, Field, Row, SearchBox, Section, Segmented, Sheet, Stat, Toggle, openExternal, useApp } from '../ui.jsx';

const DAY = 86400000;
const time = value => (value ? new Date(value).getTime() : 0);
const dateText = value => new Date(value).toLocaleDateString(LOCALE);
const statusOf = s => {
  if (s.plan === 'suspended') return 'suspended';
  if (time(s.paid_until) > Date.now()) return 'paid';
  if (time(s.grace_until) > Date.now()) return 'grace';
  if (time(s.trial_ends_at) > Date.now()) return 'trial';
  return 'expired';
};
const labels = { paid: ['مشترك', 'green'], grace: ['في المهلة', 'orange'], trial: ['تجربة', 'blue'], expired: ['منتهي', 'red'], suspended: ['موقوف', 'muted'] };
const daysLeft = s => Math.ceil((time({ paid: s.paid_until, grace: s.grace_until, trial: s.trial_ends_at }[statusOf(s)]) - Date.now()) / DAY);
// يحتاج متابعة: ينتهي خلال يومين، أو في المهلة، أو انتهى اشتراكه المدفوع خلال آخر أسبوع.
const needsFollowUp = s => {
  const status = statusOf(s);
  if (status === 'grace') return true;
  if ((status === 'paid' && s.plan !== 'lifetime') || status === 'trial') return daysLeft(s) <= 2;
  return status === 'expired' && s.paid_until && Date.now() - time(s.paid_until) < 7 * DAY;
};
const reminderText = s => statusOf(s) === 'grace'
  ? `مرحباً ${s.name} 👋 انتهى اشتراككم في تطبيق مِقص، ولديكم مهلة حتى ${dateText(s.grace_until)} ثم يتوقف التطبيق. للتجديد يسعدنا خدمتكم.`
  : statusOf(s) === 'trial'
    ? `مرحباً ${s.name} 👋 تنتهي فترة تجربة تطبيق مِقص قريباً. هل نفعّل لكم الاشتراك لتستمروا دون انقطاع؟`
    : `مرحباً ${s.name} 👋 تذكير: ينتهي اشتراككم في تطبيق مِقص بتاريخ ${dateText(s.paid_until)}. للتجديد يسعدنا خدمتكم.`;

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
      notifyNow(`⏰ ${num(due.length)} صالون يحتاج متابعة`, due.slice(0, 3).map(s => s.name).join('، '));
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
      <Stat icon={Store} label="كل الصالونات" value={num(shops.length)} />
      <Stat icon={Crown} tone="green" label="مشتركون" value={num(counts.paid || 0)} onClick={() => setFilter('paid')} />
      <Stat tone="blue" label="في التجربة" value={num(counts.trial || 0)} onClick={() => setFilter('trial')} />
      <Stat tone="red" label="منتهي" value={num((counts.expired || 0) + (counts.grace || 0))} onClick={() => setFilter('expired')} />
    </div>
    {followUp.length > 0 && <Section title={`تحتاج متابعة (${num(followUp.length)})`}>
      <div className="list">{followUp.map(s => <Row key={s.id} leading={<span className="dot-icon tone-orange"><Timer size={18} /></span>} title={s.name}
        subtitle={`${labels[statusOf(s)][0]}${statusOf(s) !== 'expired' ? ` · باقٍ ${num(Math.max(0, daysLeft(s)))} يوم` : ' · لم يجدد'}`}
        trailing={s.phone ? <Button size="sm" variant="secondary" icon={MessageCircle} onClick={event => { event.stopPropagation(); openExternal(whatsappLink(s.phone, reminderText(s))); }}>تذكير</Button> : null}
        onClick={() => setOpen(s.id)} />)}</div>
    </Section>}
    <div className="page-head"><Segmented size="sm" items={[{ id: 'all', label: 'الكل' }, { id: 'trial', label: 'تجربة' }, { id: 'expired', label: 'منتهي' }, { id: 'paid', label: 'مشترك' }]} value={filter} onChange={setFilter} /><Button variant="ghost" icon={RefreshCw} onClick={load} /></div>
    <SearchBox value={query} onChange={setQuery} placeholder="اسم، بريد، رقم" />
    {list.length ? <div className="list">{list.map(s => {
      const [label, tone] = labels[statusOf(s)];
      const left = daysLeft(s);
      const addons = [s.wa_addon && 'واتساب', s.ai_addon && 'AI'].filter(Boolean).join(' + ');
      const plan = statusOf(s) === 'paid' ? plans.find(p => p.id === s.plan)?.name : '';
      return <Row key={s.id} title={s.name} subtitle={[s.owner_email, plan, left > 0 && statusOf(s) !== 'suspended' ? `باقٍ ${num(left)} يوم` : '', `${num(s.members)} حساب`, addons].filter(Boolean).join(' · ')}
        trailing={<Badge tone={tone}>{label}</Badge>} onClick={() => setOpen(s.id)} />;
    })}</div> : <Empty icon={Store} title="لا نتائج" />}

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
    setConfirm({
      title: same ? `تجديد ${plan.name}؟` : paid ? `تغيير الخطة إلى ${plan.name}؟` : `تفعيل اشتراك ${plan.name}؟`,
      text: same
        ? `يُضاف ${plan.id === 'yearly' ? 'سنة' : 'شهر'} بعد ${dateText(shop.paid_until)} — حتى ${dateText(untilFor(plan))}.`
        : paid ? `الخطة الحالية «${currentName}» حتى ${dateText(shop.paid_until)}. الخطة الجديدة تبدأ من اليوم حتى ${plan.id === 'lifetime' ? 'مدى الحياة' : dateText(untilFor(plan))}.`
          : `يُفعَّل الصالون فوراً حتى ${plan.id === 'lifetime' ? 'مدى الحياة' : dateText(untilFor(plan))}.`,
      label: same ? 'تجديد' : 'تأكيد',
      run: () => act(() => api.admin.setLicense(shop.id, plan.id, untilFor(plan)), same ? 'تم التجديد' : 'تم تفعيل الخطة'),
    });
  };
  const canGrace = shop.paid_until && status !== 'suspended' && status !== 'grace' && (status === 'expired' || daysLeft(shop) <= 2) && !(time(shop.grace_until) > time(shop.paid_until));

  return <Sheet title={shop.name} subtitle={shop.owner_email} onClose={onClose} size="lg">
    <div className="stack">
      <div className="list">
        <Row title="الحالة" trailing={<Badge tone={labels[status][1]}>{labels[status][0]}</Badge>} />
        <Row title="تاريخ التسجيل" trailing={dateText(shop.created_at)} />
        {!shop.paid_until && <Row title="نهاية التجربة" trailing={dateText(shop.trial_ends_at)} />}
        {shop.paid_until && <Row title={paid ? 'مدفوع حتى' : 'انتهى في'} trailing={shop.plan === 'lifetime' ? 'مدى الحياة' : dateText(shop.paid_until)} />}
        {status === 'grace' && <Row title="المهلة حتى" trailing={<strong className="red">{dateText(shop.grace_until)}</strong>} />}
        <Row title="آخر نشاط" trailing={shop.last_activity ? dateText(shop.last_activity) : '—'} />
      </div>
      {shop.phone && <Button variant="secondary" icon={MessageCircle} block onClick={() => openExternal(whatsappLink(shop.phone, needsFollowUp(shop) ? reminderText(shop) : `مرحباً ${shop.name} 👋 كيف وجدتم تطبيق مِقص؟`))}>تواصل مع الصالون</Button>}

      <Section title="الاشتراك">
        <div className="plan-picker">{plans.map(plan => {
          const active = paid && shop.plan === plan.id;
          return <button type="button" key={plan.id} className={`plan-option ${active ? 'active' : ''}`} onClick={() => choosePlan(plan)}>
            {active ? <Check size={18} /> : plan.id === 'lifetime' ? <Crown size={18} /> : <CalendarClock size={18} />}
            <strong>{plan.name}</strong>
            <small>{active ? (plan.id === 'lifetime' ? 'الحالية' : 'الحالية · اضغط للتجديد') : `${plan.price.toLocaleString(LOCALE)} ر.ق`}</small>
          </button>;
        })}</div>
        {status === 'grace' && <Alert tone="orange" icon={Timer}>الصالون في مهلة السداد حتى {dateText(shop.grace_until)} ويرى تنبيهاً بذلك. بعدها يتوقف التطبيق تماماً.</Alert>}
        <div className="action-grid">
          {!shop.paid_until && status !== 'suspended' && <Button variant="secondary" icon={CalendarPlus} onClick={() => setConfirm({ title: `تمديد التجربة ${num(7)} أيام؟`, text: 'للصالونات التي لم تشترك بعد.', label: 'تمديد', run: () => act(() => api.admin.extendTrial(shop.id, 7), 'تم تمديد التجربة') })}>تمديد التجربة {num(7)} أيام</Button>}
          {canGrace && <Button variant="secondary" icon={Timer} onClick={() => setConfirm({
            title: 'لم يجدد بعد — مهلة 3 أيام؟',
            text: `هل جدد الصالون اشتراكه؟ إذا نعم اختر الخطة أعلاه. وإذا تريد إمهاله: يعمل التطبيق ${num(3)} أيام إضافية مع تنبيه لصاحب الصالون، ثم يتوقف تماماً إن لم يسدد.`,
            label: `منح مهلة ${num(3)} أيام`, run: () => act(() => api.admin.grantGrace(shop.id), 'تم منح المهلة'),
          })}>مهلة {num(3)} أيام</Button>}
          {status !== 'suspended' && <Button variant="danger-ghost" icon={Ban} onClick={() => setConfirm({ title: 'إيقاف الصالون؟', text: 'يتوقف التطبيق فوراً لصاحب الصالون وكل موظفيه. يمكنك إعادة التفعيل باختيار خطة.', label: 'إيقاف', danger: true, run: () => act(() => api.admin.setLicense(shop.id, 'suspended', null), 'تم الإيقاف') })}>إيقاف</Button>}
        </div>
      </Section>

      <Overview shopId={shop.id} />
      <Addons shopId={shop.id} onSaved={() => act(async () => {}, 'تم حفظ الإضافات')} />
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
  const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const closed = (v.hours?.closedDays || []).map(d => weekdays[d]).filter(Boolean);
  return <Section title="نظرة عامة على الصالون">
    <div className="stats">
      <Stat icon={UsersRound} label="الموظفون" value={num(v.staff)} />
      <Stat label="العملاء" value={num(v.clients)} />
      <Stat label="مواعيد آخر 30 يوماً" value={num(v.appointments_30d)} />
      <Stat label="مواعيد قادمة" value={num(v.upcoming)} />
    </div>
    <div className="list">
      <Row title="ساعات العمل" trailing={v.hours ? `${v.hours.open} – ${v.hours.close}` : '—'} />
      <Row title="أيام العمل" subtitle={closed.length ? `مغلق: ${closed.join('، ')}` : 'كل أيام الأسبوع'} />
      <Row title="الخدمات" trailing={num(v.services)} />
      <Row title="كل المواعيد" trailing={num(v.appointments)} />
      <Row title="حجوزات أونلاين وواتساب" trailing={num(v.online)} />
      <Row title="المنتجات" trailing={num(v.products)} />
      <Row title="رابط الحجز" trailing={v.slug ? <span dir="ltr">{v.slug}</span> : 'غير مفعّل'} />
      <Row title="أجهزة الإشعارات" trailing={num(v.devices)} />
    </div>
    <div className="list">{(v.members || []).map((m, i) => <Row key={i} title={m.name} subtitle={roleText[m.role] || m.role} trailing={m.suspended ? <Badge tone="muted">موقوف</Badge> : null} />)}</div>
  </Section>;
}

// حقل سري: مخفي كنقاط، مع زر إظهار ونسخ.
function SecretInput({ value, onChange, placeholder }) {
  const { toast } = useApp();
  const [shown, setShown] = useState(false);
  return <div className="secret-input">
    <input dir="ltr" type={shown ? 'text' : 'password'} autoComplete="off" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value.trim())} />
    <button type="button" className="icon-btn" aria-label={shown ? 'إخفاء' : 'إظهار'} onClick={() => setShown(!shown)}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    <button type="button" className="icon-btn" aria-label="نسخ" disabled={!value} onClick={async () => { try { await navigator.clipboard.writeText(value); toast('تم النسخ'); } catch { setShown(true); } }}><Copy size={18} /></button>
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
      token: row.wa_token || '', aiKey: row.ai_key || '', savedAiKey: Boolean(row.ai_key),
    })).catch(e => setError(errorText(e)));
  }, [shopId]);
  const save = async () => {
    setError('');
    // الحقل الفارغ يعني حذف المفتاح المحفوظ.
    try { await api.admin.setIntegration(shopId, { ...v, clearToken: !v.token, clearAiKey: !v.aiKey }); onSaved(); } catch (e) { setError(errorText(e)); }
  };
  if (!v) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  return <Section title="الإضافات المدفوعة">
    <div className="stack">
      <Toggle checked={v.waAddon} onChange={on => setV({ ...v, waAddon: on, aiAddon: on && v.aiAddon })} label="واتساب الذكي" hint="تذكيرات تلقائية + ردود 1/2 + تقرير يومي" />
      {v.waAddon && <>
        <Field label="Phone Number ID (اختياري)" hint="فارغ = يُرسل من رقم المنصة. ضعه فقط إذا ربطت رقم الصالون الخاص.">
          <input dir="ltr" value={v.phoneNumberId} onChange={e => setV({ ...v, phoneNumberId: e.target.value.trim() })} />
        </Field>
        {v.phoneNumberId && <Field label="Access Token لرقم الصالون"><SecretInput value={v.token} onChange={token => setV({ ...v, token })} /></Field>}
        <Toggle checked={v.aiAddon} onChange={on => setV({ ...v, aiAddon: on })} label="المساعد الذكي (AI)" hint="يرد ويحجز في واتساب 24/7" />
        {v.aiAddon && <>
          <Field label="مزوّد الذكاء الاصطناعي">
            <Segmented items={[{ id: 'anthropic', label: 'Claude' }, { id: 'openai', label: 'OpenAI' }]} value={v.aiProvider} onChange={aiProvider => setV({ ...v, aiProvider, aiKey: aiProvider === v.aiProvider ? v.aiKey : '' })} />
          </Field>
          <Field label={v.aiProvider === 'openai' ? 'مفتاح OpenAI الخاص بالصالون' : 'مفتاح Anthropic الخاص بالصالون'} hint={v.aiKey ? 'لحذف المفتاح امسح الحقل ثم احفظ' : 'فارغ = يُستخدم مفتاح المنصة إن وُجد'}>
            <SecretInput value={v.aiKey} onChange={aiKey => setV({ ...v, aiKey })} placeholder={v.aiProvider === 'openai' ? 'sk-proj-...' : 'sk-ant-...'} />
          </Field>
          {v.savedAiKey && v.aiKey && <Alert tone="green" icon={Check}>المساعد مفعّل — المفتاح مسجّل ✓</Alert>}
        </>}
      </>}
      <Alert>{error}</Alert>
      <Button icon={Bot} block onClick={save}>حفظ الإضافات</Button>
    </div>
  </Section>;
}

// نصوص رسائل الصالون: من أسرار المالك، يعدّلها لكل صالون حسب أسلوبه.
function Templates({ shopId }) {
  const { toast } = useApp();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const defaults = defaultSettings().templates;
  const fields = { reminder: 'تذكير بالموعد', recovery: 'استرجاع عميل منقطع', thanks: 'شكر بعد الزيارة', waitlist: 'عرض من قائمة الانتظار', birthday: 'تهنئة عيد ميلاد' };
  useEffect(() => { api.admin.templates(shopId).then(saved => setT({ ...defaults, ...saved })).catch(e => setError(errorText(e))); }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  return <Section title="نصوص الرسائل">
    <div className="stack">
      <small className="muted">المتغيرات: {'{name} {shop} {date} {time} {link}'} — لا تظهر هذه النصوص لصاحب الصالون.</small>
      {Object.entries(fields).map(([key, label]) => <Field key={key} label={label}><textarea rows="3" value={t[key] || ''} onChange={e => setT({ ...t, [key]: e.target.value })} /></Field>)}
      <Alert>{error}</Alert>
      <Button variant="secondary" icon={MessageSquareText} block onClick={async () => {
        try { await api.admin.setTemplates(shopId, t); toast('تم حفظ نصوص الصالون'); } catch (e) { setError(errorText(e)); }
      }}>حفظ النصوص</Button>
    </div>
  </Section>;
}
