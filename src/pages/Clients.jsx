import React, { useEffect, useMemo, useState } from 'react';
import {
  Award, CalendarPlus, Camera, Check, Contact, FileUp, FlaskConical, Image, MessageCircle, Package, Phone, ShieldAlert, Star, Trash2, UserPlus, UsersRound,
} from 'lucide-react';
import { appointmentTotal, dateLabel, importClients, localISO, money, num, phoneDigits, samePhone, serviceNames, statusText, uid, whatsappLink } from '../data.js';
import { clientStats, loyaltyPoints, noShowRisk } from '../smart.js';
import { Alert, Avatar, Badge, Button, Confirm, Empty, Field, Row, SearchBox, Section, Segmented, Sheet, Stat, Toggle, compressImage, openExternal, useApp } from '../ui.jsx';
import { contactsSupported, pickContacts, readClientsFile } from '../lib/importers.js';
import { BookingWizard } from './Appointments.jsx';

export default function Clients() {
  const { data, intent, setIntent, vocab, role, staffMember } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (intent?.create) setForm({});
    if (intent?.open) setOpen(intent.open);
    if (intent) setIntent(null);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, clientStats(c.id, data.appointments)])), [data.clients, data.appointments]);
  const q = query.trim();
  // الحلاق يرى عملاءه فقط (من خدمهم أو لديهم موعد معه).
  const mine = role === 'staff' && staffMember ? new Set(data.clients.filter(c => c.staffId === staffMember.id).map(c => c.id).concat(data.appointments.filter(a => a.staffId === staffMember.id || (a.items || []).some(i => i.staffId === staffMember.id)).map(a => a.clientId))) : null;
  const list = data.clients
    .filter(c => !mine || mine.has(c.id))
    .filter(c => !q || c.name.includes(q) || phoneDigits(c.phone).includes(phoneDigits(q) || '@'))
    .filter(c => filter === 'all' || (filter === 'vip' && ((c.tags || []).includes('VIP') || stats[c.id].spent >= 1000)) || (filter === 'new' && stats[c.id].visits <= 1))
    .sort((a, b) => (stats[b.id].lastVisit || '').localeCompare(stats[a.id].lastVisit || '') || a.name.localeCompare(b.name));

  return <div className="stack">
    <div className="page-head">
      <small className="muted">{num(data.clients.length)} مسجّل</small>
      <div className="row-buttons">
        <Button variant="ghost" icon={FileUp} onClick={() => setImporting(true)}>استيراد</Button>
        <Button icon={UserPlus} onClick={() => setForm({})}>إضافة</Button>
      </div>
    </div>
    <SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم أو الرقم" />
    <Segmented size="sm" items={[{ id: 'all', label: 'الكل' }, { id: 'vip', label: 'VIP' }, { id: 'new', label: 'جدد' }]} value={filter} onChange={setFilter} />
    {list.length ? <div className="list">{list.map(c => <Row key={c.id}
      leading={<Avatar name={c.name} />}
      title={<>{c.name} {(c.tags || []).includes('VIP') && <Star size={14} className="gold" />}</>}
      subtitle={stats[c.id].lastVisit ? `آخر زيارة ${dateLabel(stats[c.id].lastVisit, { day: 'numeric', month: 'short' })} · ${num(stats[c.id].visits)} زيارات` : 'لم يزر بعد'}
      onClick={() => setOpen(c.id)} />)}</div>
      : <Empty icon={UsersRound} title={q ? 'لا نتائج' : `لا يوجد ${vocab.clients} بعد`} text={q ? 'جرّب اسماً أو رقماً آخر' : 'أضف أول عميل أو استورد قائمتك من Excel'} />}

    {open && <ClientProfile clientId={open} onClose={() => setOpen(null)} onEdit={c => { setOpen(null); setForm(c); }} />}
    {form && <ClientForm client={form.id ? form : null} onClose={() => setForm(null)} onSaved={id => { setForm(null); setOpen(id); }} />}
    {importing && <ImportClients onClose={() => setImporting(false)} />}
  </div>;
}

export function ClientForm({ client, onClose, onSaved }) {
  const { data, upsert, remove, toast, vocab, isManager, staffMember } = useApp();
  const women = data.settings.kind !== 'men';
  const [v, setV] = useState({ name: '', phone: '', birthday: '', notes: '', allergies: '', formula: '', address: '', photoConsent: false, tags: [], ...client });
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const set = key => e => setV({ ...v, [key]: e.target.value });

  const save = () => {
    if (!v.name.trim() || phoneDigits(v.phone).length < 7) { setError('الاسم ورقم الهاتف مطلوبان'); return; }
    if (data.clients.some(c => c.id !== client?.id && samePhone(c.phone, v.phone))) { setError('الرقم مسجّل لعميل آخر'); return; }
    const id = client?.id || uid();
    upsert('clients', { ...v, id, name: v.name.trim(), phone: v.phone.trim(), createdAt: client?.createdAt || localISO(), ...(!client && staffMember ? { staffId: staffMember.id } : {}) });
    toast(client ? 'تم الحفظ' : 'تمت الإضافة');
    onSaved(id);
  };

  return <Sheet title={client ? 'تعديل البيانات' : vocab.newClient} onClose={onClose} footer={<>
    {client && isManager && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>حذف</Button>}
    <div className="spacer" /><Button icon={Check} onClick={save}>حفظ</Button>
  </>}>
    <div className="stack">
      <Field label="الاسم" required><input autoFocus value={v.name} onChange={set('name')} /></Field>
      <Field label="رقم الهاتف" required><input type="tel" dir="ltr" value={v.phone} onChange={set('phone')} placeholder="5555 1234" /></Field>
      <Field label="تاريخ الميلاد" hint="لإرسال تهنئة وهدية تلقائياً"><input type="date" value={v.birthday} onChange={set('birthday')} /></Field>
      <Toggle checked={(v.tags || []).includes('VIP')} onChange={on => setV({ ...v, tags: on ? [...(v.tags || []), 'VIP'] : (v.tags || []).filter(t => t !== 'VIP') })} label="عميل مميز VIP" />
      <Field label="الحساسية والتنبيهات"><input value={v.allergies} onChange={set('allergies')} placeholder="مثال: حساسية من الأمونيا" /></Field>
      {women && <Field label="تركيبة الصبغة / الملف الفني"><textarea rows="2" value={v.formula} onChange={set('formula')} placeholder="الرقم، الأوكسجين، المدة..." /></Field>}
      {women && <Field label="العنوان (للخدمة المنزلية)"><input value={v.address} onChange={set('address')} /></Field>}
      <Field label="ملاحظات"><textarea rows="2" value={v.notes} onChange={set('notes')} placeholder="التفضيلات..." /></Field>
      <Toggle checked={v.photoConsent} onChange={on => setV({ ...v, photoConsent: on })} label="موافقة على التصوير" hint="مطلوبة لحفظ صور قبل/بعد" />
      <Alert>{error}</Alert>
    </div>
    {confirm && <Confirm title="حذف العميل؟" text="ستبقى مواعيده السابقة في التقارير." danger confirmLabel="حذف" onClose={() => setConfirm(false)} onConfirm={() => { remove('clients', client.id); toast('تم الحذف'); onClose(); }} />}
  </Sheet>;
}

export function ClientProfile({ clientId, onClose, onEdit }) {
  const { data, role, upsert, remove, toast } = useApp();
  const [tab, setTab] = useState('overview');
  const [booking, setBooking] = useState(false);
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return null;
  const stats = clientStats(client.id, data.appointments);
  const risk = noShowRisk(client.id, data.appointments);
  const points = loyaltyPoints(client.id, data.appointments, data.settings.loyaltyPer);
  const history = data.appointments.filter(a => a.clientId === client.id).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const packages = data.clientPackages.filter(p => p.clientId === client.id);
  const photos = data.photos.filter(p => p.clientId === client.id);
  const hidePhotos = role === 'staff' && data.settings.hideClientPhotosFromStaff;
  const showPhone = role !== 'staff';

  const addPhoto = async (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      upsert('photos', { id: uid(), clientId: client.id, kind, dataUrl, at: localISO() });
      toast('تم حفظ الصورة');
    } catch { toast('تعذر قراءة الصورة', 'error'); }
  };

  if (booking) return <BookingWizard initial={{ clientId: client.id }} onClose={() => setBooking(false)} onDone={() => { setBooking(false); toast('تم الحجز'); }} />;

  return <Sheet title={client.name} subtitle={showPhone ? <span dir="ltr">{client.phone}</span> : null} onClose={onClose} size="lg"
    footer={<>
      {showPhone && <Button variant="ghost" icon={Phone} onClick={() => openExternal(`tel:${phoneDigits(client.phone)}`)}>اتصال</Button>}
      {showPhone && <Button variant="ghost" icon={MessageCircle} onClick={() => openExternal(whatsappLink(client.phone))}>واتساب</Button>}
      <div className="spacer" />
      <Button icon={CalendarPlus} onClick={() => setBooking(true)}>حجز</Button>
    </>}>
    <div className="stack">
      <div className="profile-head">
        <Avatar name={client.name} size="xl" />
        <div className="chips chips-center">
          {(client.tags || []).includes('VIP') && <Badge tone="orange">VIP</Badge>}
          {risk.level !== 'low' && <Badge tone="red">{risk.label}</Badge>}
          {stats.avgInterval && <Badge tone="blue">يزور كل {num(stats.avgInterval)} يوم</Badge>}
        </div>
        <button type="button" className="link" onClick={() => onEdit(client)}>تعديل البيانات</button>
      </div>
      {client.allergies && <Alert icon={ShieldAlert}>{client.allergies}</Alert>}
      <Segmented size="sm" items={[{ id: 'overview', label: 'نظرة' }, { id: 'history', label: 'السجل' }, { id: 'photos', label: 'الصور' }]} value={tab} onChange={setTab} />

      {tab === 'overview' && <>
        <div className="stats stats-3">
          <Stat label="زيارات" value={num(stats.visits)} />
          {role !== 'staff' && <Stat label="إجمالي الإنفاق" tone="green" value={money(stats.spent)} />}
          <Stat icon={Award} label="نقاط الولاء" tone="purple" value={num(points)} />
        </div>
        <div className="list">
          {stats.upcoming && <Row tone="blue" title="الموعد القادم" subtitle={`${dateLabel(stats.upcoming.date)} · ${serviceNames(stats.upcoming)}`} />}
          {stats.nextDue && !stats.upcoming && <Row title="موعد عودته المتوقع" subtitle={dateLabel(stats.nextDue)} />}
          {client.formula && <Row leading={<FlaskConical size={18} />} title="الملف الفني" subtitle={client.formula} />}
          {client.notes && <Row title="ملاحظات" subtitle={client.notes} />}
          {client.birthday && <Row title="تاريخ الميلاد" subtitle={dateLabel(client.birthday, { day: 'numeric', month: 'long' })} />}
          {packages.map(p => <Row key={p.id} leading={<Package size={18} />} title={p.name} subtitle={`استخدم ${num(p.used)} من ${num(p.total)}${p.expiresAt ? ` · حتى ${dateLabel(p.expiresAt, { day: 'numeric', month: 'short' })}` : ''}`} trailing={<Badge tone={p.used < p.total ? 'green' : 'muted'}>{p.used < p.total ? `${p.total - p.used} متبقية` : 'منتهية'}</Badge>} />)}
        </div>
      </>}

      {tab === 'history' && (history.length ? <div className="list">{history.map(a => <Row key={a.id} title={serviceNames(a)} subtitle={`${dateLabel(a.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${statusText[a.status]}`} trailing={<strong>{money(appointmentTotal(a))}</strong>} />)}</div> : <Empty icon={CalendarPlus} title="لا زيارات بعد" />)}

      {tab === 'photos' && (hidePhotos ? <Empty icon={Image} title="الصور مخفية" text="صور العملاء متاحة للإدارة فقط" />
        : !client.photoConsent ? <Empty icon={Camera} title="لا توجد موافقة على التصوير" text="فعّل «موافقة على التصوير» من تعديل البيانات" />
          : <>
            <div className="row-buttons">
              <label className="btn btn-secondary"><Camera size={18} /><span>صورة قبل</span><input hidden type="file" accept="image/*" capture="environment" onChange={e => addPhoto(e, 'before')} /></label>
              <label className="btn btn-secondary"><Camera size={18} /><span>صورة بعد</span><input hidden type="file" accept="image/*" capture="environment" onChange={e => addPhoto(e, 'after')} /></label>
            </div>
            {photos.length ? <div className="photo-grid">{photos.slice().reverse().map(p => <figure key={p.id}><img src={p.dataUrl} alt={p.kind === 'before' ? 'قبل' : 'بعد'} /><figcaption>{p.kind === 'before' ? 'قبل' : 'بعد'} · {dateLabel(p.at, { day: 'numeric', month: 'short' })}{role !== 'staff' && <button type="button" onClick={() => remove('photos', p.id)} aria-label="حذف"><Trash2 size={14} /></button>}</figcaption></figure>)}</div>
              : <Empty icon={Image} title="لا صور بعد" />}
          </>)}
    </div>
  </Sheet>;
}

function ImportClients({ onClose }) {
  const { data, setData, toast, staffMember } = useApp();
  const [text, setText] = useState('');
  const [contacts, setContacts] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // جهات الاتصال المختارة تتحول لنفس صيغة النص «الاسم، الرقم».
  const source = contacts ? contacts.filter((_, i) => picked.has(i)).map(c => `"${c.name.replaceAll('"', '')}",${c.phone}`).join('\n') : text;
  const result = source.trim() ? importClients(source, data.clients) : null;
  const owned = list => (staffMember ? list.map(c => ({ ...c, staffId: staffMember.id })) : list);
  const fromContacts = async () => {
    setError(''); setBusy(true);
    try {
      const list = (await pickContacts()).filter(c => phoneDigits(c.phone).length >= 7);
      const fresh = list.map((c, i) => (data.clients.some(x => samePhone(x.phone, c.phone)) ? null : i)).filter(i => i !== null);
      setContacts(list); setPicked(new Set(fresh));
      if (!list.length) setError('لا توجد جهات اتصال بأرقام هواتف');
    } catch (e) { setError(e?.message || 'تعذر فتح جهات الاتصال'); }
    setBusy(false);
  };
  const fromFile = async file => {
    setError(''); setContacts(null);
    try { setText(await readClientsFile(file)); } catch (e) { setError(e?.message || 'تعذرت قراءة الملف'); }
  };
  const shownContacts = (contacts || []).map((c, i) => ({ ...c, i })).filter(c => !search || c.name.includes(search) || phoneDigits(c.phone).includes(phoneDigits(search) || '@'));
  return <Sheet title="استيراد العملاء" subtitle="من جهات الاتصال، Excel، Word، أو نص منسوخ" onClose={onClose} size="lg"
    footer={<Button block size="lg" icon={Check} disabled={!result?.added.length} onClick={() => {
      setData(prev => ({ ...prev, clients: [...prev.clients, ...owned(result.added)] }));
      toast(`تم استيراد ${num(result.added.length)} عميل`); onClose();
    }}>{result?.added.length ? `استيراد ${num(result.added.length)}` : 'استيراد'}</Button>}>
    <div className="stack">
      <div className="import-sources">
        {contactsSupported && <button type="button" className="import-source" onClick={fromContacts} disabled={busy}><Contact size={26} /><strong>جهات الاتصال</strong><small>اختر من هاتفك</small></button>}
        <label className="import-source"><FileUp size={26} /><strong>ملف</strong><small>Excel · Word · vCard · CSV</small>
          <input hidden type="file" accept=".xlsx,.docx,.vcf,.csv,.txt,.xls,.doc,text/csv,text/plain,text/vcard" onChange={e => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ''; }} />
        </label>
      </div>
      <Alert>{error}</Alert>
      {contacts ? <Section title={`جهات الاتصال (${num(picked.size)} مختار)`} action={<Button size="sm" variant="ghost" onClick={() => { setContacts(null); setPicked(new Set()); }}>رجوع</Button>}>
        <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الرقم" />
        <div className="row-buttons">
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shownContacts.map(c => c.i)))}>تحديد الكل</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>إلغاء التحديد</Button>
        </div>
        <div className="list contact-list">{shownContacts.slice(0, 300).map(c => {
          const exists = data.clients.some(x => samePhone(x.phone, c.phone));
          return <label key={c.i} className={`contact-row ${exists ? 'muted' : ''}`}>
            <input type="checkbox" checked={picked.has(c.i)} disabled={exists} onChange={e => { const next = new Set(picked); if (e.target.checked) next.add(c.i); else next.delete(c.i); setPicked(next); }} />
            <span><strong>{c.name}</strong><small dir="ltr">{c.phone}</small></span>
            {exists && <Badge tone="muted">مسجّل</Badge>}
          </label>;
        })}</div>
      </Section>
        : <Field label="أو الصق القائمة هنا" hint="كل سطر عميل: الاسم والرقم (بفاصلة أو مسافة، بأي ترتيب)"><textarea rows="6" dir="auto" value={text} onChange={e => setText(e.target.value)} placeholder={'أحمد محمد 55512345\nسارة علي، 66698765\n+974 3334 4556 خالد'} /></Field>}
      {result && <Alert tone={result.added.length ? 'green' : 'orange'} icon={Check}>{num(result.added.length)} جديد{result.skipped ? ` · ${num(result.skipped)} مكرر أو ناقص` : ''}</Alert>}
    </div>
  </Sheet>;
}
