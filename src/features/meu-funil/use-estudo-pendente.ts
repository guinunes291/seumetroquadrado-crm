// "O estudo do funil de hoje está pendente?" — separado da tela para que as
// metas do dia possam esperar por ele sem carregar o Meu Funil inteiro.

import { useEffect, useState } from "react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { diaSaoPaulo, ehDiaUtil } from "@/features/metas-dia/metas-dia";
import { precisaEstudar } from "@/features/meu-funil/meu-funil";
import { useEstudoDeHoje } from "@/features/meu-funil/use-meu-funil";

function chavePulado(uid: string) {
  return `smq:meu-funil:pulado:${uid}`;
}

function lerPulado(uid: string, dia: string): boolean {
  try {
    return localStorage.getItem(chavePulado(uid)) === dia;
  } catch {
    return false;
  }
}

export function gravarPulado(uid: string, dia: string) {
  try {
    localStorage.setItem(chavePulado(uid), dia);
  } catch {
    /* modo privado: pergunta de novo na próxima abertura */
  }
}

/** Relógio de "dia": vira à meia-noite de São Paulo mesmo com a aba aberta. */
export function useDia(): string {
  const [dia, setDia] = useState(() => diaSaoPaulo());
  useEffect(() => {
    const t = setInterval(() => {
      const d = diaSaoPaulo();
      setDia((atual) => (atual === d ? atual : d));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return dia;
}

/** Evento disparado quando o estudo pendente muda (as metas do dia esperam por ele). */
export const EVENTO_ESTUDO_FUNIL = "meu-funil:estudo";

/**
 * O estudo de hoje ainda está pendente? `null` enquanto não dá para saber
 * (sessão/papéis/banco carregando). Usado pelas metas do dia para não abrir
 * por cima do estudo. Erro de leitura → `false`: falha de rede nunca trava o CRM.
 */
export function useEstudoFunilPendente(): boolean | null {
  const { user } = useAuth();
  const { isCorretor, loading } = useUserRoles();
  const uid = user?.id ?? "";
  const dia = useDia();
  const hojeQ = useEstudoDeHoje(dia, !!uid && isCorretor);
  const [pulado, setPulado] = useState(() => lerPulado(uid, dia));
  useEffect(() => {
    const atualizar = () => setPulado(lerPulado(uid, dia));
    atualizar();
    window.addEventListener(EVENTO_ESTUDO_FUNIL, atualizar);
    return () => window.removeEventListener(EVENTO_ESTUDO_FUNIL, atualizar);
  }, [uid, dia]);

  if (!uid || loading) return null;
  if (!isCorretor) return false;
  if (hojeQ.isError) return false;
  if (hojeQ.isPending) return null;
  return precisaEstudar({
    ehCorretor: isCorretor,
    diaUtil: ehDiaUtil(dia),
    estudoHoje: hojeQ.data,
    puladoHoje: pulado,
  });
}
