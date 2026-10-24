// إرسال عرض لكل عملاء الصالون عبر واتساب (قالب تسويقي معتمد من Meta) — لإضافة واتساب الذكي فقط.
// يستدعيها صاحب الصالون أو المدير من التطبيق؛ نتحقق من صلاحيته بحسابه، ومرة واحدة كل 24 ساعة لكل صالون.
import { collection, db, digits, isoDate, json, localNow, saveRecord, sendTemplate, OFFER_WEIGHT, waConfigFor, waQuotaLeft } from '../_shared/common.ts';

const TEMPLATE = Deno.env.get('WA_TEMPLATE_OFFER') ?? 'promo_offer';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('authorization') ?? '';
  const { shop_id, text, title, dry_run } = await req.json().catch(() => ({}));
  if (!shop_id || !String(text || '').trim()) return reply({ error: 'text_required' }, 400);

  // صلاحية الطالب في هذا الصالون (بحسابه هو).
  const roleRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/member_role`, {
    method: 'POST', headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ p_shop: shop_id }),
  });
  const role = roleRes.ok ? await roleRes.json() : null;
  if (!['owner', 'manager'].includes(role)) return reply({ error: 'forbidden' }, 403);

  const { data: integ } = await db.from('shop_integrations').select('wa_addon').eq('shop_id', shop_id).maybeSingle();
  if (!integ?.wa_addon) return reply({ error: 'addon_required' }, 402);
  const { data: active } = await db.rpc('shop_active', { p_shop: shop_id });
  if (!active) return reply({ error: 'shop_inactive' }, 402);
  const config = await waConfigFor(shop_id);
  if (!config) return reply({ error: 'whatsapp_not_configured' }, 400);

  const [clients, settingsRows, campaigns] = await Promise.all([collection(shop_id, 'clients'), collection(shop_id, 'meta'), collection(shop_id, 'campaigns')]);
  const shopName = (await db.from('shops').select('name').eq('id', shop_id).maybeSingle()).data?.name ?? '';
  // العملاء: رقم صحيح، ليس «زبون عابر»، ولم يطلب إيقاف العروض. بدون تكرار للرقم نفسه.
  const seen = new Set<string>();
  const recipients = clients.map(c => c.data).filter(c => {
    const d = digits(c.phone).slice(-8);
    if (c.id === 'walk-in' || c.noOffers || digits(c.phone).length < 8 || seen.has(d)) return false;
    seen.add(d); return true;
  }).slice(0, 2000);
  // رسالة العرض تسويقية (أغلى عند Meta) فتُحسب بـ OFFER_WEIGHT رسائل من رصيد الشهر. لا نرسل عرضاً لا يكفيه الرصيد (لا إرسال جزئي مربك).
  const left = await waQuotaLeft(shop_id);
  const needed = recipients.length * OFFER_WEIGHT;
  if (dry_run) return reply({ recipients: recipients.length, needed, left: Number.isFinite(left) ? left : null });
  if (needed > left) return reply({ error: 'quota_exceeded', left, needed }, 402);

  const last = campaigns.map(c => c.data.at).filter(Boolean).sort().pop();
  if (last && Date.now() - Date.parse(last) < 24 * 3600000) return reply({ error: 'too_soon', next: new Date(Date.parse(last) + 24 * 3600000).toISOString() }, 429);

  const body = String(text).trim().slice(0, 700);
  let sent = 0; const failed: string[] = [];
  for (let i = 0; i < recipients.length; i += 20) {
    await Promise.all(recipients.slice(i, i + 20).map(async c => {
      const first = String(c.name || '').trim().split(/\s+/)[0] || '';
      try {
        try { await sendTemplate(config, c.phone, TEMPLATE, [first, shopName, body], c.lang === 'en' ? 'en' : 'ar'); }
        catch (e) { if (c.lang === 'en') await sendTemplate(config, c.phone, TEMPLATE, [first, shopName, body], 'ar'); else throw e; }
        sent++;
        await db.from('wa_outbox').insert({ shop_id, phone: c.phone, kind: 'offer' });
      } catch (e) { failed.push(`${c.phone}: ${(e as Error).message.slice(0, 120)}`); }
    }));
  }
  const id = crypto.randomUUID();
  await saveRecord(shop_id, 'campaigns', id, { id, at: new Date().toISOString(), date: isoDate(localNow()), title: String(title || '').slice(0, 120), text: body, sent, failed: failed.length, channel: 'whatsapp-api' });
  return reply({ sent, failed: failed.length, errors: failed.slice(0, 3) });
});
