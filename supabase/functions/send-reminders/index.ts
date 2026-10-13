// تذكير تلقائي بالمواعيد عبر واتساب. يُستدعى كل ساعة من pg_cron.
// العميل يرد 1 للتأكيد أو 2 للإلغاء — تعالجها دالة whatsapp-webhook.
import {
  authorizedCron, collection, dateAr, db, isoDate, json, localNow, logMessage, saveRecord, sendTemplate, settingsOf, timeAr, toMin, waConfigFor,
} from '../_shared/common.ts';

const TEMPLATE = Deno.env.get('WA_TEMPLATE_REMINDER') ?? 'appointment_reminder';

Deno.serve(async req => {
  if (!authorizedCron(req)) return json({ error: 'unauthorized' }, 401);
  const { data: shops, error } = await db.from('shop_integrations').select('shop_id, reminders_enabled, shops!inner(name)').eq('reminders_enabled', true).eq('wa_addon', true);
  if (error) return json({ error: error.message }, 500);

  const now = localNow();
  const nowMin = Date.parse(`${isoDate(now)}T00:00:00Z`) / 60000 + now.getUTCHours() * 60 + now.getUTCMinutes();
  let sent = 0; const failures: string[] = [];

  for (const shop of shops ?? []) {
    const { data: activeShop } = await db.rpc('shop_active', { p_shop: shop.shop_id });
    if (!activeShop) continue;
    const config = await waConfigFor(shop.shop_id);
    if (!config) continue;
    const settings = await settingsOf(shop.shop_id);
    const windowMin = Number(settings.reminderHours || 24) * 60;
    const [appointments, clients] = await Promise.all([collection(shop.shop_id, 'appointments'), collection(shop.shop_id, 'clients')]);
    const shopName = (shop as any).shops?.name ?? '';

    for (const { id, data: a } of appointments) {
      if (!['pending', 'confirmed'].includes(a.status) || a.reminderSentAt || !a.date || !a.time) continue;
      const startMin = Date.parse(`${a.date}T00:00:00Z`) / 60000 + toMin(a.time);
      if (startMin <= nowMin || startMin - nowMin > windowMin) continue;
      const client = clients.find(c => c.id === a.clientId)?.data;
      if (!client?.phone) continue;
      try {
        await sendTemplate(config, client.phone, TEMPLATE, [String(client.name || '').split(' ')[0], shopName, dateAr(a.date), timeAr(a.time)]);
        await saveRecord(shop.shop_id, 'appointments', id, { ...a, reminderSentAt: isoDate(now) });
        await db.from('wa_outbox').insert({ shop_id: shop.shop_id, phone: client.phone, appointment_id: id, kind: 'reminder' });
        await logMessage(shop.shop_id, 'reminder', a.clientId, id);
        sent++;
      } catch (e) { failures.push(`${shop.shop_id}/${id}: ${(e as Error).message}`); }
    }
  }
  return json({ sent, failures });
});
