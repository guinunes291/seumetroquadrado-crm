-- =============================================================================
-- Automação de DM do Instagram por palavra-chave (Zernio) — pedido do dono,
-- 04/11/2026.
--
-- Quem comenta (ou manda DM com) uma palavra-chave no @gui.nunes_smq recebe
-- uma DM na hora, responde 3 perguntas leves (renda familiar, região, prazo),
-- deixa o WhatsApp e vira lead no CRM pela roleta escolhida para a palavra.
--
-- Decisões:
--  1) Quatro tabelas, todas com RLS LIGADA E SEM POLÍTICA: só o servidor
--     (service role) lê e escreve. O painel passa por server functions que
--     conferem admin/gestor antes. Motivo: a config guarda o segredo do
--     webhook, e as conversas guardam renda e telefone de quem ainda não é
--     lead — nada disso deve ficar a um SELECT do navegador.
--  2) `instagram_dm_eventos.mensagem_id` é UNIQUE: é a trava de "responder uma
--     vez por mensagem". O Zernio reentrega o mesmo evento até 7 vezes; a
--     segunda entrega bate no índice e é ignorada. Só um evento marcado como
--     'erro' (o envio falhou) pode ser retomado, e por UPDATE condicional,
--     para dois retries simultâneos não responderem duas vezes.
--  3) Uma conversa ABERTA por pessoa (índice parcial em sender_id): quem
--     comenta FAIXA duas vezes não recebe o questionário duas vezes.
--  4) O lead NÃO é inserido aqui: o servidor chama o webhook de leads da
--     roleta da palavra (/api/public/webhooks/lead/$token), o mesmo caminho do
--     Meta Lead Ads. Assim valem dedupe, registro mãe/filho, roleta, fila de
--     exceções e aviso ao corretor, sem duplicar regra nenhuma.
-- Idempotente.
-- =============================================================================

SET LOCAL lock_timeout = '10s';

-- 1) Configuração (linha única) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_dm_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  zernio_account_id text,
  zernio_username text,
  zernio_webhook_id text,
  webhook_url text,
  -- Segredo do HMAC (X-Zernio-Signature). Gerado no "Conectar ao Instagram".
  webhook_secret text,
  -- Origem publicada do CRM, usada para chamar o webhook de leads.
  app_origin text,
  -- Textos da conversa depois da abertura (regiao, prazo, whatsapp, ...).
  textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  conectado_em timestamptz,
  conectado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.instagram_dm_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2) Palavras-chave ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_dm_palavras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Como o dono digitou (exibição): "APÊ".
  palavra text NOT NULL,
  -- Forma canônica, sem acento e minúscula: "ape". Única.
  palavra_chave text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  mensagem_abertura text NOT NULL,
  -- Resposta pública no comentário (vazio = não responde em público).
  resposta_publica text,
  -- Só dispara em comentários deste post (id da mídia). Vazio = qualquer post.
  post_id text,
  -- Roleta que recebe o lead (precisa ter webhook_token).
  roleta_id uuid REFERENCES public.roletas(id) ON DELETE SET NULL,
  -- Empreendimento/assunto anotado no lead (ex.: "MCMV até R$ 13 mil").
  assunto text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_dm_palavras_chave_ck CHECK (palavra_chave ~ '^[a-z0-9]+( [a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS instagram_dm_palavras_chave_uk
  ON public.instagram_dm_palavras (palavra_chave);

-- 3) Conversas (uma por pessoa e palavra) ------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_dm_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  palavra_id uuid REFERENCES public.instagram_dm_palavras(id) ON DELETE SET NULL,
  palavra text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('comentario', 'dm')),
  -- Id da pessoa no Instagram (IGSID). Liga o comentário à DM que vem depois.
  sender_id text,
  nome text,
  username text,
  -- Conversa no Zernio. Nula até a pessoa responder a DM privada do comentário.
  conversation_id text,
  comment_id text,
  post_id text,
  etapa text NOT NULL DEFAULT 'aguardando_renda' CHECK (etapa IN (
    'aguardando_renda', 'aguardando_regiao', 'aguardando_prazo',
    'aguardando_whatsapp', 'concluida', 'sem_whatsapp', 'abandonada')),
  renda_texto text,
  renda_valor numeric(12, 2),
  regiao text,
  prazo text,
  whatsapp text,
  tentativas_whatsapp smallint NOT NULL DEFAULT 0,
  -- Primeira resposta (a DM de abertura) saiu?
  resposta_enviada boolean NOT NULL DEFAULT false,
  resposta_enviada_em timestamptz,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_status text,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_dm_conversas_criado_idx
  ON public.instagram_dm_conversas (criado_em DESC);
CREATE INDEX IF NOT EXISTS instagram_dm_conversas_conv_idx
  ON public.instagram_dm_conversas (conversation_id);
-- Uma conversa aberta por pessoa: o segundo FAIXA da mesma pessoa não reabre.
CREATE UNIQUE INDEX IF NOT EXISTS instagram_dm_conversas_aberta_uk
  ON public.instagram_dm_conversas (sender_id)
  WHERE sender_id IS NOT NULL AND etapa LIKE 'aguardando\_%';

-- 4) Eventos recebidos (trava de "uma resposta por mensagem" + log) -----------
CREATE TABLE IF NOT EXISTS public.instagram_dm_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- id da mensagem (message.received) ou do comentário (comment.received).
  mensagem_id text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('mensagem', 'comentario')),
  conversa_id uuid REFERENCES public.instagram_dm_conversas(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processando'
    CHECK (status IN ('processando', 'respondido', 'erro')),
  erro text,
  tentativas smallint NOT NULL DEFAULT 1,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS instagram_dm_eventos_mensagem_uk
  ON public.instagram_dm_eventos (mensagem_id);
CREATE INDEX IF NOT EXISTS instagram_dm_eventos_recebido_idx
  ON public.instagram_dm_eventos (recebido_em DESC);

-- 5) RLS: ligada e sem política (só service role) -----------------------------
ALTER TABLE public.instagram_dm_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_dm_palavras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_dm_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_dm_eventos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.instagram_dm_config FROM anon, authenticated;
REVOKE ALL ON public.instagram_dm_palavras FROM anon, authenticated;
REVOKE ALL ON public.instagram_dm_conversas FROM anon, authenticated;
REVOKE ALL ON public.instagram_dm_eventos FROM anon, authenticated;

-- 6) Primeira palavra: FAIXA (post de 04/11, MCMV até R$ 13 mil) ---------------
-- Sem roleta: o dono escolhe no painel. Até lá a DM sai e o lead fica
-- "aguardando roleta" no painel (nada se perde).
INSERT INTO public.instagram_dm_palavras (palavra, palavra_chave, mensagem_abertura, resposta_publica, assunto)
VALUES (
  'FAIXA',
  'faixa',
  E'Oi, {nome}! Aqui é o Gui, da Seu Metro Quadrado 👋\nVi seu comentário e vou separar sua simulação do Minha Casa Minha Vida.\nSão só 3 perguntas rápidas.\nPrimeira: qual é a renda bruta da família, somando quem vai comprar junto?',
  'Te chamei no direct! 📩 Se não aparecer, olha em Solicitações de mensagem.',
  'MCMV até R$ 13 mil (post de 04/11)'
)
ON CONFLICT (palavra_chave) DO NOTHING;
