// تكامل تطبيق أندرويد الأصلي (Capacitor): شريط الحالة، زر الرجوع، وتنبيهات المواعيد على الجهاز.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { localISO, serviceNames, timeLabel } from '../data.js';

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

// إشعار فوري على الجهاز (حجز جديد مثلاً).
let notifyId = 1000;
export async function notifyNow(title, body) {
  if (!isNative) {
    try { if (window.Notification?.permission === 'granted') new Notification(title, { body }); } catch { /* ignore */ }
    return;
  }
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({ notifications: [{ id: notifyId++, title, body }] });
  } catch { /* الإشعارات اختيارية */ }
}

// تنبيه قبل كل موعد بـ١٥ دقيقة (لمواعيد اليوم والغد) — يعمل حتى والتطبيق مغلق.
let lastSignature = '';
export async function scheduleAppointmentAlerts(data, staffId) {
  if (!isNative) return;
  const today = localISO();
  const upcoming = data.appointments
    .filter(a => ['pending', 'confirmed'].includes(a.status) && a.date >= today && (!staffId || a.staffId === staffId))
    .map(a => ({ a, at: new Date(`${a.date}T${a.time}:00`).getTime() - 15 * 60000 }))
    .filter(({ at }) => at > Date.now() && at < Date.now() + 2 * 86400000)
    .slice(0, 40);
  const signature = upcoming.map(({ a }) => `${a.id}${a.date}${a.time}`).join('|');
  if (signature === lastSignature) return;
  lastSignature = signature;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted' && (await LocalNotifications.requestPermissions()).display !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
    await LocalNotifications.schedule({
      notifications: upcoming.map(({ a, at }, index) => ({
        id: index + 1,
        title: `موعد بعد ١٥ دقيقة — ${timeLabel(a.time)}`,
        body: `${clients[a.clientId]?.name || 'عميل'} · ${serviceNames(a)}`,
        schedule: { at: new Date(at), allowWhileIdle: true },
      })),
    });
  } catch { /* التنبيهات اختيارية */ }
}
