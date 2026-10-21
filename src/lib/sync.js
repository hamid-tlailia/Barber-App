// المزامنة السحابية (Supabase): المحلي أولاً، ثم رفع التغييرات وسحب الجديد حسب وقت الخادم.
import { createClient } from '@supabase/supabase-js';
import { COLLECTIONS } from '../data.js';
import { L } from '../i18n.js';

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

// الحذف يُرسل كتحديث (وليس upsert): سياسة الإضافة ترفض أي صف محذوف حتى لو كان موجوداً،
// فكان الحذف يعلّق طابور المزامنة كله.
// صف ترفضه الصلاحيات نهائياً (42501) يُستبعد ويُبلَّغ عنه بدل أن يوقف بقية التغييرات.
export async function pushChanges(shopId, data, pending) {
  const rejected = [];
  const live = []; const deleted = {};
  for (const change of pending) {
    if (change.deleted && change.collection !== META) (deleted[change.collection] ||= []).push(change);
    else { const row = rowFor(shopId, data, change); if (row) live.push({ row, change }); }
  }
  const denied = error => error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
  for (let i = 0; i < live.length; i += 200) {
    const batch = live.slice(i, i + 200);
    const { error } = await supabase.from('records').upsert(batch.map(b => b.row), { onConflict: 'shop_id,collection,id' });
    if (!error) continue;
    if (!denied(error)) throw error;
    for (const { row, change } of batch) {
      const { error: one } = await supabase.from('records').upsert(row, { onConflict: 'shop_id,collection,id' });
      if (one) { if (denied(one)) rejected.push(change); else throw one; }
    }
  }
  for (const [collection, changes] of Object.entries(deleted)) {
    for (let i = 0; i < changes.length; i += 200) {
      const batch = changes.slice(i, i + 200);
      const { error } = await supabase.from('records').update({ deleted: true }).eq('shop_id', shopId).eq('collection', collection).in('id', batch.map(c => c.id));
      if (error) { if (denied(error)) rejected.push(...batch); else throw error; }
    }
  }
  return { rejected };
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
  if (!supabase) throw new Error(L('هذه الميزة تحتاج الحساب السحابي', 'This feature requires a cloud account'));
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
  createShop: (name, kind, phone, device) => rpc('create_shop', { p_name: name, p_kind: kind, p_phone: phone, p_device: device || null }),
  phoneAvailable: phone => rpc('shop_phone_available', { p_phone: phone }),
  deletionStatus: shop => rpc('shop_deletion_status', { p_shop: shop }),
  requestDeletion: (shop, reason) => rpc('request_shop_deletion', { p_shop: shop, p_reason: reason }),
  cancelDeletion: shop => rpc('cancel_shop_deletion', { p_shop: shop }),
  // عرض لكل العملاء عبر واتساب (إضافة واتساب الذكي) — dry_run يعيد عدد المستلمين فقط.
  broadcast: async (shop, payload) => {
    const { data, error } = await supabase.functions.invoke('broadcast', { body: { shop_id: shop, ...payload } });
    if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error || error.message);
    return data;
  },
  registerDevice: (shop, device) => rpc('register_device', { p_shop: shop, p_device: device }),
  updateShop: (shop, { name, kind, phone, slug }) => rpc('update_shop', { p_shop: shop, p_name: name, p_kind: kind, p_phone: phone, p_slug: slug || '' }),
  team: shop => rpc('shop_team', { p_shop: shop }),
  createInvite: (shop, role, staffId) => rpc('create_invite', { p_shop: shop, p_role: role, p_staff: staffId || '' }),
  acceptInvite: code => rpc('accept_invite', { p_code: code }),
  setMemberSuspended: (shop, userId, suspended) => rpc('set_member_suspended', { p_shop: shop, p_user: userId, p_suspended: suspended }),
  people: shop => rpc('shop_people', { p_shop: shop }),
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
      .select('owner_whatsapp,reminders_enabled,assistant_enabled,daily_report_enabled,wa_addon,ai_addon').eq('shop_id', shop).maybeSingle();
    return data;
  },
  testPush: shop => rpc('send_test_push', { p_shop: shop }),
  saveIntegration: (shop, v) => rpc('save_integration', {
    p_shop: shop, p_owner_whatsapp: v.ownerWhatsapp || '', p_reminders: Boolean(v.reminders), p_assistant: Boolean(v.assistant), p_daily: Boolean(v.daily),
  }),
  saveDeviceToken: async (shop, token) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('device_tokens').upsert({ token, user_id: user.id, shop_id: shop, platform: 'android', updated_at: new Date().toISOString() });
  },
  publicShop: slug => rpc('public_shop', { p_slug: slug }),
  publicBook: v => rpc('public_book', {
    p_slug: v.slug, p_name: v.name, p_phone: v.phone, p_service_ids: v.serviceIds, p_staff: v.staffId || '', p_date: v.date, p_time: v.time, p_note: v.note || '',
    // يُرسلان فقط عند استخدامهما، حتى يبقى الحجز العادي يعمل قبل تشغيل ملف 0013.
    ...(v.coupon ? { p_coupon: v.coupon } : {}), ...(v.packageId ? { p_package: v.packageId } : {}),
  }),
  publicCheckCoupon: (slug, code) => rpc('public_check_coupon', { p_slug: slug, p_code: code }),
  admin: {
    shops: () => rpc('admin_list_shops'),
    setLicense: (shop, plan, paidUntil, note) => rpc('admin_set_license', { p_shop: shop, p_plan: plan, p_paid_until: paidUntil, p_note: note ?? null }),
    extendTrial: (shop, days) => rpc('admin_extend_trial', { p_shop: shop, p_days: days }),
    integration: shop => rpc('admin_get_integration', { p_shop: shop }),
    grantGrace: shop => rpc('admin_grant_grace', { p_shop: shop }),
    // الحذف النهائي عبر دالة الخادم (تحذف حسابات الدخول أيضاً، وهذا يحتاج مفتاح الخدمة).
    deleteShop: async (shop, deleteOwner = true) => {
      const { data, error } = await supabase.functions.invoke('delete-shop', { body: { shop_id: shop, delete_owner: deleteOwner } });
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error || error.message);
      return data;
    },
    overview: shop => rpc('admin_shop_overview', { p_shop: shop }),
    templates: shop => rpc('admin_get_templates', { p_shop: shop }),
    setTemplates: (shop, templates) => rpc('admin_set_templates', { p_shop: shop, p_templates: templates }),
    setIntegration: (shop, v) => rpc('admin_set_integration', {
      p_shop: shop, p_wa_addon: Boolean(v.waAddon), p_ai_addon: Boolean(v.aiAddon), p_phone_number_id: v.phoneNumberId || '',
      p_token: v.token || '', p_ai_key: v.aiKey || '', p_clear_token: Boolean(v.clearToken), p_clear_ai_key: Boolean(v.clearAiKey), p_ai_provider: v.aiProvider || 'anthropic',
    }),
  },
};

export const errorText = error => {
  const message = String(error?.message || error || '');
  if (/Invalid login credentials/i.test(message)) return L('البريد أو كلمة المرور غير صحيحة', 'Incorrect email or password');
  if (/already registered|already been registered/i.test(message)) return L('هذا البريد مسجل مسبقاً، سجّل الدخول', 'This email is already registered — please sign in');
  if (/Email not confirmed/i.test(message)) return L('أكّد بريدك من الرسالة التي وصلتك ثم سجّل الدخول', 'Confirm your email using the message we sent you, then sign in');
  if (/Password should be/i.test(message)) return L('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'Password must be at least 6 characters');
  if (/row-level security|violates/i.test(message)) return L('لا تملك صلاحية هذا الإجراء أو انتهت فترة التجربة', 'You don\'t have permission for this action, or your trial has ended');
  if (/invalid_invite/.test(message)) return L('رمز الدعوة غير صحيح أو منتهي', 'The invite code is invalid or has expired');
  if (/slot_taken/.test(message)) return L('هذا الوقت حُجز للتو، اختر وقتاً آخر', 'This time was just booked — please choose another');
  if (/invalid_contact/.test(message)) return L('أدخل اسمك ورقم جوال صحيحاً (8 أرقام على الأقل)', 'Enter your name and a valid mobile number (at least 8 digits)');
  if (/invalid_time/.test(message)) return L('هذا الوقت لم يعد متاحاً، اختر وقتاً آخر', 'This time is no longer available — please choose another');
  if (/no_services/.test(message)) return L('اختر خدمة واحدة على الأقل', 'Choose at least one service');
  if (/phone_taken/.test(message)) return L('هذا الرقم مسجّل لصالون آخر — إن كان صالونك فسجّل الدخول بحسابه، أو تواصل معنا', 'This number is registered to another salon — if it is yours, sign in with that account or contact us');
  if (/phone_required/.test(message)) return L('أدخل رقم واتساب صحيحاً للصالون (8 أرقام على الأقل)', 'Enter a valid salon WhatsApp number (at least 8 digits)');
  if (/reason_required/.test(message)) return L('اكتب سبب الحذف', 'Please write the reason for deletion');
  if (/too_soon/.test(message)) return L('أُرسلت حملة خلال آخر 24 ساعة — حماية لرقمك من الحظر، جرّب غداً', 'A campaign was sent in the last 24 hours — to protect your number, try again tomorrow');
  if (/addon_required/.test(message)) return L('الإرسال الجماعي يحتاج اشتراك واتساب الذكي', 'Bulk sending requires the Smart WhatsApp add-on');
  if (/coupon_invalid/.test(message)) return L('كود الخصم غير صحيح', 'Invalid discount code');
  if (/coupon_expired/.test(message)) return L('انتهت صلاحية كود الخصم', 'This discount code has expired');
  if (/coupon_used_up/.test(message)) return L('استُخدم كود الخصم بالحد الأقصى', 'This discount code has reached its limit');
  if (/already_booked/.test(message)) return L('لديك موعد محجوز في هذا اليوم — للتعديل تواصل مع الصالون', 'You already have a booking on this day — contact the salon to change it');
  if (/too_many/.test(message)) return L('وصلت للحد الأقصى من الحجوزات اليوم، تواصل مع الصالون', 'You\'ve reached today\'s booking limit — please contact the salon');
  if (/shop_unavailable/.test(message)) return L('الحجز الأونلاين غير متاح حالياً لهذا الصالون', 'Online booking is currently unavailable for this salon');
  if (/grace_already_given/.test(message)) return L('سبق منح مهلة لهذه الفترة — جدّد الاشتراك أو أوقف الصالون', 'A grace period was already granted for this term — renew the subscription or suspend the salon');
  if (/not_subscribed/.test(message)) return L('المهلة للمشتركين فقط — للتجربة استخدم تمديد التجربة', 'Grace periods are for subscribers only — for trials, use trial extension');
  if (/duplicate key.*slug/i.test(message)) return L('رابط الحجز مستخدم، اختر اسماً آخر', 'This booking link is taken — choose another name');
  if (/Failed to fetch|NetworkError|network/i.test(message)) return L('لا يوجد اتصال بالإنترنت', 'No internet connection');
  return message || L('حدث خطأ غير متوقع', 'An unexpected error occurred');
};

// رابط الحجز العام يجب أن يشير لنسخة الويب المنشورة (وليس لعنوان تطبيق أندرويد الداخلي).
export const publicBase = (import.meta.env?.VITE_PUBLIC_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
// صفحة سياسة الخصوصية (على الموقع حتى داخل تطبيق الهاتف).
export const privacyUrl = `${/localhost|capacitor:|^https?:\/\/127/.test(publicBase) || !publicBase ? 'https://miqass-salon.vercel.app' : publicBase}/privacy/`;
export const bookingUrl = slug => (slug ? `${publicBase}/?book=${slug}` : '');
