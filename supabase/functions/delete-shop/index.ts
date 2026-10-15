// حذف صالون نهائياً مع حساب صاحبه وحسابات موظفيه (التي لا تنتمي لصالون آخر).
// يستدعيها مالك التطبيق فقط من لوحته؛ نتحقق من ذلك بحسابه قبل أي حذف.
// ملف مستقل بلا استيرادات حتى يمكن لصقه مباشرة في محرر Supabase.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  // هل الطالب مالك التطبيق؟ (is_admin بصلاحيات حسابه هو)
  const check = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { apikey: ANON_KEY, authorization: auth, 'content-type': 'application/json' }, body: '{}' });
  if (!check.ok || (await check.json()) !== true) return json({ error: 'forbidden' }, 403);

  const { shop_id, delete_owner = true } = await req.json().catch(() => ({}));
  if (!shop_id) return json({ error: 'shop_id required' }, 400);

  const service = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_shop_data`, { method: 'POST', headers: service, body: JSON.stringify({ p_shop: shop_id, p_delete_owner: Boolean(delete_owner) }) });
  if (!res.ok) return json({ error: await res.text() }, 500);
  const { name, users } = await res.json();

  // حذف الحسابات من نظام الدخول (تُغلق جلساتهم على كل الأجهزة).
  const failed: string[] = [];
  for (const id of users ?? []) {
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: service });
    if (!del.ok && del.status !== 404) failed.push(id);
  }
  return json({ deleted: name, accounts: (users ?? []).length - failed.length, failed });
});
