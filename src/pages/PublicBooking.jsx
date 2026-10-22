// صفحة الحجز العامة للعملاء (بدون حساب): الخدمة ← الوقت ← البيانات ← تم.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck2, Check, MessageCircle, Scissors, ChevronLeft, ChevronRight } from 'lucide-react';
import { latinDigits, shortName, validPhone, addDays, availableSlots, dateLabel, defaultSettings, localISO, money, num, timeLabel, whatsappLink } from '../data.js';
import { api, cloudEnabled, errorText } from '../lib/sync.js';
import { Alert, Button, Chips, Empty, Field, Steps } from '../ui.jsx';
import { L, isEn } from '../i18n.js';

// الأسهم تتبع اتجاه اللغة (يمين لليسار في العربية).
const NextArrow = isEn ? ArrowRight : ArrowLeft;
const BackArrow = isEn ? ArrowLeft : ArrowRight;
const NextChevron = isEn ? ChevronRight : ChevronLeft;
const PrevChevron = isEn ? ChevronLeft : ChevronRight;

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
  // عرض باقة من الرابط، وكود خصم (يُتحقق منه في الخادم قبل الحجز وعند الحجز).
  const [packageId, setPackageId] = useState('');
  const [codeText, setCodeText] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [codeError, setCodeError] = useState('');

  const load = () => (cloudEnabled ? api.publicShop(slug).then(setShop).catch(() => setShop(null)) : setShop(null));
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (shop?.name) document.title = L(`احجز في ${shop.name}`, `Book at ${shop.name}`); }, [shop]);

  const settings = shop ? { ...defaultSettings(shop.kind), ...(shop.settings?.settings || {}) } : null;
  const items = (shop?.services || []).filter(s => serviceIds.includes(s.id)).map(s => ({ serviceId: s.id, name: s.name, price: Number(s.price || 0), duration: Number(s.duration || 30), processing: Number(s.processing || 0), staffId }));
  const busySlots = useMemo(() => (shop?.busy || []).map((b, i) => ({ ...b, id: `b${i}`, status: 'confirmed', duration: Number(b.duration || 30), items: (b.items || []).map(item => ({ ...item, duration: Number(item.duration || 30) })) })), [shop]);
  const slots = items.length && settings ? availableSlots(busySlots, { date, items, staffId, settings, staff: shop?.staff }) : [];
  const gross = items.reduce((s, i) => s + i.price, 0);
  const pkg = (shop?.packages || []).find(p => p.id === packageId);
  const pkgIds = pkg ? (pkg.serviceIds || []).filter(Boolean) : [];
  const bundleOn = Boolean(pkg) && Number(pkg.sessions || 1) === 1 && pkgIds.length > 0 && pkgIds.every(id => serviceIds.includes(id));
  const bundleOff = bundleOn ? Math.max(0, items.filter(i => pkgIds.includes(i.serviceId)).reduce((s, i) => s + i.price, 0) - Number(pkg.price || 0)) : 0;
  const couponOff = coupon ? Math.min(gross - bundleOff, Math.round(coupon.type === 'amount' ? Number(coupon.value) : (gross - bundleOff) * Number(coupon.value) / 100)) : 0;
  const total = Math.max(0, gross - bundleOff - couponOff);
  const deposit = (shop?.services || []).filter(s => serviceIds.includes(s.id)).reduce((s, x) => s + Number(x.deposit || 0), 0);

  if (shop === undefined) return <div className="splash"><span className="loader" /></div>;
  if (!shop || !shop.active) return <div className="auth"><div className="auth-card"><Empty icon={Scissors} title={L('الحجز غير متاح', 'Booking unavailable')} text={L('تأكد من الرابط أو تواصل مع الصالون مباشرة', 'Check the link or contact the salon directly')} /></div></div>;

  const book = async () => {
    if (!name.trim() || !validPhone(phone)) { setError(L('أدخل اسمك ورقم جوال صحيحاً (8 أرقام على الأقل)', 'Enter your name and a valid mobile number (at least 8 digits)')); return; }
    setBusy(true); setError('');
    try {
      await api.publicBook({ slug, name: name.trim(), phone: latinDigits(phone).trim(), serviceIds, staffId, date, time, note, coupon: coupon?.code || '', packageId: bundleOn ? packageId : '' });
      setDone(true);
    } catch (e) { setError(errorText(e)); if (/slot_taken/.test(String(e?.message))) { setStep(1); setTime(''); load(); } }
    setBusy(false);
  };

  if (done) return <div className="auth"><div className="auth-card">
    <div className="auth-brand"><span className="brand-mark brand-mark-lg success-mark"><Check size={30} /></span><h1>{L('تم استلام حجزك!', 'Booking received!')}</h1><p>{L(`${shop.name} سيؤكد موعدك قريباً`, `${shop.name} will confirm your appointment shortly`)}</p></div>
    <div className="confirm-card"><strong>{dateLabel(date)}</strong><span>{timeLabel(time)}</span><small>{items.map(i => i.name).join(' + ')}</small><b>{money(total)}</b></div>
    {deposit > 0 && <Alert tone="orange">{L(`هذه الخدمة تتطلب عربوناً ${money(deposit)} لتثبيت الموعد — سيتواصل معك الصالون`, `This service requires a ${money(deposit)} deposit to secure your appointment — the salon will contact you`)}</Alert>}
    {shop.phone && <Button block variant="secondary" icon={MessageCircle} onClick={() => window.open(whatsappLink(shop.phone, L(`مرحباً، حجزت موعداً يوم ${dateLabel(date)} الساعة ${timeLabel(time)} باسم ${name}`, `Hello, I booked an appointment on ${dateLabel(date)} at ${timeLabel(time)} under the name ${name}`)), '_blank')}>{L('راسل الصالون', 'Message the salon')}</Button>}
  </div></div>;

  return <div className="auth booking">
    <div className="auth-card auth-card-wide">
      <div className="auth-brand"><span className="brand-mark brand-mark-lg"><Scissors size={26} /></span><h1>{shop.name}</h1><p>{L('احجز موعدك في أقل من دقيقة', 'Book your appointment in under a minute')}</p></div>
      <Steps steps={[L('الخدمة', 'Service'), L('الوقت', 'Time'), L('بياناتك', 'Your details')]} current={step} />
      {step === 0 && <div className="stack">
        {(shop.packages || []).length > 0 && <div className="stack">
          <small className="muted">{L('عروض وباقات', 'Offers & packages')}</small>
          <div className="package-cards">{shop.packages.map(p => {
            const ids = (p.serviceIds || []).filter(id => shop.services.some(s => s.id === id));
            const on = packageId === p.id && ids.every(id => serviceIds.includes(id));
            const regular = ids.reduce((sum, id) => sum + Number(shop.services.find(s => s.id === id)?.price || 0), 0);
            return <button type="button" key={p.id} className={`package-card ${on ? 'active' : ''}`} onClick={() => {
              if (on) { setPackageId(''); setServiceIds(serviceIds.filter(id => !ids.includes(id))); } else { setPackageId(p.id); setServiceIds([...new Set([...serviceIds, ...ids])]); }
              setTime('');
            }}>
              {on && <span className="check"><Check size={14} /></span>}
              <strong>{p.name}</strong>
              <small>{ids.map(id => shop.services.find(s => s.id === id)?.name).join(' + ')}</small>
              <b>{money(p.price)}{Number(p.sessions || 1) > 1 ? L(` · ${num(p.sessions)} جلسات`, ` · ${num(p.sessions)} sessions`) : ''}</b>
              {regular > Number(p.price) && Number(p.sessions || 1) === 1 && <s className="muted">{money(regular)}</s>}
            </button>;
          })}</div>
        </div>}
        <div className="service-grid">{shop.services.map(s => {
          const on = serviceIds.includes(s.id);
          return <button type="button" key={s.id} className={`service-card ${on ? 'active' : ''}`} onClick={() => { setServiceIds(on ? serviceIds.filter(x => x !== s.id) : [...serviceIds, s.id]); setTime(''); }}>
            {on && <span className="check"><Check size={14} /></span>}<strong>{s.name}</strong><small>{num(s.duration)} {L('دقيقة', 'min')}</small><b>{money(s.price)}</b>
          </button>;
        })}</div>
        {items.length > 0 && <div className="summary-bar"><span>{L(`${items.length} خدمات`, `${items.length} ${items.length === 1 ? 'service' : 'services'}`)}</span><strong>{bundleOff > 0 && <s className="muted">{money(gross)}</s>} {money(gross - bundleOff)}</strong></div>}
        <Button block size="lg" icon={NextArrow} disabled={!items.length} onClick={() => setStep(1)}>{L('اختر الوقت', 'Choose a time')}</Button>
      </div>}
      {step === 1 && <div className="stack">
        {shop.staff.length > 1 && <Chips items={[{ id: '', label: L('أي شخص', 'Anyone') }, ...shop.staff.map(s => ({ id: s.id, label: shortName(shop.staff, s) }))]} value={staffId} onChange={v => { setStaffId(v); setTime(''); }} />}
        <div className="day-strip day-strip-wide">{Array.from({ length: 14 }, (_, i) => addDays(localISO(), i)).map(d => <button type="button" key={d} className={`day ${d === date ? 'active' : ''}`} onClick={() => { setDate(d); setTime(''); }}><small>{dateLabel(d, { weekday: 'short' })}</small><strong>{dateLabel(d, { day: 'numeric' })}</strong></button>)}</div>
        {slots.length ? <div className="slots">{slots.map(t => <button type="button" key={t} className={`time ${t === time ? 'active' : ''}`} onClick={() => setTime(t)}>{timeLabel(t)}</button>)}</div> : <Empty icon={CalendarCheck2} title={L('لا أوقات متاحة', 'No available times')} text={L('جرّب يوماً آخر', 'Try another day')} />}
        <Alert>{error}</Alert>
        <div className="row-buttons"><Button variant="ghost" icon={BackArrow} onClick={() => setStep(0)}>{L('رجوع', 'Back')}</Button><Button icon={NextArrow} disabled={!time} onClick={() => setStep(2)}>{L('التالي', 'Next')}</Button></div>
      </div>}
      {step === 2 && <form className="stack" onSubmit={e => { e.preventDefault(); book(); }}>
        <div className="confirm-card"><strong>{dateLabel(date)} · {timeLabel(time)}</strong><small>{items.map(i => i.name).join(' + ')}</small><b>{money(total)}</b></div>
        <Field label={L('الاسم', 'Name')} required><input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label={L('رقم الجوال (واتساب)', 'Mobile number (WhatsApp)')} required><input required type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5555 1234" autoComplete="tel" /></Field>
        <Field label={L('ملاحظة (اختياري)', 'Note (optional)')}><input value={note} onChange={e => setNote(e.target.value)} /></Field>
        {shop.coupons && <Field label={L('كود خصم (اختياري)', 'Discount code (optional)')} hint={coupon ? L(`تم تطبيق ${coupon.code} — وفّرت ${money(couponOff)}`, `${coupon.code} applied — you save ${money(couponOff)}`) : ''}>
          <div className="code-row">
            <input dir="ltr" className="code-input" value={codeText} disabled={Boolean(coupon)} onChange={e => { setCodeText(e.target.value.toUpperCase()); setCodeError(''); }} placeholder="EID20" />
            {coupon ? <Button variant="ghost" onClick={() => { setCoupon(null); setCodeText(''); }}>{L('إزالة', 'Remove')}</Button>
              : <Button variant="secondary" disabled={!codeText.trim()} onClick={async () => { try { setCoupon(await api.publicCheckCoupon(slug, codeText)); } catch (e) { setCodeError(errorText(e)); } }}>{L('تطبيق', 'Apply')}</Button>}
          </div>
          {codeError && <small className="red">{codeError}</small>}
        </Field>}
        <Alert>{error}</Alert>
        <div className="row-buttons"><Button variant="ghost" icon={BackArrow} onClick={() => setStep(1)}>{L('رجوع', 'Back')}</Button><Button type="submit" icon={Check} disabled={busy}>{busy ? L('لحظة...', 'One moment...') : L('تأكيد الحجز', 'Confirm booking')}</Button></div>
      </form>}
    </div>
  </div>;
}
