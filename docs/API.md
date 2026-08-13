# API e funções protegidas

## Rotas Express

| Método | Rota | Perfil | Finalidade |
|---|---|---|---|
| GET | `/api/config` | Público | URL e chave publicável do Supabase; nunca retorna secret key. |
| GET | `/api/health` | Público | Estado do processo e conectividade com o banco. |
| GET | `/api/admin/users` | Administrador | Lista perfis, e-mails e último acesso. |
| POST | `/api/admin/users` | Administrador | Cria usuário confirmado e define perfil inicial. |
| PATCH | `/api/admin/users/:id/role` | Administrador | Altera perfil/estado; impede autoalteração. |
| POST | `/api/storage/signed-upload` | Administrador/recepção | Gera URL temporária para upload privado. |
| POST | `/api/storage/signed-download` | Administrador/recepção | Gera URL temporária de leitura privada. |

As rotas protegidas exigem `Authorization: Bearer <access_token>` do Supabase Auth.

## RPCs PostgreSQL

| Função | Finalidade |
|---|---|
| `is_room_available` | Consulta segura de disponibilidade por período. |
| `transition_reservation` | Confirma, faz check-in/check-out, cancela ou marca no-show com transição validada. |
| `change_reservation_room` | Transfere a reserva e sincroniza os estados do quarto antigo/novo na mesma transação. |
| `update_room_cleaning` | Limita a governança aos estados de limpeza autorizados. |
| `set_room_operational_status` | Limita bloqueios manuais aos estados seguro `available`/`blocked`. |
| `block_room_for_maintenance` | Cria manutenção e bloqueia o quarto na mesma transação. |
| `complete_room_maintenance` | Conclui manutenção e envia o quarto para limpeza. |
| `record_sensitive_access` | Audita abertura dos dados completos de um hóspede. |
| `get_dashboard_summary` | Retorna somente contagens operacionais, sem documentos pessoais. |

Inserções simultâneas continuam protegidas pela constraint `reservations_no_active_overlap`, independentemente do JavaScript ou da RPC de consulta.
