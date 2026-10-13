// "Falta o check-in de hoje?" — separado do diálogo para que o estudo do funil
// e as metas do dia esperem por ele sem carregar o diálogo (a mesma ideia de
// use-estudo-pendente.ts). Ordem da abertura do corretor: onboarding →
// CHECK-IN → estudo do funil (quinta) → metas do dia.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { lerLocalizacaoAgora, useMinhaPresenca } from "./presenca-client";
import { checkinObrigatorioPendente } from "./checkin-obrigatorio";
import type { AcaoPedidoCheckin, MinhaPresenca } from "./presenca-derive";

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
 * encerrado ou barrado) e quando a leitura falha sem nenhum dado de hoje (a
 * primeira; a releitura que falha mantém o último dado bom). Também devolve o
 * dia de São Paulo que valeu para a decisão e a presença lida (filiais e
 * régua do diálogo).
 */
export function useCheckinObrigatorio({ releitura = false }: { releitura?: boolean } = {}): {
  pendente: boolean | null;
  dia: string;
  uid: string;
  presenca: MinhaPresenca | undefined;
  /**
   * A leitura falhou e não há dado de hoje (a mesma conta que libera o
   * obrigatório): o bloco da barra lateral diz "Não deu para ler o check-in".
   */
  erroLeitura: boolean;
} {
  const { user } = useAuth();
  const { isCorretor, loading } = useUserRoles();
  const uid = user?.id ?? "";
  const dia = useDiaSaoPaulo();
  // Diálogo na tela: relê a cada 15 s, ao voltar para a aba e ao voltar para
  // a janela (o check-in feito no celular ou confirmado pela gestão fecha o
  // diálogo).
  const q = useMinhaPresenca(isCorretor, { releitura });
  const { refetch } = q;

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

  // Só libera a falha sem dado de hoje (a PRIMEIRA leitura, ou a releitura
  // da virada do dia). Uma releitura que falha com o dado de hoje já lido
  // (a de 15 s do diálogo, uma invalidação) mantém o que ele disse: um
  // soluço da rede não fecha o diálogo obrigatório.
  const erroLeitura = q.isError && (!q.data || desatualizado);
  const pendente = checkinObrigatorioPendente({
    carregando: !uid || loading,
    ehCorretor: isCorretor,
    erro: erroLeitura,
    presenca: q.data,
    aguardandoReleitura: desatualizado && (relidoEm !== dia || relendo),
    liberadoPorFalha: liberado,
  });
  return { pendente, dia, uid, presenca: q.data, erroLeitura };
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

// ---------------------------------------------------------------------------
// Pedido de check-in (13/10/2026): o bloco da barra lateral e a faixa do topo
// pedem, o diálogo (ou o card, em /presenca e /meu-perfil) atende. Nenhum dos
// dois chama a RPC. Um estado de módulo, no mesmo padrão do diálogo acima: o
// pedido não se perde se o chunk do diálogo ainda não montou (ele lê ao
// montar), e vence em 15 s (um pedido esquecido não abre nada horas depois).
// ---------------------------------------------------------------------------

export type PedidoCheckin = {
  id: number;
  acao: AcaoPedidoCheckin;
  origem: "lateral" | "faixa";
  em: number;
  /**
   * "Incluir localização": a leitura do GPS que já saiu NO TOQUE da faixa ou
   * do bloco. O diálogo só monta (lazy) e refaz depois — de dentro de um
   * efeito, fora do gesto, o navegador pode não mostrar o pedido de permissão
   * (decisão do dono, 13/10: "Pedir localização no check-in").
   */
  leitura?: ReturnType<typeof lerLocalizacaoAgora>;
};

/** Quanto tempo um pedido espera quem o atenda (o treino decidir, a presença chegar). */
export const VALIDADE_PEDIDO_MS = 15_000;

let pedido: PedidoCheckin | null = null;
let ultimoPedidoId = 0;
// Quando foi o último pedido, mesmo já atendido: o Sheet do celular fecha
// DEPOIS de o diálogo abrir e devolveria o foco ao ☰ por cima dele.
let ultimoPedidoEm: number | null = null;
const ouvintesPedido = new Set<() => void>();

function avisarPedido() {
  for (const avisar of ouvintesPedido) avisar();
}

/** O bloco da barra lateral e a faixa pedem; quem atende é o diálogo ou o card. */
export function pedirCheckin(p: {
  acao: AcaoPedidoCheckin;
  origem: "lateral" | "faixa";
  leitura?: PedidoCheckin["leitura"];
}): void {
  ultimoPedidoId += 1;
  const em = Date.now();
  pedido = { id: ultimoPedidoId, acao: p.acao, origem: p.origem, em, leitura: p.leitura };
  ultimoPedidoEm = em;
  avisarPedido();
}

/**
 * O pedido de quem toca um botão: com "Incluir localização", a leitura do GPS
 * sai AGORA, ainda dentro do toque, e vai junto no pedido.
 */
export function pedirCheckinNoToque(acao: AcaoPedidoCheckin, origem: "lateral" | "faixa"): void {
  pedirCheckin({
    acao,
    origem,
    leitura: acao === "incluir-localizacao" ? lerLocalizacaoAgora() : undefined,
  });
}

/** Limpa só se for o mesmo pedido (um mais novo, feito no meio, fica). */
export function atenderPedidoCheckin(id: number): void {
  if (!pedido || pedido.id !== id) return;
  pedido = null;
  avisarPedido();
}

/** Ainda vale? Até 15 s; relógio que volta (agora < em) = vencido. */
export function pedidoVigente(p: PedidoCheckin, agora: number): boolean {
  const d = agora - p.em;
  return d >= 0 && d <= VALIDADE_PEDIDO_MS;
}

/** Houve um pedido nos últimos 2 s (atendido ou não)? O Sheet não devolve o foco ao ☰. */
export function houvePedidoCheckinRecente(agora = Date.now(), janelaMs = 2_000): boolean {
  if (ultimoPedidoEm === null) return false;
  const d = agora - ultimoPedidoEm;
  return d >= 0 && d <= janelaMs;
}

function assinarPedido(avisar: () => void) {
  ouvintesPedido.add(avisar);
  return () => {
    ouvintesPedido.delete(avisar);
  };
}

/** O pedido de check-in em aberto (ou null). */
export function usePedidoCheckin(): PedidoCheckin | null {
  return useSyncExternalStore(
    assinarPedido,
    () => pedido,
    () => null,
  );
}

/** Só testes: zera o pedido entre um teste e outro. */
export function _reiniciarPedidoCheckin(): void {
  pedido = null;
  ultimoPedidoId = 0;
  ultimoPedidoEm = null;
  avisarPedido();
}
