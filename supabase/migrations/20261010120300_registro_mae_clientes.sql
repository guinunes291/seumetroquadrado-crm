-- ============================================================================
-- Registro mãe (clientes) e registros filhos (leads) — Fatia A
-- ============================================================================
-- Desenho e decisões do dono (03/10/2026): docs/ops/registro-mae.md.
--
-- O MODELO. Cada pessoa tem UM registro mãe em `clientes`. Cada corretor que
-- trabalha a pessoa tem o SEU registro filho em `leads` (id próprio, carteira
-- própria). Toda mudança de informação num filho é gravada na mãe — valor mais
-- recente de cada campo, com quem mudou e quando — e o histórico completo fica
-- em `cliente_eventos`. Os filhos dos outros corretores NÃO mudam (decisão do
-- dono: "só a mãe é atualizada"); quem criar um filho depois já nasce com o
-- valor mais novo.
--
-- AS PORTAS. Registro filho adicional nasce só por onde o dono decidiu:
--   * `criar_registro_filho` — o corretor pegou o cliente fora do CRM e o
--     encontrou pelo "buscar oportunidade" (telefone, e-mail ou CPF).
--   * (Fatia B) a volta do cliente por campanha paga, que cria filho novo
--     pela roleta.
-- Toda outra entrada (webhook, landing, importação, cadastro manual) continua
-- deduplicando exatamente como antes: os três índices únicos de telefone são
-- recriados com a mesma chave e a mesma condição, mais `NOT registro_adicional`.
-- Sem isso, apagar a unicidade faria cada entrada antiga passar a criar
-- duplicata sem querer.
--
-- O ENCERRAMENTO. O primeiro filho a chegar em Visita realizada (ou além)
-- encerra os outros como perda "cliente seguiu com outro corretor", que não
-- se retrabalha e é gravada como SISTEMA — sem aviso ao corretor e sem o nome
-- de quem avançou no histórico dele.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) A chave do telefone: a MESMA do índice `leads_telefone_unico_ativo_uidx`
-- ---------------------------------------------------------------------------
-- 9 últimos dígitos de COALESCE(telefone_e164, telefone). Telefone com menos
-- de 9 dígitos não identifica ninguém: vira mãe própria, sem chave.
CREATE OR REPLACE FUNCTION public.cliente_chave_telefone(_telefone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g')) >= 9
      THEN right(regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g'), 9)
  END;
$$;

-- Os campos que são INFORMAÇÃO DO CLIENTE: sobem para a mãe e descem para o
-- filho novo. Fonte única para o gatilho, o backfill e `criar_registro_filho`.
-- Ficam de fora, de propósito, os textos do corretor (observações, próxima
-- ação, motivo de perda, nota de perfil) e o estado da negociação (status,
-- temperatura, cadência): decisão do dono, "herda só os dados preenchidos".
CREATE OR REPLACE FUNCTION public._cliente_campos()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT ARRAY[
    'nome', 'email', 'cpf',
    'renda_informada', 'renda_estimada', 'tipo_renda', 'faixa_mcmv',
    'usa_fgts', 'tem_fgts', 'fgts_valor', 'entrada_disponivel', 'decisor',
    'zona', 'bairro', 'dorms_desejados', 'precisa_vaga', 'prioridades',
    'objecoes', 'resumo_qualificacao', 'projeto_nome', 'construtora',
    'consentimento_lgpd'
  ]::text[];
$$;

-- ---------------------------------------------------------------------------
-- 1) A mãe e o histórico dela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_telefone  text,
  telefone        text,
  telefone_e164   text,
  nome            text,
  email           text,
  cpf             text,
  -- {campo: {"valor": ..., "lead_id": ..., "corretor_id": ..., "autor_id": ..., "em": ...}}
  dados           jsonb NOT NULL DEFAULT '{}'::jsonb,
  opt_out         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clientes_chave_telefone_uidx
  ON public.clientes (chave_telefone) WHERE chave_telefone IS NOT NULL;

COMMENT ON TABLE public.clientes IS
  'Registro mae: uma linha por pessoa (chave = 9 ultimos digitos do telefone). '
  'Os leads sao os registros filhos, um por corretor. docs/ops/registro-mae.md';

CREATE TABLE IF NOT EXISTS public.cliente_eventos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id      uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id     uuid,
  autor_id        uuid,
  campo           text NOT NULL,
  valor_anterior  jsonb,
  valor_novo      jsonb,
  em              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_eventos_cliente_em_idx
  ON public.cliente_eventos (cliente_id, em DESC);

COMMENT ON TABLE public.cliente_eventos IS
  'Historico do registro mae: cada mudanca de informacao feita em qualquer '
  'registro filho, com o lead, o corretor e o autor.';

-- A mãe é da gestão. O corretor nunca lê a mãe direto (decisão do dono: ele
-- herda os dados, não o histórico dos outros) — só pelas RPCs abaixo.
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_select_gestao ON public.clientes;
CREATE POLICY clientes_select_gestao ON public.clientes
  FOR SELECT TO authenticated
  USING (public.ve_carteira_completa(auth.uid()));

DROP POLICY IF EXISTS cliente_eventos_select_gestao ON public.cliente_eventos;
CREATE POLICY cliente_eventos_select_gestao ON public.cliente_eventos
  FOR SELECT TO authenticated
  USING (public.ve_carteira_completa(auth.uid()));

REVOKE ALL ON public.clientes, public.cliente_eventos FROM PUBLIC, anon;
GRANT SELECT ON public.clientes, public.cliente_eventos TO authenticated;
GRANT ALL ON public.clientes, public.cliente_eventos TO service_role;

-- ---------------------------------------------------------------------------
-- 2) O vínculo do filho com a mãe
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS registro_adicional boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_cliente_id_idx ON public.leads (cliente_id);

COMMENT ON COLUMN public.leads.cliente_id IS 'Registro mae (clientes.id).';
COMMENT ON COLUMN public.leads.registro_adicional IS
  'Registro filho criado para um corretor quando o cliente ja existia '
  '(buscar oportunidade / campanha). Fica fora dos indices unicos de telefone.';

-- ---------------------------------------------------------------------------
-- 3) Backfill: uma mãe por chave de telefone, todos os leads ligados
-- ---------------------------------------------------------------------------
-- Hoje o banco garante um lead por telefone fora da lixeira, então quase toda
-- mãe nasce com um filho só. Leads da lixeira e excluídos também ganham mãe:
-- são parte da história da pessoa.
WITH base AS (
  SELECT
    public.cliente_chave_telefone(COALESCE(l.telefone_e164, l.telefone)) AS chave,
    l.nome, l.telefone, l.telefone_e164,
    NULLIF(lower(btrim(l.email)), '')                                   AS email,
    NULLIF(regexp_replace(COALESCE(l.cpf, ''), '\D', '', 'g'), '')       AS cpf,
    (l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false))        AS ativo,
    l.updated_at, l.created_at
  FROM public.leads AS l
),
principal AS (
  SELECT DISTINCT ON (b.chave) b.*
  FROM base AS b
  WHERE b.chave IS NOT NULL
  ORDER BY b.chave, b.ativo DESC, b.updated_at DESC
),
ident AS (
  SELECT
    b.chave,
    (array_agg(b.email ORDER BY b.updated_at DESC) FILTER (WHERE b.email IS NOT NULL))[1] AS email,
    (array_agg(b.cpf ORDER BY b.updated_at DESC) FILTER (WHERE b.cpf IS NOT NULL))[1]     AS cpf,
    min(b.created_at) AS criado
  FROM base AS b
  WHERE b.chave IS NOT NULL
  GROUP BY b.chave
)
INSERT INTO public.clientes (chave_telefone, telefone, telefone_e164, nome, email, cpf, created_at)
SELECT p.chave, p.telefone, p.telefone_e164, p.nome, i.email, i.cpf, i.criado
FROM principal AS p
JOIN ident AS i ON i.chave = p.chave
ON CONFLICT (chave_telefone) WHERE chave_telefone IS NOT NULL DO NOTHING;

-- Lead sem telefone que identifique: mãe própria, com o MESMO id do lead
-- (mapeamento determinístico, sem tabela auxiliar).
INSERT INTO public.clientes (id, telefone, telefone_e164, nome, email, cpf, created_at)
SELECT l.id, l.telefone, l.telefone_e164, l.nome,
       NULLIF(lower(btrim(l.email)), ''),
       NULLIF(regexp_replace(COALESCE(l.cpf, ''), '\D', '', 'g'), ''),
       l.created_at
FROM public.leads AS l
WHERE public.cliente_chave_telefone(COALESCE(l.telefone_e164, l.telefone)) IS NULL
ON CONFLICT (id) DO NOTHING;

-- Gatilhos de usuário desligados SÓ durante o vínculo: senão os ~100 mil
-- UPDATEs moveriam `updated_at` (o relógio de reserva de várias telas) e
-- disparariam auditoria, métricas e guardas sem nenhuma mudança real.
ALTER TABLE public.leads DISABLE TRIGGER USER;

UPDATE public.leads AS l
   SET cliente_id = c.id
  FROM public.clientes AS c
 WHERE l.cliente_id IS NULL
   AND c.chave_telefone = public.cliente_chave_telefone(COALESCE(l.telefone_e164, l.telefone));

UPDATE public.leads AS l
   SET cliente_id = l.id
 WHERE l.cliente_id IS NULL;

ALTER TABLE public.leads ENABLE TRIGGER USER;

-- Os dados da mãe: o valor mais recente de cada campo entre TODOS os filhos
-- (inclusive lixeira) — "o maior nível de informação sobre o cliente".
WITH vals AS (
  SELECT DISTINCT ON (l.cliente_id, e.key)
    l.cliente_id, e.key, e.value, l.id AS lead_id, l.corretor_id, l.updated_at
  FROM public.leads AS l
  CROSS JOIN LATERAL jsonb_each(to_jsonb(l)) AS e
  WHERE e.key = ANY (public._cliente_campos())
    AND jsonb_typeof(e.value) <> 'null'
    AND NOT (jsonb_typeof(e.value) = 'string' AND btrim(e.value #>> '{}') = '')
    AND NOT (jsonb_typeof(e.value) = 'array' AND jsonb_array_length(e.value) = 0)
  ORDER BY l.cliente_id, e.key,
           (l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)) DESC,
           l.updated_at DESC
)
UPDATE public.clientes AS c
   SET dados = d.dados
  FROM (
    SELECT v.cliente_id,
           jsonb_object_agg(v.key, jsonb_build_object(
             'valor', v.value, 'lead_id', v.lead_id,
             'corretor_id', v.corretor_id, 'em', v.updated_at)) AS dados
    FROM vals AS v
    GROUP BY v.cliente_id
  ) AS d
 WHERE c.id = d.cliente_id;

UPDATE public.clientes AS c
   SET opt_out = true
 WHERE EXISTS (SELECT 1 FROM public.leads AS l WHERE l.cliente_id = c.id AND COALESCE(l.opt_out, false));

-- Daqui em diante todo lead tem mãe (o gatilho do passo 4 garante).
ALTER TABLE public.leads ALTER COLUMN cliente_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Gatilhos: vincular, registrar na mãe, encerrar os outros
-- ---------------------------------------------------------------------------
-- 4a) Vincular — todo INSERT e toda troca de telefone acha (ou cria) a mãe.
-- Nome com "zz" para rodar DEPOIS de `trg_sync_lead_telefone_e164`.
CREATE OR REPLACE FUNCTION public.tg_leads_cliente_vincular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _chave text := public.cliente_chave_telefone(COALESCE(NEW.telefone_e164, NEW.telefone));
  _cid uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cliente_id IS NOT NULL THEN
    RETURN NEW;  -- quem cria já sabe a mãe (criar_registro_filho)
  END IF;
  IF TG_OP = 'UPDATE'
     AND _chave IS NOT DISTINCT FROM
         public.cliente_chave_telefone(COALESCE(OLD.telefone_e164, OLD.telefone)) THEN
    RETURN NEW;
  END IF;

  IF _chave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('cliente:' || _chave));
    SELECT c.id INTO _cid FROM public.clientes AS c WHERE c.chave_telefone = _chave;
    IF _cid IS NULL THEN
      INSERT INTO public.clientes (chave_telefone, telefone, telefone_e164, nome, email, cpf)
      VALUES (_chave, NEW.telefone, NEW.telefone_e164, NEW.nome,
              NULLIF(lower(btrim(NEW.email)), ''),
              NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'), ''))
      RETURNING id INTO _cid;
    END IF;
  ELSE
    INSERT INTO public.clientes (telefone, telefone_e164, nome, email, cpf)
    VALUES (NEW.telefone, NEW.telefone_e164, NEW.nome,
            NULLIF(lower(btrim(NEW.email)), ''),
            NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'), ''))
    RETURNING id INTO _cid;
  END IF;

  NEW.cliente_id := _cid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_cliente_vincular ON public.leads;
CREATE TRIGGER trg_zz_cliente_vincular
  BEFORE INSERT OR UPDATE OF telefone, telefone_e164 ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_cliente_vincular();

-- 4b) Registrar — a mudança de informação de QUALQUER filho sobe para a mãe.
-- Só a mãe muda (decisão do dono). Exceção única, de compliance: opt-out vale
-- para a pessoa, não para um registro — propaga para a mãe e todos os filhos.
CREATE OR REPLACE FUNCTION public.tg_leads_cliente_registrar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _novo jsonb := to_jsonb(NEW);
  _velho jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  _candidatos text[] := '{}';
  _dados jsonb;
  _mudou jsonb := '{}'::jsonb;
  _campo text;
  _v jsonb;
  _autor uuid := auth.uid();
  _optout_novo boolean := COALESCE(NEW.opt_out, false)
                          AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.opt_out, false));
BEGIN
  -- Primeiro sem tocar no banco: os motores atualizam milhares de leads em
  -- campos que não são do cliente (status, dono, cadência) e saem daqui.
  FOREACH _campo IN ARRAY public._cliente_campos() LOOP
    _v := _novo -> _campo;
    CONTINUE WHEN _v IS NULL OR jsonb_typeof(_v) = 'null';
    CONTINUE WHEN jsonb_typeof(_v) = 'string' AND btrim(_v #>> '{}') = '';
    CONTINUE WHEN jsonb_typeof(_v) = 'array' AND jsonb_array_length(_v) = 0;
    CONTINUE WHEN TG_OP = 'UPDATE' AND _v IS NOT DISTINCT FROM (_velho -> _campo);
    _candidatos := _candidatos || _campo;
  END LOOP;
  IF cardinality(_candidatos) = 0 AND NOT _optout_novo THEN
    RETURN NULL;
  END IF;

  SELECT c.dados INTO _dados FROM public.clientes AS c WHERE c.id = NEW.cliente_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  FOREACH _campo IN ARRAY _candidatos LOOP
    _v := _novo -> _campo;
    -- O filho que nasce da mãe traz os valores dela: não é mudança.
    CONTINUE WHEN _v IS NOT DISTINCT FROM (_dados -> _campo -> 'valor');

    _mudou := _mudou || jsonb_build_object(_campo, jsonb_build_object(
      'valor', _v, 'lead_id', NEW.id, 'corretor_id', NEW.corretor_id,
      'autor_id', _autor, 'em', now()));
    INSERT INTO public.cliente_eventos
      (cliente_id, lead_id, corretor_id, autor_id, campo, valor_anterior, valor_novo)
    VALUES (NEW.cliente_id, NEW.id, NEW.corretor_id, _autor, _campo,
            _dados -> _campo -> 'valor', _v);
  END LOOP;

  IF _mudou <> '{}'::jsonb THEN
    UPDATE public.clientes AS c
       SET dados = c.dados || _mudou,
           nome  = COALESCE(c.nome, NEW.nome),
           email = COALESCE(c.email, NULLIF(lower(btrim(NEW.email)), '')),
           cpf   = COALESCE(c.cpf, NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'), '')),
           updated_at = now()
     WHERE c.id = NEW.cliente_id;
  END IF;

  IF _optout_novo THEN
    UPDATE public.clientes SET opt_out = true, updated_at = now()
     WHERE id = NEW.cliente_id AND NOT opt_out;
    INSERT INTO public.cliente_eventos (cliente_id, lead_id, corretor_id, autor_id, campo, valor_novo)
    VALUES (NEW.cliente_id, NEW.id, NEW.corretor_id, _autor, 'opt_out', 'true'::jsonb);
    UPDATE public.leads SET opt_out = true
     WHERE cliente_id = NEW.cliente_id AND id <> NEW.id AND NOT COALESCE(opt_out, false);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_cliente_registrar ON public.leads;
CREATE TRIGGER trg_zz_cliente_registrar
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_cliente_registrar();

-- 4c) Encerrar — o primeiro filho a chegar em Visita realizada (ou além)
-- encerra os outros registros da mesma pessoa.
--
-- Roda como SISTEMA: a identidade da sessão é limpa só durante o
-- encerramento. Sem isso, `registrar_transicao_status` gravaria no histórico
-- do corretor encerrado uma "mudança de status" com o NOME de quem avançou —
-- e a decisão do dono foi encerrar sem aviso.
--
-- Não encerra: registro que também já avançou (conflito — fica para a
-- gestão), venda viva, lixeira, excluído, já perdido.
CREATE OR REPLACE FUNCTION public.tg_leads_cliente_encerrar_outros()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _avancados constant text[] := ARRAY['visita_realizada', 'proposta_enviada',
                                      'analise_credito', 'contrato_fechado', 'pos_venda'];
  _claims text := current_setting('request.jwt.claims', true);
  _claim_sub text := current_setting('request.jwt.claim.sub', true);
  _claim_role text := current_setting('request.jwt.claim.role', true);
  _flag text := current_setting('app.transicionar_lead', true);
  _r record;
  _encerrados uuid[] := '{}';
BEGIN
  IF NOT (NEW.status::text = ANY (_avancados))
     OR OLD.status::text = ANY (_avancados) THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('app.transicionar_lead', 'on', true);

  FOR _r IN
    SELECT l.id, l.status, l.corretor_id
    FROM public.leads AS l
    WHERE l.cliente_id = NEW.cliente_id
      AND l.id <> NEW.id
      AND l.corretor_id IS DISTINCT FROM NEW.corretor_id
      AND l.deleted_at IS NULL
      AND NOT COALESCE(l.na_lixeira, false)
      AND l.status::text <> 'perdido'
      AND NOT (l.status::text = ANY (_avancados))
      AND NOT public._lead_venda_viva(l.id)
    FOR UPDATE
  LOOP
    UPDATE public.leads
       SET status = 'perdido'::public.lead_status,
           motivo_perda_categoria = 'seguiu_outro_corretor',
           motivo_perdido = 'Cliente seguiu com outro corretor (registro mãe).'
     WHERE id = _r.id;
    INSERT INTO public.lead_eventos (lead_id, tipo, descricao, agente, payload)
    VALUES (_r.id, 'transicao_lead',
            'Lead movido de ' || _r.status::text || ' para perdido.',
            'registro_mae',
            jsonb_build_object('de_status', _r.status, 'para_status', 'perdido',
                               'motivo_categoria', 'seguiu_outro_corretor',
                               'via', 'encerramento_registro_mae'));
    _encerrados := _encerrados || _r.id;
  END LOOP;

  PERFORM set_config('app.transicionar_lead', COALESCE(_flag, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(_claim_sub, ''), true);
  PERFORM set_config('request.jwt.claim.role', COALESCE(_claim_role, ''), true);

  IF cardinality(_encerrados) > 0 THEN
    INSERT INTO public.cliente_eventos (cliente_id, lead_id, corretor_id, campo, valor_novo)
    VALUES (NEW.cliente_id, NEW.id, NEW.corretor_id, '_encerramento',
            jsonb_build_object('avancou_para', NEW.status, 'encerrados', to_jsonb(_encerrados)));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_cliente_encerrar_outros ON public.leads;
CREATE TRIGGER trg_zz_cliente_encerrar_outros
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_cliente_encerrar_outros();

REVOKE ALL ON FUNCTION public.tg_leads_cliente_vincular() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_leads_cliente_registrar() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_leads_cliente_encerrar_outros() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Os índices únicos de telefone: mesma regra, menos os registros adicionais
-- ---------------------------------------------------------------------------
-- Chave e condição idênticas às de hoje (20260719123000 e 20260902151250);
-- a única mudança é `AND NOT registro_adicional`. Toda entrada antiga continua
-- barrada no mesmo 23505 e cai na mesma recuperação.
DROP INDEX IF EXISTS public.leads_telefone_unico_ativo_uidx;
CREATE UNIQUE INDEX leads_telefone_unico_ativo_uidx ON public.leads
  USING btree (right(regexp_replace(COALESCE(telefone_e164, telefone, ''::text), '\D'::text, ''::text, 'g'::text), 9))
  WHERE na_lixeira = false AND deleted_at IS NULL
    AND length(regexp_replace(COALESCE(telefone_e164, telefone, ''::text), '\D'::text, ''::text, 'g'::text)) >= 9
    AND NOT registro_adicional;

-- Os dois índices de 10 dígitos só são recriados ONDE JÁ EXISTEM. Em
-- produção eles nunca foram criados (20260719123000 os pula com WARNING
-- quando há duplicata antiga — medido em 03/10/2026: só o índice global de 9
-- dígitos existe lá). Criá-los aqui sem condição poderia derrubar o deploy.
DO $$
BEGIN
  IF to_regclass('public.uq_leads_projeto_telefone_ativo') IS NOT NULL THEN
    DROP INDEX public.uq_leads_projeto_telefone_ativo;
    CREATE UNIQUE INDEX uq_leads_projeto_telefone_ativo ON public.leads
      USING btree (projeto_id, right(public.telefone_digits(telefone), 10))
      WHERE deleted_at IS NULL AND na_lixeira = false AND projeto_id IS NOT NULL
        AND length(public.telefone_digits(telefone)) >= 8
        AND NOT registro_adicional;
  END IF;
  IF to_regclass('public.uq_leads_sem_projeto_telefone_ativo') IS NOT NULL THEN
    DROP INDEX public.uq_leads_sem_projeto_telefone_ativo;
    CREATE UNIQUE INDEX uq_leads_sem_projeto_telefone_ativo ON public.leads
      USING btree (right(public.telefone_digits(telefone), 10))
      WHERE deleted_at IS NULL AND na_lixeira = false AND projeto_id IS NULL
        AND length(public.telefone_digits(telefone)) >= 8
        AND NOT registro_adicional;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) O motivo de perda do encerramento
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_motivo_perda_categoria_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_motivo_perda_categoria_check CHECK (
  motivo_perda_categoria IS NULL OR motivo_perda_categoria = ANY (ARRAY[
    'sem_contato', 'sumiu_pos_proposta', 'credito_score', 'credito_renda',
    'estourou_teto', 'ja_possui_imovel', 'preco_parcela', 'comprou_concorrente',
    'timing_adiou', 'sem_perfil', 'outro',
    'sem_retorno_cadencia', 'numero_invalido', 'opt_out',
    'seguiu_outro_corretor'
  ]::text[])
) NOT VALID;
ALTER TABLE public.leads VALIDATE CONSTRAINT leads_motivo_perda_categoria_check;

-- O cliente está sendo atendido por outro corretor: não se reaborda o
-- registro encerrado (nem SDR, nem discador, nem reciclagem de perdidos).
CREATE OR REPLACE FUNCTION public.motivo_perda_sem_retrabalho(_motivo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(_motivo, 'outro')
    IN ('ja_possui_imovel', 'comprou_concorrente', 'sem_perfil',
        'numero_invalido', 'opt_out', 'seguiu_outro_corretor');
$$;

-- ---------------------------------------------------------------------------
-- 7) Buscar oportunidade e criar o registro filho
-- ---------------------------------------------------------------------------
-- Telefone primeiro (a chave da mãe), depois CPF, depois e-mail — procurados
-- nos FILHOS, para achar a pessoa por qualquer e-mail ou CPF que algum
-- corretor já tenha registrado.
CREATE OR REPLACE FUNCTION public._cliente_achar(_telefone text, _email text, _cpf text)
RETURNS TABLE (cliente_id uuid, match_por text)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  _chave text := public.cliente_chave_telefone(_telefone);
  _mail text := NULLIF(lower(btrim(COALESCE(_email, ''))), '');
  _doc text := NULLIF(regexp_replace(COALESCE(_cpf, ''), '\D', '', 'g'), '');
  _cid uuid;
BEGIN
  IF _chave IS NOT NULL THEN
    SELECT c.id INTO _cid FROM public.clientes AS c WHERE c.chave_telefone = _chave;
    IF _cid IS NOT NULL THEN
      RETURN QUERY SELECT _cid, 'telefone'::text;
      RETURN;
    END IF;
  END IF;
  IF _doc IS NOT NULL AND length(_doc) = 11 THEN
    SELECT l.cliente_id INTO _cid FROM public.leads AS l
     WHERE l.deleted_at IS NULL
       AND regexp_replace(COALESCE(l.cpf, ''), '\D', '', 'g') = _doc
     ORDER BY l.updated_at DESC LIMIT 1;
    IF _cid IS NOT NULL THEN
      RETURN QUERY SELECT _cid, 'cpf'::text;
      RETURN;
    END IF;
  END IF;
  IF _mail IS NOT NULL AND _mail LIKE '%@%' THEN
    SELECT l.cliente_id INTO _cid FROM public.leads AS l
     WHERE l.deleted_at IS NULL AND lower(btrim(l.email)) = _mail
     ORDER BY l.updated_at DESC LIMIT 1;
    IF _cid IS NOT NULL THEN
      RETURN QUERY SELECT _cid, 'email'::text;
      RETURN;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._cliente_achar(text, text, text) FROM PUBLIC, anon, authenticated;

-- O que o corretor pode saber ANTES de criar o registro: se a pessoa existe,
-- se já é dele, se está bloqueada e QUAIS campos virão preenchidos — não os
-- valores, nem quem são os outros corretores (decisão do dono).
CREATE OR REPLACE FUNCTION public.buscar_oportunidade(
  _telefone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _cpf text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
  _match text;
  _c public.clientes%ROWTYPE;
  _meu uuid;
  _bloqueado boolean;
  _outra boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(_uid, 'corretor'::public.app_role) THEN
    RAISE EXCEPTION 'buscar oportunidade é do corretor' USING ERRCODE = '42501';
  END IF;

  SELECT a.cliente_id, a.match_por INTO _cid, _match
  FROM public._cliente_achar(_telefone, _email, _cpf) AS a;
  IF _cid IS NULL THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;
  SELECT * INTO _c FROM public.clientes WHERE id = _cid;

  SELECT l.id INTO _meu FROM public.leads AS l
   WHERE l.cliente_id = _cid AND l.corretor_id = _uid
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND l.status::text <> 'perdido'
   ORDER BY l.updated_at DESC LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cid AND l.corretor_id IS DISTINCT FROM _uid
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND (l.status::text IN ('visita_realizada', 'proposta_enviada', 'analise_credito',
                               'contrato_fechado', 'pos_venda')
            OR public._lead_venda_viva(l.id))
  ) INTO _bloqueado;

  SELECT EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cid AND l.corretor_id IS NOT NULL AND l.corretor_id <> _uid
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND l.status::text <> 'perdido'
  ) INTO _outra;

  RETURN jsonb_build_object(
    'encontrado', true,
    'cliente_id', _cid,
    'match_por', _match,
    'nome', _c.nome,
    'ja_na_carteira', _meu IS NOT NULL,
    'meu_lead_id', _meu,
    'bloqueado', _bloqueado AND _meu IS NULL,
    'motivo_bloqueio', CASE WHEN _bloqueado AND _meu IS NULL THEN 'negociacao_avancada' END,
    'em_outra_carteira', _outra,
    'campos_herdados', COALESCE((
      SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_c.dados) AS k
       WHERE k <> ALL (ARRAY['nome', 'email', 'cpf'])
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_oportunidade(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_oportunidade(text, text, text) TO authenticated, service_role;

-- O registro filho do corretor: id próprio, na carteira dele, com os dados da
-- mãe. Nasce como "Aguardando atendimento" (Minha base), origem captação
-- própria por padrão — o corretor trouxe o cliente por fora do CRM.
CREATE OR REPLACE FUNCTION public.criar_registro_filho(
  _cliente_id uuid,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.clientes%ROWTYPE;
  _vals jsonb;
  _r public.leads;
  _meu uuid;
  _adicional boolean;
  _origem public.lead_origem;
  _novo uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(_uid, 'corretor'::public.app_role) THEN
    RAISE EXCEPTION 'registro filho é do corretor' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _c FROM public.clientes WHERE id = _cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente não encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Dois cliques, duas abas: um registro só.
  PERFORM pg_advisory_xact_lock(hashtext('cliente_filho:' || _cliente_id::text));

  SELECT l.id INTO _meu FROM public.leads AS l
   WHERE l.cliente_id = _cliente_id AND l.corretor_id = _uid
     AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
     AND l.status::text <> 'perdido'
   ORDER BY l.updated_at DESC LIMIT 1;
  IF _meu IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lead_id', _meu, 'ja_existia', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cliente_id AND l.corretor_id IS DISTINCT FROM _uid
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
       AND (l.status::text IN ('visita_realizada', 'proposta_enviada', 'analise_credito',
                               'contrato_fechado', 'pos_venda')
            OR public._lead_venda_viva(l.id))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'negociacao_avancada');
  END IF;

  _adicional := EXISTS (
    SELECT 1 FROM public.leads AS l
     WHERE l.cliente_id = _cliente_id
       AND l.deleted_at IS NULL AND NOT COALESCE(l.na_lixeira, false)
  );

  SELECT COALESCE(jsonb_object_agg(e.key, e.value -> 'valor'), '{}'::jsonb) INTO _vals
  FROM jsonb_each(_c.dados) AS e
  WHERE e.key = ANY (public._cliente_campos());
  _r := jsonb_populate_record(NULL::public.leads, _vals);

  _origem := COALESCE(NULLIF(_payload ->> 'origem', '')::public.lead_origem,
                      'captacao_corretor'::public.lead_origem);

  INSERT INTO public.leads (
    cliente_id, registro_adicional, corretor_id, status, origem,
    nome, telefone, email, cpf,
    projeto_id, projeto_nome, observacoes,
    renda_informada, renda_estimada, tipo_renda, faixa_mcmv,
    usa_fgts, tem_fgts, fgts_valor, entrada_disponivel, decisor,
    zona, bairro, dorms_desejados, precisa_vaga, prioridades,
    objecoes, resumo_qualificacao, construtora, consentimento_lgpd,
    opt_out
  ) VALUES (
    _cliente_id, _adicional, _uid, 'aguardando_atendimento'::public.lead_status, _origem,
    COALESCE(_r.nome, _c.nome, 'Cliente'), COALESCE(_c.telefone, _c.telefone_e164, ''),
    COALESCE(_r.email, _c.email), COALESCE(_r.cpf, _c.cpf),
    NULLIF(_payload ->> 'projeto_id', '')::uuid,
    COALESCE(NULLIF(btrim(_payload ->> 'projeto_nome'), ''), _r.projeto_nome),
    NULLIF(btrim(_payload ->> 'observacoes'), ''),
    _r.renda_informada, _r.renda_estimada, _r.tipo_renda, _r.faixa_mcmv,
    COALESCE(_r.usa_fgts, false), _r.tem_fgts, _r.fgts_valor, _r.entrada_disponivel, _r.decisor,
    _r.zona, _r.bairro, _r.dorms_desejados, _r.precisa_vaga, COALESCE(_r.prioridades, '{}'),
    COALESCE(_r.objecoes, '{}'), _r.resumo_qualificacao, _r.construtora, _r.consentimento_lgpd,
    _c.opt_out
  )
  RETURNING id INTO _novo;

  INSERT INTO public.cliente_eventos (cliente_id, lead_id, corretor_id, autor_id, campo, valor_novo)
  VALUES (_cliente_id, _novo, _uid, _uid, '_registro_filho',
          jsonb_build_object('adicional', _adicional, 'campos_herdados',
                             (SELECT count(*) FROM jsonb_object_keys(_vals))));

  RETURN jsonb_build_object('ok', true, 'lead_id', _novo, 'ja_existia', false,
                            'adicional', _adicional);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_registro_filho(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_registro_filho(uuid, jsonb) TO authenticated, service_role;

-- A mãe vista pela gestão: dados consolidados, filhos e histórico.
CREATE OR REPLACE FUNCTION public.cliente_registro_mae_v1(_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'não autenticado ou conta inativa' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.ve_carteira_completa(_uid) OR public.has_role(_uid, 'gestor'::public.app_role))
     OR NOT public.pode_acessar_lead(_uid, _lead_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT l.cliente_id INTO _cid FROM public.leads AS l WHERE l.id = _lead_id;

  RETURN (
    SELECT jsonb_build_object(
      'cliente_id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'email', c.email,
      'cpf', c.cpf, 'opt_out', c.opt_out, 'dados', c.dados,
      'filhos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'lead_id', l.id, 'corretor_id', l.corretor_id, 'corretor', p.nome,
                 'status', l.status, 'adicional', l.registro_adicional,
                 'na_lixeira', l.na_lixeira, 'criado_em', l.created_at)
               ORDER BY l.created_at)
        FROM public.leads AS l
        LEFT JOIN public.profiles AS p ON p.id = l.corretor_id
        WHERE l.cliente_id = c.id AND l.deleted_at IS NULL), '[]'::jsonb),
      'eventos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'campo', e.campo, 'de', e.valor_anterior, 'para', e.valor_novo,
                 'lead_id', e.lead_id, 'corretor', p.nome, 'em', e.em)
               ORDER BY e.em DESC)
        FROM (SELECT * FROM public.cliente_eventos WHERE cliente_id = c.id
              ORDER BY em DESC LIMIT 200) AS e
        LEFT JOIN public.profiles AS p ON p.id = e.corretor_id), '[]'::jsonb)
    )
    FROM public.clientes AS c WHERE c.id = _cid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cliente_registro_mae_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_registro_mae_v1(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) O que supunha "um telefone, um lead"
-- ---------------------------------------------------------------------------
-- Hoje cada função abaixo enxerga no máximo um lead ativo por telefone, então
-- nenhuma muda de resultado; elas passam a escolher certo quando houver filhos.

-- 8a) WhatsApp recebido: vai para o filho com corretor e contato real mais
-- recente (quem está conversando), não para o atualizado por último — um
-- motor que mexe no lead não pode roubar a mensagem do corretor.
CREATE OR REPLACE FUNCTION public.buscar_lead_ativo_por_telefone_global(_telefone text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.id
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND l.status <> 'perdido'
    AND length(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g')) >= 9
    AND right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9)
        = right(regexp_replace(coalesce(_telefone, ''), '\D', '', 'g'), 9)
  ORDER BY (l.corretor_id IS NOT NULL) DESC,
           l.ultimo_contato DESC NULLS LAST,
           l.updated_at DESC
  LIMIT 1;
$function$;

-- 8b) Recuperação do 23505 (webhook, lead-intake) e landing: o registro
-- original primeiro — o 23505 só nasce dos índices que excluem os adicionais.
CREATE OR REPLACE FUNCTION public.buscar_lead_duplicado(_projeto_id uuid, _telefone text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.leads
  WHERE projeto_id = _projeto_id
    AND deleted_at IS NULL
    AND length(regexp_replace(_telefone, '\D', '', 'g')) >= 8
    AND regexp_replace(telefone, '\D', '', 'g') = regexp_replace(_telefone, '\D', '', 'g')
  ORDER BY registro_adicional, created_at DESC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_lead_por_telefone(_telefone text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- na_lixeira = false: lead na lixeira NÃO conta como duplicata — cliente
  -- retornante com lead descartado gera lead NOVO (senão o retorno some).
  SELECT l.id
  FROM public.leads l
  WHERE l.deleted_at IS NULL
    AND l.na_lixeira = false
    AND length(regexp_replace(COALESCE(_telefone, ''), '\D', '', 'g')) >= 8
    AND regexp_replace(l.telefone, '\D', '', 'g')
          = regexp_replace(_telefone, '\D', '', 'g')
  ORDER BY l.registro_adicional, l.created_at DESC
  LIMIT 1;
$function$;

-- 8c) Página de duplicatas: registro adicional é intencional, não duplicata.
CREATE OR REPLACE FUNCTION public.detectar_duplicatas_leads()
RETURNS TABLE(grupo_chave text, tipo text, quantidade bigint, lead_ids uuid[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH acessiveis AS (
    SELECT l.*
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND NOT l.registro_adicional
      AND public.pode_acessar_lead(auth.uid(), l.id)
  )
  SELECT regexp_replace(telefone, '\D', '', 'g'), 'telefone'::text,
         count(*), array_agg(id ORDER BY created_at)
  FROM acessiveis
  WHERE telefone IS NOT NULL AND telefone <> ''
  GROUP BY regexp_replace(telefone, '\D', '', 'g')
  HAVING count(*) > 1
  UNION ALL
  SELECT lower(trim(email)), 'email'::text,
         count(*), array_agg(id ORDER BY created_at)
  FROM acessiveis
  WHERE email IS NOT NULL AND email <> ''
  GROUP BY lower(trim(email))
  HAVING count(*) > 1;
$function$;

-- 8d) Bolsão: quem está com um corretor não entra na fila do discador por
-- outro registro da mesma pessoa.
CREATE OR REPLACE FUNCTION public._bolsao_elegivel(l public.leads)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT l.corretor_id IS NULL
    AND l.deleted_at IS NULL
    AND NOT l.na_lixeira
    AND NOT COALESCE(l.opt_out, false)
    AND public.telefone_discavel(l.telefone)
    AND NOT public._lead_venda_viva(l.id)
    AND l.status NOT IN ('contrato_fechado'::public.lead_status,
                         'pos_venda'::public.lead_status)
    AND NOT (
      l.status = 'perdido'::public.lead_status
      AND public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
    )
    -- Arquivado é fim de linha: não entra em fila nenhuma, nem de corretor
    -- nem de discador. Só volta por formulário novo, como lead novo.
    AND l.arquivado_em IS NULL
    -- Na trilha de reativação, quem manda é a reativação.
    AND NOT EXISTS (
      SELECT 1 FROM public.reativacao_fila r
      WHERE r.lead_id = l.id
        AND r.status IN ('aguardando','em_discagem','com_sdr')
    )
    -- Registro mãe: a pessoa já está com um corretor por outro registro.
    AND NOT EXISTS (
      SELECT 1 FROM public.leads o
      WHERE o.cliente_id = l.cliente_id
        AND o.id <> l.id
        AND o.corretor_id IS NOT NULL
        AND o.deleted_at IS NULL
        AND NOT o.na_lixeira
        AND o.status <> 'perdido'::public.lead_status
    );
$function$;

-- 8e) Mescla automática por telefone (service_role, sem cron): nunca junta
-- registros filhos de corretores diferentes. Corpos VIVOS das três funções
-- (iguais em produção e no repositório, conferido por hash em 03/10/2026),
-- com uma mudança cada: `NOT registro_adicional` na seleção. A mescla manual
-- da gestão (`mesclar_leads`) fica como está — é decisão humana.
CREATE OR REPLACE FUNCTION public.mesclar_leads_por_telefone(_chave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_keep uuid;
  v_lose uuid;
  v_rep jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF _chave IS NULL OR length(_chave) < 8 THEN RETURN NULL; END IF;

  SELECT l.id INTO v_keep
  FROM public.leads l
  WHERE l.na_lixeira = false AND l.deleted_at IS NULL AND NOT l.registro_adicional
    AND right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9) = right(_chave, 9)
  ORDER BY
    (EXISTS (SELECT 1 FROM public.vendas v WHERE v.lead_id = l.id)) DESC,
    CASE l.status::text
      WHEN 'contrato_fechado' THEN 0 WHEN 'pos_venda' THEN 1 WHEN 'analise_credito' THEN 2
      WHEN 'proposta_enviada' THEN 3 WHEN 'visita_realizada' THEN 4 WHEN 'agendado' THEN 5
      WHEN 'qualificado' THEN 6 WHEN 'em_atendimento' THEN 7 ELSE 8 END,
    greatest(coalesce(l.ultima_interacao, l.created_at), coalesce(l.ultima_atividade_em, l.created_at)) DESC,
    l.created_at DESC
  LIMIT 1;

  IF v_keep IS NULL THEN RETURN NULL; END IF;

  FOR v_lose IN
    SELECT l.id FROM public.leads l
    WHERE l.na_lixeira = false AND l.deleted_at IS NULL AND l.id <> v_keep
      AND NOT l.registro_adicional
      AND right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9) = right(_chave, 9)
  LOOP
    DELETE FROM public.conversas_tratadas c
      WHERE c.lead_id = v_lose
        AND EXISTS (SELECT 1 FROM public.conversas_tratadas k WHERE k.lead_id = v_keep);
    DELETE FROM public.oferta_ativa_leads o
      WHERE o.lead_id = v_lose
        AND EXISTS (SELECT 1 FROM public.oferta_ativa_leads k WHERE k.lead_id = v_keep AND k.oferta_id = o.oferta_id);
    DELETE FROM public.distribuicao_excecoes e
      WHERE e.lead_id = v_lose AND e.status IN ('pendente','em_analise')
        AND EXISTS (SELECT 1 FROM public.distribuicao_excecoes k
                    WHERE k.lead_id = v_keep AND k.status IN ('pendente','em_analise'));

    v_rep := '{}'::jsonb;
    UPDATE public.agendamentos SET lead_id = v_keep WHERE lead_id = v_lose;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('agendamentos', v_n);
    UPDATE public.tarefas SET lead_id = v_keep WHERE lead_id = v_lose;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('tarefas', v_n);
    UPDATE public.interacoes SET lead_id = v_keep WHERE lead_id = v_lose;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('interacoes', v_n);
    UPDATE public.vendas v SET lead_id = v_keep
      WHERE v.lead_id = v_lose
        AND NOT (v.status_venda IN ('rascunho','pendente','aprovada')
                 AND EXISTS (SELECT 1 FROM public.vendas k
                             WHERE k.lead_id = v_keep
                               AND k.status_venda IN ('rascunho','pendente','aprovada')));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_rep := v_rep || jsonb_build_object('vendas', v_n);
    UPDATE public.comissoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.analises_credito SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.propostas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.propostas_visitantes SET convertido_lead_id = v_keep WHERE convertido_lead_id = v_lose;
    UPDATE public.visitas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.visita_execucoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.documentacoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.documentacao_versoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.mensagens SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.chamadas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.lead_eventos SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.lead_status_transitions SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.distribution_log SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.distribuicao_excecoes SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.distribuicao_sombra SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.sla_estouros SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.copiloto_eventos SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.projeto_eventos SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.vitrine_links SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.leads_landing SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.conversas_tratadas SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.oferta_ativa_leads SET lead_id = v_keep WHERE lead_id = v_lose;
    UPDATE public.venda_integridade_conflitos SET lead_id = v_keep WHERE lead_id = v_lose;

    UPDATE public.leads k SET
      nome = coalesce(nullif(trim(k.nome), ''), p.nome),
      email = coalesce(k.email, p.email),
      cpf = coalesce(k.cpf, p.cpf),
      projeto_id = coalesce(k.projeto_id, p.projeto_id),
      projeto_nome = coalesce(k.projeto_nome, p.projeto_nome),
      zona = coalesce(k.zona, p.zona),
      bairro = coalesce(k.bairro, p.bairro),
      renda_informada = coalesce(k.renda_informada, p.renda_informada),
      renda_estimada = coalesce(k.renda_estimada, p.renda_estimada),
      entrada_disponivel = coalesce(k.entrada_disponivel, p.entrada_disponivel),
      usa_fgts = coalesce(k.usa_fgts, p.usa_fgts),
      construtora = coalesce(k.construtora, p.construtora),
      observacoes = coalesce(k.observacoes, p.observacoes),
      ultima_interacao = greatest(coalesce(k.ultima_interacao, k.created_at), coalesce(p.ultima_interacao, p.created_at)),
      updated_at = now()
    FROM public.leads p
    WHERE k.id = v_keep AND p.id = v_lose;

    UPDATE public.leads SET
      na_lixeira = true,
      data_movido_lixeira = now(),
      deleted_at = now(),
      observacoes = concat_ws(E'\n', observacoes, 'Mesclado no lead ' || v_keep::text),
      updated_at = now()
    WHERE id = v_lose;

    INSERT INTO public.leads_merge_log (chave_telefone, lead_mantido, lead_mesclado, dados_mesclados, registros_repontados)
    VALUES (_chave, v_keep, v_lose, '{}'::jsonb, v_rep);
  END LOOP;

  RETURN v_keep;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mesclar_duplicados_lote(_limite integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k text; n integer := 0;
BEGIN
  FOR k IN
    SELECT right(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g'), 9) AS chave
    FROM public.leads
    WHERE na_lixeira = false AND deleted_at IS NULL AND NOT registro_adicional
      AND length(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g')) >= 9
    GROUP BY 1 HAVING count(*) > 1
    LIMIT _limite
  LOOP
    PERFORM public.mesclar_leads_por_telefone(k);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mesclar_leads_dup_lote(p_limite integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tabelas text[] := ARRAY['agendamentos','analises_credito','api_escrita_log','comissoes',
    'copiloto_eventos','distribuicao_excecoes','distribution_log','documentacao_versoes',
    'documentacoes','interacoes','lead_eventos','lead_status_transitions','leads_landing',
    'oferta_ativa_leads','propostas','tarefas','venda_integridade_conflitos','vendas',
    'visita_execucoes','visitas','vitrine_links'];
  v_grupo record;
  v_win public.leads%ROWTYPE;
  v_lose public.leads%ROWTYPE;
  v_tab text;
  v_n integer;
  v_rep jsonb;
  v_dados jsonb;
  v_grupos integer := 0;
BEGIN
  FOR v_grupo IN
    WITH k AS (
      SELECT id,
             left(regexp_replace(telefone, '\D', '', 'g'), 2) || right(regexp_replace(telefone, '\D', '', 'g'), 8) AS chave
      FROM public.leads
      WHERE deleted_at IS NULL
        AND NOT registro_adicional
        AND length(regexp_replace(telefone, '\D', '', 'g')) >= 10
    )
    SELECT chave, array_agg(id) AS ids
    FROM k
    GROUP BY chave
    HAVING count(*) > 1
    LIMIT p_limite
  LOOP
    SELECT l.* INTO v_win
    FROM public.leads l
    WHERE l.id = ANY(v_grupo.ids)
    ORDER BY
      (CASE WHEN COALESCE(l.na_lixeira, false) THEN 0 ELSE 1 END) DESC,
      (SELECT count(*) FROM public.vendas v WHERE v.lead_id = l.id) DESC,
      (CASE WHEN l.corretor_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
      (SELECT count(*) FROM public.interacoes i WHERE i.lead_id = l.id) DESC,
      (CASE WHEN l.email IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.cpf IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.projeto_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.renda_informada IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN l.observacoes IS NOT NULL THEN 1 ELSE 0 END) DESC,
      l.created_at ASC
    LIMIT 1;

    FOR v_lose IN
      SELECT * FROM public.leads
      WHERE id = ANY(v_grupo.ids) AND id <> v_win.id
      ORDER BY created_at
    LOOP
      v_rep := '{}'::jsonb;
      FOREACH v_tab IN ARRAY v_tabelas LOOP
        BEGIN
          EXECUTE format('UPDATE public.%I SET lead_id = $1 WHERE lead_id = $2', v_tab)
            USING v_win.id, v_lose.id;
          GET DIAGNOSTICS v_n = ROW_COUNT;
          IF v_n > 0 THEN
            v_rep := v_rep || jsonb_build_object(v_tab, v_n);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_rep := v_rep || jsonb_build_object(v_tab, 'conflito_mantido_no_original');
        END;
      END LOOP;

      v_dados := jsonb_strip_nulls(jsonb_build_object(
        'email', CASE WHEN v_win.email IS NULL THEN v_lose.email END,
        'cpf', CASE WHEN v_win.cpf IS NULL THEN v_lose.cpf END,
        'projeto_id', CASE WHEN v_win.projeto_id IS NULL THEN v_lose.projeto_id END,
        'projeto_nome', CASE WHEN v_win.projeto_nome IS NULL THEN v_lose.projeto_nome END,
        'renda_informada', CASE WHEN v_win.renda_informada IS NULL THEN v_lose.renda_informada END,
        'observacoes', CASE WHEN v_win.observacoes IS NULL THEN v_lose.observacoes END,
        'nome', CASE WHEN COALESCE(length(v_win.nome), 0) = 0 THEN v_lose.nome END
      ));

      UPDATE public.leads w SET
        email = COALESCE(w.email, v_lose.email),
        cpf = COALESCE(w.cpf, v_lose.cpf),
        projeto_id = COALESCE(w.projeto_id, v_lose.projeto_id),
        projeto_nome = COALESCE(w.projeto_nome, v_lose.projeto_nome),
        renda_informada = COALESCE(w.renda_informada, v_lose.renda_informada),
        observacoes = COALESCE(w.observacoes, v_lose.observacoes),
        nome = CASE WHEN COALESCE(length(w.nome), 0) = 0 THEN v_lose.nome ELSE w.nome END,
        ultima_interacao = GREATEST(COALESCE(w.ultima_interacao, v_lose.ultima_interacao), COALESCE(v_lose.ultima_interacao, w.ultima_interacao)),
        ultimo_contato = GREATEST(COALESCE(w.ultimo_contato, v_lose.ultimo_contato), COALESCE(v_lose.ultimo_contato, w.ultimo_contato)),
        updated_at = now()
      WHERE w.id = v_win.id;

      UPDATE public.leads SET
        deleted_at = now(),
        na_lixeira = true,
        data_movido_lixeira = COALESCE(data_movido_lixeira, now()),
        observacoes = COALESCE(observacoes || E'\n', '') || 'Mesclado no cadastro ' || v_win.id::text || ' (telefone duplicado).',
        updated_at = now()
      WHERE id = v_lose.id;

      INSERT INTO public.leads_merge_log (chave_telefone, lead_mantido, lead_mesclado, dados_mesclados, registros_repontados)
      VALUES (v_grupo.chave, v_win.id, v_lose.id, v_dados, v_rep);

      SELECT * INTO v_win FROM public.leads WHERE id = v_win.id;
    END LOOP;

    v_grupos := v_grupos + 1;
  END LOOP;

  RETURN v_grupos;
END;
$function$;
