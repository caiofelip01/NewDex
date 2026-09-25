# Frontdex

Workspace com frontend React + Vite em `Frontdex/` e backend Node em `backend/`.

## Estrutura

- `Frontdex/`: aplicacao React com Vite
- `backend/`: API HTTP, autenticacao, sessoes e acesso ao banco
- `api/`: entrada serverless para deploy no Vercel
- `vercel.json`: roteamento entre frontend e API

## Requisitos

- Node.js 20+
- Um banco Postgres compativel com a `DATABASE_URL`

## Configuracao local

1. Crie um arquivo `.env.local` na raiz com base em `.env.example`
2. Preencha:

```env
DATABASE_URL="postgres://user:password@host/database"
SESSION_COOKIE_SECRET="troque-isto-por-um-segredo-com-pelo-menos-32-caracteres"
APP_ORIGIN="http://localhost:5173"
```

## Comandos

```bash
npm install
npm run dev
npm run check
npm run build
npm run preview
```

## Como funciona localmente

- `npm run dev` sobe:
  - frontend Vite em `http://localhost:5173`
  - backend local em `http://localhost:8787`
- O backend carrega `.env` e aplica `.env.local` por cima para os segredos locais
- O Vite faz proxy de `/api` para o backend local
- O schema do banco e aplicado automaticamente na primeira chamada da API

## Seguranca ja aplicada

- Senhas com hash via `scrypt`
- Cookies de sessao com `HttpOnly`, `SameSite=Lax` e expiracao
- Token de sessao salvo no banco apenas em formato hash
- Expiracao por tempo total e por inatividade
- Limite de sessoes ativas por usuario
- Rate limit simples em login e cadastro
- Bloqueio de origem suspeita em rotas mutaveis
- Limite de tamanho para payload JSON
- Content-Type JSON obrigatorio quando houver corpo na requisicao
- Allowlist de campos por operacao para evitar mass assignment
- Validacao de UUIDs recebidos nas rotas
- Isolamento por loja nas consultas e validacao de referencias entre entidades
- Respostas `404` e `405` distintas, com header `Allow` quando aplicavel
- Headers de seguranca e politica CSP restritiva nas respostas da API
- ID unico de requisicao devolvido em `X-Request-Id` e nos erros
- Erros internos normalizados sem stack trace ou detalhes do banco no cliente

Controles de infraestrutura como WAF/CDN, Redis para rate limit distribuido, MFA e
alertas centralizados devem ser adicionados quando houver ambiente de producao e
mais de uma instancia da API. O rate limit atual e intencionalmente local, adequado
ao MVP, e nao deve ser tratado como protecao contra DDoS.

## Deploy

O deploy pode ser feito a partir da raiz do workspace. O `vercel.json` encaminha:

- frontend estatico para `Frontdex/dist`
- requisicoes `/api/*` para `api/index.js`
