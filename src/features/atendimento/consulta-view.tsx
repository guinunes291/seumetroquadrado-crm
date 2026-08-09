// Modo Consulta de Atender (item 2.7): a antiga /leads como terceira
// intensidade — buscar um lead e agir, sem sair de Atender. Os dados vêm da
// MESMA query de /leads (fetchLeadsFiltered + recortesClientSide, fonte
// única: encadeamento v4 → v3 → v2 → v1) — as duas telas nunca divergem por
// construção.
//
// PR (b): o conjunto COMPLETO de filtros de /leads vive aqui num drawer
// (wireframe: "a antiga lista /leads, com filtros no drawer") — etapa,
// temperatura, origem, contato, parado, período (com intervalo custom),
// corretor e lixeira (gestão). Na régua primária ficam só a busca e o botão
// [Filtros] com o contador de ativos. O que ainda fica em /leads até o
// PR (c): kanban, sort por coluna, ações em massa e importação — o link
// "Abrir em Meus Leads" leva para lá preservando o recorte inteiro.

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Phone,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { LeadPeekDrawer } from "@/features/leads/lead-peek-drawer";
import { fetchLeadsFiltered, recortesClientSide } from "@/features/leads/leads-query";
import { ORIGEM_OPTIONS } from "@/features/leads/novo-lead-dialog";
import type { Lead } from "@/features/leads/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_LABEL, leadStatusLabel } from "@/lib/leads";
import {
  CONTATO_OPCOES,
  PARADO_OPCOES,
  PERIODO_OPTIONS,
  rangeDoPeriodo,
  type Periodo,
} from "@/lib/leads-views";
import { origemLabel } from "@/lib/origem";
import { normalizeSearch, onlyDigits } from "@/lib/validators";

const PAGE_SIZE = 50;

const FILTROS_PADRAO = {
  status: "all",
  temperatura: "all",
  origem: "all",
  corretor: "all",
  contato: "all",
  paradoDias: "all",
  periodo: "all" as Periodo,
  dataInicio: "",
  dataFim: "",
  lixeira: false,
};

type Filtros = typeof FILTROS_PADRAO;

export function ConsultaView() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const abrirWhatsApp = useWhatsAppLead();
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [peek, setPeek] = useState<Lead | null>(null);

  const setFiltro = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Mudar qualquer recorte volta para a primeira página.
  useEffect(() => {
    setPage(1);
  }, [buscaDebounced, filtros]);

  const paradoDiasNum = filtros.paradoDias === "all" ? null : Number(filtros.paradoDias);
  const range = useMemo(
    () => rangeDoPeriodo(filtros.periodo, filtros.dataInicio, filtros.dataFim),
    [filtros.periodo, filtros.dataInicio, filtros.dataFim],
  );

  // Quantos filtros fogem do padrão — vira o contador do botão [Filtros].
  const ativos =
    (["status", "temperatura", "origem", "corretor", "contato", "paradoDias"] as const).filter(
      (k) => filtros[k] !== "all",
    ).length +
    (filtros.periodo !== "all" ? 1 : 0) +
    (filtros.lixeira ? 1 : 0);

  // Corretores para o filtro da gestão — mesma queryKey de /leads (cache único).
  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const consultaQ = useQuery({
    queryKey: ["atendimento:consulta", { buscaDebounced, filtros, page, uid: user?.id }],
    enabled: !!user,
    queryFn: () =>
      fetchLeadsFiltered({
        // Mesma normalização de busca de /leads (nome/e-mail + dígitos do
        // telefone). Escopo por papel é do servidor (RLS/RPC), como lá.
        params: {
          _na_lixeira: filtros.lixeira,
          _status: filtros.status,
          _origem: filtros.origem,
          _corretor: filtros.corretor,
          _temperatura: filtros.temperatura,
          _periodo_start: range.start ? range.start.toISOString() : undefined,
          _periodo_end: range.end ? range.end.toISOString() : undefined,
          _search: buscaDebounced ? normalizeSearch(buscaDebounced).replace(/[%,]/g, "") : "",
          _search_digits: buscaDebounced ? onlyDigits(buscaDebounced) : "",
        },
        contato: filtros.contato,
        paradoDias: paradoDiasNum,
        sort: null,
        sortDir: null,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const rowsBrutos = consultaQ.data?.rows;
  const source = consultaQ.data?.source ?? "v4";

  // Espelho de /leads no fallback v1: "com follow-up" precisa dos ids de
  // tarefas abertas (a v2+ resolve no servidor e devolve tem_followup).
  const { data: followupIds } = useQuery({
    queryKey: ["followup-lead-ids", user?.id, canManage],
    enabled: filtros.contato === "com_followup" && source === "v1",
    queryFn: async () => {
      let q = supabase
        .from("tarefas")
        .select("lead_id")
        .eq("tipo", "follow_up")
        .in("status", ["pendente", "em_andamento"])
        .not("lead_id", "is", null);
      if (!canManage && user?.id) q = q.eq("corretor_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.lead_id as string));
    },
  });

  // Recortes transitórios v1/v2 no cliente — MESMA função de /leads.
  const visiveis = useMemo(
    () =>
      rowsBrutos
        ? recortesClientSide(rowsBrutos, source, filtros.contato, filtros.paradoDias, followupIds)
        : [],
    [rowsBrutos, source, filtros.contato, filtros.paradoDias, followupIds],
  );
  // No fallback v1 com filtro de contato a paginação é client-side (como lá).
  const serverPaginated = source !== "v1" || filtros.contato === "all";
  const total = serverPaginated
    ? Number(rowsBrutos?.[0]?.total_count ?? visiveis.length)
    : visiveis.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const rows = serverPaginated
    ? visiveis
    : visiveis.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const limparFiltros = () => setFiltros(FILTROS_PADRAO);

  // O drill para /leads preserva o recorte inteiro (FILTRO_URL_KEYS).
  const searchParaLeads = {
    status: filtros.status !== "all" ? filtros.status : undefined,
    temperatura: filtros.temperatura !== "all" ? filtros.temperatura : undefined,
    origem: filtros.origem !== "all" ? filtros.origem : undefined,
    corretor: filtros.corretor !== "all" ? filtros.corretor : undefined,
    contato: filtros.contato !== "all" ? filtros.contato : undefined,
    paradoDias: filtros.paradoDias !== "all" ? filtros.paradoDias : undefined,
    periodo: filtros.periodo !== "all" ? filtros.periodo : undefined,
    dataInicio: filtros.dataInicio || undefined,
    dataFim: filtros.dataFim || undefined,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="pl-8"
            aria-label="Buscar lead"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setFiltrosOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" /> Filtros
          {ativos > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5">
              {ativos}
            </Badge>
          )}
        </Button>
        {ativos > 0 && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            <X className="h-4 w-4" /> Limpar
          </Button>
        )}
        {/* Até o PR (c): kanban, sort por coluna, ações em massa e importação
            continuam em /leads — o link preserva o recorte atual. */}
        <Button asChild variant="ghost" size="sm">
          <Link to="/leads" search={searchParaLeads}>
            Abrir em Meus Leads
          </Link>
        </Button>
      </div>

      <Sheet open={filtrosOpen} onOpenChange={setFiltrosOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filtros da consulta</SheetTitle>
            <SheetDescription>
              Os mesmos recortes de Meus Leads — o resultado atualiza na hora.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label>Etapa</Label>
              <Select value={filtros.status} onValueChange={(v) => setFiltro("status", v)}>
                <SelectTrigger aria-label="Filtrar por etapa">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as etapas</SelectItem>
                  {Object.entries(LEAD_STATUS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Temperatura</Label>
              <Select
                value={filtros.temperatura}
                onValueChange={(v) => setFiltro("temperatura", v)}
              >
                <SelectTrigger aria-label="Filtrar por temperatura">
                  <SelectValue placeholder="Temperatura" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas temperaturas</SelectItem>
                  <SelectItem value="quente">🔥 Quente</SelectItem>
                  <SelectItem value="morno">🌡️ Morno</SelectItem>
                  <SelectItem value="frio">❄️ Frio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Origem</Label>
              <Select value={filtros.origem} onValueChange={(v) => setFiltro("origem", v)}>
                <SelectTrigger aria-label="Filtrar por origem">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {ORIGEM_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {origemLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Contato</Label>
              <Select value={filtros.contato} onValueChange={(v) => setFiltro("contato", v)}>
                <SelectTrigger aria-label="Filtrar por contato">
                  <SelectValue placeholder="Contato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer contato</SelectItem>
                  {CONTATO_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Parado há</Label>
              <Select value={filtros.paradoDias} onValueChange={(v) => setFiltro("paradoDias", v)}>
                <SelectTrigger aria-label="Filtrar por tempo parado">
                  <SelectValue placeholder="Parado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer tempo</SelectItem>
                  {PARADO_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Período</Label>
              <Select
                value={filtros.periodo}
                onValueChange={(v) => setFiltro("periodo", v as Periodo)}
              >
                <SelectTrigger aria-label="Filtrar por período">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {PERIODO_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filtros.periodo === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={filtros.dataInicio}
                    onChange={(e) => setFiltro("dataInicio", e.target.value)}
                    className="pl-9"
                    aria-label="Data inicial"
                  />
                </div>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={filtros.dataFim}
                    onChange={(e) => setFiltro("dataFim", e.target.value)}
                    className="pl-9"
                    aria-label="Data final"
                  />
                </div>
              </div>
            )}
            {canManage && (
              <div className="grid gap-1.5">
                <Label>Corretor</Label>
                <Select value={filtros.corretor} onValueChange={(v) => setFiltro("corretor", v)}>
                  <SelectTrigger aria-label="Filtrar por corretor">
                    <SelectValue placeholder="Corretor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os corretores</SelectItem>
                    <SelectItem value="unassigned">Sem corretor</SelectItem>
                    {(corretores ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {canManage && (
              <Button
                variant="ghost"
                className="justify-start"
                aria-pressed={filtros.lixeira}
                onClick={() => setFiltro("lixeira", !filtros.lixeira)}
              >
                {filtros.lixeira ? "Ver ativos" : "Ver lixeira"}
              </Button>
            )}
            <div className="flex items-center justify-between border-t pt-3">
              <Button variant="ghost" size="sm" onClick={limparFiltros} disabled={ativos === 0}>
                Limpar filtros
              </Button>
              <Button size="sm" onClick={() => setFiltrosOpen(false)}>
                Ver resultados
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AsyncBoundary
        isLoading={consultaQ.isLoading}
        isError={consultaQ.isError}
        error={consultaQ.error}
        errorTitle="Não foi possível buscar os leads."
        onRetry={() => void consultaQ.refetch()}
        loadingLabel="Buscando leads"
        loadingFallback={
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum lead encontrado"
            description="Ajuste a busca ou os filtros — o recorte atual não devolveu ninguém."
            className="py-12"
          />
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground" aria-live="polite">
              {total} lead{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` · página ${pageSafe} de ${totalPages}` : ""}
            </div>
            {rows.map((lead) => (
              <div
                key={lead.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("a,button,input")) return;
                  setPeek(lead);
                }}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{lead.nome}</span>
                    <TemperatureChip temperatura={lead.temperatura} size="sm" pulse={false} />
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {leadStatusLabel(lead.status)}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {lead.telefone}
                    {lead.projeto_nome ? ` · ${lead.projeto_nome}` : ""}
                    {lead.ultima_interacao
                      ? ` · contato ${formatRelativeTime(lead.ultima_interacao)}`
                      : " · sem contato registrado"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-success hover:bg-success/10"
                    title="WhatsApp"
                    onClick={() =>
                      abrirWhatsApp({
                        id: lead.id,
                        nome: lead.nome,
                        telefone: lead.telefone,
                        projeto_nome: lead.projeto_nome,
                      })
                    }
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    asChild
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-info hover:bg-info/10"
                    title="Ligar"
                  >
                    <a href={`tel:${lead.telefone.replace(/\D/g, "")}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </AsyncBoundary>

      {/* Dossiê-relâmpago: mesmas ações de 1 clique da lista de /leads —
          registrar contato, mudar etapa e WhatsApp sem abrir o lead. */}
      <LeadPeekDrawer
        lead={peek}
        onOpenChange={(o) => !o && setPeek(null)}
        onWhatsApp={(l) =>
          abrirWhatsApp({
            id: l.id,
            nome: l.nome,
            telefone: l.telefone,
            projeto_nome: l.projeto_nome,
          })
        }
      />
    </div>
  );
}
