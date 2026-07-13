// usePreference — preferência de UI por usuário com leitura síncrona (sem
// flicker no primeiro paint) e sync entre dispositivos quando o backend tem a
// tabela user_preferences. Escrita é write-through: local imediato + push
// best-effort. O valor do servidor vence UMA vez por sessão (no primeiro
// pull), depois o dispositivo atual é a fonte da verdade.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { pullPrefs, pushPref, readLocalPref, writeLocalPref, type PrefKey } from "@/lib/user-prefs";

export function usePreference<T>(
  key: PrefKey,
  fallback: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const { user } = useAuth();
  const uid = user?.id ?? "";

  const [value, setValue] = useState<T>(() => readLocalPref(uid, key, fallback));
  // Depois que o usuário mexe neste dispositivo, o pull do servidor não
  // sobrescreve mais a escolha da sessão.
  const dirtyRef = useRef(false);

  // Uma query por usuário (não por chave): todas as preferências chegam num
  // pull só e ficam 5 min no cache — hooks de chaves diferentes compartilham.
  const serverPrefs = useQuery({
    queryKey: ["user-prefs", uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: () => pullPrefs(uid),
  });

  useEffect(() => {
    if (!serverPrefs.data || dirtyRef.current) return;
    if (Object.prototype.hasOwnProperty.call(serverPrefs.data, key)) {
      const remote = serverPrefs.data[key] as T;
      setValue(remote);
      writeLocalPref(uid, key, remote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPrefs.data, key, uid]);

  // Troca de usuário no mesmo dispositivo: relê o local do novo uid.
  useEffect(() => {
    dirtyRef.current = false;
    setValue(readLocalPref(uid, key, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      dirtyRef.current = true;
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeLocalPref(uid, key, resolved);
        void pushPref(uid, key, resolved);
        return resolved;
      });
    },
    [uid, key],
  );

  return [value, update];
}
