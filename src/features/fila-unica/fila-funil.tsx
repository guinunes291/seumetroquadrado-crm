// Funil das etapas na Fila Única — o desenho do mockup aprovado: degraus com
// largura pela raiz quadrada do volume, barra vermelha de parados 5+ dias, e
// no trilho lateral um marcador por divisa com a conversão atual → meta da
// casa. Ao lado, os vazamentos mais caros. Toda a conta é de funil-derive;
// aqui só desenho e estado de tela (recorte, aberto/fechado no celular).
//
// No celular o painel abre fechado: a fila vem primeiro, o funil é leitura.
// No desktop está sempre aberto.

import { useId, useState } from "react";
import { CaretDown, Info, Tray } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserRoles } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  geometriaDoDegrau,
  montarFunil,
  VAZAMENTO_COPY,
  type EtapaKey,
  type FunilLeitura,
  type FunilPassagem,
  type FunilRecorte,
  type FunilTom,
} from "@/features/fila-unica/funil-derive";
import { useFilaFunil } from "@/features/fila-unica/use-fila-funil";

const DIAS_SAFRA = 30;

/** Rampa do funil: do topo claro ao fundo cheio, na cor de informação (aço)
 *  — lê nos dois temas. Classes literais para o Tailwind enxergar. */
const RAMPA = [
  "bg-info/30",
  "bg-info/40",
  "bg-info/50",
  "bg-info/60",
  "bg-info/70",
  "bg-info/80",
  "bg-info/90",
  "bg-info",
  "bg-info",
];

const TOM_DOT: Record<FunilTom, string> = {
  good: "bg-success shadow-[0_0_6px_var(--color-success)]",
  warn: "bg-warning shadow-[0_0_6px_var(--color-warning)]",
  crit: "bg-destructive shadow-[0_0_6px_var(--color-destructive)]",
};
const TOM_TEXTO: Record<FunilTom, string> = {
  good: "text-success",
  warn: "text-warning",
  crit: "text-destructive",
};

// Celular: rótulo curto em até duas linhas (70 px: "Agendado" mede 68 px a
// 12 px semibold, quebra só entre palavras), trilho de 94 px para o marcador
// sem a bolinha (medido no Chromium a 390 px: 82 px no caso comum, 98 px em
// "100% → 100%" — o excedente cabe nos 6 px de vão sem tocar os dígitos) e
// coluna de números enxuta; a palavra "parados" só entra no desktop. Todo o
// texto auxiliar é text-xs: o piso de legibilidade da casa é 12 px.
const GRADE =
  "grid-cols-[70px_minmax(0,1fr)_94px_64px] gap-1.5 md:grid-cols-[150px_minmax(0,1fr)_132px_118px] md:gap-3";

const fmt = (n: number) => n.toLocaleString("pt-BR");

function Marcador({ p }: { p: FunilPassagem }) {
  const titulo =
    `${p.label}: ` +
    (p.atual === null ? (p.nota ?? "sem dado") : `${p.atual}% agora`) +
    ` · meta ${p.meta}% · ${p.fonte}`;
  // Um único texto acessível (com a origem da meta), focável pelo teclado; o
  // conteúdo visual fica fora da árvore de acessibilidade para não ler em dobro.
  return (
    <span
      role="img"
      aria-label={titulo}
      title={titulo}
      tabIndex={0}
      data-testid="funil-marcador"
      data-tom={p.tom ?? "none"}
      className={cn(
        "absolute left-1/2 top-full z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center whitespace-nowrap rounded-full border bg-card px-1 py-0.5 text-xs text-muted-foreground shadow-elev-2 md:px-2",
        p.tom === "crit" && "border-destructive/50",
      )}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-0.5 md:gap-1">
        {/* No celular o tom vai na cor do número (não há largura para a
            bolinha); no desktop, bolinha e cor. */}
        <i
          className={cn(
            "hidden h-1.5 w-1.5 shrink-0 rounded-full md:inline-block",
            p.tom ? TOM_DOT[p.tom] : "bg-muted-foreground",
          )}
        />
        <b
          className={cn("font-display font-semibold", p.tom ? TOM_TEXTO[p.tom] : "text-foreground")}
        >
          {p.atual === null ? "—" : `${p.atual}%`}
        </b>
        <span>→</span>
        <b className="font-display font-semibold text-foreground">{p.meta}%</b>
      </span>
    </span>
  );
}

type Realce = { realce: EtapaKey | null; onRealce: (k: EtapaKey | null) => void };

/** Legenda do mockup (desktop): o que cada cor diz, e o tamanho do recorte. */
function Legenda({ leitura }: { leitura: FunilLeitura }) {
  const item = "inline-flex items-center gap-1.5";
  return (
    <div className="mb-3 hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground md:flex">
      <span className={item}>
        <i aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-info/70" />
        leads na etapa
      </span>
      <span className={item}>
        <i aria-hidden="true" className="h-3 w-3 rounded-[3px] bg-destructive" />
        parados 5+ dias
      </span>
      <span className={item}>
        <i aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-success" />
        na meta
      </span>
      <span className={item}>
        <i aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-warning" />
        perto
      </span>
      <span className={item}>
        <i aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-destructive" />
        longe da meta
      </span>
      <span className="ml-auto">{fmt(leitura.total)} leads no recorte</span>
    </div>
  );
}

function Degraus({ leitura, realce, onRealce }: { leitura: FunilLeitura } & Realce) {
  const ultimo = leitura.etapas.length - 1;
  return (
    <div>
      <Legenda leitura={leitura} />
      <div className={cn("grid px-0 pb-1.5 text-xs text-muted-foreground", GRADE)}>
        <span />
        <span />
        <span className="whitespace-nowrap">atual → meta</span>
        <span className="whitespace-nowrap">
          leads<span className="hidden md:inline"> · parados</span>
        </span>
      </div>
      <div className="relative">
        {leitura.etapas.map((e, i) => {
          const g = geometriaDoDegrau(leitura.etapas, i);
          const passagem = leitura.passagens.find((p) => p.de === e.key);
          const vaza = e.pctParados !== null && e.pctParados >= 85;
          return (
            <Tooltip key={e.key}>
              <TooltipTrigger asChild>
                <div
                  data-testid="funil-etapa"
                  tabIndex={0}
                  onMouseEnter={() => onRealce(e.key)}
                  onMouseLeave={() => onRealce(null)}
                  onFocus={() => onRealce(e.key)}
                  onBlur={() => onRealce(null)}
                  className={cn(
                    "grid h-11 items-center rounded-md outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 md:h-12",
                    GRADE,
                  )}
                >
                  <div className="min-w-0 text-right">
                    <div
                      className={cn(
                        // Duas linhas também no desktop: "Aguardando atendimento" não
                        // cabe em 150 px a 13 px, e cortar com reticências esconde a
                        // etapa mais cheia do funil.
                        "line-clamp-2 text-xs font-semibold leading-tight md:text-[13px]",
                        // Etapa com 85%+ parados: o alerta vai no rótulo (um contorno
                        // no degrau some com o clip-path do trapézio).
                        vaza && "text-destructive",
                      )}
                    >
                      <span className="md:hidden">{e.labelCurto}</span>
                      <span className="hidden md:inline">{e.label}</span>
                    </div>
                    <div className="hidden truncate text-xs text-muted-foreground md:block">
                      {e.sub}
                    </div>
                  </div>
                  <div className="flex h-full items-stretch justify-center">
                    <div
                      className={cn(
                        "h-full transition-[width,clip-path,filter] duration-700 motion-reduce:transition-none",
                        RAMPA[Math.min(i, RAMPA.length - 1)],
                        // O degrau acende quando o cursor está na linha ou no card
                        // de vazamento correspondente (a ligação visual do mockup).
                        realce === e.key && "brightness-115 saturate-110",
                      )}
                      style={{ width: `${g.caixa * 100}%`, clipPath: g.clipPath }}
                    />
                  </div>
                  <div className="relative h-full">
                    {/* O trilho: uma linha fina por trás dos marcadores, do centro
                    da primeira divisa até a última etapa. */}
                    {i < ultimo && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-1/2 w-px bg-border",
                          i === 0 ? "top-1/2 bottom-0" : "inset-y-0",
                        )}
                      />
                    )}
                    {passagem && <Marcador p={passagem} />}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="font-display text-sm font-semibold leading-none tabular-nums md:text-[15px]">
                      {e.quantidade > 0 ? fmt(e.quantidade) : "—"}
                    </div>
                    {e.pctParados !== null ? (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-destructive/15">
                          <div
                            className="h-full rounded-full bg-destructive transition-[width] duration-700 motion-reduce:transition-none"
                            style={{ width: `${e.pctParados}%` }}
                          />
                        </div>
                        <div className="whitespace-nowrap text-xs leading-none text-muted-foreground">
                          <b className="font-semibold text-destructive">{e.pctParados}%</b>
                          <span className="hidden md:inline"> parados</span> · {fmt(e.parados)}
                        </div>
                      </>
                    ) : (
                      <div className="whitespace-nowrap text-xs leading-none text-muted-foreground">
                        {e.key === "venda" && leitura.recorte === "safra"
                          ? `ciclo > ${leitura.dias} d`
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="max-w-[260px] space-y-0.5">
                <div className="font-semibold">{e.label}</div>
                <div className="flex justify-between gap-4">
                  <span>leads</span>
                  <b className="font-display">{e.quantidade > 0 ? fmt(e.quantidade) : "—"}</b>
                </div>
                {e.pctParados !== null && (
                  <div className="flex justify-between gap-4">
                    <span>parados 5+ dias</span>
                    <b className="font-display">
                      {fmt(e.parados)} ({e.pctParados}%)
                    </b>
                  </div>
                )}
                {passagem && (
                  <div className="flex justify-between gap-4">
                    <span>{passagem.label}</span>
                    <b className="font-display">
                      {passagem.atual === null ? (passagem.nota ?? "—") : `${passagem.atual}%`} →{" "}
                      {passagem.meta}%
                    </b>
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="text-destructive">
          ↳
        </span>
        <span>
          Saída lateral:{" "}
          <b className="font-display text-sm font-semibold text-foreground">
            {fmt(leitura.perdidos)}
          </b>{" "}
          marcado(s) como perdido com motivo — a única porta de saída honesta do funil.
        </span>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{leitura.nota}</p>
    </div>
  );
}

function Vazamentos({ leitura, realce, onRealce }: { leitura: FunilLeitura } & Realce) {
  return (
    <aside className="flex flex-col gap-2.5">
      <h3 className="text-sm font-semibold">
        {leitura.vazamentos.length === 3
          ? "Os três vazamentos mais caros"
          : "Os vazamentos mais caros"}
      </h3>
      {leitura.vazamentos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum lead parado há 5 dias ou mais neste recorte.
        </p>
      ) : (
        leitura.vazamentos.map((v) => (
          <div
            key={v.key}
            data-testid="funil-vazamento"
            data-realce={realce === v.key || undefined}
            onMouseEnter={() => onRealce(v.key)}
            onMouseLeave={() => onRealce(null)}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-xl border border-border-subtle bg-muted/30 px-3 py-2.5 transition-[transform,border-color,background-color] motion-reduce:transition-none",
              realce === v.key && "translate-x-0.5 border-destructive/50 bg-destructive/5",
            )}
          >
            <div className="text-[13px] font-semibold">{v.label}</div>
            <div className="text-right font-display text-xl font-semibold leading-none text-destructive">
              {v.pctParados}%
              <small className="block font-sans text-xs font-normal leading-tight text-muted-foreground">
                parados · {fmt(v.parados)} de {fmt(v.quantidade)}
              </small>
            </div>
            <p className="col-span-2 text-xs leading-snug text-muted-foreground">
              {VAZAMENTO_COPY[v.key]}
            </p>
          </div>
        ))
      )}
      <div className="rounded-r-lg border-l-[3px] border-modulo-central bg-modulo-central/10 px-3 py-2 text-xs leading-snug text-muted-foreground">
        <b className="text-foreground">Por isso a Fila Única ordena pelo fundo.</b> Um lead em
        análise parado há 60 dias vale mais do que 200 leads frios novos: a lista põe quem está
        parado no fundo antes de qualquer lead que chegou ontem.
      </div>
    </aside>
  );
}

export function FilaFunil({
  className,
  id,
  corretorId = null,
}: {
  className?: string;
  id?: string;
  /** A gestão vendo a fila de um corretor: o funil dele, não o da operação. */
  corretorId?: string | null;
}) {
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const [recorte, setRecorte] = useState<FunilRecorte>("safra");
  const [aberto, setAberto] = useState(false);
  const [realce, setRealce] = useState<EtapaKey | null>(null);
  const corpoId = useId();
  const q = useFilaFunil(DIAS_SAFRA, corretorId);

  const leitura = q.data ? montarFunil(q.data, recorte, { dias: DIAS_SAFRA }) : null;
  const vazio = !!leitura && leitura.total === 0 && leitura.perdidos === 0;

  return (
    <section
      id={id}
      aria-label="Funil das etapas"
      className={cn(
        "scroll-mt-20 rounded-2xl border border-border-subtle bg-card text-card-foreground shadow-elev-1",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 p-3 md:p-4">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">
            {gestao && !corretorId ? "Onde os clientes somem" : "Onde os seus clientes somem"}
          </h2>
          <p className="hidden max-w-[62ch] text-xs text-muted-foreground md:block">
            {gestao && !corretorId ? "O funil da operação" : "O seu funil"}, pelo status atual. A
            largura de cada degrau segue a raiz quadrada do número de leads; a barra vermelha mostra
            quantos estão parados há 5 dias ou mais. No trilho, cada marcador fica na divisa entre
            duas etapas: conversão atual → meta da casa. Passe o mouse para ver a origem da meta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* No celular as abas só aparecem com o painel aberto — trocar o
              recorte com o funil fechado não mudaria nada na tela. Alvos de
              44 px abaixo de md (identidade v3, decisão 16). */}
          <div className={cn(!aberto && "hidden md:block")}>
            <Tabs value={recorte} onValueChange={(v) => setRecorte(v as FunilRecorte)}>
              <TabsList aria-label="Recorte do funil" className="h-11 md:h-8">
                <TabsTrigger value="safra" className="h-9 text-xs md:h-7">
                  Safra {DIAS_SAFRA} dias
                </TabsTrigger>
                <TabsTrigger value="base" className="h-9 text-xs md:h-7">
                  Base inteira
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 gap-1 px-3 text-sm md:hidden"
            aria-expanded={aberto}
            aria-controls={corpoId}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? "Ocultar" : "Ver funil"}
            <CaretDown className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")} />
          </Button>
        </div>
      </header>

      <div id={corpoId} className={cn("border-t", aberto ? "block" : "hidden md:block")}>
        {q.isPending ? (
          <div className="space-y-2 p-3 md:p-4">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : q.isError ? (
          <div className="p-3 md:p-4">
            <QueryErrorState
              title="Não foi possível montar o funil."
              error={q.error}
              onRetry={() => q.refetch()}
            />
          </div>
        ) : !leitura ? (
          <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground md:p-4">
            <Info className="h-4 w-4 shrink-0" />
            Sem dado: o funil ainda não está disponível neste ambiente.
          </p>
        ) : vazio ? (
          <p
            data-testid="funil-vazio"
            className="flex items-center gap-2 p-3 text-xs text-muted-foreground md:p-4"
          >
            <Tray className="h-4 w-4 shrink-0" />
            {leitura.recorte === "safra"
              ? `Nenhum lead criado nos últimos ${leitura.dias} dias. A base inteira está na outra aba.`
              : "Nenhum lead na carteira ainda."}
          </p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div className="grid gap-4 p-3 md:grid-cols-[1.55fr_1fr] md:gap-5 md:p-4">
              <Degraus leitura={leitura} realce={realce} onRealce={setRealce} />
              <Vazamentos leitura={leitura} realce={realce} onRealce={setRealce} />
            </div>
          </TooltipProvider>
        )}
      </div>
    </section>
  );
}
