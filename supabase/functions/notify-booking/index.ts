// إشعارات Firebase: حجز جديد (أونلاين/واتساب)، عمليات الموظفين لصاحب الصالون،
// واشتراكات قريبة من الانتهاء للمالك. تُستدعى من مشغّلات قاعدة البيانات و pg_cron مع CRON_SECRET.
// ملف مستقل بلا استيرادات حتى يمكن لصقه مباشرة في محرر Supabase من الهاتف.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const authorizedCron = (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
};
const timeAr = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? 'ص' : 'م'}`; };
const dateAr = (d: string) => new Intl.DateTimeFormat('ar-QA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

// استعلام REST مباشر بصلاحية الخدمة (بدون مكتبات).
async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`rest ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cached: { token: string; exp: number } | null = null;

// رمز وصول Google OAuth من حساب الخدمة (JWT موقّع RS256).
async function accessToken(sa: ServiceAccount) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${await res.text()}`);
  const body = await res.json();
  cached = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

// يرسل لأجهزة محددة ويحذف الأجهزة التي ألغت التثبيت.
async function sendTo(sa: ServiceAccount, tokens: string[], title: string, body: string, data: Record<string, string> = {}) {
  if (!tokens.length) return 0;
  const token = await accessToken(sa);
  let sent = 0; const stale: string[] = [];
  for (const device of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token: device,
        notification: { title, body },
        data,
        android: { priority: 'high', notification: { sound: 'default', channel_id: 'bookings', icon: 'ic_stat_notify', color: '#D59A4E' } },
      } }),
    });
    if (res.ok) sent++;
    else if (res.status === 404 || res.status === 400) stale.push(device); // جهاز ألغى التثبيت
  }
  if (stale.length) await rest(`device_tokens?token=in.(${stale.map(t => `"${t}"`).join(',')})`, { method: 'DELETE' });
  return sent;
}

const tokensOf = async (userIds: string[], shopId?: string) => {
  if (!userIds.length) return [];
  const rows: { token: string }[] = await rest(`device_tokens?select=token&user_id=in.(${userIds.join(',')})${shopId ? `&shop_id=eq.${shopId}` : ''}`);
  return [...new Set((rows ?? []).map(r => r.token))];
};

async function booking(sa: ServiceAccount, shop_id: string, a: any) {
  // من يستلم: المالك والمدير والاستقبال، والحلاق المعيّن للموعد.
  const members: { user_id: string; role: string; staff_id: string | null; suspended: boolean }[] = await rest(`shop_members?select=user_id,role,staff_id,suspended&shop_id=eq.${shop_id}`);
  const targets = (members ?? []).filter(m => !m.suspended && (['owner', 'manager', 'reception'].includes(m.role) || (m.staff_id && m.staff_id === a.staffId))).map(m => m.user_id);
  const [client] = await rest(`records?select=data&shop_id=eq.${shop_id}&collection=eq.clients&id=eq.${encodeURIComponent(a.clientId)}&limit=1`);
  const services = (a.items ?? []).map((i: { name: string }) => i.name).join(' + ');
  const title = a.source === 'whatsapp' ? '💬 حجز جديد عبر واتساب' : '📅 حجز جديد أونلاين';
  const body = `${client?.data?.name ?? 'عميل'} · ${dateAr(a.date)} ${timeAr(a.time)}${services ? ` · ${services}` : ''}`;
  return sendTo(sa, await tokensOf(targets, shop_id), title, body, { appointmentId: String(a.id ?? ''), shopId: String(shop_id) });
}

const COLLECTION_AR: Record<string, string> = {
  appointments: 'موعد', clients: 'عميل', sales: 'عملية بيع', expenses: 'مصروف', drawers: 'إغلاق الصندوق', services: 'خدمة',
  products: 'منتج', giftCards: 'بطاقة هدية', clientPackages: 'باقة عميل', staff: 'موظف',
};
const STATUS_AR: Record<string, string> = { pending: 'بانتظار التأكيد', confirmed: 'مؤكد', arrived: 'وصل', in_service: 'قيد الخدمة', completed: 'مكتمل', cancelled: 'ملغى', no_show: 'لم يحضر' };
const money = (v: unknown) => `${Number(v || 0).toLocaleString('en-US')} ر.ق`;

// وصف مختصر لما فعله الموظف.
function describe(collection: string, action: string, before: any, after: any) {
  const what = COLLECTION_AR[collection] ?? collection;
  const name = after?.name || before?.name || after?.label || before?.label || '';
  if (action === 'delete') return `حذف ${what}${name ? ` «${name}»` : ''}`;
  if (action === 'create') {
    if (collection === 'appointments') return `أضاف موعداً ${after?.date ?? ''} ${after?.time ? timeAr(after.time) : ''}`.trim();
    if (collection === 'expenses' || collection === 'sales') return `سجّل ${what} ${money(after?.amount)}${name ? ` — ${name}` : ''}`;
    if (collection === 'drawers') return `أغلق الصندوق — الفرق ${money(after?.difference)}`;
    return `أضاف ${what}${name ? ` «${name}»` : ''}`;
  }
  if (collection === 'appointments') {
    const paidBefore = (before?.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const paidAfter = (after?.payments ?? []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    if (paidAfter > paidBefore) return `استلم دفعة ${money(paidAfter - paidBefore)}`;
    if (paidAfter < paidBefore) return `ألغى دفعة ${money(paidBefore - paidAfter)} ⚠️`;
    if (before?.status !== after?.status) return `غيّر حالة موعد إلى «${STATUS_AR[after?.status] ?? after?.status}»`;
    if (before?.date !== after?.date || before?.time !== after?.time) return `نقل موعداً إلى ${after?.date} ${after?.time ? timeAr(after.time) : ''}`;
    if (Number(before?.discount || 0) !== Number(after?.discount || 0)) return `غيّر الخصم إلى ${money(after?.discount)}`;
    return 'عدّل موعداً';
  }
  if (Number(before?.price ?? 0) !== Number(after?.price ?? 0)) return `غيّر سعر ${what}${name ? ` «${name}»` : ''} إلى ${money(after?.price)}`;
  return `عدّل ${what}${name ? ` «${name}»` : ''}`;
}

async function activity(sa: ServiceAccount, payload: any) {
  const { shop_id, user_id, collection, action, before, after } = payload;
  // تعديلات المواعيد البسيطة (مثل وصل/قيد الخدمة) كثيرة؛ نكتفي بالمهم منها.
  const text = describe(collection, action, before, after);
  if (collection === 'appointments' && action === 'update' && /^(عدّل موعداً|غيّر حالة موعد إلى «(وصل|قيد الخدمة|مؤكد)»)$/.test(text)) return 0;
  const members: { user_id: string; role: string; display_name: string | null }[] = await rest(`shop_members?select=user_id,role,display_name&shop_id=eq.${shop_id}`);
  const actor = members?.find(m => m.user_id === user_id)?.display_name ?? 'موظف';
  const owners = (members ?? []).filter(m => m.role === 'owner').map(m => m.user_id);
  return sendTo(sa, await tokensOf(owners, shop_id), `👤 ${actor}`, text, { kind: 'activity', shopId: String(shop_id) });
}

async function expiring(sa: ServiceAccount) {
  // صالونات ينتهي اشتراكها أو تجربتها خلال يومين، أو في المهلة — للمالك فقط.
  const now = new Date().toISOString();
  const q = (v: string) => `"${v}"`;
  const soon = q(new Date(Date.now() + 2 * 86400000).toISOString());
  const nowQ = q(now);
  const shops: { name: string; paid_until: string | null; trial_ends_at: string; grace_until: string | null; plan: string }[] =
    await rest(`shops?select=name,paid_until,trial_ends_at,grace_until,plan&plan=neq.suspended&or=(and(paid_until.gt.${nowQ},paid_until.lt.${soon}),and(paid_until.is.null,trial_ends_at.gt.${nowQ},trial_ends_at.lt.${soon}),grace_until.gt.${nowQ})`);
  if (!shops?.length) return 0;
  const admins: { user_id: string }[] = await rest('app_admins?select=user_id');
  const lines = shops.map(s => `${s.name}: ${s.grace_until && s.grace_until > now ? 'في المهلة' : s.paid_until ? 'ينتهي الاشتراك قريباً' : 'تنتهي التجربة قريباً'}`);
  return sendTo(sa, await tokensOf((admins ?? []).map(a => a.user_id)), `⏰ ${shops.length} صالون يحتاج متابعة`, lines.slice(0, 4).join(' · '), { kind: 'expiring' });
}

Deno.serve(async req => {
  if (!authorizedCron(req)) return json({ error: 'unauthorized' }, 401);
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return json({ skipped: 'FCM_SERVICE_ACCOUNT not set' });
  const sa = JSON.parse(raw) as ServiceAccount;
  const payload = await req.json();
  if (payload.kind === 'activity') return json({ sent: await activity(sa, payload) });
  if (payload.kind === 'expiring') return json({ sent: await expiring(sa) });
  return json({ sent: await booking(sa, payload.shop_id, payload.appointment) });
});
