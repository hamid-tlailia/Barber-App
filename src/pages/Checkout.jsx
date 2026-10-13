import React, { useEffect, useState } from 'react';
import {
  Banknote, Check, CreditCard, Gift, HandCoins, Landmark, Lock, MessageCircle, Package, Pencil, Printer, Receipt, ShoppingBag,
  TicketPercent, Trash2, Vault, WalletCards,
} from 'lucide-react';
import {
  amountPaid, appointmentTotal, balanceDue, dateLabel, depositPaid, isPaid, localISO, money, needsDeposit, num,
  paymentText, serviceNames, timeLabel, uid, whatsappLink,
} from '../data.js';
import { expectedCash, incomeIn } from '../smart.js';
import { Alert, Avatar, Badge, Button, Chips, Confirm, Empty, Field, Row, Section, Segmented, Sheet, Stat, Tile, openExternal, useApp, NumInput } from '../ui.jsx';
import { L } from '../i18n.js';

const methods = [
  { id: 'cash', label: L('نقداً', 'Cash'), icon: Banknote },
  { id: 'card', label: L('بطاقة', 'Card'), icon: CreditCard },
  { id: 'transfer', label: L('تحويل', 'Transfer'), icon: Landmark },
  { id: 'gift', label: L('هدية', 'Gift card'), icon: Gift },
];

export default function Checkout() {
  const { data, intent, setIntent, isManager } = useApp();
  const [tab, setTab] = useState('due');
  const [open, setOpen] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    if (intent?.open) setOpen(intent.open);
    if (intent?.tab === 'drawer') setTab('drawer');
    if (intent) setIntent(null);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  const today = localISO();
  const due = data.appointments.filter(a => (a.status === 'completed' && !isPaid(a)) || (a.date === today && ['arrived', 'confirmed'].includes(a.status)) || needsDeposit(a))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const paidToday = data.appointments.filter(a => (a.payments || []).some(p => p.at === today));
  const income = incomeIn(data, 'today').reduce((s, p) => s + Number(p.amount || 0), 0);
  const current = open && data.appointments.find(a => a.id === open);

  return <div className="stack">
    <div className="stats">
      <Stat icon={HandCoins} tone="green" label={L('محصّل اليوم', 'Collected today')} value={money(income)} />
      <Stat icon={WalletCards} tone="red" label={L('للتحصيل', 'To collect')} value={num(due.length)} />
    </div>
    <div className="tiles tiles-4">
      <Tile icon={Package} label={L('بيع باقة', 'Sell package')} tone="purple" onClick={() => setSheet('package')} />
      <Tile icon={Gift} label={L('بطاقة هدية', 'Gift card')} tone="blue" onClick={() => setSheet('gift')} />
      <Tile icon={ShoppingBag} label={L('بيع منتج', 'Sell product')} tone="green" onClick={() => setSheet('product')} />
      <Tile icon={Receipt} label={L('مصروف', 'Expense')} tone="red" onClick={() => setSheet('expense')} />
    </div>
    <Segmented items={[{ id: 'due', label: L('للتحصيل', 'To collect') }, { id: 'paid', label: L('مدفوعة اليوم', 'Paid today') }, { id: 'drawer', label: L('الصندوق', 'Cash drawer') }]} value={tab} onChange={setTab} />

    {tab === 'due' && (due.length ? <div className="list">{due.map(a => <Row key={a.id}
      leading={<Avatar name={clients[a.clientId]?.name} />}
      title={clients[a.clientId]?.name || L('عميل', 'Client')}
      subtitle={`${a.date === today ? timeLabel(a.time) : dateLabel(a.date, { day: 'numeric', month: 'short' })} · ${serviceNames(a)}`}
      trailing={<span className="row-end"><strong>{money(needsDeposit(a) && a.status !== 'completed' ? a.deposit - depositPaid(a) : balanceDue(a))}</strong>{needsDeposit(a) && a.status !== 'completed' ? <Badge tone="orange">{L('عربون', 'Deposit')}</Badge> : <Badge status={a.status} />}</span>}
      onClick={() => setOpen(a.id)} />)}</div> : <Empty icon={Check} title={L('لا شيء للتحصيل', 'Nothing to collect')} text={L('كل المواعيد المكتملة مدفوعة 👌', 'All completed appointments are paid 👌')} />)}

    {tab === 'paid' && (paidToday.length ? <div className="list">{paidToday.map(a => <Row key={a.id}
      leading={<Avatar name={clients[a.clientId]?.name} />} title={clients[a.clientId]?.name}
      subtitle={(a.payments || []).filter(p => p.at === today).map(p => paymentText[p.method]).join(' + ')}
      trailing={<strong className="green">{money(amountPaid(a))}</strong>} onClick={() => setInvoice(a.id)} />)}</div>
      : <Empty icon={Receipt} title={L('لا دفعات اليوم بعد', 'No payments yet today')} />)}

    {tab === 'drawer' && <Drawer />}

    {current && <CheckoutSheet appointment={current} onClose={() => setOpen(null)} onPaid={() => { setOpen(null); setInvoice(current.id); }} />}
    {invoice && <InvoiceSheet appointment={data.appointments.find(a => a.id === invoice)} onClose={() => setInvoice(null)} canUndo={isManager} />}
    {sheet === 'package' && <SellPackage onClose={() => setSheet(null)} />}
    {sheet === 'gift' && <SellGift onClose={() => setSheet(null)} />}
    {sheet === 'product' && <SellProduct onClose={() => setSheet(null)} />}
    {sheet === 'expense' && <AddExpense onClose={() => setSheet(null)} />}
  </div>;
}

export function CheckoutSheet({ appointment: a, onClose, onPaid }) {
  const { data, setData, toast, vocab } = useApp();
  const client = data.clients.find(c => c.id === a.clientId);
  const depositMode = needsDeposit(a) && a.status !== 'completed';
  const pkg = client && data.clientPackages.find(p => p.clientId === client.id && p.used < p.total && (a.items || []).some(i => i.serviceId === p.serviceId) && (!p.expiresAt || p.expiresAt >= localISO()));
  const [usePackage, setUsePackage] = useState(Boolean(pkg) && !depositMode);
  const [discount, setDiscount] = useState(Number(a.discount || 0));
  const [method, setMethod] = useState('cash');
  const [giftCode, setGiftCode] = useState('');
  const [tip, setTip] = useState(0);
  const [error, setError] = useState('');
  const packageItem = usePackage && pkg ? (a.items || []).find(i => i.serviceId === pkg.serviceId) : null;
  const gross = (a.items || []).reduce((s, i) => s + Number(i.price || 0), 0);
  const total = Math.max(0, gross - discount);
  const already = amountPaid(a);
  const packageValue = packageItem ? Number(packageItem.price) : 0;
  const due = depositMode ? Math.max(0, a.deposit - depositPaid(a)) : Math.max(0, total - already - packageValue);
  const [amount, setAmount] = useState(due);
  useEffect(() => setAmount(due), [due]);
  const gift = method === 'gift' ? data.giftCards.find(g => g.code.toUpperCase() === giftCode.trim().toUpperCase()) : null;

  const pay = () => {
    const value = Number(amount);
    if (!(value >= 0) || value > due + 0.001) { setError(L('المبلغ أكبر من المستحق', 'Amount exceeds the amount due')); return; }
    if (method === 'gift') {
      if (!gift) { setError(L('رمز بطاقة الهدية غير صحيح', 'Invalid gift card code')); return; }
      if (gift.expiresAt && gift.expiresAt < localISO()) { setError(L('بطاقة الهدية منتهية', 'Gift card has expired')); return; }
      if (gift.balance < value) { setError(L(`رصيد البطاقة ${money(gift.balance)} فقط`, `Card balance is only ${money(gift.balance)}`)); return; }
    }
    const today = localISO();
    const payments = [...(a.payments || [])];
    if (packageItem && !(a.payments || []).some(p => p.method === 'package')) payments.push({ id: uid(), amount: packageValue, method: 'package', at: today, kind: 'payment', packageId: pkg.id });
    if (value > 0) payments.push({ id: uid(), amount: value, method, at: today, kind: depositMode ? 'deposit' : 'payment', ...(gift ? { giftId: gift.id } : {}) });
    if (Number(tip) > 0) payments.push({ id: uid(), amount: Number(tip), method, at: today, kind: 'tip', staffId: a.staffId });
    setData(prev => ({
      ...prev,
      appointments: prev.appointments.map(x => x.id === a.id ? { ...x, payments, discount: depositMode ? x.discount : discount } : x),
      clientPackages: packageItem ? prev.clientPackages.map(p => p.id === pkg.id ? { ...p, used: p.used + 1 } : p) : prev.clientPackages,
      giftCards: gift ? prev.giftCards.map(g => g.id === gift.id ? { ...g, balance: g.balance - value } : g) : prev.giftCards,
    }));
    toast(depositMode ? L('تم استلام العربون', 'Deposit received') : value + packageValue >= due ? L('تم الدفع بالكامل ✓', 'Paid in full ✓') : L(`تم استلام ${money(value)} — المتبقي ${money(due - value)}`, `Received ${money(value)} — ${money(due - value)} remaining`));
    (onPaid || onClose)();
  };

  return <Sheet title={depositMode ? L('استلام العربون', 'Collect deposit') : L('الدفع', 'Payment')} subtitle={client?.name || vocab.client} onClose={onClose}
    footer={<Button size="lg" block icon={Check} onClick={pay}>{Number(amount) > 0 ? L(`استلام ${money(amount)}`, `Collect ${money(amount)}`) : L('تأكيد', 'Confirm')}</Button>}>
    <div className="stack">
      <div className="list">
        {(a.items || []).map((item, i) => <Row key={i} title={item.name} trailing={<strong className={packageItem === item ? 'strike' : ''}>{money(item.price)}</strong>} />)}
        {already > 0 && <Row title={L('مدفوع سابقاً', 'Previously paid')} trailing={<strong className="green">−{money(already)}</strong>} />}
      </div>
      {pkg && !depositMode && <label className="toggle-row"><span><strong>{L(`استخدام جلسة من «${pkg.name}»`, `Use a session from “${pkg.name}”`)}</strong><small>{L(`متبقٍ ${pkg.total - pkg.used} من ${pkg.total}`, `${pkg.total - pkg.used} of ${pkg.total} left`)}</small></span><input type="checkbox" className="toggle" checked={usePackage} onChange={e => setUsePackage(e.target.checked)} /></label>}
      {!depositMode && <Field label={L('خصم', 'Discount')}><div className="quick-amounts">
        {[0, 10, 20].map(p => <button type="button" key={p} className={`chip ${discount === Math.round(gross * p / 100) ? 'active' : ''}`} onClick={() => setDiscount(Math.round(gross * p / 100))}>{p ? L(`${p}٪`, `${p}%`) : L('بدون', 'None')}</button>)}
        <div className="money-input"><NumInput min="0" value={discount} onChange={e => setDiscount(Math.min(gross, Number(e.target.value)))} /><span>{L('ر.ق', 'QAR')}</span></div>
      </div></Field>}
      <div className="due-box"><span>{depositMode ? L('العربون المطلوب', 'Deposit required') : L('المستحق', 'Amount due')}</span><strong>{money(due)}</strong></div>
      <div className="method-grid">{methods.map(m => <button type="button" key={m.id} className={`method ${method === m.id ? 'active' : ''}`} onClick={() => setMethod(m.id)}><m.icon size={24} /><span>{m.label}</span></button>)}</div>
      {method === 'gift' && <Field label={L('رمز بطاقة الهدية', 'Gift card code')} hint={gift ? L(`الرصيد: ${money(gift.balance)}`, `Balance: ${money(gift.balance)}`) : ''}><input dir="ltr" className="code-input" value={giftCode} onChange={e => setGiftCode(e.target.value.toUpperCase())} placeholder="GIFT-XXXX" /></Field>}
      <Field label={L('المبلغ المستلم', 'Amount received')} hint={L('يمكنك استلام جزء والباقي لاحقاً', 'You can collect part now and the rest later')}><div className="money-input"><NumInput min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /><span>{L('ر.ق', 'QAR')}</span></div></Field>
      {!depositMode && <Field label={L('إكرامية للموظف (اختياري)', 'Tip for staff (optional)')}><div className="money-input"><NumInput min="0" value={tip} onChange={e => setTip(e.target.value)} /><span>{L('ر.ق', 'QAR')}</span></div></Field>}
      <Alert>{error}</Alert>
    </div>
  </Sheet>;
}

export function InvoiceSheet({ appointment: a, onClose, canUndo }) {
  const { data, setData, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  if (!a) return null;
  const client = data.clients.find(c => c.id === a.clientId);
  const number = `INV-${a.date.replaceAll('-', '')}-${a.id.slice(-4).toUpperCase()}`;
  const text = [`🧾 ${data.shopName}`, L(`فاتورة ${number}`, `Invoice ${number}`), `${dateLabel(a.date)} · ${timeLabel(a.time)}`, '', ...(a.items || []).map(i => `• ${i.name}: ${money(i.price)}`),
    Number(a.discount) ? L(`خصم: −${money(a.discount)}`, `Discount: −${money(a.discount)}`) : '', L(`الإجمالي: ${money(appointmentTotal(a))}`, `Total: ${money(appointmentTotal(a))}`), L(`المدفوع: ${money(amountPaid(a))}`, `Paid: ${money(amountPaid(a))}`), '', L('شكراً لزيارتك 🙏', 'Thank you for your visit 🙏')].filter(line => line !== '').join('\n');
  return <Sheet title={L('الفاتورة', 'Invoice')} onClose={onClose} footer={<>
    {canUndo && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>{L('إلغاء الدفع', 'Void payment')}</Button>}
    <div className="spacer" />
    <Button variant="secondary" icon={Printer} onClick={() => window.print()}>{L('طباعة', 'Print')}</Button>
    {client && <Button icon={MessageCircle} onClick={() => openExternal(whatsappLink(client.phone, text))}>{L('إرسال واتساب', 'Send via WhatsApp')}</Button>}
  </>}>
    <article className="invoice">
      <header><strong>{data.shopName}</strong><small dir="ltr">{number}</small></header>
      <div className="invoice-meta"><span>{client?.name}</span><span>{dateLabel(a.date)} · {timeLabel(a.time)}</span></div>
      {(a.items || []).map((item, i) => <div className="invoice-line" key={i}><span>{item.name}</span><strong>{money(item.price)}</strong></div>)}
      {Number(a.discount) > 0 && <div className="invoice-line"><span>{L('خصم', 'Discount')}</span><strong>−{money(a.discount)}</strong></div>}
      <div className="invoice-line total"><span>{L('الإجمالي', 'Total')}</span><strong>{money(appointmentTotal(a))}</strong></div>
      {(a.payments || []).map(p => <div className="invoice-line muted" key={p.id}><span>{p.kind === 'tip' ? L('إكرامية', 'Tip') : p.kind === 'deposit' ? L('عربون', 'Deposit') : L('دفعة', 'Payment')} · {paymentText[p.method]}</span><span>{money(p.amount)}</span></div>)}
      <footer>{L('شكراً لزيارتك — نتطلع لرؤيتك مجدداً', 'Thank you for your visit — we look forward to seeing you again')}</footer>
    </article>
    {confirm && <Confirm title={L('إلغاء تسجيل الدفع؟', 'Void this payment?')} text={L('سيُسجَّل هذا الإجراء في سجل التعديلات باسمك.', 'This action will be recorded in the audit log under your name.')} danger confirmLabel={L('إلغاء الدفع', 'Void payment')} onClose={() => setConfirm(false)} onConfirm={() => {
      setData(prev => ({
        ...prev,
        appointments: prev.appointments.map(x => x.id === a.id ? { ...x, payments: [] } : x),
        clientPackages: prev.clientPackages.map(p => (a.payments || []).some(x => x.packageId === p.id) ? { ...p, used: Math.max(0, p.used - 1) } : p),
        giftCards: prev.giftCards.map(g => { const back = (a.payments || []).filter(x => x.giftId === g.id).reduce((s, x) => s + x.amount, 0); return back ? { ...g, balance: g.balance + back } : g; }),
      }));
      toast(L('تم إلغاء الدفع', 'Payment voided')); onClose();
    }} />}
  </Sheet>;
}

// الصندوق: رصيد الافتتاح = ما تُرك في الدرج عند آخر إغلاق، والمتبقي للغد = المعدود تلقائياً.
// المالك والمدير فقط يستطيعان تعديل الأرقام التلقائية.
function Drawer() {
  const { data, upsert, toast, shop, staffMember, isManager } = useApp();
  const today = localISO();
  const closedToday = data.drawers.find(d => d.date === today);
  const last = [...data.drawers].filter(d => d.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const autoOpening = Number(last?.keep ?? last?.counted ?? 0);
  const [opening, setOpening] = useState(null);
  const [counted, setCounted] = useState('');
  const [keep, setKeep] = useState(null);
  const [editing, setEditing] = useState(false);
  const openingValue = opening ?? autoOpening;
  const { cashIn, cashOut, expected } = expectedCash(today, data.appointments, data.expenses, openingValue, data.sales);
  const diff = counted === '' ? 0 : Number(counted) - expected;
  const keepValue = keep ?? (counted === '' ? expected : Number(counted));
  const history = [...data.drawers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return <div className="stack">
    {closedToday ? <Alert tone="green" icon={Lock}>{L(`تم إغلاق صندوق اليوم — الفرق ${money(closedToday.difference)} · بقي في الدرج ${money(closedToday.keep)}`, `Today's drawer is closed — difference ${money(closedToday.difference)} · left in drawer ${money(closedToday.keep)}`)}</Alert> : <>
      <div className="list">
        <Row title={L('رصيد الافتتاح', 'Opening balance')} subtitle={opening === null ? (last ? L(`ما بقي في الدرج عند إغلاق ${dateLabel(last.date)}`, `Left in drawer at close on ${dateLabel(last.date)}`) : L('أول إغلاق للصندوق', 'First drawer close')) : L('معدّل يدوياً', 'Manually adjusted')}
          trailing={editing ? <div className="money-input small"><NumInput value={openingValue} onChange={e => setOpening(Number(e.target.value))} /><span>{L('ر.ق', 'QAR')}</span></div> : <strong>{money(openingValue)}</strong>} />
        <Row title={L('مقبوضات نقدية', 'Cash received')} trailing={<strong className="green">+{money(cashIn)}</strong>} />
        <Row title={L('مصروفات نقدية', 'Cash expenses')} trailing={<strong className="red">−{money(cashOut)}</strong>} />
        <Row title={L('المتوقع في الدرج', 'Expected in drawer')} trailing={<strong>{money(expected)}</strong>} />
      </div>
      <Field label={L('المبلغ الفعلي بعد العد', 'Actual amount counted')}><div className="money-input"><NumInput value={counted} onChange={e => setCounted(e.target.value)} placeholder="0" /><span>{L('ر.ق', 'QAR')}</span></div></Field>
      {counted !== '' && <Alert tone={Math.abs(diff) < 1 ? 'green' : 'red'} icon={Vault}>{Math.abs(diff) < 1 ? L('الصندوق مطابق ✓', 'Drawer balanced ✓') : diff > 0 ? L(`زيادة ${money(diff)}`, `Over by ${money(diff)}`) : L(`عجز ${money(-diff)}`, `Short by ${money(-diff)}`)}</Alert>}
      <Row title={L('يبقى في الدرج للغد', 'Keep in drawer for tomorrow')} subtitle={keep === null ? L('تلقائياً = المبلغ المعدود', 'Automatic = counted amount') : L('معدّل يدوياً (الباقي سُحب من الدرج)', 'Manually adjusted (the rest was withdrawn)')}
        trailing={editing ? <div className="money-input small"><NumInput value={keepValue} onChange={e => setKeep(Number(e.target.value))} /><span>{L('ر.ق', 'QAR')}</span></div> : <strong>{money(keepValue)}</strong>} />
      {isManager && !editing && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(true)}>{L('تعديل الأرقام التلقائية', 'Edit automatic figures')}</Button>}
      <Button size="lg" block icon={Lock} disabled={counted === ''} onClick={() => {
        upsert('drawers', { id: uid(), date: today, opening: openingValue, cashIn, cashOut, expected, counted: Number(counted), difference: diff, keep: keepValue, closedBy: staffMember?.name || shop.role, closedAt: new Date().toISOString() });
        toast(L('تم إغلاق الصندوق', 'Drawer closed'));
      }}>{L('إغلاق صندوق اليوم', "Close today's drawer")}</Button>
    </>}
    {history.length > 0 && <Section title={L('آخر الإغلاقات', 'Recent closings')}><div className="list">{history.map(d => <Row key={d.id} title={dateLabel(d.date)} subtitle={L(`متوقع ${money(d.expected)} · فعلي ${money(d.counted)} · بقي ${money(d.keep)}`, `Expected ${money(d.expected)} · Actual ${money(d.counted)} · Kept ${money(d.keep)}`)} trailing={<strong className={Math.abs(d.difference) < 1 ? 'green' : 'red'}>{Math.abs(d.difference) < 1 ? L('مطابق', 'Balanced') : money(d.difference)}</strong>} />)}</div></Section>}
  </div>;
}

function PayMethod({ value, onChange }) {
  return <Chips items={methods.filter(m => m.id !== 'gift').map(m => ({ id: m.id, label: m.label }))} value={value} onChange={onChange} />;
}

function ClientSelect({ value, onChange }) {
  const { data } = useApp();
  return <select value={value} onChange={e => onChange(e.target.value)}><option value="">{L('اختر...', 'Choose...')}</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
}

function SellPackage({ onClose }) {
  const { data, setData, toast, vocab } = useApp();
  const [clientId, setClientId] = useState('');
  const [packageId, setPackageId] = useState(data.packages[0]?.id || '');
  const [method, setMethod] = useState('cash');
  const pkg = data.packages.find(p => p.id === packageId);
  if (!data.packages.length) return <Sheet title={L('بيع باقة', 'Sell package')} onClose={onClose}><Empty icon={Package} title={L('لا توجد باقات', 'No packages')} text={L('أنشئ باقات من الإعدادات ← الباقات', 'Create packages in Settings → Packages')} /></Sheet>;
  return <Sheet title={L('بيع باقة', 'Sell package')} onClose={onClose} footer={<Button block size="lg" icon={Check} disabled={!clientId || !pkg} onClick={() => {
    const today = localISO();
    const id = uid();
    setData(prev => ({
      ...prev,
      clientPackages: [...prev.clientPackages, { id, clientId, packageId: pkg.id, name: pkg.name, serviceId: pkg.serviceId, total: pkg.sessions, used: 0, purchasedAt: today, expiresAt: pkg.validityDays ? new Date(Date.now() + pkg.validityDays * 86400000).toISOString().slice(0, 10) : '' }],
      sales: [...prev.sales, { id: uid(), kind: 'package', refId: id, label: pkg.name, clientId, amount: pkg.price, method, at: today }],
    }));
    toast(L('تم بيع الباقة', 'Package sold')); onClose();
  }}>{pkg ? L(`بيع بـ ${money(pkg.price)}`, `Sell for ${money(pkg.price)}`) : L('بيع', 'Sell')}</Button>}>
    <div className="stack">
      <Field label={vocab.client}><ClientSelect value={clientId} onChange={setClientId} /></Field>
      <div className="list">{data.packages.map(p => <Row key={p.id} title={p.name} subtitle={L(`${num(p.sessions)} جلسات · صالحة ${num(p.validityDays)} يوم`, `${num(p.sessions)} session${Number(p.sessions) === 1 ? '' : 's'} · valid ${num(p.validityDays)} day${Number(p.validityDays) === 1 ? '' : 's'}`)} trailing={<span className="row-end"><strong>{money(p.price)}</strong>{packageId === p.id && <Check className="green" size={18} />}</span>} onClick={() => setPackageId(p.id)} />)}</div>
      <Field label={L('طريقة الدفع', 'Payment method')}><PayMethod value={method} onChange={setMethod} /></Field>
    </div>
  </Sheet>;
}

function SellGift({ onClose }) {
  const { setData, toast } = useApp();
  const [amount, setAmount] = useState(200);
  const [buyer, setBuyer] = useState('');
  const [recipient, setRecipient] = useState('');
  const [method, setMethod] = useState('cash');
  const [done, setDone] = useState(null);
  if (done) return <Sheet title={L('بطاقة الهدية جاهزة', 'Gift card ready')} onClose={onClose}><div className="gift-card"><Gift size={28} /><strong dir="ltr">{done.code}</strong><span>{money(done.amount)}</span>{done.recipientName && <small>{L('إلى:', 'To:')} {done.recipientName}</small>}</div><p className="muted center">{L('أعطِ الرمز للعميل — يُستخدم عند الدفع باختيار «هدية»', 'Give this code to the client — it is redeemed at checkout by choosing “Gift card”')}</p></Sheet>;
  return <Sheet title={L('بطاقة هدية جديدة', 'New gift card')} onClose={onClose} footer={<Button block size="lg" icon={TicketPercent} disabled={!(amount > 0)} onClick={() => {
    const code = `GIFT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const card = { id: uid(), code, amount: Number(amount), balance: Number(amount), buyerName: buyer, recipientName: recipient, createdAt: localISO(), expiresAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) };
    setData(prev => ({ ...prev, giftCards: [...prev.giftCards, card], sales: [...prev.sales, { id: uid(), kind: 'gift', refId: card.id, label: `${L('بطاقة هدية', 'Gift card')} ${code}`, amount: card.amount, method, at: localISO() }] }));
    toast(L('تم إصدار البطاقة', 'Gift card issued')); setDone(card);
  }}>{L('إصدار', 'Issue')} {money(amount)}</Button>}>
    <div className="stack">
      <div className="chips">{[100, 200, 300, 500].map(v => <button type="button" key={v} className={`chip ${Number(amount) === v ? 'active' : ''}`} onClick={() => setAmount(v)}>{money(v)}</button>)}</div>
      <Field label={L('مبلغ آخر', 'Custom amount')}><div className="money-input"><NumInput min="1" value={amount} onChange={e => setAmount(e.target.value)} /><span>{L('ر.ق', 'QAR')}</span></div></Field>
      <Field label={L('اسم المشتري', 'Buyer name')}><input value={buyer} onChange={e => setBuyer(e.target.value)} /></Field>
      <Field label={L('اسم المُهدى إليه', 'Recipient name')}><input value={recipient} onChange={e => setRecipient(e.target.value)} /></Field>
      <Field label={L('طريقة الدفع', 'Payment method')}><PayMethod value={method} onChange={setMethod} /></Field>
    </div>
  </Sheet>;
}

function SellProduct({ onClose }) {
  const { data, setData, toast } = useApp();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState('cash');
  const product = data.products.find(p => p.id === productId);
  const sellable = data.products.filter(p => Number(p.price) > 0);
  return <Sheet title={L('بيع منتج', 'Sell product')} onClose={onClose} footer={<Button block size="lg" icon={Check} disabled={!product || quantity < 1 || quantity > product.quantity} onClick={() => {
    const today = localISO();
    setData(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === product.id ? { ...p, quantity: p.quantity - quantity, updatedAt: today } : p),
      stockMovements: [...prev.stockMovements, { id: uid(), productId: product.id, direction: 'out', quantity: Number(quantity), note: 'بيع', date: today }],
      sales: [...prev.sales, { id: uid(), kind: 'product', refId: product.id, label: `${product.name} ×${quantity}`, amount: product.price * quantity, cost: product.cost * quantity, method, at: today }],
    }));
    toast(L('تم البيع', 'Sale recorded')); onClose();
  }}>{product ? L(`بيع بـ ${money(product.price * quantity)}`, `Sell for ${money(product.price * quantity)}`) : L('اختر منتجاً', 'Choose a product')}</Button>}>
    <div className="stack">
      {sellable.length ? <div className="list">{sellable.map(p => <Row key={p.id} title={p.name} subtitle={L(`المتوفر ${num(p.quantity)} ${p.unit}`, `In stock: ${num(p.quantity)} ${p.unit}`)} trailing={<span className="row-end"><strong>{money(p.price)}</strong>{productId === p.id && <Check className="green" size={18} />}</span>} onClick={() => setProductId(p.id)} />)}</div>
        : <Empty icon={ShoppingBag} title={L('لا منتجات للبيع', 'No products for sale')} text={L('أضف سعر بيع للمنتجات من المخزون', 'Add a sale price to products in Inventory')} />}
      <Field label={L('الكمية', 'Quantity')}><NumInput min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></Field>
      <Field label={L('طريقة الدفع', 'Payment method')}><PayMethod value={method} onChange={setMethod} /></Field>
    </div>
  </Sheet>;
}

const expenseCategories = ['إيجار', 'رواتب', 'مشتريات', 'فواتير', 'صيانة', 'تسويق', 'أخرى'];
const expenseCategoryEn = { 'إيجار': 'Rent', 'رواتب': 'Salaries', 'مشتريات': 'Purchases', 'فواتير': 'Bills', 'صيانة': 'Maintenance', 'تسويق': 'Marketing', 'أخرى': 'Other' };
function AddExpense({ onClose }) {
  const { upsert, toast } = useApp();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('مشتريات');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('cash');
  return <Sheet title={L('تسجيل مصروف', 'Record expense')} onClose={onClose} footer={<Button block size="lg" icon={Check} disabled={!(Number(amount) > 0)} onClick={() => {
    upsert('expenses', { id: uid(), amount: Number(amount), category, note, method, date: localISO() });
    toast(L('تم تسجيل المصروف', 'Expense recorded')); onClose();
  }}>{L('حفظ', 'Save')}</Button>}>
    <div className="stack">
      <Field label={L('المبلغ', 'Amount')}><div className="money-input"><NumInput autoFocus min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /><span>{L('ر.ق', 'QAR')}</span></div></Field>
      <Field label={L('البند', 'Category')}><Chips items={expenseCategories.map(c => ({ id: c, label: L(c, expenseCategoryEn[c]) }))} value={category} onChange={setCategory} /></Field>
      <Field label={L('ملاحظة', 'Note')}><input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Field label={L('الدفع من', 'Paid from')}><PayMethod value={method} onChange={setMethod} /></Field>
    </div>
  </Sheet>;
}
