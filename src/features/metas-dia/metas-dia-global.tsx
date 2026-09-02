import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { diaSaoPaulo, precisaResponder } from "@/features/metas-dia/metas-dia";
import {
  useInvalidarMetasDiaAoMudarDados,
  useMetaDeHoje,
  useMetaGestor,
  useRealizadoHoje,
  useUltimaMeta,
} from "@/features/metas-dia/use-metas-dia";
import { MetasDiaDialog } from "@/features/metas-dia/metas-dia-dialog";
import { MetasDiaCard } from "@/features/metas-dia/metas-dia-card";

/** Evento global para reabrir o popup de qualquer lugar (command palette, atalhos). */
export const EVENTO_ABRIR_METAS_DIA = "open-metas-dia";

function chavePulado(uid: string) {
  return `smq:metas-dia:pulado:${uid}`;
}

function lerPulado(uid: string, dia: string): boolean {
  try {
    return localStorage.getItem(chavePulado(uid)) === dia;
  } catch {
    return false;
  }
}

function gravarPulado(uid: string, dia: string) {
  try {
    localStorage.setItem(chavePulado(uid), dia);
  } catch {
    /* modo privado: pergunta de novo na próxima abertura */
  }
}

/** Relógio de "dia": vira à meia-noite de São Paulo mesmo com a aba aberta. */
function useDiaOperacao(): string {
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

// Telas em que o card atrapalha (tela cheia de campo).
const ROTAS_SEM_CARD = ["/modo-visita"];

/**
 * Host global das metas do dia — montado no shell /_authenticated E no hub
 * /inicio (que vive fora do shell). Só para quem tem o papel corretor.
 *
 * Fluxo: sem resposta de hoje no banco → popup (bloqueante em dia útil).
 * Com resposta → card flutuante com o progresso; o lápis reabre o popup em
 * modo edição.
 */
export function MetasDiaGlobal() {
  const { user } = useAuth();
  const { isCorretor, loading: rolesLoading } = useUserRoles();
  const uid = user?.id ?? "";
  const dia = useDiaOperacao();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const habilitado = !!uid && !rolesLoading && isCorretor;
  const hojeQ = useMetaDeHoje(dia);
  const ultimaQ = useUltimaMeta(dia);
  const gestorQ = useMetaGestor();
  const realizadoQ = useRealizadoHoje(dia, habilitado && !!hojeQ.data);
  useInvalidarMetasDiaAoMudarDados();

  const [editar, setEditar] = useState(false);
  const [pulado, setPulado] = useState(() => lerPulado(uid, dia));
  useEffect(() => setPulado(lerPulado(uid, dia)), [uid, dia]);

  useEffect(() => {
    const abrir = () => setEditar(true);
    window.addEventListener(EVENTO_ABRIR_METAS_DIA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_METAS_DIA, abrir);
  }, []);

  if (!habilitado) return null;
  // Enquanto o banco não respondeu, não decide nada: evita abrir o popup por
  // um instante e fechá-lo (flash) para quem já respondeu em outro aparelho.
  if (hojeQ.isPending) return null;
  // Falha de rede/RLS: não bloqueia o CRM inteiro por causa do popup.
  if (hojeQ.isError) return null;

  const primeira = precisaResponder({
    dia,
    ehCorretor: isCorretor,
    respostaHoje: hojeQ.data,
    puladoHoje: pulado,
  });
  const dialogAberto = primeira || editar;
  const mostrarCard =
    !!hojeQ.data && !dialogAberto && !ROTAS_SEM_CARD.some((r) => pathname.startsWith(r));

  return (
    <>
      <MetasDiaDialog
        open={dialogAberto}
        dia={dia}
        atual={hojeQ.data}
        ultima={ultimaQ.data}
        gestor={gestorQ.data}
        modo={primeira ? "primeira" : "editar"}
        onClose={(motivo) => {
          if (motivo === "pulado" && primeira) {
            gravarPulado(uid, dia);
            setPulado(true);
          }
          setEditar(false);
        }}
      />
      {mostrarCard && hojeQ.data && (
        <MetasDiaCard
          uid={uid}
          dia={dia}
          meta={hojeQ.data}
          realizado={realizadoQ.data}
          onEditar={() => setEditar(true)}
        />
      )}
    </>
  );
}
