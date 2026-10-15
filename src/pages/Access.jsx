// الدخول، إنشاء الصالون لأول مرة، واختيار الفرع.
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, KeyRound, Mail, Scissors, Sparkles, Store, UserRound } from 'lucide-react';
import { latinDigits, phoneDigits, serviceTemplates } from '../data.js';
import { api, auth, errorText } from '../lib/sync.js';
import { prefs } from '../lib/store.js';
import { Alert, Button, Field, Steps, Tile, Toggle } from '../ui.jsx';
import { TRIAL_DAYS } from '../lib/license.js';
import { deviceId } from '../lib/native.js';
import { L, isEn } from '../i18n.js';

// أسهم الرجوع والتالي تتبع اتجاه الصفحة.
const BackIcon = isEn ? ArrowLeft : ArrowRight;
const NextIcon = isEn ? ArrowRight : ArrowLeft;

export function Splash() {
  return <div className="splash"><span className="brand-mark brand-mark-lg"><Scissors size={30} /></span><strong>{L('مِقص', 'Miqass')}</strong><span className="loader" /></div>;
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
        setInfo(L('أرسلنا رابط تعيين كلمة المرور إلى بريدك', 'We sent a password reset link to your email'));
      } else if (mode === 'signup') {
        const { data, error: e } = await auth.signUp(email.trim(), password, name.trim());
        if (e) throw e;
        // مع تفعيل تأكيد البريد لا يعيد Supabase خطأً للبريد المسجّل مسبقاً، بل مستخدماً بلا هويات.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('already registered');
        if (!data.session) setInfo(L('أنشأنا حسابك. افتح بريدك واضغط رابط التأكيد ثم سجّل الدخول.', 'Your account has been created. Open your email, tap the confirmation link, then sign in.'));
      } else {
        const { error: e } = await auth.signIn(email.trim(), password);
        if (e) throw e;
      }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const titles = {
    signin: [L('أهلاً بعودتك', 'Welcome back'), L('سجّل الدخول لإدارة صالونك', 'Sign in to manage your salon')],
    signup: [L(`جرّب مجاناً ${TRIAL_DAYS} أيام`, `Try it free for ${TRIAL_DAYS} days`), L('بدون بطاقة دفع — كل الميزات مفتوحة', 'No credit card required — all features unlocked')],
    reset: [L('نسيت كلمة المرور؟', 'Forgot your password?'), L('سنرسل لك رابطاً لتعيين كلمة جديدة', "We'll send you a link to set a new one")],
  };
  return <AuthLayout title={titles[mode][0]} subtitle={titles[mode][1]}>
    <form onSubmit={submit} className="stack">
      {mode === 'signup' && <Field label={L('اسمك', 'Your name')}><div className="input-icon"><UserRound size={18} /><input required value={name} onChange={e => setName(e.target.value)} placeholder={L('الاسم الكامل', 'Full name')} autoComplete="name" /></div></Field>}
      <Field label={L('البريد الإلكتروني', 'Email')}><div className="input-icon"><Mail size={18} /><input required type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@email.com" autoComplete="email" /></div></Field>
      {mode !== 'reset' && <Field label={L('كلمة المرور', 'Password')}><div className="input-icon"><KeyRound size={18} /><input required type="password" dir="ltr" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div></Field>}
      <Alert>{error}</Alert>
      <Alert tone="green" icon={Check}>{info}</Alert>
      <Button type="submit" size="lg" block disabled={busy}>{busy ? L('لحظة...', 'One moment...') : mode === 'signin' ? L('دخول', 'Sign in') : mode === 'signup' ? L('ابدأ التجربة المجانية', 'Start free trial') : L('إرسال الرابط', 'Send link')}</Button>
    </form>
    <div className="auth-links">
      {mode !== 'signin' && <button type="button" onClick={() => setMode('signin')}>{L('لدي حساب — تسجيل الدخول', 'I have an account — sign in')}</button>}
      {mode !== 'signup' && <button type="button" onClick={() => setMode('signup')}>{L('حساب جديد — تجربة مجانية', 'New account — free trial')}</button>}
      {mode === 'signin' && <button type="button" onClick={() => setMode('reset')}>{L('نسيت كلمة المرور', 'Forgot password')}</button>}
    </div>
  </AuthLayout>;
}

const kinds = [
  { id: 'men', label: L('صالون رجالي', "Men's barbershop"), hint: L('حلاقة وعناية', 'Cuts & grooming'), icon: Scissors, tone: 'accent' },
  { id: 'women', label: L('صالون نسائي', "Women's salon"), hint: L('شعر، مكياج، أظافر', 'Hair, makeup, nails'), icon: Sparkles, tone: 'purple' },
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
      const id = local ? 'local' : await api.createShop(name.trim(), kind, latinDigits(phone).trim(), await deviceId());
      prefs.set(`seed:${id}`, { kind, name: name.trim(), phone: phone.trim(), services, sample });
      if (local) prefs.set('local-setup', true);
      await onCreated(id);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const join = async () => {
    setBusy(true); setError('');
    try { await onJoined(await api.acceptInvite(code)); } catch (e) { setError(errorText(e)); setBusy(false); }
  };

  if (joining) return <AuthLayout title={L('الانضمام لفريق صالون', 'Join a salon team')} subtitle={L('أدخل الرمز الذي أرسله لك صاحب الصالون', 'Enter the code the salon owner sent you')}>
    <div className="stack">
      <Field label={L('رمز الدعوة', 'Invite code')}><input className="code-input" dir="ltr" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="AB12CD34" maxLength={8} /></Field>
      <Alert>{error}</Alert>
      <Button size="lg" block disabled={busy || code.length < 6} onClick={join}>{L('انضمام', 'Join')}</Button>
      <Button variant="ghost" block onClick={() => setJoining(false)}>{L('رجوع', 'Back')}</Button>
    </div>
  </AuthLayout>;

  return <AuthLayout title={onCancel ? L('فرع جديد', 'New branch') : L('لنجهّز صالونك', "Let's set up your salon")} subtitle={L('ثلاث خطوات بسيطة — أقل من دقيقة', 'Three simple steps — under a minute')}>
    <Steps steps={[L('النوع', 'Type'), L('البيانات', 'Details'), L('الخدمات', 'Services')]} current={step} />
    {step === 0 && <div className="stack">
      <div className="tiles tiles-2">{kinds.map(k => <Tile key={k.id} icon={k.icon} label={k.label} hint={k.hint} tone={k.tone} onClick={() => pickKind(k.id)} />)}</div>
      {!local && !onCancel && <Button variant="ghost" icon={Building2} block onClick={() => setJoining(true)}>{L('أنا موظف ولدي رمز دعوة', "I'm staff and have an invite code")}</Button>}
      {onCancel && <Button variant="ghost" icon={BackIcon} block onClick={onCancel}>{L('رجوع', 'Back')}</Button>}
    </div>}
    {step === 1 && <form className="stack" onSubmit={async e => {
      e.preventDefault(); setError('');
      if (local) { setStep(2); return; }
      if (phoneDigits(phone).length < 8) { setError(L('أدخل رقم واتساب صحيحاً للصالون (8 أرقام على الأقل)', 'Enter a valid salon WhatsApp number (at least 8 digits)')); return; }
      // رقم مسجّل لصالون شخص آخر: نوقفه هنا بدل آخر خطوة.
      try { if (!(await api.phoneAvailable(phone))) { setError(errorText('phone_taken')); return; } } catch { /* يتحقق الخادم عند الإنشاء */ }
      setStep(2);
    }}>
      <Field label={L('اسم الصالون', 'Salon name')} required><div className="input-icon"><Store size={18} /><input required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'women' ? L('مثال: صالون لمسة', 'e.g. Lamsa Salon') : L('مثال: صالون مِقص', 'e.g. Miqass Barbershop')} /></div></Field>
      <Field label={L('رقم واتساب الصالون', 'Salon WhatsApp number')} required={!local} hint={L('يظهر للعملاء في رابط الحجز والفواتير', 'Shown to clients on the booking link and receipts')}><input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+974 5555 1234" /></Field>
      <Alert>{error}</Alert>
      <div className="row-buttons"><Button variant="ghost" icon={BackIcon} onClick={() => setStep(0)}>{L('رجوع', 'Back')}</Button><Button type="submit" icon={NextIcon}>{L('التالي', 'Next')}</Button></div>
    </form>}
    {step === 2 && <div className="stack">
      <p className="muted center">{L('اختر الخدمات التي تقدمها — يمكنك تعديل الأسعار لاحقاً', 'Choose the services you offer — you can edit prices later')}</p>
      <div className="chips chips-center">{serviceTemplates[kind].map(s => {
        const on = services.includes(s.name);
        return <button type="button" key={s.name} className={`chip ${on ? 'active' : ''}`} onClick={() => setServices(on ? services.filter(n => n !== s.name) : [...services, s.name])}>{on && <Check size={14} />}{s.name}</button>;
      })}</div>
      <Toggle checked={sample} onChange={setSample} label={L('أضف بيانات تجريبية', 'Add sample data')} hint={L('عملاء ومواعيد وهمية لاستكشاف التطبيق', 'Sample clients and appointments to explore the app')} />
      <Alert>{error}</Alert>
      <div className="row-buttons"><Button variant="ghost" icon={BackIcon} onClick={() => setStep(1)}>{L('رجوع', 'Back')}</Button><Button disabled={busy || !services.length} icon={Check} onClick={create}>{busy ? L('جارٍ الإنشاء...', 'Creating...') : L('ابدأ', 'Start')}</Button></div>
    </div>}
  </AuthLayout>;
}

export function ShopPicker({ shops, onPick }) {
  return <AuthLayout title={L('اختر الفرع', 'Choose a branch')} subtitle={L('لديك أكثر من صالون', 'You have more than one salon')}>
    <div className="tiles tiles-2">{shops.map(shop => <Tile key={shop.id} icon={Store} label={shop.name} hint={shop.active ? L('نشط', 'Active') : L('يحتاج تفعيل', 'Needs activation')} tone={shop.active ? 'green' : 'red'} onClick={() => onPick(shop.id)} />)}</div>
  </AuthLayout>;
}
