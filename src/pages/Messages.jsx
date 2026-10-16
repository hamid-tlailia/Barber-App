import React, { useEffect, useState } from 'react';
import { BellRing, Bot, Cake, Check, ListChecks, Megaphone, MessageCircle, Send, Sparkles, Trash2, UserRoundCheck } from 'lucide-react';
import { clientName, addDays, clientLang, dateFor, dateLabel, daysBetween, fillTemplate, localISO, messageFor, num, serviceNames, timeFor, timeLabel, whatsappLink } from '../data.js';
import { birthdaysToday, dueSoon, lapsedClients } from '../smart.js';
import { api, bookingUrl, cloudEnabled } from '../lib/sync.js';
import { WhatsAppSettings } from './Settings.jsx';
import { OfferShare } from './Offer.jsx';
import { Alert, Avatar, Badge, Button, Empty, Row, Segmented, openExternal, useApp } from '../ui.jsx';
import { L } from '../i18n.js';

export default function Messages() {
  const { data, intent, setIntent, logMessage, patch, remove, toast, shop, go, isManager } = useApp();
  const [tab, setTab] = useState('reminders');
  // حالة إضافة واتساب الذكي: «تخصيص» إن كانت مفعّلة، و«إعداد» إن لم تكن.
  const [waActive, setWaActive] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [campaign, setCampaign] = useState(false);
  useEffect(() => { if (cloudEnabled && isManager) api.integration(shop.id).then(row => setWaActive(Boolean(row?.wa_addon))).catch(() => {}); }, [shop.id, isManager, waOpen]);
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

  const reminders = data.appointments.filter(a => (a.date === tomorrow || a.date === today) && ['pending', 'confirmed'].includes(a.status)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const lapsed = lapsedClients(data.clients, data.appointments, data.settings, today);
  const due = dueSoon(data.clients, data.appointments, today);
  const birthdays = birthdaysToday(data.clients, today);
  const waiting = data.waitlist.filter(w => w.status === 'waiting' && (!w.date || w.date >= today)); // طلب ليوم مضى لم يعد صالحاً

  // النص بلغة العميل (عربي/إنجليزي) كما هو محدد في ملفه.
  const send = (client, key, extra, kind, appointmentId) => {
    openExternal(whatsappLink(client.phone, fillTemplate(messageFor(data.settings, key, client), { name: client.name.split(' ')[0], shop: data.shopName, link, ...extra })));
    logMessage(kind, client.id, appointmentId);
    if (kind === 'reminder' && appointmentId) patch('appointments', appointmentId, { reminderSentAt: today });
  };

  const tabs = [
    { id: 'reminders', label: `${L('تذكير', 'Reminders')} ${reminders.filter(a => !sent('reminder', a.clientId, a.id)).length || ''}` },
    { id: 'recovery', label: `${L('استرجاع', 'Win-back')} ${lapsed.length + due.length || ''}` },
    { id: 'birthday', label: `${L('ميلاد', 'Birthdays')} ${birthdays.length || ''}` },
    { id: 'waitlist', label: `${L('انتظار', 'Waitlist')} ${waiting.length || ''}` },
  ];

  return <div className="stack">
    <div className={`auto-card ${cloudEnabled ? '' : 'muted-card'}`}>
      <span className="tile-icon tone-purple"><Bot size={24} /></span>
      <div><strong>{L('الأتمتة عبر واتساب', 'WhatsApp automation')}{waActive && <Badge tone="green"><Check size={12} /> {L('مفعّلة', 'Active')}</Badge>}</strong><small>{waActive ? L('التذكيرات والتقرير اليومي تُرسل تلقائياً عبر واتساب.', 'Reminders and the daily report are sent automatically on WhatsApp.') : cloudEnabled ? L('عند ربط رقم واتساب للأعمال تُرسل التذكيرات وتقرير اليوم تلقائياً، ويرد المساعد الذكي على الحجوزات.', 'Once a WhatsApp Business number is connected, reminders and the daily report are sent automatically, and the smart assistant replies to booking requests.') : L('اضغط زر واتساب بجانب كل عميل — الرسالة جاهزة.', 'Tap the WhatsApp button next to any client — the message is ready.')}</small></div>
      {cloudEnabled && isManager && <Button size="sm" variant="secondary" onClick={() => setWaOpen(true)}>{waActive ? L('تخصيص', 'Customize') : L('إعداد', 'Set up')}</Button>}
    </div>
    {isManager && <Button block icon={Megaphone} onClick={() => setCampaign(true)}>{L('عرض جديد لكل العملاء', 'New offer to all clients')}</Button>}
    {campaign && <OfferShare offer={{ key: `offer-${localISO()}`, title: '', text: '' }} onClose={() => setCampaign(false)} />}
    <Segmented size="sm" items={tabs} value={tab} onChange={setTab} />

    {tab === 'reminders' && (reminders.length ? <div className="list">{reminders.map(a => {
      const c = clients[a.clientId]; if (!c) return null;
      const done = sent('reminder', c.id, a.id);
      return <Row key={a.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={`${a.date === today ? L('اليوم', 'Today') : L('غداً', 'Tomorrow')} ${timeLabel(a.time)} · ${serviceNames(a)}`}
        trailing={done ? <Badge tone="green"><Check size={12} /> {L('أُرسل', 'Sent')}</Badge> : <Button size="sm" icon={BellRing} onClick={() => send(c, 'reminder', { date: dateFor(c, a.date), time: timeFor(c, a.time) }, 'reminder', a.id)}>{L('ذكّر', 'Remind')}</Button>} />;
    })}</div> : <Empty icon={BellRing} title={L('لا تذكيرات مطلوبة', 'No reminders needed')} text={L('مواعيد اليوم والغد كلها مُذكّرة', "All of today's and tomorrow's appointments have been reminded")} />)}

    {tab === 'recovery' && <>
      {!link && <Alert tone="orange" icon={Sparkles}>{L('فعّل رابط الحجز من الإعدادات ليُضاف للرسالة تلقائياً', 'Enable the booking link in Settings to add it to messages automatically')}</Alert>}
      {due.length > 0 && <><small className="muted">{L('حان موعدهم المعتاد', 'Due for their usual visit')}</small><div className="list">{due.map(({ client: c, stats }) => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={L(`عادةً كل ${num(stats.avgInterval)} يوم · آخر زيارة ${dateLabel(stats.lastVisit, { day: 'numeric', month: 'short' })}`, `Usually every ${num(stats.avgInterval)} day${stats.avgInterval === 1 ? '' : 's'} · last visit ${dateLabel(stats.lastVisit, { day: 'numeric', month: 'short' })}`)}
        trailing={sent('recovery', c.id, '', 14) ? <Badge tone="green">{L('أُرسل', 'Sent')}</Badge> : <Button size="sm" variant="secondary" icon={Send} onClick={() => send(c, 'recovery', {}, 'recovery')}>{L('أرسل', 'Send')}</Button>} />)}</div></>}
      {lapsed.length > 0 ? <><small className="muted">{L('منقطعون — الأعلى إنفاقاً أولاً', 'Lapsed — highest spenders first')}</small><div className="list">{lapsed.map(({ client: c, stats, overdue }) => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={L(`غائب منذ ${num(stats.daysSince)} يوم (متأخر ${num(overdue)})`, `Away for ${num(stats.daysSince)} day${stats.daysSince === 1 ? '' : 's'} (${num(overdue)} overdue)`)}
        trailing={sent('recovery', c.id, '', 21) ? <Badge tone="green">{L('أُرسل', 'Sent')}</Badge> : <Button size="sm" icon={UserRoundCheck} onClick={() => send(c, 'recovery', {}, 'recovery')}>{L('استرجع', 'Win back')}</Button>} />)}</div></>
        : !due.length && <Empty icon={UserRoundCheck} title={L('لا عملاء منقطعون', 'No lapsed clients')} text={L('عملاؤك يعودون بانتظام 👏', 'Your clients come back regularly 👏')} />}
    </>}

    {tab === 'birthday' && (birthdays.length ? <div className="list">{birthdays.map(c => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={L('عيد ميلاده اليوم 🎂', 'Birthday today 🎂')}
      trailing={sent('birthday', c.id, '', 300) ? <Badge tone="green">{L('أُرسل', 'Sent')}</Badge> : <Button size="sm" icon={Cake} onClick={() => send(c, 'birthday', {}, 'birthday')}>{L('هنّئ', 'Congratulate')}</Button>} />)}</div>
      : <Empty icon={Cake} title={L('لا أعياد ميلاد اليوم', 'No birthdays today')} text={L('أضف تاريخ الميلاد في ملف العميل', "Add birth dates in the client's profile")} />)}

    {tab === 'waitlist' && (waiting.length ? <div className="list">{waiting.map(w => {
      const c = clients[w.clientId];
      return <Row key={w.id} leading={<Avatar name={c?.name} />} title={clientName(data.clients, w.clientId)} subtitle={`${w.date ? dateLabel(w.date) : L('أي يوم', 'Any day')}${w.serviceId ? ` · ${data.services.find(s => s.id === w.serviceId)?.name || ''}` : ''}`}
        trailing={<span className="row-end">
          {c && <Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => send(c, 'waitlistContact', { date: w.date ? (clientLang(c) === 'en' ? ` for ${dateFor(c, w.date)}` : ` ليوم ${dateFor(c, w.date)}`) : '' }, 'waitlist')}>{L('تواصل', 'Contact')}</Button>}
          <button type="button" className="icon-btn" aria-label={L('حذف', 'Delete')} onClick={() => { remove('waitlist', w.id); toast(L('أُزيل من القائمة', 'Removed from list')); }}><Trash2 size={16} /></button>
        </span>} />;
    })}</div> : <Empty icon={ListChecks} title={L('قائمة الانتظار فارغة', 'Waitlist is empty')} text={L('عند امتلاء يوم، أضف العميل للانتظار من شاشة الحجز — وعند أي إلغاء نقترحه عليك', "When a day is full, add the client to the waitlist from the booking screen — we'll suggest them whenever there's a cancellation")} />)}
    {waOpen && <WhatsAppSettings onClose={() => setWaOpen(false)} />}
  </div>;
}
