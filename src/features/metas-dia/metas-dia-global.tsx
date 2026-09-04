import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import {
  CHECKPOINTS,
  avaliarCheckpoint,
  balancoDoDia,
  checkpointDevido,
  contatosNecessarios,
  diaSaoPaulo,
  ehDiaUtil,
  horaSaoPaulo,
  mensagemCheckpoint,
  precisaResponder,
  taxasConversao,
} from "@/features/metas-dia/metas-dia";
import {
  registrarAlertaCheckpoint,
  useInvalidarMetasDiaAoMudarDados,
  useMetaDeHoje,
  useMetaGestor,
  useRealizadoDoDia,
  useRealizadoHoje,
  useTaxasConversao,
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

function chaveCheckpoints(uid: string, dia: string) {
  return `smq:metas-dia:checkpoints:${uid}:${dia}`;
}

function lerCheckpoints(uid: string, dia: string): number[] {
  try {
    const raw = localStorage.getItem(chaveCheckpoints(uid, dia));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function gravarCheckpoints(uid: string, dia: string, lista: number[]) {
  try {
    localStorage.setItem(chaveCheckpoints(uid, dia), JSON.stringify(lista));
  } catch {
    /* modo privado: o dedup do sino no banco segura a repetição */
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
 * Fluxo: sem resposta de hoje no banco → popup (balanço do último dia + metas;
 * bloqueante em dia útil). Com resposta → card com o progresso; o lápis
 * reabre o popup em modo edição. Às 12h/15h/17h, aviso de andamento (toast +
 * sino) comparando o realizado com o ritmo esperado para a hora.
 */
export function MetasDiaGlobal() {
  const { user } = useAuth();
  const { isCorretor, loading: rolesLoading } = useUserRoles();
  const uid = user?.id ?? "";
  const dia = useDiaOperacao();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();

  const habilitado = !!uid && !rolesLoading && isCorretor;
  const hojeQ = useMetaDeHoje(dia);
  const ultimaQ = useUltimaMeta(dia);
  const gestorQ = useMetaGestor();
  const realizadoQ = useRealizadoHoje(dia, habilitado && !!hojeQ.data);
  const taxasQ = useTaxasConversao(habilitado);
  useInvalidarMetasDiaAoMudarDados();

  const [editar, setEditar] = useState(false);
  const [pulado, setPulado] = useState(() => lerPulado(uid, dia));
  useEffect(() => setPulado(lerPulado(uid, dia)), [uid, dia]);

  useEffect(() => {
    const abrir = () => setEditar(true);
    window.addEventListener(EVENTO_ABRIR_METAS_DIA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_METAS_DIA, abrir);
  }, []);

  const primeira =
    habilitado &&
    !hojeQ.isPending &&
    !hojeQ.isError &&
    precisaResponder({
      dia,
      ehCorretor: isCorretor,
      respostaHoje: hojeQ.data,
      puladoHoje: pulado,
    });

  // Balanço do último dia declarado: só na primeira abertura, e o popup espera
  // esse dado para não abrir no passo errado e "pular" depois.
  const precisaOntem = primeira && !!ultimaQ.data;
  const ontemQ = useRealizadoDoDia(ultimaQ.data?.dia, precisaOntem);
  const ultimaPronta = !ultimaQ.isPending;
  const ontemPronto = !precisaOntem || ontemQ.data !== undefined || ontemQ.isError;

  const taxas = useMemo(() => taxasConversao(taxasQ.data ?? null, dia), [taxasQ.data, dia]);
  const balanco = useMemo(
    () =>
      primeira && ultimaQ.data && ontemQ.data ? balancoDoDia(ultimaQ.data, ontemQ.data, dia) : null,
    [primeira, ultimaQ.data, ontemQ.data, dia],
  );
  // Vendas já feitas na semana corrente: do realizado de hoje (se já declarou)
  // ou do balanço de ontem quando a semana é a mesma.
  const vendasSemanaAtual =
    realizadoQ.data?.vendas_semana ??
    (balanco && !balanco.vendas.semana_encerrada ? balanco.vendas.realizado : 0);

  const metaHoje = hojeQ.data;
  const realizado = realizadoQ.data;
  const contatosHoje = useMemo(
    () =>
      metaHoje && realizado
        ? contatosNecessarios(metaHoje, taxas, realizado.vendas_semana, dia)
        : null,
    [metaHoje, realizado, taxas, dia],
  );

  // Checkpoints de andamento (12h/15h/17h em SP), só em dia útil e com meta
  // declarada. Dedup local por dia; o sino dedupa no banco (outro aparelho).
  useEffect(() => {
    if (!habilitado || !metaHoje || !realizado || !ehDiaUtil(dia)) return;
    const tick = () => {
      const hora = horaSaoPaulo();
      const horaDecl = metaHoje.respondido_em
        ? horaSaoPaulo(new Date(metaHoje.respondido_em))
        : null;
      const cp = checkpointDevido(hora, lerCheckpoints(uid, dia), horaDecl);
      if (cp === null) return;
      // Marca este e os anteriores: quem abre às 16h recebe só o das 15h.
      gravarCheckpoints(
        uid,
        dia,
        CHECKPOINTS.filter((c) => c <= cp),
      );
      const msg = mensagemCheckpoint(avaliarCheckpoint(metaHoje, realizado, cp), taxas);
      if (!msg) return;
      (msg.tom === "ok" ? toast.success : toast.warning)(msg.titulo, {
        description: msg.mensagem,
        duration: 15_000,
      });
      void registrarAlertaCheckpoint(dia, cp, msg.titulo, msg.mensagem).then((inserido) => {
        if (inserido) void qc.invalidateQueries({ queryKey: ["alertas"] });
      });
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [habilitado, metaHoje, realizado, dia, uid, taxas, qc]);

  if (!habilitado) return null;
  // Enquanto o banco não respondeu, não decide nada: evita abrir o popup por
  // um instante e fechá-lo (flash) para quem já respondeu em outro aparelho.
  if (hojeQ.isPending) return null;
  // Falha de rede/RLS: não bloqueia o CRM inteiro por causa do popup.
  if (hojeQ.isError) return null;

  const dialogAberto = (primeira && ultimaPronta && ontemPronto) || editar;
  const mostrarCard =
    !!metaHoje && !dialogAberto && !ROTAS_SEM_CARD.some((r) => pathname.startsWith(r));

  return (
    <>
      <MetasDiaDialog
        open={dialogAberto}
        dia={dia}
        atual={metaHoje}
        ultima={ultimaQ.data}
        gestor={gestorQ.data}
        balanco={balanco}
        taxas={taxas}
        vendasSemanaAtual={vendasSemanaAtual}
        modo={primeira ? "primeira" : "editar"}
        onClose={(motivo) => {
          if (motivo === "pulado" && primeira) {
            gravarPulado(uid, dia);
            setPulado(true);
          }
          setEditar(false);
        }}
      />
      {mostrarCard && metaHoje && (
        <MetasDiaCard
          uid={uid}
          dia={dia}
          meta={metaHoje}
          realizado={realizado}
          contatosHoje={contatosHoje?.total ?? null}
          mediaContatosDia={taxas.media_contatos_dia}
          onEditar={() => setEditar(true)}
        />
      )}
    </>
  );
}
