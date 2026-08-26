// Painel de campanhas — SOMENTE LEITURA: métricas ao vivo por equipe e
// histórico de tiers. Toda a GESTÃO de campanha (criar, equipe, equipe fixa,
// projeto, token de webhook, recálculo de tiers) vive na Central de
// Distribuição (aba Filas) — um lugar só, com escrita via RPC auditada.
// Este arquivo não escreve em roletas nem em roleta_participantes.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Radio, ShieldAlert, Users, Settings2 } from "lucide-react";

type Roleta = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  tipo: string;
  equipe_fixa: boolean;
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
  leads_janela: number;
  agendamentos_janela: number;
  vendas_janela: number;
  limite_diario: number | null;
  profile: {
    nome: string;
    presente: boolean;
    ativo: boolean;
  } | null;
};

type Projeto = { id: string; nome: string };

const TIER_STYLE: Record<"A" | "B" | "C", string> = {
  A: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  B: "bg-muted text-foreground border-border",
  C: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

export function CampanhasPage() {
  const { isAdmin } = useUserRoles();
  const podeVer = isAdmin;
  const [equipeDe, setEquipeDe] = useState<Roleta | null>(null);

  const campanhasQ = useQuery({
    queryKey: ["gestao:campanhas"],
    enabled: podeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roletas")
        .select(
          "id, slug, nome, ativo, tipo, equipe_fixa, projeto_id, tiers_recalculados_em, peso_tier_a, peso_tier_b, peso_tier_c",
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

  if (!podeVer) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShieldAlert className="h-10 w-10" />
          <div className="font-medium">Acesso restrito</div>
          <div className="text-sm">Esta área é exclusiva para administradores.</div>
        </CardContent>
      </Card>
    );
  }

  const projetosById = new Map((projetosQ.data ?? []).map((p) => [p.id, p.nome]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          eyebrow="Campanhas"
          title={
            <span className="flex items-center gap-1.5">
              <Radio className="h-4 w-4 text-primary" /> Métricas por campanha
            </span>
          }
        />
        <Button asChild size="sm">
          <Link to="/distribuicao" search={{ tab: "filas" }}>
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Gerenciar na Central de Distribuição
          </Link>
        </Button>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Acompanhamento das campanhas: equipe, tiers e resultados nas janelas. Criar campanha, montar
        equipe, equipe fixa, projeto e token de webhook ficam na Central de Distribuição (aba
        Filas), com toda mudança auditada.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Projeto vinculado</TableHead>
                <TableHead>Equipe fixa</TableHead>
                <TableHead>Pesos (A/B/C)</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campanhasQ.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="align-top">
                    <div className="font-medium">
                      {r.nome}
                      {!r.ativo && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          inativa
                        </Badge>
                      )}
                    </div>
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
                  <TableCell className="align-top text-sm">
                    {r.projeto_id ? (
                      (projetosById.get(r.projeto_id) ?? "—")
                    ) : (
                      <span className="text-muted-foreground">Sem projeto vinculado</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {r.equipe_fixa ? (
                      <Badge variant="secondary">Sempre neste time</Badge>
                    ) : (
                      <span className="text-muted-foreground">Respeita zonas</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-sm tabular-nums">
                    {r.peso_tier_a}/{r.peso_tier_b}/{r.peso_tier_c}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Button size="sm" variant="outline" onClick={() => setEquipeDe(r)}>
                      <Users className="mr-1 h-3.5 w-3.5" /> Equipe
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {campanhasQ.isSuccess && (campanhasQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState
                      icon={Radio}
                      title="Nenhuma campanha ainda."
                      description="Crie campanhas na Central de Distribuição (aba Filas)."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TierHistorico />

      {equipeDe && <EquipeDialog roleta={equipeDe} onClose={() => setEquipeDe(null)} />}
    </div>
  );
}

/** Equipe da campanha — leitura: tiers e resultados ao vivo. A gestão da
 *  equipe (incluir, remover, limite) é na Central, pelo RPC auditado. */
function EquipeDialog({ roleta, onClose }: { roleta: Roleta; onClose: () => void }) {
  const equipeQ = useQuery({
    queryKey: ["gestao:equipe", roleta.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleta_participantes")
        .select(
          "id, corretor_id, ativo, tier, tier_score, leads_janela, agendamentos_janela, vendas_janela, limite_diario, profiles:profiles!roleta_participantes_corretor_id_fkey(nome, presente, ativo)",
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

  // Contadores AO VIVO (fonte canônica = distribution_log + agendamentos +
  // vendas nas janelas do tier) — os snapshots de roleta_participantes só
  // atualizam no recálculo semanal.
  const metricasQ = useQuery({
    queryKey: ["gestao:equipe-metricas", roleta.id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipe_metricas_campanha", {
        _roleta_id: roleta.id,
      });
      if (error) throw error;
      const map = new Map<string, { leads: number; agendamentos: number; vendas: number }>();
      for (const row of (data ?? []) as Array<{
        corretor_id: string;
        leads_janela: number;
        agendamentos_janela: number;
        vendas_janela: number;
      }>) {
        map.set(row.corretor_id, {
          leads: row.leads_janela ?? 0,
          agendamentos: row.agendamentos_janela ?? 0,
          vendas: row.vendas_janela ?? 0,
        });
      }
      return map;
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Equipe · {roleta.nome}</DialogTitle>
          <DialogDescription>
            Só quem estiver aqui, ativo e presente recebe leads dessa campanha. Para incluir,
            remover ou ajustar limite, use a Central de Distribuição (aba Filas).
          </DialogDescription>
        </DialogHeader>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {(equipeQ.data ?? []).map((p) => {
                const live = metricasQ.data?.get(p.corretor_id);
                const leads = live?.leads ?? p.leads_janela;
                const ags = live?.agendamentos ?? p.agendamentos_janela;
                const vds = live?.vendas ?? p.vendas_janela;
                return (
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
                    <TableCell className="text-right tabular-nums">{leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{ags}</TableCell>
                    <TableCell className="text-right tabular-nums">{vds}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.limite_diario ?? <span className="text-muted-foreground">padrão</span>}
                    </TableCell>
                  </TableRow>
                );
              })}

              {equipeQ.isSuccess && (equipeQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
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
