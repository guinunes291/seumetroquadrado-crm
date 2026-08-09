// Modo Consulta de Atender (item 2.7, PR a): a antiga /leads como terceira
// intensidade — buscar um lead pelo nome/telefone e agir, sem sair de Atender.
// Os dados vêm da MESMA query de /leads (fetchLeadsFiltered, fonte única:
// encadeamento v4 → v3 → v2 → v1) — as duas telas nunca divergem por
// construção. Nesta primeira entrega ficam os filtros essenciais (busca,
// etapa, temperatura, parado há X+ dias); o conjunto completo migra para um
// drawer no PR (b) do 2.7, e só então /leads vira redirect (PR c). Até lá, o
// link "Filtros completos" leva para /leads preservando o recorte atual.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Phone,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { LeadPeekDrawer } from "@/features/leads/lead-peek-drawer";
import { fetchLeadsFiltered } from "@/features/leads/leads-query";
import type { Lead } from "@/features/leads/types";
import { useAuth } from "@/hooks/use-auth";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_LABEL, leadStatusLabel } from "@/lib/leads";
import { PARADO_OPCOES } from "@/lib/leads-views";
import { normalizeSearch, onlyDigits } from "@/lib/validators";

const PAGE_SIZE = 50;

const TEMPERATURAS = [
  { value: "quente", label: "Quente" },
  { value: "morno", label: "Morno" },
  { value: "frio", label: "Frio" },
] as const;

export function ConsultaView() {
  const { user } = useAuth();
  const abrirWhatsApp = useWhatsAppLead();
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [temperatura, setTemperatura] = useState("all");
  const [paradoDias, setParadoDias] = useState("all");
  const [page, setPage] = useState(1);
  const [peek, setPeek] = useState<Lead | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Mudar qualquer recorte volta para a primeira página.
  useEffect(() => {
    setPage(1);
  }, [buscaDebounced, status, temperatura, paradoDias]);

  const paradoDiasNum = paradoDias === "all" ? null : Number(paradoDias);

  const consultaQ = useQuery({
    queryKey: [
      "atendimento:consulta",
      { buscaDebounced, status, temperatura, paradoDias, page, uid: user?.id },
    ],
    enabled: !!user,
    queryFn: () =>
      fetchLeadsFiltered({
        // Mesma normalização de busca de /leads (nome/e-mail + dígitos do
        // telefone). Escopo por papel é do servidor (RLS/RPC), como lá.
        params: {
          _na_lixeira: false,
          _status: status,
          _origem: "all",
          _corretor: "all",
          _temperatura: temperatura,
          _search: buscaDebounced ? normalizeSearch(buscaDebounced).replace(/[%,]/g, "") : "",
          _search_digits: buscaDebounced ? onlyDigits(buscaDebounced) : "",
        },
        contato: "all",
        paradoDias: paradoDiasNum,
        sort: null,
        sortDir: null,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const rows = consultaQ.data?.rows ?? [];
  const total = Number(rows[0]?.total_count ?? rows.length);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filtrar por etapa">
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
        <Select value={temperatura} onValueChange={setTemperatura}>
          <SelectTrigger className="w-32" aria-label="Filtrar por temperatura">
            <SelectValue placeholder="Temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer temp.</SelectItem>
            {TEMPERATURAS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paradoDias} onValueChange={setParadoDias}>
          <SelectTrigger className="w-32" aria-label="Filtrar por tempo parado">
            <SelectValue placeholder="Parado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Parado (todos)</SelectItem>
            {PARADO_OPCOES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                Parado {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Ponte honesta até o PR (b): o que a Consulta ainda não filtra
            (origem, período, contato, corretor) vive em /leads — o link
            preserva o recorte atual via drill-through padrão. */}
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/leads"
            search={{
              status: status !== "all" ? status : undefined,
              temperatura: temperatura !== "all" ? temperatura : undefined,
              paradoDias: paradoDias !== "all" ? paradoDias : undefined,
            }}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filtros completos
          </Link>
        </Button>
      </div>

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
            description="Ajuste a busca ou os filtros — ou use os filtros completos em Meus Leads."
            className="py-12"
          />
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground" aria-live="polite">
              {total} lead{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
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
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
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
