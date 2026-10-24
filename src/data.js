// نموذج بيانات الصالون: دوال نقية بدون واجهة، قابلة للاختبار ومشتركة بين التطبيق والمزامنة.

import { L, isEn } from './i18n.js';
export const STORAGE_KEY = 'miqass-barber-data-v1';
export const DATA_VERSION = 2;

export const COLLECTIONS = [
  'clients', 'services', 'staff', 'products', 'stockMovements', 'appointments', 'packages',
  'clientPackages', 'giftCards', 'waitlist', 'drawers', 'messages', 'photos', 'expenses', 'sales', 'coupons', 'campaigns',
];

export const localISO = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// هل الحجز عبر هذه القناة متوقف الآن؟ (نفس booking_paused في قاعدة البيانات)
export const bookingPaused = (settings, channel, today = localISO()) => {
  const until = settings?.[`${channel}BookingUntil`] || '';
  return Boolean(settings?.[`${channel}BookingOff`]) && (!until || today < until);
};

// «يوم العمل» للحسابات (الدفعات، المصروفات، الصندوق) حسب ساعات كل صالون:
// صالون يغلق بعد منتصف الليل (مثلاً 16:00–02:00) تُحسب دفعات ما بعد 12 على اليوم الذي بدأ فيه،
// حتى منتصف المسافة بين الإغلاق والفتح (09:00 في المثال). الصالون العادي و«24 ساعة» ينتهي يومه عند منتصف الليل.
const minutesOf = t => (/^\d{1,2}:\d{2}/.test(t || '') ? Number(t.slice(0, t.indexOf(':'))) * 60 + Number(t.slice(t.indexOf(':') + 1, t.indexOf(':') + 3)) : null);
export const businessDay = (settings, now = new Date()) => {
  const hours = settings?.hours;
  const open = minutesOf(hours?.open); const close = minutesOf(hours?.close);
  const d = new Date(now);
  if (!hours || hours.allDay || open === null || close === null || close > open) return localISO(d);
  const cutoff = (close + open) / 2;
  if (d.getHours() * 60 + d.getMinutes() < cutoff) d.setDate(d.getDate() - 1);
  return localISO(d);
};

export const addDays = (dateString, days) => {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
};

export const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

export const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const toMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const fromMinutes = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// الأرقام العربية (٠-٩ و۰-۹) تُحوَّل للاتينية قبل الحذف حتى لا يضيع رقم مكتوب بها.
export const latinDigits = text => String(text || '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
export const phoneDigits = phone => latinDigits(phone).replace(/\D/g, '');
// رقم جوال كامل: 8 أرقام على الأقل (قطر) و15 كحد أقصى (المعيار الدولي مع رمز الدولة).
export const validPhone = phone => { const n = phoneDigits(phone).length; return n >= 8 && n <= 15; };
export const PHONE_ERROR = L('رقم الجوال غير مكتمل — 8 أرقام على الأقل', 'The phone number is incomplete — at least 8 digits');
// مقارنة الأسماء بدون فروق الكتابة (المسافات، الهمزات، التاء المربوطة، حالة الأحرف).
export const normalName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652\u0640]/g, '');
export const sameName = (a, b) => normalName(a) !== '' && normalName(a) === normalName(b);
// السجل المكرر (نفس الاسم، أو نفس الرقم إن وُجد) مع استثناء السجل نفسه عند التعديل.
export const findDuplicate = (list, item, { phone = false } = {}) => (list || []).find(x => x.id !== item.id && (sameName(x.name, item.name) || (phone && samePhone(x.phone, item.phone))));
// الاسم المختصر للموظف في الأزرار: الاسم الأول، أو الاسم الكامل إذا تشابه الاسم الأول مع زميل.
export const shortName = (staff, member) => {
  const first = String(member?.name || '').trim().split(/\s+/)[0];
  return (staff || []).some(s => s.id !== member?.id && normalName(String(s.name).trim().split(/\s+/)[0]) === normalName(first)) ? String(member.name).trim() : first;
};
export const samePhone = (a, b) => {
  const x = phoneDigits(a); const y = phoneDigits(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-8) === y.slice(-8);
};

/* ───────────── مصطلحات حسب نوع الصالون ───────────── */

export const vocabulary = kind => (isEn
  ? kind === 'women'
    ? { client: 'Client', clients: 'Clients', newClient: 'New client', pro: 'Stylist', team: 'Team', shop: 'Beauty salon' }
    : kind === 'mixed'
      ? { client: 'Client', clients: 'Clients', newClient: 'New client', pro: 'Specialist', team: 'Team', shop: 'Salon' }
      : { client: 'Client', clients: 'Clients', newClient: 'New client', pro: 'Barber', team: 'Team', shop: 'Barbershop' }
  : kind === 'women'
    ? { client: 'عميلة', clients: 'العميلات', newClient: 'عميلة جديدة', pro: 'خبيرة', team: 'فريق العمل', shop: 'صالون التجميل' }
    : kind === 'mixed'
      ? { client: 'عميل', clients: 'العملاء', newClient: 'عميل جديد', pro: 'مختص', team: 'فريق العمل', shop: 'الصالون' }
      : { client: 'زبون', clients: 'الزبائن', newClient: 'زبون جديد', pro: 'حلاق', team: 'فريق العمل', shop: 'صالون الحلاقة' });

export const serviceTemplates = {
  men: [
    { name: L('قص الشعر', 'Haircut'), category: L('الشعر', 'Hair'), price: 50, duration: 30 },
    { name: L('تحديد اللحية', 'Beard trim'), category: L('اللحية', 'Beard'), price: 30, duration: 20 },
    { name: L('شعر ولحية', 'Hair & beard'), category: L('الشعر', 'Hair'), price: 75, duration: 50 },
    { name: L('قص أطفال', 'Kids haircut'), category: L('الشعر', 'Hair'), price: 35, duration: 25 },
    { name: L('تنظيف بشرة', 'Facial'), category: L('العناية', 'Grooming'), price: 90, duration: 45 },
    { name: L('صبغة لحية', 'Beard color'), category: L('اللحية', 'Beard'), price: 40, duration: 30, processing: 10 },
  ],
  women: [
    { name: L('قص وتسريح', 'Cut & style'), category: L('الشعر', 'Hair'), price: 120, duration: 60 },
    { name: L('سشوار', 'Blow-dry'), category: L('الشعر', 'Hair'), price: 80, duration: 45 },
    { name: L('صبغة كاملة', 'Full color'), category: L('الصبغة', 'Color'), price: 350, duration: 120, processing: 40, deposit: 100 },
    { name: L('بروتين / كيراتين', 'Protein / keratin'), category: L('العلاجات', 'Treatments'), price: 700, duration: 180, processing: 30, deposit: 200 },
    { name: L('مانيكير وباديكير', 'Manicure & pedicure'), category: L('الأظافر', 'Nails'), price: 150, duration: 75 },
    { name: L('مكياج سهرة', 'Evening makeup'), category: L('المكياج', 'Makeup'), price: 400, duration: 60, deposit: 100 },
    { name: L('مكياج عروس', 'Bridal makeup'), category: L('العرائس', 'Bridal'), price: 2500, duration: 180, deposit: 1000 },
    { name: L('تنظيف بشرة', 'Facial'), category: L('البشرة', 'Skin'), price: 250, duration: 60 },
  ],
};
serviceTemplates.mixed = [...serviceTemplates.men.slice(0, 3), ...serviceTemplates.women.slice(0, 5)];

export const defaultSettings = (kind = 'men') => ({
  kind,
  hours: { open: '09:00', close: '22:00', closedDays: [], allDay: false },
  slotStep: 15,
  reminderHours: 24,
  loyaltyPer: 10,
  noShowDepositPercent: 30,
  bookingEnabled: true,
  // إيقاف الحجز مؤقتاً: online = رابط الحجز، wa = واتساب. Until = تاريخ العودة التلقائية (فارغ = حتى إعادة التشغيل يدوياً).
  onlineBookingOff: false, onlineBookingUntil: '', waBookingOff: false, waBookingUntil: '',
  hideClientPhotosFromStaff: kind !== 'men',
  autoCancelLate: true,
  recoveryDays: kind === 'women' ? 45 : 30,
  templates: {
    reminder: L('مرحباً {name} 👋\nتذكير بموعدك في {shop} يوم {date} الساعة {time}.\nللتأكيد أرسل 1، وللإلغاء أرسل 2.', 'Hi {name} 👋\nA reminder of your appointment at {shop} on {date} at {time}.\nReply 1 to confirm or 2 to cancel.'),
    recovery: L('اشتقنا لك يا {name} 🌟\nمرّ وقت على آخر زيارة لـ{shop}. احجز هذا الأسبوع واحصل على خصم 10٪.\n{link}', 'We miss you, {name} 🌟\nIt has been a while since your last visit to {shop}. Book this week and get 10% off.\n{link}'),
    thanks: L('شكراً لزيارتك {shop} يا {name} 🙏\nرأيك يهمنا: كيف كانت تجربتك اليوم؟', 'Thank you for visiting {shop}, {name} 🙏\nYour opinion matters: how was your experience today?'),
    waitlist: L('خبر سار يا {name}! توفر موعد في {shop} يوم {date} الساعة {time}. هل يناسبك؟ ردّ بنعم لنثبته لك.', 'Good news, {name}! A slot opened up at {shop} on {date} at {time}. Does it suit you? Reply yes and we will book it for you.'),
    birthday: L('كل عام وأنت بخير يا {name} 🎉 هديتك من {shop}: خصم 20٪ على زيارتك القادمة.', 'Happy birthday, {name} 🎉 A gift from {shop}: 20% off your next visit.'),
    offer: L('مرحباً {name} 👋\n🎁 {title}\n{offer}\nاحجز الآن: {link}', 'Hi {name} 👋\n🎁 {title}\n{offer}\nBook now: {link}'),
    coupon: L('استخدم الكود {code} عند الدفع واحصل على خصم {discount}.\nالعرض حتى {until}', 'Use code {code} at checkout for {discount} off.\nValid until {until}'),
    package: L('{services} بسعر {price}.\nبدلاً من {regular}\nعدد الجلسات: {sessions}', '{services} for {price}.\nInstead of {regular}\nSessions: {sessions}'),
  },
});

/* ───────────── بيانات تجريبية ───────────── */

export const defaultData = (kind = 'men', shopName) => {
  const today = localISO();
  const women = kind === 'women';
  const names = women
    ? L(['نورة الكواري', 'مريم السادة', 'فاطمة المهندي', 'هند العلي', 'سارة النعيمي', 'لولوة المري'], ['Noora Al-Kuwari', 'Maryam Al-Sada', 'Fatima Al-Mohannadi', 'Hind Al-Ali', 'Sara Al-Nuaimi', 'Lulwa Al-Marri'])
    : L(['أحمد خالد', 'محمد عبدالله', 'علي حسين', 'سامي ناصر', 'يوسف إبراهيم', 'خالد منصور'], ['Ahmed Khalid', 'Mohammed Abdullah', 'Ali Hussein', 'Sami Nasser', 'Yousef Ibrahim', 'Khalid Mansour']);
  const clients = names.map((name, index) => ({
    id: `c${index + 1}`, name, phone: `555${index + 1} ${2345 + index * 1111}`.slice(0, 9), notes: index === 0 ? L('تفضل المواعيد الصباحية', 'Prefers morning appointments') : '',
    allergies: women && index === 1 ? L('حساسية من الأمونيا', 'Allergic to ammonia') : '', formula: women && index === 0 ? L('Wella 6/0 + 7/1 — أوكسجين 6٪ — 35 دقيقة', 'Wella 6/0 + 7/1 — 6% developer — 35 min') : '',
    birthday: index === 2 ? `1990-${today.slice(5)}` : '', tags: index === 0 ? ['VIP'] : [], createdAt: addDays(today, -60 + index * 7),
  }));
  const services = serviceTemplates[kind].map((service, index) => ({ id: `s${index + 1}`, processing: 0, deposit: 0, online: true, ...service }));
  const staffNames = women
    ? L([['ريم', 'خبيرة شعر وصبغات'], ['دانة', 'مكياج وعرائس'], ['جود', 'أظافر وبشرة']], [['Reem', 'Hair & color specialist'], ['Dana', 'Makeup & bridal'], ['Joud', 'Nails & skin']])
    : L([['سامر العتيبي', 'قصات عصرية وتدرّج'], ['عمر الكواري', 'اللحية والعناية'], ['راشد المري', 'الأطفال والقصات الكلاسيكية']], [['Samer Al-Otaibi', 'Modern cuts & fades'], ['Omar Al-Kuwari', 'Beard & grooming'], ['Rashid Al-Marri', 'Kids & classic cuts']]);
  const staff = staffNames.map(([name, specialty], index) => ({
    id: `t${index + 1}`, name, phone: `5550 ${1000 + index * 1234}`, role: index === 0 ? (women ? L('كبيرة الخبيرات', 'Senior stylist') : L('كبير الحلاقين', 'Head barber')) : (women ? L('خبيرة', 'Stylist') : L('حلاق', 'Barber')),
    specialty, commission: index === 0 ? 35 : 30, color: ['#b97932', '#557fa0', '#8870aa'][index], active: true, createdAt: addDays(today, -120),
  }));
  const products = (women
    ? L([['صبغة احترافية 60مل', 'الصبغات', 24, 8, 22, 0, 'أنبوب'], ['أوكسجين 6٪', 'الصبغات', 4, 3, 30, 0, 'لتر'], ['ماسك كيراتين', 'العلاجات', 6, 2, 90, 180, 'علبة'], ['طلاء أظافر', 'الأظافر', 30, 10, 12, 35, 'قطعة'], ['زيت أرغان', 'العناية', 2, 4, 45, 95, 'زجاجة']],
      [['Professional hair color 60ml', 'Color', 24, 8, 22, 0, 'tube'], ['6% developer', 'Color', 4, 3, 30, 0, 'liter'], ['Keratin mask', 'Treatments', 6, 2, 90, 180, 'jar'], ['Nail polish', 'Nails', 30, 10, 12, 35, 'piece'], ['Argan oil', 'Care', 2, 4, 45, 95, 'bottle']])
    : L([['شمع تصفيف مطفي', 'تصفيف الشعر', 14, 5, 18, 35, 'علبة'], ['زيت اللحية الفاخر', 'العناية باللحية', 8, 4, 24, 45, 'زجاجة'], ['شامبو منعش', 'العناية بالشعر', 3, 5, 20, 39, 'زجاجة'], ['شفرة حلاقة احترافية', 'أدوات الحلاقة', 24, 10, 2, 6, 'قطعة'], ['بودرة تكثيف الشعر', 'تصفيف الشعر', 6, 3, 30, 55, 'علبة']],
      [['Matte styling wax', 'Hair styling', 14, 5, 18, 35, 'jar'], ['Premium beard oil', 'Beard care', 8, 4, 24, 45, 'bottle'], ['Refreshing shampoo', 'Hair care', 3, 5, 20, 39, 'bottle'], ['Professional razor blade', 'Barber tools', 24, 10, 2, 6, 'piece'], ['Hair thickening powder', 'Hair styling', 6, 3, 30, 55, 'jar']])
  ).map(([name, category, quantity, minStock, cost, price, unit], index) => ({ id: `p${index + 1}`, name, category, quantity, minStock, cost, price, unit, updatedAt: today }));

  const make = (n, clientIndex, serviceIndexes, day, time, status, paid = false) => {
    const items = serviceIndexes.map(serviceIndex => {
      const service = services[serviceIndex];
      return { serviceId: service.id, name: service.name, price: service.price, duration: service.duration, processing: service.processing || 0, staffId: staff[n % 3].id };
    });
    const total = items.reduce((sum, item) => sum + item.price, 0);
    return {
      id: `a${n}`, clientId: clients[clientIndex].id, items, staffId: staff[n % 3].id, date: addDays(today, day), time, status,
      duration: items.reduce((sum, item) => sum + item.duration, 0), price: total, discount: 0, deposit: 0,
      payments: paid ? [{ id: `pay${n}`, amount: total, method: n % 2 ? 'cash' : 'card', at: addDays(today, day), kind: 'payment' }] : [],
      location: 'salon', notes: '', source: n === 4 ? 'online' : 'app', createdAt: addDays(today, day - 2),
    };
  };
  const appointments = [
    make(1, 0, [0], 0, '09:00', 'completed', true), make(2, 1, [2], 0, '10:30', 'confirmed'), make(3, 2, [1], 0, '12:00', 'confirmed'),
    make(4, 3, [0], 0, '14:00', 'pending'), make(5, 4, [3], 0, '16:00', 'pending'), make(6, 5, [2], 1, '09:30', 'confirmed'),
    make(7, 0, [1], 1, '11:00', 'pending'), make(8, 1, [0], -1, '10:00', 'completed', true), make(9, 2, [2], -2, '12:00', 'completed', true),
    make(10, 3, [3], -3, '14:00', 'completed', true), make(11, 4, [0], -5, '09:00', 'completed', true), make(12, 5, [1], -6, '15:00', 'no_show'),
    make(13, 5, [0], -40, '15:00', 'completed', true), make(14, 5, [0], -70, '15:00', 'completed', true), make(15, 3, [1], -50, '11:00', 'no_show'),
  ];
  const packages = [{ id: 'k1', name: women ? L('باقة سشوار ×5', 'Blow-dry bundle ×5') : L('باقة قص ×5', 'Haircut bundle ×5'), serviceId: women ? 's2' : 's1', sessions: 5, price: women ? 340 : 210, validityDays: 90 }];
  return {
    version: DATA_VERSION,
    shopName: shopName || (women ? L('صالون لمسة', 'Lamsa Salon') : L('صالون مِقص', 'Miqass Barbershop')),
    settings: defaultSettings(kind),
    clients, services, staff, products, appointments, packages,
    stockMovements: [], clientPackages: [], giftCards: [], waitlist: [], drawers: [], messages: [], photos: [], expenses: [], sales: [],
  };
};

export const emptyData = (kind = 'men', shopName = '') => ({
  version: DATA_VERSION,
  shopName,
  settings: defaultSettings(kind),
  services: serviceTemplates[kind].map(service => ({ id: uid(), processing: 0, deposit: 0, online: true, ...service })),
  ...Object.fromEntries(COLLECTIONS.filter(name => name !== 'services').map(name => [name, []])),
});

/* ───────────── الترحيل من النسخة الأولى ───────────── */

export const migrateAppointment = item => {
  if (Array.isArray(item.items)) return { payments: [], discount: 0, deposit: 0, location: 'salon', ...item };
  const { serviceId, serviceName, paymentStatus, paymentMethod, paidAt, ...rest } = item;
  const price = Number(item.price || 0);
  return {
    ...rest,
    items: [{ serviceId: serviceId || '', name: serviceName || L('خدمة', 'Service'), price, duration: Number(item.duration || 30), processing: 0, staffId: item.staffId || '' }],
    price, duration: Number(item.duration || 30), discount: 0, deposit: 0, location: 'salon',
    payments: paymentStatus === 'paid' ? [{ id: uid(), amount: price, method: paymentMethod || 'cash', at: paidAt || item.date, kind: 'payment' }] : [],
  };
};

export const normalizeData = saved => {
  if (!saved || !Array.isArray(saved.clients) || !Array.isArray(saved.services) || !Array.isArray(saved.appointments)) return null;
  const kind = saved.settings?.kind || 'men';
  const base = defaultSettings(kind);
  const data = {
    ...saved,
    version: DATA_VERSION,
    shopName: typeof saved.shopName === 'string' ? saved.shopName : L('صالون مِقص', 'Miqass Barbershop'),
    settings: { ...base, ...saved.settings, hours: { ...base.hours, ...saved.settings?.hours }, templates: { ...base.templates, ...saved.settings?.templates } },
  };
  for (const name of COLLECTIONS) data[name] = Array.isArray(saved[name]) ? saved[name] : [];
  data.appointments = data.appointments.map(migrateAppointment);
  data.services = data.services.map(service => ({ processing: 0, deposit: 0, online: true, category: L('عام', 'General'), ...service }));
  data.staff = data.staff.map(member => ({ active: true, ...member }));
  delete data.ownerName;
  return data;
};

export const loadLegacyData = () => {
  try { return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return null; }
};

/* ───────────── التنسيق ───────────── */

// شكل الأرقام: 123 (افتراضي) أو ١٢٣ — يُختار من الإعدادات ويُحفظ على الجهاز.
export let digitStyle = (() => { try { return JSON.parse(localStorage.getItem('miqass-digits')) || 'latn'; } catch { return 'latn'; } })();
const localeFor = style => (isEn ? 'en-GB' : style === 'arab' ? 'ar-QA' : 'ar-QA-u-nu-latn');
export let LOCALE = localeFor(digitStyle);
// يغيّر شكل الأرقام فوراً بدون إعادة تحميل (التصديرات حيّة في وحدات ES).
export function setDigitStyle(style) {
  digitStyle = style === 'arab' ? 'arab' : 'latn';
  LOCALE = localeFor(digitStyle);
  try { localStorage.setItem('miqass-digits', JSON.stringify(digitStyle)); } catch { /* ignore */ }
}

export const dateLabel = (date, options = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat(LOCALE, options).format(new Date(`${date}T12:00:00`));
export const num = value => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value || 0);
export const money = value => `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value || 0)} ${L('ر.ق', 'QAR')}`;
export const timeLabel = time => {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? L('ص', 'AM') : L('م', 'PM')}`;
};
export const sortAppointments = (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
// ترتيب قائمة اليوم: من في الصالون الآن، ثم القادم حسب الأقرب وقتاً، ثم المنتهي (مكتمل/ملغي/غائب أو تأخر أكثر من ساعة).
export const dayRank = (a, now = Date.now()) => a.status === 'arrived' || a.status === 'in_service' ? 0
  : ['pending', 'confirmed'].includes(a.status) && new Date(`${a.date}T${a.time}:00`).getTime() > now - 60 * 60000 ? 1 : 2;
export const sortForDay = (now = Date.now()) => (a, b) => dayRank(a, now) - dayRank(b, now) || sortAppointments(a, b);

// اسم العميل للعرض: العميل المحذوف يبقى ظاهراً في السجلات القديمة بعبارة «عميل محذوف».
// حجز أونلاين باسم مختلف عن اسم العميل المسجّل بنفس الرقم (الرقم هو الهوية، والاسم المكتوب يُعرض للتوضيح).
export const bookedAs = (a, client) => a?.onlineName && client?.name && !sameName(a.onlineName, client.name) ? String(a.onlineName) : '';
export const clientName = (clients, id) => {
  const list = Array.isArray(clients) ? clients : Object.values(clients || {});
  const found = list.find(c => c.id === id);
  return typeof found?.name === 'string' && found.name ? found.name : id ? L('عميل محذوف', 'Deleted client') : L('عميل', 'Client');
};
export const statusText = { pending: L('بانتظار التأكيد', 'Awaiting confirmation'), confirmed: L('مؤكد', 'Confirmed'), arrived: L('وصل', 'Arrived'), completed: L('مكتمل', 'Completed'), cancelled: L('ملغي', 'Cancelled'), no_show: L('لم يحضر', 'No-show') };
export const paymentText = { cash: L('نقداً', 'Cash'), card: L('بطاقة', 'Card'), transfer: L('تحويل', 'Transfer'), gift: L('بطاقة هدية', 'Gift card'), package: L('من الباقة', 'From package') };
export const roleText = { owner: L('المالك', 'Owner'), manager: L('مدير', 'Manager'), reception: L('استقبال', 'Reception'), staff: L('موظف خدمة', 'Service staff') };
export const isDateString = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/* ───────────── المواعيد والدفعات ───────────── */

// خدمات الباقة: الباقة قد تجمع أكثر من خدمة (مثلاً شعر ولحية + تدليك + ماسك). الباقات القديمة فيها serviceId واحد.
export const packageServices = p => (Array.isArray(p?.serviceIds) && p.serviceIds.length ? p.serviceIds : p?.serviceId ? [p.serviceId] : []);
// من أين عرفنا العميل (للتسويق): يُختار عند الإضافة، ويُسجَّل تلقائياً للحجز الأونلاين وواتساب.
export const CLIENT_SOURCES = [
  { id: 'instagram', label: L('انستغرام', 'Instagram') }, { id: 'tiktok', label: L('تيك توك', 'TikTok') }, { id: 'snapchat', label: L('سناب شات', 'Snapchat') },
  { id: 'google', label: L('خرائط جوجل', 'Google Maps') }, { id: 'friend', label: L('صديق / توصية', 'Friend / referral') }, { id: 'walkby', label: L('مرّ بالصالون', 'Walked by') },
  { id: 'online', label: L('رابط الحجز', 'Booking link') }, { id: 'whatsapp', label: L('واتساب', 'WhatsApp') }, { id: 'other', label: L('أخرى', 'Other') },
];
export const sourceLabel = id => CLIENT_SOURCES.find(s => s.id === id)?.label || L('غير محدد', 'Not set');

// أكواد الخصم: نسبة أو مبلغ، بتاريخ انتهاء وحد استخدام اختياريين.
// تنظيف الكود: لوحات المفاتيح العربية تضيف علامات اتجاه خفية، وبعضها يكتب أحرفاً عريضة (ＥＩＤ) — نزيلها ونوحّدها.
export const normalCode = code => latinDigits(String(code || '').normalize('NFKC')).replace(/[\p{Cf}\s]/gu, '').toUpperCase();
export const couponDiscount = (coupon, gross) => Math.min(gross, Math.round(coupon.type === 'amount' ? Number(coupon.value || 0) : gross * Number(coupon.value || 0) / 100));
export const checkCoupon = (coupons, code, today) => {
  const c = (coupons || []).find(x => normalCode(x.code) === normalCode(code));
  if (!c) return { error: L('الكود غير موجود', 'Code not found') };
  if (c.active === false) return { error: L('الكود موقوف', 'This code is disabled') };
  if (c.expiresAt && c.expiresAt < today) return { error: L('انتهت صلاحية الكود', 'This code has expired') };
  if (Number(c.maxUses) > 0 && Number(c.used || 0) >= Number(c.maxUses)) return { error: L('استُخدم الكود بالحد الأقصى', 'This code has reached its usage limit') };
  return { coupon: c };
};
// رقم الفاتورة ثابت لكل موعد: INV-تاريخه-آخر 4 من معرّفه (يُطبع في الفاتورة وفي رمز QR).
export const invoiceNumber = a => `INV-${String(a.date || '').replaceAll('-', '')}-${String(a.id || '').slice(-4).toUpperCase()}`;
export const findInvoice = (appointments, query) => {
  const q = normalCode(query).replace(/^MIQASS:/, '');
  if (q.length < 4) return null;
  return appointments.find(a => (a.payments || []).length && (invoiceNumber(a) === q || (q.length <= 6 && invoiceNumber(a).endsWith(q)))) || null;
};
export const appointmentTotal = a => Math.max(0, (a.items || []).reduce((sum, item) => sum + Number(item.price || 0), 0) - Number(a.discount || 0));
export const amountPaid = a => (a.payments || []).filter(p => p.kind !== 'tip').reduce((sum, p) => sum + Number(p.amount || 0), 0);
export const balanceDue = a => Math.max(0, appointmentTotal(a) - amountPaid(a));
export const isPaid = a => appointmentTotal(a) > 0 ? amountPaid(a) >= appointmentTotal(a) - 0.001 : (a.items || []).length > 0 && a.status === 'completed';
export const depositPaid = a => (a.payments || []).filter(p => p.kind === 'deposit').reduce((sum, p) => sum + Number(p.amount || 0), 0);
export const needsDeposit = a => Number(a.deposit || 0) > 0 && depositPaid(a) + 0.001 < Number(a.deposit) && !['cancelled', 'completed', 'no_show'].includes(a.status);
export const isActiveStatus = status => !['cancelled', 'no_show'].includes(status);
export const serviceNames = a => (a.items || []).map(item => item.name).join(' + ');

// الأجزاء التي يكون فيها كل موظف مشغولاً فعلياً. وقت الانتظار (مثل تثبيت الصبغة) يحرر الموظف لعميل آخر.
export const busyBlocks = a => {
  const blocks = [];
  let cursor = toMinutes(a.time);
  const travel = a.location === 'home' ? Number(a.travel || 30) : 0;
  for (const item of a.items || []) {
    const duration = Number(item.duration || 0);
    const active = Math.max(5, duration - Number(item.processing || 0));
    blocks.push({ staffId: item.staffId || a.staffId || '', start: cursor - travel, end: cursor + active + (travel && item === a.items.at(-1) ? travel : 0) });
    cursor += duration;
  }
  if (!blocks.length) blocks.push({ staffId: a.staffId || '', start: cursor, end: cursor + Number(a.duration || 30) });
  return blocks;
};

export const conflicts = (appointments, candidate) => {
  if (!isActiveStatus(candidate.status || 'pending')) return [];
  const mine = busyBlocks(candidate);
  return appointments.filter(other => {
    // الموعد المكتمل انتهى فعلياً، فلا يشغل الموظف حتى لو كان وقته المقرر لم ينته بعد.
    if (other.id === candidate.id || other.date !== candidate.date || !isActiveStatus(other.status) || other.status === 'completed') return false;
    return busyBlocks(other).some(b => mine.some(m => {
      // عند تحديد موظف لكلا الجزأين، يتعارض جدول الموظف نفسه فقط.
      if (m.staffId && b.staffId && m.staffId !== b.staffId) return false;
      return m.start < b.end && b.start < m.end;
    }));
  });
};
// التعارض مع مراعاة عدد الموظفين: موعد بدون موظف محدد لا يتعارض ما دام هناك موظف متاح في نفس الوقت.
// يعيد المواعيد المتداخلة زمنياً، والموظفين غير المشغولين فيها، وهل التعارض حقيقي.
// الموظف (حلاق) يعدّل ويلغي فقط ما حجزه بنفسه؛ في مواعيد غيره يسجّل الوصول والإنهاء فقط (والخادم يفرض ذلك أيضاً).
export const canModifyAppointment = (a, role, userId) => role !== 'staff' || (Boolean(userId) && a?.createdBy === userId);
// موعد قائم للعميل (اليوم أو لاحقاً): لا يُحجز له موعد ثانٍ حتى يُنهى أو يُلغى أو يُعدَّل.
export const activeBookingOf = (appointments, clientId, exceptId) => !clientId || clientId === 'walk-in' ? null
  : appointments.find(a => a.id !== exceptId && a.clientId === clientId && ['pending', 'confirmed', 'arrived', 'in_service'].includes(a.status) && a.date >= localISO()) || null;
export const appointmentOwner = a => a.staffId || (a.items || []).find(i => i.staffId)?.staffId || '';
export const bookingClash = (appointments, candidate, staff = []) => {
  const clash = conflicts(appointments, { ...candidate, staffId: '', items: (candidate.items || []).map(i => ({ ...i, staffId: '' })) });
  if (!clash.length) return { clash, free: [], blocking: false };
  const team = staff.filter(s => s.active !== false && !isStaffOff(s, candidate.date));
  const busy = new Set(clash.map(appointmentOwner).filter(Boolean));
  const unassigned = clash.filter(a => !appointmentOwner(a)).length;
  const free = team.filter(s => !busy.has(s.id)).map(s => s.id);
  const mine = appointmentOwner(candidate);
  const blocking = mine ? busy.has(mine) || free.filter(id => id !== mine).length < unassigned : free.length <= unassigned;
  return { clash, free, blocking };
};
export const hasAppointmentConflict = (appointments, candidate) => conflicts(appointments, candidate).length > 0;

// existing: بنود الموعد الحالية عند التعديل — تبقى الخدمة المحذوفة من القائمة بسعرها ومدتها القديمين.
export const buildItems = (services, serviceIds, staffId = '', existing = []) => serviceIds
  .map(id => services.find(service => service.id === id) || existing.find(item => item.serviceId === id)).filter(Boolean)
  .map(service => (service.serviceId
    ? { ...service, staffId }
    : { serviceId: service.id, name: service.name, price: Number(service.price || 0), duration: Number(service.duration || 30), processing: Number(service.processing || 0), staffId }));

// فترات العمل لتاريخ معيّن بالدقائق [بداية، نهاية]. تدعم «مفتوح 24 ساعة» والإغلاق بعد منتصف الليل
// (مثلاً 18:00–02:00: من 00:00 حتى 02:00 امتداداً لليلة السابقة، ومن 18:00 حتى 24:00).
export const openWindows = (hours, date) => {
  const h = hours || { open: '09:00', close: '22:00', closedDays: [] };
  if (h.allDay) return [[0, 1440]];
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const closed = (h.closedDays || []).map(Number);
  const open = toMinutes(h.open || '09:00');
  let close = toMinutes(h.close || '22:00');
  if (close === 0 && open > 0) close = 1440; // «00:00» تعني منتصف الليل
  if (close >= open) return closed.includes(weekday) ? [] : [[open, close]];
  const windows = [];
  if (!closed.includes((weekday + 6) % 7)) windows.push([0, close]);
  if (!closed.includes(weekday)) windows.push([open, 1440]);
  return windows;
};

// هل الموظف في إجازة (يوم راحة أسبوعي أو تاريخ إجازة محدد) في هذا التاريخ؟
export const isStaffOff = (member, date) => {
  if (!member || !date) return false;
  const weekday = new Date(`${date}T12:00:00`).getDay();
  // workDays: أيام عمل استثنائية (حضر في يوم راحته الأسبوعية).
  if ((member.workDays || []).includes(date)) return false;
  return (member.daysOff || []).map(Number).includes(weekday) || (member.leaves || []).includes(date);
};

// حضور الفريق في يوم: العدد الكلي للنشطين، المتاحون، ومن في إجازة مع السبب (راحة أسبوعية أو إجازة).
export const staffOnDay = (staff, date) => {
  const active = (staff || []).filter(s => s.active !== false);
  const off = active.filter(s => isStaffOff(s, date)).map(member => ({ member, reason: (member.leaves || []).includes(date) ? 'leave' : 'weekly' }));
  return { total: active.length, available: active.length - off.length, off };
};

export const availableSlots = (appointments, { date, items, staffId = '', settings, now = new Date(), location = 'salon', travel = 30, staff }) => {
  const windows = openWindows(settings?.hours, date);
  if (!windows.length) return [];
  // عند تمرير قائمة الفريق: الموظف المجاز لا يُحجز له، ولا يُحسب ضمن السعة عند «أي موظف».
  const team = Array.isArray(staff) ? staff : null;
  const offIds = new Set((team || []).filter(m => isStaffOff(m, date)).map(m => m.id));
  if (offIds.has(staffId) || items.some(item => item.staffId && offIds.has(item.staffId))) return [];
  const needsAnyone = !staffId && items.some(item => !item.staffId);
  const working = team && needsAnyone ? team.filter(m => m.active !== false && !offIds.has(m.id)) : null;
  if (working && !working.length && team.some(m => m.active !== false)) return [];
  const step = Number(settings?.slotStep || 15);
  const duration = items.reduce((sum, item) => sum + Number(item.duration || 0), 0) || 30;
  const slots = [];
  const isToday = date === localISO(now);
  const free = (time, who) => !hasAppointmentConflict(appointments, { date, time, items: items.map(item => ({ ...item, staffId: item.staffId || who })), staffId: who, status: 'pending', location, travel, duration });
  for (const [start, end] of windows) {
    for (let minute = start; minute + duration <= end; minute += step) {
      if (isToday && minute < now.getHours() * 60 + now.getMinutes() + 10) continue;
      const time = fromMinutes(minute);
      if (working?.length ? working.some(m => free(time, m.id)) : free(time, staffId)) slots.push(time);
    }
  }
  return slots;
};

export const nextOpenSlot = (appointments, items, settings, staffId = '', now = new Date(), staff) => {
  for (let day = 0; day < 21; day++) {
    const date = addDays(localISO(now), day);
    const [time] = availableSlots(appointments, { date, items, staffId, settings, now, staff });
    if (time) return { date, time };
  }
  return { date: addDays(localISO(now), 1), time: settings?.hours?.allDay ? '00:00' : settings?.hours?.open || '09:00' };
};

/* ───────────── الرسائل ───────────── */

export const fillTemplate = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

// نصوص الرسائل حسب لغة العميل (عربي/إنجليزي)، مستقلة عن لغة واجهة التطبيق.
export const DEFAULT_TEMPLATES = {
  ar: {
    reminder: 'مرحباً {name} 👋\nتذكير بموعدك في {shop} يوم {date} الساعة {time}.\nللتأكيد أرسل 1، وللإلغاء أرسل 2.',
    recovery: 'اشتقنا لك يا {name} 🌟\nمرّ وقت على آخر زيارة لـ{shop}. احجز هذا الأسبوع واحصل على خصم 10٪.\n{link}',
    thanks: 'شكراً لزيارتك {shop} يا {name} 🙏\nرأيك يهمنا: كيف كانت تجربتك اليوم؟',
    waitlist: 'خبر سار يا {name}! توفر موعد في {shop} يوم {date} الساعة {time}. هل يناسبك؟ ردّ بنعم لنثبته لك.',
    waitlistContact: 'مرحباً {name} 👋 معك {shop} بخصوص طلبك في قائمة الانتظار{date}. سنخبرك فور توفر موعد مناسب، أو أخبرنا بالوقت الذي يناسبك.',
    birthday: 'كل عام وأنت بخير يا {name} 🎉 هديتك من {shop}: خصم 20٪ على زيارتك القادمة.',
    offer: 'مرحباً {name} 👋\n🎁 {title}\n{offer}\nاحجز الآن: {link}',
    coupon: 'استخدم الكود {code} عند الدفع واحصل على خصم {discount}.\nالعرض حتى {until}',
    package: '{services} بسعر {price}.\nبدلاً من {regular}\nعدد الجلسات: {sessions}',
  },
  en: {
    reminder: 'Hi {name} 👋\nA reminder of your appointment at {shop} on {date} at {time}.\nReply 1 to confirm or 2 to cancel.',
    recovery: 'We miss you, {name} 🌟\nIt has been a while since your last visit to {shop}. Book this week and get 10% off.\n{link}',
    thanks: 'Thank you for visiting {shop}, {name} 🙏\nYour opinion matters: how was your experience today?',
    waitlist: 'Good news, {name}! A slot opened up at {shop} on {date} at {time}. Does it suit you? Reply yes and we will book it for you.',
    waitlistContact: 'Hi {name} 👋 This is {shop} about your waitlist request{date}. We will let you know as soon as a suitable slot opens, or tell us what time suits you.',
    birthday: 'Happy birthday, {name} 🎉 A gift from {shop}: 20% off your next visit.',
    offer: 'Hi {name} 👋\n🎁 {title}\n{offer}\nBook now: {link}',
    coupon: 'Use code {code} at checkout for {discount} off.\nValid until {until}',
    package: '{services} for {price}.\nInstead of {regular}\nSessions: {sessions}',
  },
};
// نصوص العروض بلغة واجهة الصالون. السطر الذي فيه متغير فارغ يُحذف كاملاً (مثل «العرض حتى» لكود بلا تاريخ انتهاء).
export const salonTemplate = (settings, key) => settings?.templates?.[key] || DEFAULT_TEMPLATES[isEn ? 'en' : 'ar'][key];
export const fillLines = (template, values) => String(template || '').split('\n')
  .filter(line => [...line.matchAll(/\{(\w+)\}/g)].every(([, key]) => String(values[key] ?? '').trim()))
  .map(line => fillTemplate(line, values)).join('\n').trim();
export const clientLang = client => (client?.lang === 'en' || client?.lang === 'ar' ? client.lang : 'ar');
export function messageFor(settings, key, client) {
  const lang = clientLang(client);
  // settings.templates مكتوبة بلغة واجهة الصالون؛ لا تُستخدم لعميل بلغة أخرى.
  const custom = lang === 'en' ? (settings?.templatesEn || (isEn ? settings?.templates : null)) : (isEn ? settings?.templatesAr : settings?.templates);
  return custom?.[key] || DEFAULT_TEMPLATES[lang][key] || DEFAULT_TEMPLATES.ar[key];
}
// التاريخ والوقت بلغة العميل داخل الرسالة.
export const dateFor = (client, date, options = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat(clientLang(client) === 'en' ? 'en-GB' : 'ar-QA-u-nu-latn', options).format(new Date(`${date}T12:00:00`));
export const timeFor = (client, time) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const en = clientLang(client) === 'en';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? (en ? 'AM' : 'ص') : (en ? 'PM' : 'م')}`;
};

export const whatsappNumber = (phone, countryCode = '974') => {
  const digits = phoneDigits(phone);
  return digits.startsWith(countryCode) || digits.length !== 8 ? digits : `${countryCode}${digits}`;
};
export const whatsappLink = (phone, message = '') => `https://wa.me/${whatsappNumber(phone)}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

/* ───────────── CSV ───────────── */

export const parseCSV = text => {
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  const input = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === '،' || char === ';' || char === '\t') { row.push(field.trim()); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

// يستورد الزبائن من CSV أو نص منسوخ (اسم، هاتف في كل سطر) مع تجاهل المكرر.
// سطر بخلية واحدة مثل «أحمد محمد 55512345» أو «+974 5551 2345 سارة»: نفصل الرقم عن الاسم.
const splitLine = row => {
  if (row.length !== 1) return row;
  const match = row[0].match(/(\+?\d[\d\s-]{6,}\d)/);
  if (!match) return row;
  const name = row[0].replace(match[0], ' ').replace(/[-–—:|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [name, match[0].trim()];
};

export const importClients = (text, existing) => {
  const latin = String(text || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const rows = parseCSV(latin).map(splitLine);
  if (!rows.length) return { added: [], skipped: 0 };
  const header = rows[0].map(cell => cell.toLowerCase());
  const hasHeader = header.some(cell => /name|اسم|phone|هاتف|جوال|mobile/.test(cell));
  const nameIndex = hasHeader ? Math.max(0, header.findIndex(cell => /name|اسم/.test(cell))) : 0;
  const phoneIndexFound = hasHeader ? header.findIndex(cell => /phone|هاتف|جوال|mobile|tel|number|رقم/.test(cell)) : -1;
  const notesIndex = hasHeader ? header.findIndex(cell => /note|ملاحظ/.test(cell)) : -1;
  const added = []; let skipped = 0;
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const phoneIndex = phoneIndexFound >= 0 ? phoneIndexFound : row.findIndex(cell => validPhone(cell));
    const phone = row[phoneIndex] || '';
    const name = (phoneIndex === nameIndex ? row.find((cell, i) => i !== phoneIndex && cell) : row[nameIndex]) || '';
    if (!name || !validPhone(phone) || [...existing, ...added].some(client => samePhone(client.phone, phone))) { skipped++; continue; }
    added.push({ id: uid(), name, phone, notes: notesIndex >= 0 ? row[notesIndex] || '' : '', createdAt: localISO(), source: 'import' });
  }
  return { added, skipped };
};

export const toCSV = rows => `﻿${rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}`;
