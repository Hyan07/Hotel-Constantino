# Segurança e LGPD

## Controles implementados

- RLS habilitada em todas as tabelas expostas.
- Políticas específicas por perfil e princípio do menor privilégio.
- Todo novo usuário nasce como `viewer`; somente operação administrativa do servidor altera perfis.
- Secret key restrita ao Node.js e validada na inicialização.
- Buckets privados, formatos/tamanho limitados e URLs assinadas com expiração.
- Documentos mascarados nas listagens e acesso completo registrado em `audit_logs`.
- Auditoria automática de inserções, alterações e exclusões lógicas nas entidades críticas.
- Senhas tratadas exclusivamente pelo Supabase Auth.
- Helmet/CSP, limite de requisições, corpo JSON limitado e mensagens de erro sem detalhes internos.
- Reserva conflitante bloqueada no PostgreSQL por exclusion constraint.

## Operação recomendada

- Crie uma conta individual para cada colaborador; não compartilhe logins.
- Revogue imediatamente acessos de quem deixar a equipe.
- Revise mensalmente usuários, auditoria e objetos armazenados.
- Defina política de retenção para documentos e registros conforme necessidade legal/contratual.
- Mantenha a secret key somente no cofre de variáveis da hospedagem.
- Ative MFA para administradores quando disponível no projeto Supabase.
- Faça backup periódico do banco e teste restauração.

## Limites de acesso

- `admin`: operação completa e administração de usuários/auditoria.
- `reception`: reservas, hóspedes, pagamentos, check-in/out, quartos e manutenção.
- `housekeeping`: quartos, manutenção atribuída e estados de limpeza via RPC.
- `viewer`: painel agregado e consulta operacional de quartos, sem dados pessoais.
