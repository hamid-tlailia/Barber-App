import React, { useEffect, useState } from 'react';
import {
  Bell, Bot, Check, Clock3, Copy, CreditCard, DatabaseBackup, Download, Gift, History, Link2, LogOut, MessageSquareText, Package,
  Plus, QrCode, Scissors, Share2, ShieldCheck, SlidersHorizontal, Store, TicketPercent, Trash2, Upload,
} from 'lucide-react';
import { PHONE_ERROR, validPhone, clientName, dateLabel, findDuplicate, packageServices, amountPaid, normalCode, digitStyle, setDigitStyle, localISO, money, normalizeData, num, roleText, statusText, timeLabel, uid, LOCALE } from '../data.js';
import { api, auth, bookingUrl, cloudEnabled, errorText } from '../lib/sync.js';
import { addonLink, addons, buyLink, deletionLink, plans } from '../lib/license.js';
import { Alert, Avatar, Badge, Button, Chips, Confirm, Empty, Field, Row, Section, Segmented, Select, Sheet, Toggle, download, openExternal, useApp, NumInput } from '../ui.jsx';
import { exportAll } from './Lock.jsx';
import { notifyNow, pushState, pushSupported } from '../lib/native.js';
import { L, LANG, isEn, setLang } from '../i18n.js';

const weekdays = isEn
  ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

export default function Settings() {
  const { intent, setIntent, shop, shops, switchShop, addBranch, role, theme, refresh, enablePush, toast, isManager, account, data, staffMember } = useApp();
  const [push, setPush] = useState(pushState);
  const [open, setOpen] = useState(null);
  useEffect(() => { if (intent?.open) setOpen(intent.open); if (intent) setIntent(null); }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = role === 'owner';
  // الموظف والاستقبال يرون إعداداتهم الشخصية فقط (الإشعارات، المظهر، الحساب).
  const groups = !isManager ? [] : [
    { title: L('الصالون', 'Salon'), items: [
      { id: 'shop', icon: Store, label: L('بيانات الصالون', 'Salon details') },
      { id: 'services', icon: Scissors, label: L('الخدمات والأسعار', 'Services & prices') },
      { id: 'hours', icon: Clock3, label: L('ساعات العمل', 'Working hours') },
      { id: 'packages', icon: Package, label: L('الباقات', 'Packages') },
      { id: 'gifts', icon: Gift, label: L('بطاقات الهدايا', 'Gift cards') },
    ] },
    { title: L('العملاء والرسائل', 'Clients & messages'), items: [
      cloudEnabled && { id: 'booking', icon: Link2, label: L('رابط الحجز الأونلاين', 'Online booking link') },
      cloudEnabled && owner && { id: 'whatsapp', icon: Bot, label: L('واتساب الذكي', 'Smart WhatsApp') },
      { id: 'coupons', icon: TicketPercent, label: L('أكواد الخصم', 'Discount codes'), subtitle: L('للحملات والعروض — مع عدد الاستخدام والدخل', 'For campaigns and offers — with uses and revenue') },
      { id: 'smart', icon: SlidersHorizontal, label: L('القواعد الذكية', 'Smart rules') },
    ] },
    { title: L('الحساب', 'Account'), items: [
      owner && { id: 'plan', icon: CreditCard, label: L('الاشتراك', 'Subscription') },
      cloudEnabled && { id: 'audit', icon: History, label: L('سجل التعديلات', 'Activity log'), subtitle: L('كل عمليات الموظفين بالتفصيل', 'Every staff action in detail') },
      { id: 'backup', icon: DatabaseBackup, label: L('النسخ الاحتياطي', 'Backup') },
      cloudEnabled && owner && { id: 'delete', icon: Trash2, label: L('حذف الصالون والحساب', 'Delete salon and account'), danger: true },
    ] },
  ];
  const Sheets = { shop: ShopSettings, services: ServicesSettings, hours: HoursSettings, packages: PackagesSettings, gifts: GiftCards, booking: BookingSettings, smart: SmartSettings, whatsapp: WhatsAppSettings, audit: AuditLog, backup: Backup, plan: Plan, delete: DeleteShop, coupons: Coupons };
  const Current = open && Sheets[open];
  const setDigits = value => { if (value === digitStyle) return; setDigitStyle(value); refresh(); };
  const changeLang = value => { if (value !== LANG) setLang(value); };
  return <div className="stack-lg">
    {groups.map(group => <Section key={group.title} title={group.title}>
      <div className="list">{group.items.filter(Boolean).map(item => <Row key={item.id} leading={<span className={`dot-icon tone-${item.danger ? 'red' : 'accent'}`}><item.icon size={18} /></span>} title={item.label} subtitle={item.subtitle} onClick={() => setOpen(item.id)} />)}</div>
    </Section>)}
    {pushSupported && <Section title={L('الإشعارات', 'Notifications')}>
      <div className="list">
        <Row leading={<span className={`dot-icon tone-${push.status === 'registered' ? 'green' : 'orange'}`}><Bell size={18} /></span>}
          title={L('إشعار الحجوزات الجديدة', 'New booking alerts')}
          subtitle={{ registered: L('مفعّلة على هذا الهاتف ✓', 'Enabled on this phone ✓'), registering: L('جارٍ التسجيل...', 'Registering...'), denied: L('مرفوضة — فعّلها من إعدادات الهاتف ← التطبيقات ← مِقص ← الإشعارات', 'Blocked — enable it in phone Settings → Apps → Miqass → Notifications'), 'not-granted': L('لم يُمنح الإذن بعد', 'Permission not granted yet'), error: L(`خطأ: ${push.error}`, `Error: ${push.error}`), unknown: L('غير مفعّلة', 'Not enabled') }[push.status] || push.status}
          trailing={<Button size="sm" variant={push.status === 'registered' ? 'ghost' : 'primary'} onClick={async () => { setPush({ status: 'registering' }); const r = await enablePush(); setTimeout(() => setPush({ ...pushState }), 1500); setPush({ ...r }); }}>{push.status === 'registered' ? L('إعادة', 'Retry') : L('تفعيل', 'Enable')}</Button>} />
        <Row title={L('إرسال إشعار تجريبي', 'Send a test notification')} subtitle={L('للتأكد أن الهاتف يعرض الإشعارات', 'Check that this phone shows notifications')} onClick={() => { notifyNow(L('📅 إشعار تجريبي', '📅 Test notification'), L('هكذا سيظهر الحجز الجديد', 'This is how a new booking will appear')); toast(L('أُرسل — انظر شريط الإشعارات', 'Sent — check your notification bar')); }} />
      </div>
    </Section>}
    {account && <Section title={L('حسابي', 'My account')}>
      <div className="list account-card">
        <Row leading={<Avatar name={account.displayName} />} title={account.displayName} subtitle={<span dir="ltr">{account.email}</span>} />
        <Row title={L('الصلاحية', 'Role')} trailing={<Badge tone={role === 'owner' ? 'orange' : 'blue'}>{roleText[role] || role}</Badge>} />
        <Row title={L('الصالون', 'Salon')} trailing={<strong>{data.shopName || shop.name}</strong>} />
        {role === 'staff' && <Row title={L('ملفي في الفريق', 'My team profile')} trailing={staffMember && !staffMember.unlinked ? <strong>{staffMember.name}</strong> : <Badge tone="red">{L('غير مرتبط — راجع صاحب الصالون', 'Not linked — ask the salon owner')}</Badge>} />}
      </div>
    </Section>}
    <Section title={L('المظهر', 'Appearance')}>
      <div className="list">
        <Row title={L('الألوان', 'Theme')} trailing={<Segmented size="sm" items={[{ id: 'light', label: L('فاتح', 'Light') }, { id: 'dark', label: L('داكن', 'Dark') }, { id: 'system', label: L('تلقائي', 'Auto') }]} value={theme.mode} onChange={theme.setMode} />} />
        <Row title={L('اللغة', 'Language')} trailing={<Segmented size="sm" items={[{ id: 'ar', label: 'العربية' }, { id: 'en', label: 'English' }]} value={LANG} onChange={changeLang} />} />
        {!isEn && <Row title="شكل الأرقام" trailing={<Segmented size="sm" items={[{ id: 'latn', label: '123' }, { id: 'arab', label: '١٢٣' }]} value={digitStyle} onChange={setDigits} />} />}
      </div>
    </Section>
    {cloudEnabled && <Section title={L('الفروع', 'Branches')}>
      <div className="list">
        {shops.map(s => <Row key={s.id} leading={<span className="dot-icon tone-blue"><Store size={18} /></span>} title={s.name} subtitle={`${roleText[s.role]}${s.active ? '' : L(' · يحتاج تفعيل', ' · Needs activation')}`} trailing={s.id === shop.id ? <Badge tone="green">{L('الحالي', 'Current')}</Badge> : <Button size="sm" variant="secondary" onClick={() => switchShop(s.id)}>{L('فتح', 'Open')}</Button>} />)}
        {owner && <Row leading={<span className="dot-icon tone-green"><Plus size={18} /></span>} title={L('إضافة فرع جديد', 'Add a new branch')} subtitle={L('كل فرع بمواعيده وفريقه واشتراكه', 'Each branch has its own bookings, team and subscription')} onClick={addBranch} />}
      </div>
    </Section>}
    {cloudEnabled && <Button variant="danger-ghost" icon={LogOut} block onClick={() => auth.signOut()}>{L('تسجيل الخروج', 'Sign out')}</Button>}
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
    if (!name.trim()) { setError(L('اسم الصالون مطلوب', 'Salon name is required')); return; }
    if (!validPhone(phone)) { setError(PHONE_ERROR); return; }
    setData(prev => ({ ...prev, shopName: name.trim(), settings: { ...prev.settings, kind, phone } }));
    if (cloudEnabled) {
      try { await api.updateShop(shop.id, { name: name.trim(), kind, phone, slug: shop.slug }); await reloadShops(); } catch (e) { setError(errorText(e)); return; }
    }
    toast(L('تم الحفظ', 'Saved')); onClose();
  };
  return <Sheet title={L('بيانات الصالون', 'Salon details')} onClose={onClose} footer={<Button block icon={Check} onClick={save}>{L('حفظ', 'Save')}</Button>}>
    <div className="stack">
      <Field label={L('اسم الصالون', 'Salon name')}><input value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label={L('نوع الصالون', 'Salon type')} hint={L('يغيّر المصطلحات (زبون/عميلة) والميزات المعروضة', 'Adjusts wording and which features are shown')}><Chips items={[{ id: 'men', label: L('رجالي', "Men's") }, { id: 'women', label: L('نسائي', "Women's") }, ...(data.settings.kind === 'mixed' ? [{ id: 'mixed', label: L('مختلط', 'Unisex') }] : [])]} value={kind} onChange={setKind} /></Field>
      <Field label={L('رقم واتساب الصالون', 'Salon WhatsApp number')}><input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
      <Alert>{error}</Alert>
    </div>
  </Sheet>;
}

function ServicesSettings({ onClose }) {
  const { data } = useApp();
  const [edit, setEdit] = useState(null);
  const categories = [...new Set(data.services.map(s => s.category || 'عام'))];
  return <Sheet title={L('الخدمات والأسعار', 'Services & prices')} onClose={onClose} size="lg" footer={<Button block icon={Plus} onClick={() => setEdit({})}>{L('خدمة جديدة', 'New service')}</Button>}>
    {categories.map(cat => <Section key={cat} title={cat === 'عام' ? L('عام', 'General') : cat}><div className="list">{data.services.filter(s => (s.category || 'عام') === cat).map(s => <Row key={s.id} title={s.name}
      subtitle={L(
        `${num(s.duration)} دقيقة${s.processing ? ` · ${num(s.processing)} انتظار` : ''}${s.deposit ? ` · عربون ${money(s.deposit)}` : ''}${s.online === false ? ' · غير متاحة أونلاين' : ''}`,
        `${num(s.duration)} min${s.processing ? ` · ${num(s.processing)} processing` : ''}${s.deposit ? ` · ${money(s.deposit)} deposit` : ''}${s.online === false ? ' · Not bookable online' : ''}`,
      )}
      trailing={<strong>{money(s.price)}</strong>} onClick={() => setEdit(s)} />)}</div></Section>)}
    {edit && <ServiceForm service={edit.id ? edit : null} onClose={() => setEdit(null)} />}
  </Sheet>;
}

function ServiceForm({ service, onClose }) {
  const { data, upsert, remove, toast } = useApp();
  const [v, setV] = useState({ name: '', category: 'عام', price: 0, duration: 30, processing: 0, deposit: 0, online: true, ...service });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const save = () => {
    const dup = findDuplicate(data.services, { id: service?.id, name: v.name });
    if (dup) { setError(L(`توجد خدمة بنفس الاسم «${dup.name}»`, `A service named “${dup.name}” already exists`)); return; }
    if (Number(v.processing) >= Number(v.duration)) { setError(L('وقت الانتظار يجب أن يكون أقل من مدة الخدمة', 'Processing time must be shorter than the duration')); return; }
    if (Number(v.deposit) > Number(v.price)) { setError(L('العربون لا يمكن أن يتجاوز سعر الخدمة', 'The deposit cannot exceed the service price')); return; }
    upsert('services', { ...v, id: service?.id || uid(), name: v.name.trim() }); toast(L('تم الحفظ', 'Saved')); onClose();
  };
  const set = (key, numeric) => e => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value });
  return <Sheet title={service ? L('تعديل الخدمة', 'Edit service') : L('خدمة جديدة', 'New service')} onClose={onClose} footer={<>
    {service && <Button variant="danger-ghost" icon={Trash2} onClick={() => {
      // خدمة عليها باقات مباعة أو باقات معروضة أو مواعيد قادمة: الحذف يفسدها، فنقترح إيقافها بدل ذلك.
      const sold = data.clientPackages.filter(p => packageServices(p).includes(service.id) && p.used < p.total).length;
      const offered = data.packages.filter(p => packageServices(p).includes(service.id)).length;
      const upcoming = data.appointments.filter(a => a.date >= localISO() && ['pending', 'confirmed', 'arrived'].includes(a.status) && (a.items || []).some(i => i.serviceId === service.id)).length;
      if (sold || offered || upcoming) { setError(L(`لا يمكن حذفها: ${[sold && `${num(sold)} باقة مباعة لم تُستهلك`, offered && `${num(offered)} باقة معروضة`, upcoming && `${num(upcoming)} موعد قادم`].filter(Boolean).join('، ')}. أوقف «متاحة في الحجز الأونلاين» بدلاً من ذلك.`, `Can't delete: ${[sold && `${num(sold)} sold package(s) not used up`, offered && `${num(offered)} package(s) on sale`, upcoming && `${num(upcoming)} upcoming appointment(s)`].filter(Boolean).join(', ')}. Turn off online booking for it instead.`)); return; }
      setConfirm(true);
    }}>{L('حذف', 'Delete')}</Button>}<div className="spacer" />
    <Button icon={Check} disabled={!v.name.trim() || v.duration < 5} onClick={save}>{L('حفظ', 'Save')}</Button>
  </>}>
    <div className="stack">
      <Field label={L('اسم الخدمة', 'Service name')} required><input autoFocus value={v.name} onChange={e => { setError(''); set('name')(e); }} /></Field>
      <Alert>{error}</Alert>
      <div className="grid-2">
        <Field label={L('الفئة', 'Category')}><input value={v.category} onChange={set('category')} /></Field>
        <Field label={L('السعر (ر.ق)', 'Price (QAR)')}><NumInput min="0" value={v.price} onChange={set('price', true)} /></Field>
        <Field label={L('المدة (دقيقة)', 'Duration (min)')}><NumInput min="5" step="5" value={v.duration} onChange={set('duration', true)} /></Field>
        <Field label={L('وقت انتظار', 'Processing time')} hint={L('مثل تثبيت الصبغة — الموظف متاح لغيره', 'E.g. while color sets — the stylist is free for others')}><NumInput min="0" step="5" value={v.processing} onChange={set('processing', true)} /></Field>
      </div>
      <Field label={L('عربون مطلوب (ر.ق)', 'Required deposit (QAR)')} hint={L('للخدمات الطويلة والعرائس — 0 بدون عربون', 'For long and bridal services — 0 for no deposit')}><NumInput min="0" value={v.deposit} onChange={set('deposit', true)} /></Field>
      <Toggle checked={v.online !== false} onChange={on => setV({ ...v, online: on })} label={L('متاحة في الحجز الأونلاين', 'Available for online booking')} />
    </div>
    {confirm && <Confirm title={L('حذف الخدمة؟', 'Delete service?')} text={L('المواعيد السابقة لن تتأثر.', 'Past appointments will not be affected.')} danger confirmLabel={L('حذف', 'Delete')} onClose={() => setConfirm(false)} onConfirm={() => { remove('services', service.id); toast(L('تم الحذف', 'Deleted')); onClose(); }} />}
  </Sheet>;
}

function HoursSettings({ onClose }) {
  const { data, setData, toast } = useApp();
  const [hours, setHours] = useState(data.settings.hours);
  const [step, setStep] = useState(data.settings.slotStep);
  return <Sheet title={L('ساعات العمل', 'Working hours')} onClose={onClose} footer={<Button block icon={Check} onClick={() => {
    if (!hours.allDay && (!hours.open || !hours.close || hours.open === hours.close)) { toast(L('وقت الفتح والإغلاق مطلوبان ويجب أن يختلفا', 'Opening and closing times are required and must differ')); return; }
    if (!hours.allDay && (hours.closedDays || []).length >= 7) { toast(L('لا يمكن إغلاق كل أيام الأسبوع', 'You cannot close every day of the week')); return; }
    setData(prev => ({ ...prev, settings: { ...prev.settings, hours, slotStep: Number(step) || 15 } })); toast(L('تم الحفظ', 'Saved')); onClose();
  }}>{L('حفظ', 'Save')}</Button>}>
    <div className="stack">
      <Toggle checked={!!hours.allDay} onChange={allDay => setHours({ ...hours, allDay })} label={L('مفتوح 24 ساعة', 'Open 24 hours')} hint={L('طوال اليوم وكل أيام الأسبوع', 'All day, every day of the week')} />
      {!hours.allDay && <>
        <div className="grid-2">
          <Field label={L('يفتح', 'Opens')}><input type="time" value={hours.open} onChange={e => setHours({ ...hours, open: e.target.value })} /></Field>
          <Field label={L('يغلق', 'Closes')}><input type="time" value={hours.close} onChange={e => setHours({ ...hours, close: e.target.value })} /></Field>
        </div>
        {hours.close && hours.open && hours.close < hours.open && <small className="muted">{L('يغلق بعد منتصف الليل', 'Closes after midnight')}</small>}
        <Field label={L('أيام الإغلاق', 'Closed days')}><Chips multiple items={weekdays.map((d, i) => ({ id: i, label: d }))} value={hours.closedDays || []} onChange={closedDays => setHours({ ...hours, closedDays })} /></Field>
      </>}
      <Field label={L('الفاصل بين المواعيد', 'Booking interval')}><Chips items={[10, 15, 30].map(n => ({ id: n, label: L(`${n} دقيقة`, `${n} min`) }))} value={Number(step)} onChange={setStep} /></Field>
    </div>
  </Sheet>;
}

function PackagesSettings({ onClose }) {
  const { data, upsert, remove, toast } = useApp();
  const [edit, setEdit] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const v = edit || {};
  return <Sheet title={L('الباقات', 'Packages')} subtitle={L('جلسات مدفوعة مسبقاً — تزيد ولاء العملاء والسيولة', 'Prepaid sessions — boost client loyalty and cash flow')} onClose={onClose} footer={!edit && <Button block icon={Plus} onClick={() => setEdit({ name: '', serviceIds: [], sessions: 1, price: 0, validityDays: 90 })}>{L('باقة جديدة', 'New package')}</Button>}>
    {edit ? <div className="stack">
      <Field label={L('اسم الباقة', 'Package name')}><input autoFocus value={v.name} onChange={e => setEdit({ ...v, name: e.target.value })} placeholder={L(`مثال: ليزر ${num(6)} جلسات`, `E.g. Laser, ${num(6)} sessions`)} /></Field>
      <Field label={L('خدمات الباقة', 'Services in the package')} hint={L('اختر خدمة أو أكثر — مثلاً شعر ولحية + تدليك + ماسك', 'Choose one or more — e.g. hair & beard + massage + mask')}>
        <Select multiple value={packageServices(v)} onChange={ids => setEdit({ ...v, serviceIds: ids, serviceId: ids[0] || '' })} placeholder={L('اختر الخدمات', 'Choose services')}
          options={data.services.map(s => ({ id: s.id, label: s.name, hint: `${num(s.duration)} ${L('دقيقة', 'min')}`, trailing: money(s.price) }))} />
      </Field>
      <div className="grid-2">
        <Field label={L('عدد الجلسات', 'Number of sessions')}><NumInput min="1" value={v.sessions} onChange={e => setEdit({ ...v, sessions: Number(e.target.value) })} /></Field>
        <Field label={L('سعر الباقة', 'Package price')}><NumInput min="0" value={v.price} onChange={e => setEdit({ ...v, price: Number(e.target.value) })} /></Field>
      </div>
      <Field label={L('صالحة لمدة (يوم)', 'Valid for (days)')}><NumInput min="0" value={v.validityDays} onChange={e => setEdit({ ...v, validityDays: Number(e.target.value) })} /></Field>
      {packageServices(v).length > 0 && (() => {
        const regular = packageServices(v).reduce((sum, id) => sum + Number(data.services.find(s => s.id === id)?.price || 0), 0) * Number(v.sessions || 1);
        return <small className="muted">{L('السعر المعتاد', 'Regular price')} {money(regular)} — {L('توفير للعميل', 'client saves')} {money(Math.max(0, regular - Number(v.price || 0)))}</small>;
      })()}
      <div className="row-buttons">
        {v.id && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>{L('حذف', 'Delete')}</Button>}
        <div className="spacer" /><Button variant="ghost" onClick={() => setEdit(null)}>{L('رجوع', 'Back')}</Button>
        <Button icon={Check} disabled={!v.name?.trim()} onClick={() => {
          const dup = findDuplicate(data.packages, v);
          if (dup) { toast(L(`توجد باقة بنفس الاسم «${dup.name}»`, `A package named “${dup.name}” already exists`)); return; }
          if (!packageServices(v).some(id => data.services.some(s => s.id === id))) { toast(L('اختر خدمة واحدة على الأقل', 'Choose at least one service')); return; }
          if (!(Number(v.sessions) >= 1) || !(Number(v.price) > 0)) { toast(L('عدد الجلسات والسعر يجب أن يكونا أكبر من صفر', 'Sessions and price must be greater than zero')); return; } upsert('packages', { ...v, name: v.name.trim(), serviceIds: packageServices(v).filter(id => data.services.some(s => s.id === id)), serviceId: packageServices(v).find(id => data.services.some(s => s.id === id)) || '', id: v.id || uid() }); toast(L('تم الحفظ', 'Saved')); setEdit(null); }}>{L('حفظ', 'Save')}</Button>
      </div>
    </div> : data.packages.length ? <div className="list">{data.packages.map(p => <Row key={p.id} title={p.name} subtitle={packageServices(p).map(id => data.services.find(x => x.id === id)?.name).filter(Boolean).join(' + ') + ' · ' + L(`${num(p.sessions)} جلسات · ${num(p.validityDays)} يوم`, `${plural(num(p.sessions), 'session', 'sessions')} · ${plural(num(p.validityDays), 'day', 'days')}`)} trailing={<strong>{money(p.price)}</strong>} onClick={() => setEdit(p)} />)}</div>
      : <Empty icon={Package} title={L('لا باقات بعد', 'No packages yet')} text={L(`مثال: ${num(5)} قصات بسعر ${num(4)} — يدفع العميل مقدماً ويعود باستمرار`, `E.g. ${num(5)} haircuts for the price of ${num(4)} — the client pays upfront and keeps coming back`)} />}
    {confirmDelete && <Confirm title={L('حذف الباقة؟', 'Delete package?')} text={L('الباقات المباعة سابقاً للعملاء تبقى صالحة.', 'Packages already sold to clients stay valid.')} danger confirmLabel={L('حذف', 'Delete')} onClose={() => setConfirmDelete(false)} onConfirm={() => { remove('packages', v.id); setEdit(null); toast(L('تم الحذف', 'Deleted')); }} />}
  </Sheet>;
}

// أكواد الخصم للحملات: إنشاء، إيقاف، ومتابعة كم استُخدم كل كود وكم جلب من دخل.
function Coupons({ onClose }) {
  const { data, upsert, remove, toast } = useApp();
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const v = edit || {};
  const stats = c => {
    const appts = data.appointments.filter(a => a.couponId === c.id);
    return { uses: appts.length, revenue: appts.reduce((s, a) => s + amountPaid(a), 0), discount: appts.reduce((s, a) => s + Number(a.discount || 0), 0), clients: new Set(appts.map(a => a.clientId)).size };
  };
  const save = () => {
    const code = normalCode(v.code);
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) { setError(L('الكود من 3 إلى 20 حرفاً إنجليزياً أو رقماً (مثل EID20)', 'The code must be 3–20 English letters or digits (e.g. EID20)')); return; }
    if (data.coupons.some(c => c.id !== v.id && normalCode(c.code) === code)) { setError(L('هذا الكود موجود', 'This code already exists')); return; }
    if (!(Number(v.value) > 0) || (v.type !== 'amount' && Number(v.value) > 100)) { setError(L('قيمة الخصم غير صحيحة (النسبة بين 1 و100)', 'Invalid discount value (percentage between 1 and 100)')); return; }
    upsert('coupons', { ...v, code, value: Number(v.value), maxUses: Number(v.maxUses) || 0, used: Number(v.used) || 0, active: v.active !== false, id: v.id || uid(), createdAt: v.createdAt || localISO() });
    toast(L('تم الحفظ', 'Saved')); setEdit(null); setError('');
  };
  const shareText = c => L(`🎁 عرض خاص من ${data.shopName || ''}: استخدم الكود ${c.code} واحصل على خصم ${c.type === 'amount' ? money(c.value) : `${num(c.value)}٪`}${c.expiresAt ? ` حتى ${dateLabel(c.expiresAt)}` : ''}.`, `🎁 Special offer from ${data.shopName || ''}: use code ${c.code} for ${c.type === 'amount' ? money(c.value) : `${num(c.value)}%`} off${c.expiresAt ? ` until ${dateLabel(c.expiresAt)}` : ''}.`);
  return <Sheet title={L('أكواد الخصم', 'Discount codes')} subtitle={L('يكتبه العميل أو الكاشير عند الدفع', 'Entered at checkout')} onClose={onClose}
    footer={edit ? <>
      {v.id && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>{L('حذف', 'Delete')}</Button>}
      <div className="spacer" /><Button variant="ghost" onClick={() => { setEdit(null); setError(''); }}>{L('رجوع', 'Back')}</Button><Button icon={Check} onClick={save}>{L('حفظ', 'Save')}</Button>
    </> : <Button block icon={Plus} onClick={() => setEdit({ code: '', type: 'percent', value: 10, maxUses: 0, expiresAt: '', active: true })}>{L('كود جديد', 'New code')}</Button>}>
    {edit ? <div className="stack">
      <Field label={L('الكود', 'Code')} required hint={L('حروف إنجليزية وأرقام — مثل EID20 أو INSTA10', 'English letters and digits — e.g. EID20 or INSTA10')}><input dir="ltr" className="code-input" autoFocus value={v.code} onChange={e => { setEdit({ ...v, code: e.target.value.toUpperCase() }); setError(''); }} placeholder="EID20" /></Field>
      <Field label={L('نوع الخصم', 'Discount type')}><Segmented items={[{ id: 'percent', label: L('نسبة ٪', 'Percent %') }, { id: 'amount', label: L('مبلغ ثابت', 'Fixed amount') }]} value={v.type} onChange={type => setEdit({ ...v, type })} /></Field>
      <div className="grid-2">
        <Field label={v.type === 'amount' ? L('المبلغ (ر.ق)', 'Amount (QAR)') : L('النسبة ٪', 'Percent %')}><NumInput value={v.value} onChange={e => setEdit({ ...v, value: e.target.value })} /></Field>
        <Field label={L('حد الاستخدام', 'Usage limit')} hint={L('0 = بلا حد', '0 = unlimited')}><NumInput value={v.maxUses} onChange={e => setEdit({ ...v, maxUses: e.target.value })} /></Field>
      </div>
      <Field label={L('ينتهي في (اختياري)', 'Expires on (optional)')}><input type="date" value={v.expiresAt || ''} min={localISO()} onChange={e => setEdit({ ...v, expiresAt: e.target.value })} /></Field>
      <Toggle checked={v.active !== false} onChange={active => setEdit({ ...v, active })} label={L('مفعّل', 'Active')} />
      <Alert>{error}</Alert>
    </div> : data.coupons.length ? <div className="list">{data.coupons.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(c => {
      const s = stats(c);
      const off = c.active === false || (c.expiresAt && c.expiresAt < localISO()) || (Number(c.maxUses) > 0 && Number(c.used || 0) >= Number(c.maxUses));
      return <Row key={c.id} leading={<span className={`dot-icon tone-${off ? 'muted' : 'green'}`}><TicketPercent size={18} /></span>}
        title={<span dir="ltr">{c.code}</span>}
        subtitle={`${c.type === 'amount' ? money(c.value) : `${num(c.value)}٪`} · ${L(`استُخدم ${num(s.uses)}${Number(c.maxUses) > 0 ? ` من ${num(c.maxUses)}` : ''}`, `used ${num(s.uses)}${Number(c.maxUses) > 0 ? ` of ${num(c.maxUses)}` : ''}`)} · ${L(`جلب ${money(s.revenue)}`, `brought ${money(s.revenue)}`)}${c.expiresAt ? ` · ${L('حتى', 'until')} ${dateLabel(c.expiresAt, { day: 'numeric', month: 'short' })}` : ''}`}
        trailing={<span className="row-end">{off && <Badge tone="muted">{L('منتهي', 'Inactive')}</Badge>}<Button size="sm" variant="ghost" icon={Share2} onClick={event => { event.stopPropagation(); openExternal(`https://wa.me/?text=${encodeURIComponent(shareText(c))}`); }}>{L('نشر', 'Share')}</Button></span>}
        onClick={() => setEdit(c)} />;
    })}</div> : <Empty icon={TicketPercent} title={L('لا أكواد بعد', 'No codes yet')} text={L('أنشئ كوداً لحملة انستغرام أو عيد، وتابع كم عميلاً استخدمه وكم جلب من دخل', 'Create a code for an Instagram or holiday campaign and track how many clients used it and the revenue it brought')} />}
    {confirmDelete && <Confirm danger title={L('حذف الكود؟', 'Delete code?')} text={L('المواعيد التي استخدمته تبقى كما هي.', 'Appointments that used it stay as they are.')} confirmLabel={L('حذف', 'Delete')} onClose={() => setConfirmDelete(false)} onConfirm={() => { remove('coupons', v.id); setEdit(null); toast(L('تم الحذف', 'Deleted')); }} />}
  </Sheet>;
}

function GiftCards({ onClose }) {
  const { data } = useApp();
  return <Sheet title={L('بطاقات الهدايا', 'Gift cards')} subtitle={L('تُصدر من شاشة الدفع ← بطاقة هدية', 'Issued from the checkout screen → Gift card')} onClose={onClose}>
    {data.giftCards.length ? <div className="list">{data.giftCards.slice().reverse().map(g => <Row key={g.id} leading={<Gift size={18} />} title={<span dir="ltr">{g.code}</span>} subtitle={`${g.recipientName || g.buyerName || ''} · ${dateLabel(g.createdAt, { day: 'numeric', month: 'short' })}`} trailing={<span className="row-end"><strong>{money(g.balance)}</strong><small>{L('من', 'of')} {money(g.amount)}</small></span>} />)}</div>
      : <Empty icon={Gift} title={L('لم تُصدر بطاقات بعد', 'No gift cards issued yet')} text={L('بطاقات الهدايا تجلب عملاء جدداً ودخلاً مقدماً', 'Gift cards bring in new clients and upfront revenue')} />}
  </Sheet>;
}

function BookingSettings({ onClose }) {
  const { shop, data, reloadShops, toast, setData } = useApp();
  const suggested = (shop.slug || data.shopName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `salon-${Math.random().toString(36).slice(2, 6)}`;
  const [slug, setSlug] = useState(shop.slug || suggested);
  const [error, setError] = useState('');
  const link = bookingUrl(shop.slug);
  if (!cloudEnabled) return <Sheet title={L('رابط الحجز', 'Booking link')} onClose={onClose}><Empty icon={Link2} title={L('يحتاج الحساب السحابي', 'Requires a cloud account')} text={L('الحجز الأونلاين يعمل بعد ربط التطبيق بقاعدة البيانات', 'Online booking works once the app is connected to the cloud database')} /></Sheet>;
  const save = async () => {
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) { setError(L('حروف إنجليزية صغيرة وأرقام وشرطة فقط (3 أحرف على الأقل)', 'Lowercase English letters, numbers and hyphens only (at least 3 characters)')); return; }
    try { await api.updateShop(shop.id, { name: data.shopName, kind: data.settings.kind, phone: shop.phone, slug }); await reloadShops(); setData(prev => ({ ...prev, settings: { ...prev.settings, bookingEnabled: true } })); toast(L('تم تفعيل رابط الحجز', 'Booking link activated')); setError(''); }
    catch (e) { setError(errorText(e)); }
  };
  return <Sheet title={L('رابط الحجز الأونلاين', 'Online booking link')} subtitle={L('ضعه في انستغرام وخرائط جوجل وواتساب', 'Add it to Instagram, Google Maps and WhatsApp')} onClose={onClose}>
    <div className="stack">
      {link && <div className="invite-code"><QrCode size={22} /><strong dir="ltr" className="small">{link}</strong>
        <div className="row-buttons"><Button variant="secondary" icon={Copy} onClick={() => { navigator.clipboard?.writeText(link); toast(L('تم النسخ', 'Copied')); }}>{L('نسخ', 'Copy')}</Button><Button icon={Link2} onClick={() => openExternal(link)}>{L('معاينة', 'Preview')}</Button></div>
      </div>}
      <Field label={L('اسم الرابط', 'Link name')} hint={L('بالإنجليزية — مثال: miqass-doha', 'In English — e.g. miqass-doha')}><input dir="ltr" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} /></Field>
      <Alert>{error}</Alert>
      <Button block icon={Check} onClick={save}>{shop.slug ? L('تحديث الرابط', 'Update link') : L('تفعيل الحجز الأونلاين', 'Enable online booking')}</Button>
      <small className="muted">{L(`الحجوزات الأونلاين تصل «بانتظار التأكيد» وتظهر فوراً على كل الأجهزة. حماية تلقائية: ${num(3)} حجوزات كحد أقصى للرقم يومياً.`, `Online bookings arrive as "Pending confirmation" and appear instantly on all devices. Built-in protection: max ${num(3)} bookings per phone number per day.`)}</small>
    </div>
  </Sheet>;
}

function SmartSettings({ onClose }) {
  const { data, setData, toast } = useApp();
  const [s, setS] = useState(data.settings);
  return <Sheet title={L('القواعد الذكية', 'Smart rules')} onClose={onClose} footer={<Button block icon={Check} onClick={() => { setData(prev => ({ ...prev, settings: { ...s, noShowDepositPercent: Math.min(100, Number(s.noShowDepositPercent) || 0), loyaltyPer: Math.max(1, Number(s.loyaltyPer) || 1) } })); toast(L('تم الحفظ', 'Saved')); onClose(); }}>{L('حفظ', 'Save')}</Button>}>
    <div className="stack">
      <Field label={L('عربون العملاء كثيري الغياب (٪ من الفاتورة)', 'Deposit for frequent no-shows (% of bill)')} hint={L('يُقترح تلقائياً عند الحجز لمن تغيّب مرتين أو أكثر', 'Suggested automatically when booking clients with 2+ no-shows')}><NumInput min="0" max="100" value={s.noShowDepositPercent} onChange={e => setS({ ...s, noShowDepositPercent: Number(e.target.value) })} /></Field>
      <Field label={L('اعتبر العميل منقطعاً بعد (يوم)', 'Mark client as lapsed after (days)')} hint={L('يُستخدم عندما لا يكون له نمط زيارات واضح', 'Used when the client has no clear visit pattern')}><NumInput min="7" value={s.recoveryDays} onChange={e => setS({ ...s, recoveryDays: Number(e.target.value) })} /></Field>
      <Field label={L('نقطة ولاء لكل (ر.ق)', 'One loyalty point per (QAR)')}><NumInput min="1" value={s.loyaltyPer} onChange={e => setS({ ...s, loyaltyPer: Number(e.target.value) })} /></Field>
      <Field label={L('إرسال التذكير قبل الموعد بـ (ساعة)', 'Send reminder before appointment (hours)')} hint={L('للإرسال التلقائي عبر واتساب للأعمال', 'For automatic sending via WhatsApp Business')}><Chips items={[2, 12, 24].map(h => ({ id: h, label: L(`${h} ساعة`, `${h} hours`) }))} value={Number(s.reminderHours)} onChange={h => setS({ ...s, reminderHours: h })} /></Field>
      <Toggle checked={s.hideClientPhotosFromStaff} onChange={on => setS({ ...s, hideClientPhotosFromStaff: on })} label={L('إخفاء صور العملاء عن الموظفين', 'Hide client photos from staff')} hint={L('خصوصية مهمة للصالونات النسائية', "Important privacy for women's salons")} />
    </div>
  </Sheet>;
}

// صاحب الصالون يرى التفضيلات فقط؛ الربط والمفاتيح يضعها مدير المنصة بعد الاشتراك في الإضافة.
// كل إضافة اشتراك منفصل فوق الباقة، ونعرض سعرها بوضوح قبل الطلب.
function AddonOffer({ id, shopName }) {
  const addon = addons.find(a => a.id === id);
  const required = addon.requires && addons.find(a => a.id === addon.requires);
  return <div className="addon-offer">
    <div className="addon-head"><strong>{addon.name}</strong><Badge tone="blue">{L('اشتراك إضافي', 'Add-on subscription')}</Badge></div>
    <div className="addon-price">+{addon.monthly.toLocaleString(LOCALE)} <small>{L('ر.ق / شهر', 'QAR / month')}</small> <span className="muted small">{L('أو', 'or')} {addon.yearly.toLocaleString(LOCALE)} {L('ر.ق / سنة', 'QAR / year')}</span></div>
    <ul>{addon.points.map(p => <li key={p}><Check size={14} /> {p}</li>)}</ul>
    <small className="muted">{L(`يُضاف إلى اشتراكك في التطبيق ولا يشمله${required ? ` · يتطلب «${required.name}»` : ''}.`, `Billed on top of your app subscription, not included in it${required ? ` · Requires "${required.name}"` : ''}.`)}</small>
    <Button variant="secondary" icon={MessageSquareText} block onClick={() => openExternal(addonLink(shopName, addon))}>{L('اطلب التفعيل', 'Request activation')}</Button>
  </div>;
}

export function WhatsAppSettings({ onClose }) {
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
    if (v.daily && !validPhone(v.ownerWhatsapp)) { setError(PHONE_ERROR); return; }
    try { await api.saveIntegration(shop.id, v); toast(L('تم الحفظ', 'Saved')); onClose(); } catch (e) { setError(errorText(e)); }
  };
  const shopName = data.shopName || shop.name;
  return <Sheet title={L('واتساب الذكي', 'Smart WhatsApp')} subtitle={L('أتمتة كاملة عبر WhatsApp Business', 'Full automation via WhatsApp Business')} onClose={onClose} footer={v?.waAddon && <Button block icon={Check} onClick={save}>{L('حفظ', 'Save')}</Button>}>
    <Alert>{error}</Alert>
    {!v ? !error && <div className="loader" /> : !v.waAddon ? <div className="stack">
      <p className="muted small">{L('إضافات اختيارية باشتراك منفصل عن باقة التطبيق — نفعّلها لك خلال دقائق بعد الدفع.', 'Optional add-ons with a subscription separate from your app plan — we activate them within minutes of payment.')}</p>
      <AddonOffer id="wa" shopName={shopName} />
      <AddonOffer id="ai" shopName={shopName} />
    </div> : <div className="stack">
      <Alert tone="green" icon={Check}>{L('اشتراك إضافي مفعّل لصالونك ✓ — يمكنك تشغيل أو إيقاف كل ميزة حسب حاجتك.', 'Add-on active for your salon ✓ — turn each feature on or off as you need.')}</Alert>
      <Toggle checked={v.reminders} onChange={on => setV({ ...v, reminders: on })} label={L('تذكير تلقائي قبل كل موعد', 'Automatic reminder before every appointment')} hint={L('العميل يرد 1 للتأكيد أو 2 للإلغاء — ويتحدث الجدول تلقائياً', 'Client replies 1 to confirm or 2 to cancel — the schedule updates automatically')} />
      <Toggle checked={v.daily} onChange={on => setV({ ...v, daily: on })} label={L('تقرير يومي لصاحب المحل', 'Daily report for the salon owner')} hint={L('الدخل، المواعيد، الغياب، الأفضل أداءً — كل ليلة', 'Revenue, appointments, no-shows, top performers — every night')} />
      {v.daily && <Field label={L('رقم واتساب لاستلام التقرير', 'WhatsApp number to receive the report')}><input type="tel" dir="ltr" value={v.ownerWhatsapp} onChange={e => setV({ ...v, ownerWhatsapp: e.target.value })} placeholder="974XXXXXXXX" /></Field>}
      {v.aiAddon
        ? <Toggle checked={v.assistant} onChange={on => setV({ ...v, assistant: on })} label={L('المساعد الذكي (AI)', 'AI assistant')} hint={L('يرد على العملاء ويحجز ويجيب عن الأسعار بالعربي 24/7', 'Replies to clients, books appointments and answers price questions in Arabic 24/7')} />
        : <AddonOffer id="ai" shopName={shopName} />}
    </div>}
  </Sheet>;
}

// سجل مفصّل: من قام بالعملية، وما الذي تغيّر بالضبط (القيمة القديمة ← الجديدة).
const AUDIT_NAMES = isEn
  ? { appointments: 'Appointment', clients: 'Client', services: 'Service', products: 'Product', staff: 'Staff member', drawers: 'Drawer close', expenses: 'Expense', sales: 'Sale', giftCards: 'Gift card', clientPackages: 'Client package', packages: 'Package', waitlist: 'Waitlist', notes: 'Note', meta: 'Salon settings' }
  : { appointments: 'موعد', clients: 'عميل', services: 'خدمة', products: 'منتج', staff: 'موظف', drawers: 'إغلاق صندوق', expenses: 'مصروف', sales: 'بيع', giftCards: 'بطاقة هدية', clientPackages: 'باقة عميل', packages: 'باقة', waitlist: 'قائمة انتظار', notes: 'ملاحظة', meta: 'إعدادات الصالون' };
const AUDIT_ACTIONS = isEn ? { create: 'Added', update: 'Edited', delete: 'Deleted' } : { create: 'إضافة', update: 'تعديل', delete: 'حذف' };
const FIELD_LABELS = isEn
  ? { name: 'Name', phone: 'Phone', price: 'Price', duration: 'Duration', amount: 'Amount', quantity: 'Quantity', cost: 'Cost', commission: 'Commission', category: 'Category', notes: 'Notes', deposit: 'Deposit', discount: 'Discount', balance: 'Balance', minStock: 'Low-stock alert', label: 'Description', counted: 'Counted', difference: 'Difference', keep: 'Kept for tomorrow' }
  : { name: 'الاسم', phone: 'الهاتف', price: 'السعر', duration: 'المدة', amount: 'المبلغ', quantity: 'الكمية', cost: 'التكلفة', commission: 'العمولة', category: 'الفئة', notes: 'ملاحظات', deposit: 'العربون', discount: 'الخصم', balance: 'الرصيد', minStock: 'حد التنبيه', label: 'البيان', counted: 'المعدود', difference: 'الفرق', keep: 'المتبقي للغد' };
const MONEY_FIELDS = new Set(['price', 'amount', 'cost', 'deposit', 'discount', 'balance', 'counted', 'difference', 'keep']);
const ARROW = L('←', '→');
const paid = a => (a?.payments || []).filter(p => p.kind !== 'tip').reduce((sum, p) => sum + Number(p.amount || 0), 0);
const show = (key, value) => (value === undefined || value === null || value === '' ? '—' : MONEY_FIELDS.has(key) ? money(value) : typeof value === 'number' ? num(value) : String(value));

function auditDetails(row, data) {
  const before = row.before || {}; const after = row.after || {};
  const item = row.action === 'delete' ? before : after;
  const lines = [];
  const staffName = id => data.staff.find(m => m.id === id)?.name || L('أي موظف', 'Any staff');
  if (row.collection === 'appointments') {
    const client = clientName(data.clients, item.clientId);
    const title = `${client} — ${item.date ? dateLabel(item.date) : ''} ${item.time ? timeLabel(item.time) : ''}`.trim();
    if (row.action === 'update') {
      if (before.status !== after.status) lines.push(`${L('الحالة', 'Status')}: ${statusText[before.status] || before.status || '—'} ${ARROW} ${statusText[after.status] || after.status}`);
      if (before.date !== after.date || before.time !== after.time) lines.push(`${L('الموعد', 'Time')}: ${dateLabel(before.date)} ${timeLabel(before.time)} ${ARROW} ${dateLabel(after.date)} ${timeLabel(after.time)}`);
      if (paid(before) !== paid(after)) lines.push(paid(after) > paid(before) ? L(`استلام دفعة ${money(paid(after) - paid(before))}`, `Payment received ${money(paid(after) - paid(before))}`) : L(`⚠️ إلغاء دفعة ${money(paid(before) - paid(after))}`, `⚠️ Payment removed ${money(paid(before) - paid(after))}`));
      if (Number(before.price || 0) !== Number(after.price || 0)) lines.push(`${L('المبلغ', 'Amount')}: ${money(before.price)} ${ARROW} ${money(after.price)}`);
      if (Number(before.discount || 0) !== Number(after.discount || 0)) lines.push(`${L('الخصم', 'Discount')}: ${money(before.discount)} ${ARROW} ${money(after.discount)}`);
      if (before.staffId !== after.staffId) lines.push(`${L('الموظف', 'Staff')}: ${staffName(before.staffId)} ${ARROW} ${staffName(after.staffId)}`);
      const names = a => (a.items || []).map(i => i.name).join(' + ');
      if (names(before) !== names(after)) lines.push(`${L('الخدمات', 'Services')}: ${names(before) || '—'} ${ARROW} ${names(after) || '—'}`);
    } else lines.push(`${(item.items || []).map(i => i.name).join(' + ')}${item.price ? ` · ${money(item.price)}` : ''}`);
    return { title, lines };
  }
  if (row.collection === 'meta') return { title: L('إعدادات الصالون', 'Salon settings'), lines: [] };
  const title = item.name || item.label || (item.clientId && data.clients.find(c => c.id === item.clientId)?.name) || (item.date ? dateLabel(item.date) : '');
  if (row.action === 'update') {
    for (const key of Object.keys(FIELD_LABELS)) {
      if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) lines.push(`${FIELD_LABELS[key]}: ${show(key, before[key])} ${ARROW} ${show(key, after[key])}`);
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
  const [shown, setShown] = useState(50);
  const [error, setError] = useState('');
  useEffect(() => {
    api.audit(shop.id, 300).then(setRows).catch(e => setError(errorText(e)));
    api.people(shop.id).then(list => setPeople(Object.fromEntries(list.map(p => [p.user_id, p])))).catch(() => {});
  }, [shop.id]);
  const actor = r => (r.user_id ? people[r.user_id]?.display_name || L('مستخدم', 'User') : L('النظام / حجز أونلاين', 'System / online booking'));
  const list = (rows || []).filter(r => who === 'all' || (who === 'staff' ? r.user_id && people[r.user_id]?.role !== 'owner' : people[r.user_id]?.role === 'owner'));
  return <Sheet title={L('سجل التعديلات', 'Activity log')} subtitle={L('من فعل ماذا ومتى — يحميك من التلاعب', 'Who did what and when — protects you from tampering')} onClose={onClose} size="lg">
    <Segmented size="sm" items={[{ id: 'all', label: L('الكل', 'All') }, { id: 'staff', label: L('الموظفون', 'Staff') }, { id: 'owner', label: L('أنا', 'Me') }]} value={who} onChange={v => { setWho(v); setShown(50); }} />
    <Alert>{error}</Alert>
    {rows === null ? <div className="loader" /> : list.length ? <><div className="list audit-list">{list.slice(0, shown).map(r => {
      const { title, lines } = auditDetails(r, data);
      return <div key={r.id} className="audit-row">
        <div className="audit-head">
          <Badge tone={r.action === 'delete' ? 'red' : r.action === 'create' ? 'green' : 'blue'}>{AUDIT_ACTIONS[r.action]}</Badge>
          <strong>{AUDIT_NAMES[r.collection] || r.collection}{title ? ` · ${title}` : ''}</strong>
        </div>
        {lines.length > 0 && <ul className="audit-lines">{lines.map((line, i) => <li key={i}>{line}</li>)}</ul>}
        <div className="audit-meta"><Badge tone={!r.user_id ? 'muted' : people[r.user_id]?.role === 'owner' ? 'orange' : 'purple'}>{actor(r)}</Badge><small className="muted" dir="auto">{new Date(r.at).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}</small></div>
      </div>;
    })}</div>
      {list.length > shown && <Button variant="ghost" block onClick={() => setShown(shown + 50)}>{L(`عرض المزيد (${num(list.length - shown)})`, `Show more (${num(list.length - shown)})`)}</Button>}</>
      : <Empty icon={ShieldCheck} title={L('لا تعديلات بعد', 'No activity yet')} />}
  </Sheet>;
}

// طلب حذف الصالون والحساب: يصل المالكَ للموافقة (إشعار + واتساب). لا شيء يُحذف قبل موافقته.
function DeleteShop({ onClose }) {
  const { shop, data, toast } = useApp();
  const [status, setStatus] = useState(undefined);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const shopName = data.shopName || shop.name;
  useEffect(() => { api.deletionStatus(shop.id).then(setStatus).catch(e => { setStatus(null); setError(errorText(e)); }); }, [shop.id]);
  const requested = status?.requested_at;
  return <Sheet title={L('حذف الصالون والحساب', 'Delete salon and account')} onClose={onClose} footer={requested ? <>
    <Button variant="ghost" onClick={async () => { try { await api.cancelDeletion(shop.id); toast(L('تم إلغاء طلب الحذف', 'Deletion request cancelled')); onClose(); } catch (e) { setError(errorText(e)); } }}>{L('إلغاء الطلب', 'Cancel request')}</Button>
    <div className="spacer" />
    <Button variant="secondary" icon={MessageSquareText} onClick={() => openExternal(deletionLink(shopName, status.reason || ''))}>{L('تذكير عبر واتساب', 'Remind via WhatsApp')}</Button>
  </> : <Button block variant="danger" icon={Trash2} disabled={status === undefined || !reason.trim()} onClick={() => setConfirm(true)}>{L('إرسال طلب الحذف', 'Send deletion request')}</Button>}>
    <div className="stack">
      <Alert>{error}</Alert>
      {status === undefined ? <div className="loader" /> : requested ? <Alert tone="orange" icon={History}>{L(`طلبك قيد المراجعة منذ ${dateLabel(String(requested).slice(0, 10))}. سنتواصل معك قبل الحذف. يمكنك إلغاء الطلب في أي وقت قبل ذلك.`, `Your request has been under review since ${dateLabel(String(requested).slice(0, 10))}. We will contact you before deleting. You can cancel it any time before then.`)}</Alert> : <>
        <p className="muted">{L('بعد موافقة إدارة التطبيق يُحذف نهائياً ولا يمكن استرجاعه:', 'Once approved by the app team, this is deleted permanently and cannot be recovered:')}</p>
        <ul className="plain-list">
          <li>{L('كل بيانات الصالون: العملاء، المواعيد، المدفوعات، التقارير، المخزون والصور.', 'All salon data: clients, appointments, payments, reports, inventory and photos.')}</li>
          <li>{L('حسابك (البريد وكلمة المرور).', 'Your account (email and password).')}</li>
          <li>{L('حسابات موظفيك — إلا من يعمل أيضاً في صالون آخر على التطبيق، فيبقى حسابه هناك.', 'Your staff accounts — except anyone who also works at another salon on the app; their account stays there.')}</li>
        </ul>
        <Button variant="secondary" icon={Download} block onClick={() => download(`miqass-backup-${localISO()}.json`, JSON.stringify(data), 'application/json')}>{L('نزّل نسخة من بياناتك أولاً', 'Download a copy of your data first')}</Button>
        <Field label={L('سبب الحذف', 'Reason for deletion')} required><textarea rows="3" value={reason} onChange={e => setReason(e.target.value)} placeholder={L('يساعدنا على تحسين التطبيق', 'Helps us improve the app')} /></Field>
      </>}
    </div>
    {confirm && <Confirm danger title={L('إرسال طلب الحذف؟', 'Send the deletion request?')} text={L('سيصل الطلب لإدارة التطبيق، وتُفتح رسالة واتساب لتأكيده. يبقى التطبيق يعمل حتى الموافقة.', 'The request goes to the app team and a WhatsApp message opens to confirm it. The app keeps working until it is approved.')} confirmLabel={L('إرسال', 'Send')} onClose={() => setConfirm(false)} onConfirm={async () => {
      try {
        await api.requestDeletion(shop.id, reason.trim());
        openExternal(deletionLink(shopName, reason.trim()));
        toast(L('تم إرسال طلب الحذف', 'Deletion request sent')); onClose();
      } catch (e) { setError(errorText(e)); }
    }} />}
  </Sheet>;
}

function Backup({ onClose }) {
  const { data, setData, toast, isManager } = useApp();
  const [pending, setPending] = useState(null);
  return <Sheet title={L('النسخ الاحتياطي', 'Backup')} subtitle={cloudEnabled ? L('بياناتك محفوظة سحابياً تلقائياً — هذه نسخة إضافية', 'Your data is backed up to the cloud automatically — this is an extra copy') : L('بياناتك محفوظة على هذا الجهاز', 'Your data is stored on this device')} onClose={onClose}>
    <div className="stack">
      <Button block variant="secondary" icon={Download} onClick={() => download(`miqass-backup-${localISO()}.json`, JSON.stringify(data), 'application/json')}>{L('تنزيل نسخة كاملة', 'Download full backup')}</Button>
      <Button block variant="secondary" icon={Download} onClick={() => import('../lib/exporters.js').then(x => x.exportXlsx(`miqass-${localISO()}.xlsx`, [{ name: L('العملاء', 'Clients'), rows: x.clientsTable(data) }, { name: L('المواعيد', 'Appointments'), rows: x.appointmentsTable(data) }])).catch(() => toast(L('تعذر التصدير', 'Export failed'), 'error'))}>{L('تصدير Excel', 'Export Excel')}</Button>
      <Button block variant="secondary" icon={Download} onClick={() => import('../lib/exporters.js').then(x => x.exportDocx(`miqass-${localISO()}.docx`, `${data.shopName || ''} — ${L('العملاء والمواعيد', 'Clients & appointments')}`, [{ heading: L('العملاء', 'Clients'), rows: x.clientsTable(data) }, { heading: L('المواعيد', 'Appointments'), rows: x.appointmentsTable(data) }])).catch(() => toast(L('تعذر التصدير', 'Export failed'), 'error'))}>{L('تصدير Word', 'Export Word')}</Button>
      <Button block variant="secondary" icon={Download} onClick={() => exportAll(data)}>{L('تصدير CSV', 'Export CSV')}</Button>
      {isManager && <label className="btn btn-ghost btn-block"><Upload size={18} /><span>{L('استعادة من نسخة', 'Restore from backup')}</span><input hidden type="file" accept="application/json,.json" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file) return;
        try { const parsed = normalizeData(JSON.parse(await file.text())); if (!parsed) throw new Error(); setPending(parsed); } catch { toast(L('الملف غير صالح', 'Invalid file'), 'error'); }
      }} /></label>}
    </div>
    {pending && <Confirm title={L('استبدال البيانات الحالية؟', 'Replace current data?')} text={L(`ستُستبدل البيانات بنسخة فيها ${num(pending.clients.length)} عميل و${num(pending.appointments.length)} موعد.`, `Your data will be replaced with a backup containing ${plural(num(pending.clients.length), 'client', 'clients')} and ${plural(num(pending.appointments.length), 'appointment', 'appointments')}.`)} danger confirmLabel={L('استعادة', 'Restore')} onClose={() => setPending(null)} onConfirm={() => { setData(pending); toast(L('تمت الاستعادة', 'Restored')); onClose(); }} />}
  </Sheet>;
}

function Plan({ onClose }) {
  const { license, data, shop } = useApp();
  return <Sheet title={L('الاشتراك', 'Subscription')} onClose={onClose} size="lg">
    <div className="stack">
      <Alert tone={license.status === 'paid' ? 'green' : 'orange'} icon={CreditCard}>{license.status === 'paid'
        ? L(`مشترك (${plans.find(p => p.id === license.plan)?.name || license.plan}) — ${license.plan === 'lifetime' ? 'مدى الحياة' : `حتى ${new Date(license.until).toLocaleDateString(LOCALE)}`}`, `Subscribed (${plans.find(p => p.id === license.plan)?.name || license.plan}) — ${license.plan === 'lifetime' ? 'Lifetime' : `until ${new Date(license.until).toLocaleDateString(LOCALE)}`}`)
        : L(`فترة تجربة — باقٍ ${license.daysLeft} أيام`, `Free trial — ${plural(license.daysLeft, 'day', 'days')} left`)}</Alert>
      <div className="plans">{plans.map(plan => { const current = license.status === 'paid' && license.plan === plan.id; return <div key={plan.id} className={`plan ${current ? 'plan-current' : plan.best ? 'plan-best' : ''}`}>
        {(current || plan.best) && <span className="plan-tag">{current ? L('خطتك الحالية', 'Your current plan') : L('الأوفر', 'Best value')}</span>}
        <strong>{plan.name}</strong>
        <div className="plan-price">{plan.price.toLocaleString(LOCALE)} <small>{L('ر.ق', 'QAR')} {plan.period}</small></div>
        <p><Check size={14} /> {plan.note}</p>
        {current
          ? <Button variant="secondary" icon={Check} block disabled>{L('مفعّلة', 'Active')}{plan.id === 'lifetime' ? '' : L(` حتى ${new Date(license.until).toLocaleDateString(LOCALE)}`, ` until ${new Date(license.until).toLocaleDateString(LOCALE)}`)}</Button>
          : <Button variant={plan.best ? 'primary' : 'secondary'} block onClick={() => openExternal(buyLink(data.shopName || shop.name, plan))}>{license.status === 'paid' ? L('تغيير لهذه الخطة', 'Switch to this plan') : L('اشترك', 'Subscribe')}</Button>}
      </div>; })}</div>
      {cloudEnabled && <Section title={L('إضافات اختيارية (اشتراك منفصل)', 'Optional add-ons (separate subscription)')}>
        <div className="stack">{addons.map(a => <AddonOffer key={a.id} id={a.id} shopName={data.shopName || shop.name} />)}</div>
      </Section>}
    </div>
  </Sheet>;
}
