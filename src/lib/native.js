// تكامل تطبيق أندرويد الأصلي (Capacitor): شريط الحالة، زر الرجوع، وتنبيهات المواعيد على الجهاز.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { addDays, balanceDue, localISO, money, num, serviceNames, timeLabel } from '../data.js';
import { L } from '../i18n.js';

export const isNative = Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative) return;
  const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);
  setSystemBarsTheme(document.documentElement.dataset.theme === 'dark');
  SplashScreen.hide().catch(() => {});
  App.addListener('backButton', ({ canGoBack }) => {
    // يغلق النافذة المفتوحة أولاً، ثم يعود للرئيسية، ثم يخرج من التطبيق.
    const sheet = document.querySelector('.sheet-backdrop');
    if (sheet) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
    const event = new CustomEvent('app-back', { cancelable: true });
    if (!document.dispatchEvent(event)) return;
    if (canGoBack) window.history.back(); else App.exitApp();
  });
}

// التطبيق يمتد خلف شريط الحالة (edge-to-edge)؛ نلوّن أيقونات الشريط حسب المظهر.
export function setSystemBarsTheme(dark) {
  if (!isNative) return;
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

// معرّف ثابت للجهاز (لمنع تكرار التجربة المجانية من نفس الهاتف بحساب جديد).
export async function deviceId() {
  try {
    if (isNative) { const { Device } = await import('@capacitor/device'); return (await Device.getId()).identifier; }
    let id = localStorage.getItem('miqass-device');
    if (!id) { id = `web-${crypto.randomUUID()}`; localStorage.setItem('miqass-device', id); }
    return id;
  } catch { return ''; }
}

// إشعار فوري على الجهاز (حجز جديد مثلاً).
let notifyId = 1000;
export async function notifyNow(title, body, extra = {}) {
  // يعيد true إذا عُرض الإشعار، حتى يعرف زر التجربة إن كان الإذن مرفوضاً.
  if (!isNative) {
    try { if (window.Notification?.permission === 'granted') { new Notification(title, { body }); return true; } } catch { /* ignore */ }
    return false;
  }
  try {
    const api = (await alertsApi())?.LocalNotifications;
    if (!api) return false;
    await api.schedule({ notifications: [{ id: notifyId++, title, body, channelId: ALERT_CHANNEL, extra }] });
    return true;
  } catch { return false; /* الإشعارات اختيارية */ }
}

// قناة تنبيهات بأولوية عالية: تظهر منبثقة أعلى الشاشة مع صوت واهتزاز (أندرويد 8+).
const ALERT_CHANNEL = 'alerts';
let channelReady = null;
async function alertsApi() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') return null;
  channelReady ||= LocalNotifications.createChannel({ id: ALERT_CHANNEL, name: L('تنبيهات المواعيد', 'Appointment alerts'), importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#D59A4E' }).catch(() => {});
  await channelReady;
  // مغلّفة في كائن: إضافة Capacitor «وكيل» يجيب على then، فإرجاعها مباشرة من دالة async يفشل دائماً.
  return { LocalNotifications };
}

// تنبيهات المواعيد على الجهاز (تعمل والتطبيق مغلق) — وكل تنبيه يفتح الموعد عند الضغط عليه:
// ١) قبل الموعد بـ15 دقيقة. ٢) بعد بدايته بـ15 دقيقة إن لم يُسجَّل حضوره: «هل حضر؟».
// ٣) بعد انتهاء خدمة لم تُدفع: «هل دفع؟».
let lastSignature = '';
export async function scheduleAppointmentAlerts(data, staffId, { payments = true } = {}) {
  if (!isNative) return;
  const today = localISO();
  const now = Date.now();
  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  const name = a => clients[a.clientId]?.name || L('عميل', 'Client');
  const start = a => new Date(`${a.date}T${a.time}:00`).getTime();
  const mine = a => !staffId || a.staffId === staffId || (a.items || []).some(i => i.staffId === staffId);
  const recent = data.appointments.filter(a => a.date >= addDays(today, -1) && a.date <= addDays(today, 2) && mine(a));
  const items = [];
  for (const a of recent) {
    const at = start(a);
    if (['pending', 'confirmed'].includes(a.status)) {
      items.push({ key: `b${a.id}`, at: at - 15 * 60000, title: L(`موعد بعد ${num(15)} دقيقة — ${timeLabel(a.time)}`, `Appointment in ${num(15)} minutes — ${timeLabel(a.time)}`), body: `${name(a)} · ${serviceNames(a)}`, a });
      items.push({ key: `n${a.id}`, at: at + 15 * 60000, title: L(`هل حضر ${name(a)}؟`, `Did ${name(a)} arrive?`), body: L(`مرّت ${num(15)} دقيقة على موعده (${timeLabel(a.time)}) — سجّل حضوره، أو غيابه وأضفه لقائمة الانتظار`, `${num(15)} minutes since the appointment (${timeLabel(a.time)}) — mark them arrived, or no-show and add to the waitlist`), a });
    }
    if (payments && ['arrived', 'completed'].includes(a.status) && balanceDue(a) > 0) {
      const end = at + Number(a.duration || 30) * 60000 + 10 * 60000;
      items.push({ key: `p${a.id}`, at: Math.max(end, now + 60000), title: L(`هل دفع ${name(a)}؟`, `Has ${name(a)} paid?`), body: L(`متبقٍّ ${money(balanceDue(a))} — سجّل الدفع حتى يكتمل الموعد`, `${money(balanceDue(a))} outstanding — record the payment to close the appointment`), a });
    }
  }
  // تذكير الدفع المتأخر يُرسل مرة واحدة فقط لكل موعد.
  const notified = new Set(JSON.parse(localStorage.getItem('miqass-paid-alerts') || '[]'));
  const due = items.filter(n => n.at > now && n.at < now + 2 * 86400000 && !(n.key.startsWith('p') && notified.has(n.key))).sort((x, y) => x.at - y.at).slice(0, 60);
  const signature = due.map(n => `${n.key}${n.at}`).join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;
  try {
    const api = (await alertsApi())?.LocalNotifications;
    if (!api) return;
    const pending = await api.getPending();
    if (pending.notifications.length) await api.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    await api.schedule({
      notifications: due.map((n, index) => ({
        id: index + 1, title: n.title, body: n.body, channelId: ALERT_CHANNEL,
        schedule: { at: new Date(n.at), allowWhileIdle: true },
        extra: { appointmentId: n.a.id, date: n.a.date },
      })),
    });
    for (const n of due) if (n.key.startsWith('p')) notified.add(n.key);
    localStorage.setItem('miqass-paid-alerts', JSON.stringify([...notified].slice(-300)));
  } catch { /* التنبيهات اختيارية */ }
}

// الضغط على أي تنبيه محلي يفتح الموعد (حتى لو كان التطبيق مغلقاً).
let tapListener = false;
export async function onAlertTap(handler) {
  if (!isNative || tapListener) return;
  tapListener = true;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => handler(notification.extra || {}));
  } catch { /* ignore */ }
}

// إشعارات Firebase على أندرويد (تُفعَّل عند البناء مع google-services.json)، وإشعارات الويب (Web Push) في المتصفح.
const nativePush = isNative && import.meta.env?.VITE_PUSH === '1';
export const webPush = !isNative && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushSupported = nativePush || webPush;
let pushListeners = false;
export let pushState = { status: pushSupported ? 'unknown' : 'unsupported', error: '' };

const keyBytes = key => { const b = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
// المتصفح: اشتراك Web Push بمفتاح الخادم العام، ويُحفظ الاشتراك كاملاً (JSON) بدل رمز Firebase.
async function registerWebPush(saveToken, onOpen, { ask, publicKey }) {
  try {
    if (Notification.permission === 'denied') return (pushState = { status: 'denied', error: '' });
    if (Notification.permission !== 'granted') {
      if (!ask) return (pushState = { status: 'not-granted', error: '' });
      const answer = await Notification.requestPermission();
      if (answer !== 'granted') return (pushState = { status: answer === 'denied' ? 'denied' : 'not-granted', error: '' });
    }
    const key = await publicKey();
    if (!key) return (pushState = { status: 'error', error: L('مفتاح الإشعارات غير جاهز على الخادم', 'Push key not ready on the server') });
    const reg = await navigator.serviceWorker.register('/push-sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // اشتراك قديم بمفتاح مختلف لا يصله شيء: نجدده.
    if (sub && sub.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) { await sub.unsubscribe(); sub = null; }
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    if (!pushListeners) {
      pushListeners = true;
      navigator.serviceWorker.addEventListener('message', event => { if (event.data?.type === 'push-open') onOpen?.(event.data.data || {}); });
    }
    await saveToken(JSON.stringify(sub));
    pushState = { status: 'registered', error: '' };
  } catch (error) { pushState = { status: 'error', error: String(error?.message || error) }; }
  return pushState;
}

export async function registerPush(saveToken, onOpen, { ask = true, publicKey } = {}) {
  if (!pushSupported) return pushState;
  if (webPush) return registerWebPush(saveToken, onOpen, { ask, publicKey });
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let permission = await PushNotifications.checkPermissions();
    // على أندرويد قد تكون الحالة prompt أو prompt-with-rationale — نطلب الإذن في الحالتين.
    if (permission.receive !== 'granted' && permission.receive !== 'denied' && ask) permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') { pushState = { status: permission.receive === 'denied' ? 'denied' : 'not-granted', error: '' }; return pushState; }
    if (!pushListeners) {
      pushListeners = true;
      await PushNotifications.createChannel({ id: 'bookings', name: L('الحجوزات الجديدة', 'New bookings'), importance: 5, sound: 'default', vibration: true }).catch(() => {});
      await PushNotifications.addListener('registration', ({ value }) => { pushState = { status: 'registered', error: '' }; saveToken(value); });
      await PushNotifications.addListener('registrationError', ({ error }) => { pushState = { status: 'error', error: String(error) }; });
      // أندرويد لا يعرض إشعار Firebase والتطبيق مفتوح؛ نعرض الإشعار التجريبي محلياً.
      await PushNotifications.addListener('pushNotificationReceived', n => { if (n.data?.kind === 'test') notifyNow(n.title || '', n.body || ''); });
      await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => onOpen?.(notification.data || {}));
    }
    pushState = { status: 'registering', error: '' };
    await PushNotifications.register();
  } catch (error) { pushState = { status: 'error', error: String(error?.message || error) }; }
  return pushState;
}
