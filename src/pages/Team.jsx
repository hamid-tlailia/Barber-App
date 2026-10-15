import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, MessageCircle, PauseCircle, PlayCircle, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { dateLabel, findDuplicate, isStaffOff, samePhone, localISO, money, num, roleText, uid, whatsappLink } from '../data.js';
import { commissions } from '../smart.js';
import { api, cloudEnabled, errorText, publicBase } from '../lib/sync.js';
import { L, isEn } from '../i18n.js';

const appLink = /localhost|capacitor:/.test(publicBase) ? '' : publicBase;
import { Alert, Avatar, Badge, Button, Chips, Confirm, Empty, Field, Row, Section, Segmented, Sheet, Toggle, openExternal, useApp, NumInput } from '../ui.jsx';

const ranges = [{ id: 'today', label: L('اليوم', 'Today') }, { id: 'week', label: L('الأسبوع', 'Week') }, { id: 'month', label: L('الشهر', 'Month') }, { id: 'lastMonth', label: L('الشهر الماضي', 'Last month') }];
const weekdays = isEn
  ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const nationalities = [
  ['قطري', 'Qatari'], ['مصري', 'Egyptian'], ['سوري', 'Syrian'], ['لبناني', 'Lebanese'], ['أردني', 'Jordanian'], ['فلسطيني', 'Palestinian'],
  ['مغربي', 'Moroccan'], ['تونسي', 'Tunisian'], ['جزائري', 'Algerian'], ['سوداني', 'Sudanese'], ['يمني', 'Yemeni'], ['عراقي', 'Iraqi'],
  ['هندي', 'Indian'], ['باكستاني', 'Pakistani'], ['بنغلاديشي', 'Bangladeshi'], ['سريلانكي', 'Sri Lankan'], ['نيبالي', 'Nepali'], ['فلبيني', 'Filipino'],
  ['إندونيسي', 'Indonesian'], ['تايلاندي', 'Thai'], ['تركي', 'Turkish'], ['إيراني', 'Iranian'], ['كيني', 'Kenyan'], ['إثيوبي', 'Ethiopian'],
].map(([ar, en]) => L(ar, en));
const colors = ['#b97932', '#557fa0', '#8870aa', '#328566', '#bb5c53', '#3f7f86'];

export default function Team() {
  const { data, vocab, upsert, toast } = useApp();
  const [range, setRange] = useState('month');
  const [form, setForm] = useState(null);
  const [accounts, setAccounts] = useState(false);
  const rows = commissions(data.staff, data.appointments, range);
  const totals = rows.reduce((t, r) => ({ revenue: t.revenue + r.revenue, commission: t.commission + r.commission, tips: t.tips + r.tips }), { revenue: 0, commission: 0, tips: 0 });

  const today = localISO();
  const activeStaff = data.staff.filter(s => s.active !== false);
  const availableToday = activeStaff.filter(s => !isStaffOff(s, today));
  // تبديل سريع لحضور الموظف اليوم: إجازة طارئة، أو حضور في يوم راحته.
  const toggleToday = member => {
    const off = isStaffOff(member, today);
    const leaves = (member.leaves || []).filter(d => d >= today && d !== today);
    const workDays = (member.workDays || []).filter(d => d >= today && d !== today);
    const weeklyOff = (member.daysOff || []).map(Number).includes(new Date(`${today}T12:00:00`).getDay());
    upsert('staff', { ...member, leaves: off ? leaves : [...leaves, today].sort(), workDays: off && weeklyOff ? [...workDays, today].sort() : workDays });
    toast(off ? L(`${member.name.split(' ')[0]} متاح اليوم`, `${member.name.split(' ')[0]} is available today`) : L(`${member.name.split(' ')[0]} غير متاح اليوم`, `${member.name.split(' ')[0]} is off today`));
  };

  return <div className="stack">
    <div className="page-head">
      <small className="muted">{L(`متاح اليوم ${num(availableToday.length)} من ${num(activeStaff.length)}`, `${num(availableToday.length)} of ${num(activeStaff.length)} available today`)}</small>
      <div className="row-buttons">
        {cloudEnabled && <Button variant="ghost" icon={KeyRound} onClick={() => setAccounts(true)}>{L('الحسابات', 'Accounts')}</Button>}
        <Button icon={UserPlus} onClick={() => setForm({})}>{L('إضافة', 'Add')}</Button>
      </div>
    </div>
    <Segmented size="sm" items={ranges} value={range} onChange={setRange} />
    {rows.length ? <div className="team-grid">{rows.map(({ member, revenue, services, commission, tips }) => <div role="button" tabIndex={0} key={member.id} className={`team-card ${member.active === false ? 'inactive' : ''}`} onClick={() => setForm(member)} onKeyDown={e => { if (e.key === 'Enter') setForm(member); }}>
      <Avatar name={member.name} size="xl" color={member.color} />
      <strong>{member.name}</strong>
      <small>{member.role}{member.nationality ? ` · ${member.nationality}` : ''}</small>
      {member.active !== false && <button type="button" className={`avail-toggle ${isStaffOff(member, today) ? 'off' : 'on'}`} onClick={e => { e.stopPropagation(); toggleToday(member); }}>
        <span className="avail-dot" />{isStaffOff(member, today) ? L('غير متاح اليوم', 'Off today') : L('متاح اليوم', 'Available today')}
      </button>}
      <div className="team-figures">
        <span><b>{num(services)}</b><small>{L('خدمة', services === 1 ? 'service' : 'services')}</small></span>
        <span><b>{money(revenue)}</b><small>{L('إيراد', 'revenue')}</small></span>
      </div>
      <Badge tone="green">{L('عمولة', 'Commission')} {money(commission)}{tips ? L(` + إكرامية ${money(tips)}`, ` + tips ${money(tips)}`) : ''}</Badge>
    </div>)}</div> : <Empty icon={UsersRound} title={L('لا يوجد فريق بعد', 'No team yet')} text={L(`أضف ${vocab.pro} لتوزيع المواعيد وحساب العمولات`, `Add a ${vocab.pro} to assign appointments and track commissions`)} />}
    {rows.length > 0 && <div className="list">
      <Row title={L('إجمالي الإيراد', 'Total revenue')} trailing={<strong>{money(totals.revenue)}</strong>} />
      <Row title={L('إجمالي العمولات المستحقة', 'Total commissions due')} trailing={<strong className="orange">{money(totals.commission)}</strong>} />
      {totals.tips > 0 && <Row title={L('الإكراميات', 'Tips')} trailing={<strong>{money(totals.tips)}</strong>} />}
    </div>}
    {form && <StaffForm member={form.id ? form : null} onClose={() => setForm(null)} />}
    {accounts && <Accounts onClose={() => setAccounts(false)} />}
  </div>;
}

function StaffForm({ member, onClose }) {
  const { upsert, remove, toast, vocab, data } = useApp();
  const [v, setV] = useState({ name: '', phone: '', role: vocab.pro, specialty: '', commission: 30, color: colors[data.staff.length % colors.length], active: true, ...member });
  const [confirm, setConfirm] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    const dup = findDuplicate(data.staff, { ...v, id: member?.id, name: v.name.trim() }, { phone: true });
    if (dup) { setError(samePhone(dup.phone, v.phone) ? L(`الرقم مسجّل للموظف ${dup.name}`, `This number belongs to ${dup.name}`) : L(`يوجد موظف بنفس الاسم «${dup.name}» — أضف ما يميّزه (اسم العائلة مثلاً)`, `A staff member named “${dup.name}” already exists — add something to tell them apart (e.g. a family name)`)); return; }
    upsert('staff', { ...v, id: member?.id || uid(), name: v.name.trim() }); toast(L('تم الحفظ', 'Saved')); onClose();
  };
  const set = (key, numeric) => e => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value });
  const today = localISO();
  const leaves = v.leaves || [];
  const setLeaves = list => setV({ ...v, leaves: [...new Set(list)].filter(d => d >= today).sort() });
  const offToday = leaves.includes(today);
  return <Sheet title={member ? member.name : L(`إضافة ${vocab.pro}`, `Add ${vocab.pro}`)} onClose={onClose} footer={<>
    {member && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>{L('حذف', 'Delete')}</Button>}
    <div className="spacer" />
    <Button icon={Check} disabled={!v.name.trim()} onClick={save}>{L('حفظ', 'Save')}</Button>
  </>}>
    <div className="stack">
      <Field label={L('الاسم', 'Name')} required><input autoFocus value={v.name} onChange={e => { setError(''); set('name')(e); }} /></Field>
      <Alert>{error}</Alert>
      <div className="grid-2">
        <Field label={L('المسمى', 'Title')}><input value={v.role} onChange={set('role')} /></Field>
        <Field label={L('الهاتف', 'Phone')}><input type="tel" dir="ltr" value={v.phone} onChange={set('phone')} /></Field>
      </div>
      <div className="grid-2">
        <Field label={L('التخصص', 'Specialty')}><input value={v.specialty} onChange={set('specialty')} /></Field>
        <Field label={L('الجنسية (اختياري)', 'Nationality (optional)')}><input list="staff-nationalities" value={v.nationality || ''} onChange={set('nationality')} />
          <datalist id="staff-nationalities">{nationalities.map(n => <option key={n} value={n} />)}</datalist></Field>
      </div>
      <Field label={L('نسبة العمولة ٪', 'Commission %')}><NumInput min="0" max="100" value={v.commission} onChange={set('commission', true)} /></Field>
      <Field label={L('اللون في الجدول', 'Calendar color')}><div className="color-row">{colors.map(c => <button type="button" key={c} style={{ background: c }} className={v.color === c ? 'active' : ''} onClick={() => setV({ ...v, color: c })} aria-label={c} />)}</div></Field>
      <Toggle checked={v.active !== false} onChange={on => setV({ ...v, active: on })} label={L('نشط ويقبل حجوزات', 'Active and accepting bookings')} />
      <Field label={L('أيام الراحة الأسبوعية', 'Weekly days off')}><Chips multiple items={weekdays.map((d, i) => ({ id: i, label: d }))} value={(v.daysOff || []).map(Number)} onChange={daysOff => setV({ ...v, daysOff: [...daysOff].sort() })} /></Field>
      <Toggle checked={offToday} onChange={on => setLeaves(on ? [...leaves, today] : leaves.filter(d => d !== today))} label={L('إجازة اليوم', 'Off today')} hint={L('لا تُعرض له مواعيد متاحة اليوم', 'No available times will be offered for them today')} />
      <Field label={L('الإجازات القادمة', 'Upcoming leave')}>
        <div className="stack">
          {leaves.filter(d => d >= today).length > 0 && <div className="chips">{leaves.filter(d => d >= today).map(d => <button type="button" key={d} className="chip active" onClick={() => setLeaves(leaves.filter(x => x !== d))} aria-label={L('إزالة', 'Remove')}>{dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })} ✕</button>)}</div>}
          <div className="row-buttons">
            <input type="date" min={today} value={leaveDate} onChange={e => setLeaveDate(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={!leaveDate || leaveDate < today} onClick={() => { setLeaves([...leaves, leaveDate]); setLeaveDate(''); }}>{L('إضافة', 'Add')}</Button>
          </div>
        </div>
      </Field>
      {member && cloudEnabled && <LinkedAccount staffId={member.id} />}
    </div>
    {confirm && <Confirm title={L('حذف من الفريق؟', 'Remove from team?')} text={L('الأفضل إيقافه (غير نشط) للحفاظ على التقارير.', 'Better to deactivate them to keep your reports intact.')} danger confirmLabel={L('حذف', 'Delete')} onClose={() => setConfirm(false)} onConfirm={() => { remove('staff', member.id); toast(L('تم الحذف', 'Deleted')); onClose(); }} />}
  </Sheet>;
}

function Accounts({ onClose }) {
  const { shop, data, toast } = useApp();
  const [members, setMembers] = useState(null);
  const [role, setRole] = useState('staff');
  const [staffId, setStaffId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const load = () => api.team(shop.id).then(setMembers).catch(e => setError(errorText(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const invite = async () => {
    try { setCode(await api.createInvite(shop.id, role, staffId)); } catch (e) { setError(errorText(e)); }
  };
  const inviteText = L(`انضم لفريق ${data.shopName} على تطبيق مِقص:\n1) افتح التطبيق${appLink ? ` (${appLink})` : ''} وأنشئ حساباً\n2) اختر «أنا موظف ولدي رمز دعوة» وأدخل: ${code}`, `Join the ${data.shopName} team on the Miqass app:\n1) Open the app${appLink ? ` (${appLink})` : ''} and create an account\n2) Choose “I’m a staff member with an invite code” and enter: ${code}`);
  const staffMember = data.staff.find(s => s.id === staffId);
  return <Sheet title={L('حسابات الفريق', 'Team accounts')} subtitle={L('كل موظف يدخل بحسابه وصلاحياته', 'Each staff member signs in with their own account and permissions')} onClose={onClose}>
    <div className="stack">
      <Section title={L('دعوة عضو جديد', 'Invite a new member')}>
        <Field label={L('الصلاحية', 'Role')}><Chips items={['manager', 'reception', 'staff'].map(id => ({ id, label: roleText[id] }))} value={role} onChange={setRole} /></Field>
        <small className="muted">{role === 'staff' ? L('يرى مواعيده فقط، بدون أرقام العملاء أو الإيرادات', 'Sees only their own appointments — no client numbers or revenue') : role === 'reception' ? L('الحجوزات والعملاء والدفع — بدون التقارير والإعدادات', 'Bookings, clients and payments — no reports or settings') : L('كل شيء عدا الاشتراك وربط واتساب', 'Everything except subscription and WhatsApp connection')}</small>
        {role === 'staff' && <Field label={L('مرتبط بـ', 'Linked to')}><select value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">{L('اختر من الفريق', 'Choose from the team')}</option>{data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {code ? <div className="invite-code"><strong dir="ltr">{code}</strong><small>{L(`صالح ${num(7)} أيام — لمرة واحدة`, `Valid for ${num(7)} days — single use`)}</small>
          <div className="row-buttons"><Button variant="secondary" icon={Copy} onClick={() => { navigator.clipboard?.writeText(code); toast(L('تم النسخ', 'Copied')); }}>{L('نسخ', 'Copy')}</Button>
            <Button icon={MessageCircle} onClick={() => openExternal(staffMember?.phone ? whatsappLink(staffMember.phone, inviteText) : `https://wa.me/?text=${encodeURIComponent(inviteText)}`)}>{L('إرسال', 'Send')}</Button></div>
        </div> : <Button block icon={KeyRound} disabled={role === 'staff' && !staffId} onClick={invite}>{L('إنشاء رمز دعوة', 'Create invite code')}</Button>}
      </Section>
      <Alert>{error}</Alert>
      <Section title={L('الأعضاء الحاليون', 'Current members')}>
        <div className="list">{(members || []).map(m => <Row key={m.user_id} leading={<Avatar name={m.display_name || m.email} />} title={m.display_name || m.email} subtitle={m.email}
          trailing={<span className="row-end">{m.suspended && <Badge tone="muted">{L('موقوف', 'Suspended')}</Badge>}<Badge tone={m.role === 'owner' ? 'orange' : 'blue'}>{roleText[m.role]}</Badge></span>} />)}</div>
        {(members || []).filter(m => m.role !== 'owner').map(m => <div key={m.user_id} className="member-actions"><small className="muted">{m.display_name || m.email}</small><MemberActions member={m} onDone={load} /></div>)}
      </Section>
    </div>
  </Sheet>;
}

// موظف ترك العمل: إيقاف حسابه مؤقتاً (يمكن إعادته) أو حذفه نهائياً.
function MemberActions({ member, onDone }) {
  const { shop, toast } = useApp();
  const [confirm, setConfirm] = useState(null);
  const run = async (fn, message) => { try { await fn(); toast(message); onDone(); } catch (e) { toast(errorText(e), 'error'); } };
  return <>
    <div className="row-buttons">
      {member.suspended
        ? <Button size="sm" variant="secondary" icon={PlayCircle} onClick={() => run(() => api.setMemberSuspended(shop.id, member.user_id, false), L('تمت إعادة التفعيل', 'Reactivated'))}>{L('إعادة تفعيل', 'Reactivate')}</Button>
        : <Button size="sm" variant="ghost" icon={PauseCircle} onClick={() => setConfirm('suspend')}>{L('إيقاف', 'Suspend')}</Button>}
      <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setConfirm('remove')}>{L('حذف', 'Delete')}</Button>
    </div>
    {confirm === 'suspend' && <Confirm title={L(`إيقاف حساب ${member.display_name || member.email}؟`, `Suspend ${member.display_name || member.email}’s account?`)} text={L('لن يستطيع الدخول للصالون، وتبقى كل عملياته في السجل. يمكنك إعادة تفعيله في أي وقت.', 'They won’t be able to sign in to the salon; all their activity stays in the records. You can reactivate them anytime.')} confirmLabel={L('إيقاف الحساب', 'Suspend account')}
      onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setMemberSuspended(shop.id, member.user_id, true), L('تم إيقاف الحساب', 'Account suspended'))} />}
    {confirm === 'remove' && <Confirm title={L('حذف الحساب نهائياً؟', 'Delete account permanently?')} text={L('يُزال من الصالون ولن يستطيع الدخول. للعودة يحتاج رمز دعوة جديداً.', 'They’ll be removed from the salon and can’t sign in. To return, they’ll need a new invite code.')} danger confirmLabel={L('حذف', 'Delete')}
      onClose={() => setConfirm(null)} onConfirm={() => run(() => api.removeMember(shop.id, member.user_id), L('تم حذف الحساب', 'Account deleted'))} />}
  </>;
}

// حساب الدخول المرتبط بهذا الموظف (إن وُجد) — من نافذة الموظف مباشرة.
function LinkedAccount({ staffId }) {
  const { shop } = useApp();
  const [account, setAccount] = useState(undefined);
  const load = () => api.team(shop.id).then(list => setAccount(list.find(m => m.staff_id === staffId) || null)).catch(() => setAccount(null));
  useEffect(() => { load(); }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!account) return null;
  return <Section title={L('حساب الدخول للتطبيق', 'App sign-in account')}>
    <Row leading={<Avatar name={account.display_name || account.email} />} title={account.display_name || account.email} subtitle={account.suspended ? L('موقوف — لا يستطيع الدخول', 'Suspended — cannot sign in') : account.email}
      trailing={account.suspended ? <Badge tone="muted">{L('موقوف', 'Suspended')}</Badge> : <Badge tone="green">{L('نشط', 'Active')}</Badge>} />
    <MemberActions member={account} onDone={load} />
  </Section>;
}
