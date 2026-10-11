export const STORAGE_KEY = 'miqass-barber-data-v1';

export const localISO = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (dateString, days) => {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
};

export const uid = () => crypto.randomUUID();

export const defaultData = () => {
  const today = localISO();
  const clients = [
    { id: 'c1', name: 'أحمد خالد', phone: '5551 2345', notes: 'يفضل المواعيد الصباحية', createdAt: addDays(today, -42) },
    { id: 'c2', name: 'محمد عبدالله', phone: '5552 8734', notes: '', createdAt: addDays(today, -35) },
    { id: 'c3', name: 'علي حسين', phone: '5553 4167', notes: '', createdAt: addDays(today, -28) },
    { id: 'c4', name: 'سامي ناصر', phone: '5554 9802', notes: 'قصّة قصيرة', createdAt: addDays(today, -21) },
    { id: 'c5', name: 'يوسف إبراهيم', phone: '5555 6219', notes: '', createdAt: addDays(today, -14) },
    { id: 'c6', name: 'خالد منصور', phone: '5556 1748', notes: '', createdAt: addDays(today, -8) },
  ];
  const services = [
    { id: 's1', name: 'قص الشعر', price: 50, duration: 30 },
    { id: 's2', name: 'تحديد اللحية', price: 30, duration: 20 },
    { id: 's3', name: 'شعر ولحية', price: 75, duration: 50 },
    { id: 's4', name: 'عناية متكاملة', price: 110, duration: 75 },
  ];
  const staff = [
    { id: 't1', name: 'سامر العتيبي', phone: '5550 0192', role: 'كبير الحلاقين', specialty: 'قصات عصرية وتدرّج', commission: 35, createdAt: addDays(today, -120) },
    { id: 't2', name: 'عمر الكواري', phone: '5550 1380', role: 'حلاق', specialty: 'اللحية والعناية', commission: 30, createdAt: addDays(today, -80) },
    { id: 't3', name: 'راشد المري', phone: '5550 6421', role: 'حلاق', specialty: 'الأطفال والقصات الكلاسيكية', commission: 30, createdAt: addDays(today, -48) },
  ];
  const products = [
    { id: 'p1', name: 'شمع تصفيف مطفي', category: 'تصفيف الشعر', quantity: 14, minStock: 5, cost: 18, price: 35, unit: 'علبة', updatedAt: today },
    { id: 'p2', name: 'زيت اللحية الفاخر', category: 'العناية باللحية', quantity: 8, minStock: 4, cost: 24, price: 45, unit: 'زجاجة', updatedAt: today },
    { id: 'p3', name: 'شامبو منعش', category: 'العناية بالشعر', quantity: 3, minStock: 5, cost: 20, price: 39, unit: 'زجاجة', updatedAt: today },
    { id: 'p4', name: 'شفرة حلاقة احترافية', category: 'أدوات الحلاقة', quantity: 24, minStock: 10, cost: 2, price: 6, unit: 'قطعة', updatedAt: today },
    { id: 'p5', name: 'بودرة تكثيف الشعر', category: 'تصفيف الشعر', quantity: 6, minStock: 3, cost: 30, price: 55, unit: 'علبة', updatedAt: today },
  ];
  const make = (id, clientId, serviceId, day, time, status, paid = false) => {
    const service = services.find(s => s.id === serviceId);
    const appointmentNumber = Number(id.slice(1));
    return {
      id,
      clientId,
      serviceId,
      staffId: appointmentNumber % 3 === 0 ? 't3' : appointmentNumber % 2 === 0 ? 't2' : 't1',
      serviceName: service.name,
      price: service.price,
      duration: service.duration,
      date: addDays(today, day),
      time,
      status,
      paymentStatus: paid ? 'paid' : 'unpaid',
      paymentMethod: paid ? 'cash' : '',
      paidAt: paid ? addDays(today, day) : '',
      notes: '',
      createdAt: addDays(today, day - 2),
    };
  };
  return {
    shopName: 'صالون مِقص',
    ownerName: 'أهلاً، يا حلاق',
    clients,
    services,
    staff,
    products,
    stockMovements: [],
    appointments: [
      make('a1', 'c1', 's1', 0, '09:00', 'completed', true),
      make('a2', 'c2', 's3', 0, '10:30', 'confirmed'),
      make('a3', 'c3', 's2', 0, '12:00', 'confirmed'),
      make('a4', 'c4', 's1', 0, '14:00', 'pending'),
      make('a5', 'c5', 's4', 0, '16:00', 'pending'),
      make('a6', 'c6', 's3', 1, '09:30', 'confirmed'),
      make('a7', 'c1', 's2', 1, '11:00', 'pending'),
      make('a8', 'c2', 's1', -1, '10:00', 'completed', true),
      make('a9', 'c3', 's3', -2, '12:00', 'completed', true),
      make('a10', 'c4', 's4', -3, '14:00', 'completed', true),
      make('a11', 'c5', 's1', -5, '09:00', 'completed', true),
      make('a12', 'c6', 's2', -6, '15:00', 'completed', true),
    ],
  };
};

const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const loadData = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.clients) && Array.isArray(saved.services) && Array.isArray(saved.appointments)) {
      // Additive migration keeps older browser data intact while introducing new modules.
      return {
        ...saved,
        staff: Array.isArray(saved.staff) ? saved.staff : [],
        products: Array.isArray(saved.products) ? saved.products : [],
        stockMovements: Array.isArray(saved.stockMovements) ? saved.stockMovements : [],
        shopName: typeof saved.shopName === 'string' ? saved.shopName : 'صالون مِقص',
        ownerName: typeof saved.ownerName === 'string' ? saved.ownerName : 'أهلاً بك',
      };
    }
  } catch { /* Fall back to sample data if storage is unavailable or invalid. */ }
  return defaultData();
};

export const dateLabel = (date, options = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('ar-QA', options).format(new Date(`${date}T12:00:00`));

export const money = value => `${new Intl.NumberFormat('ar-QA').format(value || 0)} ر.ق`;
export const timeLabel = time => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'ص' : 'م'}`;
};
export const sortAppointments = (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export const hasAppointmentConflict = (appointments, { id, date, time, duration, status, staffId }) => {
  if (status === 'cancelled') return false;
  const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return appointments.some(a => {
    if (a.id === id || a.date !== date || a.status === 'cancelled') return false;
    // When both bookings have a barber assigned, only that barber's calendar blocks the slot.
    if (staffId && a.staffId && staffId !== a.staffId) return false;
    const otherStart = Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3));
    return start < otherStart + a.duration && otherStart < start + duration;
  });
};

export const nextOpenSlot = (appointments, duration = 30, startDate = localISO(), now = new Date(), staffId = '') => {
  const today = localISO(now);
  for (let day = 0; day < 14; day++) {
    const date = addDays(startDate, day);
    for (let minute = 9 * 60; minute + duration <= 20 * 60; minute += 30) {
      if (date === today && minute < now.getHours() * 60 + now.getMinutes() + 15) continue;
      const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      if (!hasAppointmentConflict(appointments, { date, time, duration, staffId })) return { date, time };
    }
  }
  return { date: addDays(startDate, 14), time: '09:00' };
};

export const statusText = { pending: 'بانتظار التأكيد', confirmed: 'مؤكد', completed: 'مكتمل', cancelled: 'ملغي' };
export const paymentText = { cash: 'نقداً', card: 'بطاقة', transfer: 'تحويل' };
export const isDateString = isDate;
