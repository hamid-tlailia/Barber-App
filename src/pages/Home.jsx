import React from 'react';
import {
  BellRing, Boxes, CalendarCheck2, CalendarPlus, Cake, CircleDollarSign, Clock3, Lightbulb, ListChecks,
  MessageCircle, Receipt, UserRoundCheck, WalletCards,
} from 'lucide-react';
import { amountPaid, balanceDue, dateLabel, isPaid, localISO, money, num, serviceNames, sortAppointments, timeLabel } from '../data.js';
import { incomeIn, todayInsights } from '../smart.js';
import { Avatar, Badge, Button, Empty, Row, Section, Stat, Tile, useApp } from '../ui.jsx';

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

  return <div className="stack-lg">
    <div className="hello">
      <span>{hour < 12 ? 'صباح الخير' : 'مساء الخير'} 👋</span>
      <small>{dateLabel(today)}</small>
    </div>

    <div className="stats">
      <Stat icon={CalendarCheck2} label="مواعيد اليوم" value={num(todays.length)} onClick={() => go('appointments')} />
      {role !== 'staff' && <Stat icon={CircleDollarSign} tone="green" label="دخل اليوم" value={money(income)} onClick={can('reports') ? () => go('reports') : undefined} />}
      {role !== 'staff' && <Stat icon={WalletCards} tone={unpaid.length ? 'red' : 'blue'} label="بانتظار الدفع" value={num(unpaid.length)} onClick={() => go('checkout')} />}
      {role === 'staff' && <Stat icon={Clock3} tone="blue" label="المتبقي اليوم" value={num(todays.filter(a => a.status !== 'completed').length)} />}
    </div>

    <Section title="الموعد التالي">
      {next ? <div className="next-card">
        <div className="next-time"><strong>{timeLabel(next.time)}</strong><small>{num(next.duration)} دقيقة</small></div>
        <div className="next-person"><Avatar name={client?.name} size="lg" /><div><strong>{client?.name || 'عميل'}</strong><small>{serviceNames(next)}</small></div></div>
        <Badge status={next.status} />
        <div className="next-actions">
          {next.status !== 'arrived' && <Button variant="secondary" icon={UserRoundCheck} onClick={() => { patch('appointments', next.id, { status: 'arrived', arrivedAt: new Date().toISOString() }); toast('تم تسجيل الوصول'); }}>وصل</Button>}
          <Button icon={CalendarCheck2} onClick={() => go('appointments', { open: next.id })}>فتح الموعد</Button>
        </div>
      </div> : <Empty icon={CalendarCheck2} title="لا مواعيد قادمة اليوم" text="الجدول فارغ — شارك رابط الحجز مع عملائك" action={can('appointments') && <Button icon={CalendarPlus} onClick={() => go('appointments', { create: true })}>حجز جديد</Button>} />}
    </Section>

    <div className="tiles tiles-4">
      <Tile icon={CalendarPlus} label="حجز جديد" onClick={() => go('appointments', { create: true })} />
      <Tile icon={UserRoundCheck} label="حاضر الآن" hint="بدون موعد" tone="blue" onClick={() => go('appointments', { walkIn: true })} />
      {can('checkout') && <Tile icon={WalletCards} label="تحصيل" tone="green" count={unpaid.length} onClick={() => go('checkout')} />}
      {can('messages') && <Tile icon={MessageCircle} label="رسائل" tone="purple" count={insights.filter(i => i.action === 'messages').length} onClick={() => go('messages')} />}
    </div>

    {insights.length > 0 && <Section title={<><Lightbulb size={18} /> اقتراحات ذكية</>}>
      <div className="list">{insights.map(insight => {
        const Icon = insightIcons[insight.id] || Lightbulb;
        return <Row key={insight.id} leading={<span className={`dot-icon tone-${insight.tone}`}><Icon size={18} /></span>} title={insight.title} onClick={() => go(insight.action, { tab: insight.id })} />;
      })}</div>
    </Section>}

    {role === 'staff' && <Section title="مواعيدي اليوم">
      <div className="list">{todays.map(a => <Row key={a.id} leading={<span className="time-chip">{timeLabel(a.time)}</span>} title={data.clients.find(c => c.id === a.clientId)?.name} subtitle={serviceNames(a)} trailing={<Badge status={a.status} />} onClick={() => go('appointments', { open: a.id })} />)}</div>
    </Section>}

    {role !== 'staff' && unpaid.length > 0 && <Section title="مكتملة وغير مدفوعة" action={<button type="button" className="link" onClick={() => go('checkout')}>عرض الكل</button>}>
      <div className="list">{unpaid.slice(0, 3).map(a => <Row key={a.id} leading={<Avatar name={data.clients.find(c => c.id === a.clientId)?.name} />} title={data.clients.find(c => c.id === a.clientId)?.name} subtitle={serviceNames(a)} trailing={<strong className="red">{money(balanceDue(a) || amountPaid(a))}</strong>} onClick={() => go('checkout', { open: a.id })} />)}</div>
    </Section>}
  </div>;
}
