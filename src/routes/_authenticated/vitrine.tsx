import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  X,
  LayoutList,
  Table as TableIcon,
  AlertTriangle,
  RefreshCw,
  User,
  Layers,
  MapPinned,
} from "lucide-react";
import type { ProjetoRow } from "@/components/projeto-card";
import { formatBRL, formatDormsRange } from "@/lib/projetos";
import { VitrineMap, type MapMode } from "@/components/vitrine/vitrine-map";
import { VitrinePanel, type VitrineLead } from "@/components/vitrine/vitrine-panel";
import { EnviarVitrineDialog } from "@/components/vitrine/enviar-vitrine-dialog";
import { VitrineShortlist } from "@/components/vitrine/vitrine-shortlist-dialog";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { mensagemEmpreendimento, WHATSAPP_TITULO_EMPREENDIMENTO } from "@/lib/whatsapp";
import {
  applyVitrineFilters,
  deriveSituacao,
  entregaBadge,
  zonasDisponiveis,
  emptyVitrineFilters,
  type VitrineFilters,
  type Situacao,
  type DormFiltro,
  type VitrineSort,
} from "@/lib/vitrine/vitrine";
import { toggleVitrineShortlist } from "@/lib/vitrine-publica";
import { PROJETO_CRM_SELECT } from "@/lib/projetos-query";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ leadId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/vitrine")({
  head: () => ({ meta: [{ title: "Vitrine de Empreendimentos — Seu Metro Quadrado" }] }),
  validateSearch: searchSchema,
  component: VitrinePage,
});

const SITUACAO_CHIPS: (Situacao | "Todas")[] = ["Todas", "Pronto", "Em obras", "Lançamento"];
const DORM_CHIPS: DormFiltro[] = ["Todos", "1 dorm", "2+ dorms"];

function VitrinePage() {
  const { leadId } = Route.useSearch();
  const abrirWhatsApp = useWhatsAppLead();

  const [filters, setFilters] = useState<VitrineFilters>(emptyVitrineFilters);
  const [view, setView] = useState<"list" | "tabela">("list");
  const [mapMode, setMapMode] = useState<MapMode>("schematic");
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

  const leadQ = useQuery({
    queryKey: ["vitrine-lead", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<VitrineLead | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, projeto_nome")
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return (data as VitrineLead) ?? null;
    },
  });
  const lead = leadQ.data ?? null;

  const all = useMemo(() => projetosQ.data ?? [], [projetosQ.data]);
  const zonas = useMemo(() => zonasDisponiveis(all), [all]);
  const filtered = useMemo(() => applyVitrineFilters(all, filters), [all, filters]);
  const visibleIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);
  const comCoord = useMemo(() => all.filter((p) => p.lat != null && p.lng != null).length, [all]);
  const selected = useMemo(() => all.find((p) => p.id === selectedId) ?? null, [all, selectedId]);
  const shortlist = useMemo(
    () =>
      shortlistIds
        .map((id) => all.find((project) => project.id === id))
        .filter((project) => project != null),
    [all, shortlistIds],
  );
  const shortlistSet = useMemo(() => new Set(shortlistIds), [shortlistIds]);

  const set = (patch: Partial<VitrineFilters>) => setFilters((f) => ({ ...f, ...patch }));

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
        title="Vitrine de Empreendimentos"
        description="Ache no mapa o que cabe no perfil do lead — por zona, orçamento, dormitórios e situação — e mande o book, a tabela e a mensagem na hora."
      />

      {lead && (
        <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2 text-sm">
          <User className="h-4 w-4 text-primary" />
          <span>
            Vitrine para <b>{lead.nome}</b>
            {lead.projeto_nome ? ` · interesse: ${lead.projeto_nome}` : ""}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Buscar nome, construtora ou bairro…"
              className="pl-9"
            />
          </div>

          <FilterGroup label="Orçamento do cliente">
            <div className="flex items-center gap-1 rounded-md border px-2">
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="number"
                inputMode="numeric"
                step={10000}
                min={0}
                value={filters.budget ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  set({ budget: Number.isFinite(v) && v > 0 ? v : null });
                }}
                placeholder="R$ máx"
                className="h-9 w-28 border-0 px-1 shadow-none focus-visible:ring-0"
              />
              {filters.budget != null && (
                <button
                  type="button"
                  aria-label="Limpar orçamento"
                  onClick={() => set({ budget: null })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </FilterGroup>

          <FilterGroup label="Ordenar">
            <Select value={filters.sort} onValueChange={(v) => set({ sort: v as VitrineSort })}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preco-asc">Menor preço</SelectItem>
                <SelectItem value="preco-desc">Maior preço</SelectItem>
                <SelectItem value="az">Nome (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </FilterGroup>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {zonas.length > 0 && (
            <FilterGroup label="Zona">
              <ChipRow
                options={["Todas", ...zonas]}
                value={filters.zona}
                onSelect={(v) => set({ zona: v })}
              />
            </FilterGroup>
          )}
          <FilterGroup label="Situação">
            <ChipRow
              options={SITUACAO_CHIPS}
              value={filters.situacao}
              onSelect={(v) => set({ situacao: v as Situacao | "Todas" })}
            />
          </FilterGroup>
          <FilterGroup label="Dorms">
            <ChipRow
              options={DORM_CHIPS}
              value={filters.dorm}
              onSelect={(v) => set({ dorm: v as DormFiltro })}
            />
          </FilterGroup>
        </div>
      </div>

      {projetosQ.isLoading ? (
        <VitrineSkeleton />
      ) : projetosQ.isError ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive opacity-70" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar os empreendimentos. Verifique a conexão e tente de novo.
            </p>
            <Button variant="outline" size="sm" onClick={() => projetosQ.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Mapa */}
          <div className="space-y-2 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex overflow-hidden rounded-md border">
                <ViewButton
                  active={mapMode === "schematic"}
                  onClick={() => setMapMode("schematic")}
                >
                  <Layers className="h-4 w-4" /> Zonas
                </ViewButton>
                <ViewButton
                  active={mapMode === "geografico"}
                  onClick={() => setMapMode("geografico")}
                >
                  <MapPinned className="h-4 w-4" /> Geográfico
                </ViewButton>
              </div>
              <span className="text-xs text-muted-foreground">
                {comCoord}/{all.length} com localização
              </span>
            </div>
            <div className="h-[340px] lg:h-[560px]">
              <VitrineMap
                projetos={all}
                visibleIds={visibleIds}
                hoveredId={hoveredId}
                selectedId={selectedId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                mode={mapMode}
              />
            </div>
          </div>

          {/* Resultados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                <b className="tabular-nums text-foreground">{filtered.length}</b> empreendimento
                {filtered.length === 1 ? "" : "s"}
                {filters.budget != null && ` que cabem em ${formatBRL(filters.budget)}`}
              </div>
              <div className="flex overflow-hidden rounded-md border">
                <ViewButton active={view === "list"} onClick={() => setView("list")}>
                  <LayoutList className="h-4 w-4" /> Lista
                </ViewButton>
                <ViewButton active={view === "tabela"} onClick={() => setView("tabela")}>
                  <TableIcon className="h-4 w-4" /> Tabela
                </ViewButton>
              </div>
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="space-y-2 py-12 text-center text-muted-foreground">
                  <p>Nenhum empreendimento com esses filtros.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters(emptyVitrineFilters)}
                  >
                    <X className="mr-2 h-4 w-4" /> Limpar filtros
                  </Button>
                </CardContent>
              </Card>
            ) : view === "tabela" ? (
              <ResultsTable
                projetos={filtered}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                shortlistIds={shortlistSet}
                onToggleShortlist={(id) =>
                  setShortlistIds((current) => toggleVitrineShortlist(current, id))
                }
              />
            ) : (
              <ResultsList
                projetos={filtered}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                shortlistIds={shortlistSet}
                onToggleShortlist={(id) =>
                  setShortlistIds((current) => toggleVitrineShortlist(current, id))
                }
              />
            )}
          </div>
        </div>
      )}

      <VitrineShortlist
        projects={shortlist}
        leadId={lead?.id ?? null}
        leadName={lead?.nome}
        onRemove={(id) => setShortlistIds((current) => current.filter((item) => item !== id))}
        onClear={() => setShortlistIds([])}
      />

      <VitrinePanel
        projeto={selected}
        lead={lead}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onEnviar={handleEnviar}
      />
      <EnviarVitrineDialog projeto={pickerProjeto} onClose={() => setPickerProjeto(null)} />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
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

function ViewButton({
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

const precoCard = (p: ProjetoRow): string =>
  p.sob_consulta || p.preco_a_partir == null ? "Sob consulta" : formatBRL(p.preco_a_partir);

function ResultsList({
  projetos,
  hoveredId,
  onHover,
  onSelect,
  shortlistIds,
  onToggleShortlist,
}: {
  projetos: ProjetoRow[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  shortlistIds: Set<string>;
  onToggleShortlist: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {projetos.map((p) => {
        const zona = p.zona_smq?.trim();
        const inShortlist = shortlistIds.has(p.id);
        const capaUrl = safeCatalogImageUrl(p.capa_url);
        return (
          <article
            key={p.id}
            onClick={() => onSelect(p.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSelect(p.id);
            }}
            onMouseEnter={() => onHover(p.id)}
            onMouseLeave={() => onHover(null)}
            tabIndex={0}
            aria-label={`Abrir ${p.nome}`}
            className={cn(
              "cursor-pointer rounded-lg border border-l-[3px] border-l-transparent bg-card p-3.5 transition-all",
              "hover:-translate-y-px hover:border-primary/40 hover:border-l-amber-400 hover:shadow-sm",
              hoveredId === p.id && "border-primary/40 border-l-amber-400 shadow-sm",
              inShortlist && "border-primary/50 border-l-amber-400 ring-1 ring-primary/20",
            )}
          >
            {capaUrl && (
              <img
                src={capaUrl}
                alt={`Capa de ${p.nome}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="mb-3 h-28 w-full rounded-md object-cover"
              />
            )}
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold leading-tight text-foreground">{p.nome}</h3>
              <Button
                type="button"
                size="sm"
                variant={inShortlist ? "default" : "outline"}
                className="min-h-11 shrink-0"
                aria-pressed={inShortlist}
                disabled={!inShortlist && shortlistIds.size >= 3}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleShortlist(p.id);
                }}
              >
                {inShortlist ? "Selecionado" : "Comparar"}
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {p.construtora && (
                <span className="font-semibold text-foreground/70">{p.construtora}</span>
              )}
              <span>·</span>
              <span>
                {[zona ? `Zona ${zona}` : null, p.bairro].filter(Boolean).join(" · ") ||
                  "Local a confirmar"}
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-muted-foreground">a partir de</div>
                <div className="text-lg font-extrabold tabular-nums">{precoCard(p)}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold">
                  {formatDormsRange(p.dorms_min, p.dorms_max) ?? "dorms a confirmar"}
                </span>
                <SituacaoBadge p={p} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <CommercialFact
                label="Disponibilidade"
                value={p.disponibilidade_resumo || "Confirmar estoque"}
              />
              <CommercialFact
                label="Comissão"
                value={
                  p.percentual_comissao == null
                    ? "A confirmar"
                    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(p.percentual_comissao)}%`
                }
              />
              <CommercialFact
                label="Renda mínima"
                value={p.renda_minima == null ? "A confirmar" : formatBRL(p.renda_minima)}
              />
              <CommercialFact label="Entrega" value={entregaBadge(p)} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CommercialFact({ label, value }: { label: string; value: string }) {
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

function ResultsTable({
  projetos,
  hoveredId,
  onHover,
  onSelect,
  shortlistIds,
  onToggleShortlist,
}: {
  projetos: ProjetoRow[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  shortlistIds: Set<string>;
  onToggleShortlist: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-bold">Empreendimento</th>
            <th className="px-3 py-2.5 font-bold">Zona / Bairro</th>
            <th className="px-3 py-2.5 text-right font-bold">A partir de</th>
            <th className="px-3 py-2.5 font-bold">Dorms</th>
            <th className="px-3 py-2.5 font-bold">Situação</th>
            <th className="px-3 py-2.5 text-right font-bold">Comparar</th>
          </tr>
        </thead>
        <tbody>
          {projetos.map((p) => {
            const zona = p.zona_smq?.trim();
            const inShortlist = shortlistIds.has(p.id);
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                onMouseEnter={() => onHover(p.id)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/60",
                  hoveredId === p.id && "bg-accent/60",
                  inShortlist && "bg-primary/5",
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold">{p.nome}</div>
                  {p.construtora && (
                    <div className="text-xs text-muted-foreground">{p.construtora}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {zona ? `Zona ${zona}` : "—"}
                  {p.bairro && <div className="text-xs text-muted-foreground">{p.bairro}</div>}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">{precoCard(p)}</td>
                <td className="px-3 py-2.5">{formatDormsRange(p.dorms_min, p.dorms_max) ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <SituacaoBadge p={p} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant={inShortlist ? "default" : "outline"}
                    className="h-8"
                    aria-pressed={inShortlist}
                    disabled={!inShortlist && shortlistIds.size >= 3}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleShortlist(p.id);
                    }}
                  >
                    {inShortlist ? "Sim" : "Adicionar"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SituacaoBadge({ p }: { p: ProjetoRow }) {
  const sit = deriveSituacao(p);
  const tone =
    sit === "Pronto"
      ? "bg-emerald-100 text-emerald-800"
      : sit === "Lançamento"
        ? "bg-amber-100 text-amber-800"
        : sit === "Em obras"
          ? "bg-sky-100 text-sky-800"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", tone)}>
      {entregaBadge(p)}
    </span>
  );
}

function VitrineSkeleton() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Skeleton className="h-[340px] w-full rounded-lg lg:h-[560px]" />
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
