# Constantino’s Hotel — Sistema de Gestão

Aplicação web interna para reservas, quartos, hóspedes, pagamentos, manutenção, limpeza, usuários e auditoria. A versão 2.0 usa **Node.js/Express + MySQL** e está preparada para uma aplicação Node.js com banco MySQL na Hostinger.

## O que está pronto

- Interface responsiva inspirada no DashStack, com painel de ocupação e navegação móvel.
- Reservas em lista, cartões e calendário, com check-in, check-out, cancelamento, troca de quarto, pagamento e comprovante.
- Bloqueio transacional contra duas reservas ativas para o mesmo quarto e período.
- Quartos, categorias, limpeza, bloqueios manuais e manutenção.
- Hóspedes com validação de CPF, detecção de duplicidade, histórico e documentos privados.
- Autenticação própria com senha em `bcrypt`, sessão em cookie `HttpOnly` e perfis por função.
- MySQL acessível somente pelo processo Node.js; nenhuma credencial do banco vai para o navegador.
- Arquivos privados armazenados em `LONGBLOB`, protegidos por sessão e auditoria.
- Atualização automática das telas operacionais a cada 30 segundos.

## Arquitetura

```text
public/                       HTML, CSS e JavaScript modular
src/                          API Node.js/Express
  lib/db.js                   Pool privado do MySQL
  middleware/                 Sessão, perfis e erros
  routes/                     Auth, dados, operações, usuários e arquivos
  services/                   Regras transacionais e auditoria
database/mysql/001_install.sql  Tabelas, índices, views e quartos iniciais
scripts/                      Migração, primeiro admin e verificações
tests/                        Testes automatizados
docs/                         MySQL, API, segurança e deploy
```

## Início rápido local

Requisitos: Node.js 20+ e MySQL 8 ou MariaDB 10.6+.

1. Copie `.env.example` para `.env` e preencha o MySQL e `SESSION_SECRET`.
2. Prepare o banco:

```bash
npm install
npm run db:migrate
```

3. Crie o primeiro administrador com variáveis temporárias:

```bash
INITIAL_ADMIN_EMAIL="admin@hotel.com.br" \
INITIAL_ADMIN_FULL_NAME="Administrador do Hotel" \
INITIAL_ADMIN_PASSWORD="SenhaForte#2026" \
npm run bootstrap:admin
```

4. Valide e execute:

```bash
npm test
npm run lint
npm start
```

Acesse `http://localhost:3000`.

Localmente, passe as variáveis somente no comando. Na Hostinger, elas podem ser cadastradas temporariamente no primeiro deploy e devem ser removidas logo após o primeiro login. A senha deve ter pelo menos 12 caracteres, maiúscula, minúscula, número e símbolo.

## Hostinger

O projeto precisa ser publicado como **Node.js Web App**, não extraído diretamente em `public_html`. O Express serve a interface e executa autenticação, regras de reserva e conexão privada com o MySQL.

- [Criar e instalar o MySQL](docs/MYSQL_SETUP.md)
- [Deploy pela Hostinger e GitHub](docs/DEPLOY_HOSTINGER.md)
- [Rotas da API](docs/API.md)
- [Segurança e LGPD](docs/SECURITY.md)

## Comandos

| Comando | Finalidade |
|---|---|
| `npm start` | Inicia a aplicação em produção. |
| `npm run dev` | Desenvolvimento com recarga. |
| `npm run db:migrate` | Importa/atualiza a estrutura MySQL. |
| `npm run bootstrap:admin` | Cria o primeiro administrador. |
| `npm test` | Executa os testes automatizados. |
| `npm run lint` | Verifica estrutura, segredos e controles críticos. |
