import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, defaultData, hasAppointmentConflict, loadData, localISO, money, nextOpenSlot, sortAppointments, statusText, timeLabel } from './data.js';

test('date helpers use calendar days even at month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.match(localISO(new Date(2026, 9, 11)), /^2026-10-11$/);
});

test('sample appointments reference real clients and services, and include today', () => {
  const data = defaultData();
  assert.ok(data.clients.length > 0);
  assert.ok(data.services.length > 0);
  assert.ok(data.staff.length > 0);
  assert.ok(data.products.length > 0);
  assert.ok(data.products.some(product => product.quantity <= product.minStock));
  assert.ok(data.appointments.some(a => a.date === localISO()));
  for (const appointment of data.appointments) {
    assert.ok(data.clients.some(c => c.id === appointment.clientId));
    assert.ok(data.services.some(s => s.id === appointment.serviceId));
    assert.equal(appointment.paymentStatus === 'paid', Boolean(appointment.paidAt));
  }
});

test('appointments sort by day then time and localized labels are present', () => {
  const list = [{ date: '2026-10-12', time: '09:00' }, { date: '2026-10-11', time: '14:00' }, { date: '2026-10-11', time: '10:00' }];
  assert.deepEqual(list.sort(sortAppointments).map(a => a.time), ['10:00', '14:00', '09:00']);
  assert.equal(timeLabel('14:30'), '02:30 م');
  assert.ok(money(75).includes('ر.ق'));
  assert.equal(statusText.confirmed, 'مؤكد');
});

test('overlapping appointments are rejected, but adjacent and cancelled slots are allowed', () => {
  const appointments = [{ id: 'a1', date: '2026-10-12', time: '10:00', duration: 50, status: 'confirmed' }];
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '10:30', duration: 30 }), true);
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '09:30', duration: 30 }), false);
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '10:50', duration: 30 }), false);
  assert.equal(hasAppointmentConflict(appointments, { id: 'a1', date: '2026-10-12', time: '10:30', duration: 30 }), false);
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '10:30', duration: 30, status: 'cancelled' }), false);
});

test('first suggested slot skips occupied time and honors selected date', () => {
  const appointments = [{ id: 'a1', date: '2026-10-12', time: '09:00', duration: 60, status: 'confirmed' }];
  assert.deepEqual(nextOpenSlot(appointments, 30, '2026-10-12', new Date(2026, 9, 11, 8)), { date: '2026-10-12', time: '10:00' });
});

test('assigned barbers have independent calendars while unassigned appointments remain blocking', () => {
  const appointments = [{ id: 'a1', staffId: 't1', date: '2026-10-12', time: '10:00', duration: 50, status: 'confirmed' }];
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '10:15', duration: 30, staffId: 't2' }), false);
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '10:15', duration: 30, staffId: 't1' }), true);
  assert.equal(hasAppointmentConflict(appointments, { date: '2026-10-12', time: '10:15', duration: 30 }), true);
  const busyMorning = [{ id: 'a2', staffId: 't1', date: '2026-10-12', time: '09:00', duration: 120, status: 'confirmed' }];
  assert.deepEqual(nextOpenSlot(busyMorning, 30, '2026-10-12', new Date(2026, 9, 11, 8), 't2'), { date: '2026-10-12', time: '09:00' });
  assert.deepEqual(nextOpenSlot(busyMorning, 30, '2026-10-12', new Date(2026, 9, 11, 8), 't1'), { date: '2026-10-12', time: '11:00' });
});

test('invalid saved data safely falls back to sample data', () => {
  globalThis.localStorage = { getItem: () => '{invalid' };
  assert.ok(loadData().appointments.length > 0);
  globalThis.localStorage = { getItem: () => JSON.stringify({ clients: [], services: [], appointments: [], shopName: 'اختبار' }) };
  const migrated = loadData();
  assert.equal(migrated.shopName, 'اختبار');
  assert.deepEqual(migrated.staff, []);
  assert.deepEqual(migrated.products, []);
  assert.deepEqual(migrated.stockMovements, []);
  delete globalThis.localStorage;
});
