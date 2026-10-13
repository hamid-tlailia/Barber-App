// نموذج بيانات الصالون: دوال نقية بدون واجهة، قابلة للاختبار ومشتركة بين التطبيق والمزامنة.

export const STORAGE_KEY = 'miqass-barber-data-v1';
export const DATA_VERSION = 2;

export const COLLECTIONS = [
  'clients', 'services', 'staff', 'products', 'stockMovements', 'appointments', 'packages',
  'clientPackages', 'giftCards', 'waitlist', 'drawers', 'messages', 'photos', 'expenses', 'sales',
];

export const localISO = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

export const phoneDigits = phone => String(phone || '').replace(/\D/g, '');
export const samePhone = (a, b) => {
  const x = phoneDigits(a); const y = phoneDigits(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-8) === y.slice(-8);
};

/* ───────────── مصطلحات حسب نوع الصالون ───────────── */

export const vocabulary = kind => kind === 'women'
  ? { client: 'عميلة', clients: 'العميلات', newClient: 'عميلة جديدة', pro: 'خبيرة', team: 'فريق العمل', shop: 'صالون التجميل' }
  : kind === 'mixed'
    ? { client: 'عميل', clients: 'العملاء', newClient: 'عميل جديد', pro: 'مختص', team: 'فريق العمل', shop: 'الصالون' }
    : { client: 'زبون', clients: 'الزبائن', newClient: 'زبون جديد', pro: 'حلاق', team: 'فريق العمل', shop: 'صالون الحلاقة' };

export const serviceTemplates = {
  men: [
    { name: 'قص الشعر', category: 'الشعر', price: 50, duration: 30 },
    { name: 'تحديد اللحية', category: 'اللحية', price: 30, duration: 20 },
    { name: 'شعر ولحية', category: 'الشعر', price: 75, duration: 50 },
    { name: 'قص أطفال', category: 'الشعر', price: 35, duration: 25 },
    { name: 'تنظيف بشرة', category: 'العناية', price: 90, duration: 45 },
    { name: 'صبغة لحية', category: 'اللحية', price: 40, duration: 30, processing: 10 },
  ],
  women: [
    { name: 'قص وتسريح', category: 'الشعر', price: 120, duration: 60 },
    { name: 'سشوار', category: 'الشعر', price: 80, duration: 45 },
    { name: 'صبغة كاملة', category: 'الصبغة', price: 350, duration: 120, processing: 40, deposit: 100 },
    { name: 'بروتين / كيراتين', category: 'العلاجات', price: 700, duration: 180, processing: 30, deposit: 200 },
    { name: 'مانيكير وباديكير', category: 'الأظافر', price: 150, duration: 75 },
    { name: 'مكياج سهرة', category: 'المكياج', price: 400, duration: 60, deposit: 100 },
    { name: 'مكياج عروس', category: 'العرائس', price: 2500, duration: 180, deposit: 1000 },
    { name: 'تنظيف بشرة', category: 'البشرة', price: 250, duration: 60 },
  ],
};
serviceTemplates.mixed = [...serviceTemplates.men.slice(0, 3), ...serviceTemplates.women.slice(0, 5)];

export const defaultSettings = (kind = 'men') => ({
  kind,
  hours: { open: '09:00', close: '22:00', closedDays: [] },
  slotStep: 15,
  reminderHours: 24,
  loyaltyPer: 10,
  noShowDepositPercent: 30,
  bookingEnabled: true,
  hideClientPhotosFromStaff: kind !== 'men',
  recoveryDays: kind === 'women' ? 45 : 30,
  templates: {
    reminder: 'مرحباً {name} 👋\nتذكير بموعدك في {shop} يوم {date} الساعة {time}.\nللتأكيد أرسل 1، وللإلغاء أرسل 2.',
    recovery: 'اشتقنا لك يا {name} 🌟\nمرّ وقت على آخر زيارة لـ{shop}. احجز هذا الأسبوع واحصل على خصم 10٪.\n{link}',
    thanks: 'شكراً لزيارتك {shop} يا {name} 🙏\nرأيك يهمنا: كيف كانت تجربتك اليوم؟',
    waitlist: 'خبر سار يا {name}! توفر موعد في {shop} يوم {date} الساعة {time}. هل يناسبك؟ ردّ بنعم لنثبته لك.',
    birthday: 'كل عام وأنت بخير يا {name} 🎉 هديتك من {shop}: خصم 20٪ على زيارتك القادمة.',
  },
});

/* ───────────── بيانات تجريبية ───────────── */

export const defaultData = (kind = 'men', shopName) => {
  const today = localISO();
  const women = kind === 'women';
  const names = women
    ? ['نورة الكواري', 'مريم السادة', 'فاطمة المهندي', 'هند العلي', 'سارة النعيمي', 'لولوة المري']
    : ['أحمد خالد', 'محمد عبدالله', 'علي حسين', 'سامي ناصر', 'يوسف إبراهيم', 'خالد منصور'];
  const clients = names.map((name, index) => ({
    id: `c${index + 1}`, name, phone: `555${index + 1} ${2345 + index * 1111}`.slice(0, 9), notes: index === 0 ? 'تفضل المواعيد الصباحية' : '',
    allergies: women && index === 1 ? 'حساسية من الأمونيا' : '', formula: women && index === 0 ? 'Wella 6/0 + 7/1 — أوكسجين 6٪ — 35 دقيقة' : '',
    birthday: index === 2 ? `1990-${today.slice(5)}` : '', tags: index === 0 ? ['VIP'] : [], createdAt: addDays(today, -60 + index * 7),
  }));
  const services = serviceTemplates[kind].map((service, index) => ({ id: `s${index + 1}`, processing: 0, deposit: 0, online: true, ...service }));
  const staffNames = women
    ? [['ريم', 'خبيرة شعر وصبغات'], ['دانة', 'مكياج وعرائس'], ['جود', 'أظافر وبشرة']]
    : [['سامر العتيبي', 'قصات عصرية وتدرّج'], ['عمر الكواري', 'اللحية والعناية'], ['راشد المري', 'الأطفال والقصات الكلاسيكية']];
  const staff = staffNames.map(([name, specialty], index) => ({
    id: `t${index + 1}`, name, phone: `5550 ${1000 + index * 1234}`, role: index === 0 ? (women ? 'كبيرة الخبيرات' : 'كبير الحلاقين') : (women ? 'خبيرة' : 'حلاق'),
    specialty, commission: index === 0 ? 35 : 30, color: ['#b97932', '#557fa0', '#8870aa'][index], active: true, createdAt: addDays(today, -120),
  }));
  const products = (women
    ? [['صبغة احترافية 60مل', 'الصبغات', 24, 8, 22, 0, 'أنبوب'], ['أوكسجين 6٪', 'الصبغات', 4, 3, 30, 0, 'لتر'], ['ماسك كيراتين', 'العلاجات', 6, 2, 90, 180, 'علبة'], ['طلاء أظافر', 'الأظافر', 30, 10, 12, 35, 'قطعة'], ['زيت أرغان', 'العناية', 2, 4, 45, 95, 'زجاجة']]
    : [['شمع تصفيف مطفي', 'تصفيف الشعر', 14, 5, 18, 35, 'علبة'], ['زيت اللحية الفاخر', 'العناية باللحية', 8, 4, 24, 45, 'زجاجة'], ['شامبو منعش', 'العناية بالشعر', 3, 5, 20, 39, 'زجاجة'], ['شفرة حلاقة احترافية', 'أدوات الحلاقة', 24, 10, 2, 6, 'قطعة'], ['بودرة تكثيف الشعر', 'تصفيف الشعر', 6, 3, 30, 55, 'علبة']]
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
  const packages = [{ id: 'k1', name: women ? 'باقة سشوار ×5' : 'باقة قص ×5', serviceId: women ? 's2' : 's1', sessions: 5, price: women ? 340 : 210, validityDays: 90 }];
  return {
    version: DATA_VERSION,
    shopName: shopName || (women ? 'صالون لمسة' : 'صالون مِقص'),
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
    items: [{ serviceId: serviceId || '', name: serviceName || 'خدمة', price, duration: Number(item.duration || 30), processing: 0, staffId: item.staffId || '' }],
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
    shopName: typeof saved.shopName === 'string' ? saved.shopName : 'صالون مِقص',
    settings: { ...base, ...saved.settings, hours: { ...base.hours, ...saved.settings?.hours }, templates: { ...base.templates, ...saved.settings?.templates } },
  };
  for (const name of COLLECTIONS) data[name] = Array.isArray(saved[name]) ? saved[name] : [];
  data.appointments = data.appointments.map(migrateAppointment);
  data.services = data.services.map(service => ({ processing: 0, deposit: 0, online: true, category: 'عام', ...service }));
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
export let LOCALE = digitStyle === 'arab' ? 'ar-QA' : 'ar-QA-u-nu-latn';
// يغيّر شكل الأرقام فوراً بدون إعادة تحميل (التصديرات حيّة في وحدات ES).
export function setDigitStyle(style) {
  digitStyle = style === 'arab' ? 'arab' : 'latn';
  LOCALE = digitStyle === 'arab' ? 'ar-QA' : 'ar-QA-u-nu-latn';
  try { localStorage.setItem('miqass-digits', JSON.stringify(digitStyle)); } catch { /* ignore */ }
}

export const dateLabel = (date, options = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat(LOCALE, options).format(new Date(`${date}T12:00:00`));
export const num = value => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value || 0);
export const money = value => `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value || 0)} ر.ق`;
export const timeLabel = time => {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'ص' : 'م'}`;
};
export const sortAppointments = (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export const statusText = { pending: 'بانتظار التأكيد', confirmed: 'مؤكد', arrived: 'وصل', completed: 'مكتمل', cancelled: 'ملغي', no_show: 'لم يحضر' };
export const paymentText = { cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل', gift: 'بطاقة هدية', package: 'من الباقة' };
export const roleText = { owner: 'المالك', manager: 'مدير', reception: 'استقبال', staff: 'موظف خدمة' };
export const isDateString = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/* ───────────── المواعيد والدفعات ───────────── */

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
    if (other.id === candidate.id || other.date !== candidate.date || !isActiveStatus(other.status)) return false;
    return busyBlocks(other).some(b => mine.some(m => {
      // عند تحديد موظف لكلا الجزأين، يتعارض جدول الموظف نفسه فقط.
      if (m.staffId && b.staffId && m.staffId !== b.staffId) return false;
      return m.start < b.end && b.start < m.end;
    }));
  });
};
export const hasAppointmentConflict = (appointments, candidate) => conflicts(appointments, candidate).length > 0;

export const buildItems = (services, serviceIds, staffId = '') => serviceIds
  .map(id => services.find(service => service.id === id)).filter(Boolean)
  .map(service => ({ serviceId: service.id, name: service.name, price: Number(service.price || 0), duration: Number(service.duration || 30), processing: Number(service.processing || 0), staffId }));

export const availableSlots = (appointments, { date, items, staffId = '', settings, now = new Date(), location = 'salon', travel = 30 }) => {
  const hours = settings?.hours || { open: '09:00', close: '22:00', closedDays: [] };
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if ((hours.closedDays || []).includes(weekday)) return [];
  const step = Number(settings?.slotStep || 15);
  const duration = items.reduce((sum, item) => sum + Number(item.duration || 0), 0) || 30;
  const slots = [];
  const isToday = date === localISO(now);
  for (let minute = toMinutes(hours.open); minute + duration <= toMinutes(hours.close); minute += step) {
    if (isToday && minute < now.getHours() * 60 + now.getMinutes() + 10) continue;
    const time = fromMinutes(minute);
    const candidate = { date, time, items: items.map(item => ({ ...item, staffId: item.staffId || staffId })), staffId, status: 'pending', location, travel, duration };
    if (!hasAppointmentConflict(appointments, candidate)) slots.push(time);
  }
  return slots;
};

export const nextOpenSlot = (appointments, items, settings, staffId = '', now = new Date()) => {
  for (let day = 0; day < 21; day++) {
    const date = addDays(localISO(now), day);
    const [time] = availableSlots(appointments, { date, items, staffId, settings, now });
    if (time) return { date, time };
  }
  return { date: addDays(localISO(now), 1), time: settings?.hours?.open || '09:00' };
};

/* ───────────── الرسائل ───────────── */

export const fillTemplate = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

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
export const importClients = (text, existing) => {
  const rows = parseCSV(text);
  if (!rows.length) return { added: [], skipped: 0 };
  const header = rows[0].map(cell => cell.toLowerCase());
  const hasHeader = header.some(cell => /name|اسم|phone|هاتف|جوال|mobile/.test(cell));
  const nameIndex = hasHeader ? Math.max(0, header.findIndex(cell => /name|اسم/.test(cell))) : 0;
  const phoneIndexFound = hasHeader ? header.findIndex(cell => /phone|هاتف|جوال|mobile|رقم/.test(cell)) : -1;
  const notesIndex = hasHeader ? header.findIndex(cell => /note|ملاحظ/.test(cell)) : -1;
  const added = []; let skipped = 0;
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const phoneIndex = phoneIndexFound >= 0 ? phoneIndexFound : row.findIndex(cell => phoneDigits(cell).length >= 7);
    const phone = row[phoneIndex] || '';
    const name = (phoneIndex === nameIndex ? row.find((cell, i) => i !== phoneIndex && cell) : row[nameIndex]) || '';
    if (!name || phoneDigits(phone).length < 7 || [...existing, ...added].some(client => samePhone(client.phone, phone))) { skipped++; continue; }
    added.push({ id: uid(), name, phone, notes: notesIndex >= 0 ? row[notesIndex] || '' : '', createdAt: localISO(), source: 'import' });
  }
  return { added, skipped };
};

export const toCSV = rows => `﻿${rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')}`;
