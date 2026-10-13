import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, MessageCircle, PauseCircle, PlayCircle, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { money, num, roleText, uid, whatsappLink } from '../data.js';
import { commissions } from '../smart.js';
import { api, cloudEnabled, errorText, publicBase } from '../lib/sync.js';

const appLink = /localhost|capacitor:/.test(publicBase) ? '' : publicBase;
import { Alert, Avatar, Badge, Button, Chips, Confirm, Empty, Field, Row, Section, Segmented, Sheet, Toggle, openExternal, useApp, NumInput } from '../ui.jsx';

const ranges = [{ id: 'today', label: 'اليوم' }, { id: 'week', label: 'الأسبوع' }, { id: 'month', label: 'الشهر' }, { id: 'lastMonth', label: 'الشهر الماضي' }];
const colors = ['#b97932', '#557fa0', '#8870aa', '#328566', '#bb5c53', '#3f7f86'];

export default function Team() {
  const { data, vocab } = useApp();
  const [range, setRange] = useState('month');
  const [form, setForm] = useState(null);
  const [accounts, setAccounts] = useState(false);
  const rows = commissions(data.staff, data.appointments, range);
  const totals = rows.reduce((t, r) => ({ revenue: t.revenue + r.revenue, commission: t.commission + r.commission, tips: t.tips + r.tips }), { revenue: 0, commission: 0, tips: 0 });

  return <div className="stack">
    <div className="page-head">
      <small className="muted">{num(data.staff.filter(s => s.active !== false).length)} نشط</small>
      <div className="row-buttons">
        {cloudEnabled && <Button variant="ghost" icon={KeyRound} onClick={() => setAccounts(true)}>الحسابات</Button>}
        <Button icon={UserPlus} onClick={() => setForm({})}>إضافة</Button>
      </div>
    </div>
    <Segmented size="sm" items={ranges} value={range} onChange={setRange} />
    {rows.length ? <div className="team-grid">{rows.map(({ member, revenue, services, commission, tips }) => <button type="button" key={member.id} className={`team-card ${member.active === false ? 'inactive' : ''}`} onClick={() => setForm(member)}>
      <Avatar name={member.name} size="xl" color={member.color} />
      <strong>{member.name}</strong>
      <small>{member.role}</small>
      <div className="team-figures">
        <span><b>{num(services)}</b><small>خدمة</small></span>
        <span><b>{money(revenue)}</b><small>إيراد</small></span>
      </div>
      <Badge tone="green">عمولة {money(commission)}{tips ? ` + إكرامية ${money(tips)}` : ''}</Badge>
    </button>)}</div> : <Empty icon={UsersRound} title="لا يوجد فريق بعد" text={`أضف ${vocab.pro} لتوزيع المواعيد وحساب العمولات`} />}
    {rows.length > 0 && <div className="list">
      <Row title="إجمالي الإيراد" trailing={<strong>{money(totals.revenue)}</strong>} />
      <Row title="إجمالي العمولات المستحقة" trailing={<strong className="orange">{money(totals.commission)}</strong>} />
      {totals.tips > 0 && <Row title="الإكراميات" trailing={<strong>{money(totals.tips)}</strong>} />}
    </div>}
    {form && <StaffForm member={form.id ? form : null} onClose={() => setForm(null)} />}
    {accounts && <Accounts onClose={() => setAccounts(false)} />}
  </div>;
}

function StaffForm({ member, onClose }) {
  const { upsert, remove, toast, vocab, data } = useApp();
  const [v, setV] = useState({ name: '', phone: '', role: vocab.pro, specialty: '', commission: 30, color: colors[data.staff.length % colors.length], active: true, ...member });
  const [confirm, setConfirm] = useState(false);
  const set = (key, numeric) => e => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value });
  return <Sheet title={member ? member.name : `إضافة ${vocab.pro}`} onClose={onClose} footer={<>
    {member && <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirm(true)}>حذف</Button>}
    <div className="spacer" />
    <Button icon={Check} disabled={!v.name.trim()} onClick={() => { upsert('staff', { ...v, id: member?.id || uid(), name: v.name.trim() }); toast('تم الحفظ'); onClose(); }}>حفظ</Button>
  </>}>
    <div className="stack">
      <Field label="الاسم" required><input autoFocus value={v.name} onChange={set('name')} /></Field>
      <div className="grid-2">
        <Field label="المسمى"><input value={v.role} onChange={set('role')} /></Field>
        <Field label="الهاتف"><input type="tel" dir="ltr" value={v.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="التخصص"><input value={v.specialty} onChange={set('specialty')} /></Field>
      <Field label="نسبة العمولة ٪"><NumInput min="0" max="100" value={v.commission} onChange={set('commission', true)} /></Field>
      <Field label="اللون في الجدول"><div className="color-row">{colors.map(c => <button type="button" key={c} style={{ background: c }} className={v.color === c ? 'active' : ''} onClick={() => setV({ ...v, color: c })} aria-label={c} />)}</div></Field>
      <Toggle checked={v.active !== false} onChange={on => setV({ ...v, active: on })} label="نشط ويقبل حجوزات" />
      {member && cloudEnabled && <LinkedAccount staffId={member.id} />}
    </div>
    {confirm && <Confirm title="حذف من الفريق؟" text="الأفضل إيقافه (غير نشط) للحفاظ على التقارير." danger confirmLabel="حذف" onClose={() => setConfirm(false)} onConfirm={() => { remove('staff', member.id); toast('تم الحذف'); onClose(); }} />}
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
  const inviteText = `انضم لفريق ${data.shopName} على تطبيق مِقص:\n1) افتح التطبيق${appLink ? ` (${appLink})` : ''} وأنشئ حساباً\n2) اختر «أنا موظف ولدي رمز دعوة» وأدخل: ${code}`;
  const staffMember = data.staff.find(s => s.id === staffId);
  return <Sheet title="حسابات الفريق" subtitle="كل موظف يدخل بحسابه وصلاحياته" onClose={onClose}>
    <div className="stack">
      <Section title="دعوة عضو جديد">
        <Field label="الصلاحية"><Chips items={['manager', 'reception', 'staff'].map(id => ({ id, label: roleText[id] }))} value={role} onChange={setRole} /></Field>
        <small className="muted">{role === 'staff' ? 'يرى مواعيده فقط، بدون أرقام العملاء أو الإيرادات' : role === 'reception' ? 'الحجوزات والعملاء والدفع — بدون التقارير والإعدادات' : 'كل شيء عدا الاشتراك وربط واتساب'}</small>
        {role === 'staff' && <Field label="مرتبط بـ"><select value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">اختر من الفريق</option>{data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {code ? <div className="invite-code"><strong dir="ltr">{code}</strong><small>صالح {num(7)} أيام — لمرة واحدة</small>
          <div className="row-buttons"><Button variant="secondary" icon={Copy} onClick={() => { navigator.clipboard?.writeText(code); toast('تم النسخ'); }}>نسخ</Button>
            <Button icon={MessageCircle} onClick={() => openExternal(staffMember?.phone ? whatsappLink(staffMember.phone, inviteText) : `https://wa.me/?text=${encodeURIComponent(inviteText)}`)}>إرسال</Button></div>
        </div> : <Button block icon={KeyRound} disabled={role === 'staff' && !staffId} onClick={invite}>إنشاء رمز دعوة</Button>}
      </Section>
      <Alert>{error}</Alert>
      <Section title="الأعضاء الحاليون">
        <div className="list">{(members || []).map(m => <Row key={m.user_id} leading={<Avatar name={m.display_name || m.email} />} title={m.display_name || m.email} subtitle={m.email}
          trailing={<span className="row-end">{m.suspended && <Badge tone="muted">موقوف</Badge>}<Badge tone={m.role === 'owner' ? 'orange' : 'blue'}>{roleText[m.role]}</Badge></span>} />)}</div>
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
        ? <Button size="sm" variant="secondary" icon={PlayCircle} onClick={() => run(() => api.setMemberSuspended(shop.id, member.user_id, false), 'تمت إعادة التفعيل')}>إعادة تفعيل</Button>
        : <Button size="sm" variant="ghost" icon={PauseCircle} onClick={() => setConfirm('suspend')}>إيقاف</Button>}
      <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setConfirm('remove')}>حذف</Button>
    </div>
    {confirm === 'suspend' && <Confirm title={`إيقاف حساب ${member.display_name || member.email}؟`} text="لن يستطيع الدخول للصالون، وتبقى كل عملياته في السجل. يمكنك إعادة تفعيله في أي وقت." confirmLabel="إيقاف الحساب"
      onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setMemberSuspended(shop.id, member.user_id, true), 'تم إيقاف الحساب')} />}
    {confirm === 'remove' && <Confirm title="حذف الحساب نهائياً؟" text="يُزال من الصالون ولن يستطيع الدخول. للعودة يحتاج رمز دعوة جديداً." danger confirmLabel="حذف"
      onClose={() => setConfirm(null)} onConfirm={() => run(() => api.removeMember(shop.id, member.user_id), 'تم حذف الحساب')} />}
  </>;
}

// حساب الدخول المرتبط بهذا الموظف (إن وُجد) — من نافذة الموظف مباشرة.
function LinkedAccount({ staffId }) {
  const { shop } = useApp();
  const [account, setAccount] = useState(undefined);
  const load = () => api.team(shop.id).then(list => setAccount(list.find(m => m.staff_id === staffId) || null)).catch(() => setAccount(null));
  useEffect(() => { load(); }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!account) return null;
  return <Section title="حساب الدخول للتطبيق">
    <Row leading={<Avatar name={account.display_name || account.email} />} title={account.display_name || account.email} subtitle={account.suspended ? 'موقوف — لا يستطيع الدخول' : account.email}
      trailing={account.suspended ? <Badge tone="muted">موقوف</Badge> : <Badge tone="green">نشط</Badge>} />
    <MemberActions member={account} onDone={load} />
  </Section>;
}
