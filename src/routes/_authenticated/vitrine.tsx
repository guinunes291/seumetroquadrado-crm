import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowClockwise,
  ArrowsOutSimple,
  CornersOut,
  ListDashes,
  MagnifyingGlass,
  Table as TableIcon,
  User,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { ProjetoRow } from "@/components/projeto-card";
import { formatBRL, formatDormsRange } from "@/lib/projetos";
import { MercadoMap } from "@/components/vitrine/mercado-map";
import { SimuladorCliente } from "@/components/vitrine/simulador-cliente";
import { VitrinePanel, type VitrineLead } from "@/components/vitrine/vitrine-panel";
import { EnviarVitrineDialog } from "@/components/vitrine/enviar-vitrine-dialog";
import { VitrineShortlist } from "@/components/vitrine/vitrine-shortlist-dialog";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { mensagemEmpreendimento, WHATSAPP_TITULO_EMPREENDIMENTO } from "@/lib/whatsapp";
import { SITUACOES, type Situacao } from "@/lib/vitrine/vitrine";
import {
  aplicarFiltrosMercado,
  DORM_FILTROS,
  filtrosMercadoVazios,
  mesclarMercado,
  zonasDoMercado,
  type DormFiltro,
  type EmpreendimentoMercado,
  type MercadoFilters,
  type MercadoSort,
} from "@/lib/vitrine/mercado";
import {
  calcularPoderDeCompra,
  classificar,
  coberturaPercentual,
  perfilClienteVazio,
  type Enquadramento,
  type PerfilCliente,
  type PoderDeCompra,
} from "@/lib/vitrine/poder-de-compra";
import { buscarPlanilhaMercado } from "@/lib/vitrine/mercado-planilha-client";
import { toggleVitrineShortlist } from "@/lib/vitrine-publica";
import { PROJETO_CRM_SELECT } from "@/lib/projetos-query";
import { cn } from "@/lib/utils";
import { usePublicarFaseDoLead } from "@/features/nav/contexto-jornada";

const searchSchema = z.object({ leadId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/vitrine")({
  head: () => ({ meta: [{ title: "Mapa de Mercado — Seu Metro Quadrado" }] }),
  validateSearch: searchSchema,
  component: VitrinePage,
});

// O mapa standalone continua servido de public/ como versão de tela cheia — é o
// link que se manda para quem não tem acesso ao CRM.
const MAPA_MERCADO_URL = "/mapa-mercado.html";

const SITUACAO_CHIPS: (Situacao | "Todas")[] = ["Todas", ...SITUACOES];

function VitrinePage() {
  const { leadId } = Route.useSearch();
  const abrirWhatsApp = useWhatsAppLead();

  const [perfil, setPerfil] = useState<PerfilCliente>(perfilClienteVazio);
  const [filtros, setFiltros] = useState<MercadoFilters>(filtrosMercadoVazios);
  const [view, setView] = useState<"list" | "tabela">("list");
  const [mostrarZonas, setMostrarZonas] = useState(false);
  const [mostrarMetro, setMostrarMetro] = useState(true);
  const [enquadrarEm, setEnquadrarEm] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pickerProjeto, setPickerProjeto] = useState<ProjetoRow | null>(null);
  const [shortlistIds, setShortlistIds] = useState<string[]>([]);

  const projetosQ = useQuery({
    queryKey: ["vitrine-projetos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select(PROJETO_CRM_SELECT)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProjetoRow[];
    },
  });

  // A planilha é complemento, não pré-requisito: se ela cair, o mapa segue com o
  // catálogo do CRM e a página avisa em vez de ficar vazia.
  const planilhaQ = useQuery({
    queryKey: ["mercado-planilha"],
    queryFn: buscarPlanilhaMercado,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const leadQ = useQuery({
    queryKey: ["vitrine-lead", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<VitrineLead | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, projeto_nome, status")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return (data as VitrineLead) ?? null;
    },
  });
  const lead = leadQ.data ?? null;

  // Vitrine COM lead é passo da jornada (montar shortlist): a sidebar mantém
  // o hub da fase do lead em vez de pular para Docs & Projetos. Sem leadId,
  // é consulta de catálogo e nada é publicado (auditoria 2026-08-27).
  usePublicarFaseDoLead(leadId ? (lead?.status ?? null) : null);

  const poder = useMemo(() => calcularPoderDeCompra(perfil), [perfil]);

  const itens = useMemo(
    () => mesclarMercado(projetosQ.data ?? [], planilhaQ.data ?? []),
    [projetosQ.data, planilhaQ.data],
  );
  const zonas = useMemo(() => zonasDoMercado(itens), [itens]);
  const filtrados = useMemo(
    () => aplicarFiltrosMercado(itens, filtros, poder),
    [itens, filtros, poder],
  );

  const selecionado = useMemo(
    () => itens.find((e) => e.id === selectedId) ?? null,
    [itens, selectedId],
  );
  const shortlist = useMemo(
    () =>
      shortlistIds
        .map((id) => itens.find((e) => e.projeto?.id === id)?.projeto)
        .filter((projeto) => projeto != null),
    [itens, shortlistIds],
  );
  const shortlistSet = useMemo(() => new Set(shortlistIds), [shortlistIds]);

  const doPlanilha = useMemo(() => itens.filter((e) => e.origem === "planilha").length, [itens]);
  const fecham = useMemo(
    () => (poder ? filtrados.filter((e) => classificar(e.precoMin, poder) === "fecha").length : 0),
    [filtrados, poder],
  );

  const set = (patch: Partial<MercadoFilters>) => setFiltros((f) => ({ ...f, ...patch }));
  const ajustarPerfil = useCallback(
    (patch: Partial<PerfilCliente>) => setPerfil((p) => ({ ...p, ...patch })),
    [],
  );
  const alternarShortlist = useCallback(
    (id: string) => setShortlistIds((atual) => toggleVitrineShortlist(atual, id)),
    [],
  );

  // Com lead em contexto: envia e registra direto. Sem lead: abre o seletor.
  const handleEnviar = (p: ProjetoRow) => {
    if (lead) {
      const precoLabel =
        p.sob_consulta || p.preco_a_partir == null ? "Sob consulta" : formatBRL(p.preco_a_partir);
      const msg = mensagemEmpreendimento(lead.nome, {
        nome: p.nome,
        bairro: p.bairro,
        zona: p.zona_smq,
        precoLabel,
        bookUrl: p.book_url,
      });
      abrirWhatsApp(
        { id: lead.id, nome: lead.nome, telefone: lead.telefone },
        { mensagem: msg, titulo: `${WHATSAPP_TITULO_EMPREENDIMENTO}: ${p.nome}` },
      );
    } else {
      setPickerProjeto(p);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Mapa de Mercado"
        description="Preencha o cliente, veja no mapa quem fecha com ele — por zona, orçamento e situação de obra — e mande o book, a tabela e a mensagem na hora."
      />

      {lead && (
        <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2 text-sm">
          <User className="h-4 w-4 text-primary" />
          <span>
            Mapa para <b>{lead.nome}</b>
            {lead.projeto_nome ? ` · interesse: ${lead.projeto_nome}` : ""}
          </span>
        </div>
      )}

      {/* O lead em contexto personaliza o envio: se a busca falhar, avisa em vez
          de seguir em silêncio como se fosse uma consulta "sem lead". */}
      {leadId && leadQ.isError && (
        <QueryErrorState
          title="Não foi possível carregar o lead deste mapa."
          error={leadQ.error}
          onRetry={() => leadQ.refetch()}
          className="py-6"
        />
      )}

      <SimuladorCliente
        perfil={perfil}
        poder={poder}
        onChange={ajustarPerfil}
        onLimpar={() => setPerfil(perfilClienteVazio)}
      />

      {projetosQ.isLoading ? (
        <MapaSkeleton />
      ) : projetosQ.isError ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <Warning className="mx-auto h-10 w-10 text-destructive opacity-70" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar os empreendimentos. Verifique a conexão e tente de novo.
            </p>
            <Button variant="outline" size="sm" onClick={() => projetosQ.refetch()}>
              <ArrowClockwise className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filtros — também fora do mapa */}
          <div className="space-y-3 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-[220px] flex-1">
                <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filtros.q}
                  onChange={(e) => set({ q: e.target.value })}
                  placeholder="Buscar nome, construtora ou bairro…"
                  className="pl-9"
                />
              </div>

              <GrupoFiltro label="Valor até">
                <div className="flex items-center gap-1 rounded-md border px-2">
                  <span className="text-xs text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    step={10000}
                    min={0}
                    value={filtros.precoAte ?? ""}
                    onChange={(e) => {
                      const v = Number.parseInt(e.target.value, 10);
                      set({ precoAte: Number.isFinite(v) && v > 0 ? v : null });
                    }}
                    placeholder="sem limite"
                    className="h-9 w-28 border-0 px-1 shadow-none focus-visible:ring-0"
                  />
                  {filtros.precoAte != null && (
                    <button
                      type="button"
                      aria-label="Limpar valor máximo"
                      onClick={() => set({ precoAte: null })}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </GrupoFiltro>

              <GrupoFiltro label="Ordenar">
                <Select value={filtros.sort} onValueChange={(v) => set({ sort: v as MercadoSort })}>
                  <SelectTrigger className="h-9 w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobertura">
                      {poder ? "Quem fecha primeiro" : "Quem fecha (preencha a renda)"}
                    </SelectItem>
                    <SelectItem value="preco-asc">Menor preço</SelectItem>
                    <SelectItem value="preco-desc">Maior preço</SelectItem>
                    <SelectItem value="az">Nome (A–Z)</SelectItem>
                  </SelectContent>
                </Select>
              </GrupoFiltro>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {zonas.length > 0 && (
                <GrupoFiltro label="Zona">
                  <ChipRow
                    options={["Todas", ...zonas]}
                    value={filtros.zona}
                    onSelect={(v) => set({ zona: v as MercadoFilters["zona"] })}
                  />
                </GrupoFiltro>
              )}
              <GrupoFiltro label="Situação">
                <ChipRow
                  options={SITUACAO_CHIPS}
                  value={filtros.situacao}
                  onSelect={(v) => set({ situacao: v as Situacao | "Todas" })}
                />
              </GrupoFiltro>
              <GrupoFiltro label="Dorms">
                <ChipRow
                  options={DORM_FILTROS}
                  value={filtros.dorm}
                  onSelect={(v) => set({ dorm: v as DormFiltro })}
                />
              </GrupoFiltro>
            </div>
          </div>

          {planilhaQ.isError && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Warning className="h-4 w-4 shrink-0" />
              <span>
                A planilha de mercado não respondeu — o mapa está mostrando só o catálogo do CRM.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => planilhaQ.refetch()}
              >
                Tentar de novo
              </Button>
            </div>
          )}

          {/* Controles do mapa — camadas ficam aqui fora, não sobre o mapa */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-4">
              <Camada
                id="camada-zonas"
                label="Zonas de SP"
                checked={mostrarZonas}
                onCheckedChange={setMostrarZonas}
              />
              <Camada
                id="camada-metro"
                label="Metrô / CPTM"
                checked={mostrarMetro}
                onCheckedChange={setMostrarMetro}
              />
              {poder && (
                <Camada
                  id="camada-so-fecham"
                  label="Só quem fecha"
                  checked={filtros.soQueFecham}
                  onCheckedChange={(v) => set({ soQueFecham: v })}
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEnquadrarEm((n) => n + 1)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <CornersOut className="h-3.5 w-3.5" /> Enquadrar resultados
              </button>
              <a
                href={MAPA_MERCADO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowsOutSimple className="h-3.5 w-3.5" /> Abrir em tela cheia
              </a>
            </div>
          </div>

          <MercadoMap
            itens={filtrados}
            poder={poder}
            mostrarZonas={mostrarZonas}
            mostrarMetro={mostrarMetro}
            onAbrirFicha={setSelectedId}
            destacadoId={hoveredId}
            focadoId={selectedId}
            enquadrarEm={enquadrarEm}
            className="h-[58vh] min-h-[380px] lg:h-[68vh]"
          />

          {/* Resultados */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                <b className="tabular-nums text-foreground">{filtrados.length}</b> empreendimento
                {filtrados.length === 1 ? "" : "s"}
                {poder && (
                  <>
                    {" · "}
                    <b className="tabular-nums text-emerald-700">{fecham}</b> fecham com o cliente
                  </>
                )}
                {doPlanilha > 0 && ` · ${doPlanilha} só na planilha`}
              </div>
              <div className="flex overflow-hidden rounded-md border">
                <BotaoView active={view === "list"} onClick={() => setView("list")}>
                  <ListDashes className="h-4 w-4" /> Lista
                </BotaoView>
                <BotaoView active={view === "tabela"} onClick={() => setView("tabela")}>
                  <TableIcon className="h-4 w-4" /> Tabela
                </BotaoView>
              </div>
            </div>

            {filtrados.length === 0 ? (
              <Card>
                <CardContent className="space-y-2 py-12 text-center text-muted-foreground">
                  <p>
                    {poder && filtros.soQueFecham
                      ? "Nenhum empreendimento fecha com esse cliente nos filtros atuais. Tente aumentar FGTS, entrada ou reforço anual — ou desligue “Só quem fecha”."
                      : "Nenhum empreendimento com esses filtros."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFiltros(filtrosMercadoVazios)}
                  >
                    <X className="mr-2 h-4 w-4" /> Limpar filtros
                  </Button>
                </CardContent>
              </Card>
            ) : view === "tabela" ? (
              <TabelaResultados
                itens={filtrados}
                poder={poder}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                shortlistIds={shortlistSet}
                onToggleShortlist={alternarShortlist}
              />
            ) : (
              <ListaResultados
                itens={filtrados}
                poder={poder}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                shortlistIds={shortlistSet}
                onToggleShortlist={alternarShortlist}
              />
            )}
          </div>
        </>
      )}

      <VitrineShortlist
        projects={shortlist}
        leadId={lead?.id ?? null}
        leadName={lead?.nome}
        onRemove={(id) => setShortlistIds((atual) => atual.filter((item) => item !== id))}
        onClear={() => setShortlistIds([])}
      />

      <VitrinePanel
        projeto={selecionado?.projeto ?? null}
        lead={lead}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onEnviar={handleEnviar}
      />
      <EnviarVitrineDialog projeto={pickerProjeto} onClose={() => setPickerProjeto(null)} />
    </div>
  );
}

function GrupoFiltro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
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

function ChipRow({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o;
        return (
          <Button
            key={o}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => onSelect(o)}
          >
            {o}
          </Button>
        );
      })}
    </div>
  );
}

function BotaoView({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** "34–48 m²", "34 m²" ou "A confirmar" — nunca " m²" sozinho. */
function metragemLabel(e: EmpreendimentoMercado): string {
  const medidas = [e.m2min, e.m2max].filter((v) => v != null);
  if (medidas.length === 0) return "A confirmar";
  return `${[...new Set(medidas)].join("–")} m²`;
}

const precoCard = (e: EmpreendimentoMercado): string =>
  e.precoMin == null ? "Sob consulta" : formatBRL(e.precoMin);

type ListaProps = {
  itens: EmpreendimentoMercado[];
  poder: PoderDeCompra | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  shortlistIds: Set<string>;
  onToggleShortlist: (id: string) => void;
};

function ListaResultados({
  itens,
  poder,
  hoveredId,
  onHover,
  onSelect,
  shortlistIds,
  onToggleShortlist,
}: ListaProps) {
  return (
    <div className="space-y-2.5">
      {itens.map((e) => {
        const projeto = e.projeto;
        const inShortlist = projeto != null && shortlistIds.has(projeto.id);
        const capaUrl = safeCatalogImageUrl(projeto?.capa_url);
        const enquadramento = poder ? classificar(e.precoMin, poder) : null;
        return (
          <article
            key={e.id}
            onClick={() => onSelect(e.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSelect(e.id);
            }}
            onMouseEnter={() => onHover(e.id)}
            onMouseLeave={() => onHover(null)}
            tabIndex={0}
            aria-label={`Abrir ${e.nome}`}
            className={cn(
              "cursor-pointer rounded-lg border border-l-[3px] border-l-transparent bg-card p-3.5 transition-all",
              "hover:-translate-y-px hover:border-primary/40 hover:border-l-amber-400 hover:shadow-sm",
              hoveredId === e.id && "border-primary/40 border-l-amber-400 shadow-sm",
              inShortlist && "border-primary/50 border-l-amber-400 ring-1 ring-primary/20",
            )}
          >
            {capaUrl && (
              <img
                src={capaUrl}
                alt={`Capa de ${e.nome}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="mb-3 h-28 w-full rounded-md object-cover"
              />
            )}
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold leading-tight text-foreground">{e.nome}</h3>
              {projeto ? (
                <Button
                  type="button"
                  size="sm"
                  variant={inShortlist ? "default" : "outline"}
                  className="min-h-11 shrink-0"
                  aria-pressed={inShortlist}
                  disabled={!inShortlist && shortlistIds.size >= 3}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleShortlist(projeto.id);
                  }}
                >
                  {inShortlist ? "Selecionado" : "Comparar"}
                </Button>
              ) : (
                <BadgeForaDoCatalogo />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {e.construtora && (
                <span className="font-semibold text-foreground/70">{e.construtora}</span>
              )}
              <span>·</span>
              <span>{[`Zona ${e.zona}`, e.bairro].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">a partir de</div>
                <div className="text-lg font-extrabold tabular-nums">{precoCard(e)}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {enquadramento && (
                  <BadgeEnquadramento
                    enquadramento={enquadramento}
                    cobertura={coberturaPercentual(e.precoMin, poder)}
                  />
                )}
                <span className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold">
                  {formatDormsRange(e.dormsMin, e.dormsMax) ?? "dorms a confirmar"}
                </span>
                <BadgeSituacao entrega={e.entrega} situacao={e.situacao} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {projeto ? (
                <>
                  <Fato
                    label="Disponibilidade"
                    value={projeto.disponibilidade_resumo || "Confirmar estoque"}
                  />
                  <Fato
                    label="Comissão"
                    value={
                      projeto.percentual_comissao == null
                        ? "A confirmar"
                        : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(projeto.percentual_comissao)}%`
                    }
                  />
                  <Fato
                    label="Renda mínima"
                    value={
                      projeto.renda_minima == null ? "A confirmar" : formatBRL(projeto.renda_minima)
                    }
                  />
                  <Fato label="Entrega" value={e.entrega} />
                </>
              ) : (
                <>
                  <Fato
                    label="Faixa de preço"
                    value={
                      e.precoMax != null && e.precoMax !== e.precoMin
                        ? `até ${formatBRL(e.precoMax)}`
                        : "sem faixa na planilha"
                    }
                  />
                  <Fato label="Metragem" value={metragemLabel(e)} />
                  <Fato label="Cidade" value={e.cidade || "A confirmar"} />
                  <Fato label="Atualizado" value={e.atualizadoEm || "sem data"} />
                </>
              )}
            </div>
            {(e.bookUrl || e.tabelaUrl) && !projeto && (
              <div className="mt-2 flex gap-3 text-xs">
                {e.bookUrl && <LinkExterno href={e.bookUrl} label="Book" />}
                {e.tabelaUrl && <LinkExterno href={e.tabelaUrl} label="Tabela de preços" />}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function LinkExterno({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="font-semibold text-primary underline underline-offset-2"
    >
      {label}
    </a>
  );
}

function BadgeForaDoCatalogo() {
  return (
    <span
      title="Está na planilha de mercado, mas ainda não é projeto no CRM — cadastre para comparar e enviar pelo sistema."
      className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800"
    >
      Fora do catálogo
    </span>
  );
}

function BadgeEnquadramento({
  enquadramento,
  cobertura,
}: {
  enquadramento: Enquadramento;
  cobertura: number | null;
}) {
  const conteudo: Record<Enquadramento, { texto: string; tom: string }> = {
    fecha: { texto: "Fecha", tom: "bg-emerald-100 text-emerald-800" },
    otimista: { texto: "Fecha a 25%", tom: "bg-sky-100 text-sky-800" },
    "nao-fecha": { texto: "Não fecha", tom: "bg-muted text-muted-foreground" },
    "sem-preco": { texto: "Sem preço", tom: "bg-muted text-muted-foreground" },
  };
  const { texto, tom } = conteudo[enquadramento];
  return (
    <span
      className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", tom)}
      title={cobertura != null ? `Cliente cobre ${cobertura}% do valor` : undefined}
    >
      {texto}
      {cobertura != null && enquadramento !== "sem-preco" ? ` · ${cobertura}%` : ""}
    </span>
  );
}

function Fato({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-2">
      <span className="block text-muted-foreground">{label}</span>
      <span className="mt-0.5 block font-semibold text-foreground">{value}</span>
    </div>
  );
}

function safeCatalogImageUrl(value?: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function TabelaResultados({
  itens,
  poder,
  hoveredId,
  onHover,
  onSelect,
  shortlistIds,
  onToggleShortlist,
}: ListaProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th className="px-3 py-2.5 font-bold">Empreendimento</th>
            <th className="px-3 py-2.5 font-bold">Zona / Bairro</th>
            <th className="px-3 py-2.5 text-right font-bold">A partir de</th>
            {poder && <th className="px-3 py-2.5 font-bold">Cliente</th>}
            <th className="px-3 py-2.5 font-bold">Situação</th>
            <th className="px-3 py-2.5 text-right font-bold">Comparar</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((e) => {
            const projeto = e.projeto;
            const inShortlist = projeto != null && shortlistIds.has(projeto.id);
            return (
              <tr
                key={e.id}
                onClick={() => onSelect(e.id)}
                onMouseEnter={() => onHover(e.id)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/60",
                  hoveredId === e.id && "bg-accent/60",
                  inShortlist && "bg-primary/5",
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold">{e.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.construtora ?? "—"}
                    {e.origem === "planilha" && " · fora do catálogo"}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  Zona {e.zona}
                  {e.bairro && <div className="text-xs text-muted-foreground">{e.bairro}</div>}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">{precoCard(e)}</td>
                {poder && (
                  <td className="px-3 py-2.5">
                    <BadgeEnquadramento
                      enquadramento={classificar(e.precoMin, poder)}
                      cobertura={coberturaPercentual(e.precoMin, poder)}
                    />
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <BadgeSituacao entrega={e.entrega} situacao={e.situacao} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {projeto ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={inShortlist ? "default" : "outline"}
                      className="h-8"
                      aria-pressed={inShortlist}
                      disabled={!inShortlist && shortlistIds.size >= 3}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleShortlist(projeto.id);
                      }}
                    >
                      {inShortlist ? "Sim" : "Adicionar"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BadgeSituacao({ entrega, situacao }: { entrega: string; situacao: Situacao }) {
  const tone =
    situacao === "Pronto"
      ? "bg-emerald-100 text-emerald-800"
      : situacao === "Lançamento"
        ? "bg-amber-100 text-amber-800"
        : situacao === "Em obras"
          ? "bg-sky-100 text-sky-800"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", tone)}>{entrega}</span>
  );
}

function MapaSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-[58vh] min-h-[380px] w-full rounded-xl lg:h-[68vh]" />
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
