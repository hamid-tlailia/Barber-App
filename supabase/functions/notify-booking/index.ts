// إشعارات Firebase: حجز جديد (أونلاين/واتساب)، عمليات الموظفين لصاحب الصالون.
// ولمالك التطبيق (جوال + بريد): صالون جديد، وتجارب واشتراكات قريبة من الانتهاء أو انتهت. تُستدعى من مشغّلات قاعدة البيانات و pg_cron مع CRON_SECRET.
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

// موعد حُجز أو حُوِّل لموظف من داخل التطبيق: يصل الموظف المعيّن فقط (وليس من قام بالحجز نفسه).
async function assigned(sa: ServiceAccount, payload: any) {
  const { shop_id, appointment: a, actor, kind } = payload;
  const staffId = a.staffId || (a.items ?? []).find((i: any) => i.staffId)?.staffId;
  if (!staffId) return 0;
  const members: { user_id: string; staff_id: string | null; suspended: boolean }[] = await rest(`shop_members?select=user_id,staff_id,suspended&shop_id=eq.${shop_id}`);
  const targets = (members ?? []).filter(m => !m.suspended && m.staff_id === staffId && m.user_id !== actor).map(m => m.user_id);
  if (!targets.length) return 0;
  const [client] = a.clientId ? await rest(`records?select=data&shop_id=eq.${shop_id}&collection=eq.clients&id=eq.${encodeURIComponent(a.clientId)}&limit=1`) : [];
  const services = (a.items ?? []).map((i: { name: string }) => i.name).join(' + ');
  const title = kind === 'reassigned' ? '🔁 حُوِّل إليك موعد' : '📅 موعد جديد لك';
  const body = `${client?.data?.name ?? 'عميل'} · ${dateAr(a.date)} ${timeAr(a.time)}${services ? ` · ${services}` : ''}`;
  return sendTo(sa, await tokensOf(targets, shop_id), title, body, { appointmentId: String(a.id ?? ''), shopId: String(shop_id), date: String(a.date ?? '') });
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
  // موظف أنهى موعداً: إشعار «للتحصيل» يفتح شاشة الدفع باسم الزبون، لمن يستلم المال (المالك والمدير والاستقبال).
  if (collection === 'appointments' && action === 'update' && before?.status !== 'completed' && after?.status === 'completed') {
    const total = Math.max(0, (after.items ?? []).reduce((sum: number, i: any) => sum + Number(i.price || 0), 0) - Number(after.discount || 0));
    const paid = (after.payments ?? []).filter((p: any) => p.kind !== 'tip').reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const [client] = after.clientId ? await rest(`records?select=data&shop_id=eq.${shop_id}&collection=eq.clients&id=eq.${encodeURIComponent(after.clientId)}&limit=1`) : [];
    const cashiers = (members ?? []).filter(m => ['owner', 'manager', 'reception'].includes(m.role) && m.user_id !== user_id).map(m => m.user_id);
    const services = (after.items ?? []).map((i: { name: string }) => i.name).join(' + ');
    const due = total - paid;
    return sendTo(sa, await tokensOf(cashiers, shop_id), `✂️ ${actor} أنهى موعد ${client?.data?.name ?? 'عميل'}`,
      `${services}${due > 0 ? ` · المستحق ${money(due)} — اضغط للتحصيل` : ' · مدفوع ✓'}`,
      { kind: due > 0 ? 'collect' : 'activity', appointmentId: String(after.id ?? ''), shopId: String(shop_id) });
  }
  const owners = (members ?? []).filter(m => m.role === 'owner').map(m => m.user_id);
  return sendTo(sa, await tokensOf(owners, shop_id), `👤 ${actor}`, text, { kind: 'activity', shopId: String(shop_id) });
}

// ردّ العميل على تذكير واتساب (1 تأكيد / 2 إلغاء): للمالك والمدير والاستقبال والحلاق المعيّن.
async function waReply(sa: ServiceAccount, payload: any) {
  const { shop_id, confirm, client, appointment: a } = payload;
  const members: { user_id: string; role: string; staff_id: string | null; suspended: boolean }[] = await rest(`shop_members?select=user_id,role,staff_id,suspended&shop_id=eq.${shop_id}`);
  const staffId = a?.staffId || (a?.items ?? []).find((i: any) => i.staffId)?.staffId || '';
  const users = (members ?? []).filter(m => !m.suspended && (['owner', 'manager', 'reception'].includes(m.role) || (staffId && m.staff_id === staffId))).map(m => m.user_id);
  const when = a?.date ? `${dateAr(a.date)} · ${timeAr(String(a.time ?? '00:00'))}` : '';
  return sendTo(sa, await tokensOf(users, shop_id), confirm ? `✅ ${client || 'عميل'} أكّد موعده عبر واتساب` : `❌ ${client || 'عميل'} ألغى موعده عبر واتساب`,
    when, { kind: 'booking', appointmentId: String(a?.id ?? ''), date: String(a?.date ?? ''), shopId: String(shop_id) });
}

// بريد لمالك التطبيق عبر Resend (اختياري): RESEND_API_KEY و ADMIN_EMAIL، و MAIL_FROM إن كان لديك نطاق موثّق.
async function emailAdmin(subject: string, lines: string[]) {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_EMAIL');
  if (!key || !to) return false;
  const from = Deno.env.get('MAIL_FROM') || 'Miqass <onboarding@resend.dev>';
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7">${lines.map(l => `<p style="margin:0 0 6px">${esc(l)}</p>`).join('')}</div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: to.split(',').map(x => x.trim()).filter(Boolean), subject, html, text: lines.join('\n') }),
  });
  if (!res.ok) console.error('resend', res.status, await res.text());
  return res.ok;
}

// إشعار جوال (إن وُجد حساب Firebase) + بريد لمالك التطبيق.
async function notifyAdmins(sa: ServiceAccount | null, title: string, lines: string[], data: Record<string, string>) {
  let pushed = 0;
  if (sa) {
    const admins: { user_id: string }[] = await rest('app_admins?select=user_id');
    pushed = await sendTo(sa, await tokensOf((admins ?? []).map(a => a.user_id)), title, lines.slice(0, 4).join(' · '), data);
  }
  const emailed = await emailAdmin(title, lines);
  return { pushed, emailed };
}

const KIND_AR: Record<string, string> = { men: 'رجالي', women: 'نسائي', mixed: 'مختلط' };

async function newShop(sa: ServiceAccount | null, shopId: string) {
  const info = await rest('rpc/new_shop_info', { method: 'POST', body: JSON.stringify({ p_shop: shopId }) });
  if (!info) return { pushed: 0, emailed: false };
  const lines = [
    `${info.name} (${KIND_AR[info.kind] ?? info.kind})`,
    `البريد: ${info.email ?? '—'} · الهاتف: ${info.phone || '—'}`,
    info.trial ? 'بدأ تجربة مجانية 7 أيام' : 'بدون تجربة (سبق استخدامها) — يحتاج تفعيلاً',
    ...(info.duplicate_of ? [`⚠️ مكرر محتمل مع: ${info.duplicate_of}`] : []),
    `إجمالي الصالونات: ${info.total}`,
  ];
  return notifyAdmins(sa, `🎉 صالون جديد: ${info.name}`, lines, { kind: 'new_shop', shopId: String(shopId) });
}

async function deletionRequest(sa: ServiceAccount | null, shopId: string) {
  const info = await rest('rpc/deletion_request_info', { method: 'POST', body: JSON.stringify({ p_shop: shopId }) });
  if (!info) return { pushed: 0, emailed: false };
  const lines = [
    `طلب حذف صالون «${info.name}» وحساب صاحبه`,
    `السبب: ${info.reason || '—'}`,
    `البريد: ${info.email ?? '—'} · الهاتف: ${info.phone || '—'} · الحسابات: ${info.members}`,
    ...(info.paid_until && info.paid_until > new Date().toISOString() ? [`⚠️ لديه اشتراك مدفوع حتى ${String(info.paid_until).slice(0, 10)}`] : []),
    'للموافقة: لوحة المالك ← الصالون ← حذف نهائي',
  ];
  return notifyAdmins(sa, `🗑️ طلب حذف: ${info.name}`, lines, { kind: 'deletion_request', shopId: String(shopId) });
}

async function expiring(sa: ServiceAccount | null) {
  // يومياً: ما ينتهي خلال يومين، ما في المهلة، وما انتهى خلال آخر 24 ساعة (تجربة أو اشتراك).
  const now = new Date().toISOString();
  const q = (v: string) => `"${v}"`;
  const soon = q(new Date(Date.now() + 2 * 86400000).toISOString());
  const dayAgo = q(new Date(Date.now() - 86400000).toISOString());
  const nowQ = q(now);
  const shops: { name: string; phone: string | null; paid_until: string | null; trial_ends_at: string; grace_until: string | null; plan: string }[] =
    await rest(`shops?select=name,phone,paid_until,trial_ends_at,grace_until,plan&plan=neq.suspended&or=(and(paid_until.gt.${dayAgo},paid_until.lt.${soon}),and(paid_until.is.null,trial_ends_at.gt.${dayAgo},trial_ends_at.lt.${soon}),grace_until.gt.${nowQ})`);
  if (!shops?.length) return { pushed: 0, emailed: false };
  const state = (s: typeof shops[number]) => {
    if (s.grace_until && s.grace_until > now) return 'في مهلة السداد';
    if (s.paid_until) return s.paid_until > now ? 'ينتهي الاشتراك خلال يومين' : 'انتهى الاشتراك أمس';
    return s.trial_ends_at > now ? 'تنتهي التجربة خلال يومين' : 'انتهت التجربة';
  };
  const lines = shops.map(s => `${s.name}${s.phone ? ` (${s.phone})` : ''}: ${state(s)}`);
  const ended = shops.filter(s => state(s).startsWith('انته')).length;
  return notifyAdmins(sa, `⏰ ${shops.length} صالون يحتاج متابعة${ended ? ` — ${ended} انتهى` : ''}`, lines, { kind: 'expiring' });
}

Deno.serve(async req => {
  if (!authorizedCron(req)) return json({ error: 'unauthorized' }, 401);
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  const sa = raw ? JSON.parse(raw) as ServiceAccount : null;
  const payload = await req.json();
  // إشعارات مالك التطبيق تعمل بالبريد حتى بدون Firebase.
  if (payload.kind === 'new_shop') return json(await newShop(sa, payload.shop_id));
  if (payload.kind === 'expiring') return json(await expiring(sa));
  if (payload.kind === 'deletion_request') return json(await deletionRequest(sa, payload.shop_id));
  if (!sa) return json({ skipped: 'FCM_SERVICE_ACCOUNT not set' });
  if (payload.kind === 'activity') return json({ sent: await activity(sa, payload) });
  if (payload.kind === 'wa_reply') return json({ sent: await waReply(sa, payload) });
  if (payload.kind === 'assigned' || payload.kind === 'reassigned') return json({ sent: await assigned(sa, payload) });
  return json({ sent: await booking(sa, payload.shop_id, payload.appointment) });
});
