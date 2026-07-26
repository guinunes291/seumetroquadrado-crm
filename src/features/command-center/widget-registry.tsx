// Registro dos widgets da home (Central de Comando) + preferências por
// usuário. Cada seção da /hoje é um widget: o usuário oculta/reordena pelo
// diálogo de personalização e a escolha persiste por usuário E por visão
// (chave `home:widgets:${escopo}`) via usePreference (localStorage + sync).

import { useCallback, useMemo, type ComponentType } from "react";
import { usePreference } from "@/hooks/use-preference";
import { useUserRoles } from "@/hooks/use-auth";
import { NbaWidget } from "@/features/command-center/widgets/nba";
import { MissoesWidget } from "@/features/command-center/widgets/missoes";
import { HojeAgendaWidget } from "@/features/command-center/widgets/hoje-agenda";
import { TarefasWidget } from "@/features/command-center/widgets/tarefas";
import { MetasWidget } from "@/features/command-center/widgets/metas";
import { RadarWidget } from "@/features/command-center/widgets/radar";
import { ProdutividadeWidget } from "@/features/command-center/widgets/produtividade";
import { GestaoDiaWidget } from "@/features/command-center/widgets/gestao-dia";
import { GestaoPacingWidget } from "@/features/command-center/widgets/gestao-pacing";
import { GestaoAtalhosWidget } from "@/features/command-center/widgets/gestao-atalhos";
import type { Periodo } from "@/features/command-center/widgets/use-home-data";

/**
 * Props que TODO widget recebe da rota — a mesma informação que as seções da
 * /hoje usavam quando moravam no monólito. O cálculo de papel/equipe/escopo
 * (PR #78) continua acontecendo UMA vez, na rota; aqui só chega o resultado.
 */
export type WidgetProps = {
  escopo: "minha" | "operacao";
  /** null = sem filtro de corretor (toda a operação); array = restringe a esses ids. */
  scopeIds: string[] | null;
  /** Chave estável do escopo para queryKeys (derivada de scopeIds na rota). */
  scopeKey: string;
  /** false enquanto o gestor aguarda a equipe — as queries esperam o escopo completo. */
  scopeReady: boolean;
  /** Período do desempenho — estado da rota, compartilhado entre widgets. */
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
};

export type WidgetDef = {
  id: string;
  /** Título exibido no diálogo de personalização. */
  title: string;
  /** Papéis que veem o widget; ausente = todos. */
  roles?: Array<"admin" | "gestor" | "corretor" | "superintendente">;
  /** Visões em que o widget existe; ausente = ambas. */
  escopos?: Array<"minha" | "operacao">;
  size: "hero" | "half" | "third" | "full";
  Component: ComponentType<WidgetProps>;
};

/** Classes de grid por tamanho (grid base: 1 col < lg, 2 cols em lg, 6 em xl). */
export const WIDGET_SIZE_CLASS: Record<WidgetDef["size"], string> = {
  hero: "col-span-full",
  full: "col-span-full",
  half: "lg:col-span-1 xl:col-span-3",
  third: "lg:col-span-1 xl:col-span-2",
};

/**
 * Ordem daqui = ordem padrão na tela.
 *
 * A home tem DUAS caras (pedido de produto): a visão "operacao" é o cockpit
 * de GESTÃO (exceções do dia, ritmo da meta, atalhos para relatórios e
 * ferramentas) e a visão "minha" é o dia do corretor (próxima ação, missões,
 * tarefas). Widgets pessoais não aparecem na operação e vice-versa — o
 * gestor que também vende alterna no toggle Operação × Minha.
 */
export const HOME_WIDGETS: WidgetDef[] = [
  // — Cockpit de gestão (visão operação; só papéis de gestão) —
  {
    id: "gestao-dia",
    title: "O que exige ação hoje",
    roles: ["admin", "gestor", "superintendente"],
    escopos: ["operacao"],
    size: "hero",
    Component: GestaoDiaWidget,
  },
  {
    id: "gestao-atalhos",
    title: "Ferramentas de gestão",
    roles: ["admin", "gestor", "superintendente"],
    escopos: ["operacao"],
    size: "third",
    Component: GestaoAtalhosWidget,
  },
  {
    id: "gestao-pacing",
    title: "Ritmo do mês",
    roles: ["admin", "gestor", "superintendente"],
    escopos: ["operacao"],
    size: "third",
    Component: GestaoPacingWidget,
  },
  // — Dia do corretor (visão minha) —
  { id: "nba", title: "Próxima melhor ação", escopos: ["minha"], size: "hero", Component: NbaWidget },
  { id: "missoes", title: "Fila de missões", escopos: ["minha"], size: "third", Component: MissoesWidget },
  { id: "hoje-agenda", title: "Agenda de hoje", size: "third", Component: HojeAgendaWidget },
  { id: "tarefas", title: "Tarefas & follow-ups", escopos: ["minha"], size: "third", Component: TarefasWidget },
  { id: "metas", title: "Metas do dia", escopos: ["minha"], size: "third", Component: MetasWidget },
  // — Comuns às duas visões (leitura de risco/entrega faz sentido nas duas) —
  { id: "radar", title: "Radar de risco", size: "third", Component: RadarWidget },
  { id: "produtividade", title: "Produtividade", size: "full", Component: ProdutividadeWidget },
];

type HomeWidgetPref = { order: string[]; hidden: string[] };

const PREF_PADRAO: HomeWidgetPref = { order: [], hidden: [] };

/** Ordem salva (só ids ainda existentes) + widgets novos, ao final. */
function mergeOrder(saved: string[]): string[] {
  const conhecidos = HOME_WIDGETS.map((w) => w.id);
  const salvos = saved.filter((id) => conhecidos.includes(id));
  return [...salvos, ...conhecidos.filter((id) => !salvos.includes(id))];
}

export type HomeWidgetPrefs = {
  /** Widgets a renderizar, já na ordem salva e sem os ocultos. */
  visible: WidgetDef[];
  /** Ids ocultos (para o diálogo). */
  hidden: string[];
  /** Ordem efetiva dos widgets disponíveis ao papel/visão atuais. */
  order: string[];
  toggle: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  reset: () => void;
};

export function useHomeWidgetPrefs(escopo: string): HomeWidgetPrefs {
  const { roles } = useUserRoles();
  // A visão de operação foi reestruturada (cockpit de gestão): a chave v2
  // garante que todo gestor receba o novo layout padrão, mesmo quem já tinha
  // ordem salva da versão antiga (que enterraria os widgets novos no fim).
  const prefKey = escopo === "operacao" ? "home:widgets:operacao:v2" : `home:widgets:${escopo}`;
  const [pref, setPref] = usePreference<HomeWidgetPref>(prefKey, PREF_PADRAO);

  // Papel e visão restringem widgets: o cockpit de gestão só existe na
  // operação (papéis de gestão) e os widgets pessoais só na visão "minha".
  const disponiveis = useMemo(() => {
    const porId = new Map(HOME_WIDGETS.map((w) => [w.id, w]));
    return mergeOrder(pref.order)
      .map((id) => porId.get(id))
      .filter((w): w is WidgetDef => !!w)
      .filter(
        (w) =>
          (!w.roles || w.roles.some((r) => roles.includes(r))) &&
          (!w.escopos || w.escopos.some((e) => e === escopo)),
      );
  }, [pref.order, roles, escopo]);

  const visible = useMemo(
    () => disponiveis.filter((w) => !pref.hidden.includes(w.id)),
    [disponiveis, pref.hidden],
  );

  const toggle = useCallback(
    (id: string) => {
      setPref((prev) => ({
        ...prev,
        hidden: prev.hidden.includes(id)
          ? prev.hidden.filter((h) => h !== id)
          : [...prev.hidden, id],
      }));
    },
    [setPref],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      setPref((prev) => {
        const ordem = mergeOrder(prev.order);
        const i = ordem.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ordem.length) return prev;
        [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
        return { ...prev, order: ordem };
      });
    },
    [setPref],
  );

  const reset = useCallback(() => setPref(PREF_PADRAO), [setPref]);

  return {
    visible,
    hidden: pref.hidden,
    order: disponiveis.map((w) => w.id),
    toggle,
    move,
    reset,
  };
}
