# Segurança e LGPD

## Controles implementados

- MySQL acessado somente pelo Node.js com queries parametrizadas e listas fechadas de tabelas/campos.
- Senhas com hash `bcrypt` e custo 12; o hash nunca é retornado pela API.
- Sessão JWT assinada em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- Alterar ou desativar um usuário incrementa `session_version` e revoga sessões anteriores.
- Perfis `admin`, `reception`, `housekeeping` e `viewer` verificados novamente no servidor em cada requisição.
- Bloqueio de origem em requisições mutáveis, rate limit geral e limite específico no login.
- Reserva conflitante bloqueada dentro de transação com lock do quarto, inclusive sob concorrência.
- Arquivos privados em MySQL, formatos/tamanho limitados, sem diretório público e com acesso auditado.
- Documento mascarado nas listagens e abertura dos dados completos registrada em `audit_logs`.
- Helmet/CSP, JSON limitado, proteção contra path traversal e erros internos ocultados.

## Responsabilidades operacionais

- Use uma conta individual por colaborador; não compartilhe logins.
- Desative imediatamente quem deixar a equipe.
- Guarde `MYSQL_PASSWORD` e `SESSION_SECRET` somente nas variáveis protegidas da hospedagem.
- Nunca envie `.env` ao GitHub, por e-mail ou em capturas de tela.
- Use HTTPS e mantenha `APP_URL` igual ao domínio canônico.
- Faça backups regulares e teste a restauração do banco, incluindo `private_files`.
- Defina prazo de retenção e base legal para documentos pessoais com orientação jurídica adequada.
- Revise usuários, auditoria e dependências pelo menos mensalmente.

## Perfis

- `admin`: operação, usuários e auditoria.
- `reception`: reservas, hóspedes, pagamentos, quartos e manutenção.
- `housekeeping`: painel, quartos, limpeza e conclusão de manutenção.
- `viewer`: painel agregado e consulta de quartos.

## Limitação importante

Os documentos ficam no próprio banco para sobreviver a novos deploys e permanecer fora da área pública. Isso simplifica a Hostinger, mas aumenta o tamanho dos backups. Se o volume crescer muito, migre `private_files` para um armazenamento de objetos privado sem alterar a regra de autorização da API.
