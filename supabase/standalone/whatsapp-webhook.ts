// نسخة مستقلة من دالة whatsapp-webhook للصق في محرر Supabase (تتضمن الأدوات المشتركة).
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';

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

// استقبال رسائل واتساب: ردود التذكير (1 تأكيد / 2 إلغاء) + المساعد الذكي للحجز بالعربي.

// كل صالون مشترك في المساعد له مزوّد ومفتاح يضعهما المدير (Claude أو OpenAI)؛ مفتاح المنصة احتياطي إن وُجد.
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
type Brain = { provider: 'anthropic' | 'openai'; key: string };
const brainFor = (provider: string | null, key?: string | null): Brain | null => {
  const p = provider === 'openai' ? 'openai' : 'anthropic';
  const k = key || Deno.env.get(p === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY') || '';
  return k ? { provider: p, key: k } : null;
};
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';

// التحقق من أن الطلب قادم فعلاً من Meta (توقيع HMAC بسر التطبيق).
async function verifySignature(req: Request, body: string) {
  const secret = Deno.env.get('WA_APP_SECRET');
  if (!secret) return false;
  const header = req.headers.get('x-hub-signature-256') ?? '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = `sha256=${[...mac].map(b => b.toString(16).padStart(2, '0')).join('')}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async req => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('WA_VERIFY_TOKEN');
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '') : new Response('forbidden', { status: 403 });
  }
  const raw = await req.text();
  if (!(await verifySignature(req, raw))) return new Response('bad signature', { status: 401 });
  const payload = JSON.parse(raw);
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value ?? {};
    for (const message of value.messages ?? []) {
      if (message.type !== 'text') continue;
      try { await handle(value.metadata?.phone_number_id, message.from, message.text.body.trim(), value.contacts?.[0]?.profile?.name); }
      catch (e) { console.error('handle failed', e); }
    }
  }
  return json({ ok: true }); // Meta تتوقع 200 سريعاً وإلا تعيد الإرسال
});

async function resolveShop(phoneNumberId: string, from: string) {
  // ١) رقم أعمال خاص بالصالون. ٢) آخر تذكير أُرسل لهذا الرقم من رقم المنصة.
  const fields = 'shop_id, wa_addon, ai_addon, assistant_enabled, ai_key, ai_provider';
  const { data: own } = await db.from('shop_integrations').select(fields).eq('wa_phone_number_id', phoneNumberId).maybeSingle();
  let integ = own;
  if (!integ) {
    const { data: recent } = await db.from('wa_outbox').select('shop_id').like('phone', `%${digits(from).slice(-8)}`).order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (!recent) return null;
    ({ data: integ } = await db.from('shop_integrations').select(fields).eq('shop_id', recent.shop_id).maybeSingle());
  }
  // واتساب والمساعد إضافتان مدفوعتان يفعّلهما المدير.
  if (!integ?.wa_addon) return null;
  return { shopId: integ.shop_id as string, assistant: Boolean(integ.ai_addon && integ.assistant_enabled), aiKey: integ.ai_key as string | null, aiProvider: integ.ai_provider as string | null };
}

async function handle(phoneNumberId: string, from: string, text: string, profileName?: string) {
  const shop = await resolveShop(phoneNumberId, from);
  if (!shop) return;
  const { data: activeShop } = await db.rpc('shop_active', { p_shop: shop.shopId });
  if (!activeShop) return;
  const config = await waConfigFor(shop.shopId);
  if (!config) return;

  // ردود سريعة على التذكير.
  const normalized = text.replace(/[١٢]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const yes = /^(1|تأكيد|اكيد|أكيد|نعم|yes|y|ok|okay|confirm)$/i; const no = /^(2|إلغاء|الغاء|لا|no|n|cancel)$/i;
  if (yes.test(normalized) || no.test(normalized)) {
    const confirm = yes.test(normalized);
    const handled = await replyToReminder(shop.shopId, config, from, confirm);
    if (handled) return;
  }
  const brain = shop.assistant ? brainFor(shop.aiProvider, shop.aiKey) : null;
  if (brain) await assistant(brain, shop.shopId, config, from, text, profileName);
}

async function replyToReminder(shopId: string, config: WaConfig, from: string, confirm: boolean) {
  // نتعامل مع «1/2» كرد على تذكير فقط إذا أُرسل تذكير لهذا الرقم خلال ٤٨ ساعة.
  const { data: reminder } = await db.from('wa_outbox').select('id').eq('shop_id', shopId).eq('kind', 'reminder')
    .like('phone', `%${digits(from).slice(-8)}`).gt('sent_at', new Date(Date.now() - 48 * 3600000).toISOString()).limit(1).maybeSingle();
  if (!reminder) return false;
  const [appointments, clients] = await Promise.all([collection(shopId, 'appointments'), collection(shopId, 'clients')]);
  const client = clients.find(c => samePhone(c.data.phone, from));
  if (!client) return false;
  const today = isoDate(localNow());
  const next = appointments.filter(a => a.data.clientId === client.id && a.data.date >= today && ['pending', 'confirmed'].includes(a.data.status))
    .sort((a, b) => `${a.data.date}${a.data.time}`.localeCompare(`${b.data.date}${b.data.time}`))[0];
  if (!next) return false;
  await saveRecord(shopId, 'appointments', next.id, { ...next.data, status: confirm ? 'confirmed' : 'cancelled', confirmedVia: 'whatsapp' });
  const en = client.data.lang === 'en';
  const dateEn = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${next.data.date}T12:00:00Z`));
  await sendText(config, from, confirm
    ? (en ? `Your appointment is confirmed ✅ ${dateEn} at ${next.data.time}. See you soon!` : `تم تأكيد موعدك ✅ ${dateAr(next.data.date)} الساعة ${timeAr(next.data.time)}. نراك قريباً!`)
    : (en ? 'Your appointment has been cancelled. Message us anytime to book a new one 🙏' : 'تم إلغاء موعدك. نتمنى رؤيتك قريباً — أرسل لنا متى ما أردت حجز موعد جديد 🙏'));
  return true;
}

/* ───────── المساعد الذكي ───────── */

const tools: Anthropic.Tool[] = [
  { name: 'list_services', description: 'قائمة خدمات الصالون مع الأسعار والمدة والمعرّفات، وقائمة الموظفين.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'find_available_times', description: 'الأوقات المتاحة في يوم محدد لمجموعة خدمات. التاريخ بصيغة YYYY-MM-DD.',
    input_schema: { type: 'object', properties: { date: { type: 'string' }, service_ids: { type: 'array', items: { type: 'string' } }, staff_id: { type: 'string' } }, required: ['date', 'service_ids'], additionalProperties: false },
  },
  {
    name: 'book_appointment', description: 'حجز موعد بعد أن يؤكد العميل صراحة الخدمة واليوم والوقت والاسم.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string' }, time: { type: 'string', description: 'HH:MM بنظام 24 ساعة' }, service_ids: { type: 'array', items: { type: 'string' } }, staff_id: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'date', 'time', 'service_ids'], additionalProperties: false },
  },
  { name: 'my_appointments', description: 'مواعيد هذا العميل القادمة (يتعرف عليه برقم الواتساب).', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'cancel_appointment', description: 'إلغاء موعد قادم لهذا العميل بعد تأكيده.',
    input_schema: { type: 'object', properties: { appointment_id: { type: 'string' } }, required: ['appointment_id'], additionalProperties: false },
  },
];

async function runTool(shopId: string, from: string, name: string, input: Record<string, any>): Promise<string> {
  const [services, staff, appointments, clients, settings] = await Promise.all([
    collection(shopId, 'services'), collection(shopId, 'staff'), collection(shopId, 'appointments'), collection(shopId, 'clients'), settingsOf(shopId),
  ]);
  const client = clients.find(c => samePhone(c.data.phone, from));
  const items = (ids: string[], staffId = '') => services.filter(s => ids?.includes(s.id)).map(s => ({
    serviceId: s.id, name: s.data.name, price: Number(s.data.price || 0), duration: Number(s.data.duration || 30), processing: Number(s.data.processing || 0), staffId,
  }));
  const today = isoDate(localNow());

  if (name === 'list_services') {
    return JSON.stringify({
      services: services.filter(s => s.data.online !== false).map(s => ({ id: s.id, name: s.data.name, price: s.data.price, minutes: s.data.duration, deposit: s.data.deposit || 0 })),
      staff: staff.filter(s => s.data.active !== false).map(s => ({ id: s.id, name: s.data.name, specialty: s.data.specialty })),
      hours: settings.hours,
    });
  }
  if (name === 'find_available_times') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < today || input.date > addDays(today, 60)) return 'تاريخ غير صالح — يجب أن يكون خلال الشهرين القادمين.';
    const chosen = items(input.service_ids, input.staff_id || '');
    if (!chosen.length) return 'لم يتم العثور على الخدمات. استخدم list_services للحصول على المعرّفات.';
    const slots = availableSlots(appointments.map(a => ({ id: a.id, ...a.data })), input.date, chosen, input.staff_id || '', settings, staff);
    return slots.length ? JSON.stringify({ date: input.date, times: slots.slice(0, 24) }) : 'لا توجد أوقات متاحة في هذا اليوم.';
  }
  if (name === 'book_appointment') {
    const chosen = items(input.service_ids, input.staff_id || '');
    if (!chosen.length || !/^\d{2}:\d{2}$/.test(input.time) || input.date < today) return 'بيانات الحجز غير مكتملة.';
    const candidate = { id: crypto.randomUUID(), date: input.date, time: input.time, staffId: input.staff_id || '', items: chosen, status: 'pending' };
    if (conflicts(appointments.map(a => ({ id: a.id, ...a.data })), candidate)) return 'هذا الوقت لم يعد متاحاً. اقترح وقتاً آخر.';
    let clientId = client?.id;
    if (!clientId) {
      clientId = crypto.randomUUID();
      await saveRecord(shopId, 'clients', clientId, { id: clientId, name: String(input.name).slice(0, 80), phone: from, notes: '', source: 'whatsapp', createdAt: today });
    }
    const total = chosen.reduce((s, i) => s + i.price, 0);
    const deposit = services.filter(s => input.service_ids.includes(s.id)).reduce((s, x) => s + Number(x.data.deposit || 0), 0);
    await saveRecord(shopId, 'appointments', candidate.id, {
      ...candidate, clientId, duration: chosen.reduce((s, i) => s + i.duration, 0), price: total, discount: 0, deposit, payments: [],
      location: 'salon', notes: String(input.note || '').slice(0, 300), source: 'whatsapp', createdAt: today,
    });
    return JSON.stringify({ booked: true, id: candidate.id, date: input.date, time: input.time, total, deposit, status: 'pending — سيؤكده الصالون' });
  }
  if (name === 'my_appointments') {
    if (!client) return 'لا توجد مواعيد مسجلة لهذا الرقم.';
    const mine = appointments.filter(a => a.data.clientId === client.id && a.data.date >= today && ['pending', 'confirmed'].includes(a.data.status));
    return JSON.stringify(mine.map(a => ({ id: a.id, date: a.data.date, time: a.data.time, services: (a.data.items ?? []).map((i: any) => i.name), status: a.data.status })));
  }
  if (name === 'cancel_appointment') {
    const target = appointments.find(a => a.id === input.appointment_id && client && a.data.clientId === client.id);
    if (!target) return 'لم يتم العثور على الموعد.';
    await saveRecord(shopId, 'appointments', target.id, { ...target.data, status: 'cancelled', cancelledVia: 'whatsapp' });
    return 'تم الإلغاء.';
  }
  return 'أداة غير معروفة.';
}

async function assistant(brain: Brain, shopId: string, config: WaConfig, from: string, text: string, profileName?: string) {
  const [{ data: shop }, { data: convo }, settings] = await Promise.all([
    db.from('shops').select('name, kind, phone').eq('id', shopId).single(),
    db.from('wa_conversations').select('messages').eq('shop_id', shopId).eq('phone', digits(from)).maybeSingle(),
    settingsOf(shopId),
  ]);
  const now = localNow();
  // لغة العميل المسجلة في ملفه (عربي/إنجليزي) — وإلا نتبع لغة رسالته.
  const known = (await collection(shopId, 'clients')).find(c => samePhone(c.data.phone, from));
  const prefersEn = known?.data?.lang === 'en';
  // نخزن النص فقط بين الرسائل؛ آخر ١٢ رسالة تكفي لسياق الحجز.
  const history: { role: 'user' | 'assistant'; content: string }[] = (convo?.messages ?? []).slice(-12);
  const system = `أنت موظف الاستقبال الرقمي لـ«${shop?.name}» (${shop?.kind === 'women' ? 'صالون نسائي' : shop?.kind === 'mixed' ? 'صالون للرجال والسيدات' : 'صالون حلاقة رجالي'}) في قطر.
تتحدث بالعربية الخليجية المهذبة وباختصار مناسب لواتساب (٣ أسطر غالباً). العملة ريال قطري.
اللغة: رد دائماً بنفس لغة رسالة العميل؛ إذا كتب بالإنجليزية فرد بإنجليزية مهذبة وبسيطة (العملة QAR).${prefersEn ? ' هذا العميل يفضّل الإنجليزية — ابدأ بالإنجليزية.' : ''}
مهامك: الإجابة عن الخدمات والأسعار، اقتراح أوقات متاحة، الحجز، عرض أو إلغاء مواعيد العميل.
قواعد: استخدم الأدوات دائماً للأسعار والأوقات ولا تخمّن. قبل book_appointment اعرض ملخص الحجز واطلب تأكيداً صريحاً. اقترح ٣ أوقات كحد أقصى.
إذا طلب العميل شيئاً خارج الحجز أو اشتكى، اعتذر بلطف وأخبره أن فريق الصالون سيتواصل معه${shop?.phone ? ` أو يمكنه الاتصال على ${shop.phone}` : ''}.
ساعات العمل: ${settings.hours?.open ?? '09:00'}–${settings.hours?.close ?? '22:00'}.`;

  const userText = `${text}\n\n[سياق النظام: اليوم ${dateAr(isoDate(now))} (${isoDate(now)}) الساعة ${now.toISOString().slice(11, 16)}. اسم العميل في واتساب: ${profileName ?? 'غير معروف'}]`;
  const call = (name: string, input: Record<string, any>) => runTool(shopId, from, name, input);
  const reply = brain.provider === 'openai'
    ? await askOpenAI(brain.key, system, history, userText, call)
    : await askClaude(brain.key, system, history, userText, call);
  if (!reply) return;
  await sendText(config, from, reply);
  await db.from('wa_conversations').upsert({
    shop_id: shopId, phone: digits(from), updated_at: new Date().toISOString(),
    messages: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-12),
  });
}


type History = { role: 'user' | 'assistant'; content: string }[];
type ToolCall = (name: string, input: Record<string, any>) => Promise<string>;
const safely = async (call: ToolCall, name: string, input: Record<string, any>) => {
  try { return { ok: true, content: await call(name, input) }; } catch (e) { return { ok: false, content: `خطأ: ${(e as Error).message}` }; }
};

async function askClaude(key: string, system: string, history: History, userText: string, call: ToolCall) {
  const anthropic = new Anthropic({ apiKey: key });
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userText }];
  for (let turn = 0; turn < 8; turn++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      tools,
      messages,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as any);
    if (response.stop_reason === 'refusal') return 'عذراً، لا أستطيع المساعدة في هذا الطلب. فريق الصالون سيتواصل معك.';
    messages.push({ role: 'assistant', content: response.content as any });
    const toolUses = response.content.filter((b: any) => b.type === 'tool_use') as any[];
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      return response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    }
    const results = await Promise.all(toolUses.map(async tool => {
      const r = await safely(call, tool.name, tool.input ?? {});
      return { type: 'tool_result' as const, tool_use_id: tool.id, content: r.content, ...(r.ok ? {} : { is_error: true }) };
    }));
    messages.push({ role: 'user', content: results });
  }
  return '';
}

// OpenAI (Chat Completions) بنفس الأدوات — للتجربة برصيد OpenAI أو لصالون يفضّله.
async function askOpenAI(key: string, system: string, history: History, userText: string, call: ToolCall) {
  const messages: any[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: userText }];
  const fnTools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  for (let turn = 0; turn < 8; turn++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, tools: fnTools }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const message = (await res.json()).choices?.[0]?.message;
    if (!message) return '';
    messages.push(message);
    const toolCalls = message.tool_calls ?? [];
    if (!toolCalls.length) return String(message.content ?? '').trim();
    for (const tc of toolCalls) {
      let input: Record<string, any> = {};
      try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* وسائط غير صالحة */ }
      const r = await safely(call, tc.function?.name, input);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: r.content });
    }
  }
  return '';
}
