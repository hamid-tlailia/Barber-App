// نسخة مستقلة من دالة daily-report للصق في محرر Supabase (تتضمن الأدوات المشتركة).

// أدوات مشتركة لدوال الخادم: عميل Supabase بصلاحيات الخدمة، واتساب Cloud API، والوقت المحلي، وحساب الأوقات المتاحة.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

export const db: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const TZ_OFFSET = Number(Deno.env.get('TZ_OFFSET_MINUTES') ?? 180); // قطر UTC+3
export const localNow = () => new Date(Date.now() + TZ_OFFSET * 60000);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const isoTime = (d: Date) => d.toISOString().slice(11, 16);
export const addDays = (date: string, days: number) => isoDate(new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000));
export const digits = (p: string) => String(p || '').replace(/\D/g, '');
export const samePhone = (a: string, b: string) => digits(a).length >= 7 && digits(a).slice(-8) === digits(b).slice(-8);
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const timeAr = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? 'ص' : 'م'}`; };
export const dateAr = (d: string) => new Intl.DateTimeFormat('ar-QA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// يُشترط لاستدعاء دوال الجدولة: مفتاح سري يعرفه pg_cron فقط.
export const authorizedCron = (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
};

/* ───────── واتساب ───────── */

export type WaConfig = { phoneNumberId: string; token: string };
const GRAPH = 'https://graph.facebook.com/v21.0';

export async function waConfigFor(shopId: string): Promise<WaConfig | null> {
  const { data } = await db.from('shop_integrations').select('wa_phone_number_id, wa_token').eq('shop_id', shopId).maybeSingle();
  if (data?.wa_phone_number_id && data?.wa_token) return { phoneNumberId: data.wa_phone_number_id, token: data.wa_token };
  const phoneNumberId = Deno.env.get('WA_PHONE_NUMBER_ID'); const token = Deno.env.get('WA_TOKEN');
  return phoneNumberId && token ? { phoneNumberId, token } : null;
}

export const waNumber = (phone: string) => {
  const d = digits(phone);
  return d.startsWith('974') || d.length !== 8 ? d : `974${d}`;
};

async function waPost(config: WaConfig, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${await res.text()}`);
  return res.json();
}

export const sendText = (config: WaConfig, to: string, text: string) =>
  waPost(config, { to: waNumber(to), type: 'text', text: { body: text.slice(0, 4000) } });

// رسائل المبادرة (خارج نافذة ٢٤ ساعة) يجب أن تكون قوالب معتمدة من Meta. المعاملات بدون أسطر جديدة.
export const sendTemplate = (config: WaConfig, to: string, name: string, params: string[]) =>
  waPost(config, {
    to: waNumber(to), type: 'template',
    template: { name, language: { code: Deno.env.get('WA_TEMPLATE_LANG') ?? 'ar' }, components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text: text.replace(/\s*\n\s*/g, ' | ').slice(0, 1000) })) }] },
  });

/* ───────── بيانات الصالون ───────── */

export type Rec = { id: string; data: Record<string, any> };

export async function collection(shopId: string, name: string): Promise<Rec[]> {
  const { data, error } = await db.from('records').select('id, data').eq('shop_id', shopId).eq('collection', name).eq('deleted', false);
  if (error) throw error;
  return data as Rec[];
}

export async function settingsOf(shopId: string) {
  const { data } = await db.from('records').select('data').eq('shop_id', shopId).eq('collection', 'meta').eq('id', 'settings').maybeSingle();
  return (data?.data?.settings ?? {}) as Record<string, any>;
}

export async function saveRecord(shopId: string, name: string, id: string, data: Record<string, unknown>) {
  const { error } = await db.from('records').upsert({ shop_id: shopId, collection: name, id, data, deleted: false }, { onConflict: 'shop_id,collection,id' });
  if (error) throw error;
}

export async function logMessage(shopId: string, kind: string, clientId: string, appointmentId = '') {
  const id = crypto.randomUUID();
  await saveRecord(shopId, 'messages', id, { id, kind, clientId, appointmentId, at: isoDate(localNow()), channel: 'whatsapp-api' });
}

/* ───────── الأوقات المتاحة (نفس منطق التطبيق في src/data.js) ───────── */

type Item = { serviceId: string; name: string; price: number; duration: number; processing?: number; staffId?: string };
const active = (status: string) => !['cancelled', 'no_show'].includes(status);

function blocks(a: Record<string, any>) {
  const out: { staffId: string; start: number; end: number }[] = [];
  let cursor = toMin(a.time);
  for (const item of a.items ?? []) {
    const d = Number(item.duration || 0);
    out.push({ staffId: item.staffId || a.staffId || '', start: cursor, end: cursor + Math.max(5, d - Number(item.processing || 0)) });
    cursor += d;
  }
  if (!out.length) out.push({ staffId: a.staffId || '', start: cursor, end: cursor + Number(a.duration || 30) });
  return out;
}

export function conflicts(appointments: Record<string, any>[], candidate: Record<string, any>) {
  const mine = blocks(candidate);
  return appointments.some(o => o.id !== candidate.id && o.date === candidate.date && active(o.status) && blocks(o).some(b => mine.some(m =>
    !(m.staffId && b.staffId && m.staffId !== b.staffId) && m.start < b.end && b.start < m.end)));
}

export function availableSlots(appointments: Record<string, any>[], date: string, items: Item[], staffId: string, settings: Record<string, any>) {
  const hours = settings.hours ?? { open: '09:00', close: '22:00', closedDays: [] };
  if ((hours.closedDays ?? []).includes(new Date(`${date}T12:00:00Z`).getUTCDay())) return [];
  const step = Number(settings.slotStep || 15);
  const duration = items.reduce((s, i) => s + i.duration, 0) || 30;
  const now = localNow();
  const today = isoDate(now);
  const slots: string[] = [];
  for (let m = toMin(hours.open); m + duration <= toMin(hours.close); m += step) {
    if (date === today && m < now.getUTCHours() * 60 + now.getUTCMinutes() + 30) continue;
    const time = fromMin(m);
    if (!conflicts(appointments, { date, time, staffId, items: items.map(i => ({ ...i, staffId: i.staffId || staffId })) })) slots.push(time);
  }
  return slots;
}

export const fill = (template: string, values: Record<string, string>) => String(template || '').replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

// تقرير نهاية اليوم لصاحب الصالون عبر واتساب. يُستدعى يومياً (مثلاً 23:00 بتوقيت قطر) من pg_cron.

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
