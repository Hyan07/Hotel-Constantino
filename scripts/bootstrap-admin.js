import crypto from 'node:crypto';
import { supabaseAdmin } from '../src/lib/supabase.js';

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const fullName = process.env.INITIAL_ADMIN_FULL_NAME?.trim();
const password = process.env.INITIAL_ADMIN_PASSWORD;

if (!email || !fullName || !password) {
  console.error('Defina INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_FULL_NAME e INITIAL_ADMIN_PASSWORD somente durante esta execução.');
  process.exit(1);
}

const strongPassword = password.length >= 12
  && /[a-z]/.test(password)
  && /[A-Z]/.test(password)
  && /\d/.test(password)
  && /[^a-zA-Z0-9]/.test(password);

if (!strongPassword) {
  console.error('A senha precisa ter 12+ caracteres, maiúscula, minúscula, número e símbolo.');
  process.exit(1);
}

const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName }
});

if (error) {
  console.error(`Não foi possível criar o administrador: ${error.message}`);
  process.exit(1);
}

const { error: profileError } = await supabaseAdmin
  .from('profiles')
  .update({ full_name: fullName, role: 'admin', active: true })
  .eq('id', data.user.id);

if (profileError) {
  await supabaseAdmin.auth.admin.deleteUser(data.user.id);
  console.error(`O usuário foi revertido porque o perfil não pôde ser configurado: ${profileError.message}`);
  process.exit(1);
}

console.log(`Administrador criado com sucesso: ${email} (${crypto.randomUUID().slice(0, 8)}).`);
console.log('A senha não foi gravada nem exibida. Remova as variáveis temporárias do ambiente.');
