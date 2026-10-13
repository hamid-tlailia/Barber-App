import React, { useState } from 'react';
import { CalendarCheck2, CircleDollarSign, Download, Gauge, Receipt, Send, Sparkles, UserPlus, UserX } from 'lucide-react';
import { addDays, appointmentTotal, dateLabel, localISO, money, num, paymentText, serviceNames, toCSV } from '../data.js';
import { dailyReport, inRange, incomeIn, roi, utilization } from '../smart.js';
import { Bars, Button, Meter, Row, Section, Segmented, Stat, download, openExternal, useApp } from '../ui.jsx';
import { L } from '../i18n.js';

const ranges = () => [{ id: 'today', label: L('اليوم', 'Today') }, { id: 'week', label: L(`${num(7)} أيام`, `${num(7)} days`) }, { id: 'month', label: L('الشهر', 'Month') }, { id: 'lastMonth', label: L('السابق', 'Last month') }, { id: 'year', label: L('السنة', 'Year') }];

export default function Reports() {
  const { data, license } = useApp();
  const [range, setRange] = useState('month');
  const today = localISO();
  const income = incomeIn(data, range);
  const revenue = income.reduce((s, p) => s + Number(p.amount || 0), 0);
  const appts = data.appointments.filter(a => inRange(a.date, range) && a.date <= today);
  const done = appts.filter(a => a.status === 'completed');
  const noShows = appts.filter(a => a.status === 'no_show').length;
  const newClients = data.clients.filter(c => c.createdAt && inRange(c.createdAt, range)).length;
  const expenses = data.expenses.filter(e => inRange(e.date, range)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const productCost = data.sales.filter(s => s.kind === 'product' && inRange(s.at, range)).reduce((s, x) => s + Number(x.cost || 0), 0);
  const avgTicket = done.length ? done.reduce((s, a) => s + appointmentTotal(a), 0) / done.length : 0;
  const use = utilization(data.staff, data.appointments, data.settings, range);
  const value = roi(data, license?.until && license.status === 'trial' ? addDays(today, -7) : addDays(today, -30));

  const services = {};
  for (const a of done) for (const item of a.items || []) {
    services[item.name] ||= { count: 0, revenue: 0 };
    services[item.name].count++; services[item.name].revenue += Number(item.price || 0);
  }
  const topServices = Object.entries(services).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6);
  const byMethod = {};
  for (const p of income) byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount || 0);
  const days = range === 'today' ? [today] : Array.from({ length: range === 'week' ? 7 : 14 }, (_, i) => addDays(today, i - (range === 'week' ? 6 : 13)));
  const chart = days.map(d => ({ label: dateLabel(d, { day: 'numeric' }), value: incomeIn(data, 'all').filter(p => p.at === d).reduce((s, p) => s + Number(p.amount || 0), 0) }));

  const exportCSV = () => {
    const clients = Object.fromEntries(data.clients.map(c => [c.id, c.name]));
    download(`report-${range}-${today}.csv`, toCSV([[L('التاريخ', 'Date'), L('الوقت', 'Time'), L('العميل', 'Client'), L('الخدمات', 'Services'), L('الإجمالي', 'Total'), L('الحالة', 'Status')], ...appts.map(a => [a.date, a.time, clients[a.clientId], serviceNames(a), appointmentTotal(a), a.status])]));
  };

  return <div className="stack">
    <Segmented size="sm" items={ranges()} value={range} onChange={setRange} />
    <div className="stats">
      <Stat icon={CircleDollarSign} tone="green" label={L('الدخل', 'Income')} value={money(revenue)} />
      <Stat icon={CalendarCheck2} label={L('مواعيد مكتملة', 'Completed appointments')} value={num(done.length)} />
      <Stat icon={Receipt} tone="blue" label={L('متوسط الفاتورة', 'Average ticket')} value={money(avgTicket)} />
      <Stat icon={UserPlus} tone="purple" label={L('عملاء جدد', 'New clients')} value={num(newClients)} />
      <Stat icon={UserX} tone={noShows ? 'red' : 'green'} label={L('لم يحضروا', 'No-shows')} value={num(noShows)} />
      <Stat icon={Gauge} tone="orange" label={L('إشغال الفريق', 'Team utilization')} value={L(`${num(Math.round(use * 100))}٪`, `${num(Math.round(use * 100))}%`)} />
    </div>

    {value.total > 0 && <div className="roi-card">
      <Sparkles size={22} />
      <div><small>{L(`قيمة حققها التطبيق آخر ${num(license?.status === 'trial' ? 7 : 30)} يوماً`, `Value the app delivered in the last ${num(license?.status === 'trial' ? 7 : 30)} days`)}</small><strong>{money(value.total)}</strong></div>
      <div className="roi-lines">{value.lines.filter(l => l.count).map(l => <span key={l.key}>{l.label}: <b>{num(l.count)}</b></span>)}{value.reminders > 0 && <span>{L('تذكيرات أُرسلت:', 'Reminders sent:')} <b>{num(value.reminders)}</b></span>}</div>
    </div>}

    {range !== 'today' && <Section title={L('الدخل اليومي', 'Daily income')}><Bars data={chart} format={v => num(Math.round(v))} /></Section>}

    <Section title={L('الربح التقديري', 'Estimated profit')}>
      <div className="list">
        <Row title={L('الدخل', 'Income')} trailing={<strong className="green">{money(revenue)}</strong>} />
        <Row title={L('المصروفات', 'Expenses')} trailing={<strong className="red">−{money(expenses)}</strong>} />
        {productCost > 0 && <Row title={L('تكلفة المنتجات المباعة', 'Cost of products sold')} trailing={<strong className="red">−{money(productCost)}</strong>} />}
        <Row title={L('الصافي', 'Net')} trailing={<strong>{money(revenue - expenses - productCost)}</strong>} />
      </div>
    </Section>

    {topServices.length > 0 && <Section title={L('الخدمات الأكثر دخلاً', 'Top services by revenue')}><div className="list">{topServices.map(([name, s]) => <Row key={name} title={name} subtitle={<Meter value={s.revenue} max={topServices[0][1].revenue} />} trailing={<span className="row-end"><strong>{money(s.revenue)}</strong><small>{num(s.count)}×</small></span>} />)}</div></Section>}

    {Object.keys(byMethod).length > 0 && <Section title={L('طرق الدفع', 'Payment methods')}><div className="list">{Object.entries(byMethod).map(([m, v]) => <Row key={m} title={paymentText[m] || (m === 'undefined' ? L('أخرى', 'Other') : m)} trailing={<strong>{money(v)}</strong>} />)}</div></Section>}

    <div className="row-buttons">
      <Button variant="secondary" icon={Send} onClick={() => openExternal(`https://wa.me/?text=${encodeURIComponent(dailyReport(data))}`)}>{L('تقرير اليوم واتساب', "Today's report via WhatsApp")}</Button>
      <Button variant="ghost" icon={Download} onClick={exportCSV}>{L('تصدير CSV', 'Export CSV')}</Button>
    </div>
  </div>;
}
