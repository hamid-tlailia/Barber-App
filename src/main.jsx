import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Award, Banknote, Bell, Boxes,
  CalendarCheck2, CalendarClock, CalendarDays, ChartNoAxesColumnIncreasing, Check,
  CheckCircle2, ChevronLeft, ChevronRight, CircleCheck, Clock3, CreditCard, Download,
  FileDown, HandCoins, LayoutDashboard, Menu, MessageCircle, Moon, MoreHorizontal,
  Package, PackageCheck, PackagePlus, Pencil, Phone, Plus, Printer, ReceiptText, Save,
  Scissors, Search, Settings2, ShieldCheck, Sparkles, Sun, Trash2, TrendingUp,
  TriangleAlert, UserPlus, UsersRound, WalletCards, X,
} from 'lucide-react';
import {
  STORAGE_KEY, addDays, dateLabel, hasAppointmentConflict, isDateString, loadData,
  localISO, money, nextOpenSlot, paymentText, sortAppointments, statusText, timeLabel, uid,
} from './data';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/tajawal/arabic-700.css';
import '@fontsource/tajawal/arabic-800.css';
import './style.css';

const THEME_KEY = 'miqass-theme-mode-v1';
const nav = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'appointments', label: 'المواعيد', icon: CalendarDays },
  { id: 'clients', label: 'الزبائن', icon: UsersRound },
  { id: 'payments', label: 'الدفعات والفواتير', icon: WalletCards },
  { id: 'inventory', label: 'المخزون', icon: Boxes },
  { id: 'staff', label: 'فريق العمل', icon: UsersRound },
  { id: 'reports', label: 'التقارير', icon: ChartNoAxesColumnIncreasing },
];
const mobileNav = nav.filter(item => ['dashboard', 'appointments', 'clients', 'payments', 'inventory'].includes(item.id));
const pageTitles = {
  dashboard: 'لوحة التحكم', appointments: 'المواعيد', clients: 'الزبائن', payments: 'الدفعات والفواتير',
  inventory: 'المخزون', staff: 'فريق العمل', reports: 'التقارير', settings: 'الإعدادات',
};
const initials = name => (name || '؟').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
const appointmentTime = appointment => new Date(`${appointment.date}T${appointment.time}:00`).getTime();
const weekDay = date => dateLabel(date, { weekday: 'short' });
const n = value => new Intl.NumberFormat('ar-QA').format(value || 0);
const phoneDigits = phone => String(phone || '').replace(/\D/g, '');
const qatarWhatsAppNumber = phone => {
  const digits = phoneDigits(phone);
  return digits.startsWith('974') || digits.length !== 8 ? digits : `974${digits}`;
};
const loyaltyPoints = (clientId, appointments) => Math.floor(
  appointments.filter(item => item.clientId === clientId && item.paymentStatus === 'paid')
    .reduce((sum, item) => sum + Number(item.price || 0), 0) / 10,
);
const makeWhatsAppLink = (phone, message = '') => `https://wa.me/${qatarWhatsAppNumber(phone)}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <span className="brand-symbol"><Scissors size={21} strokeWidth={2.35} /></span>
    <span className="brand-copy"><strong>مِقص<span className="brand-dot">.</span></strong>{!compact && <small>BARBER STUDIO · إدارة أذكى</small>}</span>
  </div>;
}

function Avatar({ name, index = 0, size = '' }) {
  return <span className={`avatar avatar-${Math.abs(index) % 5} ${size}`} aria-label={name || 'مستخدم'}>{initials(name)}</span>;
}

function Badge({ status }) {
  return <span className={`badge badge-${status}`}><span className="badge-dot" />{statusText[status] || statusText.pending}</span>;
}

function Empty({ icon: Icon = CalendarDays, title, description, action }) {
  return <div className="empty"><div className="empty-icon"><Icon size={26} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function SectionTitle({ title, subtitle, action }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function MetricCard({ icon: Icon, label, value, note, tone = 'orange', marker }) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon tone-${tone}`}><Icon size={20} /></span>{marker && <span className="metric-marker">{marker}</span>}</div><div className="metric-value">{value}</div><div className="metric-label">{label}</div>{note && <div className="metric-note">{note}</div>}</article>;
}

function SearchInput({ value, onChange, placeholder }) {
  return <label className="search-field"><Search size={17} /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}

function Tabs({ items, active, onChange }) {
  return <div className="tabs" role="tablist">{items.map(item => <button type="button" role="tab" aria-selected={active === item.id} key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>;
}

function AppointmentItem({ appointment: item, client, staff, onEdit, onStatus, onPay, onInvoice, compact = false }) {
  return <div className={`appointment-item ${item.status === 'cancelled' ? 'appointment-cancelled' : ''}`}>
    <div className="appointment-time"><strong dir="ltr">{timeLabel(item.time)}</strong><span>{item.duration} دقيقة</span></div>
    <div className="appointment-person"><Avatar name={client?.name} index={(client?.name || '').length} /><div className="person-info"><strong>{client?.name || 'زبون محذوف'}</strong><span>{item.serviceName}{staff?.name ? ` · ${staff.name}` : ''}</span></div></div>
    <div className="appointment-price">{money(item.price)}</div>
    <div className="appointment-state"><Badge status={item.status} />{!compact && <span className={item.paymentStatus === 'paid' ? 'paid-text' : 'unpaid-text'}>{item.paymentStatus === 'paid' ? 'تم الدفع' : 'لم يُدفع'}</span>}</div>
    <div className="appointment-actions">
      {item.paymentStatus === 'paid' && <button type="button" className="icon-button action-invoice" onClick={() => onInvoice(item)} title="عرض الفاتورة" aria-label="عرض الفاتورة"><ReceiptText size={17} /></button>}
      {item.status !== 'cancelled' && item.paymentStatus !== 'paid' && <button type="button" className="icon-button action-pay" onClick={() => onPay(item)} title="تسجيل دفعة" aria-label="تسجيل دفعة"><WalletCards size={17} /></button>}
      {item.status === 'pending' && <button type="button" className="icon-button action-confirm" onClick={() => onStatus(item.id, 'confirmed')} title="تأكيد الموعد" aria-label="تأكيد الموعد"><Check size={18} /></button>}
      {item.status === 'confirmed' && <button type="button" className="icon-button action-confirm" onClick={() => onStatus(item.id, 'completed')} title="إنهاء الموعد" aria-label="إنهاء الموعد"><CheckCircle2 size={17} /></button>}
      <button type="button" className="icon-button" onClick={() => onEdit(item)} title="تفاصيل وتعديل الموعد" aria-label="تفاصيل وتعديل الموعد"><ChevronLeft size={18} /></button>
    </div>
  </div>;
}

function Modal({ title, subtitle, onClose, children, wide = false, className = '' }) {
  useEffect(() => {
    const handleKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-button close-button" onClick={onClose} aria-label="إغلاق"><X size={19} /></button></div>
      {children}
    </div>
  </div>;
}

function FormError({ children }) {
  return children ? <div className="form-error"><TriangleAlert size={16} />{children}</div> : null;
}

function ClientForm({ item, onSave, onClose, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [phone, setPhone] = useState(item?.phone || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [error, setError] = useState('');
  return <Modal title={item ? 'تعديل بيانات الزبون' : 'إضافة زبون جديد'} subtitle="ملف واحد يجمع تفضيلاته وزياراته" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); setError(onSave({ name: name.trim(), phone: phone.trim(), notes: notes.trim() }, item?.id) || ''); }}>
      <div className="form-body">
        <label className="field"><span>اسم الزبون <em>*</em></span><input required value={name} onChange={event => setName(event.target.value)} placeholder="مثال: أحمد محمد" autoFocus /></label>
        <label className="field"><span>رقم الهاتف <em>*</em></span><input required type="tel" dir="ltr" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+974 5555 1234" /></label>
        <label className="field"><span>ملاحظات <small>(اختياري)</small></span><textarea rows="3" value={notes} onChange={event => setNotes(event.target.value)} placeholder="التفضيلات أو أي تفاصيل مفيدة..." /></label>
        <FormError>{error}</FormError>
      </div>
      <div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={16} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Save size={16} /> حفظ الزبون</button></div>
    </form>
  </Modal>;
}

function AppointmentForm({ item, draft, defaultSlot, clients, services, staff, onSave, onClose, onDelete, onNewClient }) {
  const initial = { ...item, ...draft };
  const [clientId, setClientId] = useState(initial.clientId || clients[0]?.id || '');
  const [serviceId, setServiceId] = useState(initial.serviceId || services[0]?.id || '');
  const [staffId, setStaffId] = useState(initial.staffId || '');
  const [date, setDate] = useState(initial.date || defaultSlot.date);
  const [time, setTime] = useState(initial.time || defaultSlot.time);
  const [status, setStatus] = useState(initial.status || 'confirmed');
  const [notes, setNotes] = useState(initial.notes || '');
  const [error, setError] = useState('');
  const service = services.find(entry => entry.id === serviceId);
  return <Modal title={item ? 'تفاصيل الموعد' : 'موعد جديد'} subtitle={item ? 'حدّث تفاصيل الحجز وحالته' : 'احجز وقتاً مناسباً لزبونك'} onClose={onClose} wide>
    <form onSubmit={event => { event.preventDefault(); setError(onSave({ clientId, serviceId, staffId, date, time, status, notes: notes.trim() }, item) || ''); }}>
      <div className="form-body">
        <div className="form-grid">
          <div className="field"><span>الزبون <em>*</em></span><div className="input-with-action"><select required value={clientId} onChange={event => setClientId(event.target.value)}><option value="" disabled>اختر الزبون</option>{clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</select><button type="button" onClick={() => onNewClient({ clientId, serviceId, staffId, date, time, status, notes })} className="small-add" title="إضافة زبون" aria-label="إضافة زبون"><UserPlus size={18} /></button></div></div>
          <label className="field"><span>الخدمة <em>*</em></span><select required value={serviceId} onChange={event => setServiceId(event.target.value)}><option value="" disabled>اختر الخدمة</option>{services.map(entry => <option value={entry.id} key={entry.id}>{entry.name} — {money(entry.price)}</option>)}</select></label>
          <label className="field"><span>الحلاق المسؤول</span><select value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">بدون تعيين</option>{staff.map(member => <option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}</select></label>
          <label className="field"><span>التاريخ <em>*</em></span><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <label className="field"><span>الوقت <em>*</em></span><input required type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
          <label className="field"><span>حالة الموعد</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="pending">بانتظار التأكيد</option><option value="confirmed">مؤكد</option><option value="completed">مكتمل</option><option value="cancelled">ملغي</option></select></label>
          <div className="field"><span>تفاصيل الخدمة</span><div className="service-preview"><Scissors size={17} />{service ? <>{money(service.price)} <span>·</span> {service.duration} دقيقة</> : 'اختر خدمة'}</div></div>
        </div>
        <label className="field"><span>ملاحظات <small>(اختياري)</small></span><textarea rows="2" value={notes} onChange={event => setNotes(event.target.value)} placeholder="تفاصيل إضافية عن الموعد..." /></label>
        <FormError>{error}</FormError>
      </div>
      <div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={16} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Check size={16} /> {item ? 'حفظ التغييرات' : 'إضافة الموعد'}</button></div>
    </form>
  </Modal>;
}

function ServiceForm({ item, onSave, onClose, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price ?? '');
  const [duration, setDuration] = useState(item?.duration ?? 30);
  return <Modal title={item ? 'تعديل الخدمة' : 'خدمة جديدة'} subtitle="حدّث قائمة خدمات صالونك" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave({ name: name.trim(), price: Number(price), duration: Number(duration) }, item?.id); }}>
      <div className="form-body"><label className="field"><span>اسم الخدمة</span><input required value={name} onChange={event => setName(event.target.value)} placeholder="مثال: قص الشعر" autoFocus /></label><div className="form-grid"><label className="field"><span>السعر (ر.ق)</span><input required min="0" step="0.01" type="number" value={price} onChange={event => setPrice(event.target.value)} /></label><label className="field"><span>المدة (دقيقة)</span><input required min="5" step="5" type="number" value={duration} onChange={event => setDuration(event.target.value)} /></label></div></div>
      <div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={16} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Save size={16} /> حفظ الخدمة</button></div>
    </form>
  </Modal>;
}

function StaffForm({ item, onSave, onClose, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [phone, setPhone] = useState(item?.phone || '');
  const [role, setRole] = useState(item?.role || 'حلاق');
  const [specialty, setSpecialty] = useState(item?.specialty || '');
  const [commission, setCommission] = useState(item?.commission ?? 30);
  const [error, setError] = useState('');
  return <Modal title={item ? 'تعديل بيانات الحلاق' : 'إضافة عضو للفريق'} subtitle="نظّم الأدوار وجدول الحجوزات" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); setError(onSave({ name: name.trim(), phone: phone.trim(), role: role.trim(), specialty: specialty.trim(), commission: Number(commission) }, item?.id) || ''); }}>
      <div className="form-body"><label className="field"><span>الاسم <em>*</em></span><input required value={name} onChange={event => setName(event.target.value)} placeholder="اسم الحلاق" autoFocus /></label><div className="form-grid"><label className="field"><span>المسمى الوظيفي</span><input value={role} onChange={event => setRole(event.target.value)} placeholder="حلاق" /></label><label className="field"><span>رقم الهاتف</span><input type="tel" dir="ltr" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+974 5555 1234" /></label></div><label className="field"><span>التخصص</span><input value={specialty} onChange={event => setSpecialty(event.target.value)} placeholder="قصات عصرية، عناية باللحية..." /></label><label className="field"><span>نسبة العمولة <small>(للتقدير فقط)</small></span><div className="percent-input"><input required type="number" min="0" max="100" step="1" value={commission} onChange={event => setCommission(event.target.value)} /><span>%</span></div></label><p className="field-hint">العمولة هنا للتقارير التقديرية، ولا تُنشئ مسير رواتب أو دفعة فعلية.</p><FormError>{error}</FormError></div>
      <div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={16} /> حذف</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Save size={16} /> حفظ بيانات الفريق</button></div>
    </form>
  </Modal>;
}

function ProductForm({ item, onSave, onClose, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || 'العناية بالشعر');
  const [quantity, setQuantity] = useState(item?.quantity ?? 0);
  const [minStock, setMinStock] = useState(item?.minStock ?? 3);
  const [cost, setCost] = useState(item?.cost ?? '');
  const [price, setPrice] = useState(item?.price ?? '');
  const [unit, setUnit] = useState(item?.unit || 'قطعة');
  const [error, setError] = useState('');
  return <Modal title={item ? 'تعديل المنتج' : 'إضافة منتج للمخزون'} subtitle="تابع التكلفة والكمية وحدّ إعادة الطلب" onClose={onClose} wide>
    <form onSubmit={event => { event.preventDefault(); setError(onSave({ name: name.trim(), category: category.trim(), quantity: Number(quantity), minStock: Number(minStock), cost: Number(cost), price: Number(price), unit: unit.trim() || 'قطعة' }, item?.id) || ''); }}>
      <div className="form-body"><div className="form-grid"><label className="field"><span>اسم المنتج <em>*</em></span><input required value={name} onChange={event => setName(event.target.value)} placeholder="مثال: شمع تصفيف مطفي" autoFocus /></label><label className="field"><span>الفئة</span><input value={category} onChange={event => setCategory(event.target.value)} placeholder="العناية بالشعر" /></label><label className="field"><span>الكمية الحالية</span><input required type="number" min="0" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label className="field"><span>حد التنبيه للمخزون</span><input required type="number" min="0" step="1" value={minStock} onChange={event => setMinStock(event.target.value)} /></label><label className="field"><span>تكلفة الوحدة (ر.ق)</span><input required type="number" min="0" step="0.01" value={cost} onChange={event => setCost(event.target.value)} /></label><label className="field"><span>سعر البيع (ر.ق)</span><input required type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label><label className="field"><span>وحدة القياس</span><input value={unit} onChange={event => setUnit(event.target.value)} placeholder="قطعة، علبة، زجاجة" /></label></div><FormError>{error}</FormError></div>
      <div className="modal-footer">{item && <button type="button" className="button-danger-ghost" onClick={() => onDelete(item)}><Trash2 size={16} /> حذف المنتج</button>}<div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><Save size={16} /> حفظ المنتج</button></div>
    </form>
  </Modal>;
}

function StockForm({ item, onSave, onClose }) {
  const [direction, setDirection] = useState('in');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  return <Modal title="حركة مخزون" subtitle={`تحديث رصيد «${item.name}»`} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); setError(onSave(item.id, { direction, quantity: Number(quantity), note: note.trim() }) || ''); }}>
      <div className="form-body"><div className="stock-current"><span>الرصيد الحالي</span><strong>{n(item.quantity)} <small>{item.unit}</small></strong></div><div className="field"><span>نوع الحركة</span><div className="stock-direction"><button type="button" className={direction === 'in' ? 'selected stock-in' : ''} onClick={() => setDirection('in')}><ArrowDownToLine size={17} /> توريد للمخزون</button><button type="button" className={direction === 'out' ? 'selected stock-out' : ''} onClick={() => setDirection('out')}><ArrowRight size={17} /> صرف / استخدام</button></div></div><label className="field"><span>الكمية</span><input required type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label className="field"><span>ملاحظة <small>(اختياري)</small></span><input value={note} onChange={event => setNote(event.target.value)} placeholder={direction === 'in' ? 'فاتورة المورد أو رقم الطلب' : 'استخدام داخلي أو سبب الصرف'} /></label><FormError>{error}</FormError></div>
      <div className="modal-footer"><div className="footer-spacer" /><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="submit" className="button-primary"><PackageCheck size={17} /> تسجيل الحركة</button></div>
    </form>
  </Modal>;
}

function PaymentForm({ item, client, onSave, onClose }) {
  const [method, setMethod] = useState('cash');
  const methods = [{ id: 'cash', label: 'نقداً', icon: Banknote }, { id: 'card', label: 'بطاقة', icon: CreditCard }, { id: 'transfer', label: 'تحويل', icon: WalletCards }];
  return <Modal title="تسجيل دفعة" subtitle="أكّد استلام قيمة الخدمة" onClose={onClose}>
    <div className="form-body"><div className="payment-summary"><div><span>الزبون</span><strong>{client?.name || 'زبون محذوف'}</strong></div><div><span>الخدمة</span><strong>{item.serviceName}</strong></div><div><span>المبلغ المستحق</span><strong className="orange-text">{money(item.price)}</strong></div></div><div className="field"><span>طريقة الدفع</span><div className="method-options">{methods.map(option => <button key={option.id} type="button" className={method === option.id ? 'selected' : ''} onClick={() => setMethod(option.id)}><option.icon size={18} />{option.label}</button>)}</div></div><p className="field-hint">هذا الإجراء يسجل الدفع داخل الدفتر فقط؛ لا يعالج عملية بطاقة مصرفية.</p></div>
    <div className="modal-footer"><button type="button" className="button-ghost" onClick={onClose}>إلغاء</button><button type="button" className="button-primary" onClick={() => onSave(item.id, method)}><Check size={16} /> تأكيد الدفع</button></div>
  </Modal>;
}

function InvoiceModal({ item, client, shopName, onClose }) {
  const invoiceNumber = `MQ-${item.date.replaceAll('-', '')}-${item.id.slice(-5).toUpperCase()}`;
  return <Modal title="فاتورة مبسطة" subtitle="جاهزة للطباعة أو الحفظ بصيغة PDF" onClose={onClose} wide className="invoice-modal">
    <div className="invoice-toolbar"><p>يمكنك اختيار «حفظ كملف PDF» من نافذة الطباعة.</p><button type="button" className="button-primary" onClick={() => window.print()}><Printer size={17} /> طباعة / حفظ PDF</button></div>
    <article className="invoice-paper" dir="rtl">
      <div className="invoice-brand-row"><Brand compact /><span className="invoice-status">{item.paymentStatus === 'paid' ? 'مدفوعة' : 'مستحقة'}</span></div>
      <div className="invoice-title"><div><span>فاتورة مبسطة</span><h2>{shopName || 'صالون مِقص'}</h2></div><div className="invoice-number"><small>رقم الفاتورة</small><strong dir="ltr">{invoiceNumber}</strong></div></div>
      <div className="invoice-meta"><div><small>تاريخ الموعد</small><strong>{dateLabel(item.date)}</strong></div><div><small>وقت الموعد</small><strong>{timeLabel(item.time)}</strong></div><div><small>طريقة الدفع</small><strong>{item.paymentStatus === 'paid' ? paymentText[item.paymentMethod] || 'مسجلة' : 'غير مسددة'}</strong></div></div>
      <div className="invoice-client"><small>فاتورة إلى</small><strong>{client?.name || 'زبون محذوف'}</strong><span dir="ltr">{client?.phone || ''}</span></div>
      <div className="invoice-line invoice-line-head"><span>الخدمة</span><span>المدة</span><span>المبلغ</span></div>
      <div className="invoice-line"><span>{item.serviceName}</span><span>{n(item.duration)} دقيقة</span><strong>{money(item.price)}</strong></div>
      <div className="invoice-total"><span>الإجمالي</span><strong>{money(item.price)}</strong></div>
      <div className="invoice-thanks"><Sparkles size={17} /><span>شكراً لزيارتك — نتطلع لرؤيتك مجدداً.</span></div>
      <small className="invoice-footnote">هذه فاتورة مبسطة صادرة من نظام مِقص لإدارة الصالون.</small>
    </article>
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
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [reportRange, setReportRange] = useState('month');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const importInput = useRef(null);
  const today = localISO();
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return ['system', 'light', 'dark'].includes(saved) ? saved : 'system';
    } catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const resolvedTheme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;
  const byId = useMemo(() => Object.fromEntries(data.clients.map(client => [client.id, client])), [data.clients]);
  const staffById = useMemo(() => Object.fromEntries((data.staff || []).map(member => [member.id, member])), [data.staff]);
  const orderedAppointments = useMemo(() => [...data.appointments].sort(sortAppointments), [data.appointments]);
  const todayAppointments = orderedAppointments.filter(item => item.date === today && item.status !== 'cancelled');
  const upcoming = orderedAppointments.filter(item => item.status !== 'cancelled' && item.status !== 'completed' && appointmentTime(item) >= Date.now()).slice(0, 3);
  const unpaid = data.appointments.filter(item => item.paymentStatus === 'unpaid' && item.status !== 'cancelled');
  const paid = data.appointments.filter(item => item.paymentStatus === 'paid');
  const lowStock = (data.products || []).filter(product => Number(product.quantity) <= Number(product.minStock));
  const showToast = (text, type = 'success') => setToast({ text, type });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* The app remains usable if browser storage is disabled. */ }
  }, [data]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const update = event => setSystemDark(event.matches);
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener(update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#11100f' : '#f7f5f0');
    try { localStorage.setItem(THEME_KEY, themeMode); } catch { /* Theme still applies for this session. */ }
  }, [resolvedTheme, themeMode]);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const go = destination => {
    setPage(destination);
    setSearch('');
    setMobileMenu(false);
    setNotificationsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const saveClient = (values, id) => {
    if (!values.name || !values.phone) return 'الاسم ورقم الهاتف مطلوبان';
    if (!/^\+?[\d\s()-]{7,20}$/.test(values.phone) || phoneDigits(values.phone).length < 7) return 'أدخل رقم هاتف صحيحاً (٧ أرقام على الأقل)';
    if (data.clients.some(client => phoneDigits(client.phone) === phoneDigits(values.phone) && client.id !== id)) return 'رقم الهاتف مسجّل بالفعل لزبون آخر';
    const clientId = id || uid();
    setData(previous => ({ ...previous, clients: id ? previous.clients.map(client => client.id === id ? { ...client, ...values } : client) : [...previous.clients, { id: clientId, ...values, createdAt: today }] }));
    setModal(previous => previous?.returnToAppointment ? { type: 'appointment', item: previous.returnToAppointment.item, draft: { ...previous.returnToAppointment.draft, clientId } } : null);
    showToast(id ? 'تم تحديث بيانات الزبون' : 'تمت إضافة الزبون بنجاح');
    return '';
  };
  const saveAppointment = (values, item) => {
    const service = data.services.find(entry => entry.id === values.serviceId);
    if (!service || !values.clientId || !values.date || !values.time) return 'يرجى إكمال جميع الحقول المطلوبة';
    if (!isDateString(values.date)) return 'أدخل تاريخاً صحيحاً للموعد';
    const duration = item?.paymentStatus === 'paid' ? item.duration : service.duration;
    if (hasAppointmentConflict(data.appointments, { ...values, id: item?.id, duration, staffId: values.staffId })) return 'لدى الحلاق المحدد موعد متداخل. اختر وقتاً مختلفاً أو حلاقاً آخر.';
    if (item?.paymentStatus === 'paid' && (values.status === 'cancelled' || values.serviceId !== item.serviceId)) return 'ألغِ تسجيل الدفعة أولاً قبل إلغاء الموعد أو تغيير الخدمة.';
    const record = {
      ...item, ...values, staffId: values.staffId || '',
      serviceName: item?.paymentStatus === 'paid' ? item.serviceName : service.name,
      price: item?.paymentStatus === 'paid' ? item.price : service.price,
      duration,
    };
    setData(previous => ({ ...previous, appointments: item ? previous.appointments.map(entry => entry.id === item.id ? record : entry) : [...previous.appointments, { ...record, id: uid(), paymentStatus: 'unpaid', paymentMethod: '', paidAt: '', createdAt: today }] }));
    setModal(null);
    showToast(item ? 'تم تحديث الموعد' : 'تمت إضافة الموعد بنجاح');
    return '';
  };
  const changeStatus = (id, status) => {
    setData(previous => ({ ...previous, appointments: previous.appointments.map(item => item.id === id ? { ...item, status } : item) }));
    showToast(status === 'confirmed' ? 'تم تأكيد الموعد' : status === 'completed' ? 'تم إنهاء الموعد' : 'تم تحديث حالة الموعد');
  };
  const pay = (id, method) => {
    setData(previous => ({ ...previous, appointments: previous.appointments.map(item => item.id === id ? { ...item, paymentStatus: 'paid', paymentMethod: method, paidAt: today } : item) }));
    setModal(null);
    showToast('تم تسجيل الدفعة بنجاح');
  };
  const undoPay = id => {
    setData(previous => ({ ...previous, appointments: previous.appointments.map(item => item.id === id ? { ...item, paymentStatus: 'unpaid', paymentMethod: '', paidAt: '' } : item) }));
    showToast('تم إلغاء تسجيل الدفعة');
  };
  const saveService = (values, id) => {
    if (!values.name || !Number.isFinite(values.price) || values.price < 0 || !Number.isFinite(values.duration) || values.duration < 5) return showToast('تحقق من اسم الخدمة والسعر والمدة', 'error');
    setData(previous => ({ ...previous, services: id ? previous.services.map(item => item.id === id ? { ...item, ...values } : item) : [...previous.services, { id: uid(), ...values }] }));
    setModal(null);
    showToast(id ? 'تم تحديث الخدمة' : 'تمت إضافة الخدمة');
  };
  const saveStaff = (values, id) => {
    if (!values.name) return 'الاسم مطلوب';
    if (!Number.isFinite(values.commission) || values.commission < 0 || values.commission > 100) return 'أدخل نسبة عمولة بين ٠ و١٠٠٪';
    if (values.phone && (!/^\+?[\d\s()-]{7,20}$/.test(values.phone) || phoneDigits(values.phone).length < 7)) return 'تحقق من رقم الهاتف';
    setData(previous => ({ ...previous, staff: id ? previous.staff.map(member => member.id === id ? { ...member, ...values } : member) : [...previous.staff, { id: uid(), ...values, createdAt: today }] }));
    setModal(null);
    showToast(id ? 'تم تحديث بيانات الفريق' : 'تمت إضافة الحلاق للفريق');
    return '';
  };
  const saveProduct = (values, id) => {
    if (!values.name || !Number.isFinite(values.quantity) || values.quantity < 0 || !Number.isInteger(values.quantity) || !Number.isFinite(values.minStock) || values.minStock < 0 || !Number.isInteger(values.minStock) || !Number.isFinite(values.cost) || values.cost < 0 || !Number.isFinite(values.price) || values.price < 0) return 'تحقق من الاسم والكميات والأسعار المدخلة';
    const existing = data.products.find(product => product.id === id);
    const delta = existing ? values.quantity - Number(existing.quantity) : values.quantity;
    setData(previous => {
      const products = id
        ? previous.products.map(product => product.id === id ? { ...product, ...values, updatedAt: today } : product)
        : [...previous.products, { id: uid(), ...values, updatedAt: today }];
      const movement = delta ? [{ id: uid(), productId: id || products.at(-1).id, productName: values.name, direction: delta > 0 ? 'in' : 'out', quantity: Math.abs(delta), date: today, note: id ? 'تسوية عند تعديل بيانات المنتج' : 'رصيد افتتاحي' }, ...previous.stockMovements] : previous.stockMovements;
      return { ...previous, products, stockMovements: movement };
    });
    setModal(null);
    showToast(id ? 'تم تحديث المنتج' : 'تمت إضافة المنتج للمخزون');
    return '';
  };
  const saveStockMovement = (id, values) => {
    const product = data.products.find(entry => entry.id === id);
    if (!product || !Number.isInteger(values.quantity) || values.quantity < 1) return 'أدخل كمية صحيحة أكبر من صفر';
    if (values.direction === 'out' && values.quantity > product.quantity) return `الرصيد الحالي ${n(product.quantity)} ${product.unit} فقط`;
    const quantityDelta = values.direction === 'in' ? values.quantity : -values.quantity;
    const movement = { id: uid(), productId: id, productName: product.name, direction: values.direction, quantity: values.quantity, date: today, note: values.note || (values.direction === 'in' ? 'توريد مخزون' : 'استخدام داخل الصالون') };
    setData(previous => ({
      ...previous,
      products: previous.products.map(entry => entry.id === id ? { ...entry, quantity: entry.quantity + quantityDelta, updatedAt: today } : entry),
      stockMovements: [movement, ...previous.stockMovements],
    }));
    setModal(null);
    showToast(values.direction === 'in' ? 'تم تسجيل التوريد' : 'تم تسجيل صرف المخزون');
    return '';
  };
  const askDelete = (kind, item) => setModal({ type: 'delete', kind, item });
  const deleteItem = (kind, id) => {
    if (kind === 'client') setData(previous => ({ ...previous, clients: previous.clients.filter(item => item.id !== id), appointments: previous.appointments.filter(item => item.clientId !== id) }));
    if (kind === 'appointment') setData(previous => ({ ...previous, appointments: previous.appointments.filter(item => item.id !== id) }));
    if (kind === 'service') setData(previous => ({ ...previous, services: previous.services.filter(item => item.id !== id) }));
    if (kind === 'staff') setData(previous => ({ ...previous, staff: previous.staff.filter(item => item.id !== id), appointments: previous.appointments.map(item => item.staffId === id ? { ...item, staffId: '' } : item) }));
    if (kind === 'product') setData(previous => ({ ...previous, products: previous.products.filter(item => item.id !== id) }));
    setModal(null);
    showToast('تم الحذف بنجاح');
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `miqass-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('تم تنزيل النسخة الاحتياطية');
  };
  const prepareRestore = async file => {
    if (!file) return;
    try {
      const saved = JSON.parse(await file.text());
      const validBase = saved && Array.isArray(saved.clients) && Array.isArray(saved.services) && Array.isArray(saved.appointments)
        && saved.clients.every(client => typeof client.id === 'string' && typeof client.name === 'string' && typeof client.phone === 'string' && isDateString(client.createdAt))
        && saved.services.every(service => typeof service.id === 'string' && typeof service.name === 'string' && Number.isFinite(service.price) && Number.isFinite(service.duration))
        && saved.appointments.every(item => typeof item.id === 'string' && typeof item.clientId === 'string' && typeof item.serviceName === 'string' && Number.isFinite(item.price) && Number.isFinite(item.duration) && isDateString(item.date) && /^\d{2}:\d{2}$/.test(item.time));
      const staff = Array.isArray(saved.staff) ? saved.staff : [];
      const products = Array.isArray(saved.products) ? saved.products : [];
      const stockMovements = Array.isArray(saved.stockMovements) ? saved.stockMovements : [];
      const validExtensions = staff.every(member => typeof member.id === 'string' && typeof member.name === 'string')
        && products.every(product => typeof product.id === 'string' && typeof product.name === 'string' && Number.isFinite(product.quantity) && Number.isFinite(product.minStock) && Number.isFinite(product.cost) && Number.isFinite(product.price))
        && stockMovements.every(movement => typeof movement.productId === 'string' && Number.isFinite(movement.quantity) && isDateString(movement.date));
      if (!validBase || !validExtensions) throw new Error('Invalid backup');
      setModal({ type: 'restore', data: { ...saved, staff, products, stockMovements, shopName: saved.shopName || 'صالون مِقص', ownerName: saved.ownerName || 'أهلاً بك' } });
    } catch { showToast('ملف النسخة الاحتياطية غير صالح', 'error'); }
  };
  const downloadCsv = (filename, rows) => {
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportReport = list => {
    const rows = [
      ['تاريخ الموعد', 'الوقت', 'الزبون', 'الخدمة', 'الحلاق', 'السعر', 'حالة الموعد', 'حالة الدفع', 'تاريخ الدفع', 'طريقة الدفع'],
      ...list.map(item => [item.date, item.time, byId[item.clientId]?.name || 'زبون محذوف', item.serviceName, staffById[item.staffId]?.name || '', item.price, statusText[item.status], item.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق', item.paidAt || '', paymentText[item.paymentMethod] || '']),
    ];
    downloadCsv(`miqass-report-${today}.csv`, rows);
    showToast('تم تنزيل التقرير');
  };
  const exportInventory = () => {
    const rows = [['المنتج', 'الفئة', 'الكمية', 'الوحدة', 'حد التنبيه', 'تكلفة الوحدة', 'سعر البيع', 'قيمة المخزون'], ...data.products.map(product => [product.name, product.category, product.quantity, product.unit, product.minStock, product.cost, product.price, product.quantity * product.cost])];
    downloadCsv(`miqass-inventory-${today}.csv`, rows);
    showToast('تم تصدير قائمة المخزون');
  };
  const openInvoice = item => setModal({ type: 'invoice', item });
  const nextAppointmentSlot = selectedDay => nextOpenSlot(data.appointments, data.services[0]?.duration, selectedDay || today, new Date());

  const renderDashboard = () => {
    const completedToday = todayAppointments.filter(item => item.status === 'completed').length;
    const todayRevenue = paid.filter(item => item.paidAt === today).reduce((sum, item) => sum + item.price, 0);
    const next = upcoming[0];
    const recentDays = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
    const revenues = recentDays.map(day => paid.filter(item => item.paidAt === day).reduce((sum, item) => sum + item.price, 0));
    const max = Math.max(...revenues, 1);
    return <>
      <section className="hero"><div className="hero-content"><div className="hero-eyebrow"><Sparkles size={15} /> صالونك، بإدارة ترتقي بتجربتك</div><h1>كل تفصيلة في مكانها.<br /><span>وكل زيارة تستحق التميّز.</span></h1><p>مواعيد، فريق، ومخزون — لوحة واحدة لأعمالك اليومية.</p><div className="hero-highlights"><span><CalendarCheck2 size={15} /> {n(todayAppointments.length)} مواعيد اليوم</span><span><ShieldCheck size={15} /> بياناتك محفوظة محلياً</span></div></div><div className="hero-action"><button className="button-primary hero-button" onClick={() => setModal({ type: 'appointment' })}><Plus size={18} /> حجز موعد جديد <ArrowLeft size={17} /></button><span>تجربة أكثر سلاسة، من أول حجز.</span></div></section>
      <div className="section-heading section-spaced"><div><h2>ملخص اليوم</h2><p>الصورة الواضحة تبدأ من هنا</p></div><span className="date-chip"><CalendarDays size={15} /> {dateLabel(today)}</span></div>
      <div className="metrics-grid"><MetricCard icon={CalendarDays} label="مواعيد اليوم" value={n(todayAppointments.length)} note="حجوزات على الجدول" tone="orange" marker="اليوم" /><MetricCard icon={CircleCheck} label="مواعيد مكتملة" value={n(completedToday)} note="من مواعيد اليوم" tone="green" /><MetricCard icon={HandCoins} label="إيرادات اليوم" value={money(todayRevenue)} note="دفعات تم تسجيلها" tone="purple" /><MetricCard icon={UsersRound} label="الزبائن" value={n(data.clients.length)} note="في قائمة عملائك" tone="blue" /></div>
      {lowStock.length > 0 && <button className="stock-alert-banner" onClick={() => go('inventory')}><span className="stock-alert-icon"><TriangleAlert size={19} /></span><span><strong>تنبيه مخزون</strong><small>{n(lowStock.length)} منتجات عند حد إعادة الطلب أو أقل</small></span><ChevronLeft size={18} /></button>}
      <div className="dashboard-grid"><section className="panel appointments-panel"><SectionTitle title="مواعيد اليوم" subtitle={`${n(todayAppointments.length)} حجوزات مجدولة`} action={<button className="text-link" onClick={() => { setSelectedDate(today); go('appointments'); }}>عرض الجدول <ChevronLeft size={16} /></button>} />
        {todayAppointments.length ? <div className="appointment-list">{todayAppointments.map(item => <AppointmentItem key={item.id} appointment={item} client={byId[item.clientId]} staff={staffById[item.staffId]} onEdit={record => setModal({ type: 'appointment', item: record })} onStatus={changeStatus} onPay={record => setModal({ type: 'payment', item: record })} onInvoice={openInvoice} compact />)}</div> : <Empty title="مساحة جميلة ليوم جديد" description="لا توجد مواعيد اليوم. أضف أول حجز وابدأ تنظيم يومك." action={<button className="button-primary" onClick={() => setModal({ type: 'appointment' })}><Plus size={16} /> موعد جديد</button>} />}
      </section><div className="dashboard-side"><section className="panel next-panel"><div className="mini-panel-header"><span className="mini-heading-icon"><CalendarClock size={18} /></span><h3>الموعد القادم</h3></div>{next ? <><div className="next-client"><Avatar name={byId[next.clientId]?.name} size="avatar-lg" /><div><strong>{byId[next.clientId]?.name || 'زبون محذوف'}</strong><span>{next.serviceName}{staffById[next.staffId]?.name ? ` · ${staffById[next.staffId].name}` : ''}</span></div></div><div className="next-details"><span><Clock3 size={15} /> {timeLabel(next.time)}</span><span><CalendarDays size={15} /> {next.date === today ? 'اليوم' : dateLabel(next.date, { day: 'numeric', month: 'long' })}</span></div><button className="next-button" onClick={() => setModal({ type: 'appointment', item: next })}>عرض التفاصيل <ChevronLeft size={16} /></button></> : <p className="muted next-empty">لا توجد مواعيد قادمة حالياً.</p>}</section>
      <section className="panel chart-panel"><div className="mini-panel-header"><span className="mini-heading-icon green-icon"><TrendingUp size={18} /></span><h3>أداء الأسبوع</h3></div><strong className="chart-total">{money(revenues.reduce((sum, value) => sum + value, 0))}</strong><span className="chart-caption">إيرادات آخر ٧ أيام</span><div className="mini-chart">{recentDays.map((day, index) => <div className="chart-column" key={day} title={`${dateLabel(day)}: ${money(revenues[index])}`}><div className={`chart-bar ${day === today ? 'current' : ''}`} style={{ height: `${Math.max(8, revenues[index] / max * 100)}%` }} /><span>{weekDay(day)}</span></div>)}</div></section></div></div>
    </>;
  };

  const renderAppointments = () => {
    const days = Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 2));
    const query = search.trim().toLocaleLowerCase('ar-QA');
    const list = orderedAppointments.filter(item => item.date === selectedDate
      && (appointmentFilter === 'all' || item.status === appointmentFilter)
      && `${byId[item.clientId]?.name || ''} ${item.serviceName} ${staffById[item.staffId]?.name || ''}`.toLocaleLowerCase('ar-QA').includes(query));
    const allForDay = data.appointments.filter(item => item.date === selectedDate && item.status !== 'cancelled');
    const addForDay = () => setModal({ type: 'appointment', draft: nextAppointmentSlot(selectedDate) });
    return <><div className="page-heading"><div><div className="eyebrow">تنظيم يومك، باحتراف</div><h1>المواعيد</h1><p>جدول واضح لكل قصّة تبدأ عندك.</p></div><button className="button-primary" onClick={addForDay}><Plus size={17} /> موعد جديد</button></div>
      <div className="panel calendar-panel"><div className="calendar-top"><div><h2>جدول المواعيد</h2><p>{dateLabel(selectedDate)}</p></div><div className="calendar-controls"><button className="button-ghost today-button" onClick={() => setSelectedDate(today)}>اليوم</button><button className="icon-button" aria-label="الأيام السابقة" onClick={() => setSelectedDate(addDays(selectedDate, -7))}><ChevronRight size={18} /></button><button className="icon-button" aria-label="الأيام التالية" onClick={() => setSelectedDate(addDays(selectedDate, 7))}><ChevronLeft size={18} /></button><input type="date" className="date-picker" aria-label="اختيار تاريخ" value={selectedDate} onChange={event => event.target.value && setSelectedDate(event.target.value)} /></div></div><div className="date-strip">{days.map(day => <button key={day} className={`date-tile ${selectedDate === day ? 'selected' : ''} ${today === day ? 'is-today' : ''}`} onClick={() => setSelectedDate(day)}><span>{weekDay(day)}</span><strong>{dateLabel(day, { day: 'numeric' })}</strong><i className={data.appointments.some(item => item.date === day && item.status !== 'cancelled') ? 'has-bookings' : ''} /></button>)}</div></div>
      <div className="panel full-list-panel"><div className="list-toolbar"><div><h2>مواعيد {selectedDate === today ? 'اليوم' : dateLabel(selectedDate, { day: 'numeric', month: 'long' })}</h2><p>{n(allForDay.length)} حجوزات في هذا اليوم</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث عن زبون أو خدمة أو حلاق..." /></div>
      <Tabs items={[{ id: 'all', label: 'الكل' }, { id: 'pending', label: 'قيد الانتظار' }, { id: 'confirmed', label: 'مؤكد' }, { id: 'completed', label: 'مكتمل' }, { id: 'cancelled', label: 'ملغي' }]} active={appointmentFilter} onChange={setAppointmentFilter} />
      {list.length ? <div className="appointment-list">{list.map(item => <AppointmentItem key={item.id} appointment={item} client={byId[item.clientId]} staff={staffById[item.staffId]} onEdit={record => setModal({ type: 'appointment', item: record })} onStatus={changeStatus} onPay={record => setModal({ type: 'payment', item: record })} onInvoice={openInvoice} />)}</div> : <Empty title="لا توجد مواعيد هنا" description={search ? 'جرّب البحث باسم أو خدمة أو حلاق آخر.' : 'لا توجد حجوزات لهذا اليوم أو لهذا التصنيف.'} action={!search && <button className="button-primary" onClick={addForDay}><Plus size={16} /> أضف موعداً</button>} />}</div></>;
  };

  const renderClients = () => {
    const clients = data.clients.filter(client => `${client.name} ${client.phone}`.toLocaleLowerCase('ar-QA').includes(search.trim().toLocaleLowerCase('ar-QA'))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const totalPoints = data.clients.reduce((sum, client) => sum + loyaltyPoints(client.id, data.appointments), 0);
    return <><div className="page-heading"><div><div className="eyebrow">علاقات تدوم</div><h1>الزبائن</h1><p>ملفات مرتبة، تفضيلات محفوظة، وعودة أسهل.</p></div><button className="button-primary" onClick={() => setModal({ type: 'client' })}><UserPlus size={17} /> إضافة زبون</button></div>
      <div className="client-overview"><div className="client-overview-icon"><UsersRound size={24} /></div><div className="overview-copy"><span>مجتمع صالونك</span><strong>{n(data.clients.length)} زبائن</strong><small>تواصل شخصي يصنع فرقاً كبيراً.</small></div><div className="overview-loyalty"><span><Award size={17} /> نقاط الولاء المسجّلة</span><strong>{n(totalPoints)} <small>نقطة</small></strong><small>نقطة واحدة لكل ١٠ ر.ق مدفوعة</small></div><div className="overview-decoration" aria-hidden="true"><UsersRound size={76} /></div></div>
      <div className="panel client-panel"><div className="list-toolbar"><div><h2>قائمة الزبائن</h2><p>تابع بياناتهم وزياراتهم وأرصدة الولاء</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو رقم الهاتف..." /></div>
      {clients.length ? <div className="clients-list"><div className="table-header"><span>الزبون</span><span>رقم الهاتف</span><span>الزيارات</span><span>نقاط الولاء</span><span>آخر زيارة</span><span>إجراءات</span></div>{clients.map((client, index) => {
        const visits = data.appointments.filter(item => item.clientId === client.id && item.status === 'completed');
        const last = [...visits].sort((a, b) => b.date.localeCompare(a.date))[0];
        return <div className="client-row" key={client.id}><button type="button" className="client-primary client-open" onClick={() => setModal({ type: 'clientDetails', item: client })}><Avatar name={client.name} index={index} /><span className="client-primary-copy"><strong>{client.name}</strong><small>زبون منذ {dateLabel(client.createdAt, { month: 'long', year: 'numeric' })}</small></span></button><a className="phone-link" href={`tel:${client.phone.replace(/[^+\d]/g, '')}`} dir="ltr"><Phone size={14} />{client.phone}</a><span className="visit-count">{n(visits.length)} زيارات</span><span className="client-points"><Award size={15} /> {n(loyaltyPoints(client.id, data.appointments))}</span><span className="last-visit">{last ? dateLabel(last.date, { day: 'numeric', month: 'short' }) : '—'}</span><div className="row-actions"><a className="icon-button whatsapp-button" href={makeWhatsAppLink(client.phone, `مرحباً ${client.name}، يسعدنا حجز موعدك القادم في ${data.shopName || 'صالون مِقص'}.`)} target="_blank" rel="noreferrer" title="مراسلة واتساب" aria-label={`مراسلة ${client.name} عبر واتساب`}><MessageCircle size={16} /></a><button className="icon-button" onClick={() => setModal({ type: 'clientDetails', item: client })} title="تفاصيل الزبون" aria-label={`تفاصيل ${client.name}`}><ChevronLeft size={18} /></button><button className="icon-button" onClick={() => setModal({ type: 'client', item: client })} title="تعديل الزبون" aria-label={`تعديل ${client.name}`}><Pencil size={15} /></button></div></div>;
      })}</div> : <Empty icon={UsersRound} title={search ? 'لم نعثر على زبائن' : 'قائمتك جاهزة'} description={search ? 'تحقق من الاسم أو الرقم وحاول مجدداً.' : 'أضف أول زبون لبدء تنظيم صالونك.'} action={!search && <button className="button-primary" onClick={() => setModal({ type: 'client' })}><Plus size={16} /> إضافة زبون</button>} />}</div></>;
  };

  const renderPayments = () => {
    const list = [...data.appointments].filter(item => item.status !== 'cancelled' && (paymentFilter === 'all' || item.paymentStatus === paymentFilter) && `${byId[item.clientId]?.name || ''} ${item.serviceName}`.toLocaleLowerCase('ar-QA').includes(search.trim().toLocaleLowerCase('ar-QA'))).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    const dueAmount = unpaid.reduce((sum, item) => sum + item.price, 0);
    return <><div className="page-heading"><div><div className="eyebrow">حسابات واضحة</div><h1>الدفعات والفواتير</h1><p>تابع المستحقات، سجّل التحصيل، واطبع الفاتورة المبسطة.</p></div></div>
      <div className="metrics-grid payments-metrics"><MetricCard icon={WalletCards} label="إجمالي المحصّل" value={money(paid.reduce((sum, item) => sum + item.price, 0))} note={`${n(paid.length)} دفعات مسجلة`} tone="green" /><MetricCard icon={Clock3} label="مبالغ مستحقة" value={money(dueAmount)} note={`${n(unpaid.length)} مواعيد غير مدفوعة`} tone="orange" /><MetricCard icon={ReceiptText} label="إجمالي العمليات" value={n(paid.length + unpaid.length)} note="مواعيد غير ملغاة" tone="blue" /></div>
      <div className="panel payments-panel"><div className="list-toolbar"><div><h2>سجل الدفعات</h2><p>كل مدفوعات ومستحقات الصالون</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث عن زبون أو خدمة..." /></div><Tabs items={[{ id: 'unpaid', label: `مستحقة (${n(unpaid.length)})` }, { id: 'paid', label: `مدفوعة (${n(paid.length)})` }, { id: 'all', label: 'الكل' }]} active={paymentFilter} onChange={setPaymentFilter} />
      {list.length ? <div className="payments-list">{list.map((item, index) => <div className="payment-row" key={item.id}><span className={`payment-row-icon ${item.paymentStatus === 'paid' ? 'payment-done' : ''}`}>{item.paymentStatus === 'paid' ? <Check size={18} /> : <WalletCards size={18} />}</span><div className="payment-person"><strong>{byId[item.clientId]?.name || 'زبون محذوف'}</strong><span>{item.serviceName} <b>·</b> {dateLabel(item.date, { day: 'numeric', month: 'short' })}</span></div><div className="payment-amount"><strong>{money(item.price)}</strong><span className={item.paymentStatus === 'paid' ? 'paid-text' : 'unpaid-text'}>{item.paymentStatus === 'paid' ? `تم الدفع ${paymentText[item.paymentMethod] || ''}` : 'مستحق'}</span></div><div className="payment-actions">{item.paymentStatus === 'paid' && <button type="button" className="button-ghost invoice-action" onClick={() => openInvoice(item)}><ReceiptText size={15} /> فاتورة</button>}{item.paymentStatus === 'paid' ? <button type="button" className="button-ghost payment-action" onClick={() => setModal({ type: 'undoPayment', item })}>إلغاء الدفع</button> : <button type="button" className="button-primary payment-action" onClick={() => setModal({ type: 'payment', item })}>تسجيل الدفع</button>}</div></div>)}</div> : <Empty icon={WalletCards} title={search ? 'لا توجد نتائج' : 'لا توجد دفعات هنا'} description={search ? 'جرّب اسماً أو خدمة أخرى.' : 'ستظهر الدفعات هنا عندما تضيف مواعيد.'} />}</div></>;
  };

  const renderInventory = () => {
    const products = [...(data.products || [])].filter(product => (inventoryFilter === 'all' || Number(product.quantity) <= Number(product.minStock)) && `${product.name} ${product.category}`.toLocaleLowerCase('ar-QA').includes(search.trim().toLocaleLowerCase('ar-QA'))).sort((a, b) => Number(a.quantity) - Number(b.quantity));
    const stockValue = data.products.reduce((sum, product) => sum + product.quantity * product.cost, 0);
    const retailValue = data.products.reduce((sum, product) => sum + product.quantity * product.price, 0);
    const recentMovements = (data.stockMovements || []).slice(0, 5);
    return <><div className="page-heading"><div><div className="eyebrow">لا ينقصك شيء في وقت العمل</div><h1>المخزون</h1><p>ارصد المنتجات، حرّك الكميات، واعرف ما يحتاج إلى إعادة طلب.</p></div><div className="heading-actions"><button type="button" className="button-ghost" onClick={exportInventory}><Download size={16} /> تصدير CSV</button><button type="button" className="button-primary" onClick={() => setModal({ type: 'product' })}><Plus size={17} /> إضافة منتج</button></div></div>
      <div className="metrics-grid inventory-metrics"><MetricCard icon={Boxes} label="أصناف المخزون" value={n(data.products.length)} note={`${n(data.products.reduce((sum, product) => sum + Number(product.quantity), 0))} وحدة بالمجموع`} tone="blue" /><MetricCard icon={HandCoins} label="قيمة التكلفة" value={money(stockValue)} note="قيمة الكميات الحالية بالتكلفة" tone="purple" /><MetricCard icon={TriangleAlert} label="تحتاج إعادة طلب" value={n(lowStock.length)} note="وصلت إلى حد التنبيه أو أقل" tone={lowStock.length ? 'orange' : 'green'} /></div>
      <div className="inventory-layout"><section className="panel inventory-panel"><div className="list-toolbar"><div><h2>كتالوج المنتجات</h2><p>قيمة البيع المحتملة {money(retailValue)}</p></div><SearchInput value={search} onChange={setSearch} placeholder="ابحث عن منتج أو فئة..." /></div><Tabs items={[{ id: 'all', label: `كل المنتجات (${n(data.products.length)})` }, { id: 'low', label: `منخفض المخزون (${n(lowStock.length)})` }]} active={inventoryFilter} onChange={setInventoryFilter} />
      {products.length ? <div className="inventory-list"><div className="inventory-table-head"><span>المنتج</span><span>الرصيد</span><span>التكلفة / البيع</span><span>إجراءات</span></div>{products.map(product => {
        const isLow = Number(product.quantity) <= Number(product.minStock);
        const stockPercent = product.minStock > 0 ? Math.min(100, Number(product.quantity) / (Number(product.minStock) * 2) * 100) : 100;
        return <div className={`inventory-row ${isLow ? 'inventory-row-low' : ''}`} key={product.id}><div className="inventory-product"><span className="product-icon"><Package size={18} /></span><span><strong>{product.name}</strong><small>{product.category}</small></span></div><div className="inventory-quantity"><span className={isLow ? 'low-stock-text' : ''}>{n(product.quantity)} <small>{product.unit}</small></span><div className="stock-progress"><i className={isLow ? 'low' : ''} style={{ width: `${stockPercent}%` }} /></div><small>{isLow ? 'أعد الطلب قريباً' : `حد التنبيه ${n(product.minStock)}`}</small></div><div className="inventory-prices"><strong>{money(product.price)}</strong><small>التكلفة {money(product.cost)}</small></div><div className="row-actions inventory-actions"><button type="button" className="icon-button stock-move-button" onClick={() => setModal({ type: 'stock', item: product })} title="تسجيل حركة مخزون" aria-label={`تحديث مخزون ${product.name}`}><PackagePlus size={16} /></button><button type="button" className="icon-button" onClick={() => setModal({ type: 'product', item: product })} title="تعديل المنتج" aria-label={`تعديل ${product.name}`}><Pencil size={15} /></button><button type="button" className="icon-button delete-icon-button" onClick={() => askDelete('product', product)} title="حذف المنتج" aria-label={`حذف ${product.name}`}><Trash2 size={15} /></button></div></div>;
      })}</div> : <Empty icon={Package} title={search ? 'لم نعثر على منتجات' : inventoryFilter === 'low' ? 'ممتاز، لا توجد منتجات منخفضة' : 'مخزونك يبدأ من هنا'} description={search ? 'تحقق من اسم المنتج أو فئته.' : inventoryFilter === 'low' ? 'جميع المنتجات فوق حد التنبيه حالياً.' : 'أضف أول منتج لتتبع الكميات وقيمتها.'} action={inventoryFilter === 'all' && !search && <button className="button-primary" onClick={() => setModal({ type: 'product' })}><Plus size={16} /> إضافة منتج</button>} />}</section>
      <aside className="panel movement-panel"><SectionTitle title="آخر الحركات" subtitle="سجل التوريد والصرف" action={<span className="movement-count">{n(data.stockMovements.length)} حركة</span>} />{recentMovements.length ? <div className="movement-list">{recentMovements.map(movement => <div className="movement-item" key={movement.id}><span className={`movement-icon ${movement.direction === 'in' ? 'movement-in' : 'movement-out'}`}>{movement.direction === 'in' ? <ArrowDownToLine size={16} /> : <ArrowRight size={16} />}</span><span className="movement-copy"><strong>{movement.productName}</strong><small>{movement.note || (movement.direction === 'in' ? 'توريد' : 'صرف')} · {dateLabel(movement.date, { day: 'numeric', month: 'short' })}</small></span><b className={movement.direction === 'in' ? 'movement-plus' : 'movement-minus'}>{movement.direction === 'in' ? '+' : '−'}{n(movement.quantity)}</b></div>)}</div> : <div className="movement-empty"><PackageCheck size={21} /><p>ستظهر حركات المخزون هنا بعد تسجيل أول توريد أو صرف.</p></div>}<div className="inventory-note"><ShieldCheck size={16} /><span>سجل الحركة يحفظ الكمية والتاريخ والملاحظة لمراجعة أدق.</span></div></aside></div></>;
  };

  const renderStaff = () => {
    const appointmentsThisMonth = data.appointments.filter(item => item.date.startsWith(today.slice(0, 7)) && item.status !== 'cancelled');
    return <><div className="page-heading"><div><div className="eyebrow">موهبتهم تصنع التجربة</div><h1>فريق العمل</h1><p>وزّع الحجوزات، وتابع أداء الفريق ومواعيده.</p></div><button className="button-primary" onClick={() => setModal({ type: 'staff' })}><UserPlus size={17} /> إضافة حلاق</button></div>
      <div className="metrics-grid staff-metrics"><MetricCard icon={UsersRound} label="أعضاء الفريق" value={n(data.staff.length)} note="حلاقون في مساحة العمل" tone="blue" /><MetricCard icon={CalendarCheck2} label="حجوزات هذا الشهر" value={n(appointmentsThisMonth.length)} note="على جميع أعضاء الفريق" tone="orange" /><MetricCard icon={Activity} label="إيرادات محصّلة" value={money(data.staff.reduce((sum, member) => sum + paid.filter(item => item.staffId === member.id).reduce((total, item) => total + item.price, 0), 0))} note="للحجوزات المسندة للفريق" tone="green" /></div>
      {data.staff.length ? <div className="staff-grid">{data.staff.map((member, index) => {
        const memberAppointments = data.appointments.filter(item => item.staffId === member.id && item.status !== 'cancelled');
        const memberPaid = paid.filter(item => item.staffId === member.id).reduce((sum, item) => sum + item.price, 0);
        const completedCount = memberAppointments.filter(item => item.status === 'completed').length;
        const estimatedCommission = memberPaid * (Number(member.commission) || 0) / 100;
        const next = memberAppointments.filter(item => item.status !== 'completed' && appointmentTime(item) >= Date.now()).sort(sortAppointments)[0];
        return <article className="panel staff-card" key={member.id}><div className="staff-card-head"><Avatar name={member.name} index={index} size="avatar-lg" /><div className="staff-person"><strong>{member.name}</strong><span>{member.role || 'حلاق'}</span></div><div className="staff-card-actions"><button className="icon-button" onClick={() => setModal({ type: 'staff', item: member })} aria-label={`تعديل ${member.name}`} title="تعديل بيانات الحلاق"><Pencil size={15} /></button><button className="icon-button delete-icon-button" onClick={() => askDelete('staff', member)} aria-label={`حذف ${member.name}`} title="حذف من الفريق"><Trash2 size={15} /></button></div></div><p className="staff-specialty">{member.specialty || 'متخصص في إرضاء الزبائن'}</p><div className="staff-stats"><div><strong>{n(memberAppointments.length)}</strong><span>حجوزات مسندة</span></div><div><strong>{n(completedCount)}</strong><span>مكتملة</span></div><div><strong>{money(estimatedCommission)}</strong><span>عمولة تقديرية</span></div></div><div className="staff-next"><span>{next ? <><CalendarClock size={15} /> التالي: {dateLabel(next.date, { day: 'numeric', month: 'short' })} · {timeLabel(next.time)}</> : <><CircleCheck size={15} /> لا يوجد موعد قادم</>}</span><strong>{n(member.commission || 0)}% عمولة</strong></div><div className="staff-contact">{member.phone ? <><a className="button-ghost" dir="ltr" href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}><Phone size={14} /> {member.phone}</a><a className="icon-button whatsapp-button" href={makeWhatsAppLink(member.phone)} target="_blank" rel="noreferrer" title="مراسلة واتساب" aria-label={`مراسلة ${member.name}`}><MessageCircle size={16} /></a></> : <span className="muted">لم يضف رقم هاتف</span>}</div></article>;
      })}</div> : <div className="panel"><Empty icon={UsersRound} title="فريقك بانتظارك" description="أضف الحلاقين لتعيين المواعيد ومتابعة مؤشرات كل عضو." action={<button className="button-primary" onClick={() => setModal({ type: 'staff' })}><Plus size={16} /> إضافة أول حلاق</button>} /></div>}
      <div className="team-note"><ShieldCheck size={17} /><span>العمولات والأداء مؤشرات تقديرية مبنية على الدفعات المسجلة، وليست نظام رواتب أو محاسبة ضريبية.</span></div></>;
  };

  const renderReports = () => {
    const rangeStart = reportRange === 'week' ? addDays(today, -6) : reportRange === 'month' ? `${today.slice(0, 7)}-01` : '0000-01-01';
    const list = data.appointments.filter(item => item.date >= rangeStart && item.date <= today && item.status !== 'cancelled');
    const revenue = paid.filter(item => item.paidAt >= rangeStart && item.paidAt <= today).reduce((sum, item) => sum + item.price, 0);
    const exportList = data.appointments.filter(item => (item.date >= rangeStart && item.date <= today && item.status !== 'cancelled') || (item.paidAt >= rangeStart && item.paidAt <= today));
    const completed = list.filter(item => item.status === 'completed').length;
    const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
    const values = days.map(day => paid.filter(item => item.paidAt === day).reduce((sum, item) => sum + item.price, 0));
    const peakRevenue = Math.max(...values, 0);
    const max = Math.max(peakRevenue, 1);
    const serviceCounts = new Map(data.services.map(service => [service.id, { id: service.id, name: service.name, count: 0 }]));
    list.forEach(item => {
      const entry = serviceCounts.get(item.serviceId) || { id: item.serviceId, name: item.serviceName, count: 0 };
      entry.count++;
      serviceCounts.set(item.serviceId, entry);
    });
    const services = [...serviceCounts.values()].sort((a, b) => b.count - a.count);
    const maxService = Math.max(...services.map(service => service.count), 1);
    const staffPerformance = data.staff.map(member => {
      const memberAppointments = list.filter(item => item.staffId === member.id);
      const memberRevenue = paid.filter(item => item.staffId === member.id && item.paidAt >= rangeStart && item.paidAt <= today).reduce((sum, item) => sum + item.price, 0);
      return { ...member, count: memberAppointments.length, revenue: memberRevenue };
    }).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
    const maxStaffRevenue = Math.max(...staffPerformance.map(member => member.revenue), 1);
    return <><div className="page-heading"><div><div className="eyebrow">قرارات أذكى</div><h1>التقارير</h1><p>راقب أداء الصالون والخدمات والفريق.</p></div><div className="heading-actions"><select className="range-select" value={reportRange} onChange={event => setReportRange(event.target.value)} aria-label="فترة التقرير"><option value="week">آخر ٧ أيام</option><option value="month">هذا الشهر</option><option value="all">كل الوقت</option></select><button className="button-ghost" onClick={() => exportReport(exportList)}><Download size={16} /> تصدير CSV</button></div></div>
      <div className="metrics-grid reports-metrics"><MetricCard icon={WalletCards} label="الإيرادات المحصّلة" value={money(revenue)} note="خلال الفترة المحددة" tone="orange" /><MetricCard icon={CalendarCheck2} label="المواعيد المكتملة" value={n(completed)} note="مواعيد أُنجزت" tone="green" /><MetricCard icon={UsersRound} label="الزبائن النشطون" value={n(new Set(list.map(item => item.clientId)).size)} note="زاروا الصالون" tone="blue" /><MetricCard icon={TrendingUp} label="متوسط قيمة الموعد" value={money(list.length ? Math.round(list.reduce((sum, item) => sum + item.price, 0) / list.length) : 0)} note="لكل حجز في الفترة" tone="purple" /></div>
      <div className="reports-grid"><section className="panel report-chart-panel"><SectionTitle title="حركة الإيرادات" subtitle="الدفعات المحصّلة خلال آخر ٧ أيام" /><div className="big-chart"><div className="chart-guide"><span>{money(peakRevenue)}</span><span>{money(Math.round(peakRevenue / 2))}</span><span>{money(0)}</span></div><div className="big-chart-columns">{days.map((day, index) => <div className="big-chart-col" key={day} title={`${dateLabel(day)}: ${money(values[index])}`}><div className="big-bar-track"><div className={`big-bar ${day === today ? 'current' : ''}`} style={{ height: `${Math.max(values[index] ? 5 : 2, values[index] / max * 100)}%` }} /></div><span>{weekDay(day)}</span></div>)}</div></div></section>
      <section className="panel report-services"><SectionTitle title="الخدمات الأكثر طلباً" subtitle="حسب عدد الحجوزات في الفترة" />{services.some(service => service.count > 0) ? <div className="service-bars">{services.map((service, index) => <div className="service-bar-row" key={service.id}><div className="service-bar-label"><span className="service-rank">{n(index + 1).padStart(2, '٠')}</span><strong>{service.name}</strong><span>{n(service.count)} حجوزات</span></div><div className="progress-track"><span style={{ width: `${service.count / maxService * 100}%` }} /></div></div>)}</div> : <Empty icon={ChartNoAxesColumnIncreasing} title="لا توجد بيانات بعد" description="ستظهر الخدمات الأكثر طلباً عند تسجيل مواعيد لهذه الفترة." />}</section></div>
      <section className="panel report-team"><SectionTitle title="أداء الفريق" subtitle="الحجوزات والإيراد المحصّل للفترة المحددة" />{staffPerformance.length ? <div className="report-team-list">{staffPerformance.map(member => <div className="report-team-row" key={member.id}><Avatar name={member.name} /><div className="report-team-name"><strong>{member.name}</strong><small>{n(member.count)} حجوزات</small></div><div className="report-team-bar"><span style={{ width: `${member.revenue / maxStaffRevenue * 100}%` }} /></div><strong className="report-team-revenue">{money(member.revenue)}</strong></div>)}</div> : <Empty icon={UsersRound} title="أضف أعضاء فريقك" description="تظهر مقارنة الأداء بعد تعيين الحلاقين على المواعيد." />}</section></>;
  };

  const renderSettings = () => <><div className="page-heading"><div><div className="eyebrow">اصنع مساحتك</div><h1>الإعدادات</h1><p>اسم صالونك، مظهر التطبيق، وخدماته.</p></div></div>
    <div className="settings-grid"><section className="panel settings-panel"><SectionTitle title="معلومات الصالون" subtitle="كيف يظهر اسم صالونك داخل التطبيق" /><div className="form-body settings-form"><label className="field"><span>اسم الصالون</span><input value={data.shopName} onChange={event => setData(previous => ({ ...previous, shopName: event.target.value }))} placeholder="اسم الصالون" /></label><label className="field"><span>التحية على لوحة التحكم</span><input value={data.ownerName} onChange={event => setData(previous => ({ ...previous, ownerName: event.target.value }))} placeholder="أهلاً بك" /></label><p className="settings-hint"><CircleCheck size={15} /> تُحفظ التغييرات تلقائياً في هذا المتصفح.</p></div></section>
    <section className="panel settings-panel"><SectionTitle title="الخدمات والأسعار" subtitle="الخدمات التي تقدمها لزبائنك" action={<button className="text-link" onClick={() => setModal({ type: 'service' })}><Plus size={16} /> إضافة خدمة</button>} /><div className="settings-services">{data.services.map(service => <div className="settings-service" key={service.id}><span className="service-icon"><Scissors size={16} /></span><div><strong>{service.name}</strong><small>{service.duration} دقيقة</small></div><b>{money(service.price)}</b><button className="icon-button" aria-label={`تعديل ${service.name}`} onClick={() => setModal({ type: 'service', item: service })}><Pencil size={15} /></button></div>)}{!data.services.length && <Empty icon={Scissors} title="لا توجد خدمات" description="أضف خدمات الصالون وأسعارها للبدء." />}</div></section></div>
    <section className="panel settings-panel appearance-panel"><SectionTitle title="المظهر" subtitle="اجعل مِقص مريحاً لعينيك في كل وقت" /><div className="theme-options" role="group" aria-label="اختيار مظهر التطبيق">{[{ id: 'system', icon: Settings2, title: 'تلقائي', detail: `حسب إعداد جهازك · الوضع الحالي ${resolvedTheme === 'dark' ? 'ليلي' : 'نهاري'}` }, { id: 'light', icon: Sun, title: 'نهاري', detail: 'سطوع هادئ بدرجات دافئة' }, { id: 'dark', icon: Moon, title: 'ليلي', detail: 'واجهة داكنة مريحة' }].map(option => <button type="button" key={option.id} className={`theme-option ${themeMode === option.id ? 'selected' : ''}`} aria-pressed={themeMode === option.id} onClick={() => setThemeMode(option.id)}><span className="theme-option-icon"><option.icon size={19} /></span><span><strong>{option.title}</strong><small>{option.detail}</small></span>{themeMode === option.id && <CheckCircle2 size={17} className="theme-check" />}</button>)}</div></section>
    <div className="panel backup-panel"><div className="backup-icon"><FileDown size={22} /></div><div className="backup-copy"><h3>نسخة احتياطية من بياناتك</h3><p>نزّل الزبائن والمواعيد والخدمات والفريق والمخزون كملف JSON أو استعد نسخة محفوظة.</p><small>بيانات هذا الإصدار محفوظة محلياً على هذا الجهاز.</small></div><div className="backup-actions"><input ref={importInput} type="file" accept=".json,application/json" hidden onChange={event => { prepareRestore(event.target.files?.[0]); event.target.value = ''; }} /><button className="button-ghost" onClick={() => importInput.current?.click()}><FileDown size={16} /> استعادة نسخة</button><button className="button-ghost" onClick={exportData}><Download size={16} /> تنزيل نسخة</button></div></div></>;

  const handleThemeToggle = () => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
  const openAppointmentForClient = client => setModal({ type: 'appointment', draft: { clientId: client.id } });

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}><div className="sidebar-top"><Brand /><button className="sidebar-close icon-button" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة"><X size={19} /></button></div><div className="sidebar-section-label">مساحة العمل</div><nav className="sidebar-nav">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => go(item.id)}><item.icon size={18} strokeWidth={page === item.id ? 2.25 : 1.8} /><span>{item.label}</span>{item.id === 'inventory' && lowStock.length > 0 && <small className="nav-count">{n(lowStock.length)}</small>}{page === item.id && <i />}</button>)}</nav><div className="sidebar-section-label section-label-bottom">التفضيلات</div><nav className="sidebar-nav"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}><Settings2 size={18} /><span>الإعدادات</span>{page === 'settings' && <i />}</button></nav><div className="sidebar-bottom"><div className="sidebar-help"><span className="help-icon"><Sparkles size={18} /></span><strong>لمسة مميزة في كل زيارة</strong><p>وقت أقل في التنظيم، ووقت أكثر للعناية بزبائنك.</p></div><div className="shop-profile"><span className="shop-avatar"><Scissors size={17} /></span><div><strong>{data.shopName || 'صالونك'}</strong><small>مساحة العمل</small></div><MoreHorizontal size={17} /></div></div></aside>
    {mobileMenu && <button type="button" className="menu-scrim" aria-label="إغلاق القائمة" onClick={() => setMobileMenu(false)} />}
    <div className="main-area"><header className="topbar"><div className="topbar-start"><button className="icon-button mobile-menu-button" aria-label="فتح القائمة" onClick={() => setMobileMenu(true)}><Menu size={22} /></button><div className="mobile-brand"><Brand compact /></div><div className="breadcrumb"><span>مساحة العمل</span><ChevronLeft size={14} /><strong>{pageTitles[page]}</strong></div></div><div className="topbar-end"><span className="topbar-date"><CalendarDays size={16} />{dateLabel(today)}</span><button type="button" className="topbar-icon theme-toggle" aria-label={`تفعيل الوضع ${resolvedTheme === 'dark' ? 'النهاري' : 'الليلي'}`} title={`الوضع ${resolvedTheme === 'dark' ? 'ليلي' : 'نهاري'} · اضغط للتبديل`} onClick={handleThemeToggle}>{resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><div className="notification-wrap"><button className="topbar-icon" aria-label="التنبيهات" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18} />{(upcoming.length > 0 || lowStock.length > 0) && <i />}</button>{notificationsOpen && <div className="notification-popover"><strong>تنبيهات صالونك</strong>{upcoming.length ? upcoming.map(item => <button key={item.id} onClick={() => { setNotificationsOpen(false); setModal({ type: 'appointment', item }); }}><span>{byId[item.clientId]?.name || 'زبون محذوف'} · {item.serviceName}</span><small>{dateLabel(item.date, { day: 'numeric', month: 'short' })}، {timeLabel(item.time)}</small></button>) : <p>لا توجد مواعيد قادمة.</p>}{lowStock.length > 0 && <button className="notification-stock" onClick={() => go('inventory')}><span><TriangleAlert size={14} /> {n(lowStock.length)} منتجات تحتاج مراجعة</span><small>افتح المخزون لمراجعة الكميات</small></button>}</div>}</div><span className="topbar-divider" /><span className="topbar-user"><span className="user-avatar"><Scissors size={16} /></span><span><strong>{data.shopName || 'صالونك'}</strong><small>حساب الصالون</small></span></span></div></header>
      <main className="content">{page === 'dashboard' && <><div className="welcome"><div><div className="eyebrow">{dateLabel(today)}</div><h1>{data.ownerName || 'أهلاً بك'} <span>👋</span></h1><p>إليك ما يحدث في صالونك اليوم.</p></div><span className="welcome-status"><span /> مساحتك جاهزة للعمل</span></div>{renderDashboard()}</>}{page === 'appointments' && renderAppointments()}{page === 'clients' && renderClients()}{page === 'payments' && renderPayments()}{page === 'inventory' && renderInventory()}{page === 'staff' && renderStaff()}{page === 'reports' && renderReports()}{page === 'settings' && renderSettings()}<footer className="main-footer">صُنع بعناية للحلاقين <span>✦</span> مِقص © {new Date().getFullYear()}</footer></main>
    </div><nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي للجوال">{mobileNav.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => go(item.id)}><item.icon size={19} strokeWidth={page === item.id ? 2.25 : 1.8} /><span>{item.id === 'payments' ? 'الدفعات' : item.label}</span></button>)}<button onClick={() => setMobileMenu(true)}><MoreHorizontal size={20} /><span>المزيد</span></button></nav>
    {toast && <div className={`toast ${toast.type === 'error' ? 'toast-error' : ''}`} role="status">{toast.type === 'error' ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}{toast.text}<button aria-label="إغلاق" onClick={() => setToast('')}><X size={15} /></button></div>}
    {modal?.type === 'client' && <ClientForm key={modal.item?.id || 'new-client'} item={modal.item} onSave={saveClient} onClose={() => setModal(null)} onDelete={item => askDelete('client', item)} />}
    {modal?.type === 'appointment' && <AppointmentForm key={`${modal.item?.id || 'new-appointment'}-${modal.draft?.clientId || ''}`} item={modal.item} draft={modal.draft} defaultSlot={nextAppointmentSlot()} clients={data.clients} services={data.services} staff={data.staff} onSave={saveAppointment} onClose={() => setModal(null)} onDelete={item => askDelete('appointment', item)} onNewClient={draft => setModal({ type: 'client', returnToAppointment: { item: modal.item, draft } })} />}
    {modal?.type === 'service' && <ServiceForm key={modal.item?.id || 'new-service'} item={modal.item} onSave={saveService} onClose={() => setModal(null)} onDelete={item => askDelete('service', item)} />}
    {modal?.type === 'staff' && <StaffForm key={modal.item?.id || 'new-staff'} item={modal.item} onSave={saveStaff} onClose={() => setModal(null)} onDelete={item => askDelete('staff', item)} />}
    {modal?.type === 'product' && <ProductForm key={modal.item?.id || 'new-product'} item={modal.item} onSave={saveProduct} onClose={() => setModal(null)} onDelete={item => askDelete('product', item)} />}
    {modal?.type === 'stock' && <StockForm key={modal.item.id} item={modal.item} onSave={saveStockMovement} onClose={() => setModal(null)} />}
    {modal?.type === 'payment' && <PaymentForm item={modal.item} client={byId[modal.item.clientId]} onSave={pay} onClose={() => setModal(null)} />}
    {modal?.type === 'invoice' && <InvoiceModal item={modal.item} client={byId[modal.item.clientId]} shopName={data.shopName} onClose={() => setModal(null)} />}
    {modal?.type === 'clientDetails' && <Modal title="ملف الزبون" subtitle="نظرة كاملة على زياراته ونقاطه" onClose={() => setModal(null)} wide><div className="form-body"><div className="detail-client"><Avatar name={modal.item.name} size="avatar-lg" /><div><h3>{modal.item.name}</h3><a href={`tel:${modal.item.phone.replace(/[^+\d]/g, '')}`} dir="ltr"><Phone size={14} /> {modal.item.phone}</a></div><a className="button-ghost detail-whatsapp" href={makeWhatsAppLink(modal.item.phone, `مرحباً ${modal.item.name}، يسعدنا رؤيتك مجدداً في ${data.shopName || 'صالون مِقص'}.`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> واتساب</a></div><div className="client-loyalty-card"><span className="loyalty-icon"><Award size={20} /></span><div><small>رصيد الولاء</small><strong>{n(loyaltyPoints(modal.item.id, data.appointments))} نقطة</strong><span>تُحتسب نقطة واحدة لكل ١٠ ر.ق من الدفعات المسجلة.</span></div></div>{modal.item.notes && <div className="client-note"><strong>ملاحظات وتفضيلات</strong><p>{modal.item.notes}</p></div>}<h3 className="history-title">سجل المواعيد</h3><div className="history-list">{orderedAppointments.filter(item => item.clientId === modal.item.id).slice().reverse().map(item => <div className="history-row" key={item.id}><span className="history-icon"><CalendarDays size={16} /></span><div><strong>{item.serviceName}</strong><small>{dateLabel(item.date)} · {timeLabel(item.time)}{staffById[item.staffId]?.name ? ` · ${staffById[item.staffId].name}` : ''}</small></div><b>{money(item.price)}</b><button className="icon-button history-invoice" title="عرض الفاتورة" aria-label="عرض الفاتورة" onClick={() => openInvoice(item)}><ReceiptText size={15} /></button></div>)}{!orderedAppointments.some(item => item.clientId === modal.item.id) && <p className="muted">لا توجد مواعيد لهذا الزبون بعد.</p>}</div></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal({ type: 'client', item: modal.item })}><Pencil size={15} /> تعديل البيانات</button><div className="footer-spacer" /><button className="button-primary" onClick={() => openAppointmentForClient(modal.item)}><Plus size={16} /> موعد جديد</button></div></Modal>}
    {modal?.type === 'delete' && <Modal title="تأكيد الحذف" onClose={() => setModal(null)}><div className="form-body confirm-body"><span className="confirm-icon"><Trash2 size={24} /></span><h3>هل تريد حذف {modal.kind === 'client' ? 'هذا الزبون' : modal.kind === 'service' ? 'هذه الخدمة' : modal.kind === 'staff' ? 'عضو الفريق' : modal.kind === 'product' ? 'هذا المنتج' : 'هذا الموعد'}؟</h3><p>{modal.kind === 'client' ? 'سيتم حذف الزبون وسجل مواعيده نهائياً.' : modal.kind === 'staff' ? 'سيتم فك تعيين هذا الحلاق عن مواعيده، مع الاحتفاظ بالحجوزات.' : modal.kind === 'product' ? 'سيتم حذف المنتج من القائمة، مع الاحتفاظ بسجل حركاته.' : 'لا يمكن التراجع عن هذه الخطوة.'}</p></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal(null)}>إلغاء</button><button className="button-danger" onClick={() => deleteItem(modal.kind, modal.item.id)}><Trash2 size={16} /> نعم، احذف</button></div></Modal>}
    {modal?.type === 'undoPayment' && <Modal title="إلغاء تسجيل الدفعة" onClose={() => setModal(null)}><div className="form-body confirm-body"><span className="confirm-icon"><WalletCards size={24} /></span><h3>إعادة الدفعة إلى المستحقات؟</h3><p>سيظهر مبلغ {money(modal.item.price)} كدفعة مستحقة مجدداً. يمكنك تسجيل الدفع في أي وقت.</p></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal(null)}>تراجع</button><button className="button-primary" onClick={() => { undoPay(modal.item.id); setModal(null); }}>تأكيد الإلغاء</button></div></Modal>}
    {modal?.type === 'restore' && <Modal title="استعادة نسخة احتياطية" onClose={() => setModal(null)}><div className="form-body confirm-body"><span className="confirm-icon"><FileDown size={24} /></span><h3>استبدال البيانات الحالية؟</h3><p>سيتم استبدال البيانات الحالية بالملف: {n(modal.data.clients.length)} زبائن، {n(modal.data.appointments.length)} مواعيد، {n(modal.data.products.length)} منتجات، {n(modal.data.staff.length)} أعضاء فريق. لا يمكن التراجع بعد التأكيد.</p></div><div className="modal-footer"><button className="button-ghost" onClick={() => setModal(null)}>إلغاء</button><button className="button-danger" onClick={() => { setData(modal.data); setModal(null); showToast('تم استعادة النسخة الاحتياطية'); }}>استعادة البيانات</button></div></Modal>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
