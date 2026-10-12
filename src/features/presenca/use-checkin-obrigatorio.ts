// "Falta o check-in de hoje?" — separado do diálogo para que o estudo do funil
// e as metas do dia esperem por ele sem carregar o diálogo (a mesma ideia de
// use-estudo-pendente.ts). Ordem da abertura do corretor: onboarding →
// CHECK-IN → estudo do funil (quinta) → metas do dia.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useMinhaPresenca } from "./presenca-client";
import { checkinObrigatorioPendente } from "./checkin-obrigatorio";
import type { MinhaPresenca } from "./presenca-derive";

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Relógio de "dia" (YYYY-MM-DD em São Paulo): vira à meia-noite com a aba aberta. */
function useDiaSaoPaulo(): string {
  const [dia, setDia] = useState(() => fmtDia.format(new Date()));
  useEffect(() => {
    const t = setInterval(() => {
      const d = fmtDia.format(new Date());
      setDia((atual) => (atual === d ? atual : d));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return dia;
}

/** Evento disparado quando a liberação por falha muda (quem espera o check-in relê). */
export const EVENTO_CHECKIN_OBRIGATORIO = "presenca:checkin-obrigatorio";

function chaveLiberado(uid: string, dia: string) {
  return `smq:presenca:checkin-liberado-por-falha:${uid}:${dia}`;
}

/**
 * O check-in falhou por erro técnico (RPC fora do ar, rede) e o corretor
 * seguiu sem ele. Libera o CRM NESTE aparelho só por hoje — uma falha nunca
 * prende ninguém fora do trabalho. Sem check-in, ele continua fora da roleta
 * (a regra é do banco); a faixa do topo segue avisando.
 */
export function liberarCheckinPorFalha(uid: string, dia: string) {
  try {
    localStorage.setItem(chaveLiberado(uid, dia), "1");
  } catch {
    /* modo privado: sem como lembrar; o diálogo volta na próxima carga */
  }
  window.dispatchEvent(new Event(EVENTO_CHECKIN_OBRIGATORIO));
}

function lerLiberado(uid: string, dia: string): boolean {
  try {
    return localStorage.getItem(chaveLiberado(uid, dia)) === "1";
  } catch {
    return false;
  }
}

/**
 * O corretor ainda não fez NENHUM check-in hoje? `null` enquanto não dá para
 * saber; `false` para gestão sem papel corretor, para quem já fez (mesmo
 * encerrado ou barrado) e quando a leitura falha. Também devolve o dia de São
 * Paulo que valeu para a decisão e a presença lida (filiais e régua do diálogo).
 */
export function useCheckinObrigatorio({ releitura = false }: { releitura?: boolean } = {}): {
  pendente: boolean | null;
  dia: string;
  uid: string;
  presenca: MinhaPresenca | undefined;
} {
  const { user } = useAuth();
  const { isCorretor, loading } = useUserRoles();
  const uid = user?.id ?? "";
  const dia = useDiaSaoPaulo();
  // Diálogo na tela: relê a cada 15 s e ao voltar para a janela (o check-in
  // feito no celular ou confirmado pela gestão fecha o diálogo).
  const q = useMinhaPresenca(isCorretor, { releitura });
  const { refetch } = q;

  // O react-query só escuta "visibilitychange"; no computador, voltar do
  // celular para a janela do CRM costuma ser só "focus".
  useEffect(() => {
    if (!releitura || !isCorretor) return;
    const reler = () => void refetch({ cancelRefetch: false });
    window.addEventListener("focus", reler);
    return () => window.removeEventListener("focus", reler);
  }, [releitura, isCorretor, refetch]);

  const [liberado, setLiberado] = useState(() => lerLiberado(uid, dia));
  useEffect(() => {
    const atualizar = () => setLiberado(lerLiberado(uid, dia));
    atualizar();
    window.addEventListener(EVENTO_CHECKIN_OBRIGATORIO, atualizar);
    return () => window.removeEventListener(EVENTO_CHECKIN_OBRIGATORIO, atualizar);
  }, [uid, dia]);

  // Aba aberta desde ontem: o cache traz o check-in de ontem. Relê UMA vez
  // por dia; se o relógio do aparelho discordar do servidor, vale o servidor.
  const diaDosDados = q.data?.dia || null;
  const desatualizado = !!diaDosDados && diaDosDados !== dia;
  const [relidoEm, setRelidoEm] = useState<string | null>(null);
  const [relendo, setRelendo] = useState(false);
  useEffect(() => {
    if (!desatualizado || relidoEm === dia) return;
    setRelidoEm(dia);
    setRelendo(true);
    // Sem cancelar: o diálogo, o estudo e as metas releem juntos numa ida só.
    void refetch({ cancelRefetch: false }).finally(() => setRelendo(false));
  }, [desatualizado, relidoEm, dia, refetch]);

  const pendente = checkinObrigatorioPendente({
    carregando: !uid || loading,
    ehCorretor: isCorretor,
    erro: q.isError,
    presenca: q.data,
    aguardandoReleitura: desatualizado && (relidoEm !== dia || relendo),
    liberadoPorFalha: liberado,
  });
  return { pendente, dia, uid, presenca: q.data };
}

// O diálogo na tela. Depois de um check-in que não liberou a roleta, o banco
// já conta "fez check-in hoje", mas o diálogo segue aberto explicando o
// porquê: quem espera o check-in espera também o diálogo fechar.
let dialogoAberto = false;
const ouvintesDialogo = new Set<() => void>();

/** Publicado pelo CheckinObrigatorioGlobal a cada abertura e fechamento. */
export function publicarDialogoCheckin(aberto: boolean) {
  if (dialogoAberto === aberto) return;
  dialogoAberto = aberto;
  for (const avisar of ouvintesDialogo) avisar();
}

function assinarDialogo(avisar: () => void) {
  ouvintesDialogo.add(avisar);
  return () => {
    ouvintesDialogo.delete(avisar);
  };
}

/**
 * Para quem só espera o check-in (estudo do funil, metas do dia): pendente
 * enquanto falta o check-in de hoje ou enquanto o diálogo está na tela.
 */
export function useCheckinObrigatorioPendente(): boolean | null {
  const { pendente } = useCheckinObrigatorio();
  const aberto = useSyncExternalStore(
    assinarDialogo,
    () => dialogoAberto,
    () => false,
  );
  return aberto ? true : pendente;
}
