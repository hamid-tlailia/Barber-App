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

const methods = [
  { id: 'cash', label: 'نقداً', icon: Banknote },
  { id: 'card', label: 'بطاقة', icon: CreditCard },
  { id: 'transfer', label: 'تحويل', icon: Landmark },
  { id: 'gift', label: 'هدية', icon: Gift },
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
      <Stat icon={HandCoins} tone="green" label="محصّل اليوم" value={money(income)} />
      <Stat icon={WalletCards} tone="red" label="للتحصيل" value={num(due.length)} />
    </div>
    <div className="tiles tiles-4">
      <Tile icon={Package} label="بيع باقة" tone="purple" onClick={() => setSheet('package')} />
      <Tile icon={Gift} label="بطاقة هدية" tone="blue" onClick={() => setSheet('gift')} />
      <Tile icon={ShoppingBag} label="بيع منتج" tone="green" onClick={() => setSheet('product')} />
      <Tile icon={Receipt} label="مصروف" tone="red" onClick={() => setSheet('expense')} />
    </div>
    <Segmented items={[{ id: 'due', label: 'للتحصيل' }, { id: 'paid', label: 'مدفوعة اليوم' }, { id: 'drawer', label: 'الصندوق' }]} value={tab} onChange={setTab} />

    {tab === 'due' && (due.length ? <div className="list">{due.map(a => <Row key={a.id}
      leading={<Avatar name={clients[a.clientId]?.name} />}
      title={clients[a.clientId]?.name || 'عميل'}
      subtitle={`${a.date === today ? timeLabel(a.time) : dateLabel(a.date, { day: 'numeric', month: 'short' })} · ${serviceNames(a)}`}
      trailing={<span className="row-end"><strong>{money(needsDeposit(a) && a.status !== 'completed' ? a.deposit - depositPaid(a) : balanceDue(a))}</strong>{needsDeposit(a) && a.status !== 'completed' ? <Badge tone="orange">عربون</Badge> : <Badge status={a.status} />}</span>}
      onClick={() => setOpen(a.id)} />)}</div> : <Empty icon={Check} title="لا شيء للتحصيل" text="كل المواعيد المكتملة مدفوعة 👌" />)}

    {tab === 'paid' && (paidToday.length ? <div className="list">{paidToday.map(a => <Row key={a.id}
      leading={<Avatar name={clients[a.clientId]?.name} />} title={clients[a.clientId]?.name}
      subtitle={(a.payments || []).filter(p => p.at === today).map(p => paymentText[p.method]).join(' + ')}
      trailing={<strong className="green">{money(amountPaid(a))}</strong>} onClick={() => setInvoice(a.id)} />)}</div>
      : <Empty icon={Receipt} title="لا دفعات اليوم بعد" />)}

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
    if (!(value >= 0) || value > due + 0.001) { setError('المبلغ أكبر من المستحق'); return; }
    if (method === 'gift') {
      if (!gift) { setError('رمز بطاقة الهدية غير صحيح'); return; }
      if (gift.expiresAt && gift.expiresAt < localISO()) { setError('بطاقة الهدية منتهية'); return; }
      if (gift.balance < value) { setError(`رصيد البطاقة ${money(gift.balance)} فقط`); return; }
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
    toast(depositMode ? 'تم استلام العربون' : value + packageValue >= due ? 'تم الدفع بالكامل ✓' : `تم استلام ${money(value)} — المتبقي ${money(due - value)}`);
    (onPaid || onClose)();
  };

  return <Sheet title={depositMode ? 'استلام العربون' : 'الدفع'} subtitle={client?.name || vocab.client} onClose={onClose}
    footer={<Button size="lg" block icon={Check} onClick={pay}>{Number(amount) > 0 ? `استلام ${money(amount)}` : 'تأكيد'}</Button>}>
    <div className="stack">
      <div className="list">
        {(a.items || []).map((item, i) => <Row key={i} title={item.name} trailing={<strong className={packageItem === item ? 'strike' : ''}>{money(item.price)}</strong>} />)}
        {already > 0 && <Row title="مدفوع سابقاً" trailing={<strong className="green">−{money(already)}</strong>} />}
      </div>
      {pkg && !depositMode && <label className="toggle-row"><span><strong>استخدام جلسة من «{pkg.name}»</strong><small>متبقٍ {pkg.total - pkg.used} من {pkg.total}</small></span><input type="checkbox" className="toggle" checked={usePackage} onChange={e => setUsePackage(e.target.checked)} /></label>}
      {!depositMode && <Field label="خصم"><div className="quick-amounts">
        {[0, 10, 20].map(p => <button type="button" key={p} className={`chip ${discount === Math.round(gross * p / 100) ? 'active' : ''}`} onClick={() => setDiscount(Math.round(gross * p / 100))}>{p ? `${p}٪` : 'بدون'}</button>)}
        <div className="money-input"><NumInput min="0" value={discount} onChange={e => setDiscount(Math.min(gross, Number(e.target.value)))} /><span>ر.ق</span></div>
      </div></Field>}
      <div className="due-box"><span>{depositMode ? 'العربون المطلوب' : 'المستحق'}</span><strong>{money(due)}</strong></div>
      <div className="method-grid">{methods.map(m => <button type="button" key={m.id} className={`method ${method === m.id ? 'active' : ''}`} onClick={() => setMethod(m.id)}><m.icon size={24} /><span>{m.label}</span></button>)}</div>
      {method === 'gift' && <Field label="رمز بطاقة الهدية" hint={gift ? `الرصيد: ${money(gift.balance)}` : ''}><input dir="ltr" className="code-input" value={giftCode} onChange={e => setGiftCode(e.target.value.toUpperCase())} placeholder="GIFT-XXXX" /></Field>}
      <Field label="المبلغ المستلم" hint="يمكنك استلام جزء والباقي لاحقاً"><div className="money-input"><NumInput min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /><span>ر.ق</span></div></Field>
      {!depositMode && <Field label="إكرامية للموظف (اختياري)"><div className="money-input"><NumInput min="0" value={tip} onChange={e => setTip(e.target.value)} /><span>ر.ق</span></div></Field>}
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
  const text = [`🧾 ${data.shopName}`, `فاتورة ${number}`, `${dateLabel(a.date)} · ${timeLabel(a.time)}`, '', ...(a.items || []).map(i => `• ${i.name}: ${money(i.price)}`),
    Number(a.discount) ? `خصم: −${money(a.discount)}` : '', `الإجمالي: ${money(appointmentTotal(a))}`, `المدفوع: ${money(amountPaid(a))}`, '', 'شكراً لزيارتك 🙏'].filter(line => line !== '').join('\n');
  return <Sheet title="الفاتورة" onClose={onClose} footer={<>
    {canUndo && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>إلغاء الدفع</Button>}
    <div className="spacer" />
    <Button variant="secondary" icon={Printer} onClick={() => window.print()}>طباعة</Button>
    {client && <Button icon={MessageCircle} onClick={() => openExternal(whatsappLink(client.phone, text))}>إرسال واتساب</Button>}
  </>}>
    <article className="invoice">
      <header><strong>{data.shopName}</strong><small dir="ltr">{number}</small></header>
      <div className="invoice-meta"><span>{client?.name}</span><span>{dateLabel(a.date)} · {timeLabel(a.time)}</span></div>
      {(a.items || []).map((item, i) => <div className="invoice-line" key={i}><span>{item.name}</span><strong>{money(item.price)}</strong></div>)}
      {Number(a.discount) > 0 && <div className="invoice-line"><span>خصم</span><strong>−{money(a.discount)}</strong></div>}
      <div className="invoice-line total"><span>الإجمالي</span><strong>{money(appointmentTotal(a))}</strong></div>
      {(a.payments || []).map(p => <div className="invoice-line muted" key={p.id}><span>{p.kind === 'tip' ? 'إكرامية' : p.kind === 'deposit' ? 'عربون' : 'دفعة'} · {paymentText[p.method]}</span><span>{money(p.amount)}</span></div>)}
      <footer>شكراً لزيارتك — نتطلع لرؤيتك مجدداً</footer>
    </article>
    {confirm && <Confirm title="إلغاء تسجيل الدفع؟" text="سيُسجَّل هذا الإجراء في سجل التعديلات باسمك." danger confirmLabel="إلغاء الدفع" onClose={() => setConfirm(false)} onConfirm={() => {
      setData(prev => ({
        ...prev,
        appointments: prev.appointments.map(x => x.id === a.id ? { ...x, payments: [] } : x),
        clientPackages: prev.clientPackages.map(p => (a.payments || []).some(x => x.packageId === p.id) ? { ...p, used: Math.max(0, p.used - 1) } : p),
        giftCards: prev.giftCards.map(g => { const back = (a.payments || []).filter(x => x.giftId === g.id).reduce((s, x) => s + x.amount, 0); return back ? { ...g, balance: g.balance + back } : g; }),
      }));
      toast('تم إلغاء الدفع'); onClose();
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
    {closedToday ? <Alert tone="green" icon={Lock}>تم إغلاق صندوق اليوم — الفرق {money(closedToday.difference)} · بقي في الدرج {money(closedToday.keep)}</Alert> : <>
      <div className="list">
        <Row title="رصيد الافتتاح" subtitle={opening === null ? (last ? `ما بقي في الدرج عند إغلاق ${dateLabel(last.date)}` : 'أول إغلاق للصندوق') : 'معدّل يدوياً'}
          trailing={editing ? <div className="money-input small"><NumInput value={openingValue} onChange={e => setOpening(Number(e.target.value))} /><span>ر.ق</span></div> : <strong>{money(openingValue)}</strong>} />
        <Row title="مقبوضات نقدية" trailing={<strong className="green">+{money(cashIn)}</strong>} />
        <Row title="مصروفات نقدية" trailing={<strong className="red">−{money(cashOut)}</strong>} />
        <Row title="المتوقع في الدرج" trailing={<strong>{money(expected)}</strong>} />
      </div>
      <Field label="المبلغ الفعلي بعد العد"><div className="money-input"><NumInput value={counted} onChange={e => setCounted(e.target.value)} placeholder="0" /><span>ر.ق</span></div></Field>
      {counted !== '' && <Alert tone={Math.abs(diff) < 1 ? 'green' : 'red'} icon={Vault}>{Math.abs(diff) < 1 ? 'الصندوق مطابق ✓' : diff > 0 ? `زيادة ${money(diff)}` : `عجز ${money(-diff)}`}</Alert>}
      <Row title="يبقى في الدرج للغد" subtitle={keep === null ? 'تلقائياً = المبلغ المعدود' : 'معدّل يدوياً (الباقي سُحب من الدرج)'}
        trailing={editing ? <div className="money-input small"><NumInput value={keepValue} onChange={e => setKeep(Number(e.target.value))} /><span>ر.ق</span></div> : <strong>{money(keepValue)}</strong>} />
      {isManager && !editing && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(true)}>تعديل الأرقام التلقائية</Button>}
      <Button size="lg" block icon={Lock} disabled={counted === ''} onClick={() => {
        upsert('drawers', { id: uid(), date: today, opening: openingValue, cashIn, cashOut, expected, counted: Number(counted), difference: diff, keep: keepValue, closedBy: staffMember?.name || shop.role, closedAt: new Date().toISOString() });
        toast('تم إغلاق الصندوق');
      }}>إغلاق صندوق اليوم</Button>
    </>}
    {history.length > 0 && <Section title="آخر الإغلاقات"><div className="list">{history.map(d => <Row key={d.id} title={dateLabel(d.date)} subtitle={`متوقع ${money(d.expected)} · فعلي ${money(d.counted)} · بقي ${money(d.keep)}`} trailing={<strong className={Math.abs(d.difference) < 1 ? 'green' : 'red'}>{Math.abs(d.difference) < 1 ? 'مطابق' : money(d.difference)}</strong>} />)}</div></Section>}
  </div>;
}

function PayMethod({ value, onChange }) {
  return <Chips items={methods.filter(m => m.id !== 'gift').map(m => ({ id: m.id, label: m.label }))} value={value} onChange={onChange} />;
}

function ClientSelect({ value, onChange }) {
  const { data } = useApp();
  return <select value={value} onChange={e => onChange(e.target.value)}><option value="">اختر...</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
}

function SellPackage({ onClose }) {
  const { data, setData, toast, vocab } = useApp();
  const [clientId, setClientId] = useState('');
  const [packageId, setPackageId] = useState(data.packages[0]?.id || '');
  const [method, setMethod] = useState('cash');
  const pkg = data.packages.find(p => p.id === packageId);
  if (!data.packages.length) return <Sheet title="بيع باقة" onClose={onClose}><Empty icon={Package} title="لا توجد باقات" text="أنشئ باقات من الإعدادات ← الباقات" /></Sheet>;
  return <Sheet title="بيع باقة" onClose={onClose} footer={<Button block size="lg" icon={Check} disabled={!clientId || !pkg} onClick={() => {
    const today = localISO();
    const id = uid();
    setData(prev => ({
      ...prev,
      clientPackages: [...prev.clientPackages, { id, clientId, packageId: pkg.id, name: pkg.name, serviceId: pkg.serviceId, total: pkg.sessions, used: 0, purchasedAt: today, expiresAt: pkg.validityDays ? new Date(Date.now() + pkg.validityDays * 86400000).toISOString().slice(0, 10) : '' }],
      sales: [...prev.sales, { id: uid(), kind: 'package', refId: id, label: pkg.name, clientId, amount: pkg.price, method, at: today }],
    }));
    toast('تم بيع الباقة'); onClose();
  }}>{pkg ? `بيع بـ ${money(pkg.price)}` : 'بيع'}</Button>}>
    <div className="stack">
      <Field label={vocab.client}><ClientSelect value={clientId} onChange={setClientId} /></Field>
      <div className="list">{data.packages.map(p => <Row key={p.id} title={p.name} subtitle={`${num(p.sessions)} جلسات · صالحة ${num(p.validityDays)} يوم`} trailing={<span className="row-end"><strong>{money(p.price)}</strong>{packageId === p.id && <Check className="green" size={18} />}</span>} onClick={() => setPackageId(p.id)} />)}</div>
      <Field label="طريقة الدفع"><PayMethod value={method} onChange={setMethod} /></Field>
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
  if (done) return <Sheet title="بطاقة الهدية جاهزة" onClose={onClose}><div className="gift-card"><Gift size={28} /><strong dir="ltr">{done.code}</strong><span>{money(done.amount)}</span>{done.recipientName && <small>إلى: {done.recipientName}</small>}</div><p className="muted center">أعطِ الرمز للعميل — يُستخدم عند الدفع باختيار «هدية»</p></Sheet>;
  return <Sheet title="بطاقة هدية جديدة" onClose={onClose} footer={<Button block size="lg" icon={TicketPercent} disabled={!(amount > 0)} onClick={() => {
    const code = `GIFT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const card = { id: uid(), code, amount: Number(amount), balance: Number(amount), buyerName: buyer, recipientName: recipient, createdAt: localISO(), expiresAt: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) };
    setData(prev => ({ ...prev, giftCards: [...prev.giftCards, card], sales: [...prev.sales, { id: uid(), kind: 'gift', refId: card.id, label: `بطاقة هدية ${code}`, amount: card.amount, method, at: localISO() }] }));
    toast('تم إصدار البطاقة'); setDone(card);
  }}>إصدار {money(amount)}</Button>}>
    <div className="stack">
      <div className="chips">{[100, 200, 300, 500].map(v => <button type="button" key={v} className={`chip ${Number(amount) === v ? 'active' : ''}`} onClick={() => setAmount(v)}>{money(v)}</button>)}</div>
      <Field label="مبلغ آخر"><div className="money-input"><NumInput min="1" value={amount} onChange={e => setAmount(e.target.value)} /><span>ر.ق</span></div></Field>
      <Field label="اسم المشتري"><input value={buyer} onChange={e => setBuyer(e.target.value)} /></Field>
      <Field label="اسم المُهدى إليه"><input value={recipient} onChange={e => setRecipient(e.target.value)} /></Field>
      <Field label="طريقة الدفع"><PayMethod value={method} onChange={setMethod} /></Field>
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
  return <Sheet title="بيع منتج" onClose={onClose} footer={<Button block size="lg" icon={Check} disabled={!product || quantity < 1 || quantity > product.quantity} onClick={() => {
    const today = localISO();
    setData(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === product.id ? { ...p, quantity: p.quantity - quantity, updatedAt: today } : p),
      stockMovements: [...prev.stockMovements, { id: uid(), productId: product.id, direction: 'out', quantity: Number(quantity), note: 'بيع', date: today }],
      sales: [...prev.sales, { id: uid(), kind: 'product', refId: product.id, label: `${product.name} ×${quantity}`, amount: product.price * quantity, cost: product.cost * quantity, method, at: today }],
    }));
    toast('تم البيع'); onClose();
  }}>{product ? `بيع بـ ${money(product.price * quantity)}` : 'اختر منتجاً'}</Button>}>
    <div className="stack">
      {sellable.length ? <div className="list">{sellable.map(p => <Row key={p.id} title={p.name} subtitle={`المتوفر ${num(p.quantity)} ${p.unit}`} trailing={<span className="row-end"><strong>{money(p.price)}</strong>{productId === p.id && <Check className="green" size={18} />}</span>} onClick={() => setProductId(p.id)} />)}</div>
        : <Empty icon={ShoppingBag} title="لا منتجات للبيع" text="أضف سعر بيع للمنتجات من المخزون" />}
      <Field label="الكمية"><NumInput min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></Field>
      <Field label="طريقة الدفع"><PayMethod value={method} onChange={setMethod} /></Field>
    </div>
  </Sheet>;
}

const expenseCategories = ['إيجار', 'رواتب', 'مشتريات', 'فواتير', 'صيانة', 'تسويق', 'أخرى'];
function AddExpense({ onClose }) {
  const { upsert, toast } = useApp();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('مشتريات');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('cash');
  return <Sheet title="تسجيل مصروف" onClose={onClose} footer={<Button block size="lg" icon={Check} disabled={!(Number(amount) > 0)} onClick={() => {
    upsert('expenses', { id: uid(), amount: Number(amount), category, note, method, date: localISO() });
    toast('تم تسجيل المصروف'); onClose();
  }}>حفظ</Button>}>
    <div className="stack">
      <Field label="المبلغ"><div className="money-input"><NumInput autoFocus min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /><span>ر.ق</span></div></Field>
      <Field label="البند"><Chips items={expenseCategories.map(c => ({ id: c, label: c }))} value={category} onChange={setCategory} /></Field>
      <Field label="ملاحظة"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Field label="الدفع من"><PayMethod value={method} onChange={setMethod} /></Field>
    </div>
  </Sheet>;
}
