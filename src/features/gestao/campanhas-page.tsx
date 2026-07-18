// Painel de campanhas de webhook — onde o gestor vê e opera as roletas por
// projeto: token do endpoint, equipe da campanha, tier atual de cada corretor
// e histórico de mudanças de tier. Todos os tokens ficam aqui (não em
// documento) — vão direto pra Data Table do n8n.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Radio,
  ShieldAlert,
  Copy,
  Users,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

type Roleta = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  tipo: string;
  webhook_token: string | null;
  projeto_id: string | null;
  tiers_recalculados_em: string | null;
  peso_tier_a: number;
  peso_tier_b: number;
  peso_tier_c: number;
};

type Participante = {
  id: string;
  corretor_id: string;
  ativo: boolean;
  tier: "A" | "B" | "C";
  tier_score: number;
  tier_updated_at: string | null;
  leads_janela: number;
  agendamentos_janela: number;
  vendas_janela: number;
  limite_diario: number | null;
  profile: {
    nome: string;
    telefone: string | null;
    presente: boolean;
    ativo: boolean;
  } | null;
};

type Corretor = { id: string; nome: string };

type Projeto = { id: string; nome: string };

const TIER_STYLE: Record<"A" | "B" | "C", string> = {
  A: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  B: "bg-muted text-foreground border-border",
  C: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

export function CampanhasPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const podeVer = isAdmin || isGestor;
  const [equipeDe, setEquipeDe] = useState<Roleta | null>(null);
  const [criarProjetoPara, setCriarProjetoPara] = useState<Roleta | null>(null);
  const [tokenVisivel, setTokenVisivel] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();


  const campanhasQ = useQuery({
    queryKey: ["gestao:campanhas"],
    enabled: podeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roletas")
        .select(
          "id, slug, nome, ativo, tipo, webhook_token, projeto_id, tiers_recalculados_em, peso_tier_a, peso_tier_b, peso_tier_c",
        )
        .eq("tipo", "campanha")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Roleta[];
    },
  });

  const projetosQ = useQuery({
    queryKey: ["gestao:projetos-mini"],
    enabled: podeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });

  const vincularProjeto = useMutation({
    mutationFn: async ({ roletaId, projetoId }: { roletaId: string; projetoId: string | null }) => {
      const { error } = await supabase
        .from("roletas")
        .update({ projeto_id: projetoId } as never)
        .eq("id", roletaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto vinculado");
      void qc.invalidateQueries({ queryKey: ["gestao:campanhas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarEVincular = useMutation({
    mutationFn: async ({ roleta, nome }: { roleta: Roleta; nome: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: novo, error: e1 } = await supabase
        .from("projetos")
        .insert({ nome, ativo: true, criado_por: user?.id ?? null } as never)
        .select("id")
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("roletas")
        .update({ projeto_id: (novo as { id: string }).id } as never)
        .eq("id", roleta.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Projeto criado e vinculado");
      setCriarProjetoPara(null);
      void qc.invalidateQueries({ queryKey: ["gestao:campanhas"] });
      void qc.invalidateQueries({ queryKey: ["gestao:projetos-mini"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const recalcular = useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc("recalcular_tiers_roleta", {
        _roleta_slug: slug,
        _gatilho: "manual",
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(n > 0 ? `${n} mudança(s) de tier` : "Tiers atualizados (sem mudanças)");
      void qc.invalidateQueries({ queryKey: ["gestao:campanhas"] });
      void qc.invalidateQueries({ queryKey: ["gestao:equipe"] });
      void qc.invalidateQueries({ queryKey: ["gestao:tier-hist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copiarToken(t: string | null) {
    if (!t) return;
    void navigator.clipboard.writeText(t);
    toast.success("Token copiado");
  }

  if (!podeVer) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShieldAlert className="h-10 w-10" />
          <div className="font-medium">Acesso restrito</div>
          <div className="text-sm">Esta área é exclusiva para gestores e administradores.</div>
        </CardContent>
      </Card>
    );
  }

  const projetosById = new Map((projetosQ.data ?? []).map((p) => [p.id, p.nome]));

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Campanhas"
        title={
          <span className="flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-primary" /> Roletas por projeto (webhook)
          </span>
        }
      />
      <p className="-mt-4 text-sm text-muted-foreground">
        Cada campanha tem seu próprio token de webhook, sua equipe e sua distribuição ponderada
        por tier (A={campanhasQ.data?.[0]?.peso_tier_a ?? 3}, B=
        {campanhasQ.data?.[0]?.peso_tier_b ?? 2}, C={campanhasQ.data?.[0]?.peso_tier_c ?? 1}).
        Os tokens abaixo alimentam a Data Table do n8n — não colam em documento.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Projeto vinculado</TableHead>
                <TableHead>Token do webhook</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campanhasQ.data ?? []).map((r) => {
                const url = `/api/public/webhooks/lead/${r.webhook_token ?? ""}`;
                const showing = !!tokenVisivel[r.id];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{r.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        slug: <code>{r.slug}</code>
                        {r.tiers_recalculados_em && (
                          <>
                            {" · "}
                            recalc: {new Date(r.tiers_recalculados_em).toLocaleString("pt-BR")}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Select
                        value={r.projeto_id ?? "__none__"}
                        onValueChange={(v) => {
                          if (v === "__new__") {
                            setCriarProjetoPara(r);
                            return;
                          }
                          vincularProjeto.mutate({
                            roletaId: r.id,
                            projetoId: v === "__none__" ? null : v,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-64">
                          <SelectValue placeholder="Sem projeto (usa o nome da campanha)">
                            {r.projeto_id ? projetosById.get(r.projeto_id) : "Sem projeto vinculado"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem projeto vinculado</SelectItem>
                          <SelectItem value="__new__">
                            <span className="flex items-center gap-1 text-primary">
                              <Plus className="h-3.5 w-3.5" /> Criar novo projeto…
                            </span>
                          </SelectItem>
                          {(projetosQ.data ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {showing
                            ? (r.webhook_token ?? "—")
                            : r.webhook_token
                              ? `${r.webhook_token.slice(0, 6)}…${r.webhook_token.slice(-4)}`
                              : "—"}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setTokenVisivel((s) => ({ ...s, [r.id]: !s[r.id] }))
                          }
                          title={showing ? "Ocultar" : "Mostrar"}
                        >
                          {showing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copiarToken(r.webhook_token)}
                          title="Copiar token"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            copiarToken(
                              typeof window !== "undefined"
                                ? `${window.location.origin}${url}`
                                : url,
                            )
                          }
                          title="Copiar URL completa"
                        >
                          URL
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEquipeDe(r)}>
                          <Users className="mr-1 h-3.5 w-3.5" /> Equipe
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => recalcular.mutate(r.slug)}
                          disabled={recalcular.isPending}
                          title="Recalcular tiers agora"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {campanhasQ.isSuccess && (campanhasQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      icon={Radio}
                      title="Nenhuma campanha ainda."
                      description="Crie roletas do tipo campanha para expor tokens de webhook por projeto."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TierHistorico />

      {equipeDe && (
        <EquipeDialog roleta={equipeDe} onClose={() => setEquipeDe(null)} />
      )}
    </div>
  );
}

function EquipeDialog({ roleta, onClose }: { roleta: Roleta; onClose: () => void }) {
  const qc = useQueryClient();
  const [novoCorretor, setNovoCorretor] = useState<string>("");

  const equipeQ = useQuery({
    queryKey: ["gestao:equipe", roleta.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleta_participantes")
        .select(
          "id, corretor_id, ativo, tier, tier_score, tier_updated_at, leads_janela, agendamentos_janela, vendas_janela, limite_diario, profiles:profiles!roleta_participantes_corretor_id_fkey(nome, telefone, presente, ativo)",
        )
        .eq("roleta_id", roleta.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        ...r,
        profile: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
      })) as unknown as Participante[];
    },
  });

  const corretoresQ = useQuery({
    queryKey: ["gestao:corretores-elegiveis"],
    queryFn: async () => {
      // Todos os corretores ativos com role='corretor' — filtro em duas etapas
      // pra evitar depender de join complexo no cliente.
      const { data: roles, error: e1 } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "corretor");
      if (e1) throw e1;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as Corretor[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Corretor[];
    },
  });

  const adicionar = useMutation({
    mutationFn: async (corretorId: string) => {
      const { error } = await supabase
        .from("roleta_participantes")
        .insert({ roleta_id: roleta.id, corretor_id: corretorId, ativo: true } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corretor adicionado à equipe");
      setNovoCorretor("");
      void qc.invalidateQueries({ queryKey: ["gestao:equipe", roleta.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (participanteId: string) => {
      const { error } = await supabase
        .from("roleta_participantes")
        .delete()
        .eq("id", participanteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido da equipe");
      void qc.invalidateQueries({ queryKey: ["gestao:equipe", roleta.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizarLimite = useMutation({
    mutationFn: async ({ id, limite }: { id: string; limite: number | null }) => {
      const { error } = await supabase
        .from("roleta_participantes")
        .update({ limite_diario: limite } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["gestao:equipe", roleta.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const jaNaEquipe = useMemo(
    () => new Set((equipeQ.data ?? []).map((p) => p.corretor_id)),
    [equipeQ.data],
  );
  const disponiveis = (corretoresQ.data ?? []).filter((c) => !jaNaEquipe.has(c.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Equipe · {roleta.nome}</DialogTitle>
          <DialogDescription>
            Só quem estiver aqui, ativo e presente vai receber leads dessa campanha. Tier
            recalculado semanalmente (ou no botão da tela anterior).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">Adicionar corretor</Label>
            <Select value={novoCorretor} onValueChange={setNovoCorretor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um corretor…" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
                {disponiveis.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nenhum corretor disponível.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => novoCorretor && adicionar.mutate(novoCorretor)}
            disabled={!novoCorretor || adicionar.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>

        <div className="max-h-[420px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corretor</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Agend.</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Limite/dia</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(equipeQ.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.profile?.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.profile?.presente ? "presente" : "ausente"} ·{" "}
                      {p.profile?.ativo ? "ativo" : "inativo"} · score{" "}
                      {Number(p.tier_score).toFixed(2)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TIER_STYLE[p.tier]}>
                      {p.tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.leads_janela}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.agendamentos_janela}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.vendas_janela}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="ml-auto h-7 w-20 text-right"
                      type="number"
                      min={0}
                      defaultValue={p.limite_diario ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === "" ? null : Math.max(1, Number(v));
                        if (n !== p.limite_diario) {
                          atualizarLimite.mutate({ id: p.id, limite: n });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remover.mutate(p.id)}
                      disabled={remover.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {equipeQ.isSuccess && (equipeQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Sem corretores nessa campanha.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TierEvento = {
  id: string;
  criado_em: string;
  tier_anterior: string | null;
  tier_novo: string;
  score: number;
  gatilho: string;
  roleta_id: string;
  corretor_id: string;
};

function TierHistorico() {
  const q = useQuery({
    queryKey: ["gestao:tier-hist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleta_tier_historico")
        .select("id, criado_em, tier_anterior, tier_novo, score, gatilho, roleta_id, corretor_id")
        .order("criado_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TierEvento[];
    },
  });

  if (!q.data || q.data.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-muted-foreground">
        Últimas mudanças de tier
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>De → Para</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Gatilho</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">
                    {new Date(e.criado_em).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{e.tier_anterior ?? "—"}</span>{" "}
                    → <span className="font-medium">{e.tier_novo}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(e.score).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{e.gatilho}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
