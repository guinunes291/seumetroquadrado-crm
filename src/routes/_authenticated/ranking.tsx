import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  Medal,
  Award,
  Star,
  Zap,
  Flag,
  Timer,
  Users,
  TrendingUp,
  Maximize,
  RefreshCw,
  MessageSquare,
  Phone,
  CalendarCheck,
  FileCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ranking")({
  head: () => ({ meta: [{ title: "Ranking — Seu Metro Quadrado" }] }),
  component: RankingPage,
});

// ---------------- Pontuação ----------------
const PONTUACAO = {
  CLIENTE_CADASTRADO: 5,
  ALTERACAO_STATUS: 2,
  AGENDAMENTO: 15,
  VISITA: 25,
  DOCUMENTACAO: 35,
  VENDA: 80,
} as const;

const CORES_CORREDORES = [
  "from-red-500 to-red-600",
  "from-blue-500 to-blue-600",
  "from-green-500 to-green-600",
  "from-purple-500 to-purple-600",
  "from-orange-500 to-orange-600",
  "from-pink-500 to-pink-600",
  "from-cyan-500 to-cyan-600",
  "from-yellow-500 to-yellow-600",
];

type Periodo = "dia" | "semana" | "mes";

function periodRange(p: Periodo): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (p === "dia") {
    start.setHours(0, 0, 0, 0);
  } else if (p === "semana") {
    const day = start.getDay(); // 0 dom
    const diff = (day + 6) % 7; // segunda
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

function inRange(iso: string | null | undefined, start: Date, end: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

type Row = {
  corretorId: string;
  nome: string;
  avatar?: string | null;
  clientesCadastrados: number;
  alteracoes: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  ligacoes: number;
  whatsapp: number;
  pontos: number;
};

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function RankingPage() {
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const profQ = useQuery({
    queryKey: ["ranking:profiles:v2"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, avatar_url, foto_url");
      return data ?? [];
    },
  });
  const leadsQ = useQuery({
    queryKey: ["ranking:leads:v2"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("corretor_id, created_at");
      return data ?? [];
    },
  });
  const transQ = useQuery({
    queryKey: ["ranking:trans:v2"],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_status_transitions")
        .select("corretor_id, para_status, created_at");
      return data ?? [];
    },
  });
  const agendQ = useQuery({
    queryKey: ["ranking:agend:v2"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("corretor_id, status, data_inicio");
      return data ?? [];
    },
  });
  const interQ = useQuery({
    queryKey: ["ranking:inter:v2"],
    queryFn: async () => {
      const { data } = await supabase
        .from("interacoes")
        .select("autor_id, tipo, ocorreu_em")
        .in("tipo", ["whatsapp", "ligacao"]);
      return data ?? [];
    },
  });

  const refetchAll = () => {
    leadsQ.refetch();
    transQ.refetch();
    agendQ.refetch();
    interQ.refetch();
  };

  const ranking = useMemo<Row[]>(() => {
    const { start, end } = periodRange(periodo);
    const byId = new Map<string, Row>();
    const get = (id: string): Row => {
      let r = byId.get(id);
      if (!r) {
        const p = (profQ.data ?? []).find((x: any) => x.id === id);
        r = {
          corretorId: id,
          nome: p?.nome ?? "Corretor",
          avatar: p?.avatar_url ?? p?.foto_url ?? null,
          clientesCadastrados: 0,
          alteracoes: 0,
          agendamentos: 0,
          visitas: 0,
          documentacoes: 0,
          vendas: 0,
          ligacoes: 0,
          whatsapp: 0,
          pontos: 0,
        };
        byId.set(id, r);
      }
      return r;
    };

    for (const l of leadsQ.data ?? []) {
      if (!l.corretor_id) continue;
      if (!inRange(l.created_at, start, end)) continue;
      get(l.corretor_id).clientesCadastrados++;
    }
    for (const t of transQ.data ?? []) {
      if (!t.corretor_id) continue;
      if (!inRange(t.created_at, start, end)) continue;
      const r = get(t.corretor_id);
      r.alteracoes++;
      if (t.para_status === "agendado") r.agendamentos++;
      else if (t.para_status === "visita_realizada") r.visitas++;
      else if (t.para_status === "analise_credito") r.documentacoes++;
      else if (t.para_status === "contrato_fechado") r.vendas++;
    }
    for (const a of agendQ.data ?? []) {
      if (!a.corretor_id) continue;
      if (!inRange(a.data_inicio, start, end)) continue;
      if (a.status === "realizado") get(a.corretor_id).visitas++;
    }
    for (const i of interQ.data ?? []) {
      if (!i.autor_id) continue;
      if (!inRange(i.ocorreu_em, start, end)) continue;
      const r = get(i.autor_id);
      if (i.tipo === "ligacao") r.ligacoes++;
      else if (i.tipo === "whatsapp") r.whatsapp++;
    }

    for (const r of byId.values()) {
      r.pontos =
        r.clientesCadastrados * PONTUACAO.CLIENTE_CADASTRADO +
        r.alteracoes * PONTUACAO.ALTERACAO_STATUS +
        r.agendamentos * PONTUACAO.AGENDAMENTO +
        r.visitas * PONTUACAO.VISITA +
        r.documentacoes * PONTUACAO.DOCUMENTACAO +
        r.vendas * PONTUACAO.VENDA;
    }
    return Array.from(byId.values())
      .filter((r) => r.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos);
  }, [periodo, leadsQ.data, transQ.data, agendQ.data, interQ.data, profQ.data]);

  const totais = useMemo(
    () =>
      ranking.reduce(
        (acc, r) => ({
          ligacoes: acc.ligacoes + r.ligacoes,
          whatsapp: acc.whatsapp + r.whatsapp,
          agendamentos: acc.agendamentos + r.agendamentos,
          visitas: acc.visitas + r.visitas,
          documentacoes: acc.documentacoes + r.documentacoes,
          vendas: acc.vendas + r.vendas,
          pontos: acc.pontos + r.pontos,
        }),
        {
          ligacoes: 0,
          whatsapp: 0,
          agendamentos: 0,
          visitas: 0,
          documentacoes: 0,
          vendas: 0,
          pontos: 0,
        },
      ),
    [ranking],
  );

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const top3 = ranking.slice(0, 3);
  const [primeiro, segundo, terceiro] = [top3[0], top3[1], top3[2]];

  return (
    <div
      className={
        isFullscreen
          ? "min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white"
          : "p-6 space-y-6"
      }
    >
      <PageHeader
        title="Corrida dos Campeões"
        description="Quem será o campeão? Atualizado em tempo real."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetchAll}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
            <Button size="sm" onClick={toggleFullscreen}>
              <Maximize className="h-4 w-4 mr-2" />
              {isFullscreen ? "Sair" : "Tela Cheia"}
            </Button>
          </div>
        }
      />

      <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="dia">🏁 Hoje</TabsTrigger>
          <TabsTrigger value="semana">📅 Semana</TabsTrigger>
          <TabsTrigger value="mes">🏆 Mês</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={<Phone className="h-5 w-5" />}
          label="Ligações"
          value={totais.ligacoes}
          hint="Contatos realizados"
          gradient="from-blue-500 to-blue-600"
        />
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="WhatsApp"
          value={totais.whatsapp}
          hint="Mensagens enviadas"
          gradient="from-cyan-500 to-cyan-600"
        />
        <StatCard
          icon={<CalendarCheck className="h-5 w-5" />}
          label="Agendamentos"
          value={totais.agendamentos}
          hint={`+${totais.agendamentos * PONTUACAO.AGENDAMENTO} pontos`}
          gradient="from-purple-500 to-purple-600"
        />
        <StatCard
          icon={<Flag className="h-5 w-5" />}
          label="Visitas"
          value={totais.visitas}
          hint={`+${totais.visitas * PONTUACAO.VISITA} pontos`}
          gradient="from-orange-500 to-orange-600"
        />
        <StatCard
          icon={<Trophy className="h-5 w-5" />}
          label="Vendas"
          value={totais.vendas}
          hint={`+${totais.vendas * PONTUACAO.VENDA} pontos`}
          gradient="from-green-500 to-green-600"
        />
      </div>

      {ranking.length === 0 ? (
        <div className="text-center py-16 border rounded-2xl">
          <Trophy className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-40" />
          <h3 className="text-xl font-semibold mb-1">Nenhuma atividade registrada</h3>
          <p className="text-muted-foreground">
            As atividades dos corretores aparecerão aqui conforme forem realizadas.
          </p>
        </div>
      ) : (
        <>
          {/* Pódio */}
          <div className="relative">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white px-6 py-2 rounded-full shadow-lg">
                <Trophy className="w-5 h-5" />
                <span className="text-lg font-bold tracking-wide">PÓDIO DOS CAMPEÕES</span>
                <Trophy className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-end justify-center gap-4 md:gap-8">
              {segundo && <PodiumSpot row={segundo} place={2} />}
              {primeiro && <PodiumSpot row={primeiro} place={1} />}
              {terceiro && <PodiumSpot row={terceiro} place={3} />}
            </div>
          </div>

          {/* Pista */}
          <div className="bg-gradient-to-b from-green-900 to-green-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 text-white">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-400" />
                <span className="font-bold">PISTA DE CORRIDA</span>
              </div>
              <div className="flex items-center gap-2 opacity-80 text-sm">
                <Timer className="w-4 h-4" /> Atualização em tempo real
              </div>
            </div>
            <div className="space-y-3">
              {ranking.map((r, i) => {
                const maxP = ranking[0]?.pontos || 1;
                const progresso = Math.max((r.pontos / maxP) * 100, 6);
                const cor = CORES_CORREDORES[i % CORES_CORREDORES.length];
                return (
                  <div
                    key={r.corretorId}
                    className="h-16 bg-black/30 rounded-lg relative overflow-hidden border-2 border-dashed border-white/20"
                  >
                    <div className="absolute inset-0 flex">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <div key={j} className="flex-1 border-r border-white/10" />
                      ))}
                    </div>
                    <div
                      className={`absolute left-0 top-0 h-full bg-gradient-to-r ${cor} rounded-r-lg transition-all duration-1000 ease-out`}
                      style={{ width: `${progresso}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
                        <Avatar className="w-12 h-12 border-2 border-white shadow-lg">
                          <AvatarImage src={r.avatar ?? undefined} alt={r.nome} />
                          <AvatarFallback className={`bg-gradient-to-br ${cor} text-white font-bold`}>
                            {getInitials(r.nome)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          i === 0
                            ? "bg-yellow-500 text-white"
                            : i === 1
                              ? "bg-gray-400 text-white"
                              : i === 2
                                ? "bg-amber-700 text-white"
                                : "bg-white/20 text-white"
                        }`}
                      >
                        {i + 1}º
                      </div>
                      <span className="text-white font-semibold text-sm drop-shadow-lg">
                        {r.nome.split(" ")[0]}
                      </span>
                    </div>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                      <div className="bg-black/60 px-3 py-1 rounded-full">
                        <span className="text-white font-bold text-sm">{r.pontos} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg text-white">
                <Flag className="w-4 h-4" />
                <span className="font-semibold text-sm">LINHA DE CHEGADA</span>
              </div>
            </div>
          </div>

          {/* Tabela detalhada */}
          <div className="border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Desempenho detalhado
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr className="text-left">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Corretor</th>
                    <th className="px-3 py-2 text-center">Lig.</th>
                    <th className="px-3 py-2 text-center">WhatsApp</th>
                    <th className="px-3 py-2 text-center">Agend.</th>
                    <th className="px-3 py-2 text-center">Visitas</th>
                    <th className="px-3 py-2 text-center">Docs</th>
                    <th className="px-3 py-2 text-center">Vendas</th>
                    <th className="px-3 py-2 text-right">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.corretorId} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-semibold text-muted-foreground">{i + 1}º</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={r.avatar ?? undefined} alt={r.nome} />
                            <AvatarFallback className="text-xs">{getInitials(r.nome)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{r.nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">{r.ligacoes}</td>
                      <td className="px-3 py-2 text-center">{r.whatsapp}</td>
                      <td className="px-3 py-2 text-center">{r.agendamentos}</td>
                      <td className="px-3 py-2 text-center">{r.visitas}</td>
                      <td className="px-3 py-2 text-center">{r.documentacoes}</td>
                      <td className="px-3 py-2 text-center font-semibold">{r.vendas}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0">
                          {r.pontos}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Legenda */}
      <div className="border rounded-2xl p-4">
        <h3 className="font-bold flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-yellow-500" /> Sistema de Pontuação
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Legenda color="bg-blue-500" pts={PONTUACAO.CLIENTE_CADASTRADO} label="Cliente cadastrado" />
          <Legenda color="bg-gray-500" pts={PONTUACAO.ALTERACAO_STATUS} label="Alteração de status" />
          <Legenda color="bg-purple-500" pts={PONTUACAO.AGENDAMENTO} label="Agendamento" />
          <Legenda color="bg-orange-500" pts={PONTUACAO.VISITA} label="Visita realizada" />
          <Legenda color="bg-cyan-500" pts={PONTUACAO.DOCUMENTACAO} label="Documentação" />
          <Legenda color="bg-green-500" pts={PONTUACAO.VENDA} label="Venda fechada" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  gradient: string;
}) {
  return (
    <div className={`rounded-xl p-4 text-white shadow-lg bg-gradient-to-br ${gradient}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-3xl font-black leading-tight">{value}</p>
      <p className="text-xs opacity-80">{hint}</p>
    </div>
  );
}

function PodiumSpot({ row, place }: { row: Row; place: 1 | 2 | 3 }) {
  const cfg = {
    1: {
      ring: "border-yellow-300 ring-4 ring-yellow-200/50",
      bar: "from-yellow-600 to-yellow-400",
      badge: "bg-yellow-500",
      icon: <Trophy className="w-6 h-6 text-white" />,
      size: "w-32 h-32",
      barSize: "w-32 md:w-36 h-44",
      num: "text-6xl",
      label: "OURO",
      ptsColor: "text-yellow-600",
    },
    2: {
      ring: "border-gray-300",
      bar: "from-gray-500 to-gray-400",
      badge: "bg-gray-400",
      icon: <Medal className="w-5 h-5 text-white" />,
      size: "w-24 h-24",
      barSize: "w-24 md:w-28 h-32",
      num: "text-5xl",
      label: "PRATA",
      ptsColor: "text-gray-600",
    },
    3: {
      ring: "border-amber-400",
      bar: "from-amber-800 to-amber-600",
      badge: "bg-amber-700",
      icon: <Award className="w-5 h-5 text-white" />,
      size: "w-20 h-20",
      barSize: "w-20 md:w-24 h-24",
      num: "text-4xl",
      label: "BRONZE",
      ptsColor: "text-amber-700",
    },
  }[place];

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-2">
        {place === 1 && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2">
            <svg className="w-10 h-10 text-yellow-500 drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
            </svg>
          </div>
        )}
        <Avatar className={`${cfg.size} border-4 ${cfg.ring} shadow-xl`}>
          <AvatarImage src={row.avatar ?? undefined} alt={row.nome} />
          <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-white text-2xl font-bold">
            {getInitials(row.nome)}
          </AvatarFallback>
        </Avatar>
        <div
          className={`absolute -top-1 -right-1 w-9 h-9 rounded-full ${cfg.badge} flex items-center justify-center shadow-lg`}
        >
          {cfg.icon}
        </div>
      </div>
      <div className="text-center mb-2">
        <p className="font-bold text-lg">{row.nome.split(" ")[0]}</p>
        <div className="flex items-center justify-center gap-1">
          {place === 1 && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
          <span className={`text-3xl font-black ${cfg.ptsColor}`}>{row.pontos}</span>
          {place === 1 && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
        </div>
        <p className="text-xs text-muted-foreground">pontos</p>
      </div>
      <div
        className={`${cfg.barSize} bg-gradient-to-t ${cfg.bar} rounded-t-xl flex flex-col items-center justify-center shadow-2xl`}
      >
        <span className={`${cfg.num} font-black text-white`}>{place}</span>
        <span className="text-white text-xs font-bold">{cfg.label}</span>
      </div>
    </div>
  );
}

function Legenda({ color, pts, label }: { color: string; pts: number; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg">
      <Badge className={`${color} text-white border-0`}>+{pts}</Badge>
      <span className="text-sm">{label}</span>
    </div>
  );
}
