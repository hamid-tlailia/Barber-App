// تقرير نهاية اليوم لصاحب الصالون عبر واتساب. يُستدعى يومياً (مثلاً 23:00 بتوقيت قطر) من pg_cron.
import { addDays, authorizedCron, collection, db, isoDate, json, localNow, sendTemplate, timeAr, waConfigFor } from '../_shared/common.ts';

const TEMPLATE = Deno.env.get('WA_TEMPLATE_REPORT') ?? 'daily_report';
const money = (v: number) => `${Math.round(v).toLocaleString('en-US')} ر.ق`;

Deno.serve(async req => {
  if (!authorizedCron(req)) return json({ error: 'unauthorized' }, 401);
  const { data: shops, error } = await db.from('shop_integrations').select('shop_id, owner_whatsapp, shops!inner(name)').eq('daily_report_enabled', true).eq('wa_addon', true).not('owner_whatsapp', 'is', null);
  if (error) return json({ error: error.message }, 500);
  const today = isoDate(localNow());
  let sent = 0; const failures: string[] = [];

  for (const shop of shops ?? []) {
    if (!shop.owner_whatsapp) continue;
    const { data: activeShop } = await db.rpc('shop_active', { p_shop: shop.shop_id });
    if (!activeShop) continue;
    const config = await waConfigFor(shop.shop_id);
    if (!config) continue;
    const [appointments, sales, staff] = await Promise.all(['appointments', 'sales', 'staff'].map(c => collection(shop.shop_id, c)));
    const day = appointments.map(r => r.data).filter(a => a.date === today);
    const income = appointments.flatMap(r => r.data.payments ?? []).filter((p: any) => p.at === today && p.kind !== 'tip' && !['gift', 'package'].includes(p.method)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
      + sales.map(r => r.data).filter(s => s.at === today).reduce((s, x) => s + Number(x.amount || 0), 0);
    const done = day.filter(a => a.status === 'completed');
    const noShow = day.filter(a => a.status === 'no_show').length;
    const byStaff: Record<string, number> = {};
    for (const a of done) for (const i of a.items ?? []) byStaff[i.staffId || a.staffId] = (byStaff[i.staffId || a.staffId] || 0) + Number(i.price || 0);
    const topId = Object.entries(byStaff).sort((a, b) => b[1] - a[1])[0]?.[0];
    const top = staff.find(s => s.id === topId)?.data?.name;
    const tomorrow = appointments.map(r => r.data).filter(a => a.date === addDays(today, 1) && !['cancelled', 'no_show'].includes(a.status)).sort((a, b) => a.time.localeCompare(b.time));
    const report = [
      `الدخل ${money(income)}`,
      `مكتمل ${done.length} من ${day.filter(a => a.status !== 'cancelled').length}`,
      noShow ? `لم يحضر ${noShow}` : '',
      top ? `الأفضل ${top}` : '',
      `مواعيد الغد ${tomorrow.length}${tomorrow[0] ? ` تبدأ ${timeAr(tomorrow[0].time)}` : ''}`,
    ].filter(Boolean).join(' · ');
    try {
      await sendTemplate(config, shop.owner_whatsapp, TEMPLATE, [(shop as any).shops?.name ?? '', report]);
      sent++;
    } catch (e) { failures.push(`${shop.shop_id}: ${(e as Error).message}`); }
  }
  return json({ sent, failures });
});
