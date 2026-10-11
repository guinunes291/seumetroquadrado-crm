// Mapa de Lojas — os stands de vendas das construtoras, para o atendimento.
//
// O corretor chega aqui com o cliente no telefone: "qual o stand mais perto de
// mim?", "onde fica o decorado da Trisul?". A tela responde em três toques —
// filtra (construtora, zona ou bairro), escolhe o stand e manda o endereço com
// a rota pelo WhatsApp.
//
// Desde 11/10/2026 o filtro também fala a língua do cliente: "quero uns 37
// metros". A metragem casa com as plantas do stand e com o decorado citado na
// observação, e a planta abre ampliada para o corretor mostrar ou mandar.
//
// A lista abre na hora com a base salva no sistema (lib/lojas/lojas-base) e é
// trocada pela planilha assim que o proxy responde — a planilha é a fonte viva,
// a base é o colete salva-vidas. Sem lead em contexto de propósito: é consulta
// de catálogo como a Vitrine sem ?leadId, e pertence a Docs & Projetos.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowSquareOut,
  ArrowsOutSimple,
  Blueprint,
  Copy,
  CornersOut,
  GpsFix,
  LinkSimple,
  MagnifyingGlass,
  NavigationArrow,
  Ruler,
  Warning,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LojasMap } from "@/components/lojas/lojas-map";
import { usePosicoesRefinadas } from "@/components/lojas/use-posicoes-refinadas";
import {
  construtorasDasLojas,
  corDaConstrutora,
  distanciaDaLoja,
  filtrarLojas,
  filtrosLojasVazios,
  formatarDistancia,
  formatarM2,
  linkComoChegar,
  LOJAS_BASE,
  metragemMaisProxima,
  metragensDisponiveis,
  ordenarLojas,
  ordenarPlantas,
  plantasDaLoja,
  TOLERANCIAS_M2,
  zonasDasLojas,
  type FiltrosLojas,
  type Loja,
  type Ponto,
} from "@/lib/lojas/lojas";
import { buscarPlanilhaLojas } from "@/lib/lojas/lojas-planilha-client";
import { urlPlanta } from "@/lib/lojas/plantas";
import { buildWhatsAppUrl } from "@/lib/templates";
import { mensagemLoja } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mapa-lojas")({
  head: () => ({ meta: [{ title: "Mapa de Lojas — Seu Metro Quadrado" }] }),
  component: MapaLojasPage,
});

// O mapa standalone continua servido de public/ — é a versão sem login, o
// link que o corretor manda para o cliente escolher o stand sozinho.
const MAPA_LOJAS_PUBLICO = "/mapa-lojas.html";

function mensagemDaLoja(loja: Loja): string {
  return mensagemLoja({ ...loja, rotaUrl: linkComoChegar(loja) });
}

function MapaLojasPage() {
  const [filtros, setFiltros] = useState<FiltrosLojas>(filtrosLojasVazios);
  const [mostrarZonas, setMostrarZonas] = useState(false);
  const [mostrarMetro, setMostrarMetro] = useState(true);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [focarEm, setFocarEm] = useState(0);
  const [enquadrarEm, setEnquadrarEm] = useState(0);
  const [origem, setOrigem] = useState<Ponto | null>(null);
  const [localizando, setLocalizando] = useState(false);
  // O campo guarda o texto digitado ("37,5" no meio da digitação não é número
  // ainda); o filtro guarda o número já interpretado.
  const [m2Texto, setM2Texto] = useState("");
  const [plantaAberta, setPlantaAberta] = useState<{ loja: Loja; plantaId: string } | null>(null);

  const planilhaQ = useQuery({
    queryKey: ["lojas-planilha"],
    queryFn: buscarPlanilhaLojas,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const lojas = usePosicoesRefinadas(planilhaQ.data ?? LOJAS_BASE);
  const construtoras = useMemo(() => construtorasDasLojas(lojas), [lojas]);
  const zonas = useMemo(() => zonasDasLojas(lojas), [lojas]);
  const metragens = useMemo(() => metragensDisponiveis(lojas), [lojas]);
  const filtradas = useMemo(
    () => ordenarLojas(filtrarLojas(lojas, filtros), { origem, m2: filtros.m2 }),
    [lojas, filtros, origem],
  );

  const set = (patch: Partial<FiltrosLojas>) => setFiltros((f) => ({ ...f, ...patch }));

  const definirM2 = (texto: string) => {
    setM2Texto(texto);
    const v = Number.parseFloat(texto.replace(",", "."));
    set({ m2: Number.isFinite(v) && v > 0 ? v : null });
  };

  const abrirPlanta = useCallback(
    (loja: Loja, plantaId: string) => setPlantaAberta({ loja, plantaId }),
    [],
  );

  const focar = useCallback((id: string) => {
    setSelecionadaId(id);
    setFocarEm((n) => n + 1);
  }, []);

  // window.open precisa ser síncrono no clique (Safari bloqueia popup fora dele).
  const enviarWhatsApp = useCallback((loja: Loja) => {
    window.open(buildWhatsAppUrl("", mensagemDaLoja(loja)), "_blank", "noopener,noreferrer");
  }, []);

  const copiar = useCallback(async (texto: string, sucesso: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(sucesso);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }, []);

  const pertoDeMim = () => {
    if (origem) {
      setOrigem(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Este navegador não informa a localização.");
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizando(false);
        setOrigem({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocalizando(false);
        toast.error("Localização negada. Libere o acesso no navegador e tente de novo.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  };

  const linkPublico = () =>
    copiar(
      `${window.location.origin}${MAPA_LOJAS_PUBLICO}`,
      "Link do mapa copiado — o cliente abre sem precisar de login.",
    );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Mapa de Lojas"
        description="Os stands de vendas das construtoras parceiras. Ache o mais perto do cliente e mande o endereço com a rota pelo WhatsApp."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={linkPublico}>
              <LinkSimple className="mr-1.5 h-4 w-4" /> Link para o cliente
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={MAPA_LOJAS_PUBLICO} target="_blank" rel="noopener noreferrer">
                <ArrowsOutSimple className="mr-1.5 h-4 w-4" /> Tela cheia
              </a>
            </Button>
          </>
        }
      />

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filtros.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar construtora, bairro ou rua…"
            aria-label="Buscar stand"
            className="pl-9"
          />
        </div>

        <GrupoFiltro label="Construtora">
          <div className="flex flex-wrap gap-1.5">
            <Chip ativo={filtros.construtora == null} onClick={() => set({ construtora: null })}>
              Todas
            </Chip>
            {construtoras.map(({ construtora, total }) => (
              <Chip
                key={construtora}
                ativo={filtros.construtora === construtora}
                onClick={() =>
                  set({ construtora: filtros.construtora === construtora ? null : construtora })
                }
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: corDaConstrutora(construtora) }}
                />
                {construtora} ({total})
              </Chip>
            ))}
          </div>
        </GrupoFiltro>

        <GrupoFiltro label="Metragem do cliente">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-32">
              <Ruler className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                inputMode="decimal"
                value={m2Texto}
                onChange={(e) => definirM2(e.target.value)}
                placeholder="Ex.: 37"
                aria-label="Metragem que o cliente procura, em m²"
                className="h-8 pl-8 pr-8"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                m²
              </span>
            </div>
            <Select
              value={String(filtros.tolerancia)}
              onValueChange={(v) => set({ tolerancia: Number(v) })}
            >
              <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Margem da metragem">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOLERANCIAS_M2.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    ± {t} m²
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtros.m2 != null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => definirM2("")}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </div>
          {metragens.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {metragens.map((v) => (
                <Chip
                  key={v}
                  ativo={filtros.m2 === v}
                  onClick={() => definirM2(filtros.m2 === v ? "" : String(v))}
                >
                  {v} m²
                </Chip>
              ))}
            </div>
          )}
        </GrupoFiltro>

        {zonas.length > 0 && (
          <GrupoFiltro label="Região">
            <div className="flex flex-wrap gap-1.5">
              <Chip ativo={filtros.zona == null} onClick={() => set({ zona: null })}>
                Todas
              </Chip>
              {zonas.map((z) => (
                <Chip
                  key={z}
                  ativo={filtros.zona === z}
                  onClick={() => set({ zona: filtros.zona === z ? null : z })}
                >
                  {z}
                </Chip>
              ))}
            </div>
          </GrupoFiltro>
        )}
      </div>

      {planilhaQ.isError && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-aviso-300 bg-aviso-50 px-3 py-2 text-xs text-aviso-900">
          <Warning className="h-4 w-4 shrink-0" />
          <span>
            A planilha de lojas não respondeu — mostrando a lista salva no sistema, que pode estar
            desatualizada.
          </span>
          <Button variant="outline" size="sm" className="h-7" onClick={() => planilhaQ.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Controles do mapa */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-4">
          <Camada
            id="lojas-camada-zonas"
            label="Zonas de SP"
            checked={mostrarZonas}
            onCheckedChange={setMostrarZonas}
          />
          <Camada
            id="lojas-camada-metro"
            label="Metrô / CPTM"
            checked={mostrarMetro}
            onCheckedChange={setMostrarMetro}
          />
          <Button
            type="button"
            size="sm"
            variant={origem ? "default" : "outline"}
            className="h-8"
            aria-pressed={origem != null}
            disabled={localizando}
            onClick={pertoDeMim}
          >
            <GpsFix className="mr-1.5 h-4 w-4" />
            {localizando ? "Localizando…" : origem ? "Ordenado por distância" : "Perto de mim"}
            {origem && <X className="ml-1.5 h-3.5 w-3.5" />}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setEnquadrarEm((n) => n + 1)}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <CornersOut className="h-3.5 w-3.5" /> Enquadrar resultados
        </button>
      </div>

      {/* Lista + mapa: lado a lado no desktop; no celular, mapa em cima. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <ListaLojas
          lojas={filtradas}
          total={lojas.length}
          origem={origem}
          m2={filtros.m2}
          tolerancia={filtros.tolerancia}
          selecionadaId={selecionadaId}
          carregandoPlanilha={planilhaQ.isFetching && !planilhaQ.data}
          doPlanilha={planilhaQ.data != null}
          onFocar={focar}
          onWhatsApp={enviarWhatsApp}
          onAbrirPlanta={abrirPlanta}
          onCopiar={(loja) =>
            copiar(mensagemDaLoja(loja), "Endereço copiado — cole na conversa com o cliente.")
          }
          onLimpar={() => {
            setFiltros(filtrosLojasVazios);
            setM2Texto("");
          }}
          className="order-2 lg:order-1"
        />
        <LojasMap
          lojas={filtradas}
          mostrarZonas={mostrarZonas}
          mostrarMetro={mostrarMetro}
          focadaId={selecionadaId}
          focarEm={focarEm}
          enquadrarEm={enquadrarEm}
          origem={origem}
          onSelecionar={setSelecionadaId}
          onEnviar={enviarWhatsApp}
          onAbrirPlanta={abrirPlanta}
          m2={filtros.m2}
          tolerancia={filtros.tolerancia}
          className="order-1 h-[52vh] min-h-[360px] lg:order-2 lg:h-[70vh]"
        />
      </div>

      <VisualizadorPlantas
        aberta={plantaAberta}
        m2={filtros.m2}
        onTrocar={(plantaId) => setPlantaAberta((a) => (a ? { ...a, plantaId } : a))}
        onFechar={() => setPlantaAberta(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planta ampliada
// ---------------------------------------------------------------------------

/**
 * A planta em tamanho de leitura, com as outras plantas do mesmo stand numa
 * faixa abaixo. "Abrir imagem" leva ao arquivo puro — é por ali que o corretor
 * salva no celular ou copia o link para mandar ao cliente.
 */
function VisualizadorPlantas({
  aberta,
  m2,
  onTrocar,
  onFechar,
}: {
  aberta: { loja: Loja; plantaId: string } | null;
  m2: number | null;
  onTrocar: (plantaId: string) => void;
  onFechar: () => void;
}) {
  const plantas = aberta ? ordenarPlantas(plantasDaLoja(aberta.loja), m2) : [];
  const atual = plantas.find((p) => p.id === aberta?.plantaId) ?? plantas[0];

  return (
    <Dialog open={aberta != null && atual != null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-3xl gap-3 overflow-y-auto">
        {aberta && atual && (
          <>
            <DialogHeader>
              <DialogTitle>{atual.tipo}</DialogTitle>
              <DialogDescription>
                {atual.area} · {aberta.loja.construtora} · {aberta.loja.nome}
              </DialogDescription>
            </DialogHeader>
            <img
              src={urlPlanta(atual)}
              alt={`${atual.tipo} — ${atual.area}`}
              className="max-h-[62vh] w-full rounded-lg border bg-white object-contain"
            />
            {plantas.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {plantas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onTrocar(p.id)}
                    aria-current={p.id === atual.id || undefined}
                    title={`${p.tipo} — ${p.area}`}
                    className={cn(
                      "shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                      p.id === atual.id
                        ? "border-primary"
                        : "border-transparent hover:border-muted-foreground/40",
                    )}
                  >
                    <img
                      src={urlPlanta(p)}
                      alt={p.tipo}
                      loading="lazy"
                      className="h-16 w-20 bg-white object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <a href={urlPlanta(atual)} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOut className="mr-1.5 h-4 w-4" /> Abrir imagem
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

function ListaLojas({
  lojas,
  total,
  origem,
  m2,
  tolerancia,
  selecionadaId,
  carregandoPlanilha,
  doPlanilha,
  onFocar,
  onWhatsApp,
  onAbrirPlanta,
  onCopiar,
  onLimpar,
  className,
}: {
  lojas: Loja[];
  total: number;
  origem: Ponto | null;
  m2: number | null;
  tolerancia: number;
  selecionadaId: string | null;
  carregandoPlanilha: boolean;
  doPlanilha: boolean;
  onFocar: (id: string) => void;
  onWhatsApp: (loja: Loja) => void;
  onAbrirPlanta: (loja: Loja, plantaId: string) => void;
  onCopiar: (loja: Loja) => void;
  onLimpar: () => void;
  className?: string;
}) {
  const itensRef = useRef(new Map<string, HTMLLIElement>());

  // Clique no pino seleciona aqui: o item correspondente rola para a vista.
  useEffect(() => {
    if (!selecionadaId) return;
    itensRef.current.get(selecionadaId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selecionadaId]);

  return (
    <div
      className={cn(
        "flex max-h-[70vh] min-h-[240px] flex-col overflow-hidden rounded-xl border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>
          <b className="tabular-nums text-foreground">{lojas.length}</b> de{" "}
          <span className="tabular-nums">{total}</span> stands
          {origem
            ? " · mais perto primeiro"
            : m2 != null
              ? " · metragem mais parecida primeiro"
              : ""}
        </span>
        <span>
          {carregandoPlanilha
            ? "Atualizando pela planilha…"
            : doPlanilha
              ? "Planilha atualizada"
              : "Lista salva no sistema"}
        </span>
      </div>

      {lojas.length === 0 ? (
        <div className="space-y-3 p-6 text-center text-sm text-muted-foreground">
          <p>
            {m2 != null
              ? `Nenhum stand com planta ou decorado de ${formatarM2(m2)} m² (± ${tolerancia} m²). Aumente a margem ou limpe a metragem.`
              : "Nenhum stand encontrado com esses filtros."}
          </p>
          <Button variant="outline" size="sm" onClick={onLimpar}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <ul className="flex-1 divide-y overflow-y-auto">
          {lojas.map((loja) => {
            const km = distanciaDaLoja(loja, origem);
            const ativa = loja.id === selecionadaId;
            const plantas = ordenarPlantas(plantasDaLoja(loja), m2);
            const maisProxima = m2 != null ? metragemMaisProxima(loja, m2) : null;
            return (
              <li
                key={loja.id}
                ref={(no) => {
                  if (no) itensRef.current.set(loja.id, no);
                  else itensRef.current.delete(loja.id);
                }}
                className={cn("transition-colors", ativa ? "bg-accent" : "hover:bg-accent/50")}
              >
                <button
                  type="button"
                  onClick={() => onFocar(loja.id)}
                  aria-current={ativa || undefined}
                  className="flex w-full items-start gap-2.5 px-3 pb-1.5 pt-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                    style={{ background: corDaConstrutora(loja.construtora) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {loja.construtora} · {loja.nome}
                      </span>
                      {km != null && (
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                          {formatarDistancia(km)}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {loja.endereco}
                      {loja.bairro ? ` — ${loja.bairro}` : ""}
                    </span>
                    {maisProxima != null && (
                      <span className="mt-1 inline-block rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
                        planta mais próxima: {formatarM2(maisProxima)} m²
                      </span>
                    )}
                    {loja.obs && (
                      <span className="mt-0.5 block text-xs font-medium text-foreground/80">
                        {loja.obs}
                      </span>
                    )}
                    {loja.lat == null && (
                      <span className="mt-0.5 block text-[11px] text-aviso-700">
                        Localizando no mapa pelo endereço…
                      </span>
                    )}
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 pl-[34px]">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                    <a href={linkComoChegar(loja)} target="_blank" rel="noopener noreferrer">
                      <NavigationArrow className="mr-1 h-3.5 w-3.5" /> Como chegar
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onWhatsApp(loja)}
                    title="Abre o WhatsApp com o endereço e a rota prontos — você escolhe o contato"
                  >
                    <WhatsappLogo className="mr-1 h-3.5 w-3.5" /> WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onCopiar(loja)}
                    title="Copia o endereço e a rota para colar na conversa"
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
                  </Button>
                  {plantas.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onAbrirPlanta(loja, plantas[0].id)}
                      title="Abre as plantas do stand em tamanho de leitura"
                    >
                      <Blueprint className="mr-1 h-3.5 w-3.5" /> Plantas ({plantas.length})
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças pequenas
// ---------------------------------------------------------------------------

function GrupoFiltro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={ativo ? "default" : "outline"}
      aria-pressed={ativo}
      className="h-7 gap-1.5 rounded-full px-3 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Camada({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="cursor-pointer text-xs font-medium text-muted-foreground">
        {label}
      </Label>
    </div>
  );
}
