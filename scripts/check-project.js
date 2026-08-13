import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'public/index.html', 'src/server.js', '.env.example',
  'database/mysql/001_install.sql', 'src/lib/db.js', 'src/routes/auth.js',
  'src/services/data-query.js', 'README.md'
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
  if (/MYSQL_(PASSWORD|USER|HOST|DATABASE)/.test(content)) failures.push(`Credencial MySQL exposta no front-end: ${path.relative(projectRoot, file)}`);
  if (/password_hash/.test(content)) failures.push(`Hash de senha exposto no front-end: ${path.relative(projectRoot, file)}`);
}

const schema = fs.readFileSync(path.join(projectRoot, 'database/mysql/001_install.sql'), 'utf8');
const dataService = fs.readFileSync(path.join(projectRoot, 'src/services/data-query.js'), 'utf8');
const authMiddleware = fs.readFileSync(path.join(projectRoot, 'src/middleware/auth.js'), 'utf8');
for (const table of ['users','guests','rooms','reservations','payments','maintenance','audit_logs','private_files']) {
  if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`Tabela MySQL ausente: ${table}.`);
}
if (!dataService.includes('FOR UPDATE') || !dataService.includes('RESERVATION_OVERLAP')) failures.push('Bloqueio transacional contra sobreposição não encontrado.');
if (!authMiddleware.includes('verifySessionToken')) failures.push('Autenticação de sessão do servidor não encontrada.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Estrutura MySQL, segredos e controles transacionais verificados.');
