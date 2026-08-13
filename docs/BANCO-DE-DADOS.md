# Banco de dados

## MySQL local no Windows

Entre no cliente MySQL com uma conta administrativa somente para a preparação inicial. Se o
prompt mostrar `->`, a instrução anterior está incompleta: execute `\c` e pressione Enter antes
de colar um novo comando.

Execute separadamente e substitua o texto da senha por uma senha local forte. Não envie essa
senha pela conversa e não use `root` na aplicação.

```sql
CREATE DATABASE IF NOT EXISTS constantinos_hotel_dev
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

```sql
CREATE USER IF NOT EXISTS 'constantinos_dev'@'localhost'
  IDENTIFIED BY 'SUBSTITUA_POR_UMA_SENHA_LOCAL_FORTE';
```

```sql
ALTER USER 'constantinos_dev'@'localhost'
  IDENTIFIED BY 'SUBSTITUA_POR_UMA_SENHA_LOCAL_FORTE';
```

```sql
GRANT ALL PRIVILEGES ON constantinos_hotel_dev.*
  TO 'constantinos_dev'@'localhost';
```

```sql
SHOW GRANTS FOR 'constantinos_dev'@'localhost';
```

Cadastre a mesma senha somente em `backend/.env`. Depois, na raiz do projeto:

```powershell
npm run db:check
npm run db:migrate
npm run db:status
npm run db:seed
```

`db:check` informa conexão, versão e banco, sem imprimir credenciais. O usuário deve aparecer com
privilégios somente sobre `constantinos_hotel_dev.*`.

## Migrations

| Ordem | Arquivo                         | Conteúdo                                                     |
| ----- | ------------------------------- | ------------------------------------------------------------ |
| 001   | `001_initial_schema.sql`        | usuários, sessões, hotel, finanças, idempotência e auditoria |
| 002   | `002_roles_and_permissions.sql` | perfis `administrador`/`funcionario` e permissões granulares |

O runner registra versão e SHA-256 em `schema_migrations` e usa `GET_LOCK` para impedir dois
runners simultâneos. Nunca altere um arquivo já aplicado; crie a próxima migration numerada.
Produção recebe apenas `db:migrate`: seed fictício e `db:reset` recusam `NODE_ENV=production`.

## Reset local

O reset apaga as tabelas do banco selecionado e exige o nome exato como confirmação:

```powershell
npm run db:reset -- --confirm=constantinos_hotel_dev
```

Confira `DB_NAME` antes do comando. Nunca use reset em produção e faça backup antes de qualquer
mudança destrutiva de schema.
