# Constantino’s Hotel — Sistema de Gestão

Aplicação web interna para a operação do Constantino’s Hotel, em Passos–MG. O projeto reúne reservas, quartos, hóspedes, pagamentos, manutenção, limpeza, usuários e auditoria em uma interface responsiva.

## O que está pronto

- Painel com ocupação, situação dos quartos, agenda de chegadas/saídas e alertas financeiros.
- Reservas em lista, cartões e calendário, com filtros, comprovante para impressão, pagamentos, check-in e check-out.
- Proteção PostgreSQL contra sobreposição de reservas ativas, inclusive em requisições simultâneas.
- Quartos, categorias, limpeza em tempo real e bloqueios transacionais para manutenção.
- Hóspedes com CPF validado, detecção de duplicidade, histórico, acessibilidade e documentos privados.
- Supabase Auth com perfis de administrador, recepção, governança/limpeza e consulta.
- RLS em todas as tabelas expostas, funções protegidas e auditoria de alterações/acessos sensíveis.
- Back-end Node.js/Express para administração de usuários, URLs temporárias de arquivos e operações com chave secreta.
- Layout sem rolagem horizontal no celular, tabelas em cartões, navegação móvel e suporte a teclado.

## Arquitetura

```text
public/                    Front-end HTML, CSS e JavaScript modular
src/                       API Node.js/Express
  middleware/              Autenticação, perfis e erros
  routes/                  Configuração pública, administração e Storage
  services/                Auditoria de operações do servidor
supabase/migrations/       Esquema, funções, RLS, Storage e dados de demonstração
supabase/tests/            Testes SQL das regras críticas
scripts/                   Criação segura do administrador e verificação do projeto
tests/                     Testes automatizados do servidor
docs/                      Configuração, API, segurança e deploy
```

O navegador recebe somente `SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` é validada e utilizada exclusivamente pelo processo Node.js.

## Executar localmente

Requisitos: Node.js 20+ e um projeto Supabase.

1. Copie `.env.example` para `.env` e preencha as três variáveis do Supabase.
2. Aplique as migrations em ordem, conforme [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
3. Instale e execute:

```bash
npm install
npm test
npm run lint
npm start
```

Acesse `http://localhost:3000`.

## Primeiro administrador

Depois das migrations e com o `.env` configurado, execute uma única vez com variáveis temporárias:

```bash
INITIAL_ADMIN_EMAIL="admin@hotel.com.br" \
INITIAL_ADMIN_FULL_NAME="Administrador do Hotel" \
INITIAL_ADMIN_PASSWORD="uma-senha-forte" \
npm run bootstrap:admin
```

Use uma senha exclusiva com pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo. Não grave essas três variáveis no `.env` de produção.

## Documentação

- [Configuração do Supabase](docs/SUPABASE_SETUP.md)
- [Deploy na Hostinger](docs/DEPLOY_HOSTINGER.md)
- [Rotas e funções](docs/API.md)
- [Segurança e LGPD](docs/SECURITY.md)
