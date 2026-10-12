// صفحة الحجز العامة للعملاء (بدون حساب): الخدمة ← الوقت ← البيانات ← تم.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck2, Check, MessageCircle, Scissors } from 'lucide-react';
import { addDays, availableSlots, dateLabel, defaultSettings, localISO, money, num, timeLabel, whatsappLink } from '../data.js';
import { api, cloudEnabled, errorText } from '../lib/sync.js';
import { Alert, Button, Chips, Empty, Field, Steps } from '../ui.jsx';

export default function PublicBooking({ slug }) {
  const [shop, setShop] = useState(undefined);
  const [step, setStep] = useState(0);
  const [serviceIds, setServiceIds] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(localISO());
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const load = () => (cloudEnabled ? api.publicShop(slug).then(setShop).catch(() => setShop(null)) : setShop(null));
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (shop?.name) document.title = `احجز في ${shop.name}`; }, [shop]);

  const settings = shop ? { ...defaultSettings(shop.kind), ...(shop.settings?.settings || {}) } : null;
  const items = (shop?.services || []).filter(s => serviceIds.includes(s.id)).map(s => ({ serviceId: s.id, name: s.name, price: Number(s.price || 0), duration: Number(s.duration || 30), processing: Number(s.processing || 0), staffId }));
  const busySlots = useMemo(() => (shop?.busy || []).map((b, i) => ({ ...b, id: `b${i}`, status: 'confirmed', duration: Number(b.duration || 30), items: (b.items || []).map(item => ({ ...item, duration: Number(item.duration || 30) })) })), [shop]);
  const slots = items.length && settings ? availableSlots(busySlots, { date, items, staffId, settings }) : [];
  const total = items.reduce((s, i) => s + i.price, 0);
  const deposit = (shop?.services || []).filter(s => serviceIds.includes(s.id)).reduce((s, x) => s + Number(x.deposit || 0), 0);

  if (shop === undefined) return <div className="splash"><span className="loader" /></div>;
  if (!shop || !shop.active) return <div className="auth"><div className="auth-card"><Empty icon={Scissors} title="الحجز غير متاح" text="تأكد من الرابط أو تواصل مع الصالون مباشرة" /></div></div>;

  const book = async () => {
    setBusy(true); setError('');
    try {
      await api.publicBook({ slug, name: name.trim(), phone: phone.trim(), serviceIds, staffId, date, time, note });
      setDone(true);
    } catch (e) { setError(errorText(e)); if (/slot_taken/.test(String(e?.message))) { setStep(1); setTime(''); load(); } }
    setBusy(false);
  };

  if (done) return <div className="auth"><div className="auth-card">
    <div className="auth-brand"><span className="brand-mark brand-mark-lg success-mark"><Check size={30} /></span><h1>تم استلام حجزك!</h1><p>{shop.name} سيؤكد موعدك قريباً</p></div>
    <div className="confirm-card"><strong>{dateLabel(date)}</strong><span>{timeLabel(time)}</span><small>{items.map(i => i.name).join(' + ')}</small><b>{money(total)}</b></div>
    {deposit > 0 && <Alert tone="orange">هذه الخدمة تتطلب عربوناً {money(deposit)} لتثبيت الموعد — سيتواصل معك الصالون</Alert>}
    {shop.phone && <Button block variant="secondary" icon={MessageCircle} onClick={() => window.open(whatsappLink(shop.phone, `مرحباً، حجزت موعداً يوم ${dateLabel(date)} الساعة ${timeLabel(time)} باسم ${name}`), '_blank')}>راسل الصالون</Button>}
  </div></div>;

  return <div className="auth booking">
    <div className="auth-card auth-card-wide">
      <div className="auth-brand"><span className="brand-mark brand-mark-lg"><Scissors size={26} /></span><h1>{shop.name}</h1><p>احجز موعدك في أقل من دقيقة</p></div>
      <Steps steps={['الخدمة', 'الوقت', 'بياناتك']} current={step} />
      {step === 0 && <div className="stack">
        <div className="service-grid">{shop.services.map(s => {
          const on = serviceIds.includes(s.id);
          return <button type="button" key={s.id} className={`service-card ${on ? 'active' : ''}`} onClick={() => { setServiceIds(on ? serviceIds.filter(x => x !== s.id) : [...serviceIds, s.id]); setTime(''); }}>
            {on && <span className="check"><Check size={14} /></span>}<strong>{s.name}</strong><small>{num(s.duration)} دقيقة</small><b>{money(s.price)}</b>
          </button>;
        })}</div>
        {items.length > 0 && <div className="summary-bar"><span>{items.length} خدمات</span><strong>{money(total)}</strong></div>}
        <Button block size="lg" icon={ArrowLeft} disabled={!items.length} onClick={() => setStep(1)}>اختر الوقت</Button>
      </div>}
      {step === 1 && <div className="stack">
        {shop.staff.length > 1 && <Chips items={[{ id: '', label: 'أي شخص' }, ...shop.staff.map(s => ({ id: s.id, label: s.name.split(' ')[0] }))]} value={staffId} onChange={v => { setStaffId(v); setTime(''); }} />}
        <div className="day-strip day-strip-wide">{Array.from({ length: 14 }, (_, i) => addDays(localISO(), i)).map(d => <button type="button" key={d} className={`day ${d === date ? 'active' : ''}`} onClick={() => { setDate(d); setTime(''); }}><small>{dateLabel(d, { weekday: 'short' })}</small><strong>{dateLabel(d, { day: 'numeric' })}</strong></button>)}</div>
        {slots.length ? <div className="slots">{slots.map(t => <button type="button" key={t} className={`time ${t === time ? 'active' : ''}`} onClick={() => setTime(t)}>{timeLabel(t)}</button>)}</div> : <Empty icon={CalendarCheck2} title="لا أوقات متاحة" text="جرّب يوماً آخر" />}
        <Alert>{error}</Alert>
        <div className="row-buttons"><Button variant="ghost" icon={ArrowRight} onClick={() => setStep(0)}>رجوع</Button><Button icon={ArrowLeft} disabled={!time} onClick={() => setStep(2)}>التالي</Button></div>
      </div>}
      {step === 2 && <form className="stack" onSubmit={e => { e.preventDefault(); book(); }}>
        <div className="confirm-card"><strong>{dateLabel(date)} · {timeLabel(time)}</strong><small>{items.map(i => i.name).join(' + ')}</small><b>{money(total)}</b></div>
        <Field label="الاسم" required><input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="رقم الجوال (واتساب)" required><input required type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5555 1234" autoComplete="tel" /></Field>
        <Field label="ملاحظة (اختياري)"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
        <Alert>{error}</Alert>
        <div className="row-buttons"><Button variant="ghost" icon={ArrowRight} onClick={() => setStep(1)}>رجوع</Button><Button type="submit" icon={Check} disabled={busy}>{busy ? 'لحظة...' : 'تأكيد الحجز'}</Button></div>
      </form>}
    </div>
  </div>;
}
