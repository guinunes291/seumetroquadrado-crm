// Hub de Desempenho (/ranking) — a TV do time e o painel de acompanhamento.
//
// Três visões: Real x Meta (mês contra a meta), Vendas (VGV do período) e
// Produtividade (pontuação de atividade). Modo TV: tela cheia, subárvore
// escura sobre o gradiente navy da marca, rotação automática das visões e
// letreiro de vendas — para a TV do escritório. Fora dele, a página segue o
// tema do CRM (claro por padrão) e a faixa de marca navy é o hero.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowsIn,
  ArrowsOut,
  CalendarBlank,
  CaretDown,
  Pause,
  Play,
  Pulse,
  Target,
  Trophy,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { PERIODO_LABELS, agoraSaoPaulo, type PeriodoOption } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import {
  MESES_CURTOS,
  agregarMetas,
  classificar,
  escopoDe,
  itensTicker,
  mapaDePosicoes,
  metaPrincipal,
  mudancasDePosicao,
  opcoesDeMes,
  pesosDeConfig,
  posicaoDoMes,
  somarTotais,
} from "./ranking-derive";
import { RankingProdutividade } from "./ranking-produtividade";
import { RankingRealXMeta } from "./ranking-real-x-meta";
import { RankingVendas } from "./ranking-vendas";
import {
  AvisoAtualizacao,
  AvisoTruncado,
  HeroDesempenho,
  MetaAtingidaOverlay,
  TickerVendas,
} from "./ranking-ui";
import { RANKING_LIMITE, useRankingData } from "./use-ranking-data";

const VISOES = ["realxmeta", "vendas", "produtividade"] as const;
type Visao = (typeof VISOES)[number];

const VISAO_LABEL: Record<Visao, { label: string; icon: typeof Target }> = {
  realxmeta: { label: "Real x Meta", icon: Target },
  vendas: { label: "Vendas", icon: Trophy },
  produtividade: { label: "Produtividade", icon: Pulse },
};

const ROTACAO_MS = 30_000;
const REFRESH_MS = 5 * 60 * 1000;
const SETAS_MS = 10_000;

export function RankingPanel() {
  const { isAdmin, isSuperintendente, isGestor } = useUserRoles();
  const [visao, setVisao] = useState<Visao>("realxmeta");
  const [periodo, setPeriodo] = useState<PeriodoOption>("this_month");
  const [mesSel, setMesSel] = useState(() => {
    const d = agoraSaoPaulo();
    return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
  });
  // Enquanto ninguém escolheu um mês à mão, o Real x Meta segue o mês
  // corrente — inclusive numa TV ligada na virada do mês.
  const [mesManual, setMesManual] = useState(false);
  const [tv, setTv] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [celebrando, setCelebrando] = useState(false);
  const encerrarCelebracao = useCallback(() => setCelebrando(false), []);
  // Última leitura do atingimento por mês: a celebração é só para a VIRADA
  // (<100% → ≥100%) vista ao vivo no mês corrente — abrir um mês passado que
  // fechou em 110% não é conquista nova.
  const pctAnteriorRef = useRef<{ chave: string; pct: number } | null>(null);

  const dados = useRankingData({ periodo, ano: mesSel.ano, mes: mesSel.mes });
  const { rankingPeriodo, rankingMes, rankingMesAnterior, metas, hoje } = dados;

  useEffect(() => {
    if (mesManual) return;
    setMesSel((atual) => {
      const ano = hoje.getFullYear();
      const mes = hoje.getMonth() + 1;
      return atual.ano === ano && atual.mes === mes ? atual : { ano, mes };
    });
  }, [hoje, mesManual]);

  // ----- derivados (toda a matemática vive em ranking-derive.ts) -----
  const escopoCompleto = isAdmin || isSuperintendente;
  const escopoDeTime = escopoCompleto || isGestor;
  const totaisPeriodo = useMemo(() => somarTotais(rankingPeriodo), [rankingPeriodo]);
  const totaisMes = useMemo(() => somarTotais(rankingMes), [rankingMes]);
  const totaisMesAnterior = useMemo(() => somarTotais(rankingMesAnterior), [rankingMesAnterior]);
  const metaTotais = useMemo(
    () => agregarMetas(metas, escopoDe(rankingMes, escopoCompleto, escopoDeTime)),
    [metas, rankingMes, escopoCompleto, escopoDeTime],
  );
  const pesos = useMemo(() => pesosDeConfig(dados.pesosRows), [dados.pesosRows]);
  const periodoLabel = PERIODO_LABELS[periodo];
  // O letreiro fala do MESMO recorte que a visão aberta (mês do Real x Meta
  // ou período das outras visões) — nunca duas respostas na mesma tela.
  const tickerRotulo =
    visao === "realxmeta" ? `${MESES_CURTOS[mesSel.mes - 1]} ${mesSel.ano}` : periodoLabel;
  const ticker = useMemo(
    () => itensTicker(visao === "realxmeta" ? rankingMes : rankingPeriodo),
    [visao, rankingMes, rankingPeriodo],
  );

  // ----- setas de posição: só entre leituras do MESMO período -----
  const posicoesRef = useRef<{ chave: string; mapa: Map<string, number> }>({
    chave: "",
    mapa: new Map(),
  });
  const setasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mudancas, setMudancas] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const atual = mapaDePosicoes(classificar(rankingPeriodo, "pontos"));
    if (atual.size === 0) return;
    const mesmoPeriodo = posicoesRef.current.chave === dados.chavePeriodo;
    const anterior = mesmoPeriodo ? posicoesRef.current.mapa : new Map<string, number>();
    posicoesRef.current = { chave: dados.chavePeriodo, mapa: atual };
    const diff = mudancasDePosicao(anterior, atual);
    // Trocar de período apaga setas do período anterior; leitura igual à
    // anterior não mexe no timer que já está contando.
    if (diff.size === 0) {
      if (!mesmoPeriodo) setMudancas(new Map());
      return;
    }
    setMudancas(diff);
    if (setasTimerRef.current) clearTimeout(setasTimerRef.current);
    setasTimerRef.current = setTimeout(() => {
      setMudancas(new Map());
      setasTimerRef.current = null;
    }, SETAS_MS);
  }, [rankingPeriodo, dados.chavePeriodo]);
  useEffect(
    () => () => {
      if (setasTimerRef.current) clearTimeout(setasTimerRef.current);
    },
    [],
  );

  // ----- celebração: a meta do mês corrente foi batida AGORA -----
  // A mesma meta principal (vendas, ou VGV quando só ela existe) que o Real x
  // Meta mostra; uma leitura com erro não conta como "estava abaixo".
  const principal = useMemo(() => metaPrincipal(totaisMes, metaTotais), [totaisMes, metaTotais]);
  const pctPrincipal = principal.pct;
  useEffect(() => {
    if (dados.isLoading || dados.isError || !dados.temDados) return;
    const chave = `${mesSel.ano}-${mesSel.mes}`;
    const anterior = pctAnteriorRef.current;
    pctAnteriorRef.current = { chave, pct: pctPrincipal };
    if (posicaoDoMes(mesSel.ano, mesSel.mes, hoje) !== "atual") return;
    if (anterior && anterior.chave === chave && anterior.pct < 100 && pctPrincipal >= 100) {
      setCelebrando(true);
    }
  }, [pctPrincipal, mesSel, hoje, dados.isLoading, dados.isError, dados.temDados]);

  // ----- atualização -----
  const { refetchAll, isFetching } = dados;
  // O intervalo é criado uma vez e chama sempre o refetchAll do render mais
  // recente (via ref) — assim acompanha as consultas do período atual.
  const refetchRef = useRef(refetchAll);
  refetchRef.current = refetchAll;
  useEffect(() => {
    const t = setInterval(() => refetchRef.current(), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // ----- rotação automática das visões -----
  useEffect(() => {
    if (!autoRotate) return;
    const t = setInterval(() => {
      setVisao((v) => VISOES[(VISOES.indexOf(v) + 1) % VISOES.length]);
    }, ROTACAO_MS);
    return () => clearInterval(t);
  }, [autoRotate]);

  // ----- Modo TV (tela cheia) -----
  const alternarTv = useCallback(() => {
    if (tv) {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      setTv(false);
      return;
    }
    setTv(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }, [tv]);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Só o overlay sem fullscreen (fullscreen negado) precisa de Esc próprio;
      // Esc consumido por um menu (defaultPrevented) não sai do Modo TV.
      if (e.key !== "Escape" || e.defaultPrevented || document.fullscreenElement) return;
      setTv(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  // Overlay fixo aberto: a página por baixo não deve rolar junto com a roda do
  // mouse nem aparecer ao rolar no fim da lista.
  useEffect(() => {
    if (!tv) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [tv]);

  const opcoesMes = useMemo(() => opcoesDeMes(hoje, 24), [hoje]);

  const abas = (
    <Tabs
      value={visao}
      onValueChange={(v) => {
        setVisao(v as Visao);
        setAutoRotate(false);
      }}
    >
      <TabsList
        aria-label="Visões do desempenho"
        className="h-auto flex-wrap justify-start gap-1 bg-white/10 p-1 text-white/70"
      >
        {VISOES.map((v) => {
          const Icon = VISAO_LABEL[v].icon;
          return (
            <TabsTrigger
              key={v}
              value={v}
              className="min-h-9 gap-1.5 px-3 text-white/80 hover:text-white data-[state=active]:bg-white data-[state=active]:text-navy-900 data-[state=active]:shadow-elev-2"
            >
              <Icon className="h-4 w-4" weight={visao === v ? "fill" : "duotone"} />
              {VISAO_LABEL[v].label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );

  const botao =
    "border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white focus-visible:ring-gold-400 min-h-11 min-w-11 sm:min-h-8 sm:min-w-0";
  const acoes = (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn(botao, "gap-1.5", autoRotate && "bg-gold-400/20 border-gold-400/50")}
        onClick={() => setAutoRotate((v) => !v)}
        aria-pressed={autoRotate}
        title={autoRotate ? "Pausar rotação automática" : "Rotação automática das visões (30s)"}
      >
        {autoRotate ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        <span className="hidden sm:inline">{autoRotate ? "Pausar" : "Auto"}</span>
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={cn(botao, "sm:h-8 sm:w-8")}
        onClick={refetchAll}
        aria-label="Atualizar agora"
        title="Atualizar agora"
      >
        <ArrowClockwise className={cn("h-4 w-4", isFetching && "animate-spin")} />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn(botao, "gap-1.5")}
        onClick={alternarTv}
        aria-pressed={tv}
        title={tv ? "Sair do Modo TV" : "Modo TV (tela cheia)"}
      >
        {tv ? <ArrowsIn className="h-4 w-4" /> : <ArrowsOut className="h-4 w-4" />}
        <span className="hidden sm:inline">{tv ? "Sair" : "Modo TV"}</span>
      </Button>
    </>
  );

  // No Modo TV o menu é portalado para fora do overlay (z-[60], subárvore
  // dark): precisa ficar acima dele e escuro como ele.
  const menuTv = tv ? "dark z-[70]" : undefined;
  const filtro =
    visao === "realxmeta" ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 min-w-[160px] justify-between gap-2 sm:min-h-8"
            aria-label={`Mês do Real x Meta: ${MESES_CURTOS[mesSel.mes - 1]} ${mesSel.ano}`}
          >
            <span className="flex items-center gap-2">
              <CalendarBlank className="h-4 w-4" /> {MESES_CURTOS[mesSel.mes - 1]} {mesSel.ano}
            </span>
            <CaretDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn("max-h-80 w-52 overflow-y-auto", menuTv)}>
          <DropdownMenuRadioGroup
            value={`${mesSel.ano}-${mesSel.mes}`}
            onValueChange={(v) => {
              const [ano, mes] = v.split("-").map(Number);
              setMesSel({ ano, mes });
              // Escolher o próprio mês corrente não "prende" a TV nele: na
              // virada do mês ela continua seguindo o hoje de São Paulo.
              setMesManual(!(ano === hoje.getFullYear() && mes === hoje.getMonth() + 1));
            }}
          >
            {opcoesMes.map((o, i) => (
              <div key={`${o.ano}-${o.mes}`}>
                {(i === 0 || o.mes === 12) && (
                  <>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {o.ano}
                    </DropdownMenuLabel>
                  </>
                )}
                <DropdownMenuRadioItem value={`${o.ano}-${o.mes}`}>{o.label}</DropdownMenuRadioItem>
              </div>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 min-w-[180px] justify-between gap-2 sm:min-h-8"
            aria-label={`Período: ${periodoLabel}`}
          >
            <span className="flex items-center gap-2">
              <CalendarBlank className="h-4 w-4" /> {periodoLabel}
            </span>
            <CaretDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn("w-56", menuTv)}>
          <DropdownMenuRadioGroup
            value={periodo}
            onValueChange={(v) => setPeriodo(v as PeriodoOption)}
          >
            {(Object.entries(PERIODO_LABELS) as [PeriodoOption, string][]).map(([k, label]) => (
              <DropdownMenuRadioItem key={k} value={k}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const subtitulo =
    visao === "realxmeta"
      ? `Desempenho do time · ${MESES_CURTOS[mesSel.mes - 1]} ${mesSel.ano}`
      : `Desempenho do time · ${periodoLabel}`;

  const conteudo =
    dados.isError && !dados.temDados ? (
      <QueryErrorState
        title="Não foi possível carregar o desempenho."
        error={dados.error}
        onRetry={refetchAll}
      />
    ) : dados.isLoading ? (
      <div
        className="space-y-5"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Carregando o desempenho…"
      >
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    ) : visao === "realxmeta" ? (
      <RankingRealXMeta
        ano={mesSel.ano}
        mes={mesSel.mes}
        hoje={hoje}
        rankingMes={rankingMes}
        totaisMes={totaisMes}
        totaisMesAnterior={totaisMesAnterior}
        janelaAnterior={dados.janelaAnterior}
        metas={metas}
        metaTotais={metaTotais}
        calendario={dados.calendario}
        podeGerirMetas={isAdmin || isGestor || isSuperintendente}
      />
    ) : visao === "vendas" ? (
      <RankingVendas
        ranking={rankingPeriodo}
        totais={totaisPeriodo}
        periodoLabel={periodoLabel}
        loading={false}
      />
    ) : (
      <RankingProdutividade
        ranking={rankingPeriodo}
        totais={totaisPeriodo}
        pesos={pesos}
        mudancas={mudancas}
        periodoLabel={periodoLabel}
        loading={false}
      />
    );

  return (
    <div
      className={cn(
        tv &&
          "dark fixed inset-0 z-[60] overflow-y-auto bg-gradient-command text-foreground [color-scheme:dark]",
      )}
      data-tv={tv ? "" : undefined}
    >
      <MetaAtingidaOverlay show={celebrando} onDone={encerrarCelebracao} />
      <HeroDesempenho
        subtitulo={subtitulo}
        abas={abas}
        acoes={acoes}
        ultimaAtualizacao={dados.atualizadoEm}
        atualizando={isFetching}
        tv={tv}
      />
      <div
        className={cn("space-y-5", tv ? "mx-auto max-w-[1800px] px-4 py-5 pb-16 md:px-6" : "pt-5")}
      >
        <div className="flex flex-wrap items-center gap-2">{filtro}</div>
        {dados.isError && dados.temDados && <AvisoAtualizacao onRetry={refetchAll} />}
        {!dados.isError && dados.isErrorSecundario && (
          <AvisoAtualizacao
            mensagem="Fotos ou pesos da pontuação não carregaram; os números estão completos."
            onRetry={refetchAll}
          />
        )}
        {dados.truncado && <AvisoTruncado limite={RANKING_LIMITE} />}
        {conteudo}
      </div>
      {tv && <TickerVendas itens={ticker} rotulo={tickerRotulo} />}
    </div>
  );
}
