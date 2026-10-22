// تصدير Excel (.xlsx) و Word (.docx) بدون مكتبات ثقيلة: نكتب OOXML بسيطاً ونضغطه بـ fflate.
import { zipSync, strToU8 } from 'fflate';
import { statusText } from '../data.js';
import { L } from '../i18n.js';
import { saveFile } from './files.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const isRtl = () => typeof document !== 'undefined' && document.documentElement?.dir === 'rtl';

// يحذف محارف التحكم غير المسموحة في XML ويهرّب الرموز الخاصة.
const esc = value => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isNumber = v => typeof v === 'number' && Number.isFinite(v);
const hasArabic = s => /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(s);

const zip = files => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])), { level: 6 });

export const downloadBlob = (filename, bytes, type) => saveFile(filename, bytes, type);

/* ───────────── Excel ───────────── */

const colName = index => {
  let name = ''; let n = index + 1;
  while (n > 0) { const m = (n - 1) % 26; name = String.fromCharCode(65 + m) + name; n = Math.floor((n - 1) / 26); }
  return name;
};

const sheetNames = sheets => {
  const used = new Set();
  return sheets.map((sheet, i) => {
    const base = (String(sheet.name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || `Sheet${i + 1}`).slice(0, 31);
    let name = base; let n = 2;
    while (used.has(name.toLowerCase())) { const suffix = ` (${n++})`; name = base.slice(0, 31 - suffix.length) + suffix; }
    used.add(name.toLowerCase());
    return name;
  });
};

function sheetXml(rows, rtl) {
  const widths = [];
  const body = rows.map((row, r) => {
    const cells = (row || []).map((cell, c) => {
      const text = isNumber(cell) ? String(cell) : String(cell ?? '');
      widths[c] = Math.max(widths[c] || 0, Math.min(60, [...text].length));
      if (cell === null || cell === undefined || cell === '') return '';
      const ref = `${colName(c)}${r + 1}`;
      const style = r === 0 ? ' s="1"' : '';
      if (isNumber(cell)) return `<c r="${ref}"${style}><v>${cell}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, (w || 0) + 2)}" customWidth="1"/>`).join('')}</cols>` : '';
  return `${HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}>${rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

export function buildXlsx(sheets, { rtl = isRtl() } = {}) {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }];
  const names = sheetNames(list);
  const files = {
    '[Content_Types].xml': `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>',
    '_rels/.rels': `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<bookViews><workbookView/></bookViews><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  };
  list.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet.rows || [], rtl); });
  return zip(files);
}

export const exportXlsx = (filename, sheets) => downloadBlob(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, buildXlsx(sheets), XLSX_TYPE);

/* ───────────── Word ───────────── */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const run = (text, { bold, size, rtl } = {}) => {
  const s = String(text ?? '');
  const props = `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${bold ? '<w:b/><w:bCs/>' : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}${rtl || hasArabic(s) ? '<w:rtl/>' : ''}`;
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(s)}</w:t></w:r>`;
};

const para = (text, { rtl, bold, size, after = 120, jc } = {}) => `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="${after}"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>${text === '' || text === undefined ? '' : run(text, { bold, size, rtl: rtl && hasArabic(String(text)) })}</w:p>`;

function table(rows, rtl) {
  const cols = Math.max(1, ...rows.map(r => (r || []).length));
  const width = Math.floor(9360 / cols);
  const border = side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`;
  const tr = (row, header) => `<w:tr>${Array.from({ length: cols }, (_, c) => {
    const cell = row?.[c];
    const text = isNumber(cell) ? String(cell) : String(cell ?? '');
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : ''}</w:tcPr>${para(text, { rtl, bold: header, after: 0, size: 20 })}</w:tc>`;
  }).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr>${rtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`
    + rows.map((row, i) => tr(row, i === 0)).join('') + '</w:tbl>';
}

export function buildDocx(title, sections, { rtl = isRtl() } = {}) {
  const body = [
    para(title, { rtl, bold: true, size: 32, after: 240 }),
    ...sections.flatMap(section => [
      section.heading ? para(section.heading, { rtl, bold: true, size: 26, after: 120 }) : '',
      section.rows?.length ? table(section.rows, rtl) : para('—', { rtl }),
      para('', { rtl, after: 200 }),
    ]),
  ].join('');
  const files = {
    '[Content_Types].xml': `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    'word/document.xml': `${HEAD}<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>${rtl ? '<w:bidi/>' : ''}</w:sectPr></w:body></w:document>`,
  };
  return zip(files);
}

export const exportDocx = (filename, title, sections) => downloadBlob(filename.endsWith('.docx') ? filename : `${filename}.docx`, buildDocx(title, sections), DOCX_TYPE);

/* ───────────── جداول جاهزة للنسخ الاحتياطي ───────────── */

export function clientsTable(data) {
  return [[L('الاسم', 'Name'), L('الهاتف', 'Phone'), L('البريد', 'Email'), L('تاريخ الميلاد', 'Birthday'), L('الوسوم', 'Tags'), L('ملاحظات', 'Notes'), L('تاريخ الإضافة', 'Added on')],
    ...data.clients.map(c => [c.name || '', c.phone || '', c.email || '', c.birthday || '', (c.tags || []).join(', '), c.notes || '', String(c.createdAt || '').slice(0, 10)])];
}

export function appointmentsTable(data) {
  const clients = Object.fromEntries(data.clients.map(c => [c.id, c]));
  const staff = Object.fromEntries((data.staff || []).map(s => [s.id, s.name]));
  const total = a => Math.max(0, (a.items || []).reduce((s, i) => s + Number(i.price || 0), 0) - Number(a.discount || 0));
  const paid = a => (a.payments || []).filter(p => p.kind !== 'tip').reduce((s, p) => s + Number(p.amount || 0), 0);
  return [[L('التاريخ', 'Date'), L('الوقت', 'Time'), L('العميل', 'Client'), L('الهاتف', 'Phone'), L('الموظف', 'Staff'), L('الخدمات', 'Services'), L('المبلغ', 'Amount'), L('المدفوع', 'Paid'), L('الحالة', 'Status')],
    ...[...data.appointments].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
      .map(a => [a.date, a.time || '', clients[a.clientId]?.name || '', clients[a.clientId]?.phone || '', staff[a.staffId] || '', (a.items || []).map(i => i.name).join(' + '), total(a), paid(a), statusText[a.status] || a.status || ''])];
}
