import React, { useEffect, useState } from 'react';
import {
  Bell, Bot, Check, Clock3, Copy, CreditCard, DatabaseBackup, Download, Gift, History, Link2, LogOut, MessageSquareText, Package,
  Plus, QrCode, Scissors, ShieldCheck, SlidersHorizontal, Store, Trash2, Upload,
} from 'lucide-react';
import { dateLabel, digitStyle, setDigitStyle, localISO, money, normalizeData, num, roleText, statusText, timeLabel, uid, LOCALE } from '../data.js';
import { api, auth, bookingUrl, cloudEnabled, errorText } from '../lib/sync.js';
import { addonLink, addons, buyLink, plans } from '../lib/license.js';
import { Alert, Badge, Button, Chips, Confirm, Empty, Field, Row, Section, Segmented, Sheet, Toggle, download, openExternal, useApp, NumInput } from '../ui.jsx';
import { exportAll } from './Lock.jsx';
import { notifyNow, pushState, pushSupported } from '../lib/native.js';

const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function Settings() {
  const { intent, setIntent, shop, shops, switchShop, addBranch, role, theme, refresh, enablePush, toast, isManager } = useApp();
  const [push, setPush] = useState(pushState);
  const [open, setOpen] = useState(null);
  useEffect(() => { if (intent?.open) setOpen(intent.open); if (intent) setIntent(null); }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = role === 'owner';
  // الموظف والاستقبال يرون إعداداتهم الشخصية فقط (الإشعارات، المظهر، الحساب).
  const groups = !isManager ? [] : [
    { title: 'الصالون', items: [
      { id: 'shop', icon: Store, label: 'بيانات الصالون' },
      { id: 'services', icon: Scissors, label: 'الخدمات والأسعار' },
      { id: 'hours', icon: Clock3, label: 'ساعات العمل' },
      { id: 'packages', icon: Package, label: 'الباقات' },
      { id: 'gifts', icon: Gift, label: 'بطاقات الهدايا' },
    ] },
    { title: 'العملاء والرسائل', items: [
      cloudEnabled && { id: 'booking', icon: Link2, label: 'رابط الحجز الأونلاين' },
      cloudEnabled && owner && { id: 'whatsapp', icon: Bot, label: 'واتساب الذكي' },
      { id: 'smart', icon: SlidersHorizontal, label: 'القواعد الذكية' },
    ] },
    { title: 'الحساب', items: [
      owner && { id: 'plan', icon: CreditCard, label: 'الاشتراك' },
      cloudEnabled && { id: 'audit', icon: History, label: 'سجل التعديلات', subtitle: 'كل عمليات الموظفين بالتفصيل' },
      { id: 'backup', icon: DatabaseBackup, label: 'النسخ الاحتياطي' },
    ] },
  ];
  const Sheets = { shop: ShopSettings, services: ServicesSettings, hours: HoursSettings, packages: PackagesSettings, gifts: GiftCards, booking: BookingSettings, smart: SmartSettings, whatsapp: WhatsAppSettings, audit: AuditLog, backup: Backup, plan: Plan };
  const Current = open && Sheets[open];
  const setDigits = value => { if (value === digitStyle) return; setDigitStyle(value); refresh(); };
  return <div className="stack-lg">
    {groups.map(group => <Section key={group.title} title={group.title}>
      <div className="list">{group.items.filter(Boolean).map(item => <Row key={item.id} leading={<span className="dot-icon tone-accent"><item.icon size={18} /></span>} title={item.label} subtitle={item.subtitle} onClick={() => setOpen(item.id)} />)}</div>
    </Section>)}
    {pushSupported && <Section title="الإشعارات">
      <div className="list">
        <Row leading={<span className={`dot-icon tone-${push.status === 'registered' ? 'green' : 'orange'}`}><Bell size={18} /></span>}
          title="إشعار الحجوزات الجديدة"
          subtitle={{ registered: 'مفعّلة على هذا الهاتف ✓', registering: 'جارٍ التسجيل...', denied: 'مرفوضة — فعّلها من إعدادات الهاتف ← التطبيقات ← مِقص ← الإشعارات', 'not-granted': 'لم يُمنح الإذن بعد', error: `خطأ: ${push.error}`, unknown: 'غير مفعّلة' }[push.status] || push.status}
          trailing={<Button size="sm" variant={push.status === 'registered' ? 'ghost' : 'primary'} onClick={async () => { setPush({ status: 'registering' }); const r = await enablePush(); setTimeout(() => setPush({ ...pushState }), 1500); setPush({ ...r }); }}>{push.status === 'registered' ? 'إعادة' : 'تفعيل'}</Button>} />
        <Row title="إرسال إشعار تجريبي" subtitle="للتأكد أن الهاتف يعرض الإشعارات" onClick={() => { notifyNow('📅 إشعار تجريبي', 'هكذا سيظهر الحجز الجديد'); toast('أُرسل — انظر شريط الإشعارات'); }} />
      </div>
    </Section>}
    <Section title="المظهر">
      <div className="list">
        <Row title="الألوان" trailing={<Segmented size="sm" items={[{ id: 'light', label: 'فاتح' }, { id: 'dark', label: 'داكن' }, { id: 'system', label: 'تلقائي' }]} value={theme.mode} onChange={theme.setMode} />} />
        <Row title="شكل الأرقام" trailing={<Segmented size="sm" items={[{ id: 'latn', label: '123' }, { id: 'arab', label: '١٢٣' }]} value={digitStyle} onChange={setDigits} />} />
      </div>
    </Section>
    {cloudEnabled && <Section title="الفروع">
      <div className="list">
        {shops.map(s => <Row key={s.id} leading={<span className="dot-icon tone-blue"><Store size={18} /></span>} title={s.name} subtitle={`${roleText[s.role]}${s.active ? '' : ' · يحتاج تفعيل'}`} trailing={s.id === shop.id ? <Badge tone="green">الحالي</Badge> : <Button size="sm" variant="secondary" onClick={() => switchShop(s.id)}>فتح</Button>} />)}
        {owner && <Row leading={<span className="dot-icon tone-green"><Plus size={18} /></span>} title="إضافة فرع جديد" subtitle="كل فرع بمواعيده وفريقه واشتراكه" onClick={addBranch} />}
      </div>
    </Section>}
    {cloudEnabled && <Button variant="danger-ghost" icon={LogOut} block onClick={() => auth.signOut()}>تسجيل الخروج</Button>}
    {Current && <Current onClose={() => setOpen(null)} />}
  </div>;
}

function ShopSettings({ onClose }) {
  const { data, setData, shop, reloadShops, toast } = useApp();
  const [name, setName] = useState(data.shopName);
  const [kind, setKind] = useState(data.settings.kind);
  const [phone, setPhone] = useState(shop.phone || data.settings.phone || '');
  const [error, setError] = useState('');
  const save = async () => {
    setData(prev => ({ ...prev, shopName: name.trim(), settings: { ...prev.settings, kind, phone } }));
    if (cloudEnabled) {
      try { await api.updateShop(shop.id, { name: name.trim(), kind, phone, slug: shop.slug }); await reloadShops(); } catch (e) { setError(errorText(e)); return; }
    }
    toast('تم الحفظ'); onClose();
  };
  return <Sheet title="بيانات الصالون" onClose={onClose} footer={<Button block icon={Check} onClick={save}>حفظ</Button>}>
    <div className="stack">
      <Field label="اسم الصالون"><input value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="نوع الصالون" hint="يغيّر المصطلحات (زبون/عميلة) والميزات المعروضة"><Chips items={[{ id: 'men', label: 'رجالي' }, { id: 'women', label: 'نسائي' }, { id: 'mixed', label: 'مختلط' }]} value={kind} onChange={setKind} /></Field>
      <Field label="رقم واتساب الصالون"><input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
      <Alert>{error}</Alert>
    </div>
  </Sheet>;
}

function ServicesSettings({ onClose }) {
  const { data } = useApp();
  const [edit, setEdit] = useState(null);
  const categories = [...new Set(data.services.map(s => s.category || 'عام'))];
  return <Sheet title="الخدمات والأسعار" onClose={onClose} size="lg" footer={<Button block icon={Plus} onClick={() => setEdit({})}>خدمة جديدة</Button>}>
    {categories.map(cat => <Section key={cat} title={cat}><div className="list">{data.services.filter(s => (s.category || 'عام') === cat).map(s => <Row key={s.id} title={s.name}
      subtitle={`${num(s.duration)} دقيقة${s.processing ? ` · ${num(s.processing)} انتظار` : ''}${s.deposit ? ` · عربون ${money(s.deposit)}` : ''}${s.online === false ? ' · غير متاحة أونلاين' : ''}`}
      trailing={<strong>{money(s.price)}</strong>} onClick={() => setEdit(s)} />)}</div></Section>)}
    {edit && <ServiceForm service={edit.id ? edit : null} onClose={() => setEdit(null)} />}
  </Sheet>;
}

function ServiceForm({ service, onClose }) {
  const { upsert, remove, toast } = useApp();
  const [v, setV] = useState({ name: '', category: 'عام', price: 0, duration: 30, processing: 0, deposit: 0, online: true, ...service });
  const [confirm, setConfirm] = useState(false);
  const set = (key, numeric) => e => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value });
  return <Sheet title={service ? 'تعديل الخدمة' : 'خدمة جديدة'} onClose={onClose} footer={<>
    {service && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>حذف</Button>}<div className="spacer" />
    <Button icon={Check} disabled={!v.name.trim() || v.duration < 5} onClick={() => { upsert('services', { ...v, id: service?.id || uid(), name: v.name.trim() }); toast('تم الحفظ'); onClose(); }}>حفظ</Button>
  </>}>
    <div className="stack">
      <Field label="اسم الخدمة" required><input autoFocus value={v.name} onChange={set('name')} /></Field>
      <div className="grid-2">
        <Field label="الفئة"><input value={v.category} onChange={set('category')} /></Field>
        <Field label="السعر (ر.ق)"><NumInput min="0" value={v.price} onChange={set('price', true)} /></Field>
        <Field label="المدة (دقيقة)"><NumInput min="5" step="5" value={v.duration} onChange={set('duration', true)} /></Field>
        <Field label="وقت انتظار" hint="مثل تثبيت الصبغة — الموظف متاح لغيره"><NumInput min="0" step="5" value={v.processing} onChange={set('processing', true)} /></Field>
      </div>
      <Field label="عربون مطلوب (ر.ق)" hint="للخدمات الطويلة والعرائس — 0 بدون عربون"><NumInput min="0" value={v.deposit} onChange={set('deposit', true)} /></Field>
      <Toggle checked={v.online !== false} onChange={on => setV({ ...v, online: on })} label="متاحة في الحجز الأونلاين" />
    </div>
    {confirm && <Confirm title="حذف الخدمة؟" text="المواعيد السابقة لن تتأثر." danger confirmLabel="حذف" onClose={() => setConfirm(false)} onConfirm={() => { remove('services', service.id); toast('تم الحذف'); onClose(); }} />}
  </Sheet>;
}

function HoursSettings({ onClose }) {
  const { data, setData, toast } = useApp();
  const [hours, setHours] = useState(data.settings.hours);
  const [step, setStep] = useState(data.settings.slotStep);
  return <Sheet title="ساعات العمل" onClose={onClose} footer={<Button block icon={Check} onClick={() => { setData(prev => ({ ...prev, settings: { ...prev.settings, hours, slotStep: Number(step) } })); toast('تم الحفظ'); onClose(); }}>حفظ</Button>}>
    <div className="stack">
      <div className="grid-2">
        <Field label="يفتح"><input type="time" value={hours.open} onChange={e => setHours({ ...hours, open: e.target.value })} /></Field>
        <Field label="يغلق"><input type="time" value={hours.close} onChange={e => setHours({ ...hours, close: e.target.value })} /></Field>
      </div>
      <Field label="أيام الإغلاق"><Chips multiple items={weekdays.map((d, i) => ({ id: i, label: d }))} value={hours.closedDays || []} onChange={closedDays => setHours({ ...hours, closedDays })} /></Field>
      <Field label="الفاصل بين المواعيد"><Chips items={[10, 15, 30].map(n => ({ id: n, label: `${n} دقيقة` }))} value={Number(step)} onChange={setStep} /></Field>
    </div>
  </Sheet>;
}

function PackagesSettings({ onClose }) {
  const { data, upsert, remove, toast } = useApp();
  const [edit, setEdit] = useState(null);
  const v = edit || {};
  return <Sheet title="الباقات" subtitle="جلسات مدفوعة مسبقاً — تزيد ولاء العملاء والسيولة" onClose={onClose} footer={!edit && <Button block icon={Plus} onClick={() => setEdit({ name: '', serviceId: data.services[0]?.id, sessions: 5, price: 0, validityDays: 90 })}>باقة جديدة</Button>}>
    {edit ? <div className="stack">
      <Field label="اسم الباقة"><input autoFocus value={v.name} onChange={e => setEdit({ ...v, name: e.target.value })} placeholder={`مثال: ليزر ${num(6)} جلسات`} /></Field>
      <Field label="الخدمة"><select value={v.serviceId} onChange={e => setEdit({ ...v, serviceId: e.target.value })}>{data.services.map(s => <option key={s.id} value={s.id}>{s.name} — {money(s.price)}</option>)}</select></Field>
      <div className="grid-2">
        <Field label="عدد الجلسات"><NumInput min="1" value={v.sessions} onChange={e => setEdit({ ...v, sessions: Number(e.target.value) })} /></Field>
        <Field label="سعر الباقة"><NumInput min="0" value={v.price} onChange={e => setEdit({ ...v, price: Number(e.target.value) })} /></Field>
      </div>
      <Field label="صالحة لمدة (يوم)"><NumInput min="0" value={v.validityDays} onChange={e => setEdit({ ...v, validityDays: Number(e.target.value) })} /></Field>
      {v.serviceId && <small className="muted">السعر المعتاد {money((data.services.find(s => s.id === v.serviceId)?.price || 0) * v.sessions)} — توفير للعميل {money(Math.max(0, (data.services.find(s => s.id === v.serviceId)?.price || 0) * v.sessions - v.price))}</small>}
      <div className="row-buttons">
        {v.id && <Button variant="danger-ghost" icon={Trash2} onClick={() => { remove('packages', v.id); setEdit(null); }}>حذف</Button>}
        <div className="spacer" /><Button variant="ghost" onClick={() => setEdit(null)}>رجوع</Button>
        <Button icon={Check} disabled={!v.name?.trim()} onClick={() => { upsert('packages', { ...v, id: v.id || uid() }); toast('تم الحفظ'); setEdit(null); }}>حفظ</Button>
      </div>
    </div> : data.packages.length ? <div className="list">{data.packages.map(p => <Row key={p.id} title={p.name} subtitle={`${num(p.sessions)} جلسات · ${num(p.validityDays)} يوم`} trailing={<strong>{money(p.price)}</strong>} onClick={() => setEdit(p)} />)}</div>
      : <Empty icon={Package} title="لا باقات بعد" text={`مثال: ${num(5)} قصات بسعر ${num(4)} — يدفع العميل مقدماً ويعود باستمرار`} />}
  </Sheet>;
}

function GiftCards({ onClose }) {
  const { data } = useApp();
  return <Sheet title="بطاقات الهدايا" subtitle="تُصدر من شاشة الدفع ← بطاقة هدية" onClose={onClose}>
    {data.giftCards.length ? <div className="list">{data.giftCards.slice().reverse().map(g => <Row key={g.id} leading={<Gift size={18} />} title={<span dir="ltr">{g.code}</span>} subtitle={`${g.recipientName || g.buyerName || ''} · ${dateLabel(g.createdAt, { day: 'numeric', month: 'short' })}`} trailing={<span className="row-end"><strong>{money(g.balance)}</strong><small>من {money(g.amount)}</small></span>} />)}</div>
      : <Empty icon={Gift} title="لم تُصدر بطاقات بعد" text="بطاقات الهدايا تجلب عملاء جدداً ودخلاً مقدماً" />}
  </Sheet>;
}

function BookingSettings({ onClose }) {
  const { shop, data, reloadShops, toast, setData } = useApp();
  const suggested = (shop.slug || data.shopName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `salon-${Math.random().toString(36).slice(2, 6)}`;
  const [slug, setSlug] = useState(shop.slug || suggested);
  const [error, setError] = useState('');
  const link = bookingUrl(shop.slug);
  if (!cloudEnabled) return <Sheet title="رابط الحجز" onClose={onClose}><Empty icon={Link2} title="يحتاج الحساب السحابي" text="الحجز الأونلاين يعمل بعد ربط التطبيق بقاعدة البيانات" /></Sheet>;
  const save = async () => {
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) { setError('حروف إنجليزية صغيرة وأرقام وشرطة فقط (3 أحرف على الأقل)'); return; }
    try { await api.updateShop(shop.id, { name: data.shopName, kind: data.settings.kind, phone: shop.phone, slug }); await reloadShops(); setData(prev => ({ ...prev, settings: { ...prev.settings, bookingEnabled: true } })); toast('تم تفعيل رابط الحجز'); setError(''); }
    catch (e) { setError(errorText(e)); }
  };
  return <Sheet title="رابط الحجز الأونلاين" subtitle="ضعه في انستغرام وخرائط جوجل وواتساب" onClose={onClose}>
    <div className="stack">
      {link && <div className="invite-code"><QrCode size={22} /><strong dir="ltr" className="small">{link}</strong>
        <div className="row-buttons"><Button variant="secondary" icon={Copy} onClick={() => { navigator.clipboard?.writeText(link); toast('تم النسخ'); }}>نسخ</Button><Button icon={Link2} onClick={() => openExternal(link)}>معاينة</Button></div>
      </div>}
      <Field label="اسم الرابط" hint="بالإنجليزية — مثال: miqass-doha"><input dir="ltr" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} /></Field>
      <Alert>{error}</Alert>
      <Button block icon={Check} onClick={save}>{shop.slug ? 'تحديث الرابط' : 'تفعيل الحجز الأونلاين'}</Button>
      <small className="muted">الحجوزات الأونلاين تصل «بانتظار التأكيد» وتظهر فوراً على كل الأجهزة. حماية تلقائية: {num(3)} حجوزات كحد أقصى للرقم يومياً.</small>
    </div>
  </Sheet>;
}

function SmartSettings({ onClose }) {
  const { data, setData, toast } = useApp();
  const [s, setS] = useState(data.settings);
  return <Sheet title="القواعد الذكية" onClose={onClose} footer={<Button block icon={Check} onClick={() => { setData(prev => ({ ...prev, settings: s })); toast('تم الحفظ'); onClose(); }}>حفظ</Button>}>
    <div className="stack">
      <Field label="عربون العملاء كثيري الغياب (٪ من الفاتورة)" hint="يُقترح تلقائياً عند الحجز لمن تغيّب مرتين أو أكثر"><NumInput min="0" max="100" value={s.noShowDepositPercent} onChange={e => setS({ ...s, noShowDepositPercent: Number(e.target.value) })} /></Field>
      <Field label="اعتبر العميل منقطعاً بعد (يوم)" hint="يُستخدم عندما لا يكون له نمط زيارات واضح"><NumInput min="7" value={s.recoveryDays} onChange={e => setS({ ...s, recoveryDays: Number(e.target.value) })} /></Field>
      <Field label="نقطة ولاء لكل (ر.ق)"><NumInput min="1" value={s.loyaltyPer} onChange={e => setS({ ...s, loyaltyPer: Number(e.target.value) })} /></Field>
      <Field label="إرسال التذكير قبل الموعد بـ (ساعة)" hint="للإرسال التلقائي عبر واتساب للأعمال"><Chips items={[2, 12, 24].map(h => ({ id: h, label: `${h} ساعة` }))} value={Number(s.reminderHours)} onChange={h => setS({ ...s, reminderHours: h })} /></Field>
      <Toggle checked={s.hideClientPhotosFromStaff} onChange={on => setS({ ...s, hideClientPhotosFromStaff: on })} label="إخفاء صور العملاء عن الموظفين" hint="خصوصية مهمة للصالونات النسائية" />
    </div>
  </Sheet>;
}

// صاحب الصالون يرى التفضيلات فقط؛ الربط والمفاتيح يضعها مدير المنصة بعد الاشتراك في الإضافة.
// كل إضافة اشتراك منفصل فوق الباقة، ونعرض سعرها بوضوح قبل الطلب.
function AddonOffer({ id, shopName }) {
  const addon = addons.find(a => a.id === id);
  const required = addon.requires && addons.find(a => a.id === addon.requires);
  return <div className="addon-offer">
    <div className="addon-head"><strong>{addon.name}</strong><Badge tone="blue">اشتراك إضافي</Badge></div>
    <div className="addon-price">+{addon.monthly.toLocaleString(LOCALE)} <small>ر.ق / شهر</small> <span className="muted small">أو {addon.yearly.toLocaleString(LOCALE)} ر.ق / سنة</span></div>
    <ul>{addon.points.map(p => <li key={p}><Check size={14} /> {p}</li>)}</ul>
    <small className="muted">يُضاف إلى اشتراكك في التطبيق ولا يشمله{required ? ` · يتطلب «${required.name}»` : ''}.</small>
    <Button variant="secondary" icon={MessageSquareText} block onClick={() => openExternal(addonLink(shopName, addon))}>اطلب التفعيل</Button>
  </div>;
}

function WhatsAppSettings({ onClose }) {
  const { shop, data, toast } = useApp();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.integration(shop.id).then(row => setV({
      waAddon: Boolean(row?.wa_addon), aiAddon: Boolean(row?.ai_addon), ownerWhatsapp: row?.owner_whatsapp || shop.phone || '',
      reminders: row?.reminders_enabled ?? true, assistant: row?.assistant_enabled ?? false, daily: row?.daily_report_enabled ?? true,
    })).catch(e => setError(errorText(e)));
  }, [shop.id, shop.phone]);
  const save = async () => {
    try { await api.saveIntegration(shop.id, v); toast('تم الحفظ'); onClose(); } catch (e) { setError(errorText(e)); }
  };
  const shopName = data.shopName || shop.name;
  return <Sheet title="واتساب الذكي" subtitle="أتمتة كاملة عبر WhatsApp Business" onClose={onClose} footer={v?.waAddon && <Button block icon={Check} onClick={save}>حفظ</Button>}>
    <Alert>{error}</Alert>
    {!v ? !error && <div className="loader" /> : !v.waAddon ? <div className="stack">
      <p className="muted small">إضافات اختيارية باشتراك منفصل عن باقة التطبيق — نفعّلها لك خلال دقائق بعد الدفع.</p>
      <AddonOffer id="wa" shopName={shopName} />
      <AddonOffer id="ai" shopName={shopName} />
    </div> : <div className="stack">
      <Alert tone="green" icon={Check}>اشتراك إضافي مفعّل لصالونك ✓ — يمكنك تشغيل أو إيقاف كل ميزة حسب حاجتك.</Alert>
      <Toggle checked={v.reminders} onChange={on => setV({ ...v, reminders: on })} label="تذكير تلقائي قبل كل موعد" hint="العميل يرد 1 للتأكيد أو 2 للإلغاء — ويتحدث الجدول تلقائياً" />
      <Toggle checked={v.daily} onChange={on => setV({ ...v, daily: on })} label="تقرير يومي لصاحب المحل" hint="الدخل، المواعيد، الغياب، الأفضل أداءً — كل ليلة" />
      {v.daily && <Field label="رقم واتساب لاستلام التقرير"><input type="tel" dir="ltr" value={v.ownerWhatsapp} onChange={e => setV({ ...v, ownerWhatsapp: e.target.value })} placeholder="974XXXXXXXX" /></Field>}
      {v.aiAddon
        ? <Toggle checked={v.assistant} onChange={on => setV({ ...v, assistant: on })} label="المساعد الذكي (AI)" hint="يرد على العملاء ويحجز ويجيب عن الأسعار بالعربي 24/7" />
        : <AddonOffer id="ai" shopName={shopName} />}
    </div>}
  </Sheet>;
}

// سجل مفصّل: من قام بالعملية، وما الذي تغيّر بالضبط (القيمة القديمة ← الجديدة).
const AUDIT_NAMES = { appointments: 'موعد', clients: 'عميل', services: 'خدمة', products: 'منتج', staff: 'موظف', drawers: 'إغلاق صندوق', expenses: 'مصروف', sales: 'بيع', giftCards: 'بطاقة هدية', clientPackages: 'باقة عميل', packages: 'باقة', waitlist: 'قائمة انتظار', notes: 'ملاحظة', meta: 'إعدادات الصالون' };
const AUDIT_ACTIONS = { create: 'إضافة', update: 'تعديل', delete: 'حذف' };
const FIELD_LABELS = { name: 'الاسم', phone: 'الهاتف', price: 'السعر', duration: 'المدة', amount: 'المبلغ', quantity: 'الكمية', cost: 'التكلفة', commission: 'العمولة', category: 'الفئة', notes: 'ملاحظات', deposit: 'العربون', discount: 'الخصم', balance: 'الرصيد', minStock: 'حد التنبيه', label: 'البيان', counted: 'المعدود', difference: 'الفرق', keep: 'المتبقي للغد' };
const MONEY_FIELDS = new Set(['price', 'amount', 'cost', 'deposit', 'discount', 'balance', 'counted', 'difference', 'keep']);
const paid = a => (a?.payments || []).filter(p => p.kind !== 'tip').reduce((sum, p) => sum + Number(p.amount || 0), 0);
const show = (key, value) => (value === undefined || value === null || value === '' ? '—' : MONEY_FIELDS.has(key) ? money(value) : typeof value === 'number' ? num(value) : String(value));

function auditDetails(row, data) {
  const before = row.before || {}; const after = row.after || {};
  const item = row.action === 'delete' ? before : after;
  const lines = [];
  const staffName = id => data.staff.find(m => m.id === id)?.name || 'أي موظف';
  if (row.collection === 'appointments') {
    const client = data.clients.find(c => c.id === item.clientId)?.name || 'عميل';
    const title = `${client} — ${item.date ? dateLabel(item.date) : ''} ${item.time ? timeLabel(item.time) : ''}`.trim();
    if (row.action === 'update') {
      if (before.status !== after.status) lines.push(`الحالة: ${statusText[before.status] || before.status || '—'} ← ${statusText[after.status] || after.status}`);
      if (before.date !== after.date || before.time !== after.time) lines.push(`الموعد: ${dateLabel(before.date)} ${timeLabel(before.time)} ← ${dateLabel(after.date)} ${timeLabel(after.time)}`);
      if (paid(before) !== paid(after)) lines.push(paid(after) > paid(before) ? `استلام دفعة ${money(paid(after) - paid(before))}` : `⚠️ إلغاء دفعة ${money(paid(before) - paid(after))}`);
      if (Number(before.price || 0) !== Number(after.price || 0)) lines.push(`المبلغ: ${money(before.price)} ← ${money(after.price)}`);
      if (Number(before.discount || 0) !== Number(after.discount || 0)) lines.push(`الخصم: ${money(before.discount)} ← ${money(after.discount)}`);
      if (before.staffId !== after.staffId) lines.push(`الموظف: ${staffName(before.staffId)} ← ${staffName(after.staffId)}`);
      const names = a => (a.items || []).map(i => i.name).join(' + ');
      if (names(before) !== names(after)) lines.push(`الخدمات: ${names(before) || '—'} ← ${names(after) || '—'}`);
    } else lines.push(`${(item.items || []).map(i => i.name).join(' + ')}${item.price ? ` · ${money(item.price)}` : ''}`);
    return { title, lines };
  }
  if (row.collection === 'meta') return { title: 'إعدادات الصالون', lines: [] };
  const title = item.name || item.label || (item.clientId && data.clients.find(c => c.id === item.clientId)?.name) || (item.date ? dateLabel(item.date) : '');
  if (row.action === 'update') {
    for (const key of Object.keys(FIELD_LABELS)) {
      if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) lines.push(`${FIELD_LABELS[key]}: ${show(key, before[key])} ← ${show(key, after[key])}`);
    }
  } else if (item.amount !== undefined) lines.push(money(item.amount));
  else if (item.price !== undefined) lines.push(money(item.price));
  return { title, lines };
}

function AuditLog({ onClose }) {
  const { shop, data } = useApp();
  const [rows, setRows] = useState(null);
  const [people, setPeople] = useState({});
  const [who, setWho] = useState('all');
  const [error, setError] = useState('');
  useEffect(() => {
    api.audit(shop.id, 300).then(setRows).catch(e => setError(errorText(e)));
    api.people(shop.id).then(list => setPeople(Object.fromEntries(list.map(p => [p.user_id, p])))).catch(() => {});
  }, [shop.id]);
  const actor = r => (r.user_id ? people[r.user_id]?.display_name || 'مستخدم' : 'النظام / حجز أونلاين');
  const list = (rows || []).filter(r => who === 'all' || (who === 'staff' ? r.user_id && people[r.user_id]?.role !== 'owner' : people[r.user_id]?.role === 'owner'));
  return <Sheet title="سجل التعديلات" subtitle="من فعل ماذا ومتى — يحميك من التلاعب" onClose={onClose} size="lg">
    <Segmented size="sm" items={[{ id: 'all', label: 'الكل' }, { id: 'staff', label: 'الموظفون' }, { id: 'owner', label: 'أنا' }]} value={who} onChange={setWho} />
    <Alert>{error}</Alert>
    {rows === null ? <div className="loader" /> : list.length ? <div className="list">{list.map(r => {
      const { title, lines } = auditDetails(r, data);
      return <div key={r.id} className="audit-row">
        <div className="audit-head">
          <Badge tone={r.action === 'delete' ? 'red' : r.action === 'create' ? 'green' : 'blue'}>{AUDIT_ACTIONS[r.action]}</Badge>
          <strong>{AUDIT_NAMES[r.collection] || r.collection}{title ? ` · ${title}` : ''}</strong>
        </div>
        {lines.length > 0 && <ul className="audit-lines">{lines.map((line, i) => <li key={i}>{line}</li>)}</ul>}
        <small className="muted">{actor(r)} · {new Date(r.at).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}</small>
      </div>;
    })}</div>
      : <Empty icon={ShieldCheck} title="لا تعديلات بعد" />}
  </Sheet>;
}

function Backup({ onClose }) {
  const { data, setData, toast, isManager } = useApp();
  const [pending, setPending] = useState(null);
  return <Sheet title="النسخ الاحتياطي" subtitle={cloudEnabled ? 'بياناتك محفوظة سحابياً تلقائياً — هذه نسخة إضافية' : 'بياناتك محفوظة على هذا الجهاز'} onClose={onClose}>
    <div className="stack">
      <Button block variant="secondary" icon={Download} onClick={() => download(`miqass-backup-${localISO()}.json`, JSON.stringify(data), 'application/json')}>تنزيل نسخة كاملة</Button>
      <Button block variant="secondary" icon={Download} onClick={() => exportAll(data)}>تصدير Excel (CSV)</Button>
      {isManager && <label className="btn btn-ghost btn-block"><Upload size={18} /><span>استعادة من نسخة</span><input hidden type="file" accept="application/json,.json" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file) return;
        try { const parsed = normalizeData(JSON.parse(await file.text())); if (!parsed) throw new Error(); setPending(parsed); } catch { toast('الملف غير صالح', 'error'); }
      }} /></label>}
    </div>
    {pending && <Confirm title="استبدال البيانات الحالية؟" text={`ستُستبدل البيانات بنسخة فيها ${num(pending.clients.length)} عميل و${num(pending.appointments.length)} موعد.`} danger confirmLabel="استعادة" onClose={() => setPending(null)} onConfirm={() => { setData(pending); toast('تمت الاستعادة'); onClose(); }} />}
  </Sheet>;
}

function Plan({ onClose }) {
  const { license, data, shop } = useApp();
  return <Sheet title="الاشتراك" onClose={onClose} size="lg">
    <div className="stack">
      <Alert tone={license.status === 'paid' ? 'green' : 'orange'} icon={CreditCard}>{license.status === 'paid' ? `مشترك (${plans.find(p => p.id === license.plan)?.name || license.plan}) — ${license.plan === 'lifetime' ? 'مدى الحياة' : `حتى ${new Date(license.until).toLocaleDateString(LOCALE)}`}` : `فترة تجربة — باقٍ ${license.daysLeft} أيام`}</Alert>
      <div className="plans">{plans.map(plan => { const current = license.status === 'paid' && license.plan === plan.id; return <div key={plan.id} className={`plan ${current ? 'plan-current' : plan.best ? 'plan-best' : ''}`}>
        {(current || plan.best) && <span className="plan-tag">{current ? 'خطتك الحالية' : 'الأوفر'}</span>}
        <strong>{plan.name}</strong>
        <div className="plan-price">{plan.price.toLocaleString(LOCALE)} <small>ر.ق {plan.period}</small></div>
        <p><Check size={14} /> {plan.note}</p>
        {current
          ? <Button variant="secondary" icon={Check} block disabled>مفعّلة{plan.id === 'lifetime' ? '' : ` حتى ${new Date(license.until).toLocaleDateString(LOCALE)}`}</Button>
          : <Button variant={plan.best ? 'primary' : 'secondary'} block onClick={() => openExternal(buyLink(data.shopName || shop.name, plan))}>{license.status === 'paid' ? 'تغيير لهذه الخطة' : 'اشترك'}</Button>}
      </div>; })}</div>
      {cloudEnabled && <Section title="إضافات اختيارية (اشتراك منفصل)">
        <div className="stack">{addons.map(a => <AddonOffer key={a.id} id={a.id} shopName={data.shopName || shop.name} />)}</div>
      </Section>}
    </div>
  </Sheet>;
}
