# Painel Sixxis — Gestão Unificada Mercado Livre (+ Amazon depois)

Ferramenta interna e exclusiva da Sixxis para gerir 5 contas do Mercado Livre
em um só lugar: anúncios, publicidade (Mercado Ads), vendas, perguntas,
mensagens, relatórios, market share e análise de concorrência. Amazon entra
como Fase 2. Sem gestão de afiliados por enquanto.

## Stack

- **Next.js 16** (TypeScript, App Router, Turbopack) — aplicação e API routes
- **Tailwind CSS v4** — estilo
- **Supabase** — banco de dados Postgres + autenticação e permissões (admin/colaborador)
- **Vercel** — hospedagem (plano Hobby, gratuito)
- **API oficial do Mercado Livre** — dados de pedidos, métricas, perguntas, mensagens, Mercado Ads

## Ambientes em produção

- **App:** https://sixxis-painel.vercel.app
- **Repositório:** github.com/marcelloadesanti-bit/sixxis-painel (privado)
- **Supabase project:** sixxis-painel (org marcelloa.desanti@gmail.com's Org, região São Paulo)
- **App Mercado Livre Developers:** "Sixxis Painel Vendedor ML" (Client ID 1002056422194288),
  registrado na conta SIXXIS COMERCIAL GOIANIA LTDA

## Estado atual do projeto

- [x] Contas criadas: GitHub, Vercel (Hobby, 2FA ativado), Supabase (Free)
- [x] Repositório `sixxis-painel` criado e código enviado
- [x] Esqueleto do projeto (Next.js 16 + Tailwind v4 + Supabase + stub OAuth Mercado Livre)
- [x] Projeto conectado à Vercel e publicado (deploy de produção funcionando)
- [x] Aplicação registrada no Mercado Livre Developers (Client ID/Secret configurados na Vercel)
- [x] Projeto Supabase real criado, com tabelas `profiles` (usuários/papéis admin-colaborador)
      e `ml_accounts` (contas ML conectadas), RLS habilitado
- [ ] Tela de login/cadastro do painel (Supabase Auth)
- [ ] Primeira conta ML autorizada de verdade (fluxo OAuth completo salvando token no Supabase)
- [ ] Rota de webhook do Mercado Livre (`/api/mercadolivre/webhook`) implementada
- [ ] Dashboard consolidado e individual (Fase 1 do roadmap)
- [ ] Central de perguntas e mensagens unificada (Fase 1)

Ver o roadmap completo no documento de escopo original (`saas_mercado_livre_blueprint.docx`).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencher com as chaves reais (ver Vercel > Environment Variables)
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

## Banco de dados (Supabase)

Duas tabelas criadas até agora:

- **`profiles`** — um registro por usuário do painel (colaboradores da Sixxis).
  Campo `role` (`admin` ou `colaborador`) e `allowed_modules` (quais áreas o
  colaborador pode acessar). O primeiro usuário que se cadastrar vira `admin`
  automaticamente (trigger `handle_new_user`).
- **`ml_accounts`** — uma linha por conta do Mercado Livre conectada, guardando
  `access_token`/`refresh_token` e quem conectou. Só `admin` pode
  adicionar/remover contas; qualquer usuário autenticado pode visualizar.

## Próximos passos (retomar por aqui)

1. Criar a tela de login/cadastro (Supabase Auth) — primeiro cadastro vira admin.
2. Completar a rota `/api/mercadolivre/callback` para salvar o token recebido
   na tabela `ml_accounts` (hoje ela só troca o code por token e loga no console).
3. Testar o fluxo OAuth do início ao fim com uma das 5 contas ML.
4. Implementar `/api/mercadolivre/webhook` para receber notificações em tempo real.
5. Construir o dashboard consolidado e por conta (Fase 1 do escopo).
6. Construir a central única de perguntas e mensagens (Fase 1 do escopo).
