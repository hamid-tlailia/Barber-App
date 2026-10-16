import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, amountPaid, appointmentTotal, availableSlots, balanceDue, bookingClash, buildItems, clientName, businessDay, findDuplicate, normalCode, phoneDigits, validPhone, shortName, defaultData, defaultSettings, hasAppointmentConflict,
  importClients, isPaid, localISO, migrateAppointment, normalizeData, parseCSV, fillTemplate, fillLines, salonTemplate, whatsappNumber,
} from './data.js';
import { clientStats, commissions, dailyReport, expectedCash, incomeIn, lapsedClients, noShowRisk, roi, stockForecast, waitlistMatches } from './smart.js';
import { diffData, mergeRows } from './lib/sync.js';

const appt = (over = {}) => ({
  id: 'x', clientId: 'c1', date: '2026-05-10', time: '10:00', status: 'confirmed', staffId: 't1', payments: [], discount: 0,
  items: [{ serviceId: 's1', name: 'قص', price: 50, duration: 30, processing: 0, staffId: 't1' }], duration: 30, price: 50, ...over,
});

test('سيناريو التعارض: نفس الموظف يتعارض، وموظف آخر لا', () => {
  const existing = [appt()];
  assert.equal(hasAppointmentConflict(existing, appt({ id: 'y', time: '10:15' })), true);
  assert.equal(hasAppointmentConflict(existing, appt({ id: 'y', time: '10:15', staffId: 't2', items: [{ ...appt().items[0], staffId: 't2' }] })), false);
  assert.equal(hasAppointmentConflict(existing, appt({ id: 'y', time: '10:30' })), false);
  assert.equal(hasAppointmentConflict([appt({ status: 'cancelled' })], appt({ id: 'y' })), false);
  assert.equal(hasAppointmentConflict([appt({ status: 'completed' })], appt({ id: 'y' })), false);
});

test('التعارض يراعي عدد الموظفين المتاحين', () => {
  const staff = [{ id: 't1', name: 'أحمد' }, { id: 't2', name: 'سالم' }];
  const walk = appt({ id: 'w', time: '10:10', staffId: '', items: [{ ...appt().items[0], staffId: '' }] });
  // موظف ثانٍ متاح: لا تعارض حقيقي، ويُقترح الموظف الحر.
  assert.deepEqual(bookingClash([appt()], walk, staff), { clash: [appt()], free: ['t2'], blocking: false });
  // الموظف الثاني في إجازة اليوم: تعارض.
  assert.equal(bookingClash([appt()], walk, [staff[0], { ...staff[1], leaves: ['2026-05-10'] }]).blocking, true);
  // حضور استثنائي في يوم الإجازة الأسبوعية يلغي الراحة.
  const sunday = new Date('2026-05-10T12:00:00').getDay();
  assert.equal(bookingClash([appt()], walk, [staff[0], { ...staff[1], daysOff: [sunday], workDays: ['2026-05-10'] }]).blocking, false);
  // نفس الموظف المحدد مشغول: تعارض حتى لو غيره متاح.
  assert.equal(bookingClash([appt()], appt({ id: 'y', time: '10:15' }), staff).blocking, true);
  // بدون فريق مسجل: أي تداخل تعارض.
  assert.equal(bookingClash([appt()], walk, []).blocking, true);
});

test('منع التكرار: نفس الاسم بفروق الكتابة أو نفس الرقم', () => {
  const staff = [{ id: 'a', name: 'عمار', phone: '55512345' }, { id: 'b', name: 'أحمد علي', phone: '' }];
  assert.equal(findDuplicate(staff, { name: ' عمار ', phone: '' })?.id, 'a');
  assert.equal(findDuplicate(staff, { name: 'احمد  علي' })?.id, 'b');
  assert.equal(findDuplicate(staff, { name: 'سالم', phone: '+974 5551 2345' }, { phone: true })?.id, 'a');
  assert.equal(findDuplicate(staff, { id: 'a', name: 'عمار', phone: '55512345' }, { phone: true }), undefined);
  assert.equal(findDuplicate(staff, { name: 'سالم', phone: '' }, { phone: true }), undefined);
  // الاسم المختصر يصبح كاملاً عند تشابه الاسم الأول.
  const two = [{ id: 'x', name: 'عمار سعيد' }, { id: 'y', name: 'عمار خالد' }, { id: 'z', name: 'سالم' }];
  assert.equal(shortName(two, two[0]), 'عمار سعيد');
  assert.equal(shortName(two, two[2]), 'سالم');
});

test('تعديل موعد خدمته محذوفة لا يُسقطها من الفاتورة، والأرقام العربية في الهاتف', () => {
  const kept = buildItems([], ['gone'], 't1', [{ serviceId: 'gone', name: 'تنظيف بشرة', price: 90, duration: 60, processing: 0, staffId: '' }]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].price, 90);
  assert.equal(kept[0].staffId, 't1');
  assert.equal(phoneDigits('٥٥٥١ ٢٣٤٥'), '55512345');
  assert.equal(normalCode('\u202bEID20\u200f'), 'EID20');
  assert.equal(normalCode('ＥＩＤ٢٠'), 'EID20');
  assert.equal(validPhone('254439'), false);
  assert.equal(validPhone('5551 2345'), true);
  assert.equal(validPhone('+974 5551 2345'), true);
  assert.equal(validPhone('1234567890123456'), false);
});

test('يوم العمل يتبع ساعات الصالون (الإغلاق بعد منتصف الليل)', () => {
  const at = h => new Date(2026, 4, 11, h, 30);
  const night = { hours: { open: '16:00', close: '02:00' } };
  assert.equal(businessDay(night, at(1)), '2026-05-10'); // 01:30 تابعة لليلة 10
  assert.equal(businessDay(night, at(8)), '2026-05-10'); // قبل منتصف المسافة (09:00)
  assert.equal(businessDay(night, at(10)), '2026-05-11');
  assert.equal(businessDay({ hours: { open: '09:00', close: '22:00' } }, at(1)), '2026-05-11');
  assert.equal(businessDay({ hours: { open: '09:00', close: '22:00', allDay: true } }, at(1)), '2026-05-11');
});

test('العميل المحذوف يظهر بعبارة واضحة', () => {
  assert.equal(clientName([{ id: 'c1', name: 'مريم' }], 'c1'), 'مريم');
  assert.equal(clientName([], 'c9'), 'عميل محذوف');
});

test('وقت الانتظار في الصبغة يحرر الموظفة لعميلة أخرى', () => {
  const color = appt({ items: [{ serviceId: 's3', name: 'صبغة', price: 350, duration: 120, processing: 40, staffId: 't1' }], duration: 120 });
  // الموظفة مشغولة أول ٨٠ دقيقة فقط (10:00–11:20)، ثم متاحة حتى 12:00.
  assert.equal(hasAppointmentConflict([color], appt({ id: 'y', time: '11:20' })), false);
  assert.equal(hasAppointmentConflict([color], appt({ id: 'y', time: '11:00' })), true);
});

test('الأوقات المتاحة تحترم ساعات العمل وأيام الإغلاق', () => {
  const settings = { ...defaultSettings('men'), hours: { open: '09:00', close: '11:00', closedDays: [] }, slotStep: 30 };
  const items = [{ serviceId: 's1', name: 'قص', price: 50, duration: 30, staffId: '' }];
  const slots = availableSlots([appt({ date: '2030-01-07', time: '09:30' })], { date: '2030-01-07', items, settings, now: new Date('2030-01-01T08:00:00') });
  assert.deepEqual(slots, ['09:00', '10:00', '10:30']);
  const closed = availableSlots([], { date: '2030-01-06', items, settings: { ...settings, hours: { ...settings.hours, closedDays: [0] } }, now: new Date('2030-01-01T08:00:00') });
  assert.deepEqual(closed, []);
});

test('مفتوح 24 ساعة يتجاهل أيام الإغلاق ويغطي اليوم كاملاً', () => {
  const settings = { ...defaultSettings('men'), hours: { open: '09:00', close: '22:00', closedDays: [0], allDay: true }, slotStep: 60 };
  const items = [{ serviceId: 's1', name: 'قص', price: 50, duration: 60, staffId: '' }];
  const slots = availableSlots([], { date: '2030-01-06', items, settings, now: new Date('2030-01-01T08:00:00') });
  assert.equal(slots.length, 24);
  assert.equal(slots[0], '00:00');
  assert.equal(slots.at(-1), '23:00');
  // الإغلاق بعد منتصف الليل: 20:00–02:00
  const night = availableSlots([], { date: '2030-01-07', items, settings: { ...settings, hours: { open: '20:00', close: '02:00', closedDays: [] } }, now: new Date('2030-01-01T08:00:00') });
  assert.deepEqual(night, ['00:00', '01:00', '20:00', '21:00', '22:00', '23:00']);
});

test('يوم راحة الموظف وإجازته يستبعدانه من المواعيد والسعة', () => {
  const settings = { ...defaultSettings('men'), hours: { open: '09:00', close: '11:00', closedDays: [] }, slotStep: 30 };
  const items = [{ serviceId: 's1', name: 'قص', price: 50, duration: 30, staffId: '' }];
  const now = new Date('2030-01-01T08:00:00');
  // 2030-01-07 يوم اثنين (1)
  const staff = [{ id: 't1', name: 'أ', daysOff: [1] }, { id: 't2', name: 'ب', leaves: ['2030-01-08'] }];
  assert.deepEqual(availableSlots([], { date: '2030-01-07', items, staffId: 't1', settings, now, staff }), []);
  assert.equal(availableSlots([], { date: '2030-01-07', items, staffId: 't2', settings, now, staff }).length, 4);
  assert.deepEqual(availableSlots([], { date: '2030-01-08', items, staffId: 't2', settings, now, staff }), []);
  // «أي موظف»: t2 مشغول 09:30 وt1 في راحة، فلا يُحسب t1 ضمن السعة.
  const busy = [appt({ date: '2030-01-07', time: '09:30', staffId: 't2', items: [{ ...appt().items[0], staffId: 't2' }] })];
  assert.deepEqual(availableSlots(busy, { date: '2030-01-07', items, settings, now, staff }), ['09:00', '10:00', '10:30']);
  // في يوم يعمل فيه الاثنان، يبقى 09:30 متاحاً لـ t1.
  const busyWed = [appt({ date: '2030-01-09', time: '09:30', staffId: 't2', items: [{ ...appt().items[0], staffId: 't2' }] })];
  assert.deepEqual(availableSlots(busyWed, { date: '2030-01-09', items, settings, now, staff }), ['09:00', '09:30', '10:00', '10:30']);
  // كل الفريق في إجازة: لا أوقات.
  assert.deepEqual(availableSlots([], { date: '2030-01-07', items, settings, now, staff: [staff[0]] }), []);
});

test('الدفع الجزئي والعربون والإكرامية والخصم', () => {
  const a = appt({ discount: 10, payments: [{ amount: 20, kind: 'deposit' }, { amount: 5, kind: 'tip' }] });
  assert.equal(appointmentTotal(a), 40);
  assert.equal(amountPaid(a), 20);
  assert.equal(balanceDue(a), 20);
  assert.equal(isPaid(a), false);
  assert.equal(isPaid({ ...a, payments: [...a.payments, { amount: 20, kind: 'payment' }] }), true);
});

test('ترحيل مواعيد النسخة الأولى بدون فقدان الدفعات', () => {
  const old = { id: 'a1', clientId: 'c1', serviceId: 's1', serviceName: 'قص الشعر', price: 50, duration: 30, date: '2026-01-01', time: '09:00', status: 'completed', paymentStatus: 'paid', paymentMethod: 'card', paidAt: '2026-01-01' };
  const migrated = migrateAppointment(old);
  assert.equal(migrated.items[0].name, 'قص الشعر');
  assert.equal(migrated.payments[0].method, 'card');
  assert.equal(isPaid(migrated), true);
  const data = normalizeData({ clients: [], services: [], appointments: [old], ownerName: 'x' });
  assert.equal(data.version, 2);
  assert.ok(Array.isArray(data.giftCards));
  assert.equal(data.ownerName, undefined);
  assert.equal(normalizeData({ nope: true }), null);
});

test('استيراد العملاء من CSV ونص منسوخ مع تجاهل المكرر', () => {
  const csv = 'الاسم,الجوال,ملاحظات\n"أحمد, الكبير",55512345,VIP\nسارة,66698765,\nمكرر,+974 5551 2345,';
  const { added, skipped } = importClients(csv, []);
  assert.equal(added.length, 2);
  assert.equal(added[0].name, 'أحمد, الكبير');
  assert.equal(skipped, 1);
  const pasted = importClients('نورة، 77712345\nبدون رقم', [{ phone: '0000' }]);
  assert.equal(pasted.added.length, 1);
  assert.deepEqual(parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('العميل المنقطع وخطر الغياب', () => {
  const today = '2026-06-01';
  const visits = [-100, -70, -40].map((d, i) => appt({ id: `v${i}`, date: addDays(today, d), status: 'completed' }));
  const lapsed = lapsedClients([{ id: 'c1', name: 'أحمد', phone: '55512345' }], visits, defaultSettings(), today);
  assert.equal(lapsed.length, 1);
  // الزبون العابر (بدون رقم) لا يُقترح للاسترجاع.
  assert.equal(lapsedClients([{ id: 'walk-in', name: 'زبون عابر', phone: '' }], visits.map(v => ({ ...v, clientId: 'walk-in' })), defaultSettings(), today).length, 0);
  assert.equal(clientStats('c1', visits, today).avgInterval, 30);
  const risky = [...visits, appt({ id: 'n1', status: 'no_show', date: addDays(today, -20) }), appt({ id: 'n2', status: 'no_show', date: addDays(today, -10) })];
  assert.equal(noShowRisk('c1', risky).level, 'high');
  assert.equal(noShowRisk('c1', visits).level, 'low');
});

test('توقع المخزون، الصندوق، العمولات والتقرير', () => {
  const today = localISO();
  const forecast = stockForecast([{ id: 'p', quantity: 6, minStock: 2 }], [{ productId: 'p', direction: 'out', quantity: 30, date: today }], today);
  assert.equal(forecast[0].daysLeft, 6);
  assert.equal(forecast[0].low, true);
  const paid = appt({ date: today, status: 'completed', payments: [{ amount: 50, method: 'cash', at: today, kind: 'payment' }] });
  assert.equal(expectedCash(today, [paid], [{ date: today, amount: 15, method: 'cash' }], 100).expected, 135);
  const rows = commissions([{ id: 't1', name: 'سامر', commission: 40 }], [paid], 'today');
  assert.equal(rows[0].commission, 20);
  const data = { ...defaultData('men'), appointments: [paid], sales: [{ amount: 100, method: 'card', at: today, kind: 'gift' }] };
  assert.equal(incomeIn(data, 'today').reduce((s, p) => s + p.amount, 0), 150);
  assert.match(dailyReport(data, today), /الدخل المحصّل/);
});

test('قيمة التطبيق (ROI) تحسب الحجوزات الأونلاين والعملاء المسترجعين', () => {
  const data = { ...defaultData('women'), appointments: [appt({ source: 'online', createdAt: '2026-06-02' }), appt({ id: 'r', clientId: 'c9', createdAt: '2026-06-05' })], messages: [{ kind: 'recovery', clientId: 'c9', at: '2026-06-03' }] };
  const value = roi(data, '2026-06-01');
  assert.equal(value.total, 100);
  assert.equal(value.lines.find(l => l.key === 'recovered').count, 1);
});

test('قائمة الانتظار تقترح المطابق لليوم', () => {
  const list = [{ id: 'w1', status: 'waiting', date: '2026-05-10', createdAt: '1' }, { id: 'w2', status: 'waiting', date: '2026-05-11', createdAt: '1' }, { id: 'w3', status: 'waiting', date: '', createdAt: '2' }];
  assert.deepEqual(waitlistMatches(list, appt(), new Date('2026-01-01T00:00:00')).map(w => w.id), ['w1', 'w3']);
});

test('المزامنة: اكتشاف التغييرات ودمج السحب مع حماية التعديلات المحلية', () => {
  const a = defaultData('men');
  const b = { ...a, clients: [...a.clients.slice(1), { id: 'new', name: 'جديد', phone: '1' }], settings: { ...a.settings } };
  const changes = diffData(a, b);
  assert.ok(changes.some(c => c.id === 'new' && !c.deleted));
  assert.ok(changes.some(c => c.id === 'c1' && c.deleted));
  assert.ok(changes.some(c => c.collection === 'meta'));
  const merged = mergeRows(b, [
    { collection: 'clients', id: 'new', data: { id: 'new', name: 'من الخادم' }, deleted: false },
    { collection: 'clients', id: 'c2', data: { id: 'c2' }, deleted: true },
    { collection: 'meta', id: 'settings', data: { shopName: 'اسم جديد' } },
  ], [{ collection: 'clients', id: 'new' }]);
  assert.equal(merged.clients.find(c => c.id === 'new').name, 'جديد');
  assert.equal(merged.clients.some(c => c.id === 'c2'), false);
  assert.equal(merged.shopName, 'اسم جديد');
});

test('أدوات الرسائل', () => {
  assert.equal(fillTemplate('مرحباً {name} في {shop}', { name: 'علي', shop: 'مقص' }), 'مرحباً علي في مقص');
  assert.equal(whatsappNumber('5555 1234'), '97455551234');
  assert.equal(whatsappNumber('+974 5555 1234'), '97455551234');
  assert.equal(buildItems([{ id: 's1', name: 'قص', price: 50, duration: 30 }], ['s1', 'missing'], 't1')[0].staffId, 't1');
});

test('استيراد العملاء من نص ملصوق بدون فواصل', () => {
  const { added, skipped } = importClients('أحمد محمد 55512345\n+974 6669 8765 سارة علي\nمحمد - ٣٣٣٤٤٥٥٦\nبدون رقم', []);
  assert.deepEqual(added.map(c => [c.name, c.phone]), [['أحمد محمد', '55512345'], ['سارة علي', '+974 6669 8765'], ['محمد', '33344556']]);
  assert.equal(skipped, 1);
});

test('offer templates drop lines whose variable is empty', () => {
  const t = 'مرحباً {name} 👋\n🎁 {title}\n{offer}\nاحجز الآن: {link}';
  assert.equal(fillLines(t, { title: 'خصم 20٪', offer: 'استخدم الكود EID20', link: '' }), '🎁 خصم 20٪\nاستخدم الكود EID20');
  assert.equal(fillLines(salonTemplate({}, 'coupon'), { code: 'EID20', discount: '20٪', until: '' }), 'استخدم الكود EID20 عند الدفع واحصل على خصم 20٪.');
  assert.equal(fillLines(salonTemplate({ templates: { coupon: 'كود {code}' } }, 'coupon'), { code: 'X' }), 'كود X');
});
