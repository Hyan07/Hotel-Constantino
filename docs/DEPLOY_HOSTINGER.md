# Deploy na Hostinger

O projeto deve ser implantado como **aplicação Node.js**, não como site estático, porque as operações administrativas e as URLs temporárias do Storage rodam no Express.

## Requisitos do plano

- Plano Hostinger com suporte a aplicações Node.js.
- Node.js 20 ou superior.
- Um domínio/subdomínio apontado para o site.
- Projeto Supabase configurado e migrations aplicadas.

## Arquivo de implantação

Envie o código-fonte sem `.env`, `node_modules`, logs ou arquivos ZIP anteriores. O `package.json` informa:

- instalação: `npm install`;
- entrada: `src/server.js`;
- inicialização: `npm start`;
- Node.js: 20+.

## Variáveis de ambiente da aplicação

Configure no ambiente Node.js da Hostinger:

```text
NODE_ENV=production
APP_URL=https://seu-dominio
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
STORAGE_GUEST_DOCUMENTS_BUCKET=guest-documents
STORAGE_RECEIPTS_BUCKET=receipts
SIGNED_URL_TTL_SECONDS=300
TRUST_PROXY=1
```

Não envie o `.env` dentro do arquivo de deploy. Configure os valores no painel/ambiente protegido da aplicação.

## Verificação após publicar

1. `GET /api/health` deve responder `200` e `database: available`.
2. A página inicial deve exibir “Constantino’s Hotel”.
3. Faça login com o administrador inicial.
4. Crie duas reservas conflitantes para o mesmo quarto: a segunda deve ser recusada.
5. Teste check-in, check-out e atualização da limpeza em duas abas.
6. Confirme que documentos abrem apenas por link temporário e sem sessão anônima.
