// المزامنة السحابية (Supabase): المحلي أولاً، ثم رفع التغييرات وسحب الجديد حسب وقت الخادم.
import { createClient } from '@supabase/supabase-js';
import { COLLECTIONS } from '../data.js';

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export const cloudEnabled = Boolean(supabase);

const META = 'meta';
const SYNCED = [...COLLECTIONS];

// يحدد السجلات المتغيرة بمقارنة المراجع: التحديثات غير القابلة للتغيير تُبقي مراجع العناصر الثابتة.
export function diffData(previous, next) {
  const changes = [];
  if (!previous) return changes;
  for (const name of SYNCED) {
    const before = previous[name] || []; const after = next[name] || [];
    if (before === after) continue;
    const old = new Map(before.map(item => [item.id, item]));
    const seen = new Set();
    for (const item of after) {
      seen.add(item.id);
      if (old.get(item.id) !== item) changes.push({ collection: name, id: item.id });
    }
    for (const item of before) if (!seen.has(item.id)) changes.push({ collection: name, id: item.id, deleted: true });
  }
  if (previous.settings !== next.settings || previous.shopName !== next.shopName) changes.push({ collection: META, id: 'settings' });
  return changes;
}

const rowFor = (shopId, data, change) => {
  if (change.collection === META) return { shop_id: shopId, collection: META, id: 'settings', data: { settings: data.settings, shopName: data.shopName }, deleted: false };
  if (change.deleted) return { shop_id: shopId, collection: change.collection, id: change.id, data: { id: change.id }, deleted: true };
  const item = (data[change.collection] || []).find(entry => entry.id === change.id);
  return item ? { shop_id: shopId, collection: change.collection, id: change.id, data: item, deleted: false } : null;
};

export async function pushChanges(shopId, data, pending) {
  const rows = pending.map(change => rowFor(shopId, data, change)).filter(Boolean);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('records').upsert(rows.slice(i, i + 200), { onConflict: 'shop_id,collection,id' });
    if (error) throw error;
  }
}

export async function pullChanges(shopId, since) {
  const rows = [];
  let cursor = since || '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await supabase.from('records').select('collection,id,data,deleted,updated_at')
      .eq('shop_id', shopId).gt('updated_at', cursor).order('updated_at').limit(1000);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
    cursor = data.at(-1).updated_at;
  }
  return { rows, cursor: rows.at(-1)?.updated_at || since };
}

// يدمج السجلات المسحوبة، مع إبقاء التعديلات المحلية التي لم تُرفع بعد.
export function mergeRows(data, rows, pending = []) {
  if (!rows.length) return data;
  const dirty = new Set(pending.map(change => `${change.collection}:${change.id}`));
  const next = { ...data };
  const touched = {};
  for (const row of rows) {
    if (dirty.has(`${row.collection}:${row.id}`)) continue;
    if (row.collection === META) {
      if (row.data?.settings) next.settings = { ...next.settings, ...row.data.settings };
      if (row.data?.shopName) next.shopName = row.data.shopName;
      continue;
    }
    if (!SYNCED.includes(row.collection)) continue;
    touched[row.collection] ||= new Map((next[row.collection] || []).map(item => [item.id, item]));
    if (row.deleted) touched[row.collection].delete(row.id);
    else touched[row.collection].set(row.id, row.data);
  }
  for (const [name, map] of Object.entries(touched)) next[name] = [...map.values()];
  return next;
}

export function subscribe(shopId, onChange) {
  const channel = supabase.channel(`records-${shopId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `shop_id=eq.${shopId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ───────────── الحسابات والصالونات ───────────── */

export const auth = {
  session: async () => (await supabase.auth.getSession()).data.session,
  onChange: callback => supabase.auth.onAuthStateChange((_event, session) => callback(session)).data.subscription,
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email, password, name) => supabase.auth.signUp({ email, password, options: { data: { name } } }),
  reset: email => supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
  updatePassword: password => supabase.auth.updateUser({ password }),
  signOut: () => supabase.auth.signOut(),
};

const rpc = async (name, args) => {
  if (!supabase) throw new Error('هذه الميزة تحتاج الحساب السحابي');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};

export const api = {
  myShops: () => rpc('my_shops'),
  isAdmin: async () => {
    const { data } = await supabase.from('app_admins').select('user_id').limit(1);
    return Boolean(data?.length);
  },
  createShop: (name, kind, phone) => rpc('create_shop', { p_name: name, p_kind: kind, p_phone: phone }),
  updateShop: (shop, { name, kind, phone, slug }) => rpc('update_shop', { p_shop: shop, p_name: name, p_kind: kind, p_phone: phone, p_slug: slug || '' }),
  team: shop => rpc('shop_team', { p_shop: shop }),
  createInvite: (shop, role, staffId) => rpc('create_invite', { p_shop: shop, p_role: role, p_staff: staffId || '' }),
  acceptInvite: code => rpc('accept_invite', { p_code: code }),
  removeMember: async (shop, userId) => {
    const { error } = await supabase.from('shop_members').delete().eq('shop_id', shop).eq('user_id', userId);
    if (error) throw error;
  },
  audit: async (shop, limit = 100) => {
    const { data, error } = await supabase.from('audit_log').select('*').eq('shop_id', shop).order('at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  },
  integration: async shop => {
    const { data } = await supabase.from('shop_integrations')
      .select('wa_phone_number_id,owner_whatsapp,reminders_enabled,assistant_enabled,daily_report_enabled').eq('shop_id', shop).maybeSingle();
    return data;
  },
  saveIntegration: (shop, v) => rpc('save_integration', {
    p_shop: shop, p_phone_number_id: v.phoneNumberId || '', p_token: v.token || '', p_owner_whatsapp: v.ownerWhatsapp || '',
    p_reminders: Boolean(v.reminders), p_assistant: Boolean(v.assistant), p_daily: Boolean(v.daily),
  }),
  publicShop: slug => rpc('public_shop', { p_slug: slug }),
  publicBook: v => rpc('public_book', {
    p_slug: v.slug, p_name: v.name, p_phone: v.phone, p_service_ids: v.serviceIds, p_staff: v.staffId || '', p_date: v.date, p_time: v.time, p_note: v.note || '',
  }),
  admin: {
    shops: () => rpc('admin_list_shops'),
    setLicense: (shop, plan, paidUntil, note) => rpc('admin_set_license', { p_shop: shop, p_plan: plan, p_paid_until: paidUntil, p_note: note ?? null }),
    extendTrial: (shop, days) => rpc('admin_extend_trial', { p_shop: shop, p_days: days }),
  },
};

export const errorText = error => {
  const message = String(error?.message || error || '');
  if (/Invalid login credentials/i.test(message)) return 'البريد أو كلمة المرور غير صحيحة';
  if (/already registered|already been registered/i.test(message)) return 'هذا البريد مسجل مسبقاً، سجّل الدخول';
  if (/Email not confirmed/i.test(message)) return 'أكّد بريدك من الرسالة التي وصلتك ثم سجّل الدخول';
  if (/Password should be/i.test(message)) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  if (/row-level security|violates/i.test(message)) return 'لا تملك صلاحية هذا الإجراء أو انتهت فترة التجربة';
  if (/invalid_invite/.test(message)) return 'رمز الدعوة غير صحيح أو منتهي';
  if (/slot_taken/.test(message)) return 'هذا الوقت حُجز للتو، اختر وقتاً آخر';
  if (/too_many/.test(message)) return 'وصلت للحد الأقصى من الحجوزات اليوم، تواصل مع الصالون';
  if (/shop_unavailable/.test(message)) return 'الحجز الأونلاين غير متاح حالياً لهذا الصالون';
  if (/duplicate key.*slug/i.test(message)) return 'رابط الحجز مستخدم، اختر اسماً آخر';
  if (/Failed to fetch|NetworkError|network/i.test(message)) return 'لا يوجد اتصال بالإنترنت';
  return message || 'حدث خطأ غير متوقع';
};

// رابط الحجز العام يجب أن يشير لنسخة الويب المنشورة (وليس لعنوان تطبيق أندرويد الداخلي).
export const publicBase = (import.meta.env?.VITE_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
export const bookingUrl = slug => (slug ? `${publicBase}/?book=${slug}` : '');
