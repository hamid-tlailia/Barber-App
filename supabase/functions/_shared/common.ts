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
const hm = (t: unknown) => (typeof t === 'string' && /^\d{1,2}:\d{2}/.test(t) ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1].slice(0, 2)) : null);

// موعد تقرير نهاية اليوم ويوم الحسابات حسب ساعات الصالون (مثل businessDay في التطبيق).
// now بتوقيت الصالون (localNow). الصالون الذي يغلق 02:00 يصله التقرير 02:00 عن اليوم الذي بدأ فيه.
export function reportSchedule(hours: Record<string, any> | undefined, now: Date) {
  const open = hm(hours?.open); const close = hm(hours?.close);
  const today = isoDate(now);
  if (!hours || hours.allDay || open === null || close === null) return { hour: 23, day: today };
  const hour = Math.ceil(close / 60) % 24;
  if (close > open) return { hour, day: today };
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return { hour, day: minutes < (open + close) / 2 ? addDays(today, -1) : today };
}
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
export const sendTemplate = (config: WaConfig, to: string, name: string, params: string[], lang?: string) =>
  waPost(config, {
    to: waNumber(to), type: 'template',
    template: { name, language: { code: lang ?? Deno.env.get('WA_TEMPLATE_LANG') ?? 'ar' }, components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text: text.replace(/\s*\n\s*/g, ' | ').slice(0, 1000) })) }] },
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

// رسالة العرض تُحسب بـ3 من الرصيد (نفس الوزن في wa_usage بقاعدة البيانات).
export const OFFER_WEIGHT = 3;

// رصيد رسائل «واتساب الذكي» المتبقي هذا الشهر (التذكير والعروض والتقرير اليومي). عند تعذّر القراءة لا نوقف الإرسال.
export async function waQuotaLeft(shopId: string) {
  const { data, error } = await db.rpc('wa_usage', { p_shop: shopId });
  if (error || !data) { console.error('wa_usage', error?.message); return Infinity; }
  return Number(data.left ?? 0);
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

// فترات العمل بالدقائق: تدعم «مفتوح 24 ساعة» والإغلاق بعد منتصف الليل (نفس openWindows في src/data.js).
export function openWindows(hours: Record<string, any> | undefined, date: string): [number, number][] {
  const h = hours ?? { open: '09:00', close: '22:00', closedDays: [] };
  if (h.allDay) return [[0, 1440]];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const closed = (h.closedDays ?? []).map(Number);
  const open = toMin(h.open || '09:00');
  let close = toMin(h.close || '22:00');
  if (close === 0 && open > 0) close = 1440;
  if (close >= open) return closed.includes(weekday) ? [] : [[open, close]];
  const windows: [number, number][] = [];
  if (!closed.includes((weekday + 6) % 7)) windows.push([0, close]);
  if (!closed.includes(weekday)) windows.push([open, 1440]);
  return windows;
}

// يوم راحة أسبوعي أو تاريخ إجازة للموظف.
export function isStaffOff(member: Record<string, any> | undefined, date: string) {
  if (!member) return false;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if ((member.workDays ?? []).includes(date)) return false;
  return (member.daysOff ?? []).map(Number).includes(weekday) || (member.leaves ?? []).includes(date);
}

// staff اختياري: صفوف {id, data} أو كائنات مسطحة. الموظف المجاز لا يُحجز له ولا يُحسب ضمن السعة عند «أي موظف».
export function availableSlots(appointments: Record<string, any>[], date: string, items: Item[], staffId: string, settings: Record<string, any>, staff?: Record<string, any>[]) {
  const windows = openWindows(settings.hours, date);
  if (!windows.length) return [];
  const team = staff ? staff.map(s => (s.data ? { id: s.id, ...s.data } : s)) : null;
  const offIds = new Set((team ?? []).filter(m => isStaffOff(m, date)).map(m => m.id));
  if (offIds.has(staffId) || items.some(i => i.staffId && offIds.has(i.staffId))) return [];
  const needsAnyone = !staffId && items.some(i => !i.staffId);
  const working = team && needsAnyone ? team.filter(m => m.active !== false && !offIds.has(m.id)) : null;
  if (working && !working.length && team!.some(m => m.active !== false)) return [];
  const step = Number(settings.slotStep || 15);
  const duration = items.reduce((s, i) => s + i.duration, 0) || 30;
  const now = localNow();
  const today = isoDate(now);
  const slots: string[] = [];
  const free = (time: string, who: string) => !conflicts(appointments, { date, time, staffId: who, items: items.map(i => ({ ...i, staffId: i.staffId || who })) });
  for (const [start, end] of windows) {
    for (let m = start; m + duration <= end; m += step) {
      if (date === today && m < now.getUTCHours() * 60 + now.getUTCMinutes() + 30) continue;
      const time = fromMin(m);
      if (working?.length ? working.some(w => free(time, w.id)) : free(time, staffId)) slots.push(time);
    }
  }
  return slots;
}

export const fill = (template: string, values: Record<string, string>) => String(template || '').replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
