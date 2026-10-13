// لوحة المطوّر (أنت): متابعة الصالونات في التجربة وتفعيل الاشتراكات بعد الدفع.
import React, { useEffect, useState } from 'react';
import { Ban, Bot, CalendarPlus, Check, Crown, MessageCircle, RefreshCw, Store } from 'lucide-react';
import { num, whatsappLink, LOCALE } from '../data.js';
import { api, errorText } from '../lib/sync.js';
import { Alert, Badge, Button, Empty, Field, Row, SearchBox, Section, Segmented, Sheet, Stat, Toggle, openExternal, useApp } from '../ui.jsx';

const addMonths = months => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString(); };
const statusOf = s => s.plan === 'suspended' ? 'suspended' : s.active ? (s.paid_until && new Date(s.paid_until) > new Date() ? 'paid' : 'trial') : 'expired';
const labels = { paid: ['مشترك', 'green'], trial: ['تجربة', 'blue'], expired: ['منتهي', 'red'], suspended: ['موقوف', 'muted'] };

export default function Admin() {
  const { toast, reloadShops } = useApp();
  const [shops, setShops] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.admin.shops().then(setShops).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []);

  const act = async (fn, message) => {
    try { await fn(); toast(message); setOpen(null); await load(); reloadShops(); } catch (e) { toast(errorText(e), 'error'); }
  };
  if (!shops) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  const counts = shops.reduce((c, s) => ({ ...c, [statusOf(s)]: (c[statusOf(s)] || 0) + 1 }), {});
  const list = shops.filter(s => (filter === 'all' || statusOf(s) === filter) && (!query || s.name.includes(query) || (s.owner_email || '').includes(query) || (s.phone || '').includes(query)));
  const current = open && shops.find(s => s.id === open);

  return <div className="stack">
    <div className="stats">
      <Stat icon={Store} label="كل الصالونات" value={num(shops.length)} />
      <Stat icon={Crown} tone="green" label="مشتركون" value={num(counts.paid || 0)} />
      <Stat tone="blue" label="في التجربة" value={num(counts.trial || 0)} onClick={() => setFilter('trial')} />
      <Stat tone="red" label="انتهت تجربتهم" value={num(counts.expired || 0)} onClick={() => setFilter('expired')} />
    </div>
    <div className="page-head"><Segmented size="sm" items={[{ id: 'all', label: 'الكل' }, { id: 'trial', label: 'تجربة' }, { id: 'expired', label: 'منتهي' }, { id: 'paid', label: 'مشترك' }]} value={filter} onChange={setFilter} /><Button variant="ghost" icon={RefreshCw} onClick={load} /></div>
    <SearchBox value={query} onChange={setQuery} placeholder="اسم، بريد، رقم" />
    {list.length ? <div className="list">{list.map(s => {
      const [label, tone] = labels[statusOf(s)];
      const left = Math.ceil((new Date(statusOf(s) === 'paid' ? s.paid_until : s.trial_ends_at) - Date.now()) / 86400000);
      const addons = [s.wa_addon && 'واتساب', s.ai_addon && 'AI'].filter(Boolean).join(' + ');
      return <Row key={s.id} title={s.name} subtitle={`${s.owner_email} · ${num(s.records)} سجل${left > 0 ? ` · باقٍ ${num(left)} يوم` : ''}${addons ? ` · ${addons}` : ''}`} trailing={<Badge tone={tone}>{label}</Badge>} onClick={() => setOpen(s.id)} />;
    })}</div> : <Empty icon={Store} title="لا نتائج" />}

    {current && <Sheet title={current.name} subtitle={current.owner_email} onClose={() => setOpen(null)}>
      <div className="stack">
        <div className="list">
          <Row title="الحالة" trailing={<Badge tone={labels[statusOf(current)][1]}>{labels[statusOf(current)][0]}</Badge>} />
          <Row title="تاريخ التسجيل" trailing={new Date(current.created_at).toLocaleDateString(LOCALE)} />
          <Row title="نهاية التجربة" trailing={new Date(current.trial_ends_at).toLocaleDateString(LOCALE)} />
          {current.paid_until && <Row title="مدفوع حتى" trailing={new Date(current.paid_until).toLocaleDateString(LOCALE)} />}
          <Row title="آخر نشاط" trailing={current.last_activity ? new Date(current.last_activity).toLocaleDateString(LOCALE) : '—'} />
          <Row title="حجم الاستخدام" trailing={`${num(current.records)} سجل`} />
        </div>
        {current.phone && <Button variant="secondary" icon={MessageCircle} block onClick={() => openExternal(whatsappLink(current.phone, `مرحباً ${current.name} 👋 كيف وجدتم تجربة تطبيق مِقص؟`))}>تواصل مع الصالون</Button>}
        <Field label="تفعيل اشتراك">
          <div className="action-grid">
            <Button icon={Check} onClick={() => act(() => api.admin.setLicense(current.id, 'monthly', addMonths(1)), 'تم التفعيل شهراً')}>شهر</Button>
            <Button icon={Check} onClick={() => act(() => api.admin.setLicense(current.id, 'yearly', addMonths(12)), 'تم التفعيل سنة')}>سنة</Button>
            <Button icon={Crown} onClick={() => act(() => api.admin.setLicense(current.id, 'lifetime', '2999-12-31T00:00:00Z'), 'تم التفعيل مدى الحياة')}>مدى الحياة</Button>
          </div>
        </Field>
        <div className="action-grid">
          <Button variant="secondary" icon={CalendarPlus} onClick={() => act(() => api.admin.extendTrial(current.id, 7), 'تم تمديد التجربة ٧ أيام')}>تمديد التجربة ٧ أيام</Button>
          <Button variant="danger-ghost" icon={Ban} onClick={() => act(() => api.admin.setLicense(current.id, 'suspended', null), 'تم الإيقاف')}>إيقاف</Button>
        </div>
        <Addons shopId={current.id} onSaved={() => act(async () => {}, 'تم حفظ الإضافات')} />
      </div>
    </Sheet>}
  </div>;
}

// الإضافات المدفوعة لكل صالون: لا يراها صاحب الصالون ولا يستطيع تعديلها.
function Addons({ shopId, onSaved }) {
  const [v, setV] = useState(null);
  const [initialProvider, setInitialProvider] = useState('anthropic');
  const [error, setError] = useState('');
  useEffect(() => {
    setV(null);
    api.admin.integration(shopId).then(row => {
      setInitialProvider(row.ai_provider || 'anthropic');
      setV({
      waAddon: row.wa_addon, aiAddon: row.ai_addon, aiProvider: row.ai_provider || 'anthropic', phoneNumberId: row.wa_phone_number_id, token: '', aiKey: '',
      hasToken: row.has_token, hasAiKey: row.has_ai_key, clearToken: false, clearAiKey: false,
      });
    }).catch(e => setError(errorText(e)));
  }, [shopId]);
  const save = async () => {
    setError('');
    try { await api.admin.setIntegration(shopId, v); onSaved(); } catch (e) { setError(errorText(e)); }
  };
  if (!v) return error ? <Alert>{error}</Alert> : <div className="loader" />;
  return <Section title="الإضافات المدفوعة">
    <div className="stack">
      <Toggle checked={v.waAddon} onChange={on => setV({ ...v, waAddon: on, aiAddon: on && v.aiAddon })} label="واتساب الذكي" hint="تذكيرات تلقائية + ردود 1/2 + تقرير يومي" />
      {v.waAddon && <>
        <Field label="Phone Number ID (اختياري)" hint="فارغ = يُرسل من رقم المنصة. ضعه فقط إذا ربطت رقم الصالون الخاص.">
          <input dir="ltr" value={v.phoneNumberId} onChange={e => setV({ ...v, phoneNumberId: e.target.value.trim() })} />
        </Field>
        {v.phoneNumberId && <Field label="Access Token لرقم الصالون" hint={v.hasToken ? 'محفوظ — اتركه فارغاً لعدم التغيير' : 'يُحفظ في الخادم ولا يظهر مجدداً'}>
          <input dir="ltr" type="password" autoComplete="off" value={v.token} onChange={e => setV({ ...v, token: e.target.value.trim() })} />
        </Field>}
        <Toggle checked={v.aiAddon} onChange={on => setV({ ...v, aiAddon: on })} label="المساعد الذكي (AI)" hint="يرد ويحجز في واتساب 24/7" />
        {v.aiAddon && <Field label="مزوّد الذكاء الاصطناعي">
          <Segmented items={[{ id: 'anthropic', label: 'Claude' }, { id: 'openai', label: 'OpenAI' }]} value={v.aiProvider} onChange={aiProvider => setV({ ...v, aiProvider })} />
        </Field>}
        {v.aiAddon && <Field label={v.aiProvider === 'openai' ? 'مفتاح OpenAI الخاص بالصالون' : 'مفتاح Anthropic الخاص بالصالون'}
          hint={v.hasAiKey && v.aiProvider === initialProvider ? 'محفوظ — اتركه فارغاً لعدم التغيير' : 'فارغ = يُستخدم مفتاح المنصة إن وُجد'}>
          <input dir="ltr" type="password" autoComplete="off" placeholder={v.aiProvider === 'openai' ? 'sk-proj-...' : 'sk-ant-...'} value={v.aiKey} onChange={e => setV({ ...v, aiKey: e.target.value.trim() })} />
        </Field>}
        {v.aiAddon && v.hasAiKey && <Toggle checked={v.clearAiKey} onChange={on => setV({ ...v, clearAiKey: on })} label="حذف المفتاح المحفوظ" />}
      </>}
      <Alert>{error}</Alert>
      <Button icon={Bot} block onClick={save}>حفظ الإضافات</Button>
    </div>
  </Section>;
}
