-- Preferências de UI por usuário (visões salvas, colunas de tabela, densidade,
-- sidebar recolhida, widgets da home, recentes do palette).
--
-- Contrato com o cliente (src/lib/user-prefs.ts):
--   * chave namespaced ("ui:sidebar-collapsed", "table:leads", "leads:views"…)
--   * valor JSONB opaco — o cliente é dono do formato de cada chave
--   * a UI funciona sem esta tabela (fallback localStorage); quando ela existe,
--     as preferências sincronizam entre dispositivos.
--
-- Segurança: RLS owner-only. Nenhum SECURITY DEFINER; nenhuma leitura cruzada.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key),
  -- chaves são curtas e namespaced; valores grandes indicam uso indevido
  CONSTRAINT user_preferences_key_len CHECK (char_length(key) BETWEEN 1 AND 120)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_insert_own" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_delete_own" ON public.user_preferences;
CREATE POLICY "user_preferences_delete_own"
  ON public.user_preferences FOR DELETE
  USING (auth.uid() = user_id);

REVOKE ALL ON public.user_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
