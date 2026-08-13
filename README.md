# Constantino's Hotel

Sistema de gestão hoteleira em monorepo, com frontend em HTML/CSS/JavaScript (Vite), API
Express e persistência MySQL. O backend serve o build do frontend em produção, mantendo as
duas aplicações separadas no código e no mesmo domínio em execução.

## Módulos

- autenticação por sessão, CSRF e permissões no servidor;
- dashboard operacional;
- hóspedes, quartos e reservas em lista e linha do tempo;
- check-in, consumos, pagamentos, checkout e limpeza;
- manutenção, financeiro, relatórios, usuários e auditoria;
- migrations versionadas, seed exclusivo de desenvolvimento e diagnósticos seguros.

## Requisitos

- Node.js 22 LTS ou superior;
- npm 10 ou superior;
- MySQL 8.4 local;
- banco `constantinos_hotel_dev` e usuário `constantinos_dev@localhost`.

## Instalação local no Windows

Na raiz do projeto, em PowerShell:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env -ErrorAction SilentlyContinue
npm run env:check
npm run db:check
npm run db:migrate
npm run db:seed
npm run dev
```

Abra <http://localhost:5173>. O Vite encaminha `/api` para o backend na porta 3000. O bypass
local só funciona em `development`, com `DEV_AUTH_BYPASS=true` e conexão real de loopback.

Antes dos comandos de banco, preencha `DB_PASSWORD` apenas em `backend/.env`. O arquivo é
ignorado pelo Git. Se `db:check` responder `ER_ACCESS_DENIED_ERROR`, siga os comandos em
[docs/BANCO-DE-DADOS.md](docs/BANCO-DE-DADOS.md).

## Scripts

| Comando                                                | Função                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `npm run dev`                                          | inicia backend (3000) e frontend (5173)                          |
| `npm run build`                                        | gera `frontend/dist`                                             |
| `npm run release:build`                                | gera o frontend e aplica migrations pendentes; uso controlado    |
| `npm start`                                            | inicia o backend, que serve a API e o build em produção          |
| `npm run env:check`                                    | valida ambiente sem revelar segredos                             |
| `npm run db:check`                                     | testa MySQL e informa versão/banco                               |
| `npm run db:status`                                    | mostra migrations e checksums                                    |
| `npm run db:migrate`                                   | aplica migrations pendentes com advisory lock                    |
| `npm run db:seed`                                      | carrega dados realistas somente em desenvolvimento/teste         |
| `npm run db:reset -- --confirm=constantinos_hotel_dev` | recria o schema local; destrutivo e proibido em produção         |
| `npm run admin:create`                                 | cria o primeiro administrador com bootstrap temporário           |
| `npm run lint`                                         | executa ESLint                                                   |
| `npm run format`                                       | aplica Prettier                                                  |
| `npm run format:check`                                 | verifica formatação                                              |
| `npm test`                                             | executa testes; integração MySQL roda quando `RUN_DB_TESTS=true` |
| `npm run check`                                        | lint, formatação, testes e build; obrigatório antes de release   |

`db:reset` apaga as tabelas do banco selecionado. Confira o nome e mantenha backup antes de
executá-lo. Nunca use esse comando em produção.

## Ambientes

O projeto possui exatamente dois ambientes persistentes:

| Ambiente              | Branch    | Banco                     | Autenticação                         |
| --------------------- | --------- | ------------------------- | ------------------------------------ |
| Desenvolvimento local | `develop` | `constantinos_hotel_dev`  | login ou bypass restrito ao loopback |
| Produção Hostinger    | `main`    | MySQL exclusivo do hPanel | login obrigatório                    |

O banco efêmero da CI usa `NODE_ENV=test` e não constitui ambiente implantado.

## Estrutura principal

```text
frontend/                 interface Vite em JavaScript ES Modules
backend/src/config/       ambiente e logs
backend/src/db/           pool, migrations, seeds e repositórios
backend/src/routes/v1/    contratos REST e autorização
backend/src/services/     regras de negócio e transações
backend/tests/            testes unitários, API e fluxo MySQL
docs/                     arquitetura, operação e implantação
.github/workflows/ci.yml  CI com Node 22 e MySQL 8.4
```

## Documentação

- [Arquitetura](docs/ARQUITETURA.md)
- [Ambientes](docs/AMBIENTES.md)
- [Banco de dados](docs/BANCO-DE-DADOS.md)
- [Autenticação e permissões](docs/AUTENTICACAO-E-PERMISSOES.md)
- [API](docs/API.md)
- [Deploy na Hostinger](docs/DEPLOY-HOSTINGER.md)
- [Operação e backup](docs/OPERACAO-E-BACKUP.md)
- [Solução de problemas](docs/TROUBLESHOOTING.md)
- [Changelog](docs/CHANGELOG.md)

Produção ainda exige o gate descrito no documento de deploy: plano compatível, repositório
GitHub, banco/variáveis no hPanel, autorização explícita, migrations, administrador e smoke test.
