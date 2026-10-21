// قفل التطبيق بالبصمة (أو رمز الهاتف): إعداد لكل جهاز، يُطلب عند الفتح وبعد غياب دقيقة في الخلفية.
import { isNative } from './native.js';
import { L } from '../i18n.js';

const KEY = 'miqass-lock';
const AWAY_MS = 60 * 1000;

export const lockEnabled = () => { try { return isNative && localStorage.getItem(KEY) === '1'; } catch { return false; } };
const store = on => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* ignore */ } };

const plugin = async () => (await import('@aparajita/capacitor-biometric-auth')).BiometricAuth;

// هل يمكن القفل على هذا الهاتف؟ (بصمة/وجه أو على الأقل رمز قفل للشاشة)
export async function lockAvailable() {
  if (!isNative) return false;
  try { const r = await (await plugin()).checkBiometry(); return r.isAvailable || r.deviceIsSecure; } catch { return false; }
}

let authenticating = false;
export async function unlock() {
  authenticating = true;
  try {
    await (await plugin()).authenticate({
      reason: L('افتح مِقص', 'Unlock Miqass'), androidTitle: L('مِقص', 'Miqass'), androidSubtitle: L('استخدم البصمة لفتح التطبيق', 'Use your fingerprint to open the app'),
      cancelTitle: L('إلغاء', 'Cancel'), allowDeviceCredential: true, androidConfirmationRequired: false,
    });
    return true;
  } catch { return false; } finally { setTimeout(() => { authenticating = false; }, 1500); }
}

// التفعيل يتطلب نجاح البصمة أولاً حتى لا يُقفل المستخدم خارج تطبيقه.
export async function setLock(on) {
  if (on && !(await unlock())) return false;
  store(on);
  return true;
}

// يستدعي onLock عند العودة للتطبيق بعد غياب أطول من دقيقة.
export async function watchBackground(onLock) {
  if (!isNative) return () => {};
  const { App } = await import('@capacitor/app');
  let awayAt = 0;
  const handle = await App.addListener('appStateChange', ({ isActive }) => {
    if (authenticating) return;
    if (!isActive) awayAt = Date.now();
    else if (awayAt && Date.now() - awayAt > AWAY_MS && lockEnabled()) onLock();
  });
  return () => handle.remove();
}
