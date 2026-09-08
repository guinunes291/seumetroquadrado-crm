import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowClockwise,
  ArrowsOut,
  CaretLeft,
  CaretRight,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Television,
  Target,
  Trophy,
  Pulse,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useAurumTilt } from "./aurum-motion";
import { cn } from "@/lib/utils";
import { fmtBRLCompacto, MESES_LONGOS, opcoesDeMes } from "./ranking-derive";
import {
  classificacaoCompleta,
  classificarGestores,
  novasConquistas,
  participantes,
  roteiroTV,
  type Conquista,
  type RankingSnapshot,
  type TelaTV,
} from "./ranking-campeonato";
import { AnaliseCorretor, Classificacao, Foto, ProdutividadeCampeonato } from "./campeonato-views";
import { useHojeSaoPaulo, useRankingData } from "./use-ranking-data";
import { RankingRefinado } from "./ranking-refined-views";
import { RelogioAoVivo } from "./ranking-ui";
import "./ranking-campeonato.css";
import "./ranking-refined.css";

const LABELS: Record<TelaTV["tipo"], string> = {
  podio: "Vendas",
  corretores: "Corretores",
  gestores: "Gestores",
  metas: "Real x Meta",
  "produtividade-resumo": "Produtividade",
  produtividade: "Produtividade",
};
const VISOES = ["metas", "podio", "produtividade"] as const;
const ICONES = { metas: Target, podio: Trophy, produtividade: Pulse };
const INTERVALOS = [15, 25, 40, 60];

export function RankingPanel() {
  const hoje = useHojeSaoPaulo();
  const { user } = useAuth();
  const [mesManual, setMesManual] = useState<{ ano: number; mes: number } | null>(null);
  const mes = mesManual ?? { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  const query = useRankingData(mes);
  return (
    <RankingExperience
      snapshot={query.data}
      hoje={hoje}
      ano={mes.ano}
      mes={mes.mes}
      userKey={user?.id ?? "anon"}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.isError}
      onRefresh={() => {
        void query.refetch();
      }}
      onMonthChange={(ano, m) => {
        setMesManual(
          ano === hoje.getFullYear() && m === hoje.getMonth() + 1 ? null : { ano, mes: m },
        );
      }}
    />
  );
}

/** A mesma experiência recebe o snapshot real ou fixtures apenas no harness de revisão. */
export function RankingExperience({
  snapshot,
  hoje,
  ano,
  mes,
  userKey,
  loading,
  fetching,
  error,
  onRefresh,
  onMonthChange,
  preview = false,
}: {
  snapshot?: RankingSnapshot;
  hoje: Date;
  ano: number;
  mes: number;
  userKey: string;
  loading: boolean;
  fetching: boolean;
  error: boolean;
  onRefresh: () => void;
  onMonthChange: (ano: number, mes: number) => void;
  preview?: boolean;
}) {
  const [visao, setVisao] = useState<TelaTV["tipo"]>("metas");
  const [tv, setTv] = useState(false);
  const [auto, setAuto] = useState(false);
  const [intervalo, setIntervalo] = useState(25);
  const [slideId, setSlideId] = useState("podio-0");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [visivel, setVisivel] = useState(true);
  const [quieto, setQuieto] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useAurumTilt(root, !tv);
  const focusAntes = useRef<HTMLElement | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [som, setSom] = useState(false);
  const somRef = useRef(som);
  somRef.current = som;
  const [avisoSom, setAvisoSom] = useState("");
  const [fila, setFila] = useState<Conquista[]>([]);
  const conquista = fila[0];
  const anterior = useRef<RankingSnapshot | null>(null);
  const vistos = useRef(new Set<string>());
  const storageKey = `smq-ranking-eventos-v1:${userKey}:${ano}-${mes}`;
  const rows = useMemo(() => (snapshot ? participantes(snapshot) : []), [snapshot]);
  const corretores = useMemo(
    () => classificacaoCompleta(rows.filter((r) => r.categoria === "corretor")),
    [rows],
  );
  const gestores = useMemo(() => (snapshot ? classificarGestores(snapshot) : []), [snapshot]);
  const roteiro = useMemo(
    () =>
      roteiroTV(
        corretores.length,
        gestores.length,
        Math.ceil(corretores.filter((r) => r.pos > 0 && r.pos <= 3).length / 3),
      ),
    [corretores, gestores],
  );
  const slide = roteiro.find((s) => s.id === slideId) ?? roteiro[0];
  const indice = roteiro.indexOf(slide);
  const tipo = tv ? slide.tipo : visao;
  const navegar = useCallback(
    (delta: number) => {
      setSlideId((atual) => {
        const index = Math.max(
          0,
          roteiro.findIndex((s) => s.id === atual),
        );
        return roteiro[(index + delta + roteiro.length) % roteiro.length].id;
      });
    },
    [roteiro],
  );
  const navegarRef = useRef(navegar);
  navegarRef.current = navegar;
  const hasSnapshot = !!snapshot;
  const sair = useCallback(() => {
    setTv(false);
    setAuto(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);
  const entrar = () => {
    focusAntes.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelecionado(null);
    setTv(true);
    setAuto(true);
    setSlideId(visao === "produtividade" ? "produtividade-resumo" : `${visao}-0`);
    setQuieto(false);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    setSlideId("podio-0");
    setSelecionado(null);
    setFila([]);
    anterior.current = null;
  }, [ano, mes, userKey]);
  useEffect(() => {
    try {
      vistos.current = new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]);
    } catch {
      vistos.current = new Set();
    }
  }, [storageKey]);
  useEffect(() => {
    if (!snapshot || loading || fetching || error) return;
    const novos = novasConquistas(anterior.current, snapshot, vistos.current);
    anterior.current = snapshot;
    if (!visivel) return;
    if (novos.length) {
      novos.forEach((e) => vistos.current.add(e.id));
      // Só IDs e chaves de eventos, sem nomes, valores ou fotos.
      try {
        localStorage.setItem(storageKey, JSON.stringify([...vistos.current].slice(-500)));
      } catch {
        /* storage indisponível: baseline em memória */
      }
      setFila((f) => [...f, ...novos].slice(0, 20));
    }
  }, [snapshot, loading, fetching, error, visivel, storageKey]);
  useEffect(() => {
    if (!conquista) return;
    const ctx = audio.current;
    if (somRef.current && ctx?.state === "running") {
      [523.25, 659.25, 783.99].forEach((frequencia, i) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.15;
        oscillator.type = "sine";
        oscillator.frequency.value = frequencia;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.065, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.7);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    }
    const timer = setTimeout(() => setFila((f) => f.slice(1)), 6500);
    return () => clearTimeout(timer);
  }, [conquista]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  const alternarSom = async () => {
    if (som) {
      setSom(false);
      void audio.current?.suspend();
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== "running") throw new Error("audio suspenso");
      setSom(true);
      setAvisoSom("");
    } catch {
      setSom(false);
      setAvisoSom("Áudio indisponível neste navegador. As celebrações visuais continuam ativas.");
    }
  };
  useEffect(() => {
    const onVisibility = () => {
      setVisivel(!document.hidden);
      if (document.hidden) setFila([]);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!tv || !auto || !visivel || conquista || !hasSnapshot || loading) return;
    const timer = setInterval(() => navegarRef.current(1), intervalo * 1000);
    return () => clearInterval(timer);
  }, [tv, auto, intervalo, visivel, conquista, hasSnapshot, loading]);
  useEffect(() => {
    if (!tv) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings = [...document.body.children].filter(
      (n): n is HTMLElement => n instanceof HTMLElement && n !== root.current,
    );
    const antes = siblings.map((el) => [el, el.inert] as const);
    antes.forEach(([el]) => {
      el.inert = true;
    });
    root.current?.focus();
    const onFull = () => {
      if (!document.fullscreenElement) sair();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (e.key === "Tab") {
        const buttons = root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [tabindex="0"]',
        );
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === root.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        sair();
        return;
      }
      if (target?.closest('[role="combobox"], [role="option"], input, select, textarea')) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        navegarRef.current(e.key === "ArrowRight" ? 1 : -1);
      }
      if (e.code === "Space" && !target?.closest("button")) {
        e.preventDefault();
        setAuto((a) => !a);
      }
    };
    document.addEventListener("fullscreenchange", onFull);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      antes.forEach(([el, inert]) => {
        el.inert = inert;
      });
      document.removeEventListener("fullscreenchange", onFull);
      document.removeEventListener("keydown", onKey);
      focusAntes.current?.focus();
    };
  }, [tv, sair]);
  useEffect(() => {
    if (!tv || quieto) return;
    const timer = setTimeout(() => setQuieto(true), 5000);
    return () => clearTimeout(timer);
  }, [tv, quieto]);

  const refreshLabel = snapshot
    ? new Date(snapshot.gerado_em).toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const periodo = `${MESES_LONGOS[mes - 1]} ${ano}`;
  const somButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={som ? "Desativar áudio" : "Ativar áudio das conquistas"}
      aria-pressed={som}
      onClick={() => {
        void alternarSom();
      }}
    >
      {som ? <SpeakerHigh /> : <SpeakerSlash />}
    </Button>
  );
  const me = corretores.find((r) => r.corretorId === userKey);
  const totalVgv = rows.reduce((sum, r) => sum + r.vgv, 0);
  const view =
    snapshot &&
    (tipo === "corretores" ? (
      <Classificacao
        rows={corretores}
        individual={snapshot.escopo === "individual"}
        userKey={userKey}
        tv={tv}
        pagina={slide.pagina}
        onSelect={tv ? undefined : setSelecionado}
      />
    ) : tipo === "gestores" ? (
      <Classificacao rows={gestores} gestor tv={tv} pagina={slide.pagina} />
    ) : tipo === "produtividade" && tv ? (
      <ProdutividadeCampeonato snapshot={snapshot} tv pagina={slide.pagina} />
    ) : (
      <RankingRefinado
        snapshot={snapshot}
        hoje={hoje}
        visao={tipo === "produtividade-resumo" ? "produtividade" : tipo}
        tv={tv}
        pagina={slide.pagina}
        userKey={userKey}
        onSelect={tv ? undefined : setSelecionado}
      />
    ));
  const aba =
    tipo === "corretores" || tipo === "gestores"
      ? "podio"
      : tipo === "produtividade-resumo"
        ? "produtividade"
        : tipo;
  const vencedor = conquista ? rows.find((r) => r.corretorId === conquista.corretorId) : undefined;
  const arena = (
    <Tabs
      value={aba}
      onValueChange={(v) => {
        setVisao(v as TelaTV["tipo"]);
        if (tv) {
          setSlideId(v === "produtividade" ? "produtividade-resumo" : `${v}-0`);
          setAuto(false);
        }
      }}
      asChild
    >
      <div
        ref={root}
        tabIndex={tv ? -1 : undefined}
        role={tv ? "dialog" : undefined}
        aria-modal={tv ? true : undefined}
        aria-label={tv ? "Modo TV do campeonato" : undefined}
        className={cn(
          "ranking-arena smq-refined dark",
          tv && "arena-television",
          quieto && "arena-quiet",
        )}
        data-tv={tv || undefined}
        data-sleep={!visivel || undefined}
        onPointerMove={() => {
          if (tv) setQuieto(false);
        }}
      >
        <header className="arena-header">
          <div className="arena-brand">
            <div className="arena-company-logo">
              <img
                src="/images/ranking/logo-smq.webp"
                alt="Seu Metro Quadrado"
                width={1024}
                height={1024}
              />
            </div>
            <div>
              <div className="smq-brand-title">
                <h1>Seu Metro Quadrado</h1>
                <span className="smq-live-badge">
                  <i /> Ao vivo
                </span>
              </div>
              <p>Desempenho do time · {periodo}</p>
            </div>
          </div>
          <div className="arena-header-actions">
            <RelogioAoVivo className="smq-clock" />
            <div className="arena-live">
              <span className={cn("arena-live-dot", error && "arena-live-error")} />
              <span>
                {error ? "Atualização pendente" : fetching ? "Atualizando" : "Última leitura"}
                <strong>{refreshLabel} · São Paulo</strong>
              </span>
            </div>
            {tv && (
              <Button
                variant="outline"
                className="smq-auto-button"
                onClick={() => setAuto((a) => !a)}
                aria-label={auto ? "Pausar apresentação" : "Iniciar apresentação"}
              >
                {auto ? <Pause /> : <Play />} Auto
              </Button>
            )}
            {!tv && (
              <>
                {somButton}
                <Button className="arena-tv-button" onClick={entrar}>
                  <Television /> Modo TV <ArrowsOut />
                </Button>
              </>
            )}
          </div>
          <div className="smq-header-nav">
            <TabsList className="arena-tabs" aria-label="Visões do campeonato">
              {VISOES.map((v) => {
                const Icon = ICONES[v];
                return (
                  <TabsTrigger key={v} value={v}>
                    <Icon />
                    {LABELS[v]}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <span>
              Atualizado às {refreshLabel}
              {preview ? " · Prévia com dados fictícios" : ""}
            </span>
          </div>
        </header>
        <div className="arena-context">
          <div className="arena-period">
            {tv ? (
              <>
                <span className="arena-eyebrow">Temporada</span>
                <strong>{periodo}</strong>
              </>
            ) : (
              <Select
                value={`${ano}-${mes}`}
                onValueChange={(v) => {
                  const [a, m] = v.split("-").map(Number);
                  onMonthChange(a, m);
                }}
              >
                <SelectTrigger aria-label="Mês do campeonato" className="arena-month-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark">
                  {opcoesDeMes(hoje, 24).map((m) => (
                    <SelectItem key={`${m.ano}-${m.mes}`} value={`${m.ano}-${m.mes}`}>
                      {MESES_LONGOS[m.mes - 1]} {m.ano}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="aurum-context-result">
            <span>{snapshot?.escopo === "individual" ? "Seu VGV" : "VGV do time"}</span>
            <strong>{snapshot ? fmtBRLCompacto(totalVgv) : "—"}</strong>
          </div>
          {!tv && me && (
            <button className="aurum-self-anchor" onClick={() => setSelecionado(me.corretorId)}>
              <span>{snapshot?.escopo === "individual" ? "Seu resultado" : "Sua posição"}</span>{" "}
              <strong>
                {snapshot?.escopo !== "individual" && me.pos > 0
                  ? `${me.pos}º${me.empatado ? " · empate" : ""}`
                  : "Ver análise"}
              </strong>
            </button>
          )}
          <span className="arena-scope">
            {preview
              ? "PRÉVIA · DADOS FICTÍCIOS"
              : snapshot?.escopo === "individual"
                ? "Seu desempenho · escopo individual"
                : snapshot?.escopo === "equipe"
                  ? "Sua equipe · escopo autorizado"
                  : "Desempenho da operação"}
            <span className="aurum-last-read"> · {refreshLabel} SP</span>
          </span>
          {!tv && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Atualizar agora"
              onClick={onRefresh}
              disabled={fetching}
            >
              <ArrowClockwise className={fetching ? "animate-spin" : ""} />
            </Button>
          )}
        </div>
        {error && (
          <div className="arena-alert" role="status">
            {snapshot
              ? "Não foi possível atualizar. A última leitura válida permanece na tela."
              : "Não foi possível carregar o campeonato. Verifique a conexão e tente novamente."}
            <button type="button" onClick={onRefresh}>
              Tentar novamente
            </button>
          </div>
        )}
        {avisoSom && (
          <div className="arena-alert" role="status">
            {avisoSom}
          </div>
        )}
        <TabsContent value={aba} forceMount asChild>
          <main className="arena-stage" aria-busy={loading && !snapshot}>
            {loading && !snapshot ? (
              <div className="arena-loading" role="status">
                <div className="aurum-loading-podium" aria-hidden="true">
                  {[2, 1, 3].map((posicao) => (
                    <div key={posicao} className={`aurum-loading-place-${posicao}`}>
                      <Skeleton />
                      <Skeleton />
                      <Skeleton />
                    </div>
                  ))}
                </div>
                <p>Preparando o campeonato…</p>
              </div>
            ) : snapshot ? (
              <div key={tv ? slide.id : tipo} className="arena-stage-content">
                {view}
              </div>
            ) : !error ? (
              <div className="arena-empty">Aguardando dados do campeonato.</div>
            ) : null}
          </main>
        </TabsContent>
        {tv ? (
          <footer className="arena-tv-footer">
            <div className="smq-ticker" aria-label="Destaques de vendas">
              {corretores
                .filter((r) => r.vendas > 0)
                .slice(0, 3)
                .map((r) => (
                  <span key={r.corretorId}>
                    <Trophy weight="fill" />
                    {r.nome} · {r.vendas} vendas · {fmtBRLCompacto(r.vgv)}
                  </span>
                ))}
            </div>
            <div className="arena-slide-label">
              <span>
                {String(indice + 1).padStart(2, "0")} / {String(roteiro.length).padStart(2, "0")}
              </span>
              <strong>{LABELS[tipo]}</strong>
            </div>
            <div className="arena-tv-controls">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Tela anterior"
                onClick={() => navegar(-1)}
              >
                <CaretLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={auto ? "Pausar rotação" : "Retomar rotação"}
                aria-pressed={auto}
                onClick={() => setAuto((a) => !a)}
              >
                {auto ? <Pause weight="fill" /> : <Play weight="fill" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Próxima tela"
                onClick={() => navegar(1)}
              >
                <CaretRight />
              </Button>
              <Button
                variant="ghost"
                className="arena-interval"
                aria-label={`Intervalo de rotação: ${intervalo} segundos. Alterar intervalo`}
                onClick={() =>
                  setIntervalo((s) => INTERVALOS[(INTERVALOS.indexOf(s) + 1) % INTERVALOS.length])
                }
              >
                {intervalo}s
              </Button>
              {somButton}
              <Button variant="ghost" size="icon" aria-label="Sair do Modo TV" onClick={sair}>
                <X />
              </Button>
            </div>
            <span className="arena-tv-status">
              {conquista ? "Celebrando conquista" : auto ? "Rotação automática" : "Rotação pausada"}
            </span>
          </footer>
        ) : (
          <footer className="arena-desktop-footer">
            <span>
              VGV ↓ · desempate por vendas · empates compartilham posição.
              <br />
              Aprovações e estornos pelo mês de efetivação em São Paulo. Atualização a cada 60s.
            </span>
            <span>
              SEU METRO QUADRADO <b> / </b> RANKING MENSAL
            </span>
          </footer>
        )}
        {vencedor && conquista && (
          <div className="arena-celebration" role="status">
            <div className="arena-celebration-glow" aria-hidden="true" />
            <div className="aurum-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <span
                  key={`${conquista.id}-${i}`}
                  style={
                    {
                      "--dx": `${Math.round(Math.cos(i * 2.4) * (120 + i * 10))}px`,
                      "--dy": `${Math.round(Math.sin(i * 2.4) * 180 - 80)}px`,
                      "--turn": `${i * 37}deg`,
                      animationDelay: `${(i % 3) * 40}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <img
              className="arena-celebration-trophy"
              src="/images/ranking/trofeu-smq.webp"
              width={675}
              height={1200}
              alt=""
            />
            <span className="arena-eyebrow">Uma conquista para o time</span>
            <h2>{conquista.titulo}</h2>
            <Foto nome={vencedor.nome} foto={vencedor.foto} />
            <h3>{vencedor.nome}</h3>
            <strong>{fmtBRLCompacto(conquista.valor)}</strong>
            <p>{conquista.detalhes.join(" · ")}</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar celebração"
              onClick={() => setFila((f) => f.slice(1))}
            >
              <X />
            </Button>
          </div>
        )}
        {!tv && snapshot && (
          <AnaliseCorretor
            id={selecionado}
            snapshot={snapshot}
            hoje={hoje}
            onClose={() => setSelecionado(null)}
          />
        )}
      </div>
    </Tabs>
  );
  return tv && typeof document !== "undefined" ? createPortal(arena, document.body) : arena;
}
