# Painel Sixxis — Gestão Unificada Mercado Livre (+ Amazon depois)

Ferramenta interna e exclusiva da Sixxis para gerir 5 contas do Mercado Livre
em um só lugar: anúncios, publicidade (Mercado Ads), vendas, perguntas,
mensagens, relatórios, market share e análise de concorrência. Amazon entra
como Fase 2. Sem gestão de afiliados por enquanto.

## Stack

- **Next.js 14** (TypeScript, App Router) — aplicação e API routes
- **Supabase** — banco de dados Postgres + autenticação e permissões (admin/colaborador)
- **Vercel** — hospedagem (plano Hobby, gratuito)
- **API oficial do Mercado Livre** — dados de pedidos, métricas, perguntas, mensagens, Mercado Ads

## Estado atual do projeto

- [x] Contas criadas: GitHub, Vercel (Hobby), Supabase (Free)
- [x] Repositório `sixxis-painel` criado
- [x] Esqueleto do projeto (Next.js + Tailwind + Supabase + stub OAuth Mercado Livre)
- [ ] Aplicação registrada no Mercado Livre Developers (Client ID/Secret)
- [ ] Projeto conectado à Vercel (deploy)
- [ ] Tabelas criadas no Supabase (contas ML, usuários, permissões, pedidos, perguntas, mensagens)
- [ ] Primeira conta ML autorizada de verdade (fluxo OAuth completo)
- [ ] Dashboard consolidado (Fase 1 do roadmap)

Ver o roadmap completo em `docs/blueprint.docx` (documento de escopo original).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencher as chaves do Supabase e do Mercado Livre
npm run dev
```

## Estrutura de pastas

```
src/
  app/                     paginas e rotas (App Router)
    api/mercadolivre/      rotas de integracao com a API do Mercado Livre
  lib/
    supabase/              clientes Supabase (navegador e servidor)
    mercadolivre/          OAuth e chamadas a API do Mercado Livre
```

## Próximos passos (retomar por aqui)

1. Registrar o app no Mercado Livre Developers e preencher `ML_CLIENT_ID` /
   `ML_CLIENT_SECRET` / `ML_REDIRECT_URI` no `.env.local` (e depois na Vercel).
2. Conectar este repositório a um projeto na Vercel.
3. Criar as tabelas iniciais no Supabase (`ml_accounts`, `users`, `roles`).
4. Testar o fluxo OAuth com uma conta ML de teste.
5. Construir o dashboard consolidado (Fase 1 do escopo).
