// الدخول، إنشاء الصالون لأول مرة، واختيار الفرع.
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, KeyRound, Mail, Scissors, Sparkles, Store, UserRound, UsersRound } from 'lucide-react';
import { serviceTemplates } from '../data.js';
import { api, auth, errorText } from '../lib/sync.js';
import { prefs } from '../lib/store.js';
import { Alert, Button, Field, Steps, Tile, Toggle } from '../ui.jsx';
import { TRIAL_DAYS } from '../lib/license.js';

export function Splash() {
  return <div className="splash"><span className="brand-mark brand-mark-lg"><Scissors size={30} /></span><strong>مِقص</strong><span className="loader" /></div>;
}

function AuthLayout({ title, subtitle, children }) {
  return <div className="auth">
    <div className="auth-card">
      <div className="auth-brand"><span className="brand-mark brand-mark-lg"><Scissors size={28} /></span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children}
    </div>
  </div>;
}

export function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'reset') {
        const { error: e } = await auth.reset(email.trim());
        if (e) throw e;
        setInfo('أرسلنا رابط تعيين كلمة المرور إلى بريدك');
      } else if (mode === 'signup') {
        const { data, error: e } = await auth.signUp(email.trim(), password, name.trim());
        if (e) throw e;
        if (!data.session) setInfo('أنشأنا حسابك. افتح بريدك واضغط رابط التأكيد ثم سجّل الدخول.');
      } else {
        const { error: e } = await auth.signIn(email.trim(), password);
        if (e) throw e;
      }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const titles = { signin: ['أهلاً بعودتك', 'سجّل الدخول لإدارة صالونك'], signup: [`جرّب مجاناً ${TRIAL_DAYS} أيام`, 'بدون بطاقة دفع — كل الميزات مفتوحة'], reset: ['نسيت كلمة المرور؟', 'سنرسل لك رابطاً لتعيين كلمة جديدة'] };
  return <AuthLayout title={titles[mode][0]} subtitle={titles[mode][1]}>
    <form onSubmit={submit} className="stack">
      {mode === 'signup' && <Field label="اسمك"><div className="input-icon"><UserRound size={18} /><input required value={name} onChange={e => setName(e.target.value)} placeholder="الاسم الكامل" autoComplete="name" /></div></Field>}
      <Field label="البريد الإلكتروني"><div className="input-icon"><Mail size={18} /><input required type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@email.com" autoComplete="email" /></div></Field>
      {mode !== 'reset' && <Field label="كلمة المرور"><div className="input-icon"><KeyRound size={18} /><input required type="password" dir="ltr" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div></Field>}
      <Alert>{error}</Alert>
      <Alert tone="green" icon={Check}>{info}</Alert>
      <Button type="submit" size="lg" block disabled={busy}>{busy ? 'لحظة...' : mode === 'signin' ? 'دخول' : mode === 'signup' ? 'ابدأ التجربة المجانية' : 'إرسال الرابط'}</Button>
    </form>
    <div className="auth-links">
      {mode !== 'signin' && <button type="button" onClick={() => setMode('signin')}>لدي حساب — تسجيل الدخول</button>}
      {mode !== 'signup' && <button type="button" onClick={() => setMode('signup')}>حساب جديد — تجربة مجانية</button>}
      {mode === 'signin' && <button type="button" onClick={() => setMode('reset')}>نسيت كلمة المرور</button>}
    </div>
  </AuthLayout>;
}

const kinds = [
  { id: 'men', label: 'صالون رجالي', hint: 'حلاقة وعناية', icon: Scissors, tone: 'accent' },
  { id: 'women', label: 'صالون نسائي', hint: 'شعر، مكياج، أظافر', icon: Sparkles, tone: 'purple' },
  { id: 'mixed', label: 'صالون مختلط', hint: 'رجال وسيدات', icon: UsersRound, tone: 'blue' },
];

export function Onboarding({ onCreated, onJoined, onCancel, local = false }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState([]);
  const [sample, setSample] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // زر الرجوع في أندرويد: خطوة للخلف، ثم إلغاء إضافة الفرع.
  useEffect(() => {
    const handler = event => {
      if (joining) setJoining(false);
      else if (step > 0) setStep(step - 1);
      else if (onCancel) onCancel();
      else return;
      event.preventDefault();
    };
    document.addEventListener('app-back', handler);
    return () => document.removeEventListener('app-back', handler);
  }, [joining, step, onCancel]);

  const pickKind = id => { setKind(id); setServices(serviceTemplates[id].map(s => s.name)); setStep(1); };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const id = local ? 'local' : await api.createShop(name.trim(), kind, phone.trim());
      prefs.set(`seed:${id}`, { kind, name: name.trim(), phone: phone.trim(), services, sample });
      if (local) prefs.set('local-setup', true);
      await onCreated(id);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setError('');
    try { await onJoined(await api.acceptInvite(code)); } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  if (joining) return <AuthLayout title="الانضمام لفريق صالون" subtitle="أدخل الرمز الذي أرسله لك صاحب الصالون">
    <div className="stack">
      <Field label="رمز الدعوة"><input className="code-input" dir="ltr" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="AB12CD34" maxLength={8} /></Field>
      <Alert>{error}</Alert>
      <Button size="lg" block disabled={busy || code.length < 6} onClick={join}>انضمام</Button>
      <Button variant="ghost" block onClick={() => setJoining(false)}>رجوع</Button>
    </div>
  </AuthLayout>;

  return <AuthLayout title={onCancel ? 'فرع جديد' : 'لنجهّز صالونك'} subtitle="ثلاث خطوات بسيطة — أقل من دقيقة">
    <Steps steps={['النوع', 'البيانات', 'الخدمات']} current={step} />
    {step === 0 && <div className="stack">
      <div className="tiles tiles-3">{kinds.map(k => <Tile key={k.id} icon={k.icon} label={k.label} hint={k.hint} tone={k.tone} onClick={() => pickKind(k.id)} />)}</div>
      {!local && !onCancel && <Button variant="ghost" icon={Building2} block onClick={() => setJoining(true)}>أنا موظف ولدي رمز دعوة</Button>}
      {onCancel && <Button variant="ghost" icon={ArrowRight} block onClick={onCancel}>رجوع</Button>}
    </div>}
    {step === 1 && <form className="stack" onSubmit={e => { e.preventDefault(); setStep(2); }}>
      <Field label="اسم الصالون" required><div className="input-icon"><Store size={18} /><input required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'women' ? 'مثال: صالون لمسة' : 'مثال: صالون مِقص'} /></div></Field>
      <Field label="رقم واتساب الصالون" hint="يظهر للعملاء في رابط الحجز والفواتير"><input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+974 5555 1234" /></Field>
      <div className="row-buttons"><Button variant="ghost" icon={ArrowRight} onClick={() => setStep(0)}>رجوع</Button><Button type="submit" icon={ArrowLeft}>التالي</Button></div>
    </form>}
    {step === 2 && <div className="stack">
      <p className="muted center">اختر الخدمات التي تقدمها — يمكنك تعديل الأسعار لاحقاً</p>
      <div className="chips chips-center">{serviceTemplates[kind].map(s => {
        const on = services.includes(s.name);
        return <button type="button" key={s.name} className={`chip ${on ? 'active' : ''}`} onClick={() => setServices(on ? services.filter(n => n !== s.name) : [...services, s.name])}>{on && <Check size={14} />}{s.name}</button>;
      })}</div>
      <Toggle checked={sample} onChange={setSample} label="أضف بيانات تجريبية" hint="عملاء ومواعيد وهمية لاستكشاف التطبيق" />
      <Alert>{error}</Alert>
      <div className="row-buttons"><Button variant="ghost" icon={ArrowRight} onClick={() => setStep(1)}>رجوع</Button><Button disabled={busy || !services.length} icon={Check} onClick={create}>{busy ? 'جارٍ الإنشاء...' : 'ابدأ'}</Button></div>
    </div>}
  </AuthLayout>;
}

export function ShopPicker({ shops, onPick }) {
  return <AuthLayout title="اختر الفرع" subtitle="لديك أكثر من صالون">
    <div className="tiles tiles-2">{shops.map(shop => <Tile key={shop.id} icon={Store} label={shop.name} hint={shop.active ? 'نشط' : 'يحتاج تفعيل'} tone={shop.active ? 'green' : 'red'} onClick={() => onPick(shop.id)} />)}</div>
  </AuthLayout>;
}
