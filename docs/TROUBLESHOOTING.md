# Solução de problemas

## MySQL

- `ER_ACCESS_DENIED_ERROR`: confira `DB_USER`, `DB_HOST` e a senha em `backend/.env`; execute
  `SHOW GRANTS FOR 'constantinos_dev'@'localhost';`. Nunca troque para `root` na aplicação.
- Prompt `->`: execute `\c`; o cliente está aguardando o fim de uma instrução, não reportando erro.
- `ECONNREFUSED`: confirme se o serviço MySQL está iniciado e se a porta 3306 está ouvindo.
- Checksum divergente: não edite migration aplicada; restaure o arquivo e crie a próxima versão.
- Lock de migration: confirme que não há deploy/runners ativos antes de investigar a conexão presa.

Diagnóstico seguro:

```powershell
npm run env:check
npm run db:check
npm run db:status
```

## Aplicação

- Porta 3000/5173 ocupada: identifique o processo antes de encerrá-lo; não mate processos em massa.
- Ambiente inválido: produção exige HTTPS, senha do banco, `SESSION_SECRET` forte e bypass falso.
- 401: sessão ausente/expirada; faça login novamente. 403: permissão ou CSRF, não desative a defesa.
- 409: recarregue o registro; outra operação alterou a versão ou ocupou o período.
- Build ausente em produção: execute `npm run build` e confirme `frontend/dist/index.html`.

## Hostinger

Confira plano com Node Web Apps, Node 22, raiz do repositório, `npm ci`, `npm run build`,
`npm start`, branch `main` e Environment Variables. Um HTTP 200 com página padrão não comprova o
deploy: valide o nome real do sistema, `/api/health/live` e `/api/health/ready`. Consulte logs sem
copiar valores de ambiente ou dados pessoais.
