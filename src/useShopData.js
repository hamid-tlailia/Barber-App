// بيانات الصالون النشطة: تحميل من الجهاز، حفظ تلقائي، ومزامنة سحابية في الخلفية.
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultData, defaultSettings, loadLegacyData, normalizeData } from './data.js';
import { getItem, setItem } from './lib/store.js';
import { cloudEnabled, diffData, mergeRows, pullChanges, pushChanges, subscribe } from './lib/sync.js';

const keyFor = shopId => `shop:${shopId}`;

export function useShopData(shop, onRemoteBookings) {
  const remoteCb = useRef(onRemoteBookings);
  remoteCb.current = onRemoteBookings;
  const [data, setDataState] = useState(null);
  const [sync, setSync] = useState({ state: 'idle', pending: 0, lastSync: null, error: '' });
  const meta = useRef({ pending: [], cursor: null });
  const dataRef = useRef(null);
  const busy = useRef(false);
  const shopId = shop?.id;
  const cloud = cloudEnabled && shopId && shopId !== 'local';

  const persist = useCallback(next => {
    if (!shopId) return;
    setItem(keyFor(shopId), { data: next, pending: meta.current.pending, cursor: meta.current.cursor });
  }, [shopId]);

  const runSync = useCallback(async () => {
    if (!cloud || busy.current || !dataRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setSync(s => ({ ...s, state: 'offline' })); return; }
    busy.current = true;
    setSync(s => ({ ...s, state: 'syncing' }));
    try {
      const pending = meta.current.pending;
      if (pending.length) {
        await pushChanges(shopId, dataRef.current, pending);
        // تُحذف فقط التغييرات التي رُفعت؛ ما أُضيف أثناء الرفع يبقى للدورة التالية.
        meta.current.pending = meta.current.pending.filter(change => !pending.includes(change));
      }
      const firstPull = !meta.current.cursor;
      const { rows, cursor } = await pullChanges(shopId, meta.current.cursor);
      meta.current.cursor = cursor;
      if (rows.length) {
        // حجوزات وصلت من رابط الحجز أو واتساب ولم تكن على هذا الجهاز ← إشعار.
        if (!firstPull) {
          const known = new Set(dataRef.current.appointments.map(a => a.id));
          const fresh = rows.filter(r => r.collection === 'appointments' && !r.deleted && !known.has(r.id) && ['online', 'whatsapp'].includes(r.data?.source));
          const nameOf = id => rows.find(x => x.collection === 'clients' && x.id === id)?.data?.name || dataRef.current.clients.find(c => c.id === id)?.name;
          if (fresh.length) setTimeout(() => remoteCb.current?.(fresh.map(r => ({ ...r.data, clientName: nameOf(r.data.clientId) }))), 0);
        }
        const merged = mergeRows(dataRef.current, rows, meta.current.pending);
        dataRef.current = merged;
        setDataState(merged);
      }
      persist(dataRef.current);
      setSync({ state: 'synced', pending: meta.current.pending.length, lastSync: Date.now(), error: '' });
    } catch (error) {
      setSync(s => ({ ...s, state: 'error', pending: meta.current.pending.length, error: String(error?.message || error) }));
    } finally { busy.current = false; }
  }, [cloud, shopId, persist]);

  // التحميل الأولي.
  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    (async () => {
      const saved = await getItem(keyFor(shopId));
      let initial = normalizeData(saved?.data);
      meta.current = { pending: saved?.pending || [], cursor: saved?.cursor || null };
      if (!initial && shopId === 'local') initial = loadLegacyData() || defaultData(shop.kind || 'men');
      // صالون سحابي على جهاز جديد: يبدأ فارغاً ثم تملؤه المزامنة (لا بيانات افتراضية قد تتكرر).
      if (!initial) initial = normalizeData({ ...emptyCollections(), services: [], staff: [], shopName: shop.name || '', settings: defaultSettings(shop.kind || 'men') });
      if (cancelled) return;
      dataRef.current = initial;
      setDataState(initial);
      persist(initial);
    })();
    return () => { cancelled = true; };
  }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  // مزامنة دورية + فورية عند أي تغيير على الخادم.
  useEffect(() => {
    if (!cloud || !data) return undefined;
    runSync();
    const unsubscribe = subscribe(shopId, () => setTimeout(runSync, 300));
    const interval = setInterval(runSync, 45000);
    const online = () => runSync();
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', online);
    return () => { unsubscribe(); clearInterval(interval); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', online); };
  }, [cloud, shopId, Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps

  const timer = useRef(null);
  const setData = useCallback(updater => {
    const previous = dataRef.current;
    const next = typeof updater === 'function' ? updater(previous) : updater;
    if (next === previous) return;
    if (cloud) {
      const changes = diffData(previous, next);
      const keys = new Set(changes.map(c => `${c.collection}:${c.id}`));
      meta.current.pending = [...meta.current.pending.filter(c => !keys.has(`${c.collection}:${c.id}`)), ...changes];
      setSync(s => ({ ...s, pending: meta.current.pending.length }));
      clearTimeout(timer.current);
      timer.current = setTimeout(runSync, 800);
    }
    dataRef.current = next;
    setDataState(next);
    persist(next);
  }, [cloud, persist, runSync]);

  return { data, setData, sync, syncNow: runSync };
}

const emptyCollections = () => ({
  clients: [], appointments: [], products: [], stockMovements: [], clientPackages: [], giftCards: [], waitlist: [],
  drawers: [], messages: [], photos: [], expenses: [], packages: [],
});
