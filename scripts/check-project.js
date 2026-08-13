import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'public/index.html', 'src/server.js', '.env.example',
  'supabase/migrations/001_schema.sql', 'supabase/migrations/002_functions_triggers.sql',
  'supabase/migrations/003_rls_storage.sql', 'README.md'
];

const failures = [];
for (const relative of required) {
  if (!fs.existsSync(path.join(projectRoot, relative))) failures.push(`Arquivo obrigatório ausente: ${relative}`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.git'].includes(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

for (const file of walk(path.join(projectRoot, 'public'))) {
  const content = fs.readFileSync(file, 'utf8');
  if (/sb_secret_[a-zA-Z0-9_-]+/.test(content)) failures.push(`Chave secreta encontrada no front-end: ${path.relative(projectRoot, file)}`);
  if (/SUPABASE_SECRET_KEY/.test(content)) failures.push(`Nome de variável secreta exposto no front-end: ${path.relative(projectRoot, file)}`);
}

const schema = fs.readFileSync(path.join(projectRoot, 'supabase/migrations/001_schema.sql'), 'utf8');
const rls = fs.readFileSync(path.join(projectRoot, 'supabase/migrations/003_rls_storage.sql'), 'utf8');
if (!schema.includes('reservations_no_active_overlap')) failures.push('Restrição contra reservas sobrepostas não encontrada.');
for (const table of ['profiles','guests','rooms','reservations','payments','maintenance','audit_logs']) {
  if (!rls.includes(`alter table public.${table} enable row level security`)) failures.push(`RLS não habilitada para ${table}.`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Estrutura, segredos e controles de banco verificados.');
