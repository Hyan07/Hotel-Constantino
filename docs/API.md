# API protegida

Todas as respostas JSON usam `{ "ok": true, "data": ... }` ou `{ "ok": false, "error": ... }`.

## Sessão

| Método | Rota | Acesso | Finalidade |
|---|---|---|---|
| POST | `/api/auth/login` | Público, limitado | Valida e-mail/senha e cria cookie `HttpOnly`. |
| GET | `/api/auth/session` | Autenticado | Retorna usuário e perfil atuais. |
| POST | `/api/auth/logout` | Público | Invalida o cookie local. |
| GET | `/api/config` | Público | Nome, fuso e tipo do banco; não expõe credenciais. |
| GET | `/api/health` | Público | Testa processo e conexão MySQL. |

O navegador autentica pelo cookie `constantinos_session`, com `SameSite=Strict`, `HttpOnly` e `Secure` em produção. Não há token no `localStorage`.

## Dados e operações

| Método | Rota | Acesso | Finalidade |
|---|---|---|---|
| POST | `/api/data/query` | Conforme perfil/recurso | Consultas e gravações com campos e tabelas permitidos por lista fechada. |
| POST | `/api/operations/:name` | Conforme operação | Regras transacionais de hotelaria. |

Operações disponíveis:

- `get_dashboard_summary`
- `is_room_available`
- `transition_reservation`
- `change_reservation_room`
- `update_room_cleaning`
- `set_room_operational_status`
- `block_room_for_maintenance`
- `complete_room_maintenance`
- `record_sensitive_access`

Reservas são validadas e gravadas na mesma transação que bloqueia a linha do quarto com `SELECT ... FOR UPDATE`. A consulta visual de disponibilidade não substitui essa verificação final.

## Usuários

| Método | Rota | Perfil | Finalidade |
|---|---|---|---|
| GET | `/api/admin/users` | Administrador | Lista usuários sem hashes de senha. |
| POST | `/api/admin/users` | Administrador | Cria usuário e hash `bcrypt`. |
| PATCH | `/api/admin/users/:id/role` | Administrador | Altera perfil/estado e revoga a sessão anterior. |

## Arquivos privados

| Método | Rota | Perfil | Finalidade |
|---|---|---|---|
| POST | `/api/storage/upload` | Administrador/recepção | Recebe `multipart/form-data`, até 10 MB. |
| POST | `/api/storage/download-url` | Administrador/recepção | Resolve um caminho privado para URL interna. |
| GET | `/api/storage/files/:id` | Administrador/recepção | Entrega o arquivo somente com sessão válida. |

Formatos permitidos: PDF, JPEG e PNG. Upload e download são auditados.
