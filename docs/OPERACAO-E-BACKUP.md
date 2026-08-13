# Operação, backup e rollback

## Rotina

- acompanhe `/api/health/ready`, erros por `requestId` e recursos no hPanel;
- revise usuários, permissões, administradores ativos e auditoria;
- trate tarefas de limpeza/manutenção pendentes e concilie lançamentos estornados;
- atualize dependências somente por PR com testes, build e auditoria.

## Backup

No desenvolvimento, use o `mysqldump` da instalação local e grave fora do repositório:

```powershell
mysqldump --host=127.0.0.1 --user=constantinos_dev --password `
  --single-transaction --routines --triggers constantinos_hotel_dev `
  --result-file="C:\CAMINHO-SEGURO\constantinos_hotel_dev.sql"
```

O cliente solicita a senha sem colocá-la na linha de comando. Em produção, use o backup do hPanel
e registre banco, horário, release e responsável. Nunca coloque dumps em Git ou em `frontend/`.

## Release e rollback

Antes de migration: confirme o backup, leia o SQL pendente e execute `npm run db:status`. Para
rollback de código, reimplante a tag/commit anterior de `main`. Para banco, prefira uma nova
migration compatível. Restaurar um backup pode apagar dados criados depois da cópia e exige
análise, autorização explícita e janela de manutenção.

Nunca execute `db:reset`, seed fictício, `DROP DATABASE` ou `TRUNCATE` amplo em produção. Em
incidentes, preserve horário, ação e `requestId`, sem copiar cookies, documentos ou credenciais
para chamados.
