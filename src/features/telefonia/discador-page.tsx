// /discador — a central de telefonia do CRM (Sonax PABX): o que tocou e o que
// foi discado, num lugar só. As linhas nascem da edge function sonax-discar
// (click-to-call) e do webhook sonax-webhook (receptivo/campanha); a RLS
// recorta — corretor vê as chamadas da própria carteira/ramal, gestão vê tudo.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowClockwise,
  Info,
  MagnifyingGlass,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneX,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { codigoDoErro, useLigarLead } from "@/hooks/use-ligar-lead";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeTime } from "@/lib/interacoes";
import { formatPhoneBR } from "@/lib/masks";
import { listarTelefoniaSonax } from "@/features/gestao/ramal-sonax-client";
import { contarChamadasHoje, listarChamadasRecentes, type Chamada } from "./chamadas-client";

const STATUS_LABEL: Record<string, string> = {
  iniciada: "Iniciada",
  chamando: "Chamando",
  falando: "Falando",
  atendida: "Atendida",
  concluida: "Concluída",
  nao_atendida: "Não atendida",
  falha: "Falha",
};

const ORIGEM_LABEL: Record<Chamada["origem"], string> = {
  click2call: "Click-to-call",
  campanha: "Campanha",
  receptivo: "Receptivo",
  agendada: "Agendada",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "nao_atendida" || status === "falha") return "destructive";
  if (status === "concluida") return "secondary";
  if (status === "atendida" || status === "falando") return "default";
  return "outline";
}

function formatDuracao(s: number | null): string {
  if (s === null || Number.isNaN(s)) return "—";
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

type LeadResumo = { id: string; nome: string; telefone: string };

// PostgREST monta o `.in()` na querystring da URL — com centenas de UUIDs a
// requisição estoura o limite. Busca em lotes e junta.
const TAMANHO_LOTE_IN = 100;
async function buscarEmLotes<T>(
  ids: string[],
  buscar: (lote: string[]) => Promise<T[]>,
): Promise<T[]> {
  const resultados: T[] = [];
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE_IN) {
    resultados.push(...(await buscar(ids.slice(i, i + TAMANHO_LOTE_IN))));
  }
  return resultados;
}

type LinhaChamada = Chamada & {
  leadNome: string | null;
  leadTelefone: string | null;
  corretorNome: string | null;
};

export function DiscadorCentral() {
  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const { ligar, discando } = useLigarLead();

  const [busca, setBusca] = useState("");
  const [direcao, setDirecao] = useState<"todas" | "entrada" | "saida">("todas");
  const [status, setStatus] = useState<string>("todos");

  const chamadasQ = useQuery({
    queryKey: ["chamadas:discador", user?.id],
    enabled: !!user,
    queryFn: () => listarChamadasRecentes(500),
  });
  // KPIs do dia por contagem no servidor: a lista é uma janela das 500 mais
  // recentes — num dia de campanha pesada, contar só a janela subconta.
  const kpisQ = useQuery({
    queryKey: ["chamadas:kpis-hoje", user?.id],
    enabled: !!user,
    queryFn: contarChamadasHoje,
  });
  useRealtimeInvalidate("chamadas", [["chamadas:discador"], ["chamadas:kpis-hoje"]]);

  const rows = useMemo(() => chamadasQ.data?.rows ?? [], [chamadasQ.data]);

  // Enriquecimento: nome/telefone do lead (para o link e o rediscar) e nome
  // do corretor (visão da gestão). RLS recorta o que cada papel enxerga.
  const leadIds = useMemo(
    () => Array.from(new Set(rows.map((c) => c.lead_id).filter((v): v is string => !!v))),
    [rows],
  );
  const leadsQ = useQuery({
    queryKey: ["chamadas:leads", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async (): Promise<Map<string, LeadResumo>> => {
      const linhas = await buscarEmLotes(leadIds, async (lote) => {
        const { data, error } = await supabase
          .from("leads")
          .select("id, nome, telefone")
          .in("id", lote);
        if (error) throw error;
        return data ?? [];
      });
      return new Map(linhas.map((l) => [l.id, l as LeadResumo]));
    },
  });

  const corretorIds = useMemo(
    () => Array.from(new Set(rows.map((c) => c.corretor_id).filter((v): v is string => !!v))),
    [rows],
  );
  const corretoresQ = useQuery({
    queryKey: ["chamadas:corretores", corretorIds],
    enabled: gestao && corretorIds.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const linhas = await buscarEmLotes(corretorIds, async (lote) => {
        const { data, error } = await supabase.from("profiles").select("id, nome").in("id", lote);
        if (error) throw error;
        return data ?? [];
      });
      return new Map(linhas.map((p) => [p.id, p.nome as string]));
    },
  });

  // Minha telefonia no PABX — ramal (click-to-call) e campanha (discador).
  const telefoniaQ = useQuery({
    queryKey: ["minha-telefonia-sonax", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const tel = await listarTelefoniaSonax([user!.id]);
      return tel[user!.id] ?? null;
    },
  });
  const meuRamal = telefoniaQ.data?.ramal_sonax ?? null;
  const temCampanha = Boolean(telefoniaQ.data?.sonax_id_campanha);

  // Tabulação -> etapa do funil: sincroniza automaticamente enquanto a aba
  // está aberta (e no botão). Idempotente — a function só processa tabulação
  // nova; quando aplica alguma, avisa e atualiza as listas.
  const qc = useQueryClient();
  const syncTabulacoes = useQuery({
    queryKey: ["sonax-tabulacoes-sync", user?.id],
    enabled: !!user && temCampanha,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sonax-tabulacoes", { body: {} });
      if (error) throw new Error((await codigoDoErro(error)) ?? error.message);
      const r = data as { aplicadas?: number; novas?: number };
      if ((r.aplicadas ?? 0) > 0) {
        toast.success(
          `Tabulação do discador: ${r.aplicadas} lead${(r.aplicadas ?? 0) > 1 ? "s" : ""} mudou de etapa.`,
        );
        qc.invalidateQueries({ queryKey: ["leads"] });
        qc.invalidateQueries({ queryKey: ["chamadas:discador"] });
      } else if ((r.novas ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ["chamadas:discador"] });
      }
      return r;
    },
  });

  const linhas = useMemo((): LinhaChamada[] => {
    const leads = leadsQ.data ?? new Map<string, LeadResumo>();
    const corretores = corretoresQ.data ?? new Map<string, string>();
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return rows
      .map((c) => {
        const lead = c.lead_id ? leads.get(c.lead_id) : undefined;
        return {
          ...c,
          leadNome: lead?.nome ?? null,
          leadTelefone: lead?.telefone ?? null,
          corretorNome: c.corretor_id ? (corretores.get(c.corretor_id) ?? null) : null,
        };
      })
      .filter((c) => {
        if (direcao !== "todas" && c.direcao !== direcao) return false;
        if (status !== "todos" && c.status !== status) return false;
        if (!q) return true;
        return (
          (qDigits.length > 0 && c.numero.includes(qDigits)) ||
          (c.leadNome ?? "").toLowerCase().includes(q)
        );
      });
  }, [rows, leadsQ.data, corretoresQ.data, busca, direcao, status]);

  const kpis = kpisQ.data ?? null;

  const columns = useMemo<ColumnDef<LinhaChamada, unknown>[]>(
    () => [
      {
        accessorKey: "criado_em",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Quando" />,
        meta: { label: "Quando" },
        cell: ({ row }) => (
          <span
            className="whitespace-nowrap text-muted-foreground"
            title={new Date(row.original.criado_em).toLocaleString("pt-BR")}
          >
            {formatRelativeTime(row.original.criado_em)}
          </span>
        ),
      },
      {
        id: "direcao",
        header: "Direção",
        enableSorting: false,
        meta: { label: "Direção", hideBelow: "sm" },
        cell: ({ row }) =>
          row.original.direcao === "entrada" ? (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <PhoneIncoming className="h-3.5 w-3.5 text-success" /> Recebida
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <PhoneOutgoing className="h-3.5 w-3.5 text-primary" /> Realizada
            </span>
          ),
      },
      {
        id: "lead",
        header: "Lead / Número",
        enableSorting: false,
        meta: { label: "Lead / Número" },
        cell: ({ row }) => (
          <div className="min-w-0">
            {row.original.lead_id ? (
              <Link
                to="/leads/$leadId"
                params={{ leadId: row.original.lead_id }}
                className="block truncate font-medium text-primary hover:underline"
              >
                {row.original.leadNome ?? "Lead"}
              </Link>
            ) : (
              <span className="text-muted-foreground">Sem lead</span>
            )}
            <div className="text-xs tabular-nums text-muted-foreground">
              {formatPhoneBR(row.original.numero)}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        meta: { label: "Status" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Badge variant={statusVariant(row.original.status)}>
              {STATUS_LABEL[row.original.status] ?? row.original.status}
            </Badge>
            {row.original.tabulacao && (
              <div
                className="mt-0.5 truncate text-xs text-muted-foreground"
                title={`Tabulação do discador: ${row.original.tabulacao}`}
              >
                {row.original.tabulacao}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "duracao",
        header: "Duração",
        enableSorting: false,
        meta: { label: "Duração", hideBelow: "md" },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDuracao(row.original.duracao_segundos)}
          </span>
        ),
      },
      {
        id: "origem",
        header: "Origem",
        enableSorting: false,
        meta: { label: "Origem", hideBelow: "lg" },
        cell: ({ row }) => <Badge variant="secondary">{ORIGEM_LABEL[row.original.origem]}</Badge>,
      },
      ...(gestao
        ? ([
            {
              id: "corretor",
              header: "Corretor",
              enableSorting: false,
              meta: { label: "Corretor", hideBelow: "lg" },
              cell: ({ row }) => (
                <span className="text-muted-foreground">
                  {row.original.corretorNome ?? row.original.ramal ?? "—"}
                </span>
              ),
            },
          ] satisfies ColumnDef<LinhaChamada, unknown>[])
        : []),
      {
        id: "acao",
        header: "",
        enableSorting: false,
        meta: { label: "Ação" },
        cell: ({ row }) =>
          row.original.lead_id && row.original.leadNome ? (
            <Button
              size="sm"
              variant="outline"
              disabled={discando}
              onClick={() =>
                ligar({
                  id: row.original.lead_id!,
                  nome: row.original.leadNome!,
                  telefone: row.original.leadTelefone ?? row.original.numero,
                })
              }
            >
              <Phone className="h-3.5 w-3.5 mr-1.5" /> Ligar
            </Button>
          ) : null,
      },
    ],
    [gestao, discando, ligar],
  );

  if (chamadasQ.data?.tabelaAusente) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            O Discador depende da migration de telefonia (<code>chamadas</code>), ainda não aplicada
            neste ambiente. Aplique o deploy do banco e volte aqui — o setup completo está em{" "}
            <code>docs/integracoes/sonax-discador.md</code>.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs do dia + meu ramal */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={PhoneCall} label="Chamadas hoje" valor={kpis ? String(kpis.total) : "…"} />
        <KpiCard
          icon={PhoneIncoming}
          label="Atendidas hoje"
          valor={kpis ? String(kpis.atendidas) : "…"}
        />
        <KpiCard icon={PhoneX} label="Perdidas hoje" valor={kpis ? String(kpis.perdidas) : "…"} />
        <KpiCard
          icon={Phone}
          label="Meu ramal"
          valor={meuRamal ?? "—"}
          hint={
            meuRamal
              ? "O click-to-call toca aqui antes de discar o lead."
              : "Sem ramal cadastrado — peça ao admin em Gestão → Corretores."
          }
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <MagnifyingGlass className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por lead ou número…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={direcao} onValueChange={(v) => setDirecao(v as typeof direcao)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="entrada">Recebidas</SelectItem>
            <SelectItem value="saida">Realizadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([valor, label]) => (
              <SelectItem key={valor} value={valor}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {temCampanha && (
          <Button
            variant="outline"
            disabled={syncTabulacoes.isFetching}
            onClick={() => void syncTabulacoes.refetch()}
            title="Puxa as tabulações aplicadas no painel do Sonax e move os leads de etapa conforme o mapeamento. Roda sozinho a cada 2 minutos com a aba aberta."
          >
            <ArrowClockwise
              className={`h-4 w-4 mr-2 ${syncTabulacoes.isFetching ? "animate-spin" : ""}`}
            />
            Sincronizar tabulações
          </Button>
        )}
      </div>

      <AsyncBoundary
        isLoading={chamadasQ.isLoading}
        isError={chamadasQ.isError}
        error={chamadasQ.error}
        errorTitle="Não foi possível carregar as chamadas."
        onRetry={() => void chamadasQ.refetch()}
        loadingLabel="Carregando chamadas"
        loadingFallback={
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <DataTable
          tableId="discador-chamadas"
          aria-label="Histórico de chamadas do discador"
          columns={columns}
          data={linhas}
          loading={chamadasQ.isLoading}
          empty={
            <EmptyState
              icon={PhoneCall}
              title={
                busca || direcao !== "todas" || status !== "todos"
                  ? "Nenhuma chamada para esses filtros."
                  : "Nenhuma chamada registrada ainda."
              }
              description={
                busca || direcao !== "todas" || status !== "todos"
                  ? "Ajuste os filtros ou limpe a busca."
                  : 'As ligações entram aqui pelo botão "Ligar" do lead (click-to-call) e pelos eventos do PABX Sonax (receptivo e campanhas do discador).'
              }
            />
          }
        />
      </AsyncBoundary>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  valor,
  hint,
}: {
  icon: typeof Phone;
  label: string;
  valor: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="mt-1 font-display text-2xl font-semibold tabular-nums" title={hint}>
          {valor}
        </div>
        {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
