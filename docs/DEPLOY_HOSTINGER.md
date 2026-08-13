# Deploy na Hostinger com GitHub

Este projeto é uma aplicação **Express/Node.js**. Não copie apenas `public/` para `public_html`: isso deixaria sem autenticação, API e banco.

## Requisitos

- Plano Hostinger compatível com Node.js Web Apps.
- Node.js 20 ou superior.
- Banco MySQL criado e `database/mysql/001_install.sql` importado.
- Repositório GitHub privado com `package.json` na raiz.

## 1. Enviar ao GitHub

Na pasta `constantinos-hotel`:

```bash
git init
git add .
git commit -m "Sistema Constantinos Hotel com MySQL"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/constantinos-hotel.git
git push -u origin main
```

O `.gitignore` já exclui `.env`, `node_modules`, ZIPs e logs. Antes do push, confirme com `git status` que `.env` não aparece.

## 2. Conectar na Hostinger

No hPanel:

1. Abra **Websites → Add Website**.
2. Escolha **Node.js Web App / Deploy Web App**.
3. Selecione **Import Git repository / Continue with GitHub**.
4. Autorize a Hostinger somente para o repositório necessário.
5. Escolha o repositório e a branch `main`.
6. Confirme Express/Node.js e a entrada `src/server.js` se a detecção pedir.
7. Não informe diretório de saída: o Express serve `public/` diretamente.

O `package.json` já define Node.js 20+, `npm start` e a entrada correta. A plataforma instala as dependências pelo lockfile.

## 3. Cadastrar variáveis

Em **Environment Variables**, adicione todas as variáveis do arquivo `.env.example` com os valores reais. Não adicione `PORT` se a plataforma fornecer essa variável automaticamente; o código respeita o valor injetado pela hospedagem.

Variáveis obrigatórias em produção:

```text
NODE_ENV=production
APP_URL=https://seu-dominio.com.br
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=nome_completo_do_banco
MYSQL_USER=nome_completo_do_usuario
MYSQL_PASSWORD=senha_do_banco
MYSQL_SSL=false
SESSION_SECRET=chave_aleatoria_de_32_ou_mais_caracteres
TRUST_PROXY=1
```

## 4. Primeiro deploy e administrador

Inicie o deploy e confira os logs. A aplicação só ficará funcional depois de:

1. importar o SQL no phpMyAdmin;
2. cadastrar as variáveis;
3. cadastrar temporariamente `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_FULL_NAME` e `INITIAL_ADMIN_PASSWORD`;
4. entrar no sistema e remover imediatamente essas três variáveis;
5. reiniciar/redeployar sem as variáveis de bootstrap.

O bootstrap só funciona quando `users` está vazia e exige senha forte. Não edite `password_hash` manualmente.

## 5. Deploy automático

Depois da conexão, cada `git push` na branch ligada inicia uma nova implantação:

```bash
git add .
git commit -m "Descreva a alteração"
git push
```

Mudanças no código não apagam o MySQL. Faça backup antes de executar uma nova migration ou alterar tabelas.

## Diagnóstico

| Sintoma | Verificação |
|---|---|
| `DATABASE_UNAVAILABLE` | Nome, usuário, senha e host do MySQL; SQL importado. |
| `INVALID_ORIGIN` | `APP_URL` precisa ser exatamente o domínio usado, com `https://`. |
| Login sempre falha | Administrador criado e coluna `active` igual a `1`. |
| Erro de build | Node 20+ e `package-lock.json` enviado. |
| Tela abre, mas API 404 | O site foi publicado como estático; refaça como Node.js Web App. |

Após publicar, visite `/api/health`, faça login e teste reserva, check-in, pagamento, limpeza e documento privado.
