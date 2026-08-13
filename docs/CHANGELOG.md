# Changelog

## Não lançado

### Adicionado

- monorepo Vite/Express com build integrado e dois ambientes persistentes;
- MySQL, migrations verificáveis, seed local idempotente e diagnósticos;
- scrypt, sessões MySQL, CSRF, rate limit, RBAC, bypass local e bootstrap controlado;
- hóspedes, quartos, reservas, estadias, limpeza, pagamentos e financeiro;
- dashboard, relatórios, usuários, permissões, idempotência e auditoria;
- interface responsiva e acessível conectada à API;
- testes unitários/API/fluxo MySQL e CI com Node 22 e MySQL 8.4;
- documentação operacional e preparação para Hostinger.

### Pendente para `v1.0.0`

- validar migrations e fluxo de integração no MySQL local;
- publicar GitHub/validar CI e concluir o gate Hostinger com autorização;
- executar smoke test real de produção e registrar rollback.
