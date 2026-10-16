import React, { useState } from 'react';
import {
  BellRing, Boxes, CalendarCheck2, CalendarOff, CalendarPlus, Cake, CircleDollarSign, Clock3, Lightbulb, ListChecks,
  ListPlus, MessageCircle, Receipt, Share2, UsersRound, UserRoundCheck, UserX, WalletCards,
} from 'lucide-react';
import { clientName, addDays, businessDay, shortName, staffOnDay, amountPaid, balanceDue, dateLabel, isPaid, localISO, money, num, serviceNames, sortAppointments, timeLabel, uid } from '../data.js';
import { incomeIn, todayInsights } from '../smart.js';
import { Avatar, Badge, Button, Empty, Row, Section, Stat, Tile, useApp } from '../ui.jsx';
import { AppointmentSheet, BookingWizard } from './Appointments.jsx';
import { L, isEn } from '../i18n.js';
import { bookingUrl, cloudEnabled } from '../lib/sync.js';
import { shareLink } from '../lib/files.js';

const insightIcons = { reminders: BellRing, lapsed: UserRoundCheck, stock: Boxes, birthday: Cake, unpaid: Receipt, waitlist: ListChecks };

export default function Home() {
  const { data, setData, go, role, staffMember, can, patch, toast, shop, account } = useApp();
  const link = cloudEnabled && shop?.slug ? bookingUrl(shop.slug) : '';
  const share = async () => { if (await shareLink(link, L(`احجز موعدك في ${data.shopName || ''}:`, `Book your appointment at ${data.shopName || ''}:`))) toast(L('تم نسخ رابط الحجز', 'Booking link copied')); };
  const today = localISO();
  const mine = a => role !== 'staff' || !staffMember || a.staffId === staffMember.id || (a.items || []).some(i => i.staffId === staffMember.id);
  const todays = data.appointments.filter(a => a.date === today && !['cancelled'].includes(a.status) && mine(a)).sort(sortAppointments);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = todays.find(a => ['pending', 'confirmed', 'arrived'].includes(a.status) && a.time >= nowTime.slice(0, 2) + ':00') || todays.find(a => ['pending', 'confirmed', 'arrived'].includes(a.status));
  const income = incomeIn(data, 'today', businessDay(data.settings)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const unpaid = data.appointments.filter(a => a.status === 'completed' && !isPaid(a));
  const client = next && data.clients.find(c => c.id === next.clientId);
  const insights = role === 'staff' ? [] : todayInsights(data, today);
  // مواعيد مرّ عليها 15 دقيقة (اليوم أو أمس) دون تسجيل حضور: يُطلب إجراء.
  const overdue = data.appointments.filter(a => ['pending', 'confirmed'].includes(a.status) && a.date >= addDays(today, -1) && mine(a)
    && new Date(`${a.date}T${a.time}:00`).getTime() + 15 * 60000 < now.getTime()).sort(sortAppointments).slice(0, 6);
  // غياب + إضافة لقائمة الانتظار: عند أول وقت يتفرغ نقترح عليه الموعد.
  const toWaitlist = a => setData(prev => ({
    ...prev,
    appointments: prev.appointments.map(x => (x.id === a.id ? { ...x, status: 'no_show' } : x)),
    waitlist: prev.waitlist.some(w => w.clientId === a.clientId && w.status === 'waiting') ? prev.waitlist : [...prev.waitlist, {
      id: uid(), clientId: a.clientId, date: '', serviceId: a.items?.[0]?.serviceId || '', staffId: a.staffId || '', status: 'waiting', createdAt: today,
      note: L(`لم يحضر موعد ${dateLabel(a.date, { day: 'numeric', month: 'short' })} — يريد موعداً جديداً`, `Missed ${dateLabel(a.date, { day: 'numeric', month: 'short' })} — wants a new slot`),
    }],
  }));
  const hour = now.getHours();
  const firstName = account?.displayName?.trim().split(/\s+/)[0] || '';
  const team = staffOnDay(data.staff, today);
  // الحجز وفتح الموعد يتمّان هنا فوق الرئيسية بدون الانتقال لصفحة أخرى.
  const [wizard, setWizard] = useState(null);
  const [openId, setOpenId] = useState(null);
  const opened = openId && data.appointments.find(a => a.id === openId);

  return <div className="stack-lg">
    <div className="hello">
      <span>{hour < 12 ? L('صباح الخير', 'Good morning') : L('مساء الخير', 'Good evening')}{firstName ? L(`، ${firstName}`, `, ${firstName}`) : ''} 👋</span>
      <small>{dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
    </div>

    <div className="stats">
      <Stat icon={CalendarCheck2} label={L('مواعيد اليوم', 'Today’s appointments')} value={num(todays.length)} onClick={() => go('appointments')} />
      {role !== 'staff' && <Stat icon={CircleDollarSign} tone="green" label={L('دخل اليوم', 'Today’s income')} value={money(income)} onClick={can('reports') ? () => go('reports') : undefined} />}
      {role !== 'staff' && <Stat icon={WalletCards} tone={unpaid.length ? 'red' : 'blue'} label={L('بانتظار الدفع', 'Awaiting payment')} value={num(unpaid.length)} onClick={() => go('checkout')} />}
      {can('team') && team.total > 0 && <Stat icon={UsersRound} tone={team.off.length ? 'orange' : 'green'} label={L('الفريق المتاح اليوم', 'Team available today')} value={L(`${num(team.available)} من ${num(team.total)}`, `${num(team.available)} of ${num(team.total)}`)} onClick={() => go('team')} />}
      {role === 'staff' && <Stat icon={Clock3} tone="blue" label={L('المتبقي اليوم', 'Remaining today')} value={num(todays.filter(a => a.status !== 'completed').length)} />}
    </div>
    {can('team') && team.off.length > 0 && <button type="button" className="team-off-note" onClick={() => go('team')}>{L('غير متاح اليوم: ', 'Off today: ')}{team.off.map(o => `${shortName(data.staff, o.member)} (${o.reason === 'leave' ? L('إجازة', 'leave') : L('راحة', 'day off')})`).join(isEn ? ', ' : '، ')}</button>}

    <Section title={L('الموعد التالي', 'Next appointment')}>
      {next ? <div className="next-card">
        <div className="next-time"><strong>{timeLabel(next.time)}</strong><small>{num(next.duration)} {L('دقيقة', 'min')}</small></div>
        <div className="next-person"><Avatar name={client?.name} size="lg" /><div><strong>{clientName(data.clients, next.clientId)}</strong><small>{serviceNames(next)}</small></div></div>
        <Badge status={next.status} />
        <div className="next-actions">
          {next.status !== 'arrived' && <Button variant="secondary" icon={UserRoundCheck} onClick={() => { patch('appointments', next.id, { status: 'arrived', arrivedAt: new Date().toISOString() }); toast(L('تم تسجيل الوصول', 'Checked in')); }}>{L('وصل', 'Arrived')}</Button>}
          <Button icon={CalendarCheck2} onClick={() => setOpenId(next.id)}>{L('فتح الموعد', 'Open appointment')}</Button>
        </div>
      </div> : <Empty icon={CalendarCheck2} title={L('لا مواعيد قادمة اليوم', 'No more appointments today')} text={link ? L('الجدول فارغ — شارك رابط الحجز مع عملائك', 'Your schedule is clear — share your booking link with clients') : L('الجدول فارغ حالياً', 'Your schedule is clear for now')}
        action={<div className="row-buttons center">
          {can('appointments') && <Button icon={CalendarPlus} onClick={() => setWizard({})}>{L('حجز جديد', 'New booking')}</Button>}
          {link && <Button variant="secondary" icon={Share2} onClick={share}>{L('مشاركة الرابط', 'Share link')}</Button>}
        </div>} />}
    </Section>

    <div className="tiles tiles-4">
      <Tile icon={CalendarPlus} label={L('حجز جديد', 'New booking')} onClick={() => setWizard({})} />
      <Tile icon={UserRoundCheck} label={L('حاضر الآن', 'Walk-in')} hint={L('بدون موعد', 'No appointment')} tone="blue" onClick={() => setWizard({ walkIn: true })} />
      {can('checkout') && <Tile icon={WalletCards} label={L('تحصيل', 'Checkout')} tone="green" count={unpaid.length} onClick={() => go('checkout')} />}
      {can('messages') && <Tile icon={MessageCircle} label={L('رسائل', 'Messages')} tone="purple" count={insights.filter(i => i.action === 'messages').length} onClick={() => go('messages')} />}
    </div>

    {overdue.length > 0 && <Section title={<><UserX size={18} /> {L('مرّ موعدهم ولم يُسجَّل حضورهم', 'Past their time, not checked in')}</>}>
      <div className="list">{overdue.map(a => {
        const c = data.clients.find(x => x.id === a.clientId);
        return <div key={a.id} className="action-row">
          <Row leading={<span className="time-chip">{timeLabel(a.time)}</span>} title={clientName(data.clients, a.clientId)} subtitle={`${dateLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${serviceNames(a)}`} onClick={() => setOpenId(a.id)} />
          <div className="row-buttons">
            <Button size="sm" variant="secondary" icon={UserRoundCheck} onClick={() => { patch('appointments', a.id, { status: 'arrived', arrivedAt: new Date().toISOString() }); toast(L('سُجّل الحضور', 'Marked arrived')); }}>{L('حضر', 'Arrived')}</Button>
            <Button size="sm" variant="ghost" icon={UserX} onClick={() => { patch('appointments', a.id, { status: 'no_show' }); toast(L('سُجّل غياب', 'Marked no-show')); }}>{L('لم يحضر', 'No-show')}</Button>
            {c && <Button size="sm" variant="ghost" icon={ListPlus} onClick={() => toWaitlist(a)}>{L('غياب + انتظار', 'No-show + waitlist')}</Button>}
          </div>
        </div>;
      })}</div>
    </Section>}

    {insights.length > 0 && <Section title={<><Lightbulb size={18} /> {L('اقتراحات ذكية', 'Smart suggestions')}</>}>
      <div className="list">{insights.map(insight => {
        const Icon = insightIcons[insight.id] || Lightbulb;
        return <Row key={insight.id} leading={<span className={`dot-icon tone-${insight.tone}`}><Icon size={18} /></span>} title={insight.title} onClick={() => go(insight.action, { tab: insight.id })} />;
      })}</div>
    </Section>}

    {role === 'staff' && <Section title={L('مواعيدي اليوم', 'My appointments today')}>
      {todays.length ? <div className="list">{todays.map(a => <Row key={a.id} leading={<span className="time-chip">{timeLabel(a.time)}</span>} title={clientName(data.clients, a.clientId)} subtitle={serviceNames(a)} trailing={<Badge status={a.status} />} onClick={() => setOpenId(a.id)} />)}</div>
        : <Empty icon={CalendarOff} title={L('لا توجد مواعيد اليوم', 'No appointments today')} />}
    </Section>}

    {role !== 'staff' && unpaid.length > 0 && <Section title={L('مكتملة وغير مدفوعة', 'Completed, unpaid')} action={<button type="button" className="link" onClick={() => go('checkout')}>{L('عرض الكل', 'View all')}</button>}>
      <div className="list">{unpaid.slice(0, 3).map(a => <Row key={a.id} leading={<Avatar name={data.clients.find(c => c.id === a.clientId)?.name} />} title={clientName(data.clients, a.clientId)} subtitle={serviceNames(a)} trailing={<strong className="red">{money(balanceDue(a) || amountPaid(a))}</strong>} onClick={() => go('checkout', { open: a.id })} />)}</div>
    </Section>}
    {wizard && <BookingWizard initial={wizard} onClose={() => setWizard(null)} onDone={() => setWizard(null)} />}
    {opened && <AppointmentSheet appointment={opened} onClose={() => setOpenId(null)} onEdit={() => { setWizard({ edit: opened }); setOpenId(null); }} />}
  </div>;
}
