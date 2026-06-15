import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trophy, Swords, Gift, Star, Settings, Shuffle, Calendar } from "lucide-react";
import {
  medalha,
  semanaAtual,
  faseDaSemana,
  configFromRows,
  type CopaConfigPontos,
} from "@/lib/copa";

export const Route = createFileRoute("/_authenticated/copa")({
  head: () => ({ meta: [{ title: "Copa SMQ — Seu Metro Quadrado" }] }),
  component: CopaPage,
});

type Edicao = {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
};
type Fase = { id: string; nome: string; ordem: number; semana_inicio: number; semana_fim: number };
type Confronto = {
  id: string;
  fase_id: string;
  corretor_a_id: string | null;
  corretor_b_id: string | null;
  vencedor_id: string | null;
  definido_manual: boolean;
  posicao: number;
};
type RankRow = {
  corretor_id: string;
  nome: string;
  bandeira: string;
  agendamentos: number;
  visitas: number;
  analise: number;
  vendas: number;
  total: number;
};

function CopaPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;

  const edicaoQ = useQuery({
    queryKey: ["copa:edicao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copa_edicao")
        .select("id, nome, data_inicio, data_fim")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Edicao) ?? null;
    },
  });
  const edicao = edicaoQ.data;

  const rankingQ = useQuery({
    queryKey: ["copa:ranking", edicao?.id],
    enabled: !!edicao?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("copa_ranking", { _edicao_id: edicao!.id });
      if (error) throw error;
      return (data ?? []) as RankRow[];
    },
  });
  const ranking = rankingQ.data ?? [];

  const fasesQ = useQuery({
    queryKey: ["copa:fases", edicao?.id],
    enabled: !!edicao?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copa_fases")
        .select("id, nome, ordem, semana_inicio, semana_fim")
        .eq("edicao_id", edicao!.id)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Fase[];
    },
  });
  const fases = fasesQ.data ?? [];

  const confrontosQ = useQuery({
    queryKey: ["copa:confrontos", fases.map((f) => f.id).join(",")],
    enabled: fases.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copa_confrontos")
        .select("id, fase_id, corretor_a_id, corretor_b_id, vencedor_id, definido_manual, posicao")
        .in(
          "fase_id",
          fases.map((f) => f.id),
        )
        .order("posicao");
      if (error) throw error;
      return (data ?? []) as Confronto[];
    },
  });
  const confrontos = confrontosQ.data ?? [];

  const premiosQ = useQuery({
    queryKey: ["copa:premios"],
    queryFn: async () => {
      const { data } = await supabase.from("copa_config_premios").select("*").order("ordem");
      return data ?? [];
    },
  });

  const configQ = useQuery({
    queryKey: ["copa:config-pontos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("copa_config_pontos")
        .select("*")
        .order("pontos", { ascending: false });
      return data ?? [];
    },
  });
  const config: CopaConfigPontos = useMemo(
    () => configFromRows(configQ.data ?? []),
    [configQ.data],
  );

  const profilesQ = useQuery({
    queryKey: ["copa:profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });
  const nomeMap = useMemo(() => {
    const m = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p: any) => m.set(p.id, p.nome));
    ranking.forEach((r) => m.set(r.corretor_id, r.nome));
    return m;
  }, [profilesQ.data, ranking]);
  const bandeiraMap = useMemo(() => {
    const m = new Map<string, string>();
    ranking.forEach((r) => m.set(r.corretor_id, r.bandeira));
    return m;
  }, [ranking]);

  const semana = edicao ? semanaAtual(edicao.data_inicio, edicao.data_fim) : 1;
  const faseAtual = faseDaSemana(fases, semana);

  const periodoLabel = edicao
    ? `${new Date(edicao.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")} – ${new Date(edicao.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}`
    : "";

  if (edicaoQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando Copa…</div>;
  }
  if (!edicao) {
    return (
      <div className="p-6">
        <PageHeader title="Copa SMQ" description="Nenhuma edição ativa." />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma edição da Copa está ativa no momento.
          </CardContent>
        </Card>
      </div>
    );
  }

  const podio = ranking.slice(0, 3);

  return (
    <div className="p-6 space-y-6">
      {/* Hero */}
      <div
        className="rounded-xl p-6 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0a1628 0%,#0d2137 45%,#0a1628 100%)" }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <span>⚽</span> COPA{" "}
              <span style={{ color: "#ffdf00" }}>{edicao.nome.replace(/^Copa\s*/i, "")}</span>{" "}
              <span>🏆</span>
            </div>
            <div className="text-sm text-white/70 mt-1">{periodoLabel} • Premiação em disputa</div>
          </div>
          <Badge className="bg-white/10 text-white border-white/20" variant="outline">
            <Calendar className="h-3.5 w-3.5 mr-1" style={{ color: "#ffdf00" }} />
            Semana {semana}
            {faseAtual ? ` — ${faseAtual.nome}` : ""}
          </Badge>
        </div>
        {podio.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-5">
            {podio.map((r, i) => (
              <div
                key={r.corretor_id}
                className="rounded-lg bg-white/5 border border-white/10 p-3 text-center"
              >
                <div className="text-xl">{medalha(i + 1)}</div>
                <div className="font-semibold truncate mt-1">
                  {r.bandeira} {r.nome.split(" ")[0]}
                </div>
                <div className="font-bold mt-1" style={{ color: "#ffdf00" }}>
                  {r.total} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PageHeader title="Copa SMQ" description="Torneio gamificado de performance." />

      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">
            <Trophy className="h-4 w-4 mr-1" /> Ranking
          </TabsTrigger>
          <TabsTrigger value="chaveamento">
            <Swords className="h-4 w-4 mr-1" /> Chaveamento
          </TabsTrigger>
          <TabsTrigger value="premios">
            <Gift className="h-4 w-4 mr-1" /> Prêmios
          </TabsTrigger>
          <TabsTrigger value="regras">
            <Star className="h-4 w-4 mr-1" /> Regras
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="admin">
              <Settings className="h-4 w-4 mr-1" /> Admin
            </TabsTrigger>
          )}
        </TabsList>

        {/* RANKING */}
        <TabsContent value="ranking" className="mt-4 space-y-4">
          {ranking.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Sem participantes/pontos ainda. Configure a Copa na aba Admin.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {ranking.map((r, i) => (
                  <div key={r.corretor_id} className="flex items-center gap-3 p-3">
                    <span className="w-8 text-center font-semibold">{medalha(i + 1)}</span>
                    <span className="text-lg">{r.bandeira}</span>
                    <span className="flex-1 truncate font-medium">{r.nome}</span>
                    <span className="hidden sm:flex gap-1 text-xs text-muted-foreground">
                      <Badge variant="outline">📅 {r.agendamentos}</Badge>
                      <Badge variant="outline">🏠 {r.visitas}</Badge>
                      <Badge variant="outline">📋 {r.analise}</Badge>
                      <Badge variant="outline">🤝 {r.vendas}</Badge>
                    </span>
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      {r.total} pts
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <PontosTabela config={config} />
        </TabsContent>

        {/* CHAVEAMENTO */}
        <TabsContent value="chaveamento" className="mt-4 space-y-4">
          {confrontos.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Chaveamento ainda não sorteado.
              </CardContent>
            </Card>
          ) : (
            fases.map((fase) => {
              const lista = confrontos.filter((c) => c.fase_id === fase.id);
              if (lista.length === 0) return null;
              return (
                <Card
                  key={fase.id}
                  className={faseAtual?.id === fase.id ? "border-amber-500/50" : ""}
                >
                  <CardHeader className="pb-2 flex-row items-center justify-between">
                    <CardTitle className="text-base">{fase.nome}</CardTitle>
                    {canManage && <ApurarFaseBtn faseId={fase.id} />}
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-2 gap-2">
                    {lista.map((c) => (
                      <ConfrontoCard
                        key={c.id}
                        confronto={c}
                        nomeMap={nomeMap}
                        bandeiraMap={bandeiraMap}
                        canManage={canManage}
                      />
                    ))}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* PRÊMIOS */}
        <TabsContent value="premios" className="mt-4">
          <Card>
            <CardContent className="py-4 divide-y">
              {(premiosQ.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <span className="text-2xl">{p.icone}</span>
                  <div className="flex-1">
                    <div className="font-medium">{p.posicao}</div>
                    <div className="text-xs text-muted-foreground">{p.descricao}</div>
                  </div>
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    {p.valor}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* REGRAS */}
        <TabsContent value="regras" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Como funciona</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>
                <strong className="text-foreground">Período:</strong> {periodoLabel}.
              </p>
              <p>
                <strong className="text-foreground">Formato:</strong> fase de grupos seguida de
                mata-mata, ao longo de {fases.length} fases.
              </p>
              <p>
                <strong className="text-foreground">Pontuação:</strong> calculada automaticamente a
                partir das suas atividades no CRM (agendamentos, visitas, análises de crédito e
                vendas).
              </p>
              <p>
                <strong className="text-foreground">Desempate:</strong> maior número de vendas,
                depois visitas.
              </p>
              <p>As decisões da gestão sobre confrontos são finais.</p>
            </CardContent>
          </Card>
          <PontosTabela config={config} />
        </TabsContent>

        {/* ADMIN */}
        {canManage && (
          <TabsContent value="admin" className="mt-4 space-y-4">
            <AdminParticipantes edicaoId={edicao.id} profiles={profilesQ.data ?? []} />
            <AdminSorteio edicaoId={edicao.id} />
            <AdminPontuacaoManual
              edicaoId={edicao.id}
              profiles={profilesQ.data ?? []}
              totalSemanas={fases.at(-1)?.semana_fim ?? 8}
              config={config}
            />
            <AdminConfigPontos rows={configQ.data ?? []} />
            <AdminPremios rows={premiosQ.data ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function PontosTabela({ config }: { config: CopaConfigPontos }) {
  const itens = [
    { label: "Agendamento", pts: config.agendamento, icon: "📅" },
    { label: "Visita realizada", pts: config.visita, icon: "🏠" },
    { label: "Análise de crédito", pts: config.analise, icon: "📋" },
    { label: "Venda (contrato)", pts: config.venda, icon: "🤝" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {itens.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-3 text-center">
            <div className="text-xl">{i.icon}</div>
            <div className="text-xs text-muted-foreground mt-1">{i.label}</div>
            <div className="font-bold text-amber-600 dark:text-amber-400">{i.pts} pts</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConfrontoCard({
  confronto,
  nomeMap,
  bandeiraMap,
  canManage,
}: {
  confronto: Confronto;
  nomeMap: Map<string, string>;
  bandeiraMap: Map<string, string>;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const setVencedor = useMutation({
    mutationFn: async (corretorId: string) => {
      const { error } = await supabase.rpc("copa_definir_vencedor", {
        _confronto_id: confronto.id,
        _corretor_id: corretorId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vencedor definido");
      qc.invalidateQueries({ queryKey: ["copa:confrontos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const Lado = ({ id }: { id: string | null }) => {
    if (!id) return <span className="text-muted-foreground italic">A definir</span>;
    const venceu = confronto.vencedor_id === id;
    return (
      <button
        disabled={!canManage}
        onClick={() => canManage && setVencedor.mutate(id)}
        className={`text-left truncate ${venceu ? "font-bold text-amber-600 dark:text-amber-400" : ""} ${canManage ? "hover:underline" : ""}`}
      >
        {bandeiraMap.get(id) ?? ""} {nomeMap.get(id) ?? id.slice(0, 8)}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
      <div className="flex-1 min-w-0">
        <Lado id={confronto.corretor_a_id} />
      </div>
      <span className="text-xs text-muted-foreground">vs</span>
      <div className="flex-1 min-w-0 text-right">
        <Lado id={confronto.corretor_b_id} />
      </div>
    </div>
  );
}

function ApurarFaseBtn({ faseId }: { faseId: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("copa_apurar_fase", { _fase_id: faseId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fase apurada por pontos");
      qc.invalidateQueries({ queryKey: ["copa:confrontos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      Apurar por pontos
    </Button>
  );
}

function AdminParticipantes({ edicaoId, profiles }: { edicaoId: string; profiles: any[] }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const partQ = useQuery({
    queryKey: ["copa:participantes", edicaoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("copa_participantes")
        .select("corretor_id, ativo")
        .eq("edicao_id", edicaoId);
      return data ?? [];
    },
  });
  useEffect(() => {
    if (partQ.data) {
      setSel(new Set(partQ.data.filter((p: any) => p.ativo).map((p: any) => p.corretor_id)));
    }
  }, [partQ.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("copa_set_participantes", {
        _edicao_id: edicaoId,
        _ids: Array.from(sel),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Participantes atualizados");
      qc.invalidateQueries({ queryKey: ["copa:participantes", edicaoId] });
      qc.invalidateQueries({ queryKey: ["copa:ranking", edicaoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <Card className="border-blue-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Participantes ({sel.size})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1 max-h-64 overflow-y-auto">
          {profiles.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-muted/50"
            >
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="truncate">{p.nome}</span>
            </label>
          ))}
        </div>
        <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar {sel.size} participante(s)
        </Button>
      </CardContent>
    </Card>
  );
}

function AdminSorteio({ edicaoId }: { edicaoId: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("copa_realizar_sorteio", { _edicao_id: edicaoId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sorteio realizado");
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["copa:confrontos"] });
      qc.invalidateQueries({ queryKey: ["copa:participantes", edicaoId] });
      qc.invalidateQueries({ queryKey: ["copa:ranking", edicaoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-purple-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sorteio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Atribui uma seleção a cada participante e cria os confrontos da fase de grupos.
          <span className="text-destructive"> Apaga os confrontos atuais.</span>
        </p>
        {confirm ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => m.mutate()}
              disabled={m.isPending}
            >
              <Shuffle className="h-4 w-4 mr-1" /> Confirmar sorteio
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
            <Shuffle className="h-4 w-4 mr-1" /> Realizar sorteio
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AdminPontuacaoManual({
  edicaoId,
  profiles,
  totalSemanas,
  config,
}: {
  edicaoId: string;
  profiles: any[];
  totalSemanas: number;
  config: CopaConfigPontos;
}) {
  const qc = useQueryClient();
  const [corretor, setCorretor] = useState("");
  const [semana, setSemana] = useState("1");
  const [f, setF] = useState({ agendamentos: 0, visitas: 0, analise: 0, vendas: 0 });
  const total =
    f.agendamentos * config.agendamento +
    f.visitas * config.visita +
    f.analise * config.analise +
    f.vendas * config.venda;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!corretor) throw new Error("Selecione um corretor.");
      const { error } = await supabase.from("copa_pontuacoes").upsert(
        {
          edicao_id: edicaoId,
          corretor_id: corretor,
          semana: Number(semana),
          agendamentos: f.agendamentos,
          visitas: f.visitas,
          analise: f.analise,
          vendas: f.vendas,
        },
        { onConflict: "edicao_id,corretor_id,semana" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pontuação manual salva");
      setF({ agendamentos: 0, visitas: 0, analise: 0, vendas: 0 });
      qc.invalidateQueries({ queryKey: ["copa:ranking", edicaoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const campos: { k: keyof typeof f; label: string }[] = [
    { k: "agendamentos", label: "Agendamentos" },
    { k: "visitas", label: "Visitas" },
    { k: "analise", label: "Análise" },
    { k: "vendas", label: "Vendas" },
  ];

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pontuação manual (bônus/correção)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Corretor</Label>
            <Select value={corretor} onValueChange={setCorretor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Semana</Label>
            <Select value={semana} onValueChange={setSemana}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalSemanas }, (_, i) => i + 1).map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    Semana {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {campos.map((c) => (
            <div key={c.k}>
              <Label>{c.label}</Label>
              <Input
                type="number"
                value={f[c.k]}
                onChange={(e) => setF({ ...f, [c.k]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">
            Total: <strong className="text-amber-600 dark:text-amber-400">{total} pts</strong>
          </span>
          <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminConfigPontos({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, number>>({});
  const salvar = useMutation({
    mutationFn: async ({ id, pontos }: { id: string; pontos: number }) => {
      const { error } = await supabase.from("copa_config_pontos").update({ pontos }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pontuação atualizada");
      qc.invalidateQueries({ queryKey: ["copa:config-pontos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-green-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pontos por atividade</CardTitle>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{r.label}</span>
            <Input
              type="number"
              className="w-24"
              value={edit[r.id] ?? r.pontos}
              onChange={(e) => setEdit({ ...edit, [r.id]: Number(e.target.value) })}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => salvar.mutate({ id: r.id, pontos: edit[r.id] ?? r.pontos })}
            >
              Salvar
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AdminPremios({ rows }: { rows: any[] }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const salvar = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: string }) => {
      const { error } = await supabase.from("copa_config_premios").update({ valor }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prêmio atualizado");
      qc.invalidateQueries({ queryKey: ["copa:premios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-orange-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Prêmios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="text-xl">{r.icone}</span>
            <span className="flex-1 text-sm truncate">
              {r.posicao} — {r.descricao}
            </span>
            <Input
              className="w-32"
              value={edit[r.id] ?? r.valor ?? ""}
              onChange={(e) => setEdit({ ...edit, [r.id]: e.target.value })}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => salvar.mutate({ id: r.id, valor: edit[r.id] ?? r.valor ?? "" })}
            >
              Salvar
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
