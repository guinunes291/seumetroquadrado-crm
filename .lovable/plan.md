
# PWA + Push Notifications (sem custos)

Transformar o CRM atual em app instalável no celular (Android e iOS) com notificações push em tempo real para corretores, usando apenas Web Push padrão — zero custo, sem Firebase pago, sem App Store.

## O que o corretor vai experimentar

1. Abre o site no celular → banner "Instalar app" aparece.
2. Toca em instalar → ícone do CRM vai pra tela inicial, abre em tela cheia (sem barra do navegador).
3. Na primeira abertura, o app pede permissão pra notificações.
4. A partir daí recebe push em tempo real, mesmo com o app fechado, para:
   - **Novo lead recebido** (roleta atribuiu).
   - **Agendamento próximo** (lembrete X min antes).
   - **Tarefa criada ou vencendo**.
5. Toca na notificação → abre direto na tela relevante (`/leads/:id`, `/agendamentos`, `/tarefas`).

## Limitação importante no iOS (transparente pro usuário)

iOS só permite push em PWA se o usuário **instalar via Safari → Compartilhar → Adicionar à Tela de Início** (iOS 16.4+). Vamos exibir instruções específicas pra iOS no banner de instalação. No Android funciona de forma transparente em qualquer navegador Chromium.

## Arquitetura

```text
┌─────────────────────┐
│  CRM (PWA)          │ ─── Service Worker registra push subscription
│  no celular         │     e envia endpoint+keys pro backend
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Lovable Cloud      │ ─── tabela push_subscriptions (user_id → endpoint)
│  (Postgres)         │     triggers em leads/agendamentos/tarefas
└─────────────────────┘     enfileiram notificação
           │
           ▼
┌─────────────────────┐
│  Server Function    │ ─── envia Web Push assinado com VAPID
│  send-push          │     para o endpoint do navegador do corretor
└─────────────────────┘
           │
           ▼
   📱 Notificação aparece no celular
```

## Etapas de implementação

### 1. Manifest + ícones (instalabilidade)
- Criar `public/manifest.webmanifest` com nome, cores, `display: standalone`, ícones 192/512.
- Gerar ícones do app (logo Seu m² em fundo da marca).
- Tags `<link rel="manifest">`, `theme-color`, `apple-touch-icon` no `__root.tsx`.

### 2. Service Worker (com guards de preview)
- `vite-plugin-pwa` em modo `generateSW`, `injectRegister: null`.
- Wrapper `src/lib/pwa/register-sw.ts` que **só registra em produção** e fora do preview Lovable (preview é iframe, não pode ter SW ativo).
- HTML em `NetworkFirst`, assets hashados em `CacheFirst`. Sem cache agressivo (CRM precisa de dados frescos).

### 3. Web Push (VAPID)
- Gerar par de chaves VAPID (uma vez, via script Node) → salvar em secrets:
  - `VAPID_PUBLIC_KEY` (também exposta ao cliente via `VITE_VAPID_PUBLIC_KEY`).
  - `VAPID_PRIVATE_KEY` (server only).
- Service worker escuta evento `push` e mostra notificação com título, corpo, ícone, badge e `data.url` pra navegação.
- Service worker escuta `notificationclick` e abre/foca a URL alvo.

### 4. Banco — tabela de assinaturas push
```sql
CREATE TABLE public.push_subscriptions (
  id uuid PK,
  user_id uuid → auth.users,
  endpoint text UNIQUE,
  p256dh text,
  auth text,
  user_agent text,
  created_at, updated_at
);
-- GRANTs + RLS: cada usuário só vê/edita as próprias; service_role acessa tudo.
```

### 5. UI de opt-in
- Hook `usePushSubscription()` que detecta suporte, mostra estado e expõe `subscribe()` / `unsubscribe()`.
- Componente `<PushOptInBanner />` no topo do `/leads` e `/agendamentos` quando permissão = `default`.
- Toggle "Notificações push" no `/meu-perfil` pra ligar/desligar a qualquer momento.
- Tratamento explícito do caso iOS (detectar Safari iOS sem `standalone` e mostrar instruções de instalação).

### 6. Disparo dos pushes (3 server functions)
- `sendPushToUser(userId, payload)` — helper que busca todas as subscriptions do user e envia via `web-push` (pacote npm). Remove subscriptions com 410/404.
- Integrar em 3 pontos:
  - **Novo lead**: trigger SQL em `leads` (após `UPDATE` com `corretor_id` mudando de NULL) enfileira evento → server route `/api/public/hooks/push-dispatch` chamado por `pg_net` envia o push.
  - **Tarefa criada/vencendo**: trigger `alerta_tarefa_criada` já existe; estender pra também postar no endpoint. Pra "vencendo", reutilizar `gerar_alertas_tarefas_atrasadas` (já roda via cron).
  - **Agendamento próximo**: reutilizar `gerar_alertas_agendamentos_proximos` (já existe) — adicionar passo final que dispara push pros alertas recém-criados.

  Padrão: `pg_cron` + `pg_net` chamam `/api/public/hooks/push-dispatch` autenticado com `apikey` (anon key). Sem novo secret.

### 7. Realtime (opcional, complementa o push)
Quando o app está aberto, escutar `postgres_changes` em `alertas` do user logado e atualizar o sino (`notification-bell.tsx`) instantaneamente — já temos infra.

## Detalhes técnicos

**Dependências novas:**
- `vite-plugin-pwa`, `workbox-window` (PWA).
- `web-push` (envio server-side, Worker-compatível).

**Guards do service worker** (críticos pra não quebrar o preview Lovable):
- Não registra em dev.
- Não registra se hostname começa com `id-preview--` ou `preview--`, ou termina em `.lovableproject.com`.
- Suporta `?sw=off` pra desregistrar em emergência.

**Compatibilidade:**
- Android (Chrome/Edge/Brave/Samsung Internet): tudo funciona, push em background OK.
- iOS 16.4+: funciona **somente após** instalar via "Adicionar à Tela de Início" no Safari.
- Desktop (bônus grátis): instalável e recebe push em Chrome/Edge.

**Custos:** R$ 0. Web Push é padrão do navegador, sem intermediário pago. Não usa FCM (Firebase) nem APNs direto.

## Fora de escopo (não vou fazer agora)

- Empacotamento Capacitor / publicação em lojas.
- Notificações por SMS ou WhatsApp (já existe Z-API pra isso noutro fluxo).
- Push pra eventos diferentes dos 3 escolhidos (lead redistribuído, mudança de status).
- Modo offline completo — só caching mínimo do shell pra abrir rápido; queries continuam exigindo internet.

## Arquivos que serão criados/editados

**Criados:**
- `public/manifest.webmanifest`
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- `src/lib/pwa/register-sw.ts`
- `src/lib/push/use-push-subscription.ts`
- `src/lib/push/push.functions.ts` (subscribe/unsubscribe server fns)
- `src/lib/push/send-push.server.ts` (helper com `web-push`)
- `src/components/push-opt-in-banner.tsx`
- `src/routes/api/public/hooks/push-dispatch.ts`
- Migração SQL: tabela `push_subscriptions` + ajustes nos triggers existentes.

**Editados:**
- `vite.config.ts` (plugin PWA).
- `src/routes/__root.tsx` (manifest links, theme-color, registrar SW).
- `src/routes/_authenticated/meu-perfil.tsx` (toggle de push).
- `src/components/notification-bell.tsx` (realtime opcional).

Confirma que posso seguir nesse caminho? Se sim, alterno pra build e implemento.
