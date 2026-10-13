// إرسال إشعار Firebase لأجهزة فريق الصالون عند وصول حجز أونلاين أو عبر واتساب.
// تُستدعى من مشغّل قاعدة البيانات (0002_push.sql) مع CRON_SECRET.
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

Deno.serve(async req => {
  if (!authorizedCron(req)) return json({ error: 'unauthorized' }, 401);
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return json({ skipped: 'FCM_SERVICE_ACCOUNT not set' });
  const sa = JSON.parse(raw) as ServiceAccount;
  const { shop_id, appointment: a } = await req.json();

  // من يستلم: المالك والمدير والاستقبال، والحلاق المعيّن للموعد.
  const members: { user_id: string; role: string; staff_id: string | null }[] = await rest(`shop_members?select=user_id,role,staff_id&shop_id=eq.${shop_id}`);
  const targets = (members ?? []).filter(m => ['owner', 'manager', 'reception'].includes(m.role) || (m.staff_id && m.staff_id === a.staffId)).map(m => m.user_id);
  if (!targets.length) return json({ sent: 0 });
  const tokens: { token: string }[] = await rest(`device_tokens?select=token&shop_id=eq.${shop_id}&user_id=in.(${targets.join(',')})`);
  if (!tokens?.length) return json({ sent: 0 });

  const [client] = await rest(`records?select=data&shop_id=eq.${shop_id}&collection=eq.clients&id=eq.${encodeURIComponent(a.clientId)}&limit=1`);
  const services = (a.items ?? []).map((i: { name: string }) => i.name).join(' + ');
  const title = a.source === 'whatsapp' ? '💬 حجز جديد عبر واتساب' : '📅 حجز جديد أونلاين';
  const body = `${client?.data?.name ?? 'عميل'} · ${dateAr(a.date)} ${timeAr(a.time)}${services ? ` · ${services}` : ''}`;

  const token = await accessToken(sa);
  let sent = 0; const stale: string[] = [];
  for (const { token: device } of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token: device,
        notification: { title, body },
        data: { appointmentId: String(a.id ?? ''), shopId: String(shop_id) },
        android: { priority: 'high', notification: { sound: 'default', channel_id: 'bookings' } },
      } }),
    });
    if (res.ok) sent++;
    else if (res.status === 404 || res.status === 400) stale.push(device); // جهاز ألغى التثبيت
  }
  if (stale.length) await rest(`device_tokens?token=in.(${stale.map(t => `"${t}"`).join(',')})`, { method: 'DELETE' });
  return json({ sent, removed: stale.length });
});
