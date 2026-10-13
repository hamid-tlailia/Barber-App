// استيراد العملاء من جهات اتصال الهاتف أو من ملفات Excel / Word / vCard / CSV.
// كل قارئ يعيد نصاً بصيغة «الاسم، الرقم» في كل سطر ليمر على نفس منطق الاستيراد.
import { unzipSync, strFromU8 } from 'fflate';
import { isNative } from './native.js';

const xml = text => new DOMParser().parseFromString(text, 'application/xml');
const cell = value => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const toLines = rows => rows.filter(row => row.some(Boolean)).map(row => row.map(v => cell(String(v ?? '').trim())).join(',')).join('\n');

// Excel (.xlsx): الورقة الأولى، مع النصوص المشتركة.
function readXlsx(bytes) {
  const files = unzipSync(bytes, { filter: f => /^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels)$/.test(f.name) });
  const shared = files['xl/sharedStrings.xml'] ? [...xml(strFromU8(files['xl/sharedStrings.xml'])).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheetName = Object.keys(files).filter(name => /worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]))[0];
  if (!sheetName) throw new Error('لم نجد ورقة بيانات في الملف');
  const column = ref => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const rows = [...xml(strFromU8(files[sheetName])).getElementsByTagName('row')].map(row => {
    const out = [];
    for (const c of row.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const raw = type === 'inlineStr' ? c.getElementsByTagName('t')[0]?.textContent : c.getElementsByTagName('v')[0]?.textContent;
      out[column(c.getAttribute('r') || 'A')] = type === 's' ? shared[Number(raw)] : raw;
    }
    return [...out].map(v => v ?? '');
  });
  return toLines(rows);
}

// Word (.docx): الجداول صفاً صفاً، والفقرات سطراً سطراً.
function readDocx(bytes) {
  const files = unzipSync(bytes, { filter: f => f.name === 'word/document.xml' });
  const doc = xml(strFromU8(files['word/document.xml']));
  const text = node => [...node.getElementsByTagName('w:t')].map(t => t.textContent).join('');
  const lines = [];
  for (const table of doc.getElementsByTagName('w:tbl')) for (const row of table.getElementsByTagName('w:tr')) lines.push([...row.getElementsByTagName('w:tc')].map(text));
  const inTable = node => { for (let n = node.parentNode; n; n = n.parentNode) if (n.nodeName === 'w:tbl') return true; return false; };
  for (const p of doc.getElementsByTagName('w:p')) if (!inTable(p)) lines.push([text(p)]);
  return toLines(lines);
}

// vCard (.vcf): ما يصدّره تطبيق جهات الاتصال في أي هاتف.
export function readVcf(text) {
  const rows = [];
  for (const card of String(text).replace(/\r?\n[ \t]/g, '').split(/END:VCARD/i)) {
    const name = card.match(/^FN[^:]*:(.*)$/im)?.[1] || card.match(/^N[^:]*:(.*)$/im)?.[1]?.split(';').filter(Boolean).reverse().join(' ');
    const phone = card.match(/^TEL[^:]*:(.*)$/im)?.[1];
    if (name && phone) rows.push([name.trim(), phone.trim()]);
  }
  return toLines(rows);
}

export async function readClientsFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx') return readXlsx(new Uint8Array(await file.arrayBuffer()));
  if (ext === 'docx') return readDocx(new Uint8Array(await file.arrayBuffer()));
  if (ext === 'vcf') return readVcf(await file.text());
  if (ext === 'xls' || ext === 'doc') throw new Error('هذه صيغة قديمة — احفظ الملف بصيغة xlsx أو docx ثم أعد المحاولة');
  return file.text();
}

export const contactsSupported = isNative || (typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in navigator.contacts);

// جهات اتصال الهاتف: [{ name, phone }].
export async function pickContacts() {
  if (isNative) {
    const { Contacts } = await import('@capacitor-community/contacts');
    const permission = await Contacts.requestPermissions();
    if (permission.contacts !== 'granted') throw new Error('اسمح للتطبيق بالوصول لجهات الاتصال من إعدادات الهاتف');
    const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
    return contacts.map(c => ({ name: c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(' '), phone: c.phones?.[0]?.number || '' }))
      .filter(c => c.name && c.phone);
  }
  const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true });
  return picked.map(c => ({ name: c.name?.[0] || '', phone: c.tel?.[0] || '' })).filter(c => c.name && c.phone);
}
