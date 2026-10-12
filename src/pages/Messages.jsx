import React, { useEffect, useState } from 'react';
import { BellRing, Bot, Cake, Check, ListChecks, MessageCircle, Send, Sparkles, Trash2, UserRoundCheck } from 'lucide-react';
import { addDays, dateLabel, daysBetween, fillTemplate, localISO, num, serviceNames, timeLabel, whatsappLink } from '../data.js';
import { birthdaysToday, dueSoon, lapsedClients } from '../smart.js';
import { bookingUrl, cloudEnabled } from '../lib/sync.js';
import { Alert, Avatar, Badge, Button, Empty, Row, Segmented, openExternal, useApp } from '../ui.jsx';

export default function Messages() {
  const { data, intent, setIntent, logMessage, patch, remove, toast, shop, go, isManager } = useApp();
  const [tab, setTab] = useState('reminders');
  useEffect(() => {
    const map = { reminders: 'reminders', lapsed: 'recovery', birthday: 'birthday', waitlist: 'waitlist' };
    if (intent?.tab && map[intent.tab]) setTab(map[intent.tab]);
    if (intent) setIntent(null);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = localISO();
  const tomorrow = addDays(today, 1);
  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  const sent = (kind, clientId, appointmentId, withinDays = 0) => data.messages.some(m => m.kind === kind && m.clientId === clientId && (!appointmentId || m.appointmentId === appointmentId) && (!withinDays || daysBetween(m.at, today) < withinDays));
  const link = bookingUrl(shop.slug);
  const t = data.settings.templates;

  const reminders = data.appointments.filter(a => (a.date === tomorrow || a.date === today) && ['pending', 'confirmed'].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const lapsed = lapsedClients(data.clients, data.appointments, data.settings, today);
  const due = dueSoon(data.clients, data.appointments, today);
  const birthdays = birthdaysToday(data.clients, today);
  const waiting = data.waitlist.filter(w => w.status === 'waiting');

  const send = (client, template, extra, kind, appointmentId) => {
    openExternal(whatsappLink(client.phone, fillTemplate(template, { name: client.name.split(' ')[0], shop: data.shopName, link, ...extra })));
    logMessage(kind, client.id, appointmentId);
    if (kind === 'reminder' && appointmentId) patch('appointments', appointmentId, { reminderSentAt: today });
  };

  const tabs = [
    { id: 'reminders', label: `تذكير ${reminders.filter(a => !sent('reminder', a.clientId, a.id)).length || ''}` },
    { id: 'recovery', label: `استرجاع ${lapsed.length + due.length || ''}` },
    { id: 'birthday', label: `ميلاد ${birthdays.length || ''}` },
    { id: 'waitlist', label: `انتظار ${waiting.length || ''}` },
  ];

  return <div className="stack">
    <div className={`auto-card ${cloudEnabled ? '' : 'muted-card'}`}>
      <span className="tile-icon tone-purple"><Bot size={24} /></span>
      <div><strong>الأتمتة عبر واتساب</strong><small>{cloudEnabled ? 'عند ربط رقم واتساب للأعمال تُرسل التذكيرات وتقرير اليوم تلقائياً، ويرد المساعد الذكي على الحجوزات.' : 'اضغط زر واتساب بجانب كل عميل — الرسالة جاهزة.'}</small></div>
      {cloudEnabled && isManager && <Button size="sm" variant="secondary" onClick={() => go('settings', { open: 'whatsapp' })}>إعداد</Button>}
    </div>
    <Segmented size="sm" items={tabs} value={tab} onChange={setTab} />

    {tab === 'reminders' && (reminders.length ? <div className="list">{reminders.map(a => {
      const c = clients[a.clientId]; if (!c) return null;
      const done = sent('reminder', c.id, a.id);
      return <Row key={a.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={`${a.date === today ? 'اليوم' : 'غداً'} ${timeLabel(a.time)} · ${serviceNames(a)}`}
        trailing={done ? <Badge tone="green"><Check size={12} /> أُرسل</Badge> : <Button size="sm" icon={BellRing} onClick={() => send(c, t.reminder, { date: dateLabel(a.date), time: timeLabel(a.time) }, 'reminder', a.id)}>ذكّر</Button>} />;
    })}</div> : <Empty icon={BellRing} title="لا تذكيرات مطلوبة" text="مواعيد اليوم والغد كلها مُذكّرة" />)}

    {tab === 'recovery' && <>
      {!link && <Alert tone="orange" icon={Sparkles}>فعّل رابط الحجز من الإعدادات ليُضاف للرسالة تلقائياً</Alert>}
      {due.length > 0 && <><small className="muted">حان موعدهم المعتاد</small><div className="list">{due.map(({ client: c, stats }) => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={`عادةً كل ${num(stats.avgInterval)} يوم · آخر زيارة ${dateLabel(stats.lastVisit, { day: 'numeric', month: 'short' })}`}
        trailing={sent('recovery', c.id, '', 14) ? <Badge tone="green">أُرسل</Badge> : <Button size="sm" variant="secondary" icon={Send} onClick={() => send(c, t.recovery, {}, 'recovery')}>أرسل</Button>} />)}</div></>}
      {lapsed.length > 0 ? <><small className="muted">منقطعون — الأعلى إنفاقاً أولاً</small><div className="list">{lapsed.map(({ client: c, stats, overdue }) => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={`غائب منذ ${num(stats.daysSince)} يوم (متأخر ${num(overdue)})`}
        trailing={sent('recovery', c.id, '', 21) ? <Badge tone="green">أُرسل</Badge> : <Button size="sm" icon={UserRoundCheck} onClick={() => send(c, t.recovery, {}, 'recovery')}>استرجع</Button>} />)}</div></>
        : !due.length && <Empty icon={UserRoundCheck} title="لا عملاء منقطعون" text="عملاؤك يعودون بانتظام 👏" />}
    </>}

    {tab === 'birthday' && (birthdays.length ? <div className="list">{birthdays.map(c => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle="عيد ميلاده اليوم 🎂"
      trailing={sent('birthday', c.id, '', 300) ? <Badge tone="green">أُرسل</Badge> : <Button size="sm" icon={Cake} onClick={() => send(c, t.birthday, {}, 'birthday')}>هنّئ</Button>} />)}</div>
      : <Empty icon={Cake} title="لا أعياد ميلاد اليوم" text="أضف تاريخ الميلاد في ملف العميل" />)}

    {tab === 'waitlist' && (waiting.length ? <div className="list">{waiting.map(w => {
      const c = clients[w.clientId];
      return <Row key={w.id} leading={<Avatar name={c?.name} />} title={c?.name || 'عميل'} subtitle={`${w.date ? dateLabel(w.date) : 'أي يوم'}${w.serviceId ? ` · ${data.services.find(s => s.id === w.serviceId)?.name || ''}` : ''}`}
        trailing={<span className="row-end">
          {c && <Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => openExternal(whatsappLink(c.phone))}>تواصل</Button>}
          <button type="button" className="icon-btn" aria-label="حذف" onClick={() => { remove('waitlist', w.id); toast('أُزيل من القائمة'); }}><Trash2 size={16} /></button>
        </span>} />;
    })}</div> : <Empty icon={ListChecks} title="قائمة الانتظار فارغة" text="عند امتلاء يوم، أضف العميل للانتظار من شاشة الحجز — وعند أي إلغاء نقترحه عليك" />)}
  </div>;
}
