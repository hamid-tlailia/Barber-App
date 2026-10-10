import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Scissors, LayoutDashboard, UsersRound, CalendarDays, WalletCards, ChartNoAxesColumnIncreasing,
  Settings2, Plus, Search, Bell, ChevronLeft, ChevronRight, Clock3, Check,
  X, Phone, Pencil, Trash2, CalendarCheck2, CreditCard, Banknote, TrendingUp,
  Sparkles, Menu, CircleCheck, AlertCircle, Download, CalendarClock, UserPlus,
  ReceiptText, Save, MoreHorizontal, CheckCircle2, ArrowLeft, FileDown,
} from 'lucide-react';
import { STORAGE_KEY, localISO, addDays, uid, loadData, dateLabel, money, timeLabel, sortAppointments, hasAppointmentConflict, nextOpenSlot, statusText, paymentText } from './data';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/tajawal/arabic-700.css';
import '@fontsource/tajawal/arabic-800.css';
import './style.css';

const nav = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'appointments', label: 'المواعيد', icon: CalendarDays },
  { id: 'clients', label: 'الزبائن', icon: UsersRound },
  { id: 'payments', label: 'الدفعات', icon: WalletCards },
  { id: 'reports', label: 'التقارير', icon: ChartNoAxesColumnIncreasing },
];
const pageTitles = { dashboard: 'لوحة التحكم', appointments: 'المواعيد', clients: 'الزبائن', payments: 'الدفعات', reports: 'التقارير', settings: 'الإعدادات' };
const initials = name => (name || '؟').split(' ').slice(0, 2).map(w => w[0]).join('');
const appointmentTime = a => new Date(`${a.date}T${a.time}:00`).getTime();
const weekDay = date => dateLabel(date, { weekday: 'short' });
const n = value => new Intl.NumberFormat('ar-QA').format(value);

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-symbol"><Scissors size={24} strokeWidth={2.4} /></span>
    <span className="brand-copy"><strong>مِقص<span className="brand-dot">.</span></strong>{!compact && <small>إدارة صالونك بذكاء</small>}</span>
  </div>;
}

function Avatar({ name, index = 0, size = '' }) {
  return <span className={`avatar avatar-${index % 5} ${size}`} aria-label={name}>{initials(name)}</span>;
}

function Badge({ status }) { return <span className={`badge badge-${status}`}><span className="badge-dot" />{statusText[status]}</span>; }
function Empty({ icon: Icon = CalendarDays, title, description, action }) {
  return <div className="empty"><div className="empty-icon"><Icon size={27} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
function SectionTitle({ title, subtitle, action }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
function MetricCard({ icon: Icon, label, value, note, tone = 'orange', marker }) {
  return <div className="metric-card"><div className="metric-top"><span className={`metric-icon tone-${tone}`}><Icon size={21} /></span>{marker && <span className="metric-marker">{marker}</span>}</div><div className="metric-value">{value}</div><div className="metric-label">{label}</div>{note && <div className="metric-note">{note}</div>}</div>;
}
function SearchInput({ value, onChange, placeholder }) {
  return <label className="search-field"><Search size={18} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}
function Tabs({ items, active, onChange }) {
  return <div className="tabs" role="tablist">{items.map(item => <button type="button" role="tab" aria-selected={active === item.id} key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>;
}

function AppointmentItem({ appointment: a, client, onEdit, onStatus, onPay, compact = false }) {
  return <div className={`appointment-item ${a.status === 'cancelled' ? 'appointment-cancelled' : ''}`}>
    <div className="appointment-time"><strong dir="ltr">{timeLabel(a.time)}</strong><span>{a.duration} دقيقة</span></div>
    <div className="appointment-person"><Avatar name={client?.name} index={(client?.name || '').length} /><div className="person-info"><strong>{client?.name || 'زبون محذوف'}</strong><span>{a.serviceName}</span></div></div>
    <div className="appointment-price">{money(a.price)}</div>
    <div className="appointment-state"><Badge status={a.status} />{!compact && <span className={a.paymentStatus === 'paid' ? 'paid-text' : 'unpaid-text'}>{a.paymentStatus === 'paid' ? 'تم الدفع' : 'لم يُدفع'}</span>}</div>
    <div className="appointment-actions">
      {a.status !== 'cancelled' && a.paymentStatus !== 'paid' && <button type="button" className="icon-button action-pay" onClick={() => onPay(a)} title="تسجيل دفعة" aria-label="تسجيل دفعة"><WalletCards size={18} /></button>}
      {a.status === 'pending' && <button type="button" className="icon-button action-confirm" onClick={() => onStatus(a.id, 'confirmed')} title="تأكيد الموعد" aria-label="تأكيد الموعد"><Check size={19} /></button>}
      <button type="button" className="icon-button" onClick={() => onEdit(a)} title="تفاصيل وتعديل الموعد" aria-label="تفاصيل وتعديل الموعد"><ChevronLeft size={19} /></button>
    </div>
  </div>;
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-button close-button" onClick={onClose} aria-label="إغلاق"><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

function ClientForm({ item, onSave, onClose, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [phone, setPhone] = useState(item?.phone || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [error, setError] = useState('');
  return <Modal title={item ? 'تعديل بيانات الزبون' : 'إضافة زبون جديد'} subtitle="احتفظ بتفاصيل زبائنك في مكان واحد" onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); const result = onSave({ name: name.trim(), phone: phone.trim(), notes: notes.trim() }, item?.id); if (result) setError(result); }}>
      <div className="form-body"><label className="field"><span>اسم الزبون <em>*</em></span><input required value={name} onChange={e => setName(e.target.value)} placeholder="مثال: أحمد محمد" autoFocus /></label>
        <label className="field"><span>رقم الهاتف <em>*</em></span><input required type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+974 5555 1234" /></label>
        <label className="field"><span>ملاحظات <small>(اختياري)</small></span><textarea rows="3" value={notes} onChange={e => setNotes(e.target.value)} placeholder="التفضيلات أو أي تفاصيل مفيدة..." /></label>
        {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
      </div><div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={17} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Save size={17} /> حفظ الزبون</button></div>
    </form>
  </Modal>;
}

function AppointmentForm({ item, draft, defaultSlot, clients, services, onSave, onClose, onDelete, onNewClient }) {
  const initial = { ...item, ...draft };
  const [clientId, setClientId] = useState(initial.clientId || clients[0]?.id || '');
  const [serviceId, setServiceId] = useState(initial.serviceId || services[0]?.id || '');
  const [date, setDate] = useState(initial.date || defaultSlot.date);
  const [time, setTime] = useState(initial.time || defaultSlot.time);
  const [status, setStatus] = useState(initial.status || 'confirmed');
  const [notes, setNotes] = useState(initial.notes || '');
  const [error, setError] = useState('');
  const service = services.find(s => s.id === serviceId);
  return <Modal title={item ? 'تفاصيل الموعد' : 'موعد جديد'} subtitle={item ? 'حدّث تفاصيل الحجز وحالته' : 'رتّب يومك بخطوات بسيطة'} onClose={onClose} wide>
    <form onSubmit={e => { e.preventDefault(); const result = onSave({ clientId, serviceId, date, time, status, notes: notes.trim() }, item); if (result) setError(result); }}>
      <div className="form-body"><div className="form-grid"><div className="field"><span>الزبون <em>*</em></span><div className="input-with-action"><select required value={clientId} onChange={e => setClientId(e.target.value)}><option value="" disabled>اختر الزبون</option>{clients.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><button type="button" onClick={() => onNewClient({ clientId, serviceId, date, time, status, notes })} className="small-add" title="إضافة زبون" aria-label="إضافة زبون"><UserPlus size={19} /></button></div></div>
        <label className="field"><span>الخدمة <em>*</em></span><select required value={serviceId} onChange={e => setServiceId(e.target.value)}><option value="" disabled>اختر الخدمة</option>{services.map(s => <option value={s.id} key={s.id}>{s.name} — {money(s.price)}</option>)}</select></label>
        <label className="field"><span>التاريخ <em>*</em></span><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field"><span>الوقت <em>*</em></span><input required type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
        <label className="field"><span>حالة الموعد</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="pending">بانتظار التأكيد</option><option value="confirmed">مؤكد</option><option value="completed">مكتمل</option><option value="cancelled">ملغي</option></select></label>
        <div className="field"><span>تفاصيل الخدمة</span><div className="service-preview"><Scissors size={18} />{service ? <>{money(service.price)} <span>·</span> {service.duration} دقيقة</> : 'اختر خدمة'}</div></div></div>
        <label className="field"><span>ملاحظات <small>(اختياري)</small></span><textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="تفاصيل إضافية عن الموعد..." /></label>
        {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
      </div><div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={17} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Check size={17} /> {item ? 'حفظ التغييرات' : 'إضافة الموعد'}</button></div>
    </form>
  </Modal>;
}

function ServiceForm({ item, onSave, onClose, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price ?? '');
  const [duration, setDuration] = useState(item?.duration ?? 30);
  return <Modal title={item ? 'تعديل الخدمة' : 'خدمة جديدة'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSave({ name: name.trim(), price: Number(price), duration: Number(duration) }, item?.id); }}>
    <div className="form-body"><label className="field"><span>اسم الخدمة</span><input required value={name} onChange={e => setName(e.target.value)} placeholder="مثال: قص الشعر" autoFocus /></label><div className="form-grid"><label className="field"><span>السعر (ر.ق)</span><input required min="0" step="0.01" type="number" value={price} onChange={e => setPrice(e.target.value)} /></label><label className="field"><span>المدة (دقيقة)</span><input required min="5" step="5" type="number" value={duration} onChange={e => setDuration(e.target.value)} /></label></div></div>
    <div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={17} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Save size={17} /> حفظ الخدمة</button></div>
  </form></Modal>;
}

function PaymentForm({ item, client, onSave, onClose }) {
  const [method, setMethod] = useState('cash');
  return <Modal title="تسجيل دفعة" subtitle="أكّد استلام قيمة الخدمة" onClose={onClose}>
    <div className="form-body"><div className="payment-summary"><div><span>الزبون</span><strong>{client?.name || 'زبون محذوف'}</strong></div><div><span>الخدمة</span><strong>{item.serviceName}</strong></div><div><span>المبلغ المستحق</span><strong className="orange-text">{money(item.price)}</strong></div></div><div className="field"><span>طريقة الدفع</span><div className="method-options">{[{ id: 'cash', label: 'نقداً', icon: Banknote }, { id: 'card', label: 'بطاقة', icon: CreditCard }, { id: 'transfer', label: 'تحويل', icon: WalletCards }].map(option => <button key={option.id} type="button" className={method === option.id ? 'selected' : ''} onClick={() => setMethod(option.id)}><option.icon size={19} />{option.label}</button>)}</div></div></div>
    <div className="modal-footer"><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="button" className="button-primary" onClick={() => onSave(item.id, method)}><Check size={17} /> تأكيد الدفع</button></div>
  </Modal>;
}

function App() {
  const [data, setData] = useState(loadData);
  const [page, setPage] = useState('dashboard');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(localISO());
  const [appointmentFilter, setAppointmentFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('unpaid');
  const [reportRange, setReportRange] = useState('month');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const importInput = useRef(null);
  const today = localISO();
  const byId = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const orderedAppointments = useMemo(() => [...data.appointments].sort(sortAppointments), [data.appointments]);
  const todayAppointments = orderedAppointments.filter(a => a.date === today && a.status !== 'cancelled');
  const upcoming = orderedAppointments.filter(a => a.status !== 'cancelled' && a.status !== 'completed' && appointmentTime(a) >= Date.now()).slice(0, 3);
  const unpaid = data.appointments.filter(a => a.paymentStatus === 'unpaid' && a.status !== 'cancelled');
  const paid = data.appointments.filter(a => a.paymentStatus === 'paid');
  const showToast = (text, type = 'success') => setToast({ text, type });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* App still works without persistent storage. */ } }, [data]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timeout); }, [toast]);
  const go = destination => { setPage(destination); setSearch(''); setMobileMenu(false); setNotificationsOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const saveClient = (values, id) => {
    if (!values.name || !values.phone) return 'الاسم ورقم الهاتف مطلوبان';
    if (!/^\+?[\d\s()-]{7,20}$/.test(values.phone) || values.phone.replace(/\D/g, '').length < 7) return 'أدخل رقم هاتف صحيحاً (٧ أرقام على الأقل)';
    if (data.clients.some(c => c.phone.replace(/\D/g, '') === values.phone.replace(/\D/g, '') && c.id !== id)) return 'رقم الهاتف مسجّل بالفعل لزبون آخر';
    const clientId = id || uid();
    setData(prev => ({ ...prev, clients: id ? prev.clients.map(c => c.id === id ? { ...c, ...values } : c) : [...prev.clients, { id: clientId, ...values, createdAt: today }] }));
    setModal(modal?.returnToAppointment ? { type: 'appointment', item: modal.returnToAppointment.item, draft: { ...modal.returnToAppointment.draft, clientId } } : null);
    showToast(id ? 'تم تحديث بيانات الزبون' : 'تمت إضافة الزبون بنجاح'); return '';
  };
  const saveAppointment = (values, item) => {
    const service = data.services.find(s => s.id === values.serviceId);
    if (!service || !values.clientId || !values.date || !values.time) return 'يرجى إكمال جميع الحقول المطلوبة';
    const duration = item?.paymentStatus === 'paid' ? item.duration : service.duration;
    if (hasAppointmentConflict(data.appointments, { ...values, id: item?.id, duration })) return 'يوجد موعد آخر في هذا الوقت. اختر وقتاً مختلفاً.';
    if (item?.paymentStatus === 'paid' && (values.status === 'cancelled' || values.serviceId !== item.serviceId)) return 'ألغِ تسجيل الدفعة أولاً قبل إلغاء الموعد أو تغيير الخدمة.';
    const record = { ...item, ...values, serviceName: item?.paymentStatus === 'paid' ? item.serviceName : service.name, price: item?.paymentStatus === 'paid' ? item.price : service.price, duration };
    setData(prev => ({ ...prev, appointments: item ? prev.appointments.map(a => a.id === item.id ? record : a) : [...prev.appointments, { ...record, id: uid(), paymentStatus: 'unpaid', paymentMethod: '', paidAt: '', createdAt: today }] }));
    setModal(null); showToast(item ? 'تم تحديث الموعد' : 'تمت إضافة الموعد بنجاح'); return '';
  };
  const changeStatus = (id, status) => { setData(prev => ({ ...prev, appointments: prev.appointments.map(a => a.id === id ? { ...a, status } : a) })); showToast(status === 'confirmed' ? 'تم تأكيد الموعد' : 'تم تحديث حالة الموعد'); };
  const pay = (id, method) => { setData(prev => ({ ...prev, appointments: prev.appointments.map(a => a.id === id ? { ...a, paymentStatus: 'paid', paymentMethod: method, paidAt: today } : a) })); setModal(null); showToast('تم تسجيل الدفعة بنجاح'); };
  const undoPay = id => { setData(prev => ({ ...prev, appointments: prev.appointments.map(a => a.id === id ? { ...a, paymentStatus: 'unpaid', paymentMethod: '', paidAt: '' } : a) })); showToast('تم إلغاء تسجيل الدفعة'); };
  const saveService = (values, id) => { setData(prev => ({ ...prev, services: id ? prev.services.map(s => s.id === id ? { ...s, ...values } : s) : [...prev.services, { id: uid(), ...values }] })); setModal(null); showToast(id ? 'تم تحديث الخدمة' : 'تمت إضافة الخدمة'); };
  const askDelete = (kind, item) => setModal({ type: 'delete', kind, item });
  const deleteItem = (kind, id) => {
    if (kind === 'client') setData(prev => ({ ...prev, clients: prev.clients.filter(c => c.id !== id), appointments: prev.appointments.filter(a => a.clientId !== id) }));
    if (kind === 'appointment') setData(prev => ({ ...prev, appointments: prev.appointments.filter(a => a.id !== id) }));
    if (kind === 'service') setData(prev => ({ ...prev, services: prev.services.filter(s => s.id !== id) }));
    setModal(null); showToast('تم الحذف بنجاح');
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `miqass-backup-${today}.json`; link.click(); URL.revokeObjectURL(url); showToast('تم تنزيل النسخة الاحتياطية');
  };
  const prepareRestore = async file => {
    if (!file) return;
    try {
      const saved = JSON.parse(await file.text());
      const valid = saved && Array.isArray(saved.clients) && Array.isArray(saved.services) && Array.isArray(saved.appointments)
        && saved.clients.every(c => typeof c.id === 'string' && typeof c.name === 'string' && typeof c.phone === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.createdAt))
        && saved.services.every(s => typeof s.id === 'string' && typeof s.name === 'string' && Number.isFinite(s.price) && Number.isFinite(s.duration))
        && saved.appointments.every(a => typeof a.id === 'string' && typeof a.clientId === 'string' && typeof a.serviceName === 'string' && Number.isFinite(a.price) && Number.isFinite(a.duration) && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && /^\d{2}:\d{2}$/.test(a.time));
      if (!valid) throw new Error('Invalid backup');
      setModal({ type: 'restore', data: { ...saved, shopName: saved.shopName || 'صالون مِقص', ownerName: saved.ownerName || 'أهلاً بك' } });
    } catch { showToast('ملف النسخة الاحتياطية غير صالح', 'error'); }
  };
  const exportReport = list => {
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['تاريخ الموعد', 'الوقت', 'الزبون', 'الخدمة', 'السعر', 'حالة الموعد', 'حالة الدفع', 'تاريخ الدفع', 'طريقة الدفع'], ...list.map(a => [a.date, a.time, byId[a.clientId]?.name || 'زبون محذوف', a.serviceName, a.price, statusText[a.status], a.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق', a.paidAt || '', paymentText[a.paymentMethod] || ''])];
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `miqass-report-${today}.csv`; link.click(); URL.revokeObjectURL(url); showToast('تم تنزيل التقرير');
  };

  const renderDashboard = () => {
    const completedToday = todayAppointments.filter(a => a.status === 'completed').length;
    const todayRevenue = paid.filter(a => a.paidAt === today).reduce((sum, a) => sum + a.price, 0);
    const next = upcoming[0];
    const recentDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const revenues = recentDays.map(day => paid.filter(a => a.paidAt === day).reduce((sum, a) => sum + a.price, 0));
    const max = Math.max(...revenues, 1);
    return <>
      <div className="hero"><div className="hero-content"><div className="hero-eyebrow"><Sparkles size={15} /> مساحتك لتنظيم العمل</div><h1>ركّز على حلاقتك،<br /><span>ونحن ننظّم الباقي.</span></h1><p>كل ما تحتاجه لإدارة صالونك، في مكان واحد.</p><button className="button-primary hero-button" onClick={() => setModal({ type: 'appointment' })}><Plus size={19} /> إضافة موعد جديد <ArrowLeft size={17} /></button></div><div className="hero-art" aria-hidden="true"><div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" /><div className="hero-scissors"><Scissors size={112} strokeWidth={1.1} /></div><div className="art-spark art-spark-one">✦</div><div className="art-spark art-spark-two">✦</div><div className="art-caption">MAKE EVERY<br />CUT COUNT.</div></div></div>
      <div className="section-heading section-spaced"><div><h2>نظرة سريعة</h2><p>كل ما يحدث في صالونك اليوم</p></div><span className="date-chip"><CalendarDays size={16} /> {dateLabel(today)}</span></div>
      <div className="metrics-grid">
        <MetricCard icon={CalendarDays} label="مواعيد اليوم" value={n(todayAppointments.length)} note="حجوزات على الجدول" tone="orange" marker="اليوم" />
        <MetricCard icon={CircleCheck} label="مواعيد مكتملة" value={n(completedToday)} note="من مواعيد اليوم" tone="green" />
        <MetricCard icon={WalletCards} label="إيرادات اليوم" value={money(todayRevenue)} note="دفعات تم تحصيلها" tone="purple" />
        <MetricCard icon={UsersRound} label="إجمالي الزبائن" value={n(data.clients.length)} note="زبون في قائمة العملاء" tone="blue" />
      </div>
      <div className="dashboard-grid"><section className="panel appointments-panel"><SectionTitle title="مواعيد اليوم" subtitle={`${n(todayAppointments.length)} مواعيد مجدولة`} action={<button className="text-link" onClick={() => { setSelectedDate(today); go('appointments'); }}>عرض جميع المواعيد <ChevronLeft size={17} /></button>} />
        {todayAppointments.length ? <div className="appointment-list">{todayAppointments.map(a => <AppointmentItem key={a.id} appointment={a} client={byId[a.clientId]} onEdit={item => setModal({ type: 'appointment', item })} onStatus={changeStatus} onPay={item => setModal({ type: 'payment', item })} compact />)}</div> : <Empty title="يومك متاح للحجوزات" description="ليس لديك مواعيد اليوم. أضف موعدك الأول الآن." action={<button className="button-primary" onClick={() => setModal({ type: 'appointment' })}><Plus size={17} /> موعد جديد</button>} />}
      </section><div className="dashboard-side"><section className="panel next-panel"><div className="mini-panel-header"><span className="mini-heading-icon"><CalendarClock size={19} /></span><h3>الموعد القادم</h3></div>{next ? <><div className="next-client"><Avatar name={byId[next.clientId]?.name} size="avatar-lg" /><div><strong>{byId[next.clientId]?.name || 'زبون محذوف'}</strong><span>{next.serviceName}</span></div></div><div className="next-details"><span><Clock3 size={16} /> {timeLabel(next.time)}</span><span><CalendarDays size={16} /> {next.date === today ? 'اليوم' : dateLabel(next.date, { day: 'numeric', month: 'long' })}</span></div><button className="next-button" onClick={() => setModal({ type: 'appointment', item: next })}>عرض التفاصيل <ChevronLeft size={17} /></button></> : <p className="muted next-empty">لا توجد مواعيد قادمة حالياً.</p>}</section>
      <section className="panel chart-panel"><div className="mini-panel-header"><span className="mini-heading-icon green-icon"><TrendingUp size={19} /></span><h3>أداء الأسبوع</h3></div><strong className="chart-total">{money(revenues.reduce((sum, val) => sum + val, 0))}</strong><span className="chart-caption">إيرادات آخر ٧ أيام</span><div className="mini-chart">{recentDays.map((day, i) => <div className="chart-column" key={day} title={`${dateLabel(day)}: ${money(revenues[i])}`}><div className={`chart-bar ${day === today ? 'current' : ''}`} style={{ height: `${Math.max(8, revenues[i] / max * 100)}%` }} /><span>{weekDay(day)}</span></div>)}</div></section></div></div>
    </>;
  };

  const renderAppointments = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - 2));
    const list = orderedAppointments.filter(a => a.date === selectedDate && (appointmentFilter === 'all' || a.status === appointmentFilter) && `${byId[a.clientId]?.name || ''} ${a.serviceName}`.includes(search));
    const allForDay = data.appointments.filter(a => a.date === selectedDate && a.status !== 'cancelled');
    const addForDay = () => setModal({ type: 'appointment', draft: nextOpenSlot(data.appointments, data.services[0]?.duration, selectedDate) });
    return <><div className="page-heading"><div><div className="eyebrow">تنظيم يومك، ببساطة</div><h1>المواعيد</h1><p>جدول مرتب لكل قصّة تبدأ عندك.</p></div><button className="button-primary" onClick={addForDay}><Plus size={18} /> موعد جديد</button></div>
      <div className="panel calendar-panel"><div className="calendar-top"><div><h2>جدول المواعيد</h2><p>{dateLabel(selectedDate)}</p></div><div className="calendar-controls"><button className="button-ghost today-button" onClick={() => setSelectedDate(today)}>اليوم</button><button className="icon-button" aria-label="الأيام السابقة" onClick={() => setSelectedDate(addDays(selectedDate, -7))}><ChevronRight size={19} /></button><button className="icon-button" aria-label="الأيام التالية" onClick={() => setSelectedDate(addDays(selectedDate, 7))}><ChevronLeft size={19} /></button><input type="date" className="date-picker" aria-label="اختيار تاريخ" value={selectedDate} onChange={e => e.target.value && setSelectedDate(e.target.value)} /></div></div>
      <div className="date-strip">{days.map(day => <button key={day} className={`date-tile ${selectedDate === day ? 'selected' : ''} ${today === day ? 'is-today' : ''}`} onClick={() => setSelectedDate(day)}><span>{weekDay(day)}</span><strong>{dateLabel(day, { day: 'numeric' })}</strong><i className={data.appointments.some(a => a.date === day && a.status !== 'cancelled') ? 'has-bookings' : ''} /></button>)}</div></div>
      <div className="panel full-list-panel"><div className="list-toolbar"><div><h2>مواعيد {selectedDate === today ? 'اليوم' : dateLabel(selectedDate, { day: 'numeric', month: 'long' })}</h2><p>{n(allForDay.length)} حجوزات في هذا اليوم</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث عن زبون أو خدمة..." /></div>
      <Tabs items={[{ id: 'all', label: 'الكل' }, { id: 'pending', label: 'قيد الانتظار' }, { id: 'confirmed', label: 'مؤكد' }, { id: 'completed', label: 'مكتمل' }, { id: 'cancelled', label: 'ملغي' }]} active={appointmentFilter} onChange={setAppointmentFilter} />
      {list.length ? <div className="appointment-list">{list.map(a => <AppointmentItem key={a.id} appointment={a} client={byId[a.clientId]} onEdit={item => setModal({ type: 'appointment', item })} onStatus={changeStatus} onPay={item => setModal({ type: 'payment', item })} />)}</div> : <Empty title="لا توجد مواعيد هنا" description={search ? 'جرّب البحث باسم أو خدمة أخرى.' : 'لا توجد حجوزات لهذا اليوم أو لهذا التصنيف.'} action={!search && <button className="button-primary" onClick={addForDay}><Plus size={17} /> أضف موعداً</button>} />}</div></>;
  };

  const renderClients = () => {
    const clients = data.clients.filter(c => `${c.name} ${c.phone}`.includes(search)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return <><div className="page-heading"><div><div className="eyebrow">علاقات تدوم</div><h1>الزبائن</h1><p>كل زبائنك وتفاصيلهم في مكان واحد.</p></div><button className="button-primary" onClick={() => setModal({ type: 'client' })}><UserPlus size={18} /> إضافة زبون</button></div>
      <div className="client-overview"><div className="client-overview-icon"><UsersRound size={26} /></div><div><span>قاعدة زبائنك</span><strong>{n(data.clients.length)} زبائن</strong></div><div className="overview-decoration" aria-hidden="true"><UsersRound size={86} /></div></div>
      <div className="panel client-panel"><div className="list-toolbar"><div><h2>قائمة الزبائن</h2><p>تابع بيانات زبائنك ومواعيدهم</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو رقم الهاتف..." /></div>
      {clients.length ? <div className="clients-list"><div className="table-header"><span>الزبون</span><span>رقم الهاتف</span><span>الزيارات</span><span>آخر زيارة</span><span>إجراءات</span></div>{clients.map((c, i) => {
        const visits = data.appointments.filter(a => a.clientId === c.id && a.status === 'completed');
        const last = [...visits].sort((a, b) => b.date.localeCompare(a.date))[0];
        return <div className="client-row" key={c.id}><div className="client-primary"><Avatar name={c.name} index={i} /><div><strong>{c.name}</strong><span>زبون منذ {dateLabel(c.createdAt, { month: 'long', year: 'numeric' })}</span></div></div><a className="phone-link" href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} dir="ltr"><Phone size={15} />{c.phone}</a><span className="visit-count">{n(visits.length)} زيارات</span><span className="last-visit">{last ? dateLabel(last.date, { day: 'numeric', month: 'short' }) : '—'}</span><div className="row-actions"><button className="icon-button" onClick={() => setModal({ type: 'clientDetails', item: c })} title="تفاصيل الزبون" aria-label={`تفاصيل ${c.name}`}><ChevronLeft size={19} /></button><button className="icon-button" onClick={() => setModal({ type: 'client', item: c })} title="تعديل الزبون" aria-label={`تعديل ${c.name}`}><Pencil size={16} /></button></div></div>;
      })}</div> : <Empty icon={UsersRound} title={search ? 'لم نعثر على زبائن' : 'قائمتك جاهزة'} description={search ? 'تحقق من الاسم أو الرقم وحاول مجدداً.' : 'أضف أول زبون لبدء تنظيم صالونك.'} action={!search && <button className="button-primary" onClick={() => setModal({ type: 'client' })}><Plus size={17} /> إضافة زبون</button>} />}</div></>;
  };

  const renderPayments = () => {
    const list = [...data.appointments].filter(a => a.status !== 'cancelled' && (paymentFilter === 'all' || a.paymentStatus === paymentFilter) && `${byId[a.clientId]?.name || ''} ${a.serviceName}`.includes(search)).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    const dueAmount = unpaid.reduce((sum, a) => sum + a.price, 0);
    return <><div className="page-heading"><div><div className="eyebrow">حسابات واضحة</div><h1>الدفعات</h1><p>تابع مستحقاتك وما تم تحصيله بسهولة.</p></div></div>
      <div className="metrics-grid payments-metrics"><MetricCard icon={WalletCards} label="إجمالي المحصّل" value={money(paid.reduce((sum, a) => sum + a.price, 0))} note={`${n(paid.length)} دفعات مكتملة`} tone="green" /><MetricCard icon={Clock3} label="مبالغ مستحقة" value={money(dueAmount)} note={`${n(unpaid.length)} مواعيد غير مدفوعة`} tone="orange" /><MetricCard icon={ReceiptText} label="إجمالي العمليات" value={n(paid.length + unpaid.length)} note="مواعيد غير ملغاة" tone="blue" /></div>
      <div className="panel payments-panel"><div className="list-toolbar"><div><h2>سجل الدفعات</h2><p>كل مدفوعات ومُستحقات الصالون</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث عن زبون أو خدمة..." /></div><Tabs items={[{ id: 'unpaid', label: `مستحقة (${n(unpaid.length)})` }, { id: 'paid', label: `مدفوعة (${n(paid.length)})` }, { id: 'all', label: 'الكل' }]} active={paymentFilter} onChange={setPaymentFilter} />
      {list.length ? <div className="payments-list">{list.map((a, i) => <div className="payment-row" key={a.id}><span className={`payment-row-icon ${a.paymentStatus === 'paid' ? 'payment-done' : ''}`}>{a.paymentStatus === 'paid' ? <Check size={20} /> : <WalletCards size={20} />}</span><div className="payment-person"><strong>{byId[a.clientId]?.name || 'زبون محذوف'}</strong><span>{a.serviceName} <b>·</b> {dateLabel(a.date, { day: 'numeric', month: 'short' })}</span></div><div className="payment-amount"><strong>{money(a.price)}</strong><span className={a.paymentStatus === 'paid' ? 'paid-text' : 'unpaid-text'}>{a.paymentStatus === 'paid' ? `تم الدفع ${paymentText[a.paymentMethod] || ''}` : 'مستحق'}</span></div>{a.paymentStatus === 'paid' ? <button className="button-ghost payment-action" onClick={() => setModal({ type: 'undoPayment', item: a })}>إلغاء الدفع</button> : <button className="button-primary payment-action" onClick={() => setModal({ type: 'payment', item: a })}>تسجيل الدفع</button>}</div>)}</div> : <Empty icon={WalletCards} title={search ? 'لا توجد نتائج' : 'لا توجد دفعات هنا'} description={search ? 'جرّب اسماً أو خدمة أخرى.' : 'ستظهر الدفعات هنا عندما تضيف مواعيد.'} />}</div></>;
  };

  const renderReports = () => {
    const rangeStart = reportRange === 'week' ? addDays(today, -6) : reportRange === 'month' ? `${today.slice(0, 7)}-01` : '0000-01-01';
    const list = data.appointments.filter(a => a.date >= rangeStart && a.date <= today && a.status !== 'cancelled');
    const revenue = paid.filter(a => a.paidAt >= rangeStart && a.paidAt <= today).reduce((sum, a) => sum + a.price, 0);
    const exportList = data.appointments.filter(a => (a.date >= rangeStart && a.date <= today && a.status !== 'cancelled') || (a.paidAt >= rangeStart && a.paidAt <= today));
    const completed = list.filter(a => a.status === 'completed').length;
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const values = days.map(day => paid.filter(a => a.paidAt === day).reduce((sum, a) => sum + a.price, 0));
    const peakRevenue = Math.max(...values, 0);
    const max = Math.max(peakRevenue, 1);
    const serviceCounts = new Map(data.services.map(s => [s.id, { id: s.id, name: s.name, count: 0 }]));
    list.forEach(a => {
      const entry = serviceCounts.get(a.serviceId) || { id: a.serviceId, name: a.serviceName, count: 0 };
      entry.count++;
      serviceCounts.set(a.serviceId, entry);
    });
    const services = [...serviceCounts.values()].sort((a, b) => b.count - a.count);
    const maxService = Math.max(...services.map(s => s.count), 1);
    return <><div className="page-heading"><div><div className="eyebrow">قرارات أذكى</div><h1>التقارير</h1><p>راقب أداء صالونك واعرف أين تنمو.</p></div><div className="heading-actions"><select className="range-select" value={reportRange} onChange={e => setReportRange(e.target.value)} aria-label="فترة التقرير"><option value="week">آخر ٧ أيام</option><option value="month">هذا الشهر</option><option value="all">كل الوقت</option></select><button className="button-ghost" onClick={() => exportReport(exportList)}><Download size={17} /> تصدير CSV</button></div></div>
      <div className="metrics-grid reports-metrics"><MetricCard icon={WalletCards} label="الإيرادات المحصّلة" value={money(revenue)} note="خلال الفترة المحددة" tone="orange" /><MetricCard icon={CalendarCheck2} label="المواعيد المكتملة" value={n(completed)} note="مواعيد أُنجزت" tone="green" /><MetricCard icon={UsersRound} label="الزبائن النشطون" value={n(new Set(list.map(a => a.clientId)).size)} note="زاروا الصالون" tone="blue" /><MetricCard icon={TrendingUp} label="متوسط قيمة الموعد" value={money(list.length ? Math.round(list.reduce((sum, a) => sum + a.price, 0) / list.length) : 0)} note="لكل حجز في الفترة" tone="purple" /></div>
      <div className="reports-grid"><section className="panel report-chart-panel"><SectionTitle title="حركة الإيرادات" subtitle="الدفعات المحصّلة خلال آخر ٧ أيام" /><div className="big-chart"><div className="chart-guide"><span>{money(peakRevenue)}</span><span>{money(Math.round(peakRevenue / 2))}</span><span>{money(0)}</span></div><div className="big-chart-columns">{days.map((day, i) => <div className="big-chart-col" key={day} title={`${dateLabel(day)}: ${money(values[i])}`}><div className="big-bar-track"><div className={`big-bar ${day === today ? 'current' : ''}`} style={{ height: `${Math.max(values[i] ? 5 : 2, values[i] / max * 100)}%` }} /></div><span>{weekDay(day)}</span></div>)}</div></div></section>
      <section className="panel report-services"><SectionTitle title="الخدمات الأكثر طلباً" subtitle="حسب عدد الحجوزات في الفترة" />{services.some(s => s.count > 0) ? <div className="service-bars">{services.map((s, i) => <div className="service-bar-row" key={s.id}><div className="service-bar-label"><span className="service-rank">{n(i + 1).padStart(2, '٠')}</span><strong>{s.name}</strong><span>{n(s.count)} حجوزات</span></div><div className="progress-track"><span style={{ width: `${s.count / maxService * 100}%` }} /></div></div>)}</div> : <Empty icon={ChartNoAxesColumnIncreasing} title="لا توجد بيانات بعد" description="ستظهر الخدمات الأكثر طلباً بمجرد إضافة مواعيد لهذه الفترة." />}</section></div></>;
  };

  const renderSettings = () => <><div className="page-heading"><div><div className="eyebrow">اصنع مساحتك</div><h1>الإعدادات</h1><p>اضبط تفاصيل صالونك وخدماتك.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><SectionTitle title="معلومات الصالون" subtitle="كيف يظهر اسم صالونك داخل التطبيق" /><div className="form-body settings-form"><label className="field"><span>اسم الصالون</span><input value={data.shopName} onChange={e => setData(prev => ({ ...prev, shopName: e.target.value }))} placeholder="اسم الصالون" /></label><label className="field"><span>التحية على لوحة التحكم</span><input value={data.ownerName} onChange={e => setData(prev => ({ ...prev, ownerName: e.target.value }))} placeholder="أهلاً بك" /></label><p className="settings-hint"><CircleCheck size={16} /> تُحفظ التغييرات تلقائياً في هذا المتصفح.</p></div></section><section className="panel settings-panel"><SectionTitle title="الخدمات والأسعار" subtitle="الخدمات التي تقدمها لزبائنك" action={<button className="text-link" onClick={() => setModal({ type: 'service' })}><Plus size={17} /> إضافة خدمة</button>} /><div className="settings-services">{data.services.map(s => <div className="settings-service" key={s.id}><span className="service-icon"><Scissors size={17} /></span><div><strong>{s.name}</strong><small>{s.duration} دقيقة</small></div><b>{money(s.price)}</b><button className="icon-button" aria-label={`تعديل ${s.name}`} onClick={() => setModal({ type: 'service', item: s })}><Pencil size={16} /></button></div>)}{!data.services.length && <Empty icon={Scissors} title="لا توجد خدمات" description="أضف خدمات الصالون وأسعارها للبدء." />}</div></section></div><div className="panel backup-panel"><div className="backup-icon"><FileDown size={23} /></div><div><h3>نسخة احتياطية من بياناتك</h3><p>نزّل بياناتك كملف JSON أو استعد نسخة محفوظة على جهازك.</p></div><div className="backup-actions"><input ref={importInput} type="file" accept=".json,application/json" hidden onChange={e => { prepareRestore(e.target.files?.[0]); e.target.value = ''; }} /><button className="button-ghost" onClick={() => importInput.current?.click()}><FileDown size={17} /> استعادة نسخة</button><button className="button-ghost" onClick={exportData}><Download size={17} /> تنزيل نسخة</button></div></div></>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}><div className="sidebar-top"><Brand /><button className="sidebar-close icon-button" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة"><X size={19} /></button></div><div className="sidebar-section-label">القائمة الرئيسية</div><nav className="sidebar-nav">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => go(item.id)}><item.icon size={20} strokeWidth={page === item.id ? 2.35 : 1.9} /><span>{item.label}</span>{page === item.id && <i />}</button>)}</nav><div className="sidebar-section-label section-label-bottom">عام</div><nav className="sidebar-nav"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}><Settings2 size={20} /><span>الإعدادات</span>{page === 'settings' && <i />}</button></nav><div className="sidebar-bottom"><div className="sidebar-help"><span className="help-icon"><Sparkles size={20} /></span><strong>كل شيء تحت السيطرة</strong><p>وقت أقل في التنظيم، وقت أكثر للإبداع.</p></div><div className="shop-profile"><span className="shop-avatar"><Scissors size={18} /></span><div><strong>{data.shopName || 'صالونك'}</strong><small>مساحة العمل</small></div><MoreHorizontal size={18} /></div></div></aside>
    {mobileMenu && <div className="menu-scrim" onClick={() => setMobileMenu(false)} />}
    <div className="main-area"><header className="topbar"><div className="topbar-start"><button className="icon-button mobile-menu-button" aria-label="فتح القائمة" onClick={() => setMobileMenu(true)}><Menu size={23} /></button><div className="mobile-brand"><Brand compact /></div><div className="breadcrumb"><span>مساحة العمل</span><ChevronLeft size={15} /><strong>{pageTitles[page]}</strong></div></div><div className="topbar-end"><span className="topbar-date"><CalendarDays size={17} />{dateLabel(today)}</span><div className="notification-wrap"><button className="topbar-icon" aria-label="المواعيد القادمة" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={19} />{upcoming.length > 0 && <i />}</button>{notificationsOpen && <div className="notification-popover"><strong>المواعيد القادمة</strong>{upcoming.length ? upcoming.map(a => <button key={a.id} onClick={() => { setNotificationsOpen(false); setModal({ type: 'appointment', item: a }); }}><span>{byId[a.clientId]?.name || 'زبون محذوف'} · {a.serviceName}</span><small>{dateLabel(a.date, { day: 'numeric', month: 'short' })}، {timeLabel(a.time)}</small></button>) : <p>لا توجد مواعيد قادمة.</p>}</div>}</div><span className="topbar-divider" /><span className="topbar-user"><span className="user-avatar"><Scissors size={17} /></span><span><strong>{data.shopName || 'صالونك'}</strong><small>حساب الصالون</small></span></span></div></header>
      <main className="content">{page === 'dashboard' && <><div className="welcome"><div><div className="eyebrow">{dateLabel(today)}</div><h1>{data.ownerName || 'أهلاً بك'} <span>👋</span></h1><p>إليك ما يحدث في صالونك اليوم.</p></div><span className="welcome-status"><span /> صالونك في أفضل حال</span></div>{renderDashboard()}</>}{page === 'appointments' && renderAppointments()}{page === 'clients' && renderClients()}{page === 'payments' && renderPayments()}{page === 'reports' && renderReports()}{page === 'settings' && renderSettings()}<footer className="main-footer">صُنع بشغف للحلاقين <span>✦</span> مِقص © {new Date().getFullYear()}</footer></main>
    </div><nav className="mobile-bottom-nav">{nav.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => go(item.id)}><item.icon size={21} strokeWidth={page === item.id ? 2.4 : 1.8} /><span>{item.label}</span></button>)}</nav>
    {toast && <div className={`toast ${toast.type === 'error' ? 'toast-error' : ''}`} role="status">{toast.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}{toast.text}<button aria-label="إغلاق" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal?.type === 'client' && <ClientForm key={modal.item?.id || 'new-client'} item={modal.item} onSave={saveClient} onClose={() => setModal(null)} onDelete={item => askDelete('client', item)} />}
    {modal?.type === 'appointment' && <AppointmentForm key={`${modal.item?.id || 'new-appointment'}-${modal.draft?.clientId || ''}`} item={modal.item} draft={modal.draft} defaultSlot={nextOpenSlot(data.appointments, data.services[0]?.duration)} clients={data.clients} services={data.services} onSave={saveAppointment} onClose={() => setModal(null)} onDelete={item => askDelete('appointment', item)} onNewClient={draft => setModal({ type: 'client', returnToAppointment: { item: modal.item, draft } })} />}
    {modal?.type === 'service' && <ServiceForm key={modal.item?.id || 'new-service'} item={modal.item} onSave={saveService} onClose={() => setModal(null)} onDelete={item => askDelete('service', item)} />}
    {modal?.type === 'payment' && <PaymentForm item={modal.item} client={byId[modal.item.clientId]} onSave={pay} onClose={() => setModal(null)} />}
    {modal?.type === 'clientDetails' && <Modal title="ملف الزبون" subtitle="نظرة كاملة على زياراته" onClose={() => setModal(null)}><div className="form-body"><div className="detail-client"><Avatar name={modal.item.name} size="avatar-lg" /><div><h3>{modal.item.name}</h3><a href={`tel:${modal.item.phone.replace(/[^+\d]/g, '')}`} dir="ltr"><Phone size={15} /> {modal.item.phone}</a></div></div>{modal.item.notes && <div className="client-note"><strong>ملاحظات</strong><p>{modal.item.notes}</p></div>}<h3 className="history-title">سجل المواعيد</h3><div className="history-list">{orderedAppointments.filter(a => a.clientId === modal.item.id).reverse().map(a => <div className="history-row" key={a.id}><span className="history-icon"><CalendarDays size={17} /></span><div><strong>{a.serviceName}</strong><small>{dateLabel(a.date)} · {timeLabel(a.time)}</small></div><b>{money(a.price)}</b></div>)}{!orderedAppointments.some(a => a.clientId === modal.item.id) && <p className="muted">لا توجد مواعيد لهذا الزبون بعد.</p>}</div></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal({ type: 'client', item: modal.item })}><Pencil size={16} /> تعديل البيانات</button><button className="button-primary" onClick={() => setModal({ type: 'appointment', draft: { clientId: modal.item.id } })}><Plus size={17} /> موعد جديد</button></div></Modal>}
    {modal?.type === 'delete' && <Modal title="تأكيد الحذف" onClose={() => setModal(null)}><div className="form-body confirm-body"><span className="confirm-icon"><Trash2 size={26} /></span><h3>هل تريد حذف {modal.kind === 'client' ? 'هذا الزبون' : modal.kind === 'service' ? 'هذه الخدمة' : 'هذا الموعد'}؟</h3><p>{modal.kind === 'client' ? 'سيتم حذف الزبون وجميع مواعيده ودفعاته نهائياً. لا يمكن التراجع عن هذه الخطوة.' : 'لا يمكن التراجع عن هذه الخطوة.'}</p></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal(null)}>إلغاء</button><button className="button-danger" onClick={() => deleteItem(modal.kind, modal.item.id)}><Trash2 size={17} /> نعم، احذف</button></div></Modal>}
    {modal?.type === 'undoPayment' && <Modal title="إلغاء تسجيل الدفعة" onClose={() => setModal(null)}><div className="form-body confirm-body"><span className="confirm-icon"><WalletCards size={26} /></span><h3>إعادة الدفعة إلى المستحقات؟</h3><p>سيظهر مبلغ {money(modal.item.price)} كدفعة مستحقة مجدداً. يمكنك تسجيل الدفع في أي وقت.</p></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal(null)}>تراجع</button><button className="button-primary" onClick={() => { undoPay(modal.item.id); setModal(null); }}>تأكيد الإلغاء</button></div></Modal>}
    {modal?.type === 'restore' && <Modal title="استعادة نسخة احتياطية" onClose={() => setModal(null)}><div className="form-body confirm-body"><span className="confirm-icon"><FileDown size={26} /></span><h3>استبدال البيانات الحالية؟</h3><p>سيتم استبدال الزبائن والمواعيد والخدمات الموجودة بمحتويات الملف ({n(modal.data.clients.length)} زبائن، {n(modal.data.appointments.length)} مواعيد). لا يمكن التراجع بعد التأكيد.</p></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal(null)}>إلغاء</button><button className="button-danger" onClick={() => { setData(modal.data); setModal(null); showToast('تم استعادة النسخة الاحتياطية'); }}>استعادة البيانات</button></div></Modal>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
