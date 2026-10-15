import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Ban, BellRing, CalendarOff, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  ListPlus, MapPin, MessageCircle, Pencil, Phone, ShieldAlert, UserPlus, UserRoundCheck, UserX, WalletCards,
} from 'lucide-react';
import {
  addDays, appointmentTotal, availableSlots, balanceDue, buildItems, bookingClash, appointmentOwner, clientName, dateLabel, dateFor, depositPaid, fillTemplate, shortName, isPaid, isStaffOff, messageFor, timeFor,
  localISO, money, needsDeposit, num, phoneDigits, samePhone, serviceNames, sortAppointments, statusText, timeLabel, uid, whatsappLink,
} from '../data.js';
import { noShowRisk, waitlistMatches } from '../smart.js';
import { Alert, Avatar, Badge, Button, Chips, Empty, Field, IconButton, Row, SearchBox, Sheet, Steps, openExternal, useApp, NumInput } from '../ui.jsx';
import { CheckoutSheet } from './Checkout.jsx';
import { L, isEn } from '../i18n.js';

// الأسهم تتبع اتجاه اللغة (يمين لليسار في العربية).
const NextArrow = isEn ? ArrowRight : ArrowLeft;
const BackArrow = isEn ? ArrowLeft : ArrowRight;
const NextChevron = isEn ? ChevronRight : ChevronLeft;
const PrevChevron = isEn ? ChevronLeft : ChevronRight;

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
    if (intent?.walkIn) setWizard({ walkIn: true });
    if (intent?.open) { setPendingOpen(intent.open); if (intent.date) setDate(intent.date); }
    if (intent) setIntent(null);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps
  // فتح موعد من إشعار: قد يصل قبل مزامنة الحجز (التطبيق كان مغلقاً) فننتظر ظهوره.
  const [pendingOpen, setPendingOpen] = useState(null);
  useEffect(() => {
    if (!pendingOpen) return;
    const a = data.appointments.find(x => x.id === pendingOpen);
    if (a) { setOpen(a.id); setDate(a.date); setPendingOpen(null); }
  }, [pendingOpen, data.appointments]);

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
    <small className="strip-month">{dateLabel(date, { month: 'long', year: 'numeric' })}</small>
    <div className="day-nav">
      <IconButton icon={PrevChevron} label={L('السابق', 'Previous')} onClick={() => setStartDay(addDays(startDay, -7))} />
      <div className="day-strip">{days.map(d => <button type="button" key={d} className={`day ${d === date ? 'active' : ''} ${d === localISO() ? 'today' : ''}`} onClick={() => setDate(d)}>
        <small>{dateLabel(d, { weekday: 'short' })}</small><strong>{dateLabel(d, { day: 'numeric' })}</strong>{counts[d] ? <i>{num(counts[d])}</i> : <i className="empty-dot" aria-label={L('لا حجوزات', 'No bookings')}><CalendarOff size={14} /></i>}
      </button>)}</div>
      <IconButton icon={NextChevron} label={L('التالي', 'Next')} onClick={() => setStartDay(addDays(startDay, 7))} />
    </div>

    <div className="page-head">
      <div><h2>{date === localISO() ? L('اليوم', 'Today') : dateLabel(date)}</h2><small>{num(active.length)} {L('مواعيد', active.length === 1 ? 'appointment' : 'appointments')} · {money(active.reduce((s, a) => s + appointmentTotal(a), 0))}</small></div>
      {can('appointments') && <div className="row-buttons">
        {date === localISO() && <Button variant="secondary" icon={UserRoundCheck} onClick={() => setWizard({ walkIn: true })}>{L('حاضر الآن', 'Walk-in')}</Button>}
        <Button icon={CalendarPlus} onClick={() => setWizard({ date })}>{L('حجز', 'Book')}</Button>
      </div>}
    </div>

    {role !== 'staff' && data.staff.length > 1 && <Chips items={[{ id: 'all', label: L('الكل', 'All') }, ...data.staff.filter(s => s.active !== false).map(s => ({ id: s.id, label: shortName(data.staff, s) }))]} value={staffFilter} onChange={setStaffFilter} />}

    {list.length ? <div className="timeline">{list.map(a => {
      const client = clients[a.clientId];
      return <button type="button" key={a.id} className={`slot slot-${a.status}`} onClick={() => setOpen(a.id)}>
        <span className="slot-time"><strong>{timeLabel(a.time)}</strong><small>{num(a.duration)}{L('د', 'm')}</small></span>
        <span className="slot-body">
          <strong>{client?.name || L('عميل محذوف', 'Deleted client')}</strong>
          <small>{serviceNames(a)}</small>
          <span className="slot-tags">
            <Badge status={a.status} />
            {a.location === 'home' && <Badge tone="purple">{L('منزلي', 'Home')}</Badge>}
            {needsDeposit(a) && <Badge tone="red">{L('عربون', 'Deposit')}</Badge>}
            {a.source === 'online' && <Badge tone="blue">{L('أونلاين', 'Online')}</Badge>}
            {a.status === 'completed' && !isPaid(a) && <Badge tone="red">{L('غير مدفوع', 'Unpaid')}</Badge>}
          </span>
        </span>
        <NextChevron size={18} className="muted" />
      </button>;
    })}</div> : <Empty icon={CalendarPlus} title={L('لا مواعيد في هذا اليوم', 'No appointments this day')} text={L('اضغط «حجز» لإضافة موعد جديد', 'Tap “Book” to add a new appointment')} />}

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
    openExternal(whatsappLink(client?.phone, fillTemplate(messageFor(data.settings, 'reminder', client), { ...vars, date: dateFor(client, a.date), time: timeFor(client, a.time) })));
    logMessage('reminder', a.clientId, a.id);
    patch('appointments', a.id, { reminderSentAt: localISO() });
  };

  if (checkout) return <CheckoutSheet appointment={a} onClose={() => { setCheckout(false); onClose(); }} />;
  if (suggest) return <Sheet title={L('وقت متاح الآن!', 'A slot just opened up!')} subtitle={L(`${suggest.length} في قائمة الانتظار يناسبهم هذا الموعد`, `${suggest.length} on the waitlist ${suggest.length === 1 ? 'fits' : 'fit'} this slot`)} onClose={onClose}>
    <div className="list">{suggest.map(w => {
      const c = data.clients.find(x => x.id === w.clientId);
      return <Row key={w.id} leading={<Avatar name={c?.name} />} title={c?.name} subtitle={w.note || (w.date ? dateLabel(w.date) : L('أي يوم', 'Any day'))} trailing={<Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => {
        openExternal(whatsappLink(c?.phone, fillTemplate(messageFor(data.settings, 'waitlist', c), { ...vars, name: c?.name?.split(' ')[0], date: dateFor(c, a.date), time: timeFor(c, a.time) })));
        logMessage('waitlist', w.clientId, a.id);
        // ننقل الموعد الملغى للعميل من قائمة الانتظار مباشرة (يمكن تعديله لاحقاً).
        const id = uid();
        setData(prev => ({
          ...prev,
          waitlist: prev.waitlist.map(x => x.id === w.id ? { ...x, status: 'booked', appointmentId: id } : x),
          appointments: [...prev.appointments, { ...a, id, clientId: w.clientId, status: 'pending', payments: [], source: 'waitlist', createdAt: localISO(), reminderSentAt: '' }],
        }));
        toast(L('تم حجز الموعد لعميل قائمة الانتظار', 'Appointment booked for the waitlisted client'));
        onClose();
      }}>{L('عرض', 'Offer')}</Button>} />;
    })}</div>
  </Sheet>;

  const total = appointmentTotal(a);
  return <Sheet title={a.clientId ? clientName(data.clients, a.clientId) : L('موعد', 'Appointment')} subtitle={`${dateLabel(a.date)} · ${timeLabel(a.time)}`} onClose={onClose}
    footer={a.status !== 'cancelled' && a.status !== 'no_show' && <div className="action-grid">
      {a.status === 'pending' && <Button variant="secondary" icon={Check} onClick={() => setStatus('confirmed', L('تم تأكيد الموعد', 'Appointment confirmed'))}>{L('تأكيد', 'Confirm')}</Button>}
      {['pending', 'confirmed'].includes(a.status) && <Button variant="secondary" icon={UserRoundCheck} onClick={() => setStatus('arrived', L('تم تسجيل الوصول', 'Checked in'))}>{L('وصل', 'Arrived')}</Button>}
      {a.status !== 'completed' && <Button icon={CheckCircle2} onClick={() => setStatus('completed', L('تم إنهاء الموعد', 'Appointment completed'))}>{L('إنهاء', 'Complete')}</Button>}
      {a.status === 'completed' && balanceDue(a) > 0 && role !== 'staff' && <Button icon={WalletCards} onClick={() => setCheckout(true)}>{L('تحصيل', 'Collect')} {money(balanceDue(a))}</Button>}
    </div>}>
    <div className="stack">
      <div className="detail-head">
        <Avatar name={client?.name} size="lg" />
        <div><Badge status={a.status} /> {risk?.level === 'high' && <Badge tone="red">{risk.label}</Badge>}</div>
      </div>
      <div className="list">
        {(a.items || []).map((item, i) => <Row key={i} title={item.name} subtitle={`${num(item.duration)} ${L('دقيقة', 'min')}${item.processing ? L(` · منها ${num(item.processing)} انتظار`, ` · incl. ${num(item.processing)} processing`) : ''}${item.staffId ? ` · ${data.staff.find(s => s.id === item.staffId)?.name || ''}` : ''}`} trailing={<strong>{money(item.price)}</strong>} />)}
        {Number(a.discount) > 0 && <Row title={L('خصم', 'Discount')} trailing={<strong className="green">−{money(a.discount)}</strong>} />}
        <Row title={L('الإجمالي', 'Total')} trailing={<strong>{money(total)}</strong>} />
        {Number(a.deposit) > 0 && <Row title={L('العربون', 'Deposit')} subtitle={depositPaid(a) >= a.deposit ? L('مدفوع', 'Paid') : L('لم يُدفع بعد', 'Not paid yet')} trailing={<strong className={depositPaid(a) >= a.deposit ? 'green' : 'red'}>{money(a.deposit)}</strong>} />}
        {a.location === 'home' && <Row leading={<MapPin size={18} />} title={L('خدمة منزلية', 'Home service')} subtitle={a.address || L('بدون عنوان', 'No address')} />}
        {staff && <Row leading={<Avatar name={staff.name} size="sm" />} title={staff.name} subtitle={staff.role} />}
        {a.notes && <Row title={L('ملاحظات', 'Notes')} subtitle={a.notes} />}
        {client?.allergies && <Row tone="red" leading={<ShieldAlert size={18} />} title={L('تنبيه حساسية', 'Allergy alert')} subtitle={client.allergies} />}
      </div>
      {client && <div className="action-row">
        <Button variant="ghost" icon={BellRing} onClick={remind}>{L('تذكير واتساب', 'Whats reminder')}</Button>
        <Button variant="ghost" icon={Phone} onClick={() => openExternal(`tel:${phoneDigits(client.phone)}`)}>{L('اتصال', 'Call')}</Button>
        {needsDeposit(a) && <Button variant="ghost" icon={WalletCards} onClick={() => setCheckout(true)}>{L('استلام العربون', 'Take deposit')}</Button>}
      </div>}
      {a.status !== 'cancelled' && a.status !== 'completed' && <div className="action-row">
        <Button variant="ghost" icon={Pencil} onClick={onEdit}>{L('تعديل', 'Edit')}</Button>
        <Button variant="ghost" icon={UserX} onClick={() => setStatus('no_show', L(`تم تسجيل عدم الحضور`, 'Marked as no-show'))}>{L('لم يحضر', 'No-show')}</Button>
        <Button variant="danger-ghost" icon={Ban} onClick={() => setStatus('cancelled', L('تم إلغاء الموعد', 'Appointment cancelled'))}>{L('إلغاء', 'Cancel')}</Button>
      </div>}
      {(a.status === 'cancelled' || a.status === 'no_show') && isManager && <Button variant="ghost" onClick={() => { patch('appointments', a.id, { status: 'pending' }); toast(L('تمت إعادة الموعد', 'Appointment restored')); }}>{L('إعادة تفعيل الموعد', 'Reactivate appointment')}</Button>}
      <small className="muted center">{statusText[a.status]} · {a.source === 'online' ? L('حجز أونلاين', 'Online booking') : a.source === 'whatsapp' ? L('حجز عبر واتساب', 'Booked via WhatsApp') : a.source === 'waitlist' ? L('من قائمة الانتظار', 'From waitlist') : L('من التطبيق', 'From the app')}{a.reminderSentAt ? L(' · أُرسل تذكير', ' · Reminder sent') : ''}</small>
    </div>
  </Sheet>;
}

/* ───────────── معالج الحجز: ٤ خطوات بسيطة ───────────── */

export function BookingWizard({ initial, onClose, onDone }) {
  const { data, setData, toast, vocab, role, staffMember } = useApp();
  const edit = initial.edit;
  const walkIn = Boolean(initial.walkIn);
  const nowTime = () => { const d = new Date(); const m = d.getHours() * 60 + d.getMinutes(); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60 - (m % 5)).padStart(2, '0')}`; };
  const [step, setStep] = useState(edit ? 1 : initial.clientId ? 1 : 0);
  const [clientId, setClientId] = useState(edit?.clientId || initial.clientId || '');
  const [serviceIds, setServiceIds] = useState(edit ? (edit.items || []).map(i => i.serviceId) : []);
  const [staffId, setStaffId] = useState(edit?.staffId || (role === 'staff' ? staffMember?.id || '' : ''));
  const [date, setDate] = useState(edit?.date || initial.date || localISO());
  const [time, setTime] = useState(edit?.time || (walkIn ? nowTime() : ''));
  const [location, setLocation] = useState(edit?.location || 'salon');
  const [address, setAddress] = useState(edit?.address || '');
  const [notes, setNotes] = useState(edit?.notes || '');
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');
  const [clash, setClash] = useState(null);
  const [editTime, setEditTime] = useState(false);
  const clashRef = useRef(null);
  useEffect(() => { if (clash) clashRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [clash]);
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
  const slots = useMemo(() => items.length ? availableSlots(others, { date, items, staffId, settings: data.settings, location, staff: data.staff }) : [], [date, serviceIds.join(), staffId, location, data.appointments, data.staff]); // eslint-disable-line react-hooks/exhaustive-deps
  // انتهى دوام اليوم (أو امتلأ): ننتقل تلقائياً لأقرب يوم فيه أوقات متاحة.
  const [movedFrom, setMovedFrom] = useState('');
  useEffect(() => {
    if (edit || movedFrom || !items.length || slots.length || date !== localISO()) return;
    const next = Array.from({ length: 13 }, (_, i) => addDays(date, i + 1))
      .find(d => availableSlots(others, { date: d, items, staffId, settings: data.settings, location, staff: data.staff }).length);
    if (next) { setMovedFrom(date); setDate(next); setTime(''); }
  }, [slots.length, date, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setClash(null), [staffId, time, date]);
  const staffName = id => data.staff.find(m => m.id === id)?.name;
  // الموعد المتعارض انتهى فعلاً ولم يُسجَّل: نعلّمه مكتملاً ونعيد فحص التعارض.
  const markDone = c => {
    setData(prev => ({ ...prev, appointments: prev.appointments.map(x => x.id === c.id ? { ...x, status: 'completed' } : x) }));
    const after = bookingClash(others.map(x => x.id === c.id ? { ...x, status: 'completed' } : x), { ...clash.candidate }, data.staff);
    setClash(after.blocking ? { ...after, candidate: clash.candidate } : null);
    toast(L(`تم إنهاء موعد ${clientName(data.clients, c.clientId)}`, `${clientName(data.clients, c.clientId)} marked as done`));
  };
  const categories = [...new Set(data.services.map(s => s.category || L('عام', 'General')))];
  const pkg = client && data.clientPackages.find(p => p.clientId === client.id && p.used < p.total && serviceIds.includes(p.serviceId) && (!p.expiresAt || p.expiresAt >= localISO()));

  const save = (force = false) => {
    if (!time) { setError(L('اختر وقت الموعد', 'Choose an appointment time')); return; }
    const record = {
      ...(edit || {}), id: edit?.id || uid(), clientId, items, staffId, date, time, duration, price: total, location,
      address: location === 'home' ? address : '', travel: location === 'home' ? 30 : 0, notes: notes.trim(), deposit: finalDeposit,
      status: edit?.status || (walkIn ? 'arrived' : 'confirmed'), payments: edit?.payments || [], discount: edit?.discount || 0, source: edit?.source || (walkIn ? 'walkin' : 'app'), createdAt: edit?.createdAt || localISO(),
      ...(walkIn ? { arrivedAt: new Date().toISOString() } : {}),
    };
    // الصالون فيه أكثر من موظف: التعارض يُعرض فقط إذا لم يبق أحد متاح، مع خيار التعديل أو التجاهل.
    const check = bookingClash(others, record, data.staff);
    if (check.blocking && !force) { setClash({ ...check, candidate: record }); setError(''); return; }
    setData(prev => ({ ...prev, appointments: edit ? prev.appointments.map(a => a.id === edit.id ? record : a) : [...prev.appointments, record] }));
    toast(edit ? L('تم تحديث الموعد', 'Appointment updated') : walkIn ? L('تم تسجيل الزبون الحاضر ✓', 'Walk-in checked in ✓') : L('تم الحجز ✓', 'Booked ✓'));
    onDone(record);
  };

  // الزبون الحاضر بدون موعد: نتخطى خطوة الوقت (الآن) ونختار الحلاق في التأكيد.
  const keys = walkIn ? ['client', 'services', 'confirm'] : ['client', 'services', 'time', 'confirm'];
  const key = keys[step];
  const steps = walkIn ? [vocab.client, L('الخدمات', 'Services'), L('تأكيد', 'Confirm')] : [vocab.client, L('الخدمات', 'Services'), L('الوقت', 'Time'), L('تأكيد', 'Confirm')];
  const canNext = { client: Boolean(clientId), services: serviceIds.length > 0, time: Boolean(time), confirm: true }[key];
  const last = step === keys.length - 1;
  return <Sheet title={edit ? L('تعديل الموعد', 'Edit appointment') : walkIn ? L('زبون حاضر الآن', 'Walk-in client') : L('حجز جديد', 'New booking')} onClose={onClose} size="lg"
    footer={<>
      {step > 0 && <Button variant="ghost" icon={BackArrow} onClick={() => setStep(step - 1)}>{L('رجوع', 'Back')}</Button>}
      <div className="spacer" />
      {!last ? <Button disabled={!canNext} icon={NextArrow} onClick={() => setStep(step + 1)}>{L('التالي', 'Next')}</Button> : <Button icon={Check} onClick={() => save()}>{edit ? L('حفظ', 'Save') : walkIn ? L('ابدأ الخدمة', 'Start service') : L('تأكيد الحجز', 'Confirm booking')}</Button>}
    </>}>
    <Steps steps={steps} current={step} />

    {key === 'client' && <ClientPicker walkIn={walkIn} value={clientId} onChange={id => { setClientId(id); setStep(1); }} />}

    {key === 'services' && <div className="stack">
      {categories.length > 1 && <Chips items={[{ id: 'all', label: L('الكل', 'All') }, ...categories.map(c => ({ id: c, label: c }))]} value={category} onChange={setCategory} />}
      <div className="service-grid">{data.services.filter(s => category === 'all' || (s.category || L('عام', 'General')) === category).map(s => {
        const on = serviceIds.includes(s.id);
        return <button type="button" key={s.id} className={`service-card ${on ? 'active' : ''}`} onClick={() => { setServiceIds(on ? serviceIds.filter(x => x !== s.id) : [...serviceIds, s.id]); if (!walkIn) setTime(''); }}>
          {on && <span className="check"><Check size={14} /></span>}
          <strong>{s.name}</strong><small>{num(s.duration)} {L('دقيقة', 'min')}</small><b>{money(s.price)}</b>
        </button>;
      })}</div>
      {items.length > 0 && <div className="summary-bar"><span>{L(`${items.length} خدمات`, `${items.length} ${items.length === 1 ? 'service' : 'services'}`)} · {num(duration)} {L('دقيقة', 'min')}</span><strong>{money(total)}</strong></div>}
      {pkg && <Alert tone="green" icon={Check}>{L(<>لدى {client.name} باقة «{pkg.name}» — متبقٍ {pkg.total - pkg.used} جلسات (تُخصم عند الدفع)</>, <>{client.name} has the “{pkg.name}” package — {pkg.total - pkg.used} {pkg.total - pkg.used === 1 ? 'session' : 'sessions'} left (deducted at checkout)</>)}</Alert>}
    </div>}

    {key === 'time' && <div className="stack">
      {data.staff.length > 0 && role !== 'staff' && <Field label={L(`${vocab.pro} (اختياري)`, `${vocab.pro} (optional)`)}><Chips items={[{ id: '', label: L('أي شخص متاح', 'Anyone available') }, ...data.staff.filter(s => s.active !== false && (s.id === staffId || !isStaffOff(s, date))).map(s => ({ id: s.id, label: shortName(data.staff, s) }))]} value={staffId} onChange={v => { setStaffId(v); setTime(''); }} /></Field>}
      {data.settings.kind !== 'men' || location === 'home' ? <Field label={L('مكان الخدمة', 'Service location')}><Chips items={[{ id: 'salon', label: L('في الصالون', 'In salon') }, { id: 'home', label: L('منزلية', 'At home') }]} value={location} onChange={v => { setLocation(v); setTime(''); }} /></Field> : null}
      {location === 'home' && <Field label={L('العنوان', 'Address')}><input value={address} onChange={e => setAddress(e.target.value)} placeholder={L('المنطقة، الشارع، رقم المبنى', 'Area, street, building no.')} /></Field>}
      {movedFrom && date !== movedFrom && <Alert tone="blue" icon={CalendarPlus}>{L('لا أوقات متبقية اليوم — عرضنا أقرب يوم متاح', 'No times left today — showing the next available day')}</Alert>}
      <small className="strip-month">{dateLabel(date, { month: 'long', year: 'numeric' })}</small>
      <div className="day-strip day-strip-wide">{Array.from({ length: 14 }, (_, i) => addDays(localISO(), i)).map(d => <button type="button" key={d} className={`day ${d === date ? 'active' : ''}`} onClick={() => { setDate(d); setTime(''); }}>
        <small>{dateLabel(d, { weekday: 'short' })}</small><strong>{dateLabel(d, { day: 'numeric' })}</strong>
      </button>)}</div>
      {slots.length ? <div className="slots">{slots.map(t => <button type="button" key={t} className={`time ${t === time ? 'active' : ''}`} onClick={() => setTime(t)}>{timeLabel(t)}</button>)}</div>
        : <Empty icon={CalendarPlus} title={L('لا أوقات متاحة', 'No available times')} text={L('جرّب يوماً آخر أو موظفاً آخر — أو أضفه لقائمة الانتظار', 'Try another day or staff member — or add to the waitlist')} action={client && <WaitlistButton clientId={client.id} serviceId={serviceIds[0]} staffId={staffId} date={date} onDone={onClose} />} />}
    </div>}

    {key === 'confirm' && <div className="stack">
      {walkIn && data.staff.length > 0 && role !== 'staff' && <Field label={L(`من سيخدمه؟`, 'Who will serve them?')}><Chips items={[{ id: '', label: L('بدون تحديد', 'Unassigned') }, ...data.staff.filter(s => s.active !== false && (s.id === staffId || !isStaffOff(s, date))).map(s => ({ id: s.id, label: shortName(data.staff, s) }))]} value={staffId} onChange={setStaffId} /></Field>}
      <div className="confirm-card">
        <Avatar name={client?.name} size="lg" />
        <strong>{client?.name}</strong>
        <span>{dateLabel(date)} · {timeLabel(time)}</span>
        <small>{items.map(i => i.name).join(' + ')} · {num(duration)} {L('دقيقة', 'min')}</small>
        <b>{money(total)}</b>
      </div>
      {risk?.level === 'high' && <Alert tone="orange" icon={ShieldAlert}>{L(<>{client.name} لم يحضر {risk.stats.noShows} مرات سابقاً — ننصح بعربون</>, <>{client.name} has missed {risk.stats.noShows} {risk.stats.noShows === 1 ? 'appointment' : 'appointments'} before — a deposit is recommended</>)}</Alert>}
      {!walkIn && <Field label={L('العربون المطلوب', 'Deposit required')} hint={finalDeposit ? L('يُسجَّل عند الاستلام من شاشة الموعد', 'Record it from the appointment screen once received') : L('بدون عربون', 'No deposit')}><div className="money-input"><NumInput min="0" inputMode="decimal" value={finalDeposit} onChange={e => setDeposit(Number(e.target.value))} /><span>{L('ر.ق', 'QAR')}</span></div></Field>}
      <Field label={L('ملاحظات (اختياري)', 'Notes (optional)')}><textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder={L('أي تفاصيل للفريق...', 'Any details for the team...')} /></Field>
      {editTime && <Field label={L('وقت البدء', 'Start time')}><input type="time" dir="ltr" value={time} onChange={e => setTime(e.target.value)} /></Field>}
      {clash && <div className="clash-box" ref={clashRef}>
        <strong>{L('يتعارض مع:', 'Overlaps with:')}</strong>
        <div className="clash-list">{clash.clash.map(c => <div key={c.id} className="clash-item">
          <span><strong>{clientName(data.clients, c.clientId)}</strong><small>{timeLabel(c.time)} · {statusText[c.status]}{staffName(appointmentOwner(c)) ? ` · ${L('مع', 'with')} ${shortName(data.staff, data.staff.find(m => m.id === appointmentOwner(c)))}` : ''}</small></span>
          <Button size="sm" variant="secondary" icon={Check} onClick={() => markDone(c)}>{L('انتهى', 'Done')}</Button>
        </div>)}</div>
        {clash.free.filter(id => id !== staffId).length > 0 && data.staff.length > 0 && <>
          <small>{L('متاح في هذا الوقت — اختر من سيخدمه:', 'Free at this time — choose who will serve them:')}</small>
          <Chips items={clash.free.filter(id => id !== staffId).map(id => ({ id, label: shortName(data.staff, data.staff.find(m => m.id === id)) }))} value={staffId} onChange={setStaffId} />
        </>}
        <div className="clash-actions">
          <Button size="sm" variant="secondary" icon={Clock3} onClick={() => (walkIn ? setEditTime(true) : setStep(keys.indexOf('time')))}>{L('تعديل الوقت', 'Change time')}</Button>
          <Button size="sm" variant="ghost" onClick={() => save(true)}>{L('تجاهل التعارض والمتابعة', 'Ignore and continue')}</Button>
        </div>
      </div>}
      <Alert>{error}</Alert>
    </div>}
  </Sheet>;
}

function WaitlistButton({ clientId, serviceId, staffId, date, onDone }) {
  const { upsert, toast } = useApp();
  return <Button variant="secondary" icon={ListPlus} onClick={() => {
    upsert('waitlist', { id: uid(), clientId, serviceId: serviceId || '', staffId, date, status: 'waiting', createdAt: localISO() });
    toast(L('أُضيف لقائمة الانتظار — سننبهك عند أي إلغاء', 'Added to the waitlist — we’ll alert you when a slot opens'));
    onDone();
  }}>{L('أضف لقائمة الانتظار', 'Add to waitlist')}</Button>;
}

export const WALK_IN_ID = 'walk-in';

export function ClientPicker({ value, onChange, walkIn = false }) {
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

  const anonymous = () => {
    if (!data.clients.some(c => c.id === WALK_IN_ID)) upsert('clients', { id: WALK_IN_ID, name: L('زبون عابر', 'Walk-in guest'), phone: '', notes: L('زبائن بدون تسجيل', 'Unregistered clients'), createdAt: localISO() });
    onChange(WALK_IN_ID);
  };
  const add = () => {
    if (!name.trim()) { setError(L('أدخل الاسم', 'Enter the name')); return; }
    if (!walkIn && phoneDigits(phone).length < 7) { setError(L('أدخل الاسم ورقماً صحيحاً', 'Enter a name and a valid number')); return; }
    if (phone && phoneDigits(phone).length < 7) { setError(L('الرقم غير صحيح — أو اتركه فارغاً', 'Invalid number — or leave it blank')); return; }
    const existing = phone && data.clients.find(c => samePhone(c.phone, phone));
    if (existing) { onChange(existing.id); return; }
    const id = uid();
    upsert('clients', { id, name: name.trim(), phone: phone.trim(), notes: '', createdAt: localISO() });
    onChange(id);
  };

  if (adding) return <div className="stack">
    <Field label={L('الاسم', 'Name')} required><input autoFocus value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label={walkIn ? L('رقم الهاتف (اختياري)', 'Phone number (optional)') : L('رقم الهاتف', 'Phone number')} required={!walkIn} hint={walkIn ? L('يفيد لإرسال الفاتورة والتذكير بالزيارة القادمة', 'Useful for sending the receipt and next-visit reminders') : ''}><input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5555 1234" /></Field>
    <Alert>{error}</Alert>
    <div className="row-buttons"><Button variant="ghost" onClick={() => setAdding(false)}>{L('رجوع', 'Back')}</Button><Button icon={Check} onClick={add}>{L('حفظ ومتابعة', 'Save & continue')}</Button></div>
  </div>;

  return <div className="stack">
    <SearchBox value={query} onChange={setQuery} placeholder={L('ابحث بالاسم أو الرقم', 'Search by name or number')} />
    <Button variant="secondary" icon={UserPlus} block onClick={() => { setAdding(true); if (/\d/.test(q)) setPhone(q); else setName(q); }}>{vocab.newClient}</Button>
    {walkIn && <Button variant="ghost" icon={UserRoundCheck} block onClick={anonymous}>{L('بدون اسم — زبون عابر', 'No name — walk-in guest')}</Button>}
    {!q && recent.length > 0 && <small className="muted">{L('آخر العملاء', 'Recent clients')}</small>}
    <div className="list">{shown.map(c => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={<span dir="ltr">{c.phone}</span>} trailing={value === c.id ? <Check className="green" size={20} /> : null} onClick={() => onChange(c.id)} />)}</div>
  </div>;
}

