import './i18n.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3, Boxes, CalendarDays, Cloud, CloudOff, House, LayoutGrid, LogOut, MessageCircle, Moon, RefreshCw,
  Scissors, Settings2, Sun, UsersRound, WalletCards, ShieldCheck, Crown,
} from 'lucide-react';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/tajawal/arabic-700.css';
import '@fontsource/tajawal/arabic-800.css';
import './style.css';
import { dateLabel, defaultData, defaultSettings, loadLegacyData, localISO, timeLabel, normalizeData, serviceTemplates, uid, vocabulary } from './data.js';
import { AppContext, Toast, useToast } from './ui.jsx';
import { prefs } from './lib/store.js';
import { api, auth, cloudEnabled } from './lib/sync.js';
import { licenseState, localShop } from './lib/license.js';
import { useShopData } from './useShopData.js';
import { initNative, notifyNow, registerPush, scheduleAppointmentAlerts, setSystemBarsTheme } from './lib/native.js';
import Home from './pages/Home.jsx';
import Appointments from './pages/Appointments.jsx';
import Clients from './pages/Clients.jsx';
import Checkout from './pages/Checkout.jsx';
import Messages from './pages/Messages.jsx';
import Inventory from './pages/Inventory.jsx';
import Team from './pages/Team.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import More from './pages/More.jsx';
import { AuthScreen, Onboarding, ShopPicker, Splash } from './pages/Access.jsx';
import Lock, { SubscriptionBanner, TrialBanner } from './pages/Lock.jsx';
import Admin from './pages/Admin.jsx';
import PublicBooking from './pages/PublicBooking.jsx';

// من يرى ماذا: الموظف يرى مواعيده فقط، والاستقبال لا يرى التقارير والإعدادات.
const ACCESS = {
  owner: ['home', 'appointments', 'clients', 'checkout', 'messages', 'inventory', 'team', 'reports', 'settings', 'more'],
  manager: ['home', 'appointments', 'clients', 'checkout', 'messages', 'inventory', 'team', 'reports', 'settings', 'more'],
  reception: ['home', 'appointments', 'clients', 'checkout', 'messages', 'inventory', 'settings', 'more'],
  staff: ['home', 'appointments', 'clients', 'settings'],
};

export const PAGES = {
  home: { label: 'الرئيسية', icon: House, component: Home },
  appointments: { label: 'المواعيد', icon: CalendarDays, component: Appointments },
  clients: { label: 'العملاء', icon: UsersRound, component: Clients },
  checkout: { label: 'الدفع', icon: WalletCards, component: Checkout },
  messages: { label: 'الرسائل الذكية', icon: MessageCircle, component: Messages },
  inventory: { label: 'المخزون', icon: Boxes, component: Inventory },
  team: { label: 'الفريق', icon: Scissors, component: Team },
  reports: { label: 'التقارير', icon: BarChart3, component: Reports },
  settings: { label: 'الإعدادات', icon: Settings2, component: Settings },
  more: { label: 'المزيد', icon: LayoutGrid, component: More },
  admin: { label: 'لوحة المطوّر', icon: Crown, component: Admin },
};
const TABS = ['home', 'appointments', 'clients', 'checkout', 'more'];

function useTheme() {
  const [mode, setMode] = useState(() => prefs.get('theme', 'system'));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = event => setSystemDark(event.matches);
    media?.addEventListener?.('change', update);
    return () => media?.removeEventListener?.('change', update);
  }, []);
  const theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121110' : '#f6f4ef');
    setSystemBarsTheme(theme === 'dark');
    prefs.set('theme', mode);
  }, [theme, mode]);
  return { mode, theme, setMode };
}

function Root() {
  const bookSlug = new URLSearchParams(window.location.search).get('book') || window.location.hash.match(/^#\/book\/([\w-]+)/)?.[1];
  if (bookSlug) return <PublicBooking slug={bookSlug} />;
  return <Gate />;
}

// البوابة: الحساب ← الصالون ← الترخيص ← التطبيق.
function Gate() {
  const theme = useTheme();
  const [session, setSession] = useState(cloudEnabled ? undefined : null);
  const [shops, setShops] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [shopId, setShopId] = useState(() => prefs.get('shop', null));
  const [anchor, setAnchor] = useState(() => prefs.get('server-anchor', null));
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [localReady, setLocalReady] = useState(() => cloudEnabled || prefs.get('local-setup', false) || Boolean(loadLegacyData()));

  useEffect(() => {
    initNative();
    if (!cloudEnabled) return undefined;
    auth.session().then(setSession).catch(() => setSession(null));
    const subscription = auth.onChange(setSession);
    return () => subscription.unsubscribe();
  }, []);

  const loadShops = useCallback(async () => {
    if (!cloudEnabled) { setShops([localShop()]); return; }
    if (!session) return;
    try {
      const list = await api.myShops();
      prefs.set('shops-cache', list);
      setShops(list);
      if (list[0]?.server_time) {
        const next = { serverTime: list[0].server_time, fetchedAt: Date.now() };
        prefs.set('server-anchor', next); setAnchor(next);
      }
      setAdmin(await api.isAdmin().catch(() => false));
      setError('');
    } catch {
      // بدون إنترنت: نعمل بآخر نسخة معروفة من بيانات الصالونات والترخيص.
      setShops(prefs.get('shops-cache', []));
      setError('تعمل الآن بدون اتصال — ستتم المزامنة تلقائياً');
    }
  }, [session]);

  useEffect(() => { loadShops(); }, [loadShops]);
  useEffect(() => { const timer = setInterval(loadShops, 10 * 60 * 1000); return () => clearInterval(timer); }, [loadShops]);

  if (session === undefined || (session && shops === null) || (!cloudEnabled && !shops)) return <Splash />;
  if (cloudEnabled && !session) return <AuthScreen />;
  if (!localReady) return <Onboarding local onCreated={() => setLocalReady(true)} />;
  const shop = shops.find(entry => entry.id === shopId) || (shops.length === 1 ? shops[0] : null);
  const addingScreen = adding && <div className="overlay-screen"><Onboarding onCancel={() => setAdding(false)} onCreated={async id => { setAdding(false); prefs.set('shop', id); setShopId(id); await loadShops(); }} onJoined={async id => { setAdding(false); prefs.set('shop', id); setShopId(id); await loadShops(); }} /></div>;
  if (adding && !shop) return addingScreen;
  if (!shops.length) return <Onboarding onCreated={async id => { prefs.set('shop', id); setShopId(id); await loadShops(); }} onJoined={async id => { prefs.set('shop', id); setShopId(id); await loadShops(); }} />;
  if (!shop) return <ShopPicker shops={shops} onPick={id => { prefs.set('shop', id); setShopId(id); }} />;
  const license = licenseState(shop, anchor);
  // حساب الموظف موقوف: لا نحمّل بيانات الصالون أصلاً.
  if (license.status === 'member_suspended') return <Lock shop={shop} data={null} license={license} shops={shops} switchShop={id => { prefs.set('shop', id); setShopId(id); }} />;
  return <>{addingScreen}<Shell key={shop.id} shop={shop} shops={shops} license={license} admin={admin} theme={theme} notice={error}
    reloadShops={loadShops} addBranch={() => setAdding(true)} switchShop={id => { prefs.set('shop', id); setShopId(id); }} /></>;
}

function Shell({ shop, shops, license, admin, theme, notice, reloadShops, switchShop, addBranch }) {
  const onRemoteBookings = useCallback(list => {
    const a = list[0];
    const name = a.clientName || 'عميل جديد';
    const text = list.length > 1 ? `${list.length} حجوزات جديدة أونلاين` : `حجز جديد: ${name} — ${dateLabel(a.date, { weekday: 'long' })} ${timeLabel(a.time)}`;
    if (!(import.meta.env.VITE_PUSH === '1' && document.hidden)) notifyNow('📅 حجز جديد', text); // في الخلفية يصل إشعار Firebase بدلاً منه
    toastRef.current?.(text, 'success', { label: 'فتح', run: () => goRef.current?.('appointments', { open: a.id }) });
  }, []);
  const toastRef = useRef(null);
  const goRef = useRef(null);
  const { data, setData, sync, syncNow } = useShopData(shop, onRemoteBookings);
  const role = shop.role || 'owner';
  const allowed = admin ? [...ACCESS[role], 'admin'] : ACCESS[role];
  const [page, setPageState] = useState('home');
  const [intent, setIntent] = useState(null);
  const [toast, showToast, closeToast] = useToast();
  const [, setTick] = useState(0);
  toastRef.current = showToast;

  const go = useCallback((destination, nextIntent = null) => {
    setPageState(allowed.includes(destination) ? destination : 'home');
    setIntent(nextIntent);
    window.scrollTo({ top: 0 });
  }, [allowed]);
  goRef.current = go;

  // زر الرجوع في أندرويد يعود للرئيسية بدلاً من إغلاق التطبيق.
  useEffect(() => {
    const handler = event => {
      if (document.querySelector('.overlay-screen')) return; // شاشة إضافة الفرع تعالج الرجوع بنفسها
      if (page !== 'home') { event.preventDefault?.(); go('home'); }
    };
    document.addEventListener('app-back', handler);
    return () => document.removeEventListener('app-back', handler);
  }, [page, go]);

  // تطبيق اختيارات الإعداد الأولي (نوع الصالون، الخدمات، بيانات تجريبية) مرة واحدة.
  useEffect(() => {
    if (!data) return;
    const seed = prefs.get(`seed:${shop.id}`, null);
    if (!seed) return;
    prefs.set(`seed:${shop.id}`, null);
    const settings = defaultSettings(seed.kind);
    if (seed.sample) {
      const sample = defaultData(seed.kind, seed.name);
      setData(normalizeData({ ...sample, services: sample.services.filter(s => seed.services.includes(s.name)), settings }));
    } else {
      setData(prev => normalizeData({ ...prev, shopName: seed.name, settings,
        services: serviceTemplates[seed.kind].filter(s => seed.services.includes(s.name)).map(s => ({ id: uid(), processing: 0, deposit: 0, online: true, ...s })) }));
    }
  }, [Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps

  // تسجيل الجهاز لإشعارات Firebase (حجز جديد حتى والتطبيق مغلق).
  const enablePush = useCallback(() => registerPush(
    token => api.saveDeviceToken(shop.id, token).catch(() => {}),
    payload => { if (payload.appointmentId) goRef.current?.('appointments', { open: payload.appointmentId }); },
  ), [shop.id]);
  useEffect(() => { if (cloudEnabled && shop.id !== 'local') enablePush(); }, [enablePush]);

  useEffect(() => { if (data) scheduleAppointmentAlerts(data, shop.staff_id); }, [data?.appointments]); // eslint-disable-line react-hooks/exhaustive-deps

  const helpers = useMemo(() => {
    if (!data) return null;
    const upsert = (collection, item) => setData(prev => {
      const list = prev[collection] || [];
      const exists = list.some(entry => entry.id === item.id);
      return { ...prev, [collection]: exists ? list.map(entry => entry.id === item.id ? { ...entry, ...item } : entry) : [...list, { id: item.id || uid(), ...item }] };
    });
    const patch = (collection, id, fn) => setData(prev => ({ ...prev, [collection]: prev[collection].map(entry => entry.id === id ? { ...entry, ...(typeof fn === 'function' ? fn(entry) : fn) } : entry) }));
    const remove = (collection, id) => setData(prev => ({ ...prev, [collection]: prev[collection].filter(entry => entry.id !== id) }));
    const logMessage = (kind, clientId, appointmentId = '') => upsert('messages', { id: uid(), kind, clientId, appointmentId, at: localISO(), channel: 'whatsapp-link' });
    return { upsert, patch, remove, logMessage };
  }, [data, setData]);

  if (!data) return <Splash />;
  if (license.locked && !admin) return <Lock shop={shop} data={data} license={license} theme={theme} shops={shops} switchShop={switchShop} />;

  const vocab = vocabulary(data.settings.kind);
  const staffMember = shop.staff_id ? data.staff.find(member => member.id === shop.staff_id) : null;
  const context = {
    data, setData, ...helpers, shop, role, license, vocab, go, intent, setIntent, toast: showToast, theme, sync, syncNow,
    reloadShops, switchShop, addBranch, shops, admin, enablePush, refresh: () => setTick(t => t + 1), staffMember, can: name => allowed.includes(name),
    isManager: role === 'owner' || role === 'manager',
  };
  const Page = PAGES[page].component;
  // من ليس لديه أقسام في «المزيد» (مثل الموظف) يرى الإعدادات مكانها.
  const tabs = TABS.map(id => (id === 'more' && !allowed.includes('more') ? 'settings' : id)).filter(id => allowed.includes(id));
  const SyncIcon = !cloudEnabled ? null : sync.state === 'error' || sync.state === 'offline' ? CloudOff : sync.state === 'syncing' ? RefreshCw : Cloud;

  return <AppContext.Provider value={context}>
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Scissors size={20} /></span><span><strong>{data.shopName || 'مِقص'}</strong><small>{shops.length > 1 ? 'تبديل الفرع من الإعدادات' : vocab.shop}</small></span></div>
        <nav>{allowed.filter(id => !['more', 'settings', 'admin'].includes(id)).map(id => {
          const Icon = PAGES[id].icon;
          return <button type="button" key={id} className={page === id ? 'active' : ''} onClick={() => go(id)}><Icon size={20} /><span>{id === 'clients' ? vocab.clients : PAGES[id].label}</span></button>;
        })}</nav>
        <div className="sidebar-foot">
          <button type="button" onClick={() => theme.setMode(theme.theme === 'dark' ? 'light' : 'dark')}>{theme.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{theme.theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span></button>
          {cloudEnabled && <button type="button" onClick={() => auth.signOut()}><LogOut size={18} /><span>تسجيل الخروج</span></button>}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title"><h1>{page === 'home' ? (data.shopName || 'مِقص') : page === 'clients' ? vocab.clients : page === 'team' ? vocab.team : PAGES[page].label}</h1></div>
          <div className="topbar-actions">
            {SyncIcon && <button type="button" className={`sync-pill sync-${sync.state}`} onClick={syncNow} title={sync.error || 'مزامنة'}><SyncIcon size={16} className={sync.state === 'syncing' ? 'spin' : ''} />{sync.pending ? <span>{sync.pending}</span> : null}</button>}
            {admin && <button type="button" className={`icon-btn ${page === 'admin' ? 'active' : ''}`} onClick={() => go('admin')} aria-label="لوحة المطوّر"><ShieldCheck size={19} /></button>}
            {allowed.includes('settings') && !tabs.includes('settings') && <button type="button" className={`icon-btn ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')} aria-label="الإعدادات"><Settings2 size={19} /></button>}
          </div>
        </header>
        {license.status === 'trial' && <TrialBanner license={license} shop={shop} />}
        <SubscriptionBanner license={license} shop={shop} />
        {notice && <div className="notice">{notice}</div>}
        <div className="page" key={page}><Page /></div>
      </main>

      <nav className="tabbar">{tabs.map(id => {
        const Icon = PAGES[id].icon;
        return <button type="button" key={id} className={page === id || (id === 'more' && !tabs.includes(page)) ? 'active' : ''} onClick={() => go(id)}><Icon size={22} /><span>{id === 'clients' ? vocab.clients : PAGES[id].label.split(' ')[0]}</span></button>;
      })}</nav>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  </AppContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Root />);
