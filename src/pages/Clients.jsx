import React, { useEffect, useMemo, useState } from 'react';
import {
  Award, CalendarCheck, CalendarPlus, Camera, Check, Contact, FileUp, FlaskConical, Image, MessageCircle, Package, Pencil, Phone, ShieldAlert, Star, Trash2, UserPlus, UsersRound, Wallet,
} from 'lucide-react';
import { CLIENT_SOURCES, sourceLabel, PHONE_ERROR, validPhone, appointmentTotal, dateLabel, importClients, localISO, money, num, phoneDigits, samePhone, serviceNames, statusText, uid, whatsappLink } from '../data.js';
import { clientStats, loyaltyPoints, noShowRisk } from '../smart.js';
import { Alert, Avatar, Badge, Button, Chips, Confirm, Empty, Field, Row, SearchBox, Section, Segmented, Sheet, Stat, Toggle, compressImage, openExternal, useApp } from '../ui.jsx';
import { contactsSupported, pickContacts, readClientsFile } from '../lib/importers.js';
import { BookingWizard } from './Appointments.jsx';
import { L } from '../i18n.js';

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
      <small className="muted">{num(data.clients.length)} {L('مسجّل', 'registered')}</small>
      <div className="row-buttons">
        <Button variant="ghost" icon={FileUp} onClick={() => setImporting(true)}>{L('استيراد', 'Import')}</Button>
        <Button icon={UserPlus} onClick={() => setForm({})}>{L('إضافة', 'Add')}</Button>
      </div>
    </div>
    <SearchBox value={query} onChange={setQuery} placeholder={L('ابحث بالاسم أو الرقم', 'Search by name or number')} />
    <Segmented size="sm" items={[{ id: 'all', label: L('الكل', 'All') }, { id: 'vip', label: 'VIP' }, { id: 'new', label: L('جدد', 'New') }]} value={filter} onChange={setFilter} />
    {list.length ? <div className="list">{list.map(c => <Row key={c.id}
      leading={<Avatar name={c.name} />}
      title={<>{c.name} {(c.tags || []).includes('VIP') && <Star size={14} className="gold" />}</>}
      subtitle={stats[c.id].lastVisit ? L(`آخر زيارة ${dateLabel(stats[c.id].lastVisit, { day: 'numeric', month: 'short' })} · ${num(stats[c.id].visits)} زيارات`, `Last visit ${dateLabel(stats[c.id].lastVisit, { day: 'numeric', month: 'short' })} · ${num(stats[c.id].visits)} ${stats[c.id].visits === 1 ? 'visit' : 'visits'}`) : L('لم يزر بعد', 'No visits yet')}
      onClick={() => setOpen(c.id)} />)}</div>
      : <Empty icon={UsersRound} title={q ? L('لا نتائج', 'No results') : L(`لا يوجد ${vocab.clients} بعد`, `No ${vocab.clients} yet`)} text={q ? L('جرّب اسماً أو رقماً آخر', 'Try another name or number') : L('أضف أول عميل أو استورد قائمتك من Excel', 'Add your first client or import your list from Excel')} />}

    {open && <ClientProfile clientId={open} onClose={() => setOpen(null)} onEdit={c => { setOpen(null); setForm(c); }} />}
    {form && <ClientForm client={form.id ? form : null} onClose={() => setForm(null)} onSaved={id => { setForm(null); setOpen(id); }} />}
    {importing && <ImportClients onClose={() => setImporting(false)} />}
  </div>;
}

export function ClientForm({ client, onClose, onSaved }) {
  const { data, upsert, toast, vocab, isManager, staffMember } = useApp();
  const women = data.settings.kind !== 'men';
  const [v, setV] = useState({ name: '', phone: '', birthday: '', notes: '', allergies: '', formula: '', address: '', photoConsent: false, tags: [], ...client });
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const set = key => e => setV({ ...v, [key]: e.target.value });

  const save = () => {
    if (!v.name.trim()) { setError(L('الاسم مطلوب', 'Name is required')); return; }
    if (!validPhone(v.phone)) { setError(PHONE_ERROR); return; }
    if (data.clients.some(c => c.id !== client?.id && samePhone(c.phone, v.phone))) { setError(L('الرقم مسجّل لعميل آخر', 'This number belongs to another client')); return; }
    const id = client?.id || uid();
    upsert('clients', { ...v, id, name: v.name.trim(), phone: v.phone.trim(), createdAt: client?.createdAt || localISO(), ...(!client && staffMember ? { staffId: staffMember.id } : {}) });
    toast(client ? L('تم الحفظ', 'Saved') : L('تمت الإضافة', 'Added'));
    onSaved(id);
  };

  return <Sheet title={client ? L('تعديل البيانات', 'Edit details') : vocab.newClient} onClose={onClose} footer={<>
    {client && isManager && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>{L('حذف العميل', 'Delete client')}</Button>}
    <div className="spacer" /><Button icon={Check} onClick={save}>{L('حفظ', 'Save')}</Button>
  </>}>
    <div className="stack">
      <Field label={L('الاسم', 'Name')} required><input autoFocus value={v.name} onChange={set('name')} /></Field>
      <Field label={L('رقم الهاتف', 'Phone number')} required><input type="tel" dir="ltr" value={v.phone} onChange={set('phone')} placeholder="5555 1234" /></Field>
      <Field label={L('كيف عرفنا؟', 'How did they find us?')} hint={L('يظهر في التقارير: أي قناة تجلب عملاء أكثر', 'Shown in reports: which channel brings the most clients')}><Chips items={CLIENT_SOURCES.filter(s => !['online', 'whatsapp'].includes(s.id) || s.id === v.source)} value={v.source || ''} onChange={source => setV({ ...v, source })} /></Field>
      <Field label={L('لغة رسائل واتساب', 'WhatsApp message language')} hint={L('التذكيرات والعروض والمساعد الذكي يكلّمونه بهذه اللغة', 'Reminders, offers and the AI assistant talk to this client in this language')}>
        <Segmented items={[{ id: 'ar', label: 'العربية' }, { id: 'en', label: 'English' }]} value={v.lang === 'en' ? 'en' : 'ar'} onChange={lang => setV({ ...v, lang })} />
      </Field>
      <Field label={L('تاريخ الميلاد', 'Birthday')} hint={L('لإرسال تهنئة وهدية تلقائياً', 'To send birthday wishes and a gift automatically')}><input type="date" value={v.birthday} onChange={set('birthday')} /></Field>
      <Toggle checked={(v.tags || []).includes('VIP')} onChange={on => setV({ ...v, tags: on ? [...(v.tags || []), 'VIP'] : (v.tags || []).filter(t => t !== 'VIP') })} label={L('عميل مميز VIP', 'VIP client')} />
      <Field label={L('الحساسية والتنبيهات', 'Allergies & alerts')}><input value={v.allergies} onChange={set('allergies')} placeholder={L('مثال: حساسية من الأمونيا', 'e.g. allergic to ammonia')} /></Field>
      {women && <Field label={L('تركيبة الصبغة / الملف الفني', 'Color formula / technical notes')}><textarea rows="2" value={v.formula} onChange={set('formula')} placeholder={L('الرقم، الأوكسجين، المدة...', 'Shade, developer, timing...')} /></Field>}
      {women && <Field label={L('العنوان (للخدمة المنزلية)', 'Address (for home service)')}><input value={v.address} onChange={set('address')} /></Field>}
      <Field label={L('ملاحظات', 'Notes')}><textarea rows="2" value={v.notes} onChange={set('notes')} placeholder={L('التفضيلات...', 'Preferences...')} /></Field>
      <Toggle checked={v.photoConsent} onChange={on => setV({ ...v, photoConsent: on })} label={L('موافقة على التصوير', 'Photo consent')} hint={L('مطلوبة لحفظ صور قبل/بعد', 'Required to save before/after photos')} />
      <Alert>{error}</Alert>
    </div>
    {confirm && <DeleteClient client={client} onClose={() => setConfirm(false)} onDeleted={onClose} />}
  </Sheet>;
}

// حذف عميل: تبقى زياراته السابقة في التقارير، وتُلغى مواعيده القادمة ويُزال من قائمة الانتظار.
function DeleteClient({ client, onClose, onDeleted }) {
  const { data, setData, toast } = useApp();
  const today = localISO();
  const upcoming = data.appointments.filter(a => a.clientId === client.id && a.date >= today && ['pending', 'confirmed'].includes(a.status));
  return <Confirm title={L(`حذف ${client.name}؟`, `Delete ${client.name}?`)} danger confirmLabel={L('حذف', 'Delete')}
    text={upcoming.length
      ? L(`لديه ${num(upcoming.length)} موعد قادم سيُلغى. زياراته السابقة تبقى في التقارير.`, `They have ${num(upcoming.length)} upcoming ${upcoming.length === 1 ? 'appointment' : 'appointments'}, which will be cancelled. Past visits stay in reports.`)
      : L('زياراته السابقة تبقى في التقارير. لا يمكن التراجع.', 'Past visits stay in reports. This can’t be undone.')}
    onClose={onClose}
    onConfirm={() => {
      setData(prev => ({
        ...prev,
        clients: prev.clients.filter(c => c.id !== client.id),
        appointments: prev.appointments.map(a => (upcoming.some(u => u.id === a.id) ? { ...a, status: 'cancelled' } : a)),
        waitlist: prev.waitlist.filter(w => w.clientId !== client.id),
      }));
      toast(L('تم حذف العميل', 'Client deleted'));
      onDeleted?.();
    }} />;
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
      toast(L('تم حفظ الصورة', 'Photo saved'));
    } catch { toast(L('تعذر قراءة الصورة', 'Couldn’t read the image'), 'error'); }
  };

  if (booking) return <BookingWizard initial={{ clientId: client.id }} onClose={() => setBooking(false)} onDone={() => { setBooking(false); toast(L('تم الحجز', 'Booked')); }} />;

  return <Sheet title={client.name} subtitle={showPhone ? <span dir="ltr">{client.phone}</span> : null} onClose={onClose} size="lg"
    footer={<>
      <Button variant="secondary" icon={Pencil} onClick={() => onEdit(client)}>{L('تعديل', 'Edit')}</Button>
      {showPhone && <Button variant="ghost" icon={MessageCircle} onClick={() => openExternal(whatsappLink(client.phone))}>{L('واتساب', 'Whats')}</Button>}
      <div className="spacer" />
      <Button icon={CalendarPlus} onClick={() => setBooking(true)}>{L('حجز', 'Book')}</Button>
    </>}>
    <div className="stack">
      <div className="profile-head">
        <Avatar name={client.name} size="xl" />
        <div className="chips chips-center">
          {(client.tags || []).includes('VIP') && <Badge tone="orange">VIP</Badge>}
          {client.source && <Badge tone="purple">{sourceLabel(client.source)}</Badge>}
          {risk.level !== 'low' && <Badge tone="red">{risk.label}</Badge>}
          {stats.avgInterval && <Badge tone="blue">{L(`يزور كل ${num(stats.avgInterval)} يوم`, `Visits every ${num(stats.avgInterval)} ${stats.avgInterval === 1 ? 'day' : 'days'}`)}</Badge>}
        </div>
        <div className="row-buttons center">
          {showPhone && <button type="button" className="link" onClick={() => openExternal(`tel:${phoneDigits(client.phone)}`)}><Phone size={14} /> {L('اتصال', 'Call')}</button>}
        </div>
      </div>
      {client.allergies && <Alert icon={ShieldAlert}>{client.allergies}</Alert>}
      <Segmented size="sm" items={[{ id: 'overview', label: L('نظرة', 'Overview') }, { id: 'history', label: L('السجل', 'History') }, { id: 'photos', label: L('الصور', 'Photos') }]} value={tab} onChange={setTab} />

      {tab === 'overview' && <>
        <div className="stats stats-3">
          <Stat icon={CalendarCheck} label={L('زيارات', 'Visits')} value={num(stats.visits)} />
          {role !== 'staff' && <Stat icon={Wallet} label={L('إجمالي الإنفاق', 'Total spent')} tone="green" value={money(stats.spent)} />}
          <Stat icon={Award} label={L('نقاط الولاء', 'Loyalty points')} tone="purple" value={num(points)} />
        </div>
        <div className="list">
          {stats.upcoming && <Row tone="blue" title={L('الموعد القادم', 'Next appointment')} subtitle={`${dateLabel(stats.upcoming.date)} · ${serviceNames(stats.upcoming)}`} />}
          {stats.nextDue && !stats.upcoming && <Row title={L('موعد عودته المتوقع', 'Expected next visit')} subtitle={dateLabel(stats.nextDue)} />}
          {client.formula && <Row leading={<FlaskConical size={18} />} title={L('الملف الفني', 'Technical notes')} subtitle={client.formula} />}
          {client.notes && <Row title={L('ملاحظات', 'Notes')} subtitle={client.notes} />}
          {client.birthday && <Row title={L('تاريخ الميلاد', 'Birthday')} subtitle={dateLabel(client.birthday, { day: 'numeric', month: 'long' })} />}
          {packages.map(p => <Row key={p.id} leading={<Package size={18} />} title={p.name} subtitle={`${L(`استخدم ${num(p.used)} من ${num(p.total)}`, `Used ${num(p.used)} of ${num(p.total)}`)}${p.expiresAt ? ` · ${L('حتى', 'until')} ${dateLabel(p.expiresAt, { day: 'numeric', month: 'short' })}` : ''}`} trailing={<Badge tone={p.used < p.total ? 'green' : 'muted'}>{p.used < p.total ? L(`${p.total - p.used} متبقية`, `${p.total - p.used} left`) : L('منتهية', 'Used up')}</Badge>} />)}
        </div>
      </>}

      {tab === 'history' && (history.length ? <div className="list">{history.map(a => <Row key={a.id} title={serviceNames(a)} subtitle={`${dateLabel(a.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${statusText[a.status]}`} trailing={<strong>{money(appointmentTotal(a))}</strong>} />)}</div> : <Empty icon={CalendarPlus} title={L('لا زيارات بعد', 'No visits yet')} />)}

      {tab === 'photos' && (hidePhotos ? <Empty icon={Image} title={L('الصور مخفية', 'Photos hidden')} text={L('صور العملاء متاحة للإدارة فقط', 'Client photos are available to management only')} />
        : !client.photoConsent ? <Empty icon={Camera} title={L('لا توجد موافقة على التصوير', 'No photo consent')} text={L('فعّل «موافقة على التصوير» من تعديل البيانات', 'Turn on “Photo consent” in Edit details')} />
          : <>
            <div className="row-buttons">
              <label className="btn btn-secondary"><Camera size={18} /><span>{L('صورة قبل', 'Before photo')}</span><input hidden type="file" accept="image/*" capture="environment" onChange={e => addPhoto(e, 'before')} /></label>
              <label className="btn btn-secondary"><Camera size={18} /><span>{L('صورة بعد', 'After photo')}</span><input hidden type="file" accept="image/*" capture="environment" onChange={e => addPhoto(e, 'after')} /></label>
            </div>
            {photos.length ? <div className="photo-grid">{photos.slice().reverse().map(p => <figure key={p.id}><img src={p.dataUrl} alt={p.kind === 'before' ? L('قبل', 'Before') : L('بعد', 'After')} /><figcaption>{p.kind === 'before' ? L('قبل', 'Before') : L('بعد', 'After')} · {dateLabel(p.at, { day: 'numeric', month: 'short' })}{role !== 'staff' && <button type="button" onClick={() => remove('photos', p.id)} aria-label={L('حذف', 'Delete')}><Trash2 size={14} /></button>}</figcaption></figure>)}</div>
              : <Empty icon={Image} title={L('لا صور بعد', 'No photos yet')} />}
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
      const list = (await pickContacts()).filter(c => validPhone(c.phone));
      const fresh = list.map((c, i) => (data.clients.some(x => samePhone(x.phone, c.phone)) ? null : i)).filter(i => i !== null);
      setContacts(list); setPicked(new Set(fresh));
      if (!list.length) setError(L('لا توجد جهات اتصال بأرقام هواتف', 'No contacts with phone numbers'));
    } catch (e) { setError(e?.message || L('تعذر فتح جهات الاتصال', 'Couldn’t open contacts')); }
    setBusy(false);
  };
  const fromFile = async file => {
    setError(''); setContacts(null);
    try { setText(await readClientsFile(file)); } catch (e) { setError(e?.message || L('تعذرت قراءة الملف', 'Couldn’t read the file')); }
  };
  const shownContacts = (contacts || []).map((c, i) => ({ ...c, i })).filter(c => !search || c.name.includes(search) || phoneDigits(c.phone).includes(phoneDigits(search) || '@'));
  return <Sheet title={L('استيراد العملاء', 'Import clients')} subtitle={L('من جهات الاتصال، Excel، Word، أو نص منسوخ', 'From contacts, Excel, Word, or pasted text')} onClose={onClose} size="lg"
    footer={<Button block size="lg" icon={Check} disabled={!result?.added.length} onClick={() => {
      setData(prev => ({ ...prev, clients: [...prev.clients, ...owned(result.added)] }));
      toast(L(`تم استيراد ${num(result.added.length)} عميل`, `Imported ${num(result.added.length)} ${result.added.length === 1 ? 'client' : 'clients'}`)); onClose();
    }}>{result?.added.length ? L(`استيراد ${num(result.added.length)}`, `Import ${num(result.added.length)}`) : L('استيراد', 'Import')}</Button>}>
    <div className="stack">
      <div className="import-sources">
        {contactsSupported && <button type="button" className="import-source" onClick={fromContacts} disabled={busy}><Contact size={26} /><strong>{L('جهات الاتصال', 'Contacts')}</strong><small>{L('اختر من هاتفك', 'Pick from your phone')}</small></button>}
        <label className="import-source"><FileUp size={26} /><strong>{L('ملف', 'File')}</strong><small>Excel · Word · vCard · CSV</small>
          <input hidden type="file" accept=".xlsx,.docx,.vcf,.csv,.txt,.xls,.doc,text/csv,text/plain,text/vcard" onChange={e => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ''; }} />
        </label>
      </div>
      <Alert>{error}</Alert>
      {contacts ? <Section title={L(`جهات الاتصال (${num(picked.size)} مختار)`, `Contacts (${num(picked.size)} selected)`)} action={<Button size="sm" variant="ghost" onClick={() => { setContacts(null); setPicked(new Set()); }}>{L('رجوع', 'Back')}</Button>}>
        <SearchBox value={search} onChange={setSearch} placeholder={L('ابحث بالاسم أو الرقم', 'Search by name or number')} />
        <div className="row-buttons">
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shownContacts.map(c => c.i)))}>{L('تحديد الكل', 'Select all')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>{L('إلغاء التحديد', 'Clear selection')}</Button>
        </div>
        <div className="list contact-list">{shownContacts.slice(0, 300).map(c => {
          const exists = data.clients.some(x => samePhone(x.phone, c.phone));
          return <label key={c.i} className={`contact-row ${exists ? 'muted' : ''}`}>
            <input type="checkbox" checked={picked.has(c.i)} disabled={exists} onChange={e => { const next = new Set(picked); if (e.target.checked) next.add(c.i); else next.delete(c.i); setPicked(next); }} />
            <span><strong>{c.name}</strong><small dir="ltr">{c.phone}</small></span>
            {exists && <Badge tone="muted">{L('مسجّل', 'Registered')}</Badge>}
          </label>;
        })}</div>
      </Section>
        : <Field label={L('أو الصق القائمة هنا', 'Or paste your list here')} hint={L('كل سطر عميل: الاسم والرقم (بفاصلة أو مسافة، بأي ترتيب)', 'One client per line: name and number (comma or space, any order)')}><textarea rows="6" dir="auto" value={text} onChange={e => setText(e.target.value)} placeholder={L('أحمد محمد 55512345\nسارة علي، 66698765\n+974 3334 4556 خالد', 'Ahmed Mohammed 55512345\nSara Ali, 66698765\n+974 3334 4556 Khalid')} /></Field>}
      {result && <Alert tone={result.added.length ? 'green' : 'orange'} icon={Check}>{num(result.added.length)} {L('جديد', 'new')}{result.skipped ? L(` · ${num(result.skipped)} مكرر أو ناقص`, ` · ${num(result.skipped)} duplicate or incomplete`) : ''}</Alert>}
    </div>
  </Sheet>;
}
