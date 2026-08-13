# Arquitetura

```mermaid
flowchart LR
  U["Recepção no navegador"] -->|"HTTPS /api/v1"| N["Node.js 22 + Express"]
  N --> A["Sessão, CSRF e RBAC"]
  N --> S["Serviços de domínio"]
  S --> R["Repositórios e transações"]
  R --> M[("MySQL 8.4")]
  N --> F["frontend/dist"]
  N --> L["Pino + requestId"]
```

O frontend e o backend são aplicações separadas no código. O navegador consome somente a API; regras críticas, dinheiro, concorrência, autorização e auditoria ficam no backend. Em produção, o Express serve o build Vite no mesmo domínio.

| Camada         | Local                     | Responsabilidade                             |
| -------------- | ------------------------- | -------------------------------------------- |
| Interface      | `frontend/src/`           | HTML semântico, CSS, estado e serviços HTTP. |
| HTTP           | `backend/src/routes/v1/`  | Contratos Zod, autenticação e permissões.    |
| Domínio        | `backend/src/services/`   | Reservas, estadias, limpeza e finanças.      |
| Dados          | `backend/src/db/`         | Pool, repositórios, migrations e seed.       |
| Infraestrutura | `config/`, `middlewares/` | Ambiente, logs, erros, CSRF e rate limit.    |

```mermaid
erDiagram
  USERS ||--o{ USER_ROLES : possui
  ROLES ||--o{ USER_ROLES : atribui
  ROLES ||--o{ ROLE_PERMISSIONS : concede
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : compoe
  USERS ||--o{ SESSIONS : autentica
  GUESTS ||--o{ RESERVATIONS : principal
  ROOMS ||--o{ RESERVATIONS : recebe
  RESERVATIONS ||--o| STAYS : origina
  STAYS ||--o{ CHARGES : recebe
  STAYS ||--o{ PAYMENTS : recebe
  PAYMENTS ||--o| FINANCIAL_ENTRIES : gera
  ROOMS ||--o{ HOUSEKEEPING_TASKS : exige
  ROOMS ||--o{ ROOM_STATUS_HISTORY : registra
  USERS ||--o{ AUDIT_LOGS : atua
```

Dinheiro usa inteiros em centavos. Datas hoteleiras usam `DATE`; eventos usam UTC e são apresentados em `America/Sao_Paulo`. Agregados críticos usam versão e locks transacionais.
