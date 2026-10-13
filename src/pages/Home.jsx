import React, { useState } from 'react';
import {
  BellRing, Boxes, CalendarCheck2, CalendarPlus, Cake, CircleDollarSign, Clock3, Lightbulb, ListChecks,
  MessageCircle, Receipt, UserRoundCheck, WalletCards,
} from 'lucide-react';
import { amountPaid, balanceDue, dateLabel, isPaid, localISO, money, num, serviceNames, sortAppointments, timeLabel } from '../data.js';
import { incomeIn, todayInsights } from '../smart.js';
import { Avatar, Badge, Button, Empty, Row, Section, Stat, Tile, useApp } from '../ui.jsx';
import { AppointmentSheet, BookingWizard } from './Appointments.jsx';
import { L } from '../i18n.js';

const insightIcons = { reminders: BellRing, lapsed: UserRoundCheck, stock: Boxes, birthday: Cake, unpaid: Receipt, waitlist: ListChecks };

export default function Home() {
  const { data, go, role, staffMember, can, patch, toast } = useApp();
  const today = localISO();
  const mine = a => role !== 'staff' || !staffMember || a.staffId === staffMember.id || (a.items || []).some(i => i.staffId === staffMember.id);
  const todays = data.appointments.filter(a => a.date === today && !['cancelled'].includes(a.status) && mine(a)).sort(sortAppointments);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = todays.find(a => ['pending', 'confirmed', 'arrived'].includes(a.status) && a.time >= nowTime.slice(0, 2) + ':00') || todays.find(a => ['pending', 'confirmed', 'arrived'].includes(a.status));
  const income = incomeIn(data, 'today').reduce((s, p) => s + Number(p.amount || 0), 0);
  const unpaid = data.appointments.filter(a => a.status === 'completed' && !isPaid(a));
  const client = next && data.clients.find(c => c.id === next.clientId);
  const insights = role === 'staff' ? [] : todayInsights(data, today);
  const hour = now.getHours();
  // الحجز وفتح الموعد يتمّان هنا فوق الرئيسية بدون الانتقال لصفحة أخرى.
  const [wizard, setWizard] = useState(null);
  const [openId, setOpenId] = useState(null);
  const opened = openId && data.appointments.find(a => a.id === openId);

  return <div className="stack-lg">
    <div className="hello">
      <span>{hour < 12 ? L('صباح الخير', 'Good morning') : L('مساء الخير', 'Good evening')} 👋</span>
      <small>{dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
    </div>

    <div className="stats">
      <Stat icon={CalendarCheck2} label={L('مواعيد اليوم', 'Today’s appointments')} value={num(todays.length)} onClick={() => go('appointments')} />
      {role !== 'staff' && <Stat icon={CircleDollarSign} tone="green" label={L('دخل اليوم', 'Today’s income')} value={money(income)} onClick={can('reports') ? () => go('reports') : undefined} />}
      {role !== 'staff' && <Stat icon={WalletCards} tone={unpaid.length ? 'red' : 'blue'} label={L('بانتظار الدفع', 'Awaiting payment')} value={num(unpaid.length)} onClick={() => go('checkout')} />}
      {role === 'staff' && <Stat icon={Clock3} tone="blue" label={L('المتبقي اليوم', 'Remaining today')} value={num(todays.filter(a => a.status !== 'completed').length)} />}
    </div>

    <Section title={L('الموعد التالي', 'Next appointment')}>
      {next ? <div className="next-card">
        <div className="next-time"><strong>{timeLabel(next.time)}</strong><small>{num(next.duration)} {L('دقيقة', 'min')}</small></div>
        <div className="next-person"><Avatar name={client?.name} size="lg" /><div><strong>{client?.name || L('عميل', 'Client')}</strong><small>{serviceNames(next)}</small></div></div>
        <Badge status={next.status} />
        <div className="next-actions">
          {next.status !== 'arrived' && <Button variant="secondary" icon={UserRoundCheck} onClick={() => { patch('appointments', next.id, { status: 'arrived', arrivedAt: new Date().toISOString() }); toast(L('تم تسجيل الوصول', 'Checked in')); }}>{L('وصل', 'Arrived')}</Button>}
          <Button icon={CalendarCheck2} onClick={() => setOpenId(next.id)}>{L('فتح الموعد', 'Open appointment')}</Button>
        </div>
      </div> : <Empty icon={CalendarCheck2} title={L('لا مواعيد قادمة اليوم', 'No more appointments today')} text={L('الجدول فارغ — شارك رابط الحجز مع عملائك', 'Your schedule is clear — share your booking link with clients')} action={can('appointments') && <Button icon={CalendarPlus} onClick={() => setWizard({})}>{L('حجز جديد', 'New booking')}</Button>} />}
    </Section>

    <div className="tiles tiles-4">
      <Tile icon={CalendarPlus} label={L('حجز جديد', 'New booking')} onClick={() => setWizard({})} />
      <Tile icon={UserRoundCheck} label={L('حاضر الآن', 'Walk-in')} hint={L('بدون موعد', 'No appointment')} tone="blue" onClick={() => setWizard({ walkIn: true })} />
      {can('checkout') && <Tile icon={WalletCards} label={L('تحصيل', 'Checkout')} tone="green" count={unpaid.length} onClick={() => go('checkout')} />}
      {can('messages') && <Tile icon={MessageCircle} label={L('رسائل', 'Messages')} tone="purple" count={insights.filter(i => i.action === 'messages').length} onClick={() => go('messages')} />}
    </div>

    {insights.length > 0 && <Section title={<><Lightbulb size={18} /> {L('اقتراحات ذكية', 'Smart suggestions')}</>}>
      <div className="list">{insights.map(insight => {
        const Icon = insightIcons[insight.id] || Lightbulb;
        return <Row key={insight.id} leading={<span className={`dot-icon tone-${insight.tone}`}><Icon size={18} /></span>} title={insight.title} onClick={() => go(insight.action, { tab: insight.id })} />;
      })}</div>
    </Section>}

    {role === 'staff' && <Section title={L('مواعيدي اليوم', 'My appointments today')}>
      <div className="list">{todays.map(a => <Row key={a.id} leading={<span className="time-chip">{timeLabel(a.time)}</span>} title={data.clients.find(c => c.id === a.clientId)?.name} subtitle={serviceNames(a)} trailing={<Badge status={a.status} />} onClick={() => setOpenId(a.id)} />)}</div>
    </Section>}

    {role !== 'staff' && unpaid.length > 0 && <Section title={L('مكتملة وغير مدفوعة', 'Completed, unpaid')} action={<button type="button" className="link" onClick={() => go('checkout')}>{L('عرض الكل', 'View all')}</button>}>
      <div className="list">{unpaid.slice(0, 3).map(a => <Row key={a.id} leading={<Avatar name={data.clients.find(c => c.id === a.clientId)?.name} />} title={data.clients.find(c => c.id === a.clientId)?.name} subtitle={serviceNames(a)} trailing={<strong className="red">{money(balanceDue(a) || amountPaid(a))}</strong>} onClick={() => go('checkout', { open: a.id })} />)}</div>
    </Section>}
    {wizard && <BookingWizard initial={wizard} onClose={() => setWizard(null)} onDone={() => setWizard(null)} />}
    {opened && <AppointmentSheet appointment={opened} onClose={() => setOpenId(null)} onEdit={() => { setWizard({ edit: opened }); setOpenId(null); }} />}
  </div>;
}
