# Deploy na Hostinger

## Estado comprovado

O código está preparado, mas a produção não foi publicada. A consulta autenticada disponível em
13/08/2026 não listou sites na conta conectada; portanto plano, domínio, repositório e banco de
produção permanecem **não confirmados**. Nenhuma criação, deploy, migration ou alteração de DNS
foi executada.

Antes do gate, confirme no hPanel que o plano real oferece **Node.js Web Apps** (atualmente o
recurso é oferecido nos planos Business e Cloud). Use uma aplicação Node gerenciada conectada ao
GitHub, nunca um site PHP em `public_html`.

## Configuração do aplicativo

| Campo                     | Valor                            |
| ------------------------- | -------------------------------- |
| Repositório               | repositório GitHub deste projeto |
| Branch publicada          | `main`                           |
| Diretório raiz            | raiz do repositório              |
| Node.js                   | `22.x`                           |
| Instalação                | `npm ci`                         |
| Build normal              | `npm run build`                  |
| Start                     | `npm start`                      |
| Entry file, se solicitado | `backend/src/server.js`          |
| Porta                     | `process.env.PORT`               |

O Express serve `frontend/dist` e `/api` no mesmo domínio. Não configure `localhost` no frontend.

## Banco e variáveis

Crie um banco e um usuário MySQL exclusivos no hPanel. Copie exatamente host, porta, nome e
usuário mostrados pelo painel; não presuma `127.0.0.1`. Cadastre como Environment Variables:

```text
NODE_ENV=production
PORT=(fornecida pela plataforma)
APP_URL=https://DOMINIO_FINAL
LOG_LEVEL=info
TRUST_PROXY=false
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_CONNECTION_LIMIT=10
DB_SSL=false
SESSION_SECRET=
SESSION_COOKIE_NAME=constantinos.sid
SESSION_TTL_HOURS=8
DEV_AUTH_BYPASS=false
ADMIN_BOOTSTRAP_ENABLED=false
```

Gere segredos exclusivos no próprio ambiente; não copie `backend/.env`. Mantenha `TRUST_PROXY`
desligado até a topologia real ser comprovada.

## Migration e primeiro acesso

Migrations são etapa explícita, nunca executadas em `npm start`. Se o plano disponibilizar comando
único, execute `npm run db:migrate` após o backup. Se a aplicação gerenciada não permitir comandos
npm via SSH, altere temporariamente o campo Build para `npm run release:build`, implante uma vez,
confira o log e volte para `npm run build`. Esse script apenas gera o build e aplica migrations
idempotentes; nunca roda seed ou reset.

Para o primeiro administrador, habilite temporariamente as quatro variáveis de bootstrap, faça
uma inicialização, teste o login e remova-as imediatamente conforme
[AUTENTICACAO-E-PERMISSOES.md](AUTENTICACAO-E-PERMISSOES.md).

## Gate de produção

1. `npm run check` e `npm audit --omit=dev --audit-level=high` aprovados.
2. Integração MySQL e CI aprovadas em `develop`.
3. PR revisado de `develop` para `main` e tag preparada.
4. Plano Node, domínio, banco e variáveis confirmados no hPanel.
5. Backup registrado antes de migration relevante.
6. Autorização explícita do proprietário para mutações externas.
7. Deploy de `main`, migration explícita e `/api/health/ready` aprovado.
8. Bootstrap removido e smoke test de login → reserva → check-in → pagamento → checkout → limpeza.
9. Versão, URL, horário e rollback registrados.

Referências oficiais: [Node.js Web App](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/),
[migração via GitHub](https://www.hostinger.com/support/how-to-migrate-a-node-js-application-to-hostinger/),
[MySQL com Node.js](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/),
[variáveis de ambiente](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
e [versões do Node.js](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/).
