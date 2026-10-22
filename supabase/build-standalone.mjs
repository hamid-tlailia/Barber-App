// يولّد نسخاً مستقلة (ملف واحد) من دوال واتساب للصق في محرر Supabase: node supabase/build-standalone.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('./', import.meta.url);
const common = readFileSync(new URL('functions/_shared/common.ts', root), 'utf8');

for (const name of ['whatsapp-webhook', 'send-reminders', 'daily-report', 'broadcast']) {
  const source = readFileSync(new URL(`functions/${name}/index.ts`, root), 'utf8');
  const shared = /import\s*\{[^}]*\}\s*from\s*'\.\.\/_shared\/common\.ts';\n/;
  if (!shared.test(source)) throw new Error(`${name}: shared import not found`);
  const body = source.replace(shared, '');
  const npmImports = body.match(/^import .* from 'npm:.*';\n/gm) ?? [];
  const rest = npmImports.reduce((text, line) => text.replace(line, ''), body);
  const out = `// نسخة مستقلة من دالة ${name} للصق في محرر Supabase (تتضمن الأدوات المشتركة).\n${npmImports.join('')}\n${common}\n${rest}`;
  writeFileSync(new URL(`standalone/${name}.ts`, root), out);
  console.log(`standalone/${name}.ts`);
}
