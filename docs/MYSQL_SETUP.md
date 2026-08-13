# Configuração do MySQL

## 1. Criar o banco na Hostinger

No hPanel, abra **Databases → MySQL Databases**, crie um banco, um usuário e uma senha forte. Guarde exatamente os quatro dados exibidos:

- host, normalmente `localhost` quando a aplicação e o banco estão na mesma conta;
- nome completo do banco, incluindo o prefixo `u123456789_`;
- nome completo do usuário, também com o prefixo;
- senha do usuário do banco.

Não use os exemplos literais de `.env.example`.

## 2. Importar a estrutura

Abra o phpMyAdmin do banco criado, selecione a aba **Import**, envie `database/mysql/001_install.sql` e execute. O arquivo cria as tabelas, índices, views, categorias e 12 quartos iniciais. Ele não cria usuário do sistema nem contém senha.

Como alternativa, em um computador que consiga conectar ao banco, configure `.env` e execute:

```bash
npm run db:migrate
```

## 3. Configurar a aplicação

Cadastre estas variáveis no ambiente protegido da aplicação Node.js:

```text
NODE_ENV=production
APP_URL=https://seu-dominio.com.br
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=u123456789_constantinos
MYSQL_USER=u123456789_hotel
MYSQL_PASSWORD=SENHA_DO_BANCO
MYSQL_SSL=false
MYSQL_CONNECTION_LIMIT=10
SESSION_SECRET=CHAVE_ALEATORIA_COM_32_OU_MAIS_CARACTERES
SESSION_HOURS=8
MAX_UPLOAD_BYTES=10485760
TRUST_PROXY=1
```

Gere `SESSION_SECRET` localmente com um gerenciador de senhas ou:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Nunca publique `.env` no GitHub e nunca coloque essas variáveis no JavaScript do navegador.

## 4. Criar o administrador

No primeiro deploy da Hostinger, cadastre temporariamente:

```text
INITIAL_ADMIN_EMAIL=admin@hotel.com.br
INITIAL_ADMIN_FULL_NAME=Administrador do Hotel
INITIAL_ADMIN_PASSWORD=SenhaForte#2026
```

Se a tabela `users` estiver vazia, o primeiro start cria exatamente esse administrador com hash `bcrypt`. Faça login, remova as três variáveis do hPanel e redeploy/reinicie a aplicação. Se já existir outro usuário, o bootstrap automático se recusa a criar uma nova conta.

Em um ambiente com terminal, também é possível usar `npm run bootstrap:admin` conforme o README. Nunca insira senha manualmente no phpMyAdmin: `password_hash` recebe um hash, não texto puro.

## 5. Conferir

- `GET /api/health` deve responder `databaseStatus: "available"`.
- A tabela `users` deve ter o administrador.
- O login deve abrir o painel.
- Duas reservas conflitantes para o mesmo quarto devem recusar a segunda.
- Um documento de hóspede só deve abrir com uma sessão ativa.

## Backup

Ative os backups da hospedagem e exporte o banco antes de mudanças grandes. Os documentos enviados ficam em `private_files`; portanto, o backup do banco também é o backup desses arquivos.
