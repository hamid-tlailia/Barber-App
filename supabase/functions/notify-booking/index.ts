// إرسال إشعار Firebase لأجهزة فريق الصالون عند وصول حجز أونلاين أو عبر واتساب.
// تُستدعى من مشغّل قاعدة البيانات (0002_push.sql) مع CRON_SECRET.
import { authorizedCron, dateAr, db, json, timeAr } from '../_shared/common.ts';

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
  const { data: members } = await db.from('shop_members').select('user_id, role, staff_id').eq('shop_id', shop_id);
  const targets = (members ?? []).filter(m => ['owner', 'manager', 'reception'].includes(m.role) || (m.staff_id && m.staff_id === a.staffId)).map(m => m.user_id);
  if (!targets.length) return json({ sent: 0 });
  const { data: tokens } = await db.from('device_tokens').select('token').eq('shop_id', shop_id).in('user_id', targets);
  if (!tokens?.length) return json({ sent: 0 });

  const { data: client } = await db.from('records').select('data').eq('shop_id', shop_id).eq('collection', 'clients').eq('id', a.clientId).maybeSingle();
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
  if (stale.length) await db.from('device_tokens').delete().in('token', stale);
  return json({ sent, removed: stale.length });
});
