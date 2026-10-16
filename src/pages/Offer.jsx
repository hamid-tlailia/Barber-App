// نشر عرض (كود خصم، باقة، أو نص حر): لكل العملاء عبر واتساب، أو صورة جاهزة لانستغرام وفيسبوك وحالة واتساب، أو نسخ النص.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Image as ImageIcon, MessageCircle, Send, SkipForward, Users } from 'lucide-react';
import { fillTemplate, localISO, num, uid, validPhone, whatsappLink } from '../data.js';
import { api, bookingUrl, cloudEnabled, errorText } from '../lib/sync.js';
import { isNative } from '../lib/native.js';
import { saveFile } from '../lib/files.js';
import { Alert, Avatar, Badge, Button, Confirm, Field, Row, Section, Sheet, openExternal, useApp } from '../ui.jsx';
import { L, isEn } from '../i18n.js';

// العملاء الذين يمكن مراسلتهم بالعروض: رقم صحيح، ليس «زبون عابر»، ولم يطلب الإيقاف، بدون تكرار.
export const offerRecipients = clients => {
  const seen = new Set();
  return clients.filter(c => {
    const key = String(c.phone || '').replace(/\D/g, '').slice(-8);
    if (c.id === 'walk-in' || c.noOffers || !validPhone(c.phone) || seen.has(key)) return false;
    seen.add(key); return true;
  });
};

export function OfferShare({ offer, onClose }) {
  const { data, shop, toast, isManager } = useApp();
  const [title, setTitle] = useState(offer.title || '');
  const [text, setText] = useState(offer.text || '');
  const [mode, setMode] = useState(null);
  const [waActive, setWaActive] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const link = bookingUrl(shop.slug);
  const recipients = useMemo(() => offerRecipients(data.clients), [data.clients]);
  useEffect(() => { if (cloudEnabled && isManager) api.integration(shop.id).then(row => setWaActive(Boolean(row?.wa_addon))).catch(() => {}); }, [shop.id, isManager]);
  const full = [title && `🎁 ${title}`, text, link && L(`احجز الآن: ${link}`, `Book now: ${link}`)].filter(Boolean).join('\n');

  if (mode === 'queue') return <OfferQueue title={title} text={text} link={link} recipients={recipients} offerKey={offer.key || `offer-${localISO()}`} onClose={() => setMode(null)} />;

  return <Sheet title={L('نشر العرض', 'Publish offer')} subtitle={L(`${num(recipients.length)} عميل يمكن مراسلته`, `${num(recipients.length)} clients can be messaged`)} onClose={onClose}>
    <div className="stack">
      <Field label={L('العنوان', 'Title')}><input value={title} onChange={e => setTitle(e.target.value)} placeholder={L('مثال: خصم العيد 20٪', 'E.g. Eid offer 20% off')} /></Field>
      <Field label={L('نص العرض', 'Offer text')} hint={L('يُضاف اسم العميل ورابط الحجز تلقائياً', 'The client’s name and booking link are added automatically')}><textarea rows="4" value={text} onChange={e => setText(e.target.value)} /></Field>
      <Alert>{error}</Alert>

      <Section title={L('لكل العملاء عبر واتساب', 'All clients on WhatsApp')}>
        <div className="stack">
          {waActive && <Button block icon={Send} disabled={!text.trim() || !recipients.length} onClick={() => setConfirm(true)}>{L(`إرسال تلقائي للجميع (${num(recipients.length)})`, `Send automatically to all (${num(recipients.length)})`)}</Button>}
          <Button block variant={waActive ? 'secondary' : 'primary'} icon={Users} disabled={!text.trim() || !recipients.length} onClick={() => setMode('queue')}>{L('إرسال من واتسابك — عميل بعد عميل', 'Send from your WhatsApp — one client after another')}</Button>
          <small className="muted">{waActive
            ? L('التلقائي يصل الجميع دفعة واحدة من رقم الصالون (مرة كل 24 ساعة، وبرسوم ميتا لكل رسالة تسويقية). ومن يرد «إيقاف» لا تصله عروض بعدها.', 'Automatic sends to everyone at once from the salon number (once every 24 hours; Meta charges per marketing message). Anyone who replies “stop” won’t get offers again.')
            : L('واتساب لا يسمح بإرسال جماعي من التطبيق العادي: نفتح لك محادثة كل عميل بالرسالة جاهزة، تضغط إرسال ثم «التالي». للإرسال التلقائي للجميع بضغطة واحدة فعّل إضافة واتساب الذكي.', 'WhatsApp doesn’t allow bulk sending from the regular app: we open each client’s chat with the message ready — tap send, then “Next”. For one-tap sending to everyone, enable the Smart WhatsApp add-on.')}</small>
        </div>
      </Section>

      <Section title={L('انستغرام وفيسبوك وحالة واتساب', 'Instagram, Facebook & WhatsApp status')}>
        <div className="action-grid">
          <Button variant="secondary" icon={ImageIcon} disabled={!title.trim() && !text.trim()} onClick={async () => {
            try { await shareOfferImage({ shopName: data.shopName || shop.name, title, text, code: offer.code, until: offer.until, link, caption: full }); } catch (e) { setError(errorText(e)); }
          }}>{L('صورة جاهزة للنشر', 'Ready-made image')}</Button>
          <Button variant="secondary" icon={Copy} onClick={() => { navigator.clipboard?.writeText(full); toast(L('تم نسخ النص — الصقه مع الصورة', 'Text copied — paste it with the image')); }}>{L('نسخ النص', 'Copy text')}</Button>
        </div>
        <small className="muted">{L('تنزل صورة مربعة بتصميم الصالون والعرض، ويُنسخ النص تلقائياً. اختر انستغرام أو فيسبوك أو الحالة من قائمة المشاركة.', 'A designed square image is created and the text is copied. Choose Instagram, Facebook or Status from the share menu.')}</small>
      </Section>
    </div>
    {confirm && <Confirm title={L(`إرسال العرض لـ ${num(recipients.length)} عميل؟`, `Send the offer to ${num(recipients.length)} clients?`)} text={L('يُرسل الآن من رقم الصالون. لا يمكن التراجع بعد الإرسال.', 'It is sent now from the salon number and cannot be undone.')} confirmLabel={L('إرسال', 'Send')} onClose={() => setConfirm(false)} onConfirm={async () => {
      try {
        const result = await api.broadcast(shop.id, { title, text: [text, link && L(`للحجز: ${link}`, `Book: ${link}`)].filter(Boolean).join(' — ') });
        toast(L(`أُرسل لـ ${num(result.sent)} عميل${result.failed ? ` · تعذّر ${num(result.failed)}` : ''}`, `Sent to ${num(result.sent)} clients${result.failed ? ` · ${num(result.failed)} failed` : ''}`));
        onClose();
      } catch (e) { setError(errorText(e)); }
    }} />}
  </Sheet>;
}

// إرسال يدوي سريع: محادثة كل عميل تُفتح بالرسالة جاهزة، ونحفظ من أُرسل له حتى لا يتكرر.
function OfferQueue({ title, text, link, recipients, offerKey, onClose }) {
  const { data, setData } = useApp();
  const sentIds = new Set(data.messages.filter(m => m.kind === 'offer' && m.appointmentId === offerKey).map(m => m.clientId));
  const pending = recipients.filter(c => !sentIds.has(c.id));
  const [skipped, setSkipped] = useState([]);
  const queue = pending.filter(c => !skipped.includes(c.id));
  const next = queue[0];
  const done = recipients.length - pending.length;
  const message = c => fillTemplate([L('مرحباً {name} 👋', 'Hi {name} 👋'), title && `🎁 ${title}`, text, link && L(`احجز الآن: ${link}`, `Book now: ${link}`)].filter(Boolean).join('\n'), { name: String(c.name || '').trim().split(/\s+/)[0] });
  const send = c => {
    openExternal(whatsappLink(c.phone, message(c)));
    setData(prev => ({ ...prev, messages: [...prev.messages, { id: uid(), kind: 'offer', clientId: c.id, appointmentId: offerKey, at: localISO(), channel: 'whatsapp-link' }] }));
  };
  return <Sheet title={L('إرسال العرض للعملاء', 'Send the offer to clients')} subtitle={L(`أُرسل ${num(done)} من ${num(recipients.length)}`, `Sent ${num(done)} of ${num(recipients.length)}`)} onClose={onClose}
    footer={next ? <>
      <Button variant="ghost" icon={SkipForward} onClick={() => setSkipped([...skipped, next.id])}>{L('تخطي', 'Skip')}</Button>
      <div className="spacer" />
      <Button icon={MessageCircle} onClick={() => send(next)}>{L(`إرسال لـ ${String(next.name).split(' ')[0]}`, `Send to ${String(next.name).split(' ')[0]}`)}</Button>
    </> : <Button block icon={Check} onClick={onClose}>{L('تم', 'Done')}</Button>}>
    <div className="stack">
      <div className="progress"><span style={{ width: `${recipients.length ? Math.round(done / recipients.length * 100) : 100}%` }} /></div>
      {next ? <>
        <Alert tone="blue" icon={MessageCircle}>{L('اضغط «إرسال» ← تُفتح المحادثة ← اضغط إرسال في واتساب ← ارجع للتطبيق فيظهر العميل التالي.', 'Tap “Send” → the chat opens → tap send in WhatsApp → come back and the next client appears.')}</Alert>
        <div className="list">{queue.slice(0, 30).map((c, i) => <Row key={c.id} leading={<Avatar name={c.name} />} title={c.name} subtitle={<span dir="ltr">{c.phone}</span>}
          trailing={i === 0 ? <Badge tone="accent">{L('التالي', 'Next')}</Badge> : null} onClick={() => send(c)} />)}</div>
        {queue.length > 30 && <small className="muted center">{L(`و${num(queue.length - 30)} آخرين`, `and ${num(queue.length - 30)} more`)}</small>}
      </> : <Alert tone="green" icon={Check}>{L(`انتهى — أُرسل العرض لـ ${num(done)} عميل.`, `Done — the offer was sent to ${num(done)} clients.`)}</Alert>}
    </div>
  </Sheet>;
}

// صورة عرض 1080×1080 بألوان الصالون، تُشارك عبر قائمة المشاركة (انستغرام، فيسبوك، حالة واتساب).
async function shareOfferImage({ shopName, title, text, code, until, link, caption }) {
  await document.fonts?.ready;
  const size = 1080; const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  const font = 'Tajawal, "IBM Plex Sans Arabic", sans-serif';
  const bg = ctx.createLinearGradient(0, 0, size, size); bg.addColorStop(0, '#2a1c0e'); bg.addColorStop(1, '#5a3a17');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(232,185,120,.55)'; ctx.lineWidth = 6; ctx.strokeRect(40, 40, size - 80, size - 80);
  ctx.direction = isEn ? 'ltr' : 'rtl'; ctx.textAlign = 'center';
  const wrap = (str, maxWidth) => {
    const lines = []; let line = '';
    for (const word of String(str || '').split(/\s+/)) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
    if (line) lines.push(line); return lines;
  };
  let y = 170;
  ctx.fillStyle = '#e8b978'; ctx.font = `700 46px ${font}`; ctx.fillText(shopName || '', size / 2, y);
  y += 120;
  ctx.fillStyle = '#ffffff'; ctx.font = `800 92px ${font}`;
  for (const line of wrap(title, size - 200).slice(0, 2)) { ctx.fillText(line, size / 2, y); y += 108; }
  ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = `500 46px ${font}`; y += 10;
  for (const line of wrap(text, size - 220).slice(0, 5)) { ctx.fillText(line, size / 2, y); y += 64; }
  if (code) {
    y += 40; const w = Math.max(420, ctx.measureText(code).width + 200);
    ctx.setLineDash([16, 12]); ctx.strokeStyle = '#e8b978'; ctx.lineWidth = 5; ctx.strokeRect((size - w) / 2, y - 70, w, 120); ctx.setLineDash([]);
    ctx.fillStyle = '#e8b978'; ctx.font = `800 70px ${font}`; ctx.direction = 'ltr'; ctx.fillText(code, size / 2, y + 14); ctx.direction = isEn ? 'ltr' : 'rtl';
    y += 110;
  }
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 36px ${font}`;
  if (until) ctx.fillText(until, size / 2, size - 170);
  if (link) { ctx.direction = 'ltr'; ctx.fillText(link.replace(/^https?:\/\//, ''), size / 2, size - 110); }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  navigator.clipboard?.writeText(caption).catch(() => {});
  const name = `offer-${localISO()}.png`;
  if (!isNative && navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] })) {
    await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], text: caption }).catch(() => {});
    return;
  }
  await saveFile(name, bytes, 'image/png');
}
