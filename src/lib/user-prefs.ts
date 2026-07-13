// Camada de preferências por usuário: localStorage SEMPRE (leitura síncrona,
// sem flicker) + sync best-effort com a tabela user_preferences quando ela
// existir no ambiente (RLS owner-only). Se a migration ainda não foi aplicada,
// o sync se desliga em silêncio e tudo continua funcionando por dispositivo.

import { supabase } from "@/integrations/supabase/client";
import { isMissingBackendObject } from "@/lib/supabase-errors";

/**
 * Chaves namespaced. Convenções em uso:
 *   "ui:sidebar-collapsed" · "ui:density" · `table:${tableId}` ·
 *   "leads:views" · "leads:filtros" · `home:widgets:${escopo}` ·
 *   "palette:recentes"
 */
export type PrefKey = string;

const localKey = (uid: string, key: PrefKey) => `smq:pref:${uid}:${key}`;

export function readLocalPref<T>(uid: string, key: PrefKey, fallback: T): T {
  if (typeof window === "undefined" || !uid) return fallback;
  try {
    const raw = window.localStorage.getItem(localKey(uid, key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalPref<T>(uid: string, key: PrefKey, value: T): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.localStorage.setItem(localKey(uid, key), JSON.stringify(value));
  } catch {
    /* cota cheia / modo privado: preferência segue em memória */
  }
}

// ---------------------------------------------------------------------------
// Sync com o servidor (best-effort)
// ---------------------------------------------------------------------------

// A tabela pode não existir nos types gerados nem no banco — acesso mínimo e
// contido num único ponto, com desligamento na primeira ausência detectada.
type PrefsClientLike = {
  from(table: string): {
    upsert(values: Record<string, unknown>): PromiseLike<{
      error: { code?: string; message?: string } | null;
    }>;
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{
        data: { key: string; value: unknown }[] | null;
        error: { code?: string; message?: string } | null;
      }>;
    };
  };
};

const prefsClient = supabase as unknown as PrefsClientLike;

let serverDisabled = false;

/** Visível para testes; em produção só o módulo mexe nisso. */
export function _resetServerSyncForTests(): void {
  serverDisabled = false;
}

/**
 * Grava a preferência no servidor (upsert). Silencia "tabela ausente"
 * desligando o sync da sessão; qualquer outro erro também não interrompe o
 * fluxo do usuário (preferência é conveniência, nunca bloqueio).
 */
export async function pushPref(uid: string, key: PrefKey, value: unknown): Promise<void> {
  if (serverDisabled || !uid) return;
  try {
    const { error } = await prefsClient.from("user_preferences").upsert({
      user_id: uid,
      key,
      value,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (isMissingBackendObject(error)) serverDisabled = true;
      else console.warn("user_preferences: falha ao sincronizar", error.message);
    }
  } catch (err) {
    if (isMissingBackendObject(err)) serverDisabled = true;
  }
}

/**
 * Busca TODAS as preferências do usuário no servidor.
 * `null` = servidor indisponível/tabela ausente (mantém o local como fonte).
 */
export async function pullPrefs(uid: string): Promise<Record<string, unknown> | null> {
  if (serverDisabled || !uid) return null;
  try {
    const { data, error } = await prefsClient
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", uid);
    if (error) {
      if (isMissingBackendObject(error)) serverDisabled = true;
      return null;
    }
    const map: Record<string, unknown> = {};
    for (const row of data ?? []) map[row.key] = row.value;
    return map;
  } catch (err) {
    if (isMissingBackendObject(err)) serverDisabled = true;
    return null;
  }
}
