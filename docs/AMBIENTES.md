# Ambientes

Existem somente dois ambientes persistentes.

| Item            | Desenvolvimento          | Produção                        |
| --------------- | ------------------------ | ------------------------------- |
| Local           | computador do usuário    | Hostinger                       |
| Branch          | `develop`                | `main`                          |
| Banco           | `constantinos_hotel_dev` | MySQL exclusivo do hPanel       |
| Autenticação    | login ou bypass loopback | login obrigatório               |
| Seeds fictícios | permitidos               | proibidos                       |
| Segredos        | `backend/.env` ignorado  | Environment Variables do hPanel |

Testes usam `NODE_ENV=test` e banco isolado/efêmero; não são um terceiro ambiente implantado. Não criar staging persistente.

Em produção são obrigatórios `NODE_ENV=production`, `APP_URL` HTTPS, credenciais MySQL exclusivas, `SESSION_SECRET` forte e `DEV_AUTH_BYPASS=false`. `TRUST_PROXY` fica `false` até a topologia real ser confirmada. Nunca versionar `.env.production`.
