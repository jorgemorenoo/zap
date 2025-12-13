# SmartZap (SaaS de automação WhatsApp)

<div align="center">

![SmartZap](https://img.shields.io/badge/SmartZap-WhatsApp%20Marketing-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)

CRM + automação de campanhas no WhatsApp (Cloud API), com fila/workflows (Upstash QStash) e geração de conteúdo via IA.

<p align="center">
   <a href="docs/GUIA_DE_INSTALACAO.md">
      <img alt="Guia de Instalação" src="https://img.shields.io/badge/GUIA%20DE%20INSTALA%C3%87%C3%83O-CLIQUE%20AQUI-22c55e?style=for-the-badge" />
   </a>
</p>

</div>

---

## O que é

O SmartZap é uma aplicação full-stack (Next.js App Router) que permite:

- gerenciar **contatos** e campos personalizados;
- visualizar/sincronizar/criar **templates** do WhatsApp;
- criar e disparar **campanhas** (envio em massa) com pré-validação;
- acompanhar **métricas** e alertas de conta;
- configurar integrações (Supabase, Meta, Upstash, IA) por variáveis de ambiente e/ou wizard.

Este repositório também é usado como base educacional. A pasta `tmp/` pode conter materiais extras e utilitários.

## Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS v4, shadcn/ui + Radix.
- **Backend**: API Routes (Next.js, runtime Node.js) + integrações externas.
- **Banco**: Supabase (PostgreSQL).
- **Fila/Workflows**: Upstash QStash.
- **IA**: Vercel AI SDK v6 com suporte a Gemini/OpenAI/Anthropic.
- **WhatsApp**: Meta WhatsApp Cloud API (Graph API v24+).

## Arquitetura (primeiro: como tudo se conecta)

Esta seção existe para responder rapidamente:

- **quem chama quem** (UI → API → filas → Meta → webhook → DB → UI)
- **onde cada dado mora** (o que é fonte da verdade vs cache)
- **onde ficam as integrações** (Supabase, Upstash/QStash, Meta)

> O GitHub renderiza Mermaid em Markdown usando blocos ` ```mermaid `.

### Mapa de serviços (UI → Next.js → Upstash → Meta → Supabase)

```mermaid
flowchart TB
   %% ========== Client ==========
   subgraph B["Browser (Dashboard)"]
      UI["UI (Pages/Components)"]
      Hooks["Hooks (React Query + estado)"]
      Services["Services (fetch para /api)"]
      UI --> Hooks --> Services
   end

   %% ========== App ==========
   subgraph N["Next.js (App Router / Node runtime)"]
      API["API Routes\napp/api/**/route.ts"]
      Lib["Lib\n(regras, validação, integrações)"]
      API --> Lib
   end

   Services --> API

   %% ========== Data ==========
   subgraph S["Supabase (PostgreSQL)"]
      Settings["settings\n(credenciais/config)"]
      Campaigns["campaigns\n(status/contadores)"]
      CC["campaign_contacts\n(status por contato + message_id)"]
      Contacts["contacts"]
      Templates["templates\n(cache local)"]
      Alerts["account_alerts"]
   end

   Lib --> Settings
   Lib --> Campaigns
   Lib --> CC
   Lib --> Contacts
   Lib --> Templates
   Lib --> Alerts

   %% UI updates
   S -->|"Realtime/queries"| Hooks

   %% ========== Async ==========
   subgraph U["Upstash"]
      QStash["QStash / Workflow\n(fila + steps duráveis)"]
      Redis["Redis (opcional)\ncache/estado/limites"]
   end

   Lib --> QStash
   QStash --> API

   %% ========== External ==========
   subgraph M["Meta (WhatsApp Cloud API / Graph API)"]
      WA["/messages (envio)"]
      WH["Webhook callbacks\n(delivered/read/failed)"]
   end

   Lib --> WA
   WH --> API

   Settings -.->|"credenciais: DB (primário) / ENV (fallback)"| Lib
```

### Fluxo de campanha (do clique ao webhook)

```mermaid
sequenceDiagram
   autonumber
   participant U as Usuário
   participant UI as Dashboard (Browser)
   participant API as Next.js API Routes
   participant DB as Supabase (Postgres)
   participant Q as Upstash QStash/Workflow
   participant WA as Meta WhatsApp Cloud API
   participant WH as Webhook (/api/webhook)

   U->>UI: Disparar campanha
   UI->>API: POST /api/campaign/dispatch
   API->>DB: Buscar campanha/contatos/template local
   API->>DB: Buscar credenciais (settings)
   API->>Q: Iniciar workflow (payload inclui phoneNumberId + accessToken)
   API-->>UI: 202/200 (agendado/iniciando)

   loop Steps do workflow (batches)
      Q->>API: POST /api/campaign/workflow (step)
      API->>DB: Claim idempotente (campaign_contacts)
      API->>WA: POST /v24.0/{phoneNumberId}/messages
      WA-->>API: message_id ou erro
      API->>DB: Salva message_id + status sent/failed
   end

   note over WA,WH: A Meta envia eventos assíncronos depois

   WA->>WH: POST webhook (delivered/read/failed)
   WH->>DB: Atualiza status + incrementa contadores (RPC)
   DB-->>UI: UI enxerga via queries/realtime
```

### Modelo mental do banco (o que persiste)

O relacionamento que amarra tudo em campanhas é:

`campaigns` → `campaign_contacts` (por contato, com `message_id`) → atualizado por workflow e pelo webhook.

```mermaid
erDiagram
   SETTINGS ||--o{ CAMPAIGNS : "configura/cria"
   CONTACTS ||--o{ CAMPAIGN_CONTACTS : "participa"
   CAMPAIGNS ||--o{ CAMPAIGN_CONTACTS : "possui"
   TEMPLATES ||--o{ CAMPAIGNS : "baseado_em"
   CAMPAIGNS ||--o{ ACCOUNT_ALERTS : "pode_gerar"

   SETTINGS {
      string id
      string phoneNumberId
      string businessAccountId
      string accessToken
      string verifyToken
   }

   CONTACTS {
      string id
      string phone
      string name
      string status
   }

   TEMPLATES {
      string name
      string language
      string spec_hash
   }

   CAMPAIGNS {
      string id
      string templateName
      string status
      int recipients
      int sent
      int delivered
      int read
      int failed
      int skipped
   }

   CAMPAIGN_CONTACTS {
      string id
      string campaign_id
      string contact_id
      string phone
      string status
      string message_id
   }

   ACCOUNT_ALERTS {
      string id
      string type
      int code
      string message
      bool dismissed
   }
```

### Como navegar no código (Page → Hook → Service → API)

### Padrão de frontend (Page → Hook → Service → API)

Em geral, as telas seguem o padrão:

- `app/(dashboard)/**/page.tsx`: página “fina” que apenas conecta dados/handlers.
- `hooks/**`: controller hooks (React Query + estado de UI).
- `services/**`: client de API (fetch para rotas em `app/api/**`).
- `app/api/**/route.ts`: rotas server-side (validação, DB, integrações).

### Pastas principais

```txt
app/                  # Next.js App Router (páginas + API)
components/            # UI (shadcn) e views por feature
hooks/                 # Controller hooks (React Query)
services/              # Camada de acesso às rotas da API
lib/                   # Regras de negócio, utilitários e integrações
supabase/              # Migrations/artefatos do banco
scripts/               # Scripts utilitários (dev/ops)
```

## Como rodar localmente

### Pré-requisitos

- Node.js 20+ (recomendado)
- Conta no Supabase (para o banco)
- Conta no Meta (WhatsApp Cloud API) para uso real
- Conta no Upstash (QStash) para disparos em lote

### 1) Instalar dependências

```bash
npm install
```

### 2) Configurar variáveis de ambiente

Copie o arquivo de exemplo:

```bash
cp .env.example .env.local
```

Preencha os valores no `.env.local`. O arquivo `.env.example` já descreve cada variável.

Principais variáveis (resumo):

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- **WhatsApp Cloud API**: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`
- **Fila**: `QSTASH_TOKEN`
- **Segurança local**: `MASTER_PASSWORD`, `SMARTZAP_API_KEY`, `SMARTZAP_ADMIN_KEY`
- **IA (opcional)**: `GEMINI_API_KEY` (ou chaves de OpenAI/Anthropic)

### 3) Subir o servidor

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Uso (fluxo recomendado)

1. Faça login (senha definida em `MASTER_PASSWORD`).
2. Vá em **Configurações** e conecte:
   - Supabase (se ainda não estiver configurado)
   - WhatsApp Cloud API
   - QStash (para campanhas)
   - IA (opcional)
3. Importe contatos (CSV) ou cadastre manualmente.
4. Sincronize/crie templates.
5. Crie uma campanha e rode o **precheck** antes do disparo.

## Comandos úteis

```bash
npm run dev
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Deploy

O deploy padrão é na Vercel.

- Configure as variáveis de ambiente na Vercel (pode usar o wizard do app).
- Rode build para validar: `npm run build`.

## Troubleshooting

### “Supabase not configured. Complete setup at /setup”

As variáveis do Supabase não estão preenchidas (ou estão incorretas). Confira:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable/anon)
- `SUPABASE_SECRET_KEY` (service role/secret — backend apenas)

### Erros de permissão/#200 no Meta

Geralmente indica token sem permissões adequadas.

### Rate limit por par (131056)

Isso acontece quando o envio para o mesmo destinatário ocorre rápido demais. O projeto inclui tratamento e tempos de espera recomendados.

---

## Documentação interna

Além deste README, veja:

- `docs/GUIA_CONFIGURACAO.md`
- `docs/guia.md`

