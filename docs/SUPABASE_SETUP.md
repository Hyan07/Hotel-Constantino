# Configuração do Supabase

## 1. Criar ou selecionar o projeto

Crie um projeto PostgreSQL na região mais próxima disponível. Em **Project Settings → API**, copie:

- Project URL → `SUPABASE_URL`.
- Publishable key (`sb_publishable_...`) → `SUPABASE_PUBLISHABLE_KEY`.
- Secret key (`sb_secret_...`) → `SUPABASE_SECRET_KEY`, somente no ambiente do servidor.

Não coloque a secret key no navegador, em arquivos públicos ou em commits.

## 2. Aplicar as migrations

Com a Supabase CLI vinculada ao projeto:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

As migrations criam extensões, enums, tabelas, índices, restrição de sobreposição, funções, triggers, RLS, buckets privados e dados demonstrativos de categorias/quartos.

Também é possível copiar cada arquivo de `supabase/migrations` para o SQL Editor, respeitando a ordem numérica.

## 3. Auth

Em **Authentication → URL Configuration**:

- Site URL: URL HTTPS final do sistema.
- Redirect URLs: URL HTTPS final e, durante desenvolvimento, `http://localhost:3000`.

Desative cadastro público. Novos acessos são criados pelo administrador dentro do sistema ou pelo script seguro de bootstrap.

## 4. Primeiro administrador

Configure temporariamente `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_FULL_NAME` e `INITIAL_ADMIN_PASSWORD` e execute `npm run bootstrap:admin`. O trigger cria todo usuário como `viewer`; o script, autenticado pela secret key do servidor, eleva somente o usuário recém-criado para `admin`.

## 5. Storage

Os buckets `guest-documents` e `receipts` são privados. A migration limita os formatos a PDF/JPEG/PNG e o tamanho a 10 MB. O back-end cria URLs assinadas temporárias; não altere os buckets para públicos.

## 6. Realtime

As tabelas `rooms` e `reservations` são adicionadas à publicação `supabase_realtime`. O painel e a tela de quartos recebem mudanças sem recarregar manualmente.

## 7. Testes locais do banco

Com o Supabase local iniciado:

```bash
supabase start
supabase db reset
supabase test db
```

O teste confirma a existência da restrição de exclusão e a ativação da RLS nas reservas.
