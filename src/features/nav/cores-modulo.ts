// Cor fixa por módulo (identidade v3). Arquivo puro, sem React.
//
// Nove tons com a MESMA saturação (chroma ≈ 0,10 em oklch) para parecerem uma
// família, não um arco-íris: dourado fica reservado à Central de Comando (o
// módulo de destaque), BI e Configurações usam neutros porque são consulta
// ocasional. Os valores vivem em styles.css (--modulo-*, claro e escuro); aqui
// só as classes utilitárias — literais para o Tailwind enxergá-las no build.
//
// A cor aparece no tile do portal, no cabeçalho da sidebar, no header da página
// e no badge de pendência. Nunca em texto corrido (regra do dourado, decisão 10).

export type CorModulo =
  | "central"
  | "prospeccao"
  | "atendimento"
  | "carteira"
  | "followup"
  | "projetos"
  | "financeiro"
  | "bi"
  | "config";

export type ClassesModulo = {
  /** Quadrado com fundo tintado + ícone na cor; a área interna do duotone
   *  herda a cor via --icon-duo (utilitário icon-duo). */
  tile: string;
  /** Texto/ícone na cor cheia (só em ícones e rótulos curtos, não em corpo). */
  text: string;
  /** Pílula de contagem (pendências). */
  pill: string;
  /** Fio de 2px (topo de card, coluna do kanban). */
  line: string;
};

const classes = (cor: CorModulo): ClassesModulo => ({
  tile: `icon-duo bg-modulo-${cor}/13 text-modulo-${cor} [--icon-duo:var(--color-modulo-${cor})]`,
  text: `text-modulo-${cor}`,
  pill: `bg-modulo-${cor}/15 text-modulo-${cor}`,
  line: `bg-modulo-${cor}`,
});

// Literais completos (um por módulo) — template string acima só documenta a
// forma; o Tailwind v4 precisa ver cada classe inteira no código-fonte.
export const CLASSES_MODULO: Record<CorModulo, ClassesModulo> = {
  central: {
    tile: "icon-duo bg-modulo-central/13 text-modulo-central [--icon-duo:var(--color-modulo-central)]",
    text: "text-modulo-central",
    pill: "bg-modulo-central/15 text-modulo-central",
    line: "bg-modulo-central",
  },
  prospeccao: {
    tile: "icon-duo bg-modulo-prospeccao/13 text-modulo-prospeccao [--icon-duo:var(--color-modulo-prospeccao)]",
    text: "text-modulo-prospeccao",
    pill: "bg-modulo-prospeccao/15 text-modulo-prospeccao",
    line: "bg-modulo-prospeccao",
  },
  atendimento: {
    tile: "icon-duo bg-modulo-atendimento/13 text-modulo-atendimento [--icon-duo:var(--color-modulo-atendimento)]",
    text: "text-modulo-atendimento",
    pill: "bg-modulo-atendimento/15 text-modulo-atendimento",
    line: "bg-modulo-atendimento",
  },
  carteira: {
    tile: "icon-duo bg-modulo-carteira/13 text-modulo-carteira [--icon-duo:var(--color-modulo-carteira)]",
    text: "text-modulo-carteira",
    pill: "bg-modulo-carteira/15 text-modulo-carteira",
    line: "bg-modulo-carteira",
  },
  followup: {
    tile: "icon-duo bg-modulo-followup/13 text-modulo-followup [--icon-duo:var(--color-modulo-followup)]",
    text: "text-modulo-followup",
    pill: "bg-modulo-followup/15 text-modulo-followup",
    line: "bg-modulo-followup",
  },
  projetos: {
    tile: "icon-duo bg-modulo-projetos/13 text-modulo-projetos [--icon-duo:var(--color-modulo-projetos)]",
    text: "text-modulo-projetos",
    pill: "bg-modulo-projetos/15 text-modulo-projetos",
    line: "bg-modulo-projetos",
  },
  financeiro: {
    tile: "icon-duo bg-modulo-financeiro/13 text-modulo-financeiro [--icon-duo:var(--color-modulo-financeiro)]",
    text: "text-modulo-financeiro",
    pill: "bg-modulo-financeiro/15 text-modulo-financeiro",
    line: "bg-modulo-financeiro",
  },
  bi: {
    tile: "icon-duo bg-modulo-bi/13 text-modulo-bi [--icon-duo:var(--color-modulo-bi)]",
    text: "text-modulo-bi",
    pill: "bg-modulo-bi/15 text-modulo-bi",
    line: "bg-modulo-bi",
  },
  config: {
    tile: "icon-duo bg-modulo-config/13 text-modulo-config [--icon-duo:var(--color-modulo-config)]",
    text: "text-modulo-config",
    pill: "bg-modulo-config/15 text-modulo-config",
    line: "bg-modulo-config",
  },
};

/** Garante que os literais acima seguem a forma documentada (teste). */
export function classesEsperadas(cor: CorModulo): ClassesModulo {
  return classes(cor);
}
