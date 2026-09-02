import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { celebrate } from "@/components/ui/celebration";
import { usePreference } from "@/hooks/use-preference";
import { cn } from "@/lib/utils";
import {
  METAS_CHAVES,
  ROTULOS,
  metasRecemBatidas,
  progressoDasMetas,
  type MetaChave,
  type MetaDia,
  type Progresso,
  type RealizadoDia,
} from "@/features/metas-dia/metas-dia";
import {
  CalendarCheck,
  CaretDown,
  CaretUp,
  FileText,
  PencilSimple,
  Target,
  Trophy,
} from "@phosphor-icons/react";

const ICONE: Record<MetaChave, typeof Target> = {
  agendamentos: CalendarCheck,
  documentacoes: FileText,
  vendas_semana: Trophy,
};

export const PREF_CARD_RECOLHIDO = "metas-dia:recolhido";

function chaveCelebrado(uid: string, dia: string) {
  return `smq:metas-dia:celebrado:${uid}:${dia}`;
}

function lerCelebrados(uid: string, dia: string): Set<MetaChave> {
  try {
    const raw = localStorage.getItem(chaveCelebrado(uid, dia));
    return new Set(raw ? (JSON.parse(raw) as MetaChave[]) : []);
  } catch {
    return new Set();
  }
}

function gravarCelebrados(uid: string, dia: string, s: Set<MetaChave>) {
  try {
    localStorage.setItem(chaveCelebrado(uid, dia), JSON.stringify(Array.from(s)));
  } catch {
    /* modo privado */
  }
}

/**
 * Card flutuante com o progresso das três metas declaradas. Sobrevive à
 * navegação (montado no shell), fica no canto inferior ESQUERDO para não
 * brigar com a Sami, a chamada ativa (direita) nem o HUD do Sprint (centro).
 * No mobile vira uma pílula acima do BottomNav. Recolhido/expandido é
 * preferência do usuário (sincronizada entre aparelhos).
 */
export function MetasDiaCard({
  uid,
  dia,
  meta,
  realizado,
  onEditar,
}: {
  uid: string;
  dia: string;
  meta: MetaDia;
  realizado: RealizadoDia | undefined;
  onEditar: () => void;
}) {
  const [recolhido, setRecolhido] = usePreference<boolean>(PREF_CARD_RECOLHIDO, false);
  const prog = realizado ? progressoDasMetas(meta, realizado) : null;

  // Confete UMA vez por meta por dia, e só na TRANSIÇÃO para 100% dentro da
  // sessão — quem abre o CRM com a meta já batida não ganha confete de novo.
  const anteriorRef = useRef<Record<MetaChave, Progresso> | null>(null);
  useEffect(() => {
    if (!prog) return;
    const novas = metasRecemBatidas(anteriorRef.current, prog);
    anteriorRef.current = prog;
    if (novas.length === 0) return;
    const celebrados = lerCelebrados(uid, dia);
    const ineditas = novas.filter((k) => !celebrados.has(k));
    if (ineditas.length === 0) return;
    ineditas.forEach((k) => celebrados.add(k));
    gravarCelebrados(uid, dia, celebrados);
    celebrate("meta");
  }, [prog, uid, dia]);

  const visiveis = METAS_CHAVES.filter((k) => (prog?.[k].meta ?? 0) > 0);
  const batidas = prog ? visiveis.filter((k) => prog[k].batida).length : 0;
  const todasBatidas = visiveis.length > 0 && batidas === visiveis.length;

  return (
    <aside
      aria-label="Progresso das metas de hoje"
      className={cn(
        "glass-panel fixed z-30 rounded-xl shadow-elev-3 transition-all",
        // mobile: acima do BottomNav; desktop: canto inferior esquerdo
        "bottom-20 left-2 right-2 md:bottom-6 md:left-6 md:right-auto md:w-72",
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <Target
          className={cn("h-4 w-4 shrink-0", todasBatidas ? "text-success" : "text-primary")}
        />
        <span className="font-display min-w-0 flex-1 truncate text-sm font-semibold">
          Metas de hoje
          {prog && visiveis.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
              {batidas}/{visiveis.length}
            </span>
          )}
        </span>
        {recolhido && prog && (
          // Pílula: mini-resumo quando recolhido.
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
            {visiveis.map((k) => {
              const Icon = ICONE[k];
              return (
                <span key={k} className="inline-flex items-center gap-0.5" title={ROTULOS[k].curto}>
                  <Icon className="h-3 w-3" />
                  {prog[k].realizado}/{prog[k].meta}
                </span>
              );
            })}
          </span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-label="Ajustar metas de hoje"
          title="Ajustar metas de hoje"
          onClick={onEditar}
        >
          <PencilSimple className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          aria-expanded={!recolhido}
          aria-label={recolhido ? "Expandir metas" : "Recolher metas"}
          onClick={() => setRecolhido((v) => !v)}
        >
          {recolhido ? <CaretUp className="h-4 w-4" /> : <CaretDown className="h-4 w-4" />}
        </Button>
      </header>

      {!recolhido && (
        <div className="space-y-2.5 px-3 pb-3">
          {visiveis.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhuma meta acima de zero hoje. Ajuste pelo lápis.
            </p>
          )}
          {visiveis.map((k) => {
            const Icon = ICONE[k];
            const p = prog![k];
            const pendentes = k === "vendas_semana" ? (realizado?.vendas_pendentes ?? 0) : 0;
            return (
              <div key={k}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {ROTULOS[k].curto}
                  </span>
                  <span className="font-display font-semibold tabular-nums">
                    {p.realizado}
                    <span className="font-normal text-muted-foreground">/{p.meta}</span>
                    {pendentes > 0 && (
                      <span
                        className="ml-1 font-normal text-warning"
                        title="Vendas aguardando aprovação da gestão"
                      >
                        ({pendentes} pend.)
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${ROTULOS[k].curto}: ${p.pct}% da meta`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.pct}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      p.batida ? "bg-success" : "bg-gradient-gold",
                    )}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
