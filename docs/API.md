# API REST

Base: `/api/v1`. Saúde permanece em `/api/health`, `/api/health/live` e `/api/health/ready`.

Sucesso usa `{ "data": ..., "meta": ... }`; listagens incluem paginação. Erros usam:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "requestId": "identificador-para-suporte",
    "details": []
  }
}
```

Produção nunca retorna stack trace ou SQL. `pageSize` é limitado a 100. Datas usam
`AAAA-MM-DD`, valores monetários usam centavos inteiros e agregados mutáveis exigem `version`.

## Contratos principais

| Método                | Caminho                                | Operação                              |
| --------------------- | -------------------------------------- | ------------------------------------- |
| POST                  | `/auth/login`, `/auth/logout`          | iniciar/encerrar sessão               |
| GET                   | `/auth/me`, `/dashboard`               | identidade e visão operacional        |
| GET/POST/PATCH/DELETE | `/guests`                              | hóspedes e arquivamento lógico        |
| GET/POST/PATCH        | `/rooms`                               | inventário e cadastro                 |
| POST                  | `/rooms/:id/status`                    | transição operacional                 |
| GET/POST/PATCH        | `/reservations`                        | listar, criar e alterar reservas      |
| POST                  | `/reservations/:id/confirm`            | confirmar                             |
| POST                  | `/reservations/:id/cancel`, `/no-show` | encerrar sem apagar histórico         |
| POST                  | `/reservations/:id/check-in`           | criar hospedagem e ocupar quarto      |
| GET                   | `/stays`, `/stays/:id`                 | hospedagens e detalhe financeiro      |
| POST                  | `/stays/:id/charges`, `/payments`      | consumos e pagamentos                 |
| POST                  | `/stays/:id/checkout`                  | fechar hospedagem e solicitar limpeza |
| GET/POST              | `/housekeeping`                        | tarefas de limpeza/manutenção         |
| POST                  | `/housekeeping/:id/start`, `/complete` | executar tarefa                       |
| GET                   | `/charges`, `/payments`                | consultar transações                  |
| GET/POST              | `/finance`                             | lançamentos manuais                   |
| POST                  | `/finance/:id/reverse`                 | estornar sem excluir                  |
| GET                   | `/reports?from=...&to=...`             | indicadores do período                |
| GET/POST/PATCH        | `/users`                               | administração de usuários             |
| GET                   | `/users/roles`, `/audit`               | perfis e trilha auditável             |

Todas as rotas após `/auth` exigem sessão. Mutações exigem `X-CSRF-Token`. Criação de reserva,
check-in, pagamento e checkout também exigem `Idempotency-Key` único; repetir a mesma chave e o
mesmo corpo retorna a resposta original, enquanto corpo diferente retorna conflito.

Os códigos usuais são 200/201/204, 400 para contrato inválido, 401 sem sessão, 403 sem permissão
ou CSRF, 404 ausente, 409 para versão/conflito/sobreposição, 422 para regra de negócio e 429 para
limite de requisições.
