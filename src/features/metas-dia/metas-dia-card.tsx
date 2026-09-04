import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  PhoneCall,
  Target,
  Trophy,
} from "@phosphor-icons/react";

const ICONE: Record<MetaChave, typeof Target> = {
  agendamentos: CalendarCheck,
  documentacoes: FileText,
  vendas_semana: Trophy,
};

export const PREF_CARD_RECOLHIDO = "metas-dia:recolhido";

/**
 * No mobile o card NÃO flutua: ele é portalado para este slot, que os layouts
 * (shell e hub) renderizam grudado logo abaixo do cabeçalho. Assim ocupa espaço
 * no fluxo da página e nunca cobre barras de ação, campos de resposta nem o
 * BottomNav — a faixa inferior é disputada demais no celular.
 */
export const METAS_DIA_SLOT_ID = "metas-dia-slot";

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

type Prog = Record<MetaChave, Progresso> | null;

function Resumo({ prog, visiveis }: { prog: Prog; visiveis: MetaChave[] }) {
  if (!prog) return null;
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
      {visiveis.map((k) => {
        const Icon = ICONE[k];
        return (
          <span
            key={k}
            className={cn("inline-flex items-center gap-0.5", prog[k].batida && "text-success")}
            title={ROTULOS[k].curto}
          >
            <Icon className="h-3 w-3" />
            {prog[k].realizado}/{prog[k].meta}
          </span>
        );
      })}
    </span>
  );
}

function Barras({
  prog,
  visiveis,
  realizado,
}: {
  prog: Prog;
  visiveis: MetaChave[];
  realizado: RealizadoDia | undefined;
}) {
  if (visiveis.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhuma meta acima de zero hoje. Ajuste pelo lápis.
      </p>
    );
  }
  return (
    <>
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
    </>
  );
}

/** "≈ N contatos para bater hoje" — some quando não há taxa ou tudo já foi batido. */
function Contatos({ n, todasBatidas }: { n: number | null | undefined; todasBatidas: boolean }) {
  if (n === null || n === undefined || n <= 0 || todasBatidas) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <PhoneCall className="h-3 w-3 text-primary" />
      <span>
        ≈ <span className="font-semibold tabular-nums text-foreground">{n} contatos</span> para
        bater hoje
      </span>
    </p>
  );
}

function Acoes({
  recolhido,
  onEditar,
  onToggle,
}: {
  recolhido: boolean;
  onEditar: () => void;
  onToggle: () => void;
}) {
  return (
    <>
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
        onClick={onToggle}
      >
        {recolhido ? <CaretDown className="h-4 w-4" /> : <CaretUp className="h-4 w-4" />}
      </Button>
    </>
  );
}

/**
 * Progresso das três metas declaradas, visível em todo o CRM.
 *  - Desktop: card flutuante no canto inferior ESQUERDO (não briga com a Sami,
 *    a chamada ativa à direita nem o HUD do Sprint ao centro).
 *  - Mobile: tira fina no fluxo da página, logo abaixo do cabeçalho (slot).
 * Recolhido/expandido é preferência do usuário (sincronizada entre aparelhos).
 */
export function MetasDiaCard({
  uid,
  dia,
  meta,
  realizado,
  contatosHoje,
  onEditar,
}: {
  uid: string;
  dia: string;
  meta: MetaDia;
  realizado: RealizadoDia | undefined;
  /** Contatos estimados para bater as metas de hoje (null = sem taxa). */
  contatosHoje?: number | null;
  onEditar: () => void;
}) {
  const [recolhido, setRecolhido] = usePreference<boolean>(PREF_CARD_RECOLHIDO, false);
  const prog: Prog = realizado ? progressoDasMetas(meta, realizado) : null;

  // Slot do mobile — renderizado pelo layout; procurado depois do mount.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(METAS_DIA_SLOT_ID));
  }, []);

  // Confete UMA vez por meta por dia, e só na TRANSIÇÃO para 100% dentro da
  // sessão — quem abre o CRM com a meta já batida não ganha confete de novo.
  const anteriorRef = useRef<Prog>(null);
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
  const toggle = () => setRecolhido((v) => !v);

  const titulo = (
    <>
      <Target className={cn("h-4 w-4 shrink-0", todasBatidas ? "text-success" : "text-primary")} />
      <span className="font-display min-w-0 flex-1 truncate text-sm font-semibold">
        Metas de hoje
        {prog && visiveis.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
            {batidas}/{visiveis.length}
          </span>
        )}
      </span>
    </>
  );

  const mobile = slot
    ? createPortal(
        <div
          aria-label="Progresso das metas de hoje"
          className="glass-panel rounded-none border-x-0 border-t-0 px-3 py-1.5 md:hidden"
          data-testid="metas-dia-tira"
        >
          <div className="flex items-center gap-2">
            {titulo}
            {recolhido && <Resumo prog={prog} visiveis={visiveis} />}
            <Acoes recolhido={recolhido} onEditar={onEditar} onToggle={toggle} />
          </div>
          {!recolhido && (
            <div className="space-y-2 pb-1 pt-1.5">
              <Barras prog={prog} visiveis={visiveis} realizado={realizado} />
              <Contatos n={contatosHoje} todasBatidas={todasBatidas} />
            </div>
          )}
        </div>,
        slot,
      )
    : null;

  return (
    <>
      {mobile}
      <aside
        aria-label="Progresso das metas de hoje"
        className="glass-panel fixed bottom-6 left-6 z-30 hidden w-72 rounded-xl shadow-elev-3 transition-all md:block"
        data-testid="metas-dia-card"
      >
        <header className="flex items-center gap-2 px-3 py-2">
          {titulo}
          {recolhido && <Resumo prog={prog} visiveis={visiveis} />}
          <Acoes recolhido={recolhido} onEditar={onEditar} onToggle={toggle} />
        </header>
        {!recolhido && (
          <div className="space-y-2.5 px-3 pb-3">
            <Barras prog={prog} visiveis={visiveis} realizado={realizado} />
            <Contatos n={contatosHoje} todasBatidas={todasBatidas} />
          </div>
        )}
      </aside>
    </>
  );
}
