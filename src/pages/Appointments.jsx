import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Ban, BellRing, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight,
  ListPlus, MapPin, MessageCircle, Pencil, Phone, ShieldAlert, UserPlus, UserRoundCheck, UserX, WalletCards,
} from 'lucide-react';
import {
  addDays, appointmentTotal, availableSlots, balanceDue, buildItems, conflicts, dateLabel, depositPaid, fillTemplate, isPaid,
  localISO, money, needsDeposit, num, phoneDigits, samePhone, serviceNames, sortAppointments, statusText, timeLabel, uid, whatsappLink,
} from '../data.js';
import { noShowRisk, waitlistMatches } from '../smart.js';
import { Alert, Avatar, Badge, Button, Chips, Empty, Field, IconButton, Row, SearchBox, Sheet, Steps, openExternal, useApp } from '../ui.jsx';
import { CheckoutSheet } from './Checkout.jsx';

const dayStrip = (center, count = 14) => Array.from({ length: count }, (_, i) => addDays(center, i - 2));

export default function Appointments() {
  const { data, intent, setIntent, role, staffMember, can } = useApp();
  const [date, setDate] = useState(localISO());
  const [staffFilter, setStaffFilter] = useState(role === 'staff' && staffMember ? staffMember.id : 'all');
  const [open, setOpen] = useState(null);
  const [wizard, setWizard] = useState(null);
  const [startDay, setStartDay] = useState(localISO());

  useEffect(() => {
    if (intent?.create) setWizard({});
    if (intent?.open) { const a = data.appointments.find(x => x.id === intent.open); if (a) { setOpen(a.id); setDate(a.date); } }
    if (intent) setIntent(null);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const clients = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const list = data.appointments
    .filter(a => a.date === date && (staffFilter === 'all' || a.staffId === staffFilter || (a.items || []).some(i => i.staffId === staffFilter)))
    .sort(sortAppointments);
  const active = list.filter(a => a.status !== 'cancelled');
  const days = dayStrip(startDay);
  const counts = useMemo(() => {
    const map = {};
    for (const a of data.appointments) if (a.status !== 'cancelled') map[a.date] = (map[a.date] || 0) + 1;
    return map;
  }, [data.appointments]);
  const current = open && data.appointments.find(a => a.id === open);

  return <div className="stack">
    <div className="day-nav">
      <IconButton icon={ChevronRight} label="السابق" onClick={() => setStartDay(addDays(startDay, -7))} />
      <div className="day-strip">{days.map(d => <button type="button" key={d} className={`day ${d === date ? 'active' : ''} ${d === localISO() ? 'today' : ''}`} onClick={() => setDate(d)}>
        <small>{dateLabel(d, { weekday: 'short' })}</small><strong>{dateLabel(d, { day: 'numeric' })}</strong>{counts[d] ? <i>{counts[d]}</i> : <i className="empty-dot" />}
      </button>)}</div>
      <IconButton icon={ChevronLeft} label="التالي" onClick={() => setStartDay(addDays(startDay, 7))} />
    </div>

    <div className="page-head">
      <div><h2>{date === localISO() ? 'اليوم' : dateLabel(date)}</h2><small>{num(active.length)} مواعيد · {money(active.reduce((s, a) => s + appointmentTotal(a), 0))}</small></div>
      {can('appointments') && <Button icon={CalendarPlus} onClick={() => setWizard({ date })}>حجز</Button>}
    </div>

    {role !== 'staff' && data.staff.length > 1 && <Chips items={[{ id: 'all', label: 'الكل' }, ...data.staff.filter(s => s.active !== false).map(s => ({ id: s.id, label: s.name.split(' ')[0] }))]} value={staffFilter} onChange={setStaffFilter} />}

    {list.length ? <div className="timeline">{list.map(a => {
      const client = clients[a.clientId];
      return <button type="button" key={a.id} className={`slot slot-${a.status}`} onClick={() => setOpen(a.id)}>
        <span className="slot-time"><strong>{timeLabel(a.time)}</strong><small>{num(a.duration)}د</small></span>
        <span className="slot-body">
          <strong>{client?.name || 'عميل محذوف'}</strong>
          <small>{serviceNames(a)}</small>
          <span className="slot-tags">
            <Badge status={a.status} />
            {a.location === 'home' && <Badge tone="purple">منزلي</Badge>}
            {needsDeposit(a) && <Badge tone="red">عربون</Badge>}
            {a.source === 'online' && <Badge tone="blue">أونلاين</Badge>}
            {a.status === 'completed' && !isPaid(a) && <Badge tone="red">غير مدفوع</Badge>}
          </span>
        </span>
        <ChevronLeft size={18} className="muted" />
      </button>;
    })}</div> : <Empty icon={CalendarPlus} title="لا مواعيد في هذا اليوم" text="اضغط «حجز» لإضافة موعد جديد" />}

    {current && <AppointmentSheet appointment={current} onClose={() => setOpen(null)} onEdit={() => { setWizard({ edit: current }); setOpen(null); }} />}
    {wizard && <BookingWizard initial={wizard} onClose={() => setWizard(null)} onDone={a => { setWizard(null); setDate(a.date); }} />}
  </div>;
}

export function AppointmentSheet({ appointment: a, onClose, onEdit }) {
  const { data, patch, toast, logMessage, isManager, role, setData } = useApp();
  const [checkout, setCheckout] = useState(false);
  const [suggest, setSuggest] = useState(null);
  const client = data.clients.find(c => c.id === a.clientId);
  const staff = data.staff.find(s => s.id === a.staffId);
  const risk = client ? noShowRisk(client.id, data.appointments) : null;
  const vars = { name: client?.name?.split(' ')[0] || '', shop: data.shopName, date: dateLabel(a.date), time: timeLabel(a.time) };

  const setStatus = (status, message) => {
    patch('appointments', a.id, { status, ...(status === 'arrived' ? { arrivedAt: new Date().toISOString() } : {}) });
    toast(message);
    if (status === 'cancelled' || status === 'no_show') {
      const matches = waitlistMatches(data.waitlist, a);
      if (matches.length) { setSuggest(matches); return; }
    }
    if (status === 'completed' && balanceDue(a) > 0 && role !== 'staff') { setCheckout(true); return; }
    if (status !== 'completed') onClose();
  };
  const remind = () => {
    openExternal(whatsappLink(client?.phone, fillTemplate(data.settings.templates.reminder, vars)));
    logMessage('reminder', a.clientId, a.id);
    patch('appointments', a.id, { reminderSentAt: localISO() });
  };

  if (checkout) return <CheckoutSheet appointment={a} onClose={() => { setCheckout(false); onClose(); }} />;
  if (suggest) return <Sheet title="وقت متاح الآن!" subtitle={`${suggest.length} في قائمة الانتظار يناسبهم هذا الموعد`} onClose={onClose}>
    <div className="list">{suggest.map(w => {
      const c = data.clients.find(x => x.id === w.clientId);
      return <Row key={w.id} leading={<Avatar name={c?.name} />} title={c?.name} subtitle={w.note || (w.date ? dateLabel(w.date) : 'أي يوم')} trailing={<Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => {
        openExternal(whatsappLink(c?.phone, fillTemplate(data.settings.templates.waitlist, { ...vars, name: c?.name?.split(' ')[0] })));
        logMessage('waitlist', w.clientId, a.id);
        // ننقل الموعد الملغى للعميل من قائمة الانتظار مباشرة (يمكن تعديله لاحقاً).
        const id = uid();
        setData(prev => ({
          ...prev,
          waitlist: prev.waitlist.map(x => x.id === w.id ? { ...x, status: 'booked', appointmentId: id } : x),
          appointments: [...prev.appointments, { ...a, id, clientId: w.clientId, status: 'pending', payments: [], source: 'waitlist', createdAt: localISO(), reminderSentAt: '' }],
        }));
        toast('تم حجز الموعد لعميل قائمة الانتظار');
        onClose();
      }}>عرض</Button>} />;
    })}</div>
  </Sheet>;

  const total = appointmentTotal(a);
  return <Sheet title={client?.name || 'موعد'} subtitle={`${dateLabel(a.date)} · ${timeLabel(a.time)}`} onClose={onClose}
    footer={a.status !== 'cancelled' && a.status !== 'no_show' && <div className="action-grid">
      {a.status === 'pending' && <Button variant="secondary" icon={Check} onClick={() => setStatus('confirmed', 'تم تأكيد الموعد')}>تأكيد</Button>}
      {['pending', 'confirmed'].includes(a.status) && <Button variant="secondary" icon={UserRoundCheck} onClick={() => setStatus('arrived', 'تم تسجيل الوصول')}>وصل</Button>}
      {a.status !== 'completed' && <Button icon={CheckCircle2} onClick={() => setStatus('completed', 'تم إنهاء الموعد')}>إنهاء</Button>}
      {a.status === 'completed' && balanceDue(a) > 0 && role !== 'staff' && <Button icon={WalletCards} onClick={() => setCheckout(true)}>تحصيل {money(balanceDue(a))}</Button>}
    </div>}>
    <div className="stack">
      <div className="detail-head">
        <Avatar name={client?.name} size="lg" />
        <div><Badge status={a.status} /> {risk?.level === 'high' && <Badge tone="red">{risk.label}</Badge>}</div>
      </div>
      <div className="list">
        {(a.items || []).map((item, i) => <Row key={i} title={item.name} subtitle={`${num(item.duration)} دقيقة${item.processing ? ` · منها ${num(item.processing)} انتظار` : ''}${item.staffId ? ` · ${data.staff.find(s => s.id === item.staffId)?.name || ''}` : ''}`} trailing={<strong>{money(item.price)}</strong>} />)}
        {Number(a.discount) > 0 && <Row title="خصم" trailing={<strong className="green">−{money(a.discount)}</strong>} />}
        <Row title="الإجمالي" trailing={<strong>{money(total)}</strong>} />
        {Number(a.deposit) > 0 && <Row title="العربون" subtitle={depositPaid(a) >= a.deposit ? 'مدفوع' : 'لم يُدفع بعد'} trailing={<strong className={depositPaid(a) >= a.deposit ? 'green' : 'red'}>{money(a.deposit)}</strong>} />}
        {a.location === 'home' && <Row leading={<MapPin size={18} />} title="خدمة منزلية" subtitle={a.address || 'بدون عنوان'} />}
        {staff && <Row leading={<Avatar name={staff.name} size="sm" />} title={staff.name} subtitle={staff.role} />}
        {a.notes && <Row title="ملاحظات" subtitle={a.notes} />}
        {client?.allergies && <Row tone="red" leading={<ShieldAlert size={18} />} title="تنبيه حساسية" subtitle={client.allergies} />}
      </div>
      {client && <div className="action-row">
        <Button variant="ghost" icon={BellRing} onClick={remind}>تذكير واتساب</Button>
        <Button variant="ghost" icon={Phone} onClick={() => openExternal(`tel:${phoneDigits(client.phone)}`)}>اتصال</Button>
        {needsDeposit(a) && <Button variant="ghost" icon={WalletCards} onClick={() => setCheckout(true)}>استلام العربون</Button>}
      </div>}
      {a.status !== 'cancelled' && a.status !== 'completed' && <div className="action-row">
        <Button variant="ghost" icon={Pencil} onClick={onEdit}>تعديل</Button>
        <Button variant="ghost" icon={UserX} onClick={() => setStatus('no_show', `تم تسجيل عدم الحضور`)}>لم يحضر</Button>
        <Button variant="danger-ghost" icon={Ban} onClick={() => setStatus('cancelled', 'تم إلغاء الموعد')}>إلغاء</Button>
      </div>}
      {(a.status === 'cancelled' || a.status === 'no_show') && isManager && <Button variant="ghost" onClick={() => { patch('appointments', a.id, { status: 'pending' }); toast('تمت إعادة الموعد'); }}>إعادة تفعيل الموعد</Button>}
      <small className="muted center">{statusText[a.status]} · {a.source === 'online' ? 'حجز أونلاين' : a.source === 'whatsapp' ? 'حجز عبر واتساب' : a.source === 'waitlist' ? 'من قائمة الانتظار' : 'من التطبيق'}{a.reminderSentAt ? ' · أُرسل تذكير' : ''}</small>
    </div>
  </Sheet>;
}

/* ───────────── معالج الحجز: ٤ خطوات بسيطة ───────────── */

export function BookingWizard({ initial, onClose, onDone }) {
  const { data, setData, toast, vocab, role, staffMember } = useApp();
  const edit = initial.edit;
  const [step, setStep] = useState(edit ? 1 : initial.clientId ? 1 : 0);
  const [clientId, setClientId] = useState(edit?.clientId || initial.clientId || '');
  const [serviceIds, setServiceIds] = useState(edit ? (edit.items || []).map(i => i.serviceId) : []);
  const [staffId, setStaffId] = useState(edit?.staffId || (role === 'staff' ? staffMember?.id || '' : ''));
  const [date, setDate] = useState(edit?.date || initial.date || localISO());
  const [time, setTime] = useState(edit?.time || '');
  const [location, setLocation] = useState(edit?.location || 'salon');
  const [address, setAddress] = useState(edit?.address || '');
  const [notes, setNotes] = useState(edit?.notes || '');
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');
  const client = data.clients.find(c => c.id === clientId);
  const items = buildItems(data.services, serviceIds, staffId);
  const total = items.reduce((s, i) => s + i.price, 0);
  const duration = items.reduce((s, i) => s + i.duration, 0);
  const risk = client ? noShowRisk(client.id, data.appointments) : null;
  const serviceDeposit = buildItems(data.services, serviceIds).reduce((s, i) => s + Number(data.services.find(x => x.id === i.serviceId)?.deposit || 0), 0);
  const riskDeposit = risk?.level === 'high' ? Math.round(total * Number(data.settings.noShowDepositPercent || 30) / 100) : 0;
  const [deposit, setDeposit] = useState(edit?.deposit ?? null);
  const finalDeposit = deposit ?? Math.max(serviceDeposit, riskDeposit);
  const others = data.appointments.filter(a => a.id !== edit?.id);
  const slots = useMemo(() => items.length ? availableSlots(others, { date, items, staffId, settings: data.settings, location }) : [], [date, serviceIds.join(), staffId, location, data.appointments]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = [...new Set(data.services.map(s => s.category || 'عام'))];
  const pkg = client && data.clientPackages.find(p => p.clientId === client.id && p.used < p.total && serviceIds.includes(p.serviceId) && (!p.expiresAt || p.expiresAt >= localISO()));

  const save = () => {
    const record = {
      ...(edit || {}), id: edit?.id || uid(), clientId, items, staffId, date, time, duration, price: total, location,
      address: location === 'home' ? address : '', travel: location === 'home' ? 30 : 0, notes: notes.trim(), deposit: finalDeposit,
      status: edit?.status || 'confirmed', payments: edit?.payments || [], discount: edit?.discount || 0, source: edit?.source || 'app', createdAt: edit?.createdAt || localISO(),
    };
    const clash = conflicts(others, record);
    if (clash.length) { setError(`يتعارض مع موعد ${data.clients.find(c => c.id === clash[0].clientId)?.name || ''} الساعة ${timeLabel(clash[0].time)}`); return; }
    setData(prev => ({ ...prev, appointments: edit ? prev.appointments.map(a => a.id === edit.id ? record : a) : [...prev.appointments, record] }));
    toast(edit ? 'تم تحديث الموعد' : 'تم الحجز ✓');
    onDone(record);
  };

  const steps = [vocab.client, 'الخدمات', 'الوقت', 'تأكيد'];
  const canNext = [Boolean(clientId), serviceIds.length > 0, Boolean(time), true][step];
  return <Sheet title={edit ? 'تعديل الموعد' : 'حجز جديد'} onClose={onClose} size="lg"
    footer={<>
      {step > 0 && <Button variant="ghost" icon={ArrowRight} onClick={() => setStep(step - 1)}>رجوع</Button>}
      <div className="spacer" />
      {step < 3 ? <Button disabled={!canNext} icon={ArrowLeft} onClick={() => setStep(step + 1)}>التالي</Button> : <Button icon={Check} onClick={save}>{edit ? 'حفظ' : 'تأكيد الحجز'}</Button>}
    </>}>
    <Steps steps={steps} current={step} />

    {step === 0 && <ClientPicker value={clientId} onChange={id => { setClientId(id); setStep(1); }} />}

    {step === 1 && <div className="stack">
      {categories.length > 1 && <Chips items={[{ id: 'all', label: 'الكل' }, ...categories.map(c => ({ id: c, label: c }))]} value={category} onChange={setCategory} />}
      <div className="service-grid">{data.services.filter(s => category === 'all' || (s.category || 'عام') === category).map(s => {
        const on = serviceIds.includes(s.id);
        return <button type="button" key={s.id} className={`service-card ${on ? 'active' : ''}`} onClick={() => { setServiceIds(on ? serviceIds.filter(x => x !== s.id) : [...serviceIds, s.id]); setTime(''); }}>
          {on && <span className="check"><Check size={14} /></span>}
          <strong>{s.name}</strong><small>{num(s.duration)} دقيقة</small><b>{money(s.price)}</b>
        </button>;
      })}</div>
      {items.length > 0 && <div className="summary-bar"><span>{items.length} خدمات · {num(duration)} دقيقة</span><strong>{money(total)}</strong></div>}
      {pkg && <Alert tone="green" icon={Check}>لدى {client.name} باقة «{pkg.name}» — متبقٍ {pkg.total - pkg.used} جلسات (تُخصم عند الدفع)</Alert>}
    </div>}

    {step === 2 && <div className="stack">
      {data.staff.length > 0 && role !== 'staff' && <Field label={`${vocab.pro} (اختياري)`}><Chips items={[{ id: '', label: 'أي شخص متاح' }, ...data.staff.filter(s => s.active !== false).map(s => ({ id: s.id, label: s.name.split(' ')[0] }))]} value={staffId} onChange={v => { setStaffId(v); setTime(''); }} /></Field>}
      {data.settings.kind !== 'men' || location === 'home' ? <Field label="مكان الخدمة"><Chips items={[{ id: 'salon', label: 'في الصالون' }, { id: 'home', label: 'منزلية' }]} value={location} onChange={v => { setLocation(v); setTime(''); }} /></Field> : null}
      {location === 'home' && <Field label="العنوان"><input value={address} onChange={e => setAddress(e.target.value)} placeholder="المنطقة، الشارع، رقم المبنى" /></Field>}
      <div className="day-strip day-strip-wide">{Array.from({ length: 14 }, (_, i) => addDays(localISO(), i)).map(d => <button type="button" key={d} className={`day ${d === date ? 'active' : ''}`} onClick={() => { setDate(d); setTime(''); }}>
        <small>{dateLabel(d, { weekday: 'short' })}</small><strong>{dateLabel(d, { day: 'numeric' })}</strong>
      </button>)}</div>
      {slots.length ? <div className="slots">{slots.map(t => <button type="button" key={t} className={`time ${t === time ? 'active' : ''}`} onClick={() => setTime(t)}>{timeLabel(t)}</button>)}</div>
        : <Empty icon={CalendarPlus} title="لا أوقات متاحة" text="جرّب يوماً آخر أو موظفاً آخر — أو أضفه لقائمة الانتظار" action={client && <WaitlistButton clientId={client.id} serviceId={serviceIds[0]} staffId={staffId} date={date} onDone={onClose} />} />}
    </div>}

    {step === 3 && <div className="stack">
      <div className="confirm-card">
        <Avatar name={client?.name} size="lg" />
        <strong>{client?.name}</strong>
        <span>{dateLabel(date)} · {timeLabel(time)}</span>
        <small>{items.map(i => i.name).join(' + ')} · {num(duration)} دقيقة</small>
        <b>{money(total)}</b>
      </div>
      {risk?.level === 'high' && <Alert tone="orange" icon={ShieldAlert}>{client.name} لم يحضر {risk.stats.noShows} مرات سابقاً — ننصح بعربون</Alert>}
      <Field label="العربون المطلوب" hint={finalDeposit ? 'يُسجَّل عند الاستلام من شاشة الموعد' : 'بدون عربون'}><div className="money-input"><input type="number" min="0" inputMode="decimal" value={finalDeposit} onChange={e => setDeposit(Number(e.target.value))} /><span>ر.ق</span></div></Field>
      <Field label="ملاحظات (اختياري)"><textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي تفاصيل للفريق..." /></Field>
      <Alert>{error}</Alert>
    </div>}
  </Sheet>;
}

function WaitlistButton({ clientId, serviceId, staffId, date, onDone }) {
  const { upsert, toast } = useApp();
  return <Button variant="secondary" icon={ListPlus} onClick={() => {
    upsert('waitlist', { id: uid(), clientId, serviceId: serviceId || '', staffId, date, status: 'waiting', createdAt: localISO() });
    toast('أُضيف لقائمة الانتظار — سننبهك عند أي إلغاء');
    onDone();
  }}>أضف لقائمة الانتظار</Button>;
}

export function ClientPicker({ value, onChange }) {
  const { data, upsert, vocab } = useApp();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const q = query.trim();
  const matches = data.clients.filter(c => !q || c.name.includes(q) || phoneDigits(c.phone).includes(phoneDigits(q) || '@')).slice(0, 30);
  const recent = q ? matches : [...new Map(data.appointments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(a => [a.clientId, data.clients.find(c => c.id === a.clientId)]).filter(([, c]) => c)).values()].slice(0, 8);
  const shown = q ? matches : recent.length ? recent : matches;

  const add = () => {
    if (!name.trim() || phoneDigits(phone).length < 7) { setError('أدخل الاسم ورقماً صحيحاً'); return; }
    const existing = data.clients.find(c => samePhone(c.phone, phone));
    if (existing) { onChange(existing.id); return; }
    const id = uid();
    upsert('clients', { id, name: name.trim(), phone: phone.trim(), notes: '', createdAt: localISO() });
    onChange(id);
  };

  if (adding) return <div className="stack">
    <Field label="الاسم" required><input autoFocus value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="رقم الهاتف" required><input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5555 1234" /></Field>
    <Alert>{error}</Alert>
    <div className="row-buttons"><Button variant="ghost" onClick={() => setAdding(false)}>رجوع</Button><Button icon={Check} onClick={add}>حفظ ومتابعة</Button></div>
  </div>;

  return <div className="stack">
    <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الرقم" />
    <Button variant="secondary" icon={UserPlus} block onClick={() => { setAdding(true); if (/\d/.test(q)) setPhone(q); else setName(q); }}>{vocab.newClient}</Button>
    {!q && recent.length > 0 && <small className="muted">آخر العملاء</small>}
    <div className="list">{shown.map(c => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={<span dir="ltr">{c.phone}</span>} trailing={value === c.id ? <Check className="green" size={20} /> : null} onClick={() => onChange(c.id)} />)}</div>
  </div>;
}

