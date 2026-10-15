import React, { useMemo, useState } from 'react';
import {
  Ban, CalendarCheck2, CircleDollarSign, Download, FileSpreadsheet, FileText, Gauge, HandCoins, Receipt, Send, ShoppingBag, Sparkles, UserCheck, UserPlus, UserX, Wallet,
} from 'lucide-react';
import { clientName as nameOfClient, addDays, amountPaid, appointmentTotal, dateLabel, daysBetween, localISO, money, num, paymentText, serviceNames, sortAppointments, statusText, timeLabel, toCSV } from '../data.js';
import { commissions, dailyReport, incomeIn, roi, utilization } from '../smart.js';
import { Bars, Button, Field, Meter, Row, Section, Segmented, Stat, download, openExternal, useApp } from '../ui.jsx';
import { exportDocx, exportXlsx } from '../lib/exporters.js';
import { L } from '../i18n.js';

const ranges = () => [
  { id: 'today', label: L('اليوم', 'Today') }, { id: 'week', label: L(`${num(7)} أيام`, `${num(7)} days`) }, { id: 'month', label: L('الشهر', 'Month') },
  { id: 'lastMonth', label: L('السابق', 'Last month') }, { id: 'year', label: L('السنة', 'Year') },
  { id: 'day', label: L('يوم محدد', 'Specific day') }, { id: 'custom', label: L('فترة مخصصة', 'Custom range') },
];

const METHODS = ['cash', 'card', 'transfer', 'gift', 'package'];
const saleText = () => ({ product: L('منتجات', 'Products'), package: L('باقات', 'Packages'), gift: L('بطاقات هدايا', 'Gift cards') });
const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const monthEnd = ym => localISO(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0, 12));
const round = v => Math.round(Number(v || 0) * 100) / 100;
const sum = (list, pick = x => x.amount) => list.reduce((s, x) => s + Number(pick(x) || 0), 0);

// يحوّل الاختيار (تبويب أو تاريخ/فترة) إلى بداية ونهاية بصيغة YYYY-MM-DD.
export function periodOf(range, today, day, from, to) {
  if (range === 'today') return { from: today, to: today };
  if (range === 'week') return { from: addDays(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: monthEnd(today.slice(0, 7)) };
  if (range === 'lastMonth') { const start = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7); return { from: `${start}-01`, to: monthEnd(start) }; }
  if (range === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
  if (range === 'day') { const d = isDay(day) ? day : today; return { from: d, to: d }; }
  const a = isDay(from) ? from : today; const b = isDay(to) ? to : today;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export function buildReport(data, from, to, today = localISO()) {
  const within = d => typeof d === 'string' && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const appts = data.appointments.filter(a => within(a.date)).sort(sortAppointments);
  const done = appts.filter(a => a.status === 'completed');
  const statuses = Object.fromEntries(Object.keys(statusText).map(s => [s, appts.filter(a => a.status === s).length]));
  const served = new Set(done.map(a => a.clientId).filter(id => id && id !== 'walk-in')).size;
  const walkIns = done.filter(a => !a.clientId || a.clientId === 'walk-in').length;
  const newClients = data.clients.filter(c => within(c.createdAt));
  const payments = data.appointments.flatMap(a => (a.payments || []).map(p => ({ ...p, appointment: a }))).filter(p => within(p.at));
  const tipsList = payments.filter(p => p.kind === 'tip');
  const income = incomeIn(data, 'all', today).filter(p => within(p.at));
  const revenue = sum(income);
  const byMethod = Object.fromEntries(METHODS.map(m => [m, 0]));
  for (const p of income) byMethod[p.method || 'other'] = (byMethod[p.method || 'other'] || 0) + Number(p.amount || 0);
  // الدفع ببطاقة هدية أو من باقة هو استخدام لرصيد مدفوع مسبقاً، لذا لا يُحسب ضمن الدخل مرة ثانية.
  const redeemed = { gift: sum(payments.filter(p => p.method === 'gift' && p.kind !== 'tip')), package: sum(payments.filter(p => p.method === 'package' && p.kind !== 'tip')) };
  byMethod.gift += redeemed.gift; byMethod.package += redeemed.package;
  const sales = (data.sales || []).filter(s => within(s.at)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const salesByKind = Object.fromEntries(['product', 'package', 'gift'].map(k => { const list = sales.filter(s => s.kind === k); return [k, { count: list.length, amount: sum(list) }]; }));
  const productCost = sum(sales.filter(s => s.kind === 'product'), s => s.cost);
  const expensesList = (data.expenses || []).filter(e => within(e.date)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const expenses = sum(expensesList);
  const expensesByCategory = {};
  for (const e of expensesList) { const k = e.category || L('أخرى', 'Other'); expensesByCategory[k] = (expensesByCategory[k] || 0) + Number(e.amount || 0); }
  const staff = commissions(data.staff, appts, 'all', today).filter(s => s.services || s.tips || s.revenue);
  const services = {};
  for (const a of done) for (const item of a.items || []) {
    services[item.name] ||= { count: 0, revenue: 0 };
    services[item.name].count++; services[item.name].revenue += Number(item.price || 0);
  }
  const topServices = Object.entries(services).sort((a, b) => b[1].revenue - a[1].revenue);
  const unpaid = done.reduce((s, a) => s + Math.max(0, appointmentTotal(a) - amountPaid(a)), 0);
  const avgTicket = done.length ? sum(done, appointmentTotal) / done.length : 0;
  const use = utilization(data.staff, appts, data.settings, 'all', to < today ? to : today);

  // الرسم: يومي حتى ٣١ يوماً، ثم شهري، ثم سنوي للفترات الطويلة جداً.
  const span = daysBetween(from, to) + 1;
  const end = to > today && from <= today ? today : to;
  const bucket = span <= 31 ? d => d : span <= 731 ? d => d.slice(0, 7) : d => d.slice(0, 4);
  const keys = [];
  if (span <= 31) for (let d = from; d <= end; d = addDays(d, 1)) keys.push(d);
  else for (let d = from; d <= end; d = addDays(d, 1)) { const k = bucket(d); if (keys.at(-1) !== k) keys.push(k); }
  const totals = {};
  for (const p of income) { const k = bucket(String(p.at).slice(0, 10)); totals[k] = (totals[k] || 0) + Number(p.amount || 0); }
  // تسميات واضحة: يوم/شهر عندما تمتد الفترة عبر أكثر من شهر، وشهر/سنة للفترات الطويلة.
  const multiMonth = new Set(keys.filter(k => k.length === 10).map(k => k.slice(0, 7))).size > 1;
  const multiYear = new Set(keys.map(k => k.slice(0, 4))).size > 1;
  const chart = keys.map(k => ({
    label: k.length === 10 ? (multiMonth ? dateLabel(k, { day: 'numeric', month: 'numeric' }) : dateLabel(k, { day: 'numeric' }))
      : k.length === 7 ? dateLabel(`${k}-01`, multiYear ? { month: 'numeric', year: '2-digit' } : { month: 'short' }) : k,
    value: totals[k] || 0,
  }));

  return { appts, done, statuses, served, walkIns, newClients, payments, tips: sum(tipsList), tipsList, income, revenue, byMethod, redeemed, sales, salesByKind, productCost, expensesList, expenses, expensesByCategory, staff, topServices, unpaid, avgTicket, use, chart, span, from, to };
}

// جداول التقرير الكاملة — نفس المحتوى لـ Excel و Word.
function reportTables(data, r, periodText) {
  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  const staffName = Object.fromEntries(data.staff.map(s => [s.id, s.name]));
  const methodName = m => paymentText[m] || m || L('أخرى', 'Other');
  const sk = saleText();
  return [
    { name: L('الملخص', 'Summary'), rows: [[L('البند', 'Item'), L('القيمة', 'Value')],
      [L('الفترة', 'Period'), periodText],
      [L('الدخل', 'Income'), round(r.revenue)],
      [L('البقشيش', 'Tips'), round(r.tips)],
      [L('المصروفات', 'Expenses'), round(r.expenses)],
      [L('تكلفة المنتجات المباعة', 'Cost of products sold'), round(r.productCost)],
      [L('الصافي', 'Net'), round(r.revenue - r.expenses - r.productCost)],
      [L('عملاء تمت خدمتهم', 'Clients served'), r.served],
      ...(r.walkIns ? [[L('زبائن بدون حجز', 'Walk-ins'), r.walkIns]] : []),
      [L('عملاء جدد', 'New clients'), r.newClients.length],
      [L('كل المواعيد', 'All appointments'), r.appts.length],
      ...Object.entries(r.statuses).map(([s, n]) => [statusText[s], n]),
      [L('متوسط الفاتورة', 'Average ticket'), round(r.avgTicket)],
      [L('مبالغ غير محصلة', 'Unpaid balance'), round(r.unpaid)],
      [L('إشغال الفريق ٪', 'Team utilization %'), Math.round(r.use * 100)]] },
    { name: L('طرق الدفع', 'Payment methods'), rows: [[L('الطريقة', 'Method'), L('المبلغ', 'Amount'), L('ملاحظة', 'Note')],
      ...Object.entries(r.byMethod).map(([m, v]) => [methodName(m), round(v), r.redeemed[m] ? L('يشمل استخدام رصيد مدفوع مسبقاً', 'Includes redeemed prepaid balance') : ''])] },
    { name: L('المبيعات', 'Sales'), rows: [[L('التاريخ', 'Date'), L('النوع', 'Type'), L('البند', 'Item'), L('العميل', 'Client'), L('طريقة الدفع', 'Method'), L('المبلغ', 'Amount'), L('التكلفة', 'Cost')],
      ...r.sales.map(s => [String(s.at).slice(0, 10), sk[s.kind] || s.kind, s.label || '', clients[s.clientId]?.name || '', methodName(s.method), round(s.amount), s.cost ? round(s.cost) : '']),
      ...Object.entries(r.salesByKind).map(([k, v]) => [L('الإجمالي', 'Total'), sk[k], `${v.count}×`, '', '', round(v.amount), ''])] },
    { name: L('الفريق', 'Team'), rows: [[L('الموظف', 'Staff member'), L('الخدمات', 'Services'), L('الإيراد', 'Revenue'), L('البقشيش', 'Tips'), L('العمولة', 'Commission')],
      ...r.staff.map(s => [s.member.name, s.services, round(s.revenue), round(s.tips), round(s.commission)])] },
    { name: L('الخدمات', 'Services'), rows: [[L('الخدمة', 'Service'), L('العدد', 'Count'), L('الإيراد', 'Revenue')], ...r.topServices.map(([name, s]) => [name, s.count, round(s.revenue)])] },
    { name: L('المصروفات', 'Expenses'), rows: [[L('التاريخ', 'Date'), L('الفئة', 'Category'), L('ملاحظة', 'Note'), L('طريقة الدفع', 'Method'), L('المبلغ', 'Amount')],
      ...r.expensesList.map(e => [e.date, e.category || '', e.note || '', methodName(e.method), round(e.amount)])] },
    { id: 'appointments', name: L('المواعيد', 'Appointments'), rows: [[L('التاريخ', 'Date'), L('الوقت', 'Time'), L('العميل', 'Client'), L('الهاتف', 'Phone'), L('الموظف', 'Staff'), L('الخدمات', 'Services'), L('الإجمالي', 'Total'), L('المدفوع', 'Paid'), L('الحالة', 'Status')],
      ...r.appts.map(a => [a.date, a.time || '', clients[a.clientId]?.name || '', clients[a.clientId]?.phone || '', staffName[a.staffId] || '', serviceNames(a), round(appointmentTotal(a)), round(amountPaid(a)), statusText[a.status] || a.status])] },
    { name: L('الدفعات', 'Payments'), rows: [[L('التاريخ', 'Date'), L('العميل', 'Client'), L('النوع', 'Kind'), L('طريقة الدفع', 'Method'), L('المبلغ', 'Amount')],
      ...r.payments.map(p => [String(p.at).slice(0, 10), clients[p.appointment.clientId]?.name || '', p.kind === 'tip' ? L('بقشيش', 'Tip') : p.kind === 'deposit' ? L('عربون', 'Deposit') : L('دفعة', 'Payment'), methodName(p.method), round(p.amount)])] },
  ];
}

// نطاق تواريخ الرسم مع السنة حتى لا تختلط الأشهر.
const chartRange = r => r.from && r.to ? `${dateLabel(r.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${dateLabel(r.to, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';

export default function Reports() {
  const { data, license } = useApp();
  const today = localISO();
  const [range, setRange] = useState('month');
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const period = periodOf(range, today, day, from, to);
  const r = useMemo(() => buildReport(data, period.from, period.to, today), [data, period.from, period.to, today]);
  const value = roi(data, license?.until && license.status === 'trial' ? addDays(today, -7) : addDays(today, -30));
  const sk = saleText();
  const clientName = Object.fromEntries(data.clients.map(c => [c.id, c.name]));

  const longDate = d => dateLabel(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = d => dateLabel(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const periodText = period.from === period.to ? longDate(period.from) : `${shortDate(period.from)} — ${shortDate(period.to)}`;
  const fileBase = `report-${period.from}${period.from === period.to ? '' : `_${period.to}`}`;

  const exportCSV = () => download(`${fileBase}.csv`, toCSV(reportTables(data, r, periodText).find(t => t.id === 'appointments').rows));
  const exportExcel = () => exportXlsx(`${fileBase}.xlsx`, reportTables(data, r, periodText));
  const exportWord = () => exportDocx(`${fileBase}.docx`, `${data.shopName || ''} — ${L('تقرير', 'Report')} ${periodText}`, reportTables(data, r, periodText).map(t => ({ heading: t.name, rows: t.rows })));

  const shownAppts = r.appts.slice(0, 60);

  return <div className="stack">
    <Segmented size="sm" items={ranges()} value={range} onChange={setRange} />
    {range === 'day' && <Field label={L('اختر اليوم', 'Pick a day')}><input type="date" value={day} onChange={e => setDay(e.target.value)} /></Field>}
    {range === 'custom' && <div className="grid-2">
      <Field label={L('من', 'From')}><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label={L('إلى', 'To')}><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
    </div>}
    <Section title={periodText}>
      <div className="stats">
        <Stat icon={CircleDollarSign} tone="green" label={L('الدخل', 'Income')} value={money(r.revenue)} />
        <Stat icon={UserCheck} label={L('عملاء تمت خدمتهم', 'Clients served')} value={num(r.served + r.walkIns)} />
        <Stat icon={CalendarCheck2} label={L('مواعيد مكتملة', 'Completed appointments')} value={num(r.done.length)} />
        <Stat icon={Receipt} tone="blue" label={L('متوسط الفاتورة', 'Average ticket')} value={money(r.avgTicket)} />
        <Stat icon={UserPlus} tone="purple" label={L('عملاء جدد', 'New clients')} value={num(r.newClients.length)} />
        <Stat icon={UserX} tone={r.statuses.no_show ? 'red' : 'green'} label={L('لم يحضروا', 'No-shows')} value={num(r.statuses.no_show)} />
        <Stat icon={Ban} tone={r.statuses.cancelled ? 'orange' : 'green'} label={L('ملغاة', 'Cancelled')} value={num(r.statuses.cancelled)} />
        <Stat icon={HandCoins} tone="green" label={L('البقشيش', 'Tips')} value={money(r.tips)} />
        <Stat icon={Wallet} tone="red" label={L('المصروفات', 'Expenses')} value={money(r.expenses)} />
        <Stat icon={Gauge} tone="orange" label={L('إشغال الفريق', 'Team utilization')} value={L(`${num(Math.round(r.use * 100))}٪`, `${num(Math.round(r.use * 100))}%`)} />
      </div>
    </Section>

    {value.total > 0 && !['day', 'custom'].includes(range) && <div className="roi-card">
      <Sparkles size={22} />
      <div><small>{L(`قيمة حققها التطبيق آخر ${num(license?.status === 'trial' ? 7 : 30)} يوماً`, `Value the app delivered in the last ${num(license?.status === 'trial' ? 7 : 30)} days`)}</small><strong>{money(value.total)}</strong></div>
      <div className="roi-lines">{value.lines.filter(l => l.count).map(l => <span key={l.key}>{l.label}: <b>{num(l.count)}</b></span>)}{value.reminders > 0 && <span>{L('تذكيرات أُرسلت:', 'Reminders sent:')} <b>{num(value.reminders)}</b></span>}</div>
    </div>}

    {r.chart.length > 1 && <Section title={`${r.span <= 31 ? L('الدخل اليومي', 'Daily income') : r.span <= 731 ? L('الدخل الشهري', 'Monthly income') : L('الدخل السنوي', 'Yearly income')} · ${chartRange(r)}`}><Bars data={r.chart} format={v => num(Math.round(v))} /></Section>}

    <Section title={L('الربح التقديري', 'Estimated profit')}>
      <div className="list">
        <Row title={L('الدخل', 'Income')} trailing={<strong className="green">{money(r.revenue)}</strong>} />
        <Row title={L('المصروفات', 'Expenses')} trailing={<strong className="red">−{money(r.expenses)}</strong>} />
        {r.productCost > 0 && <Row title={L('تكلفة المنتجات المباعة', 'Cost of products sold')} trailing={<strong className="red">−{money(r.productCost)}</strong>} />}
        <Row title={L('الصافي', 'Net')} trailing={<strong>{money(r.revenue - r.expenses - r.productCost)}</strong>} />
        {r.tips > 0 && <Row title={L('البقشيش (للفريق)', 'Tips (for the team)')} trailing={<strong>{money(r.tips)}</strong>} />}
        {r.unpaid > 0 && <Row title={L('مبالغ غير محصلة', 'Unpaid balance')} trailing={<strong className="red">{money(r.unpaid)}</strong>} />}
      </div>
    </Section>

    <Section title={L('المواعيد حسب الحالة', 'Appointments by status')}>
      <div className="list">
        {Object.entries(r.statuses).filter(([s, n]) => n || ['completed', 'cancelled', 'no_show'].includes(s)).map(([s, n]) => <Row key={s} title={statusText[s]} subtitle={r.appts.length ? <Meter value={n} max={r.appts.length} tone={s === 'completed' ? 'accent' : s === 'no_show' ? 'red' : 'orange'} /> : undefined} trailing={<strong>{num(n)}</strong>} />)}
        <Row title={L('الإجمالي', 'Total')} trailing={<strong>{num(r.appts.length)}</strong>} />
      </div>
    </Section>

    <Section title={L('طرق الدفع', 'Payment methods')}><div className="list">{Object.entries(r.byMethod).filter(([m, v]) => v || METHODS.includes(m)).map(([m, v]) => <Row key={m} title={paymentText[m] || L('أخرى', 'Other')} subtitle={r.redeemed[m] ? L('استخدام رصيد مدفوع مسبقاً — غير محسوب في الدخل', 'Redeemed prepaid balance — not counted as income') : undefined} trailing={<strong>{money(v)}</strong>} />)}</div></Section>

    {r.sales.length > 0 && <Section title={L('مبيعات المنتجات والباقات والهدايا', 'Product, package & gift sales')}><div className="list">{Object.entries(r.salesByKind).filter(([, v]) => v.count).map(([k, v]) => <Row key={k} leading={<ShoppingBag size={18} />} title={sk[k]} trailing={<span className="row-end"><strong>{money(v.amount)}</strong><small>{num(v.count)}×</small></span>} />)}</div></Section>}

    {r.staff.length > 0 && <Section title={L('أداء الفريق', 'Team performance')}><div className="list">{r.staff.map(s => <Row key={s.member.id} title={s.member.name} subtitle={L(`${num(s.services)} خدمة${s.tips ? ` · بقشيش ${money(s.tips)}` : ''} · عمولة ${money(s.commission)}`, `${num(s.services)} services${s.tips ? ` · tips ${money(s.tips)}` : ''} · commission ${money(s.commission)}`)} trailing={<strong>{money(s.revenue)}</strong>} />)}</div></Section>}

    {r.topServices.length > 0 && <Section title={L('الخدمات الأكثر دخلاً', 'Top services by revenue')}><div className="list">{r.topServices.slice(0, 8).map(([name, s]) => <Row key={name} title={name} subtitle={<Meter value={s.revenue} max={r.topServices[0][1].revenue} />} trailing={<span className="row-end"><strong>{money(s.revenue)}</strong><small>{num(s.count)}×</small></span>} />)}</div></Section>}

    {Object.keys(r.expensesByCategory).length > 0 && <Section title={L('المصروفات حسب الفئة', 'Expenses by category')}><div className="list">{Object.entries(r.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Row key={k} title={k} trailing={<strong className="red">{money(v)}</strong>} />)}</div></Section>}

    {r.appts.length > 0 && <Section title={L(`المواعيد (${num(r.appts.length)})`, `Appointments (${num(r.appts.length)})`)}><div className="list">
      {shownAppts.map(a => <Row key={a.id} title={nameOfClient(data.clients, a.clientId)} subtitle={`${period.from === period.to ? '' : `${shortDate(a.date)} · `}${timeLabel(a.time)} · ${serviceNames(a)}`} trailing={<span className="row-end"><strong>{money(appointmentTotal(a))}</strong><small>{statusText[a.status] || a.status}</small></span>} />)}
      {r.appts.length > shownAppts.length && <Row title={L(`و${num(r.appts.length - shownAppts.length)} موعداً آخر — كاملة في ملف التصدير`, `And ${num(r.appts.length - shownAppts.length)} more — all included in the export`)} />}
    </div></Section>}

    <div className="row-buttons">
      <Button variant="secondary" icon={Send} onClick={() => openExternal(`https://wa.me/?text=${encodeURIComponent(dailyReport(data, period.from === period.to ? period.from : today))}`)}>{period.from === period.to && period.from !== today ? L('تقرير اليوم المحدد واتساب', 'Selected day report via Whats') : L('تقرير اليوم واتساب', "Today's report via Whats")}</Button>
      <Button variant="ghost" icon={FileSpreadsheet} onClick={exportExcel}>{L('تصدير Excel', 'Export Excel')}</Button>
      <Button variant="ghost" icon={FileText} onClick={exportWord}>{L('تصدير Word', 'Export Word')}</Button>
      <Button variant="ghost" icon={Download} onClick={exportCSV}>{L('تصدير CSV', 'Export CSV')}</Button>
    </div>
  </div>;
}
