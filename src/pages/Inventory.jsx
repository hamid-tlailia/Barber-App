import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Check, Download, PackagePlus, Send, Trash2, TriangleAlert } from 'lucide-react';
import { localISO, money, num, toCSV, uid } from '../data.js';
import { stockForecast } from '../smart.js';
import { Alert, Badge, Button, Confirm, Empty, Field, Meter, Row, SearchBox, Section, Segmented, Sheet, Stat, download, openExternal, useApp } from '../ui.jsx';

export default function Inventory() {
  const { data, isManager } = useApp();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [move, setMove] = useState(null);
  const forecast = stockForecast(data.products, data.stockMovements);
  const low = forecast.filter(f => f.low);
  const value = data.products.reduce((s, p) => s + Number(p.quantity) * Number(p.cost || 0), 0);
  const list = forecast.filter(f => (filter === 'all' || f.low) && (!query || f.product.name.includes(query) || (f.product.category || '').includes(query)));

  const shareOrder = () => {
    const text = [`طلب توريد — ${data.shopName}`, '', ...low.map(f => `• ${f.product.name}: ${num(Math.max(1, f.suggested))} ${f.product.unit}`)].join('\n');
    openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  return <div className="stack">
    <div className="stats">
      <Stat icon={Boxes} label="منتجات" value={num(data.products.length)} />
      <Stat icon={TriangleAlert} tone={low.length ? 'red' : 'green'} label="تحتاج طلب" value={num(low.length)} onClick={() => setFilter('low')} />
      {isManager && <Stat label="قيمة المخزون" tone="blue" value={money(value)} />}
    </div>
    {low.length > 0 && <div className="auto-card">
      <span className="tile-icon tone-red"><TriangleAlert size={24} /></span>
      <div><strong>{num(low.length)} منتجات قاربت على النفاد</strong><small>جهّزنا لك قائمة الطلب بالكميات المقترحة حسب استهلاكك</small></div>
      <Button size="sm" icon={Send} onClick={shareOrder}>أرسل للمورّد</Button>
    </div>}
    <div className="page-head">
      <Segmented size="sm" items={[{ id: 'all', label: 'الكل' }, { id: 'low', label: 'منخفض' }]} value={filter} onChange={setFilter} />
      <div className="row-buttons">
        {isManager && <Button variant="ghost" icon={Download} onClick={() => download(`inventory-${localISO()}.csv`, toCSV([['المنتج', 'الفئة', 'الكمية', 'الحد الأدنى', 'التكلفة', 'سعر البيع'], ...data.products.map(p => [p.name, p.category, p.quantity, p.minStock, p.cost, p.price])]))} />}
        {isManager && <Button icon={PackagePlus} onClick={() => setForm({})}>منتج</Button>}
      </div>
    </div>
    <SearchBox value={query} onChange={setQuery} placeholder="ابحث عن منتج" />
    {list.length ? <div className="product-grid">{list.map(({ product: p, daysLeft, low: isLow }) => <button type="button" key={p.id} className={`product ${isLow ? 'low' : ''}`} onClick={() => setMove(p)}>
      <strong>{p.name}</strong>
      <span className="product-qty">{num(p.quantity)} <small>{p.unit}</small></span>
      <Meter value={p.quantity} max={Math.max(p.minStock * 3, p.quantity)} tone={isLow ? 'red' : 'green'} />
      <small>{isLow ? 'اطلب الآن' : daysLeft !== null ? `يكفي ~${num(daysLeft)} يوم` : p.category}</small>
    </button>)}</div> : <Empty icon={Boxes} title="لا منتجات" text="أضف منتجاتك لتتبع الكميات والتنبيه قبل النفاد" />}

    {form && <ProductForm product={form.id ? form : null} onClose={() => setForm(null)} />}
    {move && <StockSheet product={data.products.find(p => p.id === move.id)} onClose={() => setMove(null)} onEdit={() => { setForm(move); setMove(null); }} />}
  </div>;
}

function StockSheet({ product, onClose, onEdit }) {
  const { data, setData, toast, isManager } = useApp();
  const [direction, setDirection] = useState('out');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (!product) return null;
  const history = data.stockMovements.filter(m => m.productId === product.id).slice(-8).reverse();
  const save = () => {
    const q = Number(quantity);
    if (!(q > 0)) { setError('أدخل كمية صحيحة'); return; }
    if (direction === 'out' && q > product.quantity) { setError('الكمية أكبر من المتوفر'); return; }
    const today = localISO();
    setData(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === product.id ? { ...p, quantity: p.quantity + (direction === 'in' ? q : -q), updatedAt: today } : p),
      stockMovements: [...prev.stockMovements, { id: uid(), productId: product.id, direction, quantity: q, note, date: today }],
    }));
    toast(direction === 'in' ? 'تم التوريد' : 'تم الصرف');
    onClose();
  };
  return <Sheet title={product.name} subtitle={`المتوفر: ${num(product.quantity)} ${product.unit}`} onClose={onClose} footer={<>
    {isManager && <Button variant="ghost" onClick={onEdit}>تعديل المنتج</Button>}<div className="spacer" /><Button icon={Check} onClick={save}>تسجيل</Button>
  </>}>
    <div className="stack">
      <div className="method-grid method-grid-2">
        <button type="button" className={`method ${direction === 'out' ? 'active' : ''}`} onClick={() => setDirection('out')}><ArrowUpFromLine size={24} /><span>صرف / استخدام</span></button>
        <button type="button" className={`method ${direction === 'in' ? 'active' : ''}`} onClick={() => setDirection('in')}><ArrowDownToLine size={24} /><span>توريد</span></button>
      </div>
      <div className="stepper">
        <button type="button" onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}>−</button>
        <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
        <button type="button" onClick={() => setQuantity(Number(quantity) + 1)}>+</button>
      </div>
      <Field label="ملاحظة (اختياري)"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Alert>{error}</Alert>
      {history.length > 0 && <Section title="آخر الحركات"><div className="list">{history.map(m => <Row key={m.id} title={`${m.direction === 'in' ? '+' : '−'}${num(m.quantity)} ${product.unit}`} subtitle={`${m.date}${m.note ? ` · ${m.note}` : ''}`} trailing={<Badge tone={m.direction === 'in' ? 'green' : 'orange'}>{m.direction === 'in' ? 'توريد' : 'صرف'}</Badge>} />)}</div></Section>}
    </div>
  </Sheet>;
}

function ProductForm({ product, onClose }) {
  const { upsert, remove, toast } = useApp();
  const [v, setV] = useState({ name: '', category: '', quantity: 0, minStock: 3, cost: 0, price: 0, unit: 'قطعة', ...product });
  const [confirm, setConfirm] = useState(false);
  const set = (key, numeric) => e => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value });
  return <Sheet title={product ? 'تعديل المنتج' : 'منتج جديد'} onClose={onClose} footer={<>
    {product && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>حذف</Button>}
    <div className="spacer" />
    <Button icon={Check} disabled={!v.name.trim()} onClick={() => { upsert('products', { ...v, id: product?.id || uid(), name: v.name.trim(), updatedAt: localISO() }); toast('تم الحفظ'); onClose(); }}>حفظ</Button>
  </>}>
    <div className="stack">
      <Field label="اسم المنتج" required><input autoFocus value={v.name} onChange={set('name')} /></Field>
      <div className="grid-2">
        <Field label="الفئة"><input value={v.category} onChange={set('category')} /></Field>
        <Field label="الوحدة"><input value={v.unit} onChange={set('unit')} /></Field>
        <Field label="الكمية الحالية"><input type="number" min="0" value={v.quantity} onChange={set('quantity', true)} /></Field>
        <Field label="نبّهني عند"><input type="number" min="0" value={v.minStock} onChange={set('minStock', true)} /></Field>
        <Field label="التكلفة"><input type="number" min="0" value={v.cost} onChange={set('cost', true)} /></Field>
        <Field label="سعر البيع" hint="0 = للاستخدام الداخلي"><input type="number" min="0" value={v.price} onChange={set('price', true)} /></Field>
      </div>
    </div>
    {confirm && <Confirm title="حذف المنتج؟" danger confirmLabel="حذف" onClose={() => setConfirm(false)} onConfirm={() => { remove('products', product.id); toast('تم الحذف'); onClose(); }} />}
  </Sheet>;
}
