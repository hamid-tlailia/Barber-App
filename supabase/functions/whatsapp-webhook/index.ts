// استقبال رسائل واتساب: ردود التذكير (1 تأكيد / 2 إلغاء) + المساعد الذكي للحجز بالعربي.
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import {
  addDays, availableSlots, collection, conflicts, dateAr, db, digits, isStaffOff, isoDate, isoTime, json, localNow, samePhone,
  saveRecord, sendText, settingsOf, timeAr, type WaConfig, waConfigFor,
} from '../_shared/common.ts';

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
  console.log('webhook', JSON.stringify(payload.entry?.[0]?.changes?.[0]?.field ?? ''), (payload.entry?.[0]?.changes?.[0]?.value?.messages ?? []).length);
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value ?? {};
    // حالة الرسائل الصادرة (تذكير/عرض): delivered/read أو failed مع السبب — للتحقق من الوصول.
    for (const st of value.statuses ?? []) console.log('status', st.status, String(st.recipient_id ?? '').slice(-4), st.errors?.[0]?.code ?? '', st.errors?.[0]?.title ?? '');
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

  // «إيقاف»: العميل لا يريد رسائل العروض بعد الآن (يبقى التذكير بالمواعيد).
  if (/^(إيقاف|ايقاف|إيقاف العروض|ايقاف العروض|stop|unsubscribe)$/i.test(text.trim())) {
    const client = (await collection(shop.shopId, 'clients')).find(c => samePhone(c.data.phone, from));
    if (client) await saveRecord(shop.shopId, 'clients', client.id, { ...client.data, noOffers: true });
    await sendText(config, from, client?.data?.lang === 'en' ? 'Done — you will no longer receive offers. Appointment reminders continue as usual.' : 'تم ✓ لن تصلك رسائل العروض بعد الآن، وتبقى تذكيرات مواعيدك كالمعتاد.');
    return;
  }
  // ردود سريعة على التذكير.
  const normalized = text.replace(/[١٢]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const yes = /^(1|تأكيد|اكيد|أكيد|نعم|yes|y|ok|okay|confirm)$/i; const no = /^(2|إلغاء|الغاء|لا|no|n|cancel)$/i;
  // أثناء محادثة مع المساعد (آخر 15 دقيقة) قد يعني «2» الخيار الثاني، لا إلغاء الموعد.
  const { data: convo } = await db.from('wa_conversations').select('updated_at').eq('shop_id', shop.shopId).eq('phone', digits(from)).maybeSingle();
  const chatting = shop.assistant && convo?.updated_at && Date.now() - Date.parse(convo.updated_at) < 15 * 60000;
  if (!chatting && (yes.test(normalized) || no.test(normalized))) {
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
  // أقرب موعد لم يفت وقته بعد (مع ساعة سماح) — لا نؤكد موعداً انتهى صباحاً بدل موعد الظهر.
  const now = localNow();
  const today = isoDate(now);
  const grace = isoTime(new Date(now.getTime() - 60 * 60000));
  const upcoming = appointments.filter(a => a.data.clientId === client.id && ['pending', 'confirmed'].includes(a.data.status)
    && (a.data.date > today || (a.data.date === today && String(a.data.time) >= (grace > isoTime(now) ? '00:00' : grace))))
    .sort((a, b) => `${a.data.date}${a.data.time}`.localeCompare(`${b.data.date}${b.data.time}`));
  // التأكيد يخص أول موعد بانتظار التأكيد؛ الإلغاء يخص أقرب موعد.
  const next = confirm ? (upcoming.find(a => a.data.status === 'pending') ?? upcoming[0]) : upcoming[0];
  if (!next) return false;
  await saveRecord(shopId, 'appointments', next.id, { ...next.data, status: confirm ? 'confirmed' : 'cancelled', [confirm ? 'confirmedVia' : 'cancelledVia']: 'whatsapp' });
  await notifySalon({ kind: 'wa_reply', shop_id: shopId, confirm, client: client.data.name ?? '', appointment: { id: next.id, ...next.data } });
  const en = client.data.lang === 'en';
  const dateEn = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${next.data.date}T12:00:00Z`));
  await sendText(config, from, confirm
    ? (en ? `Your appointment is confirmed ✅ ${dateEn} at ${next.data.time}. See you soon!` : `تم تأكيد موعدك ✅ ${dateAr(next.data.date)} الساعة ${timeAr(next.data.time)}. نراك قريباً!`)
    : (en ? 'Your appointment has been cancelled. Message us anytime to book a new one 🙏' : 'تم إلغاء موعدك. نتمنى رؤيتك قريباً — أرسل لنا متى ما أردت حجز موعد جديد 🙏'));
  return true;
}

// إشعار الصالون (جوال) بردّ العميل: نفس دالة الإشعارات بسر المهام المجدولة.
async function notifySalon(body: Record<string, unknown>) {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-booking`, {
      method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (e) { console.error('notify failed', e); }
}

/* ───────── المساعد الذكي ───────── */

// الوقت كما يكتبه المساعد للعميل («5:00 م» / «5:00 PM») أو بصيغة 24 ساعة ← HH:MM.
const toHHMM = (value: string) => {
  const raw = String(value || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(ص|م|am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) return '';
  let h = Number(m[1]); const min = Number(m[2]); const mer = (m[3] || '').toLowerCase();
  if (h > 23 || min > 59) return '';
  if (mer === 'م' || mer.startsWith('p')) { if (h < 12) h += 12; } else if ((mer === 'ص' || mer.startsWith('a')) && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

// بعض النماذج تكتب «04:00 م» أو «16:30» رغم التعليمات: نصحّح الأوقات في الرد نفسه قبل إرساله.
const timeEn = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`; };
export const tidyTimes = (text: string) => {
  const en = (text.match(/[a-z]/gi) ?? []).length > (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  return text
    .replace(/(^|[^\d:])0(\d):(\d{2})(\s*(?:ص|م|AM|PM|am|pm))/g, '$1$2:$3$4')
    .replace(/(^|[^\d:])([01]\d|2[0-3]):([0-5]\d)(?![\d:])(?!\s*(?:ص|م|AM|PM|am|pm))/g, (_m, pre, h, mm) => pre + (en ? timeEn : timeAr)(`${h}:${mm}`));
};

// الباقات المعروضة أونلاين (جلسة واحدة): سعرها بدل مجموع خدماتها.
const packageServiceIds = (p: Record<string, any>) => (Array.isArray(p?.serviceIds) && p.serviceIds.length ? p.serviceIds : p?.serviceId ? [p.serviceId] : []);
const onlinePackages = (packages: Rec[]) => {
  const today = isoDate(localNow());
  return packages.filter(p => p.data.online === true && Number(p.data.sessions || 1) === 1 && packageServiceIds(p.data).length
    && !p.data.endedAt && !(p.data.offerEndsAt && p.data.offerEndsAt < today));
};
// أكواد الخصم التي فعّلها الصالون للحجز الأونلاين وما زالت سارية.
const codeOf = (c: string) => String(c || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
const onlineCoupons = (coupons: Rec[]) => {
  const today = isoDate(localNow());
  return coupons.filter(c => c.data.active !== false && c.data.online === true && !(c.data.expiresAt && c.data.expiresAt < today)
    && !(Number(c.data.maxUses) > 0 && Number(c.data.used || 0) >= Number(c.data.maxUses)));
};
const couponText = (c: Rec) => `${c.data.type === 'amount' ? `${c.data.value} ر.ق` : `${c.data.value}٪`}${c.data.expiresAt ? ` حتى ${dateAr(c.data.expiresAt)}` : ''}`;

const tools: Anthropic.Tool[] = [
  { name: 'list_services', description: 'قائمة خدمات الصالون وباقاته مع الأسعار والمدة والمعرّفات، وقائمة الموظفين.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'find_available_times', description: 'الأوقات المتاحة في يوم محدد لمجموعة خدمات. التاريخ بصيغة YYYY-MM-DD.',
    input_schema: { type: 'object', properties: { date: { type: 'string' }, service_ids: { type: 'array', items: { type: 'string' } }, staff_id: { type: 'string' } }, required: ['date', 'service_ids'], additionalProperties: false },
  },
  {
    name: 'book_appointment', description: 'حجز موعد بعد أن يؤكد العميل صراحة الخدمة واليوم والوقت والاسم.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string' }, time: { type: 'string', description: 'الوقت كما ظهر في find_available_times، مثل «5:00 م»' }, service_ids: { type: 'array', items: { type: 'string' } }, package_id: { type: 'string', description: 'إذا اختار العميل باقة: معرّفها، مع service_ids خدماتها' }, coupon_code: { type: 'string', description: 'كود الخصم إذا ذكره العميل' }, staff_id: { type: 'string' }, note: { type: 'string' } }, required: ['name', 'date', 'time', 'service_ids'], additionalProperties: false },
  },
  { name: 'my_appointments', description: 'مواعيد هذا العميل القادمة (يتعرف عليه برقم الواتساب).', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'cancel_appointment', description: 'إلغاء موعد قادم لهذا العميل بعد تأكيده.',
    input_schema: { type: 'object', properties: { appointment_id: { type: 'string' } }, required: ['appointment_id'], additionalProperties: false },
  },
];

async function runTool(shopId: string, from: string, name: string, input: Record<string, any>): Promise<string> {
  const [services, staff, appointments, clients, settings, packages, coupons] = await Promise.all([
    collection(shopId, 'services'), collection(shopId, 'staff'), collection(shopId, 'appointments'), collection(shopId, 'clients'), settingsOf(shopId), collection(shopId, 'packages'), collection(shopId, 'coupons'),
  ]);
  const client = clients.find(c => samePhone(c.data.phone, from));
  const items = (ids: string[], staffId = '') => services.filter(s => ids?.includes(s.id)).map(s => ({
    serviceId: s.id, name: s.data.name, price: Number(s.data.price || 0), duration: Number(s.data.duration || 30), processing: Number(s.data.processing || 0), staffId,
  }));
  const today = isoDate(localNow());
  // نفس العميل لديه موعد قائم في ذلك اليوم: لا حجز ثانٍ (مثل رابط الحجز).
  const sameDayOf = (date: string) => client && appointments.find(a => a.data.clientId === client.id && a.data.date === date && ['pending', 'confirmed', 'arrived'].includes(a.data.status));
  const sameDayNote = (a: Rec) => `لدى العميل موعد قائم في هذا اليوم الساعة ${timeAr(a.data.time)} (${(a.data.items ?? []).map((i: any) => i.name).join(' + ')}). لا يمكن حجز موعد ثانٍ في نفس اليوم: أخبره بموعده الحالي، واقترح يوماً آخر، أو أن يتواصل مع الصالون لتعديله.`;

  if (name === 'list_services') {
    return JSON.stringify({
      services: services.filter(s => s.data.online !== false).map(s => ({ id: s.id, name: s.data.name, price: s.data.price, minutes: s.data.duration, deposit: s.data.deposit || 0 })),
      packages: onlinePackages(packages).map(p => ({ id: p.id, name: p.data.name, price: p.data.price, service_ids: packageServiceIds(p.data) })),
      staff: staff.filter(s => s.data.active !== false).map(s => ({ id: s.id, name: s.data.name, specialty: s.data.specialty })),
      hours: settings.hours,
    });
  }
  if (name === 'find_available_times') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < today || input.date > addDays(today, 60)) return 'تاريخ غير صالح — يجب أن يكون خلال الشهرين القادمين.';
    const chosen = items(input.service_ids, input.staff_id || '');
    if (!chosen.length) return 'لم يتم العثور على الخدمات. استخدم list_services للحصول على المعرّفات.';
    const existing = sameDayOf(input.date);
    if (existing) return sameDayNote(existing);
    const slots = availableSlots(appointments.map(a => ({ id: a.id, ...a.data })), input.date, chosen, input.staff_id || '', settings, staff);
    // الأوقات بصيغة 12 ساعة فقط (ص/م) — تُكتب للعميل كما هي، وتُمرَّر كما هي إلى book_appointment.
    return slots.length ? JSON.stringify({ date: input.date, times: slots.slice(0, 24).map(timeAr) }) : 'لا توجد أوقات متاحة في هذا اليوم.';
  }
  if (name === 'book_appointment') {
    const chosen = items(input.service_ids, input.staff_id || '');
    const time = toHHMM(input.time);
    if (!chosen.length || !time || input.date < today) return 'بيانات الحجز غير مكتملة.';
    const existing = sameDayOf(input.date);
    if (existing) return sameDayNote(existing);
    const coupon = input.coupon_code ? onlineCoupons(coupons).find(c => codeOf(c.data.code) === codeOf(input.coupon_code)) : null;
    if (input.coupon_code && !coupon) return 'كود الخصم غير صالح أو منتهٍ. أخبر العميل، واسأله إن كان يريد الحجز بدونه.';
    const booked = appointments.map(a => ({ id: a.id, ...a.data }));
    // «أي حلاق»: يُنسب للحلاق المتاح في هذا الوقت صاحب أقل مواعيد في ذلك اليوم.
    let staffId = input.staff_id || '';
    if (!staffId) {
      const load = (id: string) => booked.filter(a => a.date === input.date && !['cancelled', 'no_show'].includes(a.status)
        && (a.staffId === id || (a.items ?? []).some((i: any) => i.staffId === id))).length;
      const free = staff.filter(m => m.data.active !== false && !isStaffOff(m.data, input.date)
        && !conflicts(booked, { id: 'new', date: input.date, time, staffId: m.id, items: chosen.map(i => ({ ...i, staffId: m.id })), status: 'pending' }));
      staffId = free.sort((a, b) => load(a.id) - load(b.id))[0]?.id ?? '';
    }
    const candidate = { id: crypto.randomUUID(), date: input.date, time, staffId, items: chosen.map(i => ({ ...i, staffId: i.staffId || staffId })), status: 'pending' };
    if (conflicts(booked, candidate)) return 'هذا الوقت لم يعد متاحاً. اقترح وقتاً آخر.';
    let clientId = client?.id;
    if (!clientId) {
      clientId = crypto.randomUUID();
      await saveRecord(shopId, 'clients', clientId, { id: clientId, name: String(input.name).slice(0, 80), phone: from, notes: '', source: 'whatsapp', createdAt: today });
    }
    const total = chosen.reduce((s, i) => s + i.price, 0);
    // باقة: الخصم = مجموع خدماتها المختارة − سعر الباقة.
    const pkg = input.package_id ? onlinePackages(packages).find(p => p.id === input.package_id) : null;
    const covered = pkg ? chosen.filter(i => packageServiceIds(pkg.data).includes(i.serviceId)).reduce((s, i) => s + i.price, 0) : 0;
    const bundleOff = pkg ? Math.max(0, covered - Number(pkg.data.price || 0)) : 0;
    const couponOff = coupon ? Math.min(total - bundleOff, Math.round(coupon.data.type === 'amount' ? Number(coupon.data.value || 0) : (total - bundleOff) * Number(coupon.data.value || 0) / 100)) : 0;
    const discount = bundleOff + couponOff;
    if (coupon) await saveRecord(shopId, 'coupons', coupon.id, { ...coupon.data, used: Number(coupon.data.used || 0) + 1 });
    const deposit = services.filter(s => input.service_ids.includes(s.id)).reduce((s, x) => s + Number(x.data.deposit || 0), 0);
    await saveRecord(shopId, 'appointments', candidate.id, {
      ...candidate, clientId, duration: chosen.reduce((s, i) => s + i.duration, 0), price: total, discount, bundleId: pkg?.id ?? '', couponId: coupon?.id ?? '', couponCode: coupon?.data.code ?? '', deposit: Math.min(deposit, total - discount), payments: [],
      location: 'salon', notes: String(input.note || '').slice(0, 300), source: 'whatsapp', createdAt: today,
    });
    return JSON.stringify({ booked: true, id: candidate.id, date: input.date, time: timeAr(time), total: total - discount, deposit, status: 'pending — سيؤكده الصالون' });
  }
  if (name === 'my_appointments') {
    if (!client) return 'لا توجد مواعيد مسجلة لهذا الرقم.';
    const mine = appointments.filter(a => a.data.clientId === client.id && a.data.date >= today && ['pending', 'confirmed'].includes(a.data.status));
    return JSON.stringify(mine.map(a => ({ id: a.id, date: a.data.date, time: timeAr(a.data.time), services: (a.data.items ?? []).map((i: any) => i.name), status: a.data.status })));
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
  const [{ data: shop }, { data: convo }, settings, services, packages, coupons] = await Promise.all([
    db.from('shops').select('name, kind, phone').eq('id', shopId).single(),
    db.from('wa_conversations').select('messages, updated_at').eq('shop_id', shopId).eq('phone', digits(from)).maybeSingle(),
    settingsOf(shopId), collection(shopId, 'services'), collection(shopId, 'packages'), collection(shopId, 'coupons'),
  ]);
  const now = localNow();
  // لغة العميل المسجلة في ملفه (عربي/إنجليزي) — وإلا نتبع لغة رسالته.
  const known = (await collection(shopId, 'clients')).find(c => samePhone(c.data.phone, from));
  const prefersEn = known?.data?.lang === 'en';
  // نخزن النص فقط بين الرسائل؛ آخر ١٢ رسالة تكفي لسياق الحجز.
  // محادثة جديدة (أول مرة أو بعد 12 ساعة صمت): نبدأ من جديد بترحيب وقائمة الأسعار.
  const fresh = !convo?.updated_at || Date.now() - Date.parse(convo.updated_at) > 12 * 3600000;
  const history: { role: 'user' | 'assistant'; content: string }[] = fresh ? [] : (convo?.messages ?? []).slice(-12);
  const serviceName = (id: string) => services.find(s => s.id === id)?.data.name ?? '';
  const catalog = [
    ...services.filter(s => s.data.online !== false).map(s => `• ${s.data.name} — ${s.data.price} ر.ق (${s.data.duration || 30} دقيقة)`),
    ...onlinePackages(packages).map(p => `• باقة ${p.data.name}: ${packageServiceIds(p.data).map(serviceName).filter(Boolean).join(' + ')} — ${p.data.price} ر.ق${p.data.offerEndsAt ? ` (العرض حتى ${dateAr(p.data.offerEndsAt)})` : ''}`),
    ...onlineCoupons(coupons).map(c => `• كود خصم ${c.data.code}: خصم ${couponText(c)}`),
  ].join('\n');
  const system = `أنت موظف الاستقبال الرقمي لـ«${shop?.name}» (${shop?.kind === 'women' ? 'صالون نسائي' : shop?.kind === 'mixed' ? 'صالون للرجال والسيدات' : 'صالون حلاقة رجالي'}) في قطر.
تتحدث بالعربية الخليجية المهذبة وباختصار مناسب لواتساب (٣ أسطر غالباً). العملة ريال قطري.
اللغة: رد دائماً بنفس لغة رسالة العميل؛ إذا كتب بالإنجليزية فرد بإنجليزية مهذبة وبسيطة (العملة QAR).${prefersEn ? ' هذا العميل يفضّل الإنجليزية — ابدأ بالإنجليزية.' : ''}
مهامك: الإجابة عن الخدمات والأسعار، اقتراح أوقات متاحة، الحجز، عرض أو إلغاء مواعيد العميل.
قواعد: استخدم الأدوات دائماً للأسعار والأوقات ولا تخمّن. قبل book_appointment اعرض ملخص الحجز واطلب تأكيداً صريحاً. اقترح ٣ أوقات كحد أقصى.
إذا طلب العميل شيئاً خارج الحجز أو اشتكى، اعتذر بلطف وأخبره أن فريق الصالون سيتواصل معه${shop?.phone ? ` أو يمكنه الاتصال على ${shop.phone}` : ''}.
ساعات العمل: ${settings.hours?.allDay ? 'مفتوح 24 ساعة طوال الأسبوع' : `${timeAr(settings.hours?.open ?? '09:00')} – ${timeAr(settings.hours?.close ?? '22:00')}`}.
الأوقات: انسخها كما تعيدها الأدوات بالضبط (مثل «5:00 م»)، ولا تكتب «17:00» أو «05:00» أبداً.
الخدمات والباقات المتاحة للحجز:
${catalog}
${fresh ? `هذه بداية محادثة: رحّب بالعميل باسم «${shop?.name}»، واعرض الخدمات والباقات أعلاه بأسعارها في قائمة مختصرة، ثم اسأله ماذا يختار، وهل يريد الموعد اليوم أم في يوم آخر. لا تعرض أوقاتاً قبل أن يختار الخدمة واليوم.` : ''}
إذا اختار العميل باقة: مرّر service_ids خدماتها إلى find_available_times، ثم package_id معها إلى book_appointment.
أكواد الخصم والعروض أعلاه قائمة الآن: لا بأس أن تخبر العميل بها، وإذا أراد استخدام كود فمرّره في coupon_code عند الحجز. لا تخترع أكواداً أو عروضاً غير المذكورة.`;

  const userText = `${text}\n\n[سياق النظام: اليوم ${dateAr(isoDate(now))} (${isoDate(now)}) الساعة ${now.toISOString().slice(11, 16)}. اسم العميل في واتساب: ${profileName ?? 'غير معروف'}]`;
  const call = (name: string, input: Record<string, any>) => runTool(shopId, from, name, input);
  const reply = brain.provider === 'openai'
    ? await askOpenAI(brain.key, system, history, userText, call)
    : await askClaude(brain.key, system, history, userText, call);
  if (!reply) return;
  const tidy = tidyTimes(reply);
  await sendText(config, from, tidy);
  await db.from('wa_conversations').upsert({
    shop_id: shopId, phone: digits(from), updated_at: new Date().toISOString(),
    messages: [...history, { role: 'user', content: text }, { role: 'assistant', content: tidy }].slice(-12),
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
