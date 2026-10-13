// استقبال رسائل واتساب: ردود التذكير (1 تأكيد / 2 إلغاء) + المساعد الذكي للحجز بالعربي.
import Anthropic from 'npm:@anthropic-ai/sdk@0.133.0';
import {
  addDays, availableSlots, collection, conflicts, dateAr, db, digits, isoDate, json, localNow, samePhone,
  saveRecord, sendText, settingsOf, timeAr, type WaConfig, waConfigFor,
} from '../_shared/common.ts';

// كل صالون مشترك في المساعد له مفتاحه الخاص (يضعه المدير)؛ مفتاح المنصة احتياطي إن وُجد.
const PLATFORM_AI_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const anthropicFor = (key?: string | null) => (key || PLATFORM_AI_KEY) ? new Anthropic({ apiKey: key || PLATFORM_AI_KEY }) : null;
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
  const fields = 'shop_id, wa_addon, ai_addon, assistant_enabled, ai_key';
  const { data: own } = await db.from('shop_integrations').select(fields).eq('wa_phone_number_id', phoneNumberId).maybeSingle();
  let integ = own;
  if (!integ) {
    const { data: recent } = await db.from('wa_outbox').select('shop_id').like('phone', `%${digits(from).slice(-8)}`).order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (!recent) return null;
    ({ data: integ } = await db.from('shop_integrations').select(fields).eq('shop_id', recent.shop_id).maybeSingle());
  }
  // واتساب والمساعد إضافتان مدفوعتان يفعّلهما المدير.
  if (!integ?.wa_addon) return null;
  return { shopId: integ.shop_id as string, assistant: Boolean(integ.ai_addon && integ.assistant_enabled), aiKey: integ.ai_key as string | null };
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
  if (/^(1|تأكيد|اكيد|أكيد|نعم)$/.test(normalized) || /^(2|إلغاء|الغاء|لا)$/.test(normalized)) {
    const confirm = /^(1|تأكيد|اكيد|أكيد|نعم)$/.test(normalized);
    const handled = await replyToReminder(shop.shopId, config, from, confirm);
    if (handled) return;
  }
  const ai = shop.assistant ? anthropicFor(shop.aiKey) : null;
  if (ai) await assistant(ai, shop.shopId, config, from, text, profileName);
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
  await sendText(config, from, confirm
    ? `تم تأكيد موعدك ✅ ${dateAr(next.data.date)} الساعة ${timeAr(next.data.time)}. نراك قريباً!`
    : 'تم إلغاء موعدك. نتمنى رؤيتك قريباً — أرسل لنا متى ما أردت حجز موعد جديد 🙏');
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
    const slots = availableSlots(appointments.map(a => ({ id: a.id, ...a.data })), input.date, chosen, input.staff_id || '', settings);
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

async function assistant(anthropic: Anthropic, shopId: string, config: WaConfig, from: string, text: string, profileName?: string) {
  const [{ data: shop }, { data: convo }, settings] = await Promise.all([
    db.from('shops').select('name, kind, phone').eq('id', shopId).single(),
    db.from('wa_conversations').select('messages').eq('shop_id', shopId).eq('phone', digits(from)).maybeSingle(),
    settingsOf(shopId),
  ]);
  const now = localNow();
  // نخزن النص فقط بين الرسائل؛ آخر ١٢ رسالة تكفي لسياق الحجز.
  const history: { role: 'user' | 'assistant'; content: string }[] = (convo?.messages ?? []).slice(-12);
  const system = `أنت موظف الاستقبال الرقمي لـ«${shop?.name}» (${shop?.kind === 'women' ? 'صالون نسائي' : shop?.kind === 'mixed' ? 'صالون للرجال والسيدات' : 'صالون حلاقة رجالي'}) في قطر.
تتحدث بالعربية الخليجية المهذبة وباختصار مناسب لواتساب (٣ أسطر غالباً). العملة ريال قطري.
مهامك: الإجابة عن الخدمات والأسعار، اقتراح أوقات متاحة، الحجز، عرض أو إلغاء مواعيد العميل.
قواعد: استخدم الأدوات دائماً للأسعار والأوقات ولا تخمّن. قبل book_appointment اعرض ملخص الحجز واطلب تأكيداً صريحاً. اقترح ٣ أوقات كحد أقصى.
إذا طلب العميل شيئاً خارج الحجز أو اشتكى، اعتذر بلطف وأخبره أن فريق الصالون سيتواصل معه${shop?.phone ? ` أو يمكنه الاتصال على ${shop.phone}` : ''}.
ساعات العمل: ${settings.hours?.open ?? '09:00'}–${settings.hours?.close ?? '22:00'}.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: `${text}\n\n[سياق النظام: اليوم ${dateAr(isoDate(now))} (${isoDate(now)}) الساعة ${now.toISOString().slice(11, 16)}. اسم العميل في واتساب: ${profileName ?? 'غير معروف'}]` },
  ];

  let reply = '';
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
    if (response.stop_reason === 'refusal') { reply = 'عذراً، لا أستطيع المساعدة في هذا الطلب. فريق الصالون سيتواصل معك.'; break; }
    messages.push({ role: 'assistant', content: response.content as any });
    const toolUses = response.content.filter((b: any) => b.type === 'tool_use') as any[];
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      reply = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      break;
    }
    const results = await Promise.all(toolUses.map(async tool => {
      try { return { type: 'tool_result' as const, tool_use_id: tool.id, content: await runTool(shopId, from, tool.name, tool.input ?? {}) }; }
      catch (e) { return { type: 'tool_result' as const, tool_use_id: tool.id, content: `خطأ: ${(e as Error).message}`, is_error: true }; }
    }));
    messages.push({ role: 'user', content: results });
  }
  if (!reply) return;
  await sendText(config, from, reply);
  await db.from('wa_conversations').upsert({
    shop_id: shopId, phone: digits(from), updated_at: new Date().toISOString(),
    messages: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }].slice(-12),
  });
}

