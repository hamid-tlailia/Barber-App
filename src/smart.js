// الذكاء التشغيلي: تحليلات تُحسب محلياً من بيانات الصالون، بدون إرسال أي بيانات لجهة خارجية.
import {
  addDays, amountPaid, appointmentTotal, daysBetween, isActiveStatus, isPaid, localISO, money, samePhone, timeLabel, dateLabel,
} from './data.js';
import { L } from './i18n.js';

const completed = appointments => appointments.filter(a => a.status === 'completed');

export function clientStats(clientId, appointments, today = localISO()) {
  const mine = appointments.filter(a => a.clientId === clientId);
  const visits = completed(mine).map(a => a.date).sort();
  const intervals = visits.slice(1).map((date, i) => daysBetween(visits[i], date)).filter(days => days > 0);
  const avgInterval = intervals.length ? Math.round(intervals.reduce((s, d) => s + d, 0) / intervals.length) : null;
  const lastVisit = visits.at(-1) || null;
  const noShows = mine.filter(a => a.status === 'no_show').length;
  const cancellations = mine.filter(a => a.status === 'cancelled').length;
  const booked = mine.filter(a => a.status !== 'cancelled' && a.date <= today).length;
  const upcoming = mine.filter(a => a.date >= today && ['pending', 'confirmed'].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0] || null;
  const spent = mine.reduce((sum, a) => sum + amountPaid(a), 0);
  return {
    visits: visits.length, lastVisit, avgInterval, noShows, cancellations, upcoming, spent,
    noShowRate: booked ? noShows / booked : 0,
    daysSince: lastVisit ? daysBetween(lastVisit, today) : null,
    nextDue: lastVisit ? addDays(lastVisit, avgInterval || 30) : null,
  };
}

export const loyaltyPoints = (clientId, appointments, per = 10) => Math.floor(
  appointments.filter(a => a.clientId === clientId).reduce((sum, a) => sum + amountPaid(a), 0) / (per || 10),
);

// خطر عدم الحضور: يُقترح عربون تلقائياً لأصحاب السجل المتكرر.
export function noShowRisk(clientId, appointments) {
  const stats = clientStats(clientId, appointments);
  if (stats.noShows >= 2 || (stats.noShows >= 1 && stats.noShowRate >= 0.25)) return { level: 'high', label: L('خطر غياب مرتفع', 'High no-show risk'), stats };
  if (stats.noShows === 1 || stats.cancellations >= 3) return { level: 'medium', label: L('غاب أو ألغى سابقاً', 'Previously missed or cancelled'), stats };
  return { level: 'low', label: '', stats };
}

// العملاء المنقطعون: تجاوزوا موعد عودتهم المعتاد ولا يوجد لهم حجز قادم.
export function lapsedClients(clients, appointments, settings, today = localISO()) {
  const fallback = Number(settings?.recoveryDays || 30);
  return clients.filter(c => c.id !== 'walk-in' && c.phone).map(client => ({ client, stats: clientStats(client.id, appointments, today) }))
    .filter(({ stats }) => stats.lastVisit && !stats.upcoming)
    .map(entry => {
      const expected = Math.max(14, entry.stats.avgInterval || fallback);
      return { ...entry, expected, overdue: entry.stats.daysSince - expected };
    })
    .filter(entry => entry.overdue >= Math.round(entry.expected * 0.25))
    .sort((a, b) => b.stats.spent - a.stats.spent || b.overdue - a.overdue);
}

// عملاء حان موعدهم المعتاد هذا الأسبوع (تذكير لطيف قبل أن ينقطعوا).
export function dueSoon(clients, appointments, today = localISO()) {
  return clients.filter(c => c.id !== 'walk-in' && c.phone).map(client => ({ client, stats: clientStats(client.id, appointments, today) }))
    .filter(({ stats }) => stats.avgInterval && stats.nextDue && !stats.upcoming && stats.nextDue >= addDays(today, -3) && stats.nextDue <= addDays(today, 7));
}

export const birthdaysToday = (clients, today = localISO()) => clients.filter(c => c.birthday && c.birthday.slice(5) === today.slice(5));

// توقع نفاد المخزون من معدل الصرف في آخر ٣٠ يوماً.
export function stockForecast(products, movements, today = localISO()) {
  const since = addDays(today, -30);
  return products.map(product => {
    const used = movements.filter(m => m.productId === product.id && m.direction === 'out' && m.date >= since).reduce((s, m) => s + Number(m.quantity || 0), 0);
    const perDay = used / 30;
    const daysLeft = perDay > 0 ? Math.floor(Number(product.quantity) / perDay) : null;
    const suggested = Math.max(0, Math.ceil(perDay * 30 + Number(product.minStock || 0) - Number(product.quantity)));
    const low = Number(product.quantity) <= Number(product.minStock) || (daysLeft !== null && daysLeft <= 7);
    return { product, used, perDay, daysLeft, suggested: low ? Math.max(suggested, Number(product.minStock) * 2 - Number(product.quantity)) : suggested, low };
  });
}

export function inRange(date, range, today = localISO()) {
  if (range === 'today') return date === today;
  if (range === 'week') return date >= addDays(today, -6) && date <= today;
  if (range === 'month') return date.slice(0, 7) === today.slice(0, 7);
  if (range === 'lastMonth') {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() - 1);
    return date.slice(0, 7) === localISO(d).slice(0, 7);
  }
  if (range === 'year') return date.slice(0, 4) === today.slice(0, 4);
  return true;
}

// الإيراد المحصّل بتاريخ الدفع (وليس بتاريخ الموعد).
export const paymentsIn = (appointments, range, today = localISO()) => appointments
  .flatMap(a => (a.payments || []).map(p => ({ ...p, appointment: a })))
  .filter(p => inRange(p.at, range, today) && p.method !== 'package');

// كل الدخل: دفعات المواعيد + مبيعات الباقات وبطاقات الهدايا والمنتجات.
export const incomeIn = (data, range, today = localISO()) => [
  ...paymentsIn(data.appointments, range, today).filter(p => p.method !== 'gift' && p.kind !== 'tip'),
  ...(data.sales || []).filter(s => inRange(s.at, range, today)).map(s => ({ ...s, kind: s.kind })),
];

// العمولات: نسبة كل موظف من خدماته المكتملة المدفوعة (موزعة حسب بنود الموعد).
export function commissions(staff, appointments, range, today = localISO()) {
  return staff.map(member => {
    let revenue = 0; let services = 0;
    for (const a of appointments) {
      if (a.status !== 'completed' || !inRange(a.date, range, today)) continue;
      const total = (a.items || []).reduce((s, i) => s + Number(i.price || 0), 0) || 1;
      const ratio = appointmentTotal(a) / total;
      for (const item of a.items || []) {
        if ((item.staffId || a.staffId) !== member.id) continue;
        revenue += Number(item.price || 0) * ratio; services++;
      }
    }
    const tips = appointments.filter(a => inRange(a.date, range, today)).flatMap(a => a.payments || []).filter(p => p.kind === 'tip' && p.staffId === member.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    return { member, revenue, services, tips, commission: revenue * Number(member.commission || 0) / 100 };
  }).sort((a, b) => b.revenue - a.revenue);
}

// إغلاق الصندوق: النقد المتوقع = الافتتاحي + المقبوضات النقدية − المصروفات النقدية.
export function expectedCash(date, appointments, expenses, opening = 0, sales = []) {
  const cashIn = appointments.flatMap(a => a.payments || []).filter(p => p.at === date && p.method === 'cash').reduce((s, p) => s + Number(p.amount || 0), 0)
    + sales.filter(s => s.at === date && s.method === 'cash').reduce((s, p) => s + Number(p.amount || 0), 0);
  const cashOut = expenses.filter(e => e.date === date && e.method === 'cash').reduce((s, e) => s + Number(e.amount || 0), 0);
  return { cashIn, cashOut, expected: Number(opening || 0) + cashIn - cashOut };
}

// إشغال الكراسي: نسبة الدقائق المحجوزة من ساعات العمل لكل موظف.
export function utilization(staff, appointments, settings, range, today = localISO()) {
  const open = Number(settings.hours.open.slice(0, 2)) * 60 + Number(settings.hours.open.slice(3));
  const close = Number(settings.hours.close.slice(0, 2)) * 60 + Number(settings.hours.close.slice(3));
  const days = new Set(appointments.filter(a => inRange(a.date, range, today) && a.date <= today).map(a => a.date)).size || 1;
  const booked = appointments.filter(a => inRange(a.date, range, today) && a.status === 'completed').reduce((s, a) => s + Number(a.duration || 0), 0);
  return Math.min(1, booked / Math.max(1, (close - open) * days * Math.max(1, staff.filter(m => m.active !== false).length)));
}

// قيمة حققها التطبيق: أرقام قابلة للتحقق فقط (حجوزات أونلاين، عملاء عادوا بعد رسالة، مواعيد ملأتها قائمة الانتظار).
export function roi(data, since) {
  const appts = data.appointments.filter(a => a.createdAt >= since && isActiveStatus(a.status));
  const online = appts.filter(a => a.source === 'online' || a.source === 'whatsapp');
  const waitlist = appts.filter(a => a.source === 'waitlist');
  const recoveryMessages = data.messages.filter(m => m.kind === 'recovery' && m.at >= since);
  const recovered = appts.filter(a => recoveryMessages.some(m => m.clientId === a.clientId && a.createdAt >= m.at && daysBetween(m.at, a.createdAt) <= 30));
  const reminders = data.messages.filter(m => m.kind === 'reminder' && m.at >= since);
  const remindedShowed = data.appointments.filter(a => reminders.some(m => m.appointmentId === a.id) && a.status === 'completed');
  const value = list => list.reduce((s, a) => s + appointmentTotal(a), 0);
  const lines = [
    { key: 'online', label: L('حجوزات أونلاين وواتساب', 'Online & WhatsApp bookings'), count: online.length, value: value(online) },
    { key: 'recovered', label: L('عملاء عادوا بعد رسالة', 'Clients who returned after a message'), count: recovered.length, value: value(recovered) },
    { key: 'waitlist', label: L('مواعيد ملأتها قائمة الانتظار', 'Slots filled from the waitlist'), count: waitlist.length, value: value(waitlist) },
  ];
  return {
    lines,
    total: lines.reduce((s, l) => s + l.value, 0),
    reminders: reminders.length,
    remindedShowed: remindedShowed.length,
    hoursSaved: Math.round((reminders.length * 2 + online.length * 4 + data.messages.filter(m => m.at >= since).length) / 60 * 10) / 10,
  };
}

// اقتراح من قائمة الانتظار عند إلغاء موعد.
// لا نقترح موعداً ألغي وقد فات وقته (مثلاً إلغاء موعد الساعة 3 عصراً بعد انتهائه).
export const waitlistMatches = (waitlist, cancelled, now = new Date()) => (new Date(`${cancelled.date}T${cancelled.time || '23:59'}:00`) <= now ? [] : waitlist)
  .filter(w => w.status === 'waiting' && (!w.date || w.date === cancelled.date) && (!w.staffId || !cancelled.staffId || w.staffId === cancelled.staffId))
  .sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || a.createdAt.localeCompare(b.createdAt));

// تقرير نهاية اليوم بصيغة نصية جاهزة لواتساب صاحب المحل.
export function dailyReport(data, date = localISO()) {
  const day = data.appointments.filter(a => a.date === date);
  const revenue = incomeIn(data, 'all').filter(p => p.at === date).reduce((s, p) => s + Number(p.amount || 0), 0);
  const done = day.filter(a => a.status === 'completed');
  const noShow = day.filter(a => a.status === 'no_show');
  const unpaid = done.filter(a => !isPaid(a));
  const top = commissions(data.staff, data.appointments.filter(a => a.date === date), 'all')[0];
  const tomorrow = data.appointments.filter(a => a.date === addDays(date, 1) && isActiveStatus(a.status));
  const lines = [
    L(`📊 تقرير ${data.shopName} — ${dateLabel(date)}`, `📊 ${data.shopName} report — ${dateLabel(date)}`),
    L(`💰 الدخل المحصّل: ${money(revenue)}`, `💰 Revenue collected: ${money(revenue)}`),
    L(`✅ مواعيد مكتملة: ${done.length} من ${day.filter(a => a.status !== 'cancelled').length}`, `✅ Completed appointments: ${done.length} of ${day.filter(a => a.status !== 'cancelled').length}`),
  ];
  if (noShow.length) lines.push(L(`⚠️ لم يحضر: ${noShow.length}`, `⚠️ No-shows: ${noShow.length}`));
  if (unpaid.length) lines.push(L(`🧾 غير مدفوعة: ${unpaid.length} (${money(unpaid.reduce((s, a) => s + appointmentTotal(a) - amountPaid(a), 0))})`, `🧾 Unpaid: ${unpaid.length} (${money(unpaid.reduce((s, a) => s + appointmentTotal(a) - amountPaid(a), 0))})`));
  if (top?.services) lines.push(L(`🏆 الأفضل اليوم: ${top.member.name} (${money(top.revenue)})`, `🏆 Top today: ${top.member.name} (${money(top.revenue)})`));
  const first = tomorrow[0] ? timeLabel(tomorrow.sort((a, b) => a.time.localeCompare(b.time))[0].time) : '';
  lines.push(L(`📅 مواعيد الغد: ${tomorrow.length}${first ? ` — أولها ${first}` : ''}`, `📅 Tomorrow's appointments: ${tomorrow.length}${first ? ` — first at ${first}` : ''}`));
  return lines.join('\n');
}

// اقتراحات اليوم الذكية المعروضة في الرئيسية — قصيرة وقابلة للتنفيذ بنقرة.
export function todayInsights(data, today = localISO()) {
  const insights = [];
  const online = data.appointments.filter(a => a.status === 'pending' && ['online', 'whatsapp'].includes(a.source) && a.date >= today);
  if (online.length) insights.push({ id: 'online', tone: 'green', title: L(`${online.length} حجوزات أونلاين بانتظار تأكيدك`, `${online.length} online ${online.length === 1 ? 'booking' : 'bookings'} awaiting your confirmation`), action: 'appointments' });
  const reminders = data.appointments.filter(a => a.date === addDays(today, 1) && a.status === 'pending' && !data.messages.some(m => m.kind === 'reminder' && m.appointmentId === a.id));
  if (reminders.length) insights.push({ id: 'reminders', tone: 'blue', title: L(`${reminders.length} تذكير لمواعيد الغد`, `${reminders.length} ${reminders.length === 1 ? 'reminder' : 'reminders'} for tomorrow's appointments`), action: 'messages' });
  const lapsed = lapsedClients(data.clients, data.appointments, data.settings, today).filter(e => !data.messages.some(m => m.kind === 'recovery' && m.clientId === e.client.id && daysBetween(m.at, today) < 21));
  if (lapsed.length) insights.push({ id: 'lapsed', tone: 'orange', title: L(`${lapsed.length} عملاء منقطعون يمكن استرجاعهم`, `${lapsed.length} lapsed ${lapsed.length === 1 ? 'client' : 'clients'} to win back`), action: 'messages' });
  const low = stockForecast(data.products, data.stockMovements, today).filter(f => f.low);
  if (low.length) insights.push({ id: 'stock', tone: 'red', title: L(`${low.length} منتجات تحتاج طلباً`, `${low.length} ${low.length === 1 ? 'product needs' : 'products need'} reordering`), action: 'inventory' });
  const birthdays = birthdaysToday(data.clients, today);
  if (birthdays.length) insights.push({ id: 'birthday', tone: 'purple', title: L(`عيد ميلاد ${birthdays[0].name}${birthdays.length > 1 ? ` و${birthdays.length - 1} آخرين` : ''}`, `${birthdays[0].name}'s birthday${birthdays.length > 1 ? ` and ${birthdays.length - 1} ${birthdays.length === 2 ? 'other' : 'others'}` : ''}`), action: 'messages' });
  const unpaid = data.appointments.filter(a => a.status === 'completed' && !isPaid(a));
  if (unpaid.length) insights.push({ id: 'unpaid', tone: 'red', title: L(`${unpaid.length} مواعيد مكتملة غير مدفوعة`, `${unpaid.length} completed ${unpaid.length === 1 ? 'appointment' : 'appointments'} unpaid`), action: 'checkout' });
  const waiting = data.waitlist.filter(w => w.status === 'waiting');
  if (waiting.length) insights.push({ id: 'waitlist', tone: 'green', title: L(`${waiting.length} في قائمة الانتظار`, `${waiting.length} on the waitlist`), action: 'messages' });
  return insights;
}

export const findClientByPhone = (clients, phone) => clients.find(c => samePhone(c.phone, phone));
