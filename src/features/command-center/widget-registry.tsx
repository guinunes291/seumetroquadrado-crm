// Registro dos widgets da home (Central de Comando). Cada seção da /hoje é um
// widget; papel e escopo decidem quais aparecem, e a ORDEM É FIXA — definida
// aqui, por frequência de uso e custo do erro, não por preferência do usuário.
//
// A personalização (ocultar/reordenar) existiu e foi removida: ninguém no time
// chegou a usar, e os dois controles custavam espaço permanente no cabeçalho da
// tela mais aberta do sistema.

import { useMemo, type ComponentType } from "react";
import { useUserRoles, type AppRole } from "@/hooks/use-auth";
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
  roles?: AppRole[];
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
 * A ORDEM DESTA LISTA É A ORDEM NA TELA. Critério: o que decide a próxima ação
 * primeiro, o que só informa por último.
 *
 * A home tem duas caras, escolhidas pelo PAPEL (não mais por toggle): a visão
 * "operacao" é o cockpit de gestão e a visão "minha" é o dia do corretor.
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
    // Ritmo antes de atalhos: "dá para bater o mês?" muda a decisão do dia;
    // uma lista de links, não.
    id: "gestao-pacing",
    title: "Ritmo do mês",
    roles: ["admin", "gestor", "superintendente"],
    escopos: ["operacao"],
    size: "third",
    Component: GestaoPacingWidget,
  },
  {
    id: "gestao-atalhos",
    title: "Ferramentas de gestão",
    roles: ["admin", "gestor", "superintendente"],
    escopos: ["operacao"],
    size: "third",
    Component: GestaoAtalhosWidget,
  },
  // — Dia do corretor (visão minha) —
  {
    id: "nba",
    title: "Próxima melhor ação",
    escopos: ["minha"],
    size: "hero",
    Component: NbaWidget,
  },
  // Agenda antes das missões: compromisso tem hora marcada — é o item do dia
  // com maior custo de erro. Missão atrasada se recupera; visita perdida, não.
  { id: "hoje-agenda", title: "Agenda de hoje", size: "third", Component: HojeAgendaWidget },
  {
    id: "missoes",
    title: "Fila de missões",
    escopos: ["minha"],
    size: "third",
    Component: MissoesWidget,
  },
  {
    id: "tarefas",
    title: "Tarefas & follow-ups",
    escopos: ["minha"],
    size: "third",
    Component: TarefasWidget,
  },
  { id: "metas", title: "Metas do dia", escopos: ["minha"], size: "third", Component: MetasWidget },
  // — Leitura, não decisão: fecham a página nas duas visões —
  { id: "radar", title: "Radar de risco", size: "third", Component: RadarWidget },
  { id: "produtividade", title: "Produtividade", size: "full", Component: ProdutividadeWidget },
];

/**
 * Widgets que este usuário vê, na ordem fixa de HOME_WIDGETS.
 *
 * Papel e visão são os únicos filtros: o cockpit de gestão só existe na
 * operação (e só para papéis de gestão), e os widgets pessoais só na visão
 * "minha". Não há mais ocultar nem reordenar — se um bloco não serve à
 * decisão do usuário, o lugar de resolver isso é esta lista, não uma
 * preferência que cada um configura sozinho.
 */
export function useHomeWidgets(escopo: "minha" | "operacao"): WidgetDef[] {
  const { roles } = useUserRoles();

  return useMemo(
    () =>
      HOME_WIDGETS.filter(
        (w) =>
          (!w.roles || w.roles.some((r) => roles.includes(r))) &&
          (!w.escopos || w.escopos.some((e) => e === escopo)),
      ),
    [roles, escopo],
  );
}
