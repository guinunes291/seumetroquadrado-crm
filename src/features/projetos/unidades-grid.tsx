// Mapa de disponibilidade das unidades — grade colorida por status, agrupada
// por bloco/andar quando os dados tiverem essa estrutura (senão, grade
// simples). O clique numa célula abre a MESMA edição de status inline da
// tabela: a mutation é compartilhada pela rota via `onChangeStatus`.

import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UNIDADE_STATUS_DOT,
  UNIDADE_STATUS_LABEL,
  formatBRL,
  type UnidadeStatus,
} from "@/lib/unidades";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

export type UnidadeRow = Tables<"unidades">;

export const UNIDADE_STATUS_OPCOES: UnidadeStatus[] = [
  "disponivel",
  "reservada",
  "vendida",
  "bloqueada",
];

// Tom da célula por status (Intent do design system): disponível=success,
// reservada=warning, vendida=neutra riscada, bloqueada=apagada/tracejada.
const CELL_TONE: Record<UnidadeStatus, string> = {
  disponivel: "border-success/40 bg-success/15 text-success",
  reservada: "border-warning/40 bg-warning/15 text-warning",
  vendida: "border-border-subtle bg-muted text-muted-foreground line-through",
  bloqueada: "border-dashed border-border bg-muted/40 text-muted-foreground/70",
};

const CELL_BASE =
  "flex h-9 items-center justify-center rounded-md border px-1.5 text-xs font-medium tabular-nums truncate";

type GrupoAndar = { andar: string | null; unidades: UnidadeRow[] };
type GrupoBloco = { bloco: string | null; andares: GrupoAndar[] };

// Agrupa por bloco → andar. Andar mais alto primeiro (leitura de prédio);
// chaves não numéricas caem depois, em ordem alfabética reversa estável.
function agrupar(unidades: UnidadeRow[]): { grupos: GrupoBloco[]; estruturado: boolean } {
  const temEstrutura = unidades.some((u) => u.bloco || u.andar);
  if (!temEstrutura) {
    return { grupos: [{ bloco: null, andares: [{ andar: null, unidades }] }], estruturado: false };
  }

  const porBloco = new Map<string, UnidadeRow[]>();
  for (const u of unidades) {
    const key = u.bloco ?? "";
    porBloco.set(key, [...(porBloco.get(key) ?? []), u]);
  }
  const blocos = [...porBloco.keys()].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );

  const grupos = blocos.map((bloco) => {
    const lista = porBloco.get(bloco) ?? [];
    const porAndar = new Map<string, UnidadeRow[]>();
    for (const u of lista) {
      const key = u.andar ?? "";
      porAndar.set(key, [...(porAndar.get(key) ?? []), u]);
    }
    const andares = [...porAndar.keys()].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb) && a !== "" && b !== "") return nb - na;
      return b.localeCompare(a, "pt-BR", { numeric: true });
    });
    return {
      bloco: bloco || null,
      andares: andares.map((andar) => ({
        andar: andar || null,
        unidades: porAndar.get(andar) ?? [],
      })),
    };
  });

  return { grupos, estruturado: true };
}

function tituloCelula(u: UnidadeRow): string {
  return [
    [u.bloco, u.andar].filter(Boolean).join(" / ") || null,
    u.tipologia,
    u.valor != null ? formatBRL(u.valor) : null,
    UNIDADE_STATUS_LABEL[u.status],
  ]
    .filter(Boolean)
    .join(" · ");
}

function Celula({
  unidade,
  canManage,
  onChangeStatus,
}: {
  unidade: UnidadeRow;
  canManage: boolean;
  onChangeStatus: (id: string, status: UnidadeStatus) => void;
}) {
  const tone = CELL_TONE[unidade.status];
  if (!canManage) {
    return (
      <div className={cn(CELL_BASE, tone)} title={tituloCelula(unidade)}>
        {unidade.identificador}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={tituloCelula(unidade)}
          aria-label={`${unidade.identificador} — ${UNIDADE_STATUS_LABEL[unidade.status]}; alterar status`}
          className={cn(CELL_BASE, tone, "hover-lift press-scale w-full cursor-pointer")}
        >
          {unidade.identificador}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {unidade.identificador} · {tituloCelula(unidade)}
        </DropdownMenuLabel>
        {UNIDADE_STATUS_OPCOES.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === unidade.status}
            onSelect={() => onChangeStatus(unidade.id, s)}
          >
            <span className={cn("mr-2 h-2 w-2 rounded-full", UNIDADE_STATUS_DOT[s])} />
            {UNIDADE_STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UnidadesGrid({
  unidades,
  loading,
  canManage,
  onChangeStatus,
  empty,
}: {
  unidades: UnidadeRow[];
  loading?: boolean;
  canManage: boolean;
  onChangeStatus: (id: string, status: UnidadeStatus) => void;
  empty?: React.ReactNode;
}) {
  const { grupos, estruturado } = useMemo(() => agrupar(unidades), [unidades]);
  const contagem = useMemo(() => {
    const out: Record<UnidadeStatus, number> = {
      disponivel: 0,
      reservada: 0,
      vendida: 0,
      bloqueada: 0,
    };
    for (const u of unidades) out[u.status] += 1;
    return out;
  }, [unidades]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-border-subtle bg-card p-4 shadow-elev-1"
        aria-busy="true"
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (unidades.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-4 shadow-elev-1">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border-subtle bg-card p-4 shadow-elev-1">
      {/* Legenda com contagem por status */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {UNIDADE_STATUS_OPCOES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded border", CELL_TONE[s])} aria-hidden="true" />
            {UNIDADE_STATUS_LABEL[s]}
            <span className="tabular-nums">({contagem[s]})</span>
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {grupos.map((grupo, gi) => (
          <div key={grupo.bloco ?? `g-${gi}`} className="space-y-2">
            {estruturado && (
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {grupo.bloco ? `Bloco ${grupo.bloco}` : "Sem bloco"}
              </div>
            )}
            <div className="space-y-1.5">
              {grupo.andares.map((linha, li) => (
                <div
                  key={linha.andar ?? `a-${li}`}
                  className={cn(estruturado && "grid grid-cols-[3.5rem_1fr] items-start gap-2")}
                >
                  {estruturado && (
                    <div
                      className="pt-2.5 text-right text-xs tabular-nums text-muted-foreground"
                      title={linha.andar ? `Andar ${linha.andar}` : undefined}
                    >
                      {linha.andar
                        ? Number.isFinite(Number(linha.andar))
                          ? `${linha.andar}º`
                          : linha.andar
                        : "—"}
                    </div>
                  )}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
                    {linha.unidades.map((u) => (
                      <Celula
                        key={u.id}
                        unidade={u}
                        canManage={canManage}
                        onChangeStatus={onChangeStatus}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
