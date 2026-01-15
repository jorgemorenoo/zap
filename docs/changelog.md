# Changelog (docs)

## 15/01/2026 - MiniApps dinâmicos (agendamento)

- **✅ Publicação preserva Flow JSON dinâmico**
  - `app/api/flows/[id]/meta/publish/route.ts` agora mantém o `flow_json` salvo quando `data_api_version=3.0`
  - Evita regenerar a partir do `spec.form` e perder `data_exchange` no agendamento com Google Calendar

- **🧭 Builder não sobrescreve Flow dinâmico**
  - `app/(dashboard)/flows/builder/[id]/page.tsx` mantém `flow_json` dinâmico ao salvar/publicar
  - Garante que o template de agendamento continue com `data_exchange` após ajustes no formulário

- **🧩 Validação local aceita componente Form**
  - `lib/meta-flow-json-validator.ts` agora permite `Form` e valida filhos internos
  - Desbloqueia publish de MiniApps dinâmicos com `data_exchange`

- **🔗 Endpoint URL resolvido para MiniApps dinâmicos**
  - `app/api/flows/endpoint/keys/route.ts` passa a usar origin dos headers e salvar URL no settings
  - `app/api/flows/[id]/meta/publish/route.ts` utiliza URL salva quando envs não estão setadas

- **🧰 Endpoint keys com runtime Node e sem cache**
  - `app/api/flows/endpoint/keys/route.ts` força `nodejs` + `force-dynamic`
  - Evita resposta stale e garante headers disponíveis para montar URL

- **🛰️ Endpoint URL sem cache no painel**
  - `components/features/settings/FlowEndpointPanel.tsx` força `no-store`
  - `app/api/flows/endpoint/keys/route.ts` retorna `Cache-Control: no-store`

- **🧯 Evita sobrescrever URL com localhost**
  - `app/api/flows/endpoint/keys/route.ts` não grava URL local no settings
  - Prioriza URL salva/ambiente quando o request não é localhost

- **🧪 Debug de origem do endpoint**
  - `app/api/flows/endpoint/keys/route.ts` expõe origem da URL para diagnóstico
  - `components/features/settings/FlowEndpointPanel.tsx` loga `header/env/stored`

## 25/12/2025 - Debug (Run/Trace para campanhas)

- **🔎 Timeline estruturada por `trace_id` (sem caçar logs)**
  - Nova migration: `supabase/migrations/0026_add_campaign_trace_events.sql` cria `campaign_trace_events`
  - Eventos relevantes do workflow/webhook passam a ser persistidos (best-effort) para inspeção no Supabase
  - Persistência é filtrada para evitar alto volume (erros + fases-chave como `batch_start`/`batch_end`/`complete`)

- **🧷 Correlação ponta-a-ponta (precheck → workflow → webhook)**
  - `traceId` agora é gerado cedo no `dispatch` e gravado em `campaign_contacts` já no precheck (pending/skipped)
  - Webhook emite eventos “positivos” (`delivered`/`read`) na timeline quando o update é aplicado

- **🖥️ Interface de Debug (Trace View) na tela de campanha**
  - Adicionado painel “Debug • Execuções (Trace)” nos detalhes da campanha para listar `trace_id` e navegar na timeline (`campaign_trace_events`)
  - Endpoints novos: `GET /api/campaigns/:id/trace` e `GET /api/campaigns/:id/trace-events`
  - O painel agora **auto-seleciona o último run automaticamente** (sem precisar clicar em `trace_id`), com fallback via métricas quando disponível

## 25/12/2025 - Segurança (Sentinel)

- **🛡️ Hardening de headers HTTP (Next.js)**
  - Adicionados headers defensivos (ex: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`)
  - `Strict-Transport-Security` habilitado somente em produção
  - Desativado `X-Powered-By` para reduzir fingerprinting

- **🔒 Proteção de endpoint sensível de setup**
  - `GET /api/setup/auto-migrate` agora exige `SMARTZAP_ADMIN_KEY` (ou `SMARTZAP_API_KEY`) via `Authorization: Bearer ...` ou `?key=...`
  - Detalhes de erro agora são omitidos em produção para reduzir vazamento de informações

- **🧱 Blindagem pós-instalação + logs só em dev**
  - `POST /api/setup/migrate` agora é **desativado** quando `SETUP_COMPLETE=true` (evita uso após instalação)
  - `console.log` em rotas de setup/auth passam a rodar somente fora de produção (reduz ruído e risco de info leak)

- **🚨 Proteção crítica de PII (defesa em profundidade)**
  - Rotas `app/api/contacts/**` agora exigem **sessão válida** ou **API key** (`Authorization: Bearer ...`)

- **🔐 Webhook Meta (anti-spoof)**
  - `POST /api/webhook` valida `X-Hub-Signature-256` quando `META_APP_SECRET` está configurado (modo compatível: sem secret não bloqueia)

## 25/12/2025 - Parte 4 (Polish Final)

- **✨ Refinamento de Focus States**
  - Substituído `outline` por `ring` para focus indicators mais elegantes
  - Adicionado `ring-offset` para melhor separação visual
  - Usado opacidade (`/50`) para sutileza
  - Ajustado `ring-offset-color` para combinar com fundo escuro
  
  **Mudança Visual:**
  - Antes: Contorno grosso e mal posicionado
  - Depois: Ring fino, elegante e bem posicionado
  - Resultado: Focus state mais profissional e menos intrusivo

## 25/12/2025 - Parte 3 (Padronização Completa)

- **🎯 Padronização Total do Sistema**
  - Auditoria completa de **TODOS** os componentes principais
  - Adicionados **Tooltips** em ContactListView (editar, excluir, paginação)
  - Padronizados **Hover effects** em todas as tabelas (glow verde + 200ms)
  - Verificados **Focus states** em todos os botões interativos
  - Confirmado **Loading states** consistentes em todo o sistema
  
  **Componentes Auditados e Padronizados:**
  - ✅ CampaignListView: 100% padronizado
  - ✅ ContactListView: 100% padronizado
  - ✅ TemplateListView: 100% padronizado
  - ✅ DashboardView: 100% padronizado
  - ✅ DashboardShell: 100% padronizado
  - ✅ SettingsView: 100% padronizado
  
  **Padrões Garantidos:**
  - 🎯 Tooltips em TODOS os botões icon-only
  - ✨ Hover effects consistentes (shadow + glow)
  - ⏱️ Transições uniformes (200ms)
  - 🎨 Focus-visible em TODOS os elementos interativos
  - 🔄 Loading skeletons com animação escalonada

## 25/12/2025 - Parte 2

- **✨ Melhorias Visuais e Interativas (Opção C)**
  - Adicionados **Tooltips** em todos os botões icon-only (hover para ver descrição)
  - Criado componente **ConfirmationDialog** reutilizável para ações destrutivas
  - Melhorados **Loading Skeletons** com animações escalonadas (staggered)
  - Adicionados **Hover Effects** com glow sutil em cards e linhas de tabela
  - Melhoradas **transições** de 200ms para interações mais suaves
  
  **Componentes com melhorias visuais:**
  - ✨ CampaignListView: Tooltips em todos os botões de ação
  - ✨ DashboardView: Hover effects e loading skeletons melhorados
  - ✨ ConfirmationDialog: Novo componente para confirmações
  
  **Impacto Visual:**
  - 🎯 Tooltips aparecem ao passar o mouse (300ms delay)
  - ✨ Glow sutil verde ao passar sobre linhas de tabela
  - 🔄 Loading skeletons com animação em cascata
  - 🎨 Transições suaves em todas as interações

## 25/12/2025 - Parte 1

- **🎨 Melhorias de UX e Acessibilidade (100+ micro-melhorias)**
  - Adicionados **ARIA labels** em todos os botões icon-only para melhor acessibilidade com leitores de tela
  - Implementados **estilos focus-visible** consistentes em toda a aplicação para navegação por teclado
  - Melhorado **estado vazio** em CampaignListView com mensagens contextuais e orientações
  - Adicionados **aria-live** regions para feedback dinâmico (paginação, contadores)
  - Implementado **aria-current** em navegação e paginação para indicar página/item ativo
  - Adicionados **aria-hidden** em ícones decorativos para evitar poluição em leitores de tela
  - Melhorada **navegação por teclado** com suporte a Escape e Enter em overlays
  - Adicionados **aria-pressed** em botões de filtro para indicar estado ativo
  - Implementados **aria-expanded** em botões de toggle para indicar estado de expansão
  - Melhorados **breadcrumbs** com navegação ARIA apropriada
  - Adicionados **role="status"** em spinners de loading para feedback de estado
  - Melhorados **labels descritivos** em todos os inputs e selects
  - Implementado **aria-label** contextual em notificações com contadores
  - Adicionados **focus trap** em modais para melhor navegação por teclado
  
  **Componentes melhorados:**
  - ✅ CampaignListView: 10+ melhorias (ARIA, focus, empty state, pagination)
  - ✅ DashboardShell: 20+ melhorias (navegação, sidebar, mobile menu, breadcrumbs)
  - ✅ ContactListView: 10+ melhorias (botões de ação, filtros, busca)
  - ✅ TemplateListView: 10+ melhorias (filtros, botões de ação, busca)
  - ✅ DashboardView: Melhorias em CTAs e focus states
  
  **Impacto:**
  - 📱 Melhor experiência para usuários de teclado
  - ♿ Compatibilidade com leitores de tela (NVDA, JAWS, VoiceOver)
  - 🎯 Navegação mais intuitiva e previsível
  - ✨ Feedback visual e sonoro consistente

## 24/12/2025

- **Contexto compacto para IA (WhatsApp docs)**
  - Adicionado script `npm run whatsapp:context` para gerar `docs/whatsapp.context.md` a partir de `docs/whatsapp.json`.
  - Objetivo: permitir passar **um único arquivo menor** como contexto, evitando enviar ~17MB para a IA.

