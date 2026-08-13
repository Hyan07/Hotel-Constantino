# Autenticação e permissões

Senhas usam `crypto.scrypt`, salt aleatório, formato versionado e comparação em tempo constante.
Após o login, o identificador anterior é revogado e uma nova sessão é persistida no MySQL.

- cookie de sessão `HttpOnly`, `SameSite=Strict` e `Secure` em produção;
- token CSRF separado e obrigatório em mutações autenticadas;
- expiração configurada por `SESSION_TTL_HOURS` e logout com revogação real;
- resposta genérica, atraso por derivação de senha, bloqueio após falhas e rate limit no login;
- sessão, senha, cookie e token nunca aparecem nos logs.

## RBAC

A autorização é validada em cada rota pelo backend. A interface apenas reflete o acesso; esconder
um botão não concede nem remove permissão.

| Perfil          | Acesso inicial                                                                    |
| --------------- | --------------------------------------------------------------------------------- |
| `administrador` | todas as permissões, usuários, financeiro e auditoria                             |
| `funcionario`   | operação de hóspedes, quartos em leitura, reservas, estadias, limpeza e relatório |

A relação completa está na migration `002_roles_and_permissions.sql`. O serviço impede a remoção
ou inativação do último administrador ativo.

## Primeiro administrador

Cadastre temporariamente, no ambiente correto:

```dotenv
ADMIN_BOOTSTRAP_ENABLED=true
BOOTSTRAP_ADMIN_NAME=
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PASSWORD=
```

Em ambiente com terminal, execute `npm run admin:create`. Em hospedagem gerenciada sem comando
interativo, a primeira inicialização executa o mesmo bootstrap. A operação fica automaticamente
inerte assim que existe um administrador ativo; ela nunca substitui um administrador existente.
Remova imediatamente `BOOTSTRAP_ADMIN_*` e volte `ADMIN_BOOTSTRAP_ENABLED=false`, então reinicie.

## Bypass de desenvolvimento

O acesso automático existe apenas quando, simultaneamente, `NODE_ENV=development`,
`DEV_AUTH_BYPASS=true`, o endereço TCP real é `127.0.0.1` ou `::1` e o usuário fictício criado
pelo seed existe. O código não usa `X-Forwarded-For` para essa decisão. Produção recusa o bypass
durante a validação do ambiente.
