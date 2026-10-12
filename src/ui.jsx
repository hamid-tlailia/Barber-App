// مكونات الواجهة المشتركة: بسيطة، كبيرة، وواضحة للمس.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Check, ChevronLeft, Search, TriangleAlert, X } from 'lucide-react';
import { statusText } from './data.js';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const initials = name => (name || '؟').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
const hue = text => [...String(text || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;

export function Avatar({ name, size = 'md', color }) {
  return <span className={`avatar avatar-${size} avatar-${hue(name)}`} style={color ? { background: color, color: '#fff' } : undefined} aria-hidden="true">{initials(name)}</span>;
}

export function Badge({ status, children, tone }) {
  return <span className={`badge badge-${tone || status}`}>{children || statusText[status] || status}</span>;
}

export function Button({ icon: Icon, children, variant = 'primary', size, block, ...props }) {
  return <button type="button" className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''}`} {...props}>{Icon && <Icon size={size === 'lg' ? 20 : 18} />}{children && <span>{children}</span>}</button>;
}

export function IconButton({ icon: Icon, label, tone = '', ...props }) {
  return <button type="button" className={`icon-btn ${tone}`} aria-label={label} title={label} {...props}><Icon size={19} /></button>;
}

// البطاقة الأساسية: أيقونة في المنتصف + عنوان + سطر واحد اختياري.
export function Tile({ icon: Icon, label, hint, tone = 'accent', onClick, count, disabled }) {
  return <button type="button" className={`tile tone-${tone}`} onClick={onClick} disabled={disabled}>
    {count ? <span className="tile-count">{count}</span> : null}
    <span className="tile-icon"><Icon size={26} strokeWidth={1.9} /></span>
    <strong>{label}</strong>
    {hint && <small>{hint}</small>}
  </button>;
}

export function Stat({ icon: Icon, label, value, tone = 'accent', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} className={`stat tone-${tone}`} onClick={onClick}>
    {Icon && <span className="stat-icon"><Icon size={22} /></span>}
    <strong className="stat-value">{value}</strong>
    <span className="stat-label">{label}</span>
  </Tag>;
}

export function Row({ leading, title, subtitle, trailing, onClick, tone }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} className={`row ${tone ? `row-${tone}` : ''}`} onClick={onClick}>
    {leading && <span className="row-leading">{leading}</span>}
    <span className="row-body"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
    {trailing !== undefined ? <span className="row-trailing">{trailing}</span> : onClick ? <ChevronLeft className="row-chevron" size={18} /> : null}
  </Tag>;
}

export function Section({ title, action, children, className = '' }) {
  return <section className={`section ${className}`}>
    {(title || action) && <div className="section-head">{title && <h2>{title}</h2>}{action}</div>}
    {children}
  </section>;
}

export function Empty({ icon: Icon, title, text, action }) {
  return <div className="empty"><span className="empty-icon"><Icon size={30} /></span><strong>{title}</strong>{text && <p>{text}</p>}{action}</div>;
}

// نافذة منبثقة: لوحة سفلية على الهاتف، ونافذة وسطية على الشاشات الكبيرة.
export function Sheet({ title, subtitle, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('sheet-open'); };
  }, [onClose]);
  return <div className="sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`sheet sheet-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="sheet-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <IconButton icon={X} label="إغلاق" onClick={onClose} />
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </div>
  </div>;
}

export function Steps({ steps, current }) {
  return <ol className="steps">{steps.map((label, index) => <li key={label} className={index < current ? 'done' : index === current ? 'current' : ''}>
    <span>{index < current ? <Check size={14} /> : index + 1}</span><em>{label}</em>
  </li>)}</ol>;
}

export function Field({ label, hint, required, children }) {
  return <label className="field"><span className="field-label">{label}{required && <em> *</em>}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
}

export function Segmented({ items, value, onChange, size }) {
  return <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="tablist">{items.map(item => <button type="button" role="tab" aria-selected={value === item.id} key={item.id} className={value === item.id ? 'active' : ''} onClick={() => onChange(item.id)}>{item.icon && <item.icon size={16} />}{item.label}</button>)}</div>;
}

export function Chips({ items, value, onChange, multiple }) {
  const selected = multiple ? value : [value];
  return <div className="chips">{items.map(item => {
    const active = selected.includes(item.id);
    return <button type="button" key={item.id} className={`chip ${active ? 'active' : ''}`} onClick={() => onChange(multiple ? (active ? value.filter(v => v !== item.id) : [...value, item.id]) : item.id)}>{item.label}</button>;
  })}</div>;
}

export function SearchBox({ value, onChange, placeholder = 'بحث...' }) {
  return <label className="search"><Search size={18} /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />{value && <button type="button" onClick={() => onChange('')} aria-label="مسح"><X size={16} /></button>}</label>;
}

export function Alert({ children, tone = 'red', icon: Icon = TriangleAlert }) {
  return children ? <div className={`alert alert-${tone}`}><Icon size={18} /><span>{children}</span></div> : null;
}

export function Toggle({ checked, onChange, label, hint }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><input type="checkbox" className="toggle" checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} /></label>;
}

export function Confirm({ title, text, confirmLabel = 'تأكيد', danger, onConfirm, onClose }) {
  return <Sheet title={title} onClose={onClose} size="sm" footer={<><Button variant="ghost" onClick={onClose}>تراجع</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
    <p className="muted">{text}</p>
  </Sheet>;
}

export function Bars({ data, format = v => v }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return <div className="bars">{data.map(d => <div key={d.label} className="bar" title={`${d.label}: ${format(d.value)}`}>
    <span className="bar-value">{d.value ? format(d.value) : ''}</span>
    <span className="bar-fill" style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} />
    <span className="bar-label">{d.label}</span>
  </div>)}</div>;
}

export function Meter({ value, max, tone = 'accent' }) {
  return <span className={`meter tone-${tone}`}><span style={{ width: `${Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100))}%` }} /></span>;
}

export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.action ? 6000 : 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  return [toast, (text, tone = 'success', action) => setToast({ text, tone, action, at: Date.now() }), () => setToast(null)];
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.tone}`} role="status">
    <span>{toast.text}</span>
    {toast.action && <button type="button" onClick={() => { toast.action.run(); onClose(); }}>{toast.action.label}</button>}
  </div>;
}

export const download = (name, content, type = 'text/csv;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// يفتح واتساب في التطبيق الأصلي على الهاتف أو في تبويب جديد على الكمبيوتر.
export const openExternal = href => { window.open(href, '_blank', 'noopener'); };

// ضغط الصور قبل حفظها لتبقى قاعدة البيانات خفيفة.
export const compressImage = (file, max = 900, quality = 0.72) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onload = () => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => {
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(image.width * scale), height: Math.round(image.height * scale) });
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});
