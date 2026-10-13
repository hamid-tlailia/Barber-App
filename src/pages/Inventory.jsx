import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Check, Download, PackagePlus, Send, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import { localISO, money, num, toCSV, uid } from '../data.js';
import { stockForecast } from '../smart.js';
import { Alert, Badge, Button, Confirm, Empty, Field, Meter, Row, SearchBox, Section, Segmented, Sheet, Stat, download, openExternal, useApp, NumInput } from '../ui.jsx';
import { L } from '../i18n.js';

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
    const text = [L(`طلب توريد — ${data.shopName}`, `Supply order — ${data.shopName}`), '', ...low.map(f => `• ${f.product.name}: ${num(Math.max(1, f.suggested))} ${f.product.unit}`)].join('\n');
    openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  return <div className="stack">
    <div className="stats">
      <Stat icon={Boxes} label={L('منتجات', 'Products')} value={num(data.products.length)} />
      <Stat icon={TriangleAlert} tone={low.length ? 'red' : 'green'} label={L('تحتاج طلب', 'Need reorder')} value={num(low.length)} onClick={() => setFilter('low')} />
      {isManager && <Stat icon={Wallet} label={L('قيمة المخزون', 'Stock value')} tone="blue" value={money(value)} />}
    </div>
    {low.length > 0 && <div className="auto-card">
      <span className="tile-icon tone-red"><TriangleAlert size={24} /></span>
      <div><strong>{L(`${num(low.length)} منتجات قاربت على النفاد`, `${num(low.length)} product${low.length === 1 ? ' is' : 's are'} running low`)}</strong><small>{L('جهّزنا لك قائمة الطلب بالكميات المقترحة حسب استهلاكك', 'We prepared an order list with suggested quantities based on your usage')}</small></div>
      <Button size="sm" icon={Send} onClick={shareOrder}>{L('أرسل للمورّد', 'Send to supplier')}</Button>
    </div>}
    <div className="page-head">
      <Segmented size="sm" items={[{ id: 'all', label: L('الكل', 'All') }, { id: 'low', label: L('منخفض', 'Low') }]} value={filter} onChange={setFilter} />
      <div className="row-buttons">
        {isManager && <Button variant="ghost" icon={Download} onClick={() => download(`inventory-${localISO()}.csv`, toCSV([[L('المنتج', 'Product'), L('الفئة', 'Category'), L('الكمية', 'Quantity'), L('الحد الأدنى', 'Min stock'), L('التكلفة', 'Cost'), L('سعر البيع', 'Sale price')], ...data.products.map(p => [p.name, p.category, p.quantity, p.minStock, p.cost, p.price])]))} aria-label={L('تصدير CSV', 'Export CSV')} title={L('تصدير CSV', 'Export CSV')}>CSV</Button>}
        {isManager && <Button variant="ghost" icon={Download} title={L('تصدير Excel', 'Export Excel')} onClick={() => import('../lib/exporters.js').then(x => x.exportXlsx(`inventory-${localISO()}.xlsx`, [{ name: L('المخزون', 'Inventory'), rows: [[L('المنتج', 'Product'), L('الفئة', 'Category'), L('الكمية', 'Quantity'), L('الحد الأدنى', 'Min stock'), L('التكلفة', 'Cost'), L('سعر البيع', 'Sale price')], ...data.products.map(p => [p.name, p.category || '', Number(p.quantity) || 0, Number(p.minStock) || 0, Number(p.cost) || 0, Number(p.price) || 0])] }]))}>Excel</Button>}
        {isManager && <Button icon={PackagePlus} onClick={() => setForm({})}>{L('منتج', 'Product')}</Button>}
      </div>
    </div>
    <SearchBox value={query} onChange={setQuery} placeholder={L('ابحث عن منتج', 'Search products')} />
    {list.length ? <div className="product-grid">{list.map(({ product: p, daysLeft, low: isLow }) => <button type="button" key={p.id} className={`product ${isLow ? 'low' : ''}`} onClick={() => setMove(p)}>
      <strong>{p.name}</strong>
      <span className="product-qty">{num(p.quantity)} <small>{p.unit}</small></span>
      <Meter value={p.quantity} max={Math.max(p.minStock * 3, p.quantity)} tone={isLow ? 'red' : 'green'} />
      <small>{isLow ? L('اطلب الآن', 'Reorder now') : daysLeft !== null ? L(`يكفي ~${num(daysLeft)} يوم`, `Lasts ~${num(daysLeft)} day${daysLeft === 1 ? '' : 's'}`) : p.category}</small>
    </button>)}</div> : <Empty icon={Boxes} title={L('لا منتجات', 'No products')} text={L('أضف منتجاتك لتتبع الكميات والتنبيه قبل النفاد', 'Add your products to track quantities and get alerts before they run out')} />}

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
    if (!(q > 0)) { setError(L('أدخل كمية صحيحة', 'Enter a valid quantity')); return; }
    if (direction === 'out' && q > product.quantity) { setError(L('الكمية أكبر من المتوفر', 'Quantity exceeds available stock')); return; }
    const today = localISO();
    setData(prev => ({
      ...prev,
      products: prev.products.map(p => p.id === product.id ? { ...p, quantity: p.quantity + (direction === 'in' ? q : -q), updatedAt: today } : p),
      stockMovements: [...prev.stockMovements, { id: uid(), productId: product.id, direction, quantity: q, note, date: today }],
    }));
    toast(direction === 'in' ? L('تم التوريد', 'Stock added') : L('تم الصرف', 'Stock used'));
    onClose();
  };
  return <Sheet title={product.name} subtitle={L(`المتوفر: ${num(product.quantity)} ${product.unit}`, `In stock: ${num(product.quantity)} ${product.unit}`)} onClose={onClose} footer={<>
    {isManager && <Button variant="ghost" onClick={onEdit}>{L('تعديل المنتج', 'Edit product')}</Button>}<div className="spacer" /><Button icon={Check} onClick={save}>{L('تسجيل', 'Record')}</Button>
  </>}>
    <div className="stack">
      <div className="method-grid method-grid-2">
        <button type="button" className={`method ${direction === 'out' ? 'active' : ''}`} onClick={() => setDirection('out')}><ArrowUpFromLine size={24} /><span>{L('صرف / استخدام', 'Use / Remove')}</span></button>
        <button type="button" className={`method ${direction === 'in' ? 'active' : ''}`} onClick={() => setDirection('in')}><ArrowDownToLine size={24} /><span>{L('توريد', 'Restock')}</span></button>
      </div>
      <div className="stepper">
        <button type="button" onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}>−</button>
        <NumInput min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
        <button type="button" onClick={() => setQuantity(Number(quantity) + 1)}>+</button>
      </div>
      <Field label={L('ملاحظة (اختياري)', 'Note (optional)')}><input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Alert>{error}</Alert>
      {history.length > 0 && <Section title={L('آخر الحركات', 'Recent movements')}><div className="list">{history.map(m => <Row key={m.id} title={`${m.direction === 'in' ? '+' : '−'}${num(m.quantity)} ${product.unit}`} subtitle={`${m.date}${m.note ? ` · ${m.note}` : ''}`} trailing={<Badge tone={m.direction === 'in' ? 'green' : 'orange'}>{m.direction === 'in' ? L('توريد', 'Restock') : L('صرف', 'Used')}</Badge>} />)}</div></Section>}
    </div>
  </Sheet>;
}

function ProductForm({ product, onClose }) {
  const { upsert, remove, toast } = useApp();
  const [v, setV] = useState({ name: '', category: '', quantity: 0, minStock: 3, cost: 0, price: 0, unit: L('قطعة', 'pc'), ...product });
  const [confirm, setConfirm] = useState(false);
  const set = (key, numeric) => e => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value });
  return <Sheet title={product ? L('تعديل المنتج', 'Edit product') : L('منتج جديد', 'New product')} onClose={onClose} footer={<>
    {product && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>{L('حذف', 'Delete')}</Button>}
    <div className="spacer" />
    <Button icon={Check} disabled={!v.name.trim()} onClick={() => { upsert('products', { ...v, id: product?.id || uid(), name: v.name.trim(), updatedAt: localISO() }); toast(L('تم الحفظ', 'Saved')); onClose(); }}>{L('حفظ', 'Save')}</Button>
  </>}>
    <div className="stack">
      <Field label={L('اسم المنتج', 'Product name')} required><input autoFocus value={v.name} onChange={set('name')} /></Field>
      <div className="grid-2">
        <Field label={L('الفئة', 'Category')}><input value={v.category} onChange={set('category')} /></Field>
        <Field label={L('الوحدة', 'Unit')}><input value={v.unit} onChange={set('unit')} /></Field>
        <Field label={L('الكمية الحالية', 'Current quantity')}><NumInput min="0" value={v.quantity} onChange={set('quantity', true)} /></Field>
        <Field label={L('نبّهني عند', 'Alert me at')}><NumInput min="0" value={v.minStock} onChange={set('minStock', true)} /></Field>
        <Field label={L('التكلفة', 'Cost')}><NumInput min="0" value={v.cost} onChange={set('cost', true)} /></Field>
        <Field label={L('سعر البيع', 'Sale price')} hint={L('0 = للاستخدام الداخلي', '0 = internal use only')}><NumInput min="0" value={v.price} onChange={set('price', true)} /></Field>
      </div>
    </div>
    {confirm && <Confirm title={L('حذف المنتج؟', 'Delete product?')} danger confirmLabel={L('حذف', 'Delete')} onClose={() => setConfirm(false)} onConfirm={() => { remove('products', product.id); toast(L('تم الحذف', 'Deleted')); onClose(); }} />}
  </Sheet>;
}
