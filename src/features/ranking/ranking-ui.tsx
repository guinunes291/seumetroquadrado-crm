// Peças visuais do hub de Desempenho — identidade SMQ (navy + dourado, Sora
// nos números, Phosphor duotone). Só apresentação: os números chegam prontos
// de ranking-derive.ts. Tudo usa tokens do tema, então a mesma peça funciona
// no tema claro (padrão do CRM) e no Modo TV (subárvore `dark`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Trophy, type Icon as IconComponent } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { celebrate } from "@/components/ui/celebration";
import { EmptyState } from "@/components/ui/empty-state";
import { Medal } from "@/features/ranking/medal";
import { INTENT_BADGE, type Intent } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import {
  CHAVES_PESO,
  fmtBRL,
  fmtBRLCompacto,
  formatNum,
  iniciais,
  intentDaTaxa,
  type CriterioRanking,
  type EtapaFunil,
  type Heat,
  type ParcelaPontos,
  type Pesos,
  type RankRowPosicionada,
} from "./ranking-derive";

// ---------------------------------------------------------------------------
// Hero de marca
// ---------------------------------------------------------------------------

/** O relógio da TV é o da operação (São Paulo), o mesmo dos dados. */
const FUSO = "America/Sao_Paulo";

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Relógio da TV — Sora tabular, atualiza a cada segundo. */
export function RelogioAoVivo({ className }: { className?: string }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("text-right", className)}>
      <div className="font-display text-2xl font-semibold leading-none tabular-nums text-white">
        {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO })}
        <span className="text-base text-white/50">
          :{agora.toLocaleTimeString("pt-BR", { second: "2-digit", timeZone: FUSO })}
        </span>
      </div>
      <div className="mt-1 text-xs text-white/60">
        {primeiraMaiuscula(
          agora.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            timeZone: FUSO,
          }),
        )}
      </div>
    </div>
  );
}

/**
 * Faixa navy com a marca: logo, nome da empresa, "ao vivo" em dourado, relógio
 * e os controles. É o único bloco sempre escuro fora do Modo TV — a assinatura
 * visual da página, no mesmo gradiente do shell (bg-gradient-command).
 */
export function HeroDesempenho({
  subtitulo,
  abas,
  acoes,
  ultimaAtualizacao,
  atualizando,
  tv,
}: {
  subtitulo: string;
  abas: ReactNode;
  acoes: ReactNode;
  ultimaAtualizacao: Date | null;
  atualizando: boolean;
  tv: boolean;
}) {
  return (
    <header
      className={cn(
        "relative overflow-hidden bg-gradient-command text-white",
        tv ? "rounded-none border-b border-white/10" : "rounded-2xl shadow-elev-2",
      )}
    >
      {/* Luz dourada de canto — a mesma do shell, só que visível na faixa. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-gold-400/15 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-elev-2 md:h-14 md:w-14">
              <img
                src="/icons/icon-192.png"
                alt=""
                width={56}
                height={56}
                className="h-full w-full rounded-lg object-contain"
              />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-lg font-semibold leading-tight tracking-tight md:text-2xl">
                  Seu Metro Quadrado
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-400/10 px-2 py-0.5 text-xs font-semibold text-white/90">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-300 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-300" />
                  </span>
                  Ao vivo
                </span>
              </div>
              <p className="truncate text-sm text-white/70">{subtitulo}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <RelogioAoVivo className="hidden lg:block" />
            <div className="flex items-center gap-1.5">{acoes}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {abas}
          <span className="text-xs text-white/50 tabular-nums">
            {atualizando
              ? "Atualizando…"
              : ultimaAtualizacao
                ? `Atualizado às ${ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO })}`
                : ""}
          </span>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Painel (seção) e avatar
// ---------------------------------------------------------------------------

export function Painel({
  titulo,
  icone: Icon,
  descricao,
  acao,
  className,
  children,
}: {
  titulo: string;
  icone?: IconComponent;
  descricao?: ReactNode;
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border-subtle bg-card p-4 text-card-foreground shadow-elev-1 md:p-5",
        className,
      )}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="icon-duo flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [--icon-duo:var(--color-gold)] [--icon-duo-opacity:0.45]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-display line-clamp-2 text-base font-semibold leading-tight tracking-tight">
              {titulo}
            </h2>
            {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
          </div>
        </div>
        {acao && <div className="flex shrink-0 items-center gap-2 text-xs sm:pt-1.5">{acao}</div>}
      </div>
      {children}
    </section>
  );
}

export function AvatarCorretor({
  nome,
  foto,
  className,
}: {
  nome: string;
  foto: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {foto && <AvatarImage src={foto} alt="" />}
      <AvatarFallback className="bg-navy-800 text-[11px] font-semibold text-gold-100">
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

// ---------------------------------------------------------------------------
// Meta: anel e barra
// ---------------------------------------------------------------------------

/** Tom semântico do atingimento — para textos (gap, projeção), não para preenchimentos. */
function intentDoPct(pct: number): Intent {
  if (pct >= 100) return "success";
  if (pct >= 75) return "info";
  if (pct >= 50) return "warning";
  return "danger";
}

/**
 * Preenchimento do anel/barra: dourado enquanto a meta está a caminho, verde
 * ao bater. O dourado é o acento reservado a "anel de meta" na identidade v3;
 * os tons de alerta ficam nos números (gap, projeção), que dizem se o ritmo
 * basta — uma barra vermelha no dia 3 do mês só desanima.
 */
function tomDoPreenchimento(pct: number, metaDefinida: boolean): "success" | "gold" | "neutral" {
  if (!metaDefinida) return "neutral";
  return pct >= 100 ? "success" : "gold";
}

const RING_STROKE: Record<"success" | "gold" | "neutral", string> = {
  success: "stroke-success",
  gold: "stroke-gold-500",
  neutral: "stroke-muted-foreground",
};

/**
 * Anel de meta (arco de 270°). Dourado enquanto está a caminho, verde ao
 * bater — o dourado é o acento reservado a "anel de meta" na identidade v3.
 */
export function AnelMeta({
  pct,
  metaDefinida,
  label,
  size = 176,
}: {
  pct: number;
  metaDefinida: boolean;
  label: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(pct, 100));
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const arco = c * 0.75;
  const cheio = arco * (clamped / 100);
  const tom = tomDoPreenchimento(pct, metaDefinida);
  return (
    <div
      role="img"
      aria-label={metaDefinida ? `${label}: ${pct.toFixed(1)}%` : "Meta não definida"}
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full rotate-[135deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arco} ${c}`}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${cheio} ${c}`}
          className={cn(
            "transition-[stroke-dasharray] duration-700 motion-reduce:transition-none",
            RING_STROKE[tom],
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {metaDefinida ? (
          <>
            <span className="font-display text-4xl font-semibold tabular-nums">
              <AnimatedNumber value={pct} format={(n) => n.toFixed(1)} />%
            </span>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </>
        ) : (
          <>
            <span className="font-display text-3xl font-semibold text-muted-foreground">—</span>
            <span className="px-4 text-center text-xs text-muted-foreground">
              Meta não definida
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const BARRA_FILL: Record<"success" | "gold" | "neutral", string> = {
  success: "bg-success",
  gold: "bg-gradient-gold",
  neutral: "bg-muted-foreground/40",
};

/** Barra de progresso da meta com marcos de 25/50/75/100%. */
export function BarraMeta({
  realizado,
  meta,
  unidade,
  formatar = formatNum,
}: {
  realizado: number;
  meta: number;
  unidade: string;
  formatar?: (n: number) => string;
}) {
  const pct = meta > 0 ? (realizado / meta) * 100 : 0;
  const tom = tomDoPreenchimento(pct, meta > 0);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums">
          {meta > 0 ? (
            <>
              <AnimatedNumber value={pct} format={(n) => n.toFixed(1)} />%
              <span className="ml-2 text-sm font-medium text-muted-foreground">da meta</span>
            </>
          ) : (
            <span className="text-base font-medium text-muted-foreground">Meta não definida</span>
          )}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">{formatar(realizado)}</span>
          {meta > 0 ? ` de ${formatar(meta)} ${unidade}` : ` ${unidade}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(pct, 100))}
        aria-label={`${unidade}: ${pct.toFixed(1)}% da meta`}
        className="relative h-3 overflow-visible rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none",
            BARRA_FILL[tom],
            pct >= 100 && "shadow-[0_0_16px_-2px_var(--color-success)]",
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {[25, 50, 75].map((m) => (
          <span
            key={m}
            aria-hidden="true"
            className="absolute top-0 h-full w-px bg-background/70"
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        {[0, 25, 50, 75, 100].map((m) => (
          <span key={m} className={cn(meta > 0 && pct >= m && "font-semibold text-foreground")}>
            {m}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista de ranking
// ---------------------------------------------------------------------------

function valorDo(r: RankRowPosicionada, criterio: CriterioRanking): number {
  return criterio === "vgv" ? r.vgv : criterio === "vendas" ? r.vendas : r.pontos;
}

function textoDo(r: RankRowPosicionada, criterio: CriterioRanking): string {
  return criterio === "vgv" ? fmtBRL(r.vgv) : formatNum(valorDo(r, criterio));
}

function legendaDo(r: RankRowPosicionada, criterio: CriterioRanking): string | null {
  if (criterio === "vgv" || criterio === "vendas") {
    return criterio === "vgv"
      ? `${formatNum(r.vendas)} ${r.vendas === 1 ? "venda" : "vendas"}`
      : r.vgv > 0
        ? fmtBRL(r.vgv)
        : null;
  }
  return r.vendas > 0 ? `${formatNum(r.vendas)} ${r.vendas === 1 ? "venda" : "vendas"}` : null;
}

/**
 * Lista vertical do ranking: medalha nos três primeiros, barra proporcional ao
 * líder (dourada só nele), seta de subida/queda quando houver leitura anterior.
 */
export function ListaRanking({
  rows,
  criterio,
  mudancas,
  max = 15,
  vazio,
}: {
  rows: RankRowPosicionada[];
  criterio: CriterioRanking;
  mudancas?: Map<string, number>;
  max?: number;
  vazio: ReactNode;
}) {
  const visiveis = rows.slice(0, max);
  if (visiveis.length === 0) return <>{vazio}</>;
  const topo = Math.max(valorDo(visiveis[0], criterio), 1);
  return (
    <ol className="stagger-children space-y-1" aria-label="Classificação">
      {visiveis.map((r) => {
        const delta = mudancas?.get(r.corretorId) ?? 0;
        const largura = Math.max((valorDo(r, criterio) / topo) * 100, 3);
        const legenda = legendaDo(r, criterio);
        return (
          <li
            key={r.corretorId}
            className={cn(
              "relative overflow-hidden rounded-lg px-2 py-1.5",
              r.pos <= 3 ? "bg-primary/5" : "hover:bg-muted/60",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex w-8 shrink-0 items-center justify-center">
                {r.pos <= 3 ? (
                  <Medal
                    tier={r.pos === 1 ? "ouro" : r.pos === 2 ? "prata" : "bronze"}
                    size="sm"
                    title={`${r.pos}º lugar`}
                  >
                    {r.pos}
                  </Medal>
                ) : (
                  <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                    {r.pos}º
                  </span>
                )}
              </span>
              <AvatarCorretor nome={r.nome} foto={r.foto} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{r.nome}</span>
                  {delta !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center text-[11px] font-semibold tabular-nums",
                        delta > 0 ? "text-success" : "text-destructive",
                      )}
                      title={delta > 0 ? `Subiu ${delta}` : `Caiu ${-delta}`}
                    >
                      {delta > 0 ? (
                        <ArrowUp className="h-3 w-3" weight="bold" />
                      ) : (
                        <ArrowDown className="h-3 w-3" weight="bold" />
                      )}
                      {Math.abs(delta)}
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none",
                      r.pos === 1 ? "bg-gradient-gold" : "bg-navy-400/60 dark:bg-navy-300/50",
                    )}
                    style={{ width: `${largura}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-sm font-semibold tabular-nums">
                  {textoDo(r, criterio)}
                </div>
                {legenda && (
                  <div className="text-[11px] text-muted-foreground tabular-nums">{legenda}</div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Funil
// ---------------------------------------------------------------------------

const FUNIL_BAR: Record<EtapaFunil["chave"], string> = {
  leads: "bg-navy-700 dark:bg-navy-300/70",
  agendamentos: "bg-navy-600 dark:bg-navy-300/55",
  visitas: "bg-navy-500 dark:bg-navy-300/40",
  vendas: "bg-gradient-gold",
};

export function FunilConversao({ etapas }: { etapas: EtapaFunil[] }) {
  return (
    <ol className="space-y-3" aria-label="Funil de conversão">
      {etapas.map((e) => {
        const intent = intentDaTaxa(e.taxa);
        return (
          <li key={e.chave}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{e.label}</span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="font-display font-semibold">{formatNum(e.valor)}</span>
                {e.taxa !== null && (
                  <Badge
                    variant="outline"
                    className={cn("border-transparent", INTENT_BADGE[intent])}
                  >
                    {e.taxa}%
                  </Badge>
                )}
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded-md bg-muted">
              <div
                className={cn(
                  "h-full rounded-md transition-[width] duration-700 motion-reduce:transition-none",
                  FUNIL_BAR[e.chave],
                )}
                style={{ width: `${e.largura}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Pontuação: legenda, composição, heat
// ---------------------------------------------------------------------------

export const HEAT_CLASSES: Record<Heat, string> = {
  alto: "bg-success/15 text-success font-semibold",
  medio: "bg-info/10 text-info font-medium",
  baixo: "bg-warning/12 text-warning",
  zero: "text-muted-foreground",
};

export function HeatCell({ value, heat }: { value: number; heat: Heat }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 tabular-nums",
        HEAT_CLASSES[heat],
      )}
    >
      {value > 0 ? formatNum(value) : "—"}
    </span>
  );
}

/** "Como pontua": os pesos vigentes, lidos do banco — nunca uma tabela decorada à mão. */
export function LegendaPontuacao({ pesos, divergem }: { pesos: Pesos | null; divergem: boolean }) {
  if (!pesos) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHAVES_PESO.map((chave) => (
        <span
          key={chave}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-muted/50 px-2 py-1 text-xs",
            pesos[chave] === 0 && "opacity-50 line-through",
          )}
        >
          <span className={cn("h-2 w-2 rounded-sm", COR_PARCELA[chave])} aria-hidden="true" />
          <span className="text-muted-foreground">{PESO_LABEL_CURTO[chave]}</span>
          <span className="font-semibold tabular-nums">
            {formatNum(pesos[chave])} {pesos[chave] === 1 ? "pt" : "pts"}
          </span>
        </span>
      ))}
      {divergem && (
        <span className="text-xs text-warning">
          O total oficial e a decomposição por atividade não batem: a leitura pode estar
          desatualizada (recarregue) ou o histórico ainda não foi recalculado com os pesos atuais.
        </span>
      )}
    </div>
  );
}

const PESO_LABEL_CURTO: Record<ParcelaPontos["chave"], string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  agendamento: "Agendamento",
  visita: "Visita",
  documentacao: "Documentação",
  venda: "Venda",
};

/** Cores por parcela: escala navy do frio ao quente; venda em dourado. */
const COR_PARCELA: Record<ParcelaPontos["chave"], string> = {
  ligacao: "bg-navy-300",
  whatsapp: "bg-navy-400",
  agendamento: "bg-navy-500",
  visita: "bg-navy-600 dark:bg-navy-200",
  documentacao: "bg-navy-800 dark:bg-navy-100",
  venda: "bg-gradient-gold",
};

/** Barra empilhada: quanto de cada atividade compõe a pontuação. */
export function BarraComposicao({
  parcelas,
  total,
  largura,
}: {
  parcelas: ParcelaPontos[];
  total: number;
  /** Largura relativa ao líder (0–100). */
  largura: number;
}) {
  const soma = Math.max(
    parcelas.reduce((s, p) => s + p.pontos, 0),
    1,
  );
  return (
    <div
      className="flex h-3 overflow-hidden rounded-full bg-muted"
      style={{ width: `${Math.max(largura, 4)}%` }}
      role="img"
      aria-label={parcelas
        .filter((p) => p.pontos > 0)
        .map((p) => `${p.label}: ${formatNum(p.pontos)} pts`)
        .join(", ")}
      title={`${formatNum(total)} pts`}
    >
      {parcelas
        .filter((p) => p.pontos > 0)
        .map((p) => (
          <span
            key={p.chave}
            className={cn("h-full", COR_PARCELA[p.chave])}
            style={{ width: `${(p.pontos / soma) * 100}%` }}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticker e celebração (Modo TV)
// ---------------------------------------------------------------------------

export function TickerVendas({ itens, rotulo }: { itens: string[]; rotulo: string }) {
  if (itens.length === 0) return null;
  const comRotulo = [`Vendas · ${rotulo}`, ...itens];
  const dobrado = [...comRotulo, ...comRotulo];
  return (
    <div
      aria-hidden="true"
      className="fixed bottom-0 left-0 right-0 z-40 overflow-hidden border-t border-white/10 bg-navy-950/90 py-2 backdrop-blur-sm"
    >
      <div
        className="flex w-max gap-12 whitespace-nowrap"
        style={{ animation: "smq-ticker 45s linear infinite" }}
      >
        {dobrado.map((item, i) => (
          <span
            key={i}
            className="inline-flex shrink-0 items-center gap-2 px-2 text-sm text-white/85"
          >
            <Trophy className="h-4 w-4 text-gold-300" weight="fill" />
            {item}
          </span>
        ))}
      </div>
      <style>{`@keyframes smq-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } } @media (prefers-reduced-motion: reduce) { [style*="smq-ticker"] { animation: none !important } }`}</style>
    </div>
  );
}

/** Overlay de meta batida — dispara a celebração global e some sozinho. */
export function MetaAtingidaOverlay({ show, onDone }: { show: boolean; onDone: () => void }) {
  // onDone vive num ref: o efeito depende só de `show` — um re-render do
  // painel (refetch, rotação) não reinicia o timer nem dispara confete de novo.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (!show) return;
    celebrate("meta");
    const t = setTimeout(() => onDoneRef.current(), 5000);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 backdrop-blur-[2px]"
    >
      <div className="animate-count-pop motion-reduce:animate-none rounded-2xl border border-gold-400/40 bg-navy-900/90 px-10 py-8 text-center shadow-glow-gold">
        <Trophy className="mx-auto mb-3 h-12 w-12 text-gold-300" weight="fill" />
        <div className="font-display text-3xl font-semibold text-white md:text-5xl">
          Meta do mês batida
        </div>
        <div className="mt-2 text-base text-white/80">Parabéns ao time Seu Metro Quadrado.</div>
      </div>
    </div>
  );
}

/** Falha num refetch com dados em cache: avisa sem derrubar a tela. */
export function AvisoAtualizacao({
  onRetry,
  mensagem = "Não foi possível atualizar agora. Mostrando a última leitura.",
}: {
  onRetry: () => void;
  mensagem?: string;
}) {
  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      {mensagem}
      <button
        type="button"
        onClick={onRetry}
        className="font-medium underline underline-offset-4 hover:no-underline"
      >
        Tentar de novo
      </button>
    </p>
  );
}

/** O RPC devolve no máximo N corretores: acima disso, os totais da tela ficam parciais. */
export function AvisoTruncado({ limite }: { limite: number }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      O ranking mostra os {limite} primeiros corretores por pontuação. Totais, funil e meta do time
      desta tela somam só esses {limite}; quem ficou de fora não entra nas contas.
    </p>
  );
}

export function VazioRanking({
  titulo,
  descricao,
  icone,
}: {
  titulo: string;
  descricao: string;
  icone: IconComponent;
}) {
  return <EmptyState icon={icone} title={titulo} description={descricao} className="py-8" />;
}

// ---------------------------------------------------------------------------
// Pódio (adaptador para o componente compartilhado)
// ---------------------------------------------------------------------------

import type { PodiumEntry } from "@/features/ranking/podium";
import { primeiroNome } from "./ranking-derive";

/** Top 3 já classificado → entradas do Pódio hero. */
export function entradasPodio(
  rows: RankRowPosicionada[],
  criterio: CriterioRanking,
): PodiumEntry[] {
  return rows.slice(0, 3).map((r) => ({
    id: r.corretorId,
    posicao: (r.pos <= 3 ? r.pos : 3) as 1 | 2 | 3,
    nome: primeiroNome(r.nome),
    legenda: r.nome.trim().split(/\s+/).length > 1 ? r.nome : null,
    foto: r.foto,
    valor: criterio === "vgv" ? r.vgv : criterio === "vendas" ? r.vendas : r.pontos,
    valorTexto: criterio === "vgv" ? fmtBRLCompacto(r.vgv) : undefined,
    unidade:
      criterio === "vgv"
        ? "VGV"
        : criterio === "vendas"
          ? r.vendas === 1
            ? "venda"
            : "vendas"
          : "pts",
    detalhe:
      criterio === "pontos"
        ? r.vendas > 0
          ? `${formatNum(r.vendas)} ${r.vendas === 1 ? "venda" : "vendas"}`
          : null
        : criterio === "vgv"
          ? `${formatNum(r.vendas)} ${r.vendas === 1 ? "venda" : "vendas"}`
          : r.vgv > 0
            ? fmtBRLCompacto(r.vgv)
            : null,
  }));
}

/** Moldura navy do pódio: no tema claro é o bloco escuro da marca; no Modo TV a página já é navy. */
export function MolduraPodio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-gradient-command p-3 md:p-4 dark:bg-none dark:p-0">
      {children}
    </div>
  );
}
