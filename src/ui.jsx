// مكونات الواجهة المشتركة: بسيطة، كبيرة، وواضحة للمس.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Search, TriangleAlert, X } from 'lucide-react';
import { statusText } from './data.js';
import { L, isEn } from './i18n.js';
import { saveFile } from './lib/files.js';

// السهم يشير لاتجاه التقدّم: يسار في العربية ويمين في الإنجليزية.
const Chevron = isEn ? ChevronRight : ChevronLeft;

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const initials = name => (name || L('؟', '?')).trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
const hue = text => [...String(text || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;

export function Avatar({ name, size = 'md', color }) {
  return <span className={`avatar avatar-${size} avatar-${hue(name)}`} style={color ? { background: color, color: '#fff' } : undefined} aria-hidden="true">{initials(name)}</span>;
}

export function Badge({ status, children, tone }) {
  return <span className={`badge badge-${tone || status}`}>{children || statusText[status] || status}</span>;
}

// إذا أعاد onClick وعداً (حفظ على الخادم مثلاً) يظهر مؤشر تحميل ويُقفل الزر حتى الانتهاء.
export function Button({ icon: Icon, children, variant = 'primary', size, block, onClick, disabled, loading, ...props }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const working = busy || loading;
  const click = event => {
    const result = onClick?.(event);
    if (result && typeof result.then === 'function') {
      setBusy(true);
      result.finally(() => { if (mounted.current) setBusy(false); });
    }
  };
  const ShownIcon = working ? Loader2 : Icon;
  return <button type="button" className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${working ? 'btn-busy' : ''}`} disabled={disabled || working} aria-busy={working || undefined} onClick={click} {...props}>{ShownIcon && <ShownIcon size={size === 'lg' ? 20 : 18} className={working ? 'spin' : undefined} />}{children && <span>{children}</span>}</button>;
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
    {trailing !== undefined ? <span className="row-trailing">{trailing}</span> : onClick ? <Chevron className="row-chevron" size={18} /> : null}
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

// نافذة منبثقة: لوحة سفلية على الهاتف تُسحب للأسفل لإغلاقها (مثل التطبيقات)، ونافذة وسطية على الشاشات الكبيرة.
const CLOSE_MS = 240;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Sheet({ title, subtitle, onClose, children, footer, size = 'md' }) {
  const backdrop = useRef(null);
  const panel = useRef(null);
  const drag = useRef(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const requestClose = useCallback((mode = 'tap') => {
    if (closing) return;
    if (reduceMotion()) { closeRef.current(); return; }
    setClosing(mode === 'drag' ? 'drag' : 'tap');
    setTimeout(() => closeRef.current(), CLOSE_MS);
  }, [closing]);

  useEffect(() => {
    // Escape / زر الرجوع يغلق النافذة العلوية فقط عند تداخل النوافذ.
    const onKey = event => {
      if (event.key !== 'Escape') return;
      const all = document.querySelectorAll('.sheet-backdrop');
      if (all[all.length - 1] === backdrop.current) requestClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      if (document.querySelectorAll('.sheet-backdrop').length <= 1) document.body.classList.remove('sheet-open');
    };
  }, [requestClose]);

  // السحب من داخل المحتوى عندما يكون في أعلاه: نلتقط اللمس قبل أن يتحول لتمرير.
  useEffect(() => {
    const el = panel.current?.querySelector('.sheet-body');
    if (!el || window.matchMedia?.('(min-width: 700px)').matches) return undefined;
    let start = null;
    const down = e => { start = el.scrollTop <= 0 && !e.target.closest('input, textarea, select, .day-strip, .chips, .segmented') ? e.touches[0].clientY : null; };
    const move = e => {
      if (start === null) return;
      const y = e.touches[0].clientY;
      if (!drag.current) {
        if (y - start > 6 && el.scrollTop <= 0) drag.current = { startY: y, lastY: y, lastT: performance.now(), velocity: 0, dy: 0, active: true };
        else if (start - y > 4) { start = null; return; } else return;
      }
      e.preventDefault();
      onPointerMove({ clientY: y });
    };
    const up = () => { start = null; if (drag.current) onPointerUp(); };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    return () => { el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', up); el.removeEventListener('touchcancel', up); };
  });

  // السحب للأسفل من المقبض أو شريط العنوان (مثل تطبيقات الهاتف).
  const onPointerDown = event => {
    if (event.pointerType === 'mouse' || window.matchMedia?.('(min-width: 700px)').matches) return;
    if (!event.target.closest('.sheet-grip, .sheet-head') || event.target.closest('button, input, a')) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    drag.current = { startY: event.clientY, lastY: event.clientY, lastT: performance.now(), velocity: 0, dy: 0, active: false };
  };
  const onPointerMove = event => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    if (!d.active) { if (Math.abs(dy) < 4) return; d.active = true; }
    const now = performance.now();
    d.velocity = (event.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = event.clientY; d.lastT = now;
    d.dy = Math.max(0, event.clientY - d.startY) - Math.max(0, d.startY - event.clientY) * 0.15;
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${Math.max(-12, d.dy)}px)`;
    backdrop.current.style.setProperty('--dim', String(Math.max(0, 1 - d.dy / (panel.current.offsetHeight || 600))));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const shouldClose = d.dy > Math.min(140, (panel.current.offsetHeight || 600) * 0.3) || (d.velocity > 0.6 && d.dy > 30);
    panel.current.style.transition = '';
    backdrop.current.style.removeProperty('--dim');
    if (shouldClose) {
      // يكمل النزول من موضع الإصبع بنفس الاتجاه بدل القفز.
      panel.current.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(.4, 0, 1, 1)`;
      panel.current.style.transform = 'translateY(105%)';
      requestClose('drag');
    } else panel.current.style.transform = '';
  };

  return <div ref={backdrop} className={`sheet-backdrop ${closing ? `closing closing-${closing}` : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <div ref={panel} className={`sheet sheet-${size}`} role="dialog" aria-modal="true" aria-label={title}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="sheet-grip" aria-hidden="true"><span /></div>
      <header className="sheet-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <IconButton icon={X} label={L('إغلاق', 'Close')} onClick={() => requestClose()} />
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

// حقل رقم يمكن مسحه بالكامل (لا يعود الصفر أثناء الكتابة)، ويقبل الأرقام العربية ويحولها.
const toLatin = text => String(text).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٫,]/g, '.');
const shown = value => (value === '' || value === null || value === undefined ? '' : String(value));
export function NumInput({ value, onChange, ...props }) {
  const [text, setText] = useState(() => shown(value));
  // نحدّث النص عند تغيّر القيمة من الخارج فقط (وليس عند المسح أثناء الكتابة).
  useEffect(() => { if (Number(text || 0) !== Number(value || 0)) setText(shown(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input {...props} type="text" inputMode="decimal" dir="ltr" value={text} onFocus={event => { event.target.select(); props.onFocus?.(event); }}
    onChange={event => {
      const clean = toLatin(event.target.value).replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
      setText(clean);
      onChange({ target: { value: clean } });
    }} />;
}

export function SearchBox({ value, onChange, placeholder = L('بحث...', 'Search...') }) {
  return <label className="search"><Search size={18} /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />{value && <button type="button" onClick={() => onChange('')} aria-label={L('مسح', 'Clear')}><X size={16} /></button>}</label>;
}

export function Alert({ children, tone = 'red', icon: Icon = TriangleAlert }) {
  return children ? <div className={`alert alert-${tone}`}><Icon size={18} /><span>{children}</span></div> : null;
}

export function Toggle({ checked, onChange, label, hint }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><input type="checkbox" className="toggle" checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} /></label>;
}

export function Confirm({ title, text, confirmLabel = L('تأكيد', 'Confirm'), danger, onConfirm, onClose }) {
  return <Sheet title={title} onClose={onClose} size="sm" footer={<><Button variant="ghost" onClick={onClose}>{L('تراجع', 'Cancel')}</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
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

// يعيد وعداً: الأزرار تُظهر مؤشر تحميل حتى يجهز الملف.
export const download = (name, content, type = 'text/csv;charset=utf-8') => saveFile(name, content, type);

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
