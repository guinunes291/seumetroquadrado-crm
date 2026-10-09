import type { ReactNode } from "react";
import { useModuloAtual } from "@/features/nav/modulo-atual";

/** Eyebrow dourado em caixa alta — o "MÓDULO 01" do vídeo de lançamento.
 *  gold-700 no claro passa AA (4,6:1 sobre o fundo); no escuro, gold-400. */
const EYEBROW =
  "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-700 dark:text-gold-400";

/**
 * "Módulo 03" quando o título É o módulo; "Módulo 03 · Gestão de Carteira"
 * quando a página é uma seção dele (Kanban, Agenda…). O módulo vem do shell
 * (ModuloAtualProvider), pela mesma regra da sidebar e da trilha — então
 * nunca discorda delas. Fora do shell não há módulo e não há eyebrow.
 */
function EyebrowDoModulo({ titulo, contexto }: { titulo: string; contexto?: string }) {
  const modulo = useModuloAtual();
  if (!modulo) return null;
  const n = `Módulo ${String(modulo.numero).padStart(2, "0")}`;
  const rotulo = contexto
    ? `${n} · ${contexto}`
    : titulo === modulo.titulo
      ? n
      : `${n} · ${modulo.titulo}`;
  return <p className={EYEBROW}>{rotulo}</p>;
}

/**
 * Cabeçalho de página (identidade Lançamento, 2026-10): eyebrow com o número
 * do módulo, título grande em Sora, descrição e ações à direita.
 * `titleAddon` encosta chips no título (temperatura, etapa) — o dossiê usa
 * para dizer quem é o lead numa linha só. `contexto` troca o nome do módulo
 * no eyebrow por outra informação ("Módulo 01 · sexta-feira, 9 de outubro");
 * `eyebrow` troca o rótulo inteiro por outro texto, ou o desliga com `false`.
 */
export function PageHeader({
  title,
  titleAddon,
  description,
  actions,
  contexto,
  eyebrow,
}: {
  title: string;
  titleAddon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  contexto?: string;
  eyebrow?: ReactNode | false;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow === undefined ? (
          <EyebrowDoModulo titulo={title} contexto={contexto} />
        ) : eyebrow ? (
          <p className={EYEBROW}>{eyebrow}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl md:text-[2.25rem]">
            {title}
          </h1>
          {titleAddon}
        </div>
        {description && (
          <div className="mt-1.5 text-sm text-muted-foreground md:text-base">{description}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
