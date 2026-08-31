// DRE · Configuração — o trabalho manual (uma vez só) que faz a DRE existir:
// vincular a equipe às unidades, resolver a fila de vendas sem unidade, lançar
// os custos fixos, versionar parâmetros e importar o orçamento. Só gestão
// chega aqui (a aba DRE já é guardada por papel; as RLS reforçam no banco).
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readTabularFile } from "@/lib/spreadsheets";
import {
  DRE_LINHA_KEYS,
  dreData,
  dreMesBounds,
  dreMoeda2,
  downloadCsv,
  fetchDreUnidades,
  fracaoParaPontos,
  pontosParaFracao,
  type DreCategoria,
  type DreMembro,
  type DreParametro,
  type DreUnidade,
} from "@/lib/dre";

const ABAS = [
  { value: "unidades", label: "Unidades" },
  { value: "equipe", label: "Equipe" },
  { value: "vendas-sem-unidade", label: "Vendas sem unidade" },
  { value: "parametros", label: "Parâmetros" },
  { value: "despesas", label: "Despesas" },
  { value: "orcamento", label: "Orçamento" },
] as const;

// yyyy-mm do mês corrente, em hora local.
function mesCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "1.234,56" | "1234.56" | "1234" → número; null se inválido. */
function parseValorBR(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  const normalizado = /,\d{1,2}$/.test(t)
    ? t.replace(/\./g, "").replace(",", ".")
    : t.replace(/,/g, "");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** "2026-05" | "2026-05-10" | "05/2026" | "10/05/2026" → primeiro dia do mês. */
function parseCompetencia(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1]}-01`;
  m = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1]}-01`;
  return null;
}

export function DreConfig({
  abaInicial,
  unidades,
  onVoltar,
}: {
  abaInicial: string;
  unidades: DreUnidade[];
  onVoltar: () => void;
}) {
  const [aba, setAba] = useState(ABAS.some((a) => a.value === abaInicial) ? abaInicial : "equipe");

  return (
    <div className="space-y-4">
      <PageHeader
        title="DRE — Configuração"
        description="Equipe, vendas sem unidade, custos fixos, parâmetros e orçamento do módulo."
        actions={
          <Button variant="outline" size="sm" onClick={onVoltar}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar à DRE
          </Button>
        }
      />
      <ResponsiveTabs
        value={aba}
        onValueChange={setAba}
        ariaLabel="Abas da configuração da DRE"
        className="space-y-4"
        items={ABAS}
      >
        <ResponsiveTabsContent value="unidades">
          <AbaUnidades />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="equipe">
          <AbaEquipe unidades={unidades} />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="vendas-sem-unidade">
          <AbaVendasSemUnidade unidades={unidades} />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="parametros">
          <AbaParametros unidades={unidades} />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="despesas">
          <AbaDespesas unidades={unidades} />
        </ResponsiveTabsContent>
        <ResponsiveTabsContent value="orcamento">
          <AbaOrcamento unidades={unidades} />
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}

function useInvalidarDre() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["dre"] });
}

// ---------------------------------------------------------------------------
// 1. Unidades
// ---------------------------------------------------------------------------

function AbaUnidades() {
  const invalidar = useInvalidarDre();
  const query = useQuery({ queryKey: ["dre", "unidades"], queryFn: fetchDreUnidades });
  const [dialogo, setDialogo] = useState<{ unidade: DreUnidade | null } | null>(null);

  const alternarAtiva = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase.from("dre_unidades").update({ ativa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  if (query.isPending) return <Skeleton className="h-40 w-full" aria-busy="true" />;
  if (query.isError)
    return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogo({ unidade: null })}>
            <Plus className="mr-2 h-4 w-4" /> Nova unidade
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unidade</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead className="text-right">Ordem</TableHead>
              <TableHead className="text-center">Ativa</TableHead>
              <TableHead aria-label="Ações" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell>{u.operador_nome ?? "—"}</TableCell>
                <TableCell className="text-right">{u.ordem}</TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={u.ativa}
                    aria-label={`Unidade ${u.nome} ativa`}
                    onCheckedChange={(ativa) => alternarAtiva.mutate({ id: u.id, ativa })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDialogo({ unidade: u })}>
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {dialogo && <DialogoUnidade unidade={dialogo.unidade} onFechar={() => setDialogo(null)} />}
    </Card>
  );
}

function DialogoUnidade({
  unidade,
  onFechar,
}: {
  unidade: DreUnidade | null;
  onFechar: () => void;
}) {
  const invalidar = useInvalidarDre();
  const [nome, setNome] = useState(unidade?.nome ?? "");
  const [operador, setOperador] = useState(unidade?.operador_nome ?? "");
  const [ordem, setOrdem] = useState(String(unidade?.ordem ?? 0));

  const salvar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome da unidade.");
      const payload = {
        nome: nome.trim(),
        operador_nome: operador.trim() || null,
        ordem: Number(ordem) || 0,
      };
      const { error } = unidade
        ? await supabase.from("dre_unidades").update(payload).eq("id", unidade.id)
        : await supabase.from("dre_unidades").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade salva.");
      invalidar();
      onFechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{unidade ? `Editar ${unidade.nome}` : "Nova unidade"}</DialogTitle>
          <DialogDescription>
            A unidade agrupa vendas e custos e ganha uma DRE própria.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="dre-un-nome">Nome</Label>
            <Input id="dre-un-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-un-operador">Operador</Label>
            <Input
              id="dre-un-operador"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-un-ordem">Ordem de exibição</Label>
            <Input
              id="dre-un-ordem"
              type="number"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 2. Equipe — vincular usuários do CRM às unidades
// ---------------------------------------------------------------------------

const SEM_UNIDADE = "sem-unidade";
const PAPEIS = ["corretor", "gerente", "superintendente", "socio"] as const;

type PerfilResumo = Pick<Tables<"profiles">, "id" | "nome" | "email" | "cargo">;

function AbaEquipe({ unidades }: { unidades: DreUnidade[] }) {
  const invalidar = useInvalidarDre();
  const perfisQuery = useQuery({
    queryKey: ["dre", "config", "perfis"],
    queryFn: async (): Promise<PerfilResumo[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, cargo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const membrosQuery = useQuery({
    queryKey: ["dre", "config", "membros"],
    queryFn: async (): Promise<DreMembro[]> => {
      const { data, error } = await supabase.from("dre_unidade_membros").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Vínculo vigente (sem vigencia_fim) mais recente de cada usuário.
  const membroPorPerfil = useMemo(() => {
    const mapa = new Map<string, DreMembro>();
    for (const m of membrosQuery.data ?? []) {
      if (m.vigencia_fim) continue;
      const atual = mapa.get(m.profile_id);
      if (!atual || m.vigencia_inicio > atual.vigencia_inicio) mapa.set(m.profile_id, m);
    }
    return mapa;
  }, [membrosQuery.data]);

  const vincular = useMutation({
    mutationFn: async ({
      profileId,
      unidadeId,
      papel,
    }: {
      profileId: string;
      unidadeId: string | null;
      papel: string;
    }) => {
      const atual = membroPorPerfil.get(profileId);
      if (!unidadeId) {
        if (!atual) return;
        const { error } = await supabase.from("dre_unidade_membros").delete().eq("id", atual.id);
        if (error) throw error;
        return;
      }
      if (atual) {
        const { error } = await supabase
          .from("dre_unidade_membros")
          .update({ unidade_id: unidadeId, papel })
          .eq("id", atual.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("dre_unidade_membros")
        .insert({ profile_id: profileId, unidade_id: unidadeId, papel });
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao vincular."),
  });

  if (perfisQuery.isPending || membrosQuery.isPending)
    return <Skeleton className="h-40 w-full" aria-busy="true" />;
  if (perfisQuery.isError)
    return <QueryErrorState error={perfisQuery.error} onRetry={() => void perfisQuery.refetch()} />;
  if (membrosQuery.isError)
    return (
      <QueryErrorState error={membrosQuery.error} onRetry={() => void membrosQuery.refetch()} />
    );

  const perfis = perfisQuery.data ?? [];
  const semUnidade = perfis.filter((p) => !membroPorPerfil.has(p.id)).length;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm text-muted-foreground">
          {semUnidade === 0
            ? "Todos os usuários ativos têm unidade."
            : `${semUnidade} ${semUnidade === 1 ? "usuário ainda sem unidade" : "usuários ainda sem unidade"} — as vendas deles caem na fila "Vendas sem unidade".`}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Papel na DRE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perfis.map((p) => {
              const membro = membroPorPerfil.get(p.id);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  <TableCell>{p.cargo ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={membro?.unidade_id ?? SEM_UNIDADE}
                      onValueChange={(v) =>
                        vincular.mutate({
                          profileId: p.id,
                          unidadeId: v === SEM_UNIDADE ? null : v,
                          papel: membro?.papel ?? "corretor",
                        })
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_UNIDADE}>— Sem unidade</SelectItem>
                        {unidades.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={membro?.papel ?? "corretor"}
                      disabled={!membro}
                      onValueChange={(papel) =>
                        membro &&
                        vincular.mutate({ profileId: p.id, unidadeId: membro.unidade_id, papel })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPEIS.map((papel) => (
                          <SelectItem key={papel} value={papel}>
                            {papel === "socio" ? "sócio" : papel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Vendas sem unidade — fila com atribuição em lote
// ---------------------------------------------------------------------------

function AbaVendasSemUnidade({ unidades }: { unidades: DreUnidade[] }) {
  const invalidar = useInvalidarDre();
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<string>("");

  const query = useQuery({
    queryKey: ["dre", "config", "vendas-sem-unidade"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_vw_vendas_unidade")
        .select("*")
        .is("unidade_id", null)
        .eq("distrato", false)
        .in("status_venda", ["aprovada", "pendente"])
        .order("data_assinatura", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const atribuir = useMutation({
    mutationFn: async () => {
      if (!destino) throw new Error("Escolha a unidade de destino.");
      const ids = Array.from(selecao);
      if (ids.length === 0) throw new Error("Selecione ao menos uma venda.");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("dre_venda_unidade").upsert(
        ids.map((venda_id) => ({
          venda_id,
          unidade_id: destino,
          definido_por: userData.user?.id ?? null,
        })),
        { onConflict: "venda_id" },
      );
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "venda atribuída" : "vendas atribuídas"}.`);
      setSelecao(new Set());
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atribuir."),
  });

  if (query.isPending) return <Skeleton className="h-40 w-full" aria-busy="true" />;
  if (query.isError)
    return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const vendas = query.data ?? [];
  const vgvTotal = vendas.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0);
  const todasSelecionadas = vendas.length > 0 && selecao.size === vendas.length;

  if (vendas.length === 0)
    return (
      <EmptyState
        title="Nenhuma venda sem unidade."
        description="Toda venda aprovada ou pendente já resolve para uma unidade — a DRE está completa."
      />
    );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">{vendas.length}</span>{" "}
            {vendas.length === 1 ? "venda sem unidade" : "vendas sem unidade"} —{" "}
            <span className="font-semibold">{dreMoeda2(vgvTotal)}</span> fora da DRE.
          </p>
          <div className="flex items-center gap-2">
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Unidade de destino" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={selecao.size === 0 || !destino || atribuir.isPending}
              onClick={() => atribuir.mutate()}
            >
              {atribuir.isPending ? "Atribuindo…" : `Atribuir ${selecao.size || ""}`.trim()}
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={todasSelecionadas}
                  aria-label="Selecionar todas"
                  onCheckedChange={(v) =>
                    setSelecao(
                      v ? new Set(vendas.map((x) => x.venda_id!).filter(Boolean)) : new Set(),
                    )
                  }
                />
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Empreendimento</TableHead>
              <TableHead>Corretor</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">VGV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendas.map((v) => (
              <TableRow key={v.venda_id}>
                <TableCell>
                  <Checkbox
                    checked={selecao.has(v.venda_id!)}
                    aria-label={`Selecionar venda de ${v.cliente ?? "cliente"}`}
                    onCheckedChange={(marcado) =>
                      setSelecao((prev) => {
                        const nova = new Set(prev);
                        if (marcado) nova.add(v.venda_id!);
                        else nova.delete(v.venda_id!);
                        return nova;
                      })
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{v.cliente ?? "—"}</TableCell>
                <TableCell>{v.empreendimento ?? "—"}</TableCell>
                <TableCell>{v.corretor_nome ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{dreData(v.data_assinatura)}</TableCell>
                <TableCell>{v.status_venda === "pendente" ? "Pendente" : "Aprovada"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {dreMoeda2(Number(v.valor_venda) || 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Parâmetros — histórico por vigência (nunca editar, sempre nova vigência)
// ---------------------------------------------------------------------------

const REDE_ESCOPO = "rede";

function AbaParametros({ unidades }: { unidades: DreUnidade[] }) {
  const [novaVigencia, setNovaVigencia] = useState(false);
  const query = useQuery({
    queryKey: ["dre", "config", "parametros"],
    queryFn: async (): Promise<DreParametro[]> => {
      const { data, error } = await supabase
        .from("dre_parametros")
        .select("*")
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (query.isPending) return <Skeleton className="h-40 w-full" aria-busy="true" />;
  if (query.isError)
    return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const nomeEscopo = (p: DreParametro) =>
    p.unidade_id ? (unidades.find((u) => u.id === p.unidade_id)?.nome ?? "Unidade") : "Rede";

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Vigências nunca são editadas — para mudar um percentual, crie uma vigência nova; a
            anterior é fechada no dia anterior e as vendas antigas continuam calculando como eram.
          </p>
          <Button size="sm" onClick={() => setNovaVigencia(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova vigência
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escopo</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Imposto</TableHead>
                <TableHead className="text-right">Consultor</TableHead>
                <TableHead className="text-right">Gerente</TableHead>
                <TableHead className="text-right">Sócio op.</TableHead>
                <TableHead className="text-right">Reinvest.</TableHead>
                <TableHead className="text-right">Reserva</TableHead>
                <TableHead className="text-right">Caixa mín.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{nomeEscopo(p)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {dreData(p.vigencia_inicio)} —{" "}
                    {p.vigencia_fim ? dreData(p.vigencia_fim) : "atual"}
                  </TableCell>
                  <Pct v={p.comissao_total_pct} />
                  <Pct v={p.imposto_sobre_faturamento_pct} />
                  <Pct v={p.consultor_pct} />
                  <Pct v={p.gerente_pct} />
                  <Pct v={p.socio_operador_pct} />
                  <Pct v={p.reinvestimento_pct_ebitda} />
                  <Pct v={p.reserva_expansao_pct_ebitda} />
                  <TableCell className="text-right tabular-nums">
                    {Number(p.caixa_minimo_meses_custo_fixo).toLocaleString("pt-BR")} m
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {novaVigencia && (
        <DialogoNovaVigencia
          unidades={unidades}
          parametros={query.data ?? []}
          onFechar={() => setNovaVigencia(false)}
        />
      )}
    </Card>
  );
}

function Pct({ v }: { v: number }) {
  return <TableCell className="text-right tabular-nums">{fracaoParaPontos(v)}%</TableCell>;
}

const CAMPOS_PCT = [
  { key: "comissao_total_pct", rotulo: "Comissão total (%)" },
  { key: "imposto_sobre_faturamento_pct", rotulo: "Imposto s/ faturamento (%)" },
  { key: "consultor_pct", rotulo: "Consultor (%)" },
  { key: "gerente_pct", rotulo: "Gerente (%)" },
  { key: "socio_operador_pct", rotulo: "Sócio operador (%)" },
  { key: "reinvestimento_pct_ebitda", rotulo: "Reinvestimento (% do EBITDA)" },
  { key: "reserva_expansao_pct_ebitda", rotulo: "Reserva de expansão (% do EBITDA)" },
] as const;

function DialogoNovaVigencia({
  unidades,
  parametros,
  onFechar,
}: {
  unidades: DreUnidade[];
  parametros: DreParametro[];
  onFechar: () => void;
}) {
  const invalidar = useInvalidarDre();
  const [escopo, setEscopo] = useState<string>(REDE_ESCOPO);
  const hoje = new Date().toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(hoje);

  const vigente = useMemo(() => {
    const unidadeId = escopo === REDE_ESCOPO ? null : escopo;
    return parametros.find((p) => p.unidade_id === unidadeId && !p.vigencia_fim) ?? null;
  }, [escopo, parametros]);

  const [valores, setValores] = useState<Record<string, string>>({});
  const [caixaMin, setCaixaMin] = useState("");

  const valorCampo = (key: (typeof CAMPOS_PCT)[number]["key"]) =>
    valores[key] ?? (vigente ? fracaoParaPontos(vigente[key]) : "");

  const salvar = useMutation({
    mutationFn: async () => {
      const unidadeId = escopo === REDE_ESCOPO ? null : escopo;
      const fracoes: Record<string, number> = {};
      for (const campo of CAMPOS_PCT) {
        const f = pontosParaFracao(valorCampo(campo.key));
        if (f === null) throw new Error(`Valor inválido em "${campo.rotulo}".`);
        fracoes[campo.key] = f;
      }
      const caixa = parseValorBR(caixaMin || String(vigente?.caixa_minimo_meses_custo_fixo ?? "1"));
      if (caixa === null || caixa < 0) throw new Error("Caixa mínimo inválido.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new Error("Data de início inválida.");
      if (vigente && inicio <= vigente.vigencia_inicio) {
        throw new Error(
          `A nova vigência precisa começar depois de ${dreData(vigente.vigencia_inicio)}.`,
        );
      }

      // fecha a vigência aberta no dia anterior ao início da nova
      if (vigente) {
        const dia = new Date(`${inicio}T12:00:00Z`);
        dia.setUTCDate(dia.getUTCDate() - 1);
        const fim = dia.toISOString().slice(0, 10);
        const { error } = await supabase
          .from("dre_parametros")
          .update({ vigencia_fim: fim })
          .eq("id", vigente.id);
        if (error) throw error;
      }
      const { error } = await supabase.from("dre_parametros").insert({
        unidade_id: unidadeId,
        vigencia_inicio: inicio,
        comissao_total_pct: fracoes.comissao_total_pct,
        imposto_sobre_faturamento_pct: fracoes.imposto_sobre_faturamento_pct,
        consultor_pct: fracoes.consultor_pct,
        gerente_pct: fracoes.gerente_pct,
        socio_operador_pct: fracoes.socio_operador_pct,
        reinvestimento_pct_ebitda: fracoes.reinvestimento_pct_ebitda,
        reserva_expansao_pct_ebitda: fracoes.reserva_expansao_pct_ebitda,
        caixa_minimo_meses_custo_fixo: caixa,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nova vigência criada.");
      invalidar();
      onFechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova vigência de parâmetros</DialogTitle>
          <DialogDescription>
            A vigência aberta do mesmo escopo é fechada automaticamente no dia anterior.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Escopo</Label>
            <Select value={escopo} onValueChange={setEscopo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={REDE_ESCOPO}>Rede (padrão)</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-vig-inicio">Início da vigência</Label>
            <Input
              id="dre-vig-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          {CAMPOS_PCT.map((campo) => (
            <div key={campo.key} className="grid gap-1">
              <Label htmlFor={`dre-vig-${campo.key}`}>{campo.rotulo}</Label>
              <Input
                id={`dre-vig-${campo.key}`}
                inputMode="decimal"
                value={valorCampo(campo.key)}
                onChange={(e) => setValores((prev) => ({ ...prev, [campo.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="grid gap-1">
            <Label htmlFor="dre-vig-caixa">Caixa mínimo (meses de custo fixo)</Label>
            <Input
              id="dre-vig-caixa"
              inputMode="decimal"
              value={caixaMin || String(vigente?.caixa_minimo_meses_custo_fixo ?? "1")}
              onChange={(e) => setCaixaMin(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Criar vigência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 5. Despesas — CRUD com replicar mês anterior e import CSV
// ---------------------------------------------------------------------------

const TODAS = "todas";

type DespesaLinha = Tables<"dre_despesas"> & {
  categoria: { nome: string } | null;
  unidade: { nome: string } | null;
};

async function fetchCategorias(): Promise<DreCategoria[]> {
  const { data, error } = await supabase
    .from("dre_categorias_despesa")
    .select("*")
    .eq("ativa", true)
    .order("grupo")
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

/** Rótulos dos grupos de categoria (agrupamento visual do seletor). */
const GRUPOS_CATEGORIA: Array<{ chave: string; rotulo: string }> = [
  { chave: "ocupacao", rotulo: "Estrutura / ocupação" },
  { chave: "marketing", rotulo: "Marketing e captação" },
  { chave: "tecnologia", rotulo: "Tecnologia" },
  { chave: "administrativo", rotulo: "Administrativo e financeiro" },
  { chave: "outros", rotulo: "Outros" },
];

/** Categorias agrupadas na ordem acima; grupos desconhecidos vão para "Outros". */
function agruparCategorias(cats: DreCategoria[]) {
  return GRUPOS_CATEGORIA.map(({ chave, rotulo }) => ({
    rotulo,
    itens: cats.filter((c) =>
      chave === "outros"
        ? !GRUPOS_CATEGORIA.some((g) => g.chave !== "outros" && g.chave === c.grupo)
        : c.grupo === chave,
    ),
  })).filter((g) => g.itens.length > 0);
}

function CategoriaOpcoes({ categorias }: { categorias: DreCategoria[] }) {
  return (
    <>
      {agruparCategorias(categorias).map((g) => (
        <SelectGroup key={g.rotulo}>
          <SelectLabel>{g.rotulo}</SelectLabel>
          {g.itens.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}


function AbaDespesas({ unidades }: { unidades: DreUnidade[] }) {
  const invalidar = useInvalidarDre();
  const [unidadeFiltro, setUnidadeFiltro] = useState(TODAS);
  const [mes, setMes] = useState(mesCorrente());
  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS);
  const [dialogo, setDialogo] = useState<{ despesa: DespesaLinha | null } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const categoriasQuery = useQuery({
    queryKey: ["dre", "config", "categorias"],
    queryFn: fetchCategorias,
  });

  const [anoStr, mesStr] = mes.split("-");
  const bounds = dreMesBounds(Number(anoStr), Number(mesStr));

  const query = useQuery({
    queryKey: ["dre", "config", "despesas", unidadeFiltro, mes, categoriaFiltro],
    queryFn: async (): Promise<DespesaLinha[]> => {
      let q = supabase
        .from("dre_despesas")
        .select("*, categoria:dre_categorias_despesa(nome), unidade:dre_unidades(nome)")
        .gte("competencia", bounds.ini)
        .lt("competencia", bounds.fim)
        .order("valor", { ascending: false });
      if (unidadeFiltro !== TODAS) q = q.eq("unidade_id", unidadeFiltro);
      if (categoriaFiltro !== TODAS) q = q.eq("categoria_id", categoriaFiltro);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DespesaLinha[];
    },
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dre_despesas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa excluída.");
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir."),
  });

  const replicar = useMutation({
    mutationFn: async () => {
      const anterior =
        Number(mesStr) === 1
          ? { ano: Number(anoStr) - 1, mes: 12 }
          : { ano: Number(anoStr), mes: Number(mesStr) - 1 };
      const bAnt = dreMesBounds(anterior.ano, anterior.mes);
      const { data: recorrentes, error } = await supabase
        .from("dre_despesas")
        .select("unidade_id, categoria_id, descricao, valor, fornecedor, observacoes")
        .eq("recorrente", true)
        .gte("competencia", bAnt.ini)
        .lt("competencia", bAnt.fim);
      if (error) throw error;
      const atuais = query.data ?? [];
      const jaExiste = new Set(
        atuais.map((d) => `${d.unidade_id}|${d.categoria_id}|${d.descricao.trim().toLowerCase()}`),
      );
      const novas = (recorrentes ?? []).filter(
        (d) =>
          !jaExiste.has(`${d.unidade_id}|${d.categoria_id}|${d.descricao.trim().toLowerCase()}`),
      );
      if (novas.length === 0) return 0;
      const { error: insError } = await supabase
        .from("dre_despesas")
        .insert(novas.map((d) => ({ ...d, recorrente: true, competencia: bounds.ini })));
      if (insError) throw insError;
      return novas.length;
    },
    onSuccess: (n) => {
      toast.success(
        n === 0
          ? "Nada a replicar — as recorrentes do mês anterior já existem neste mês."
          : `${n} ${n === 1 ? "despesa replicada" : "despesas replicadas"}.`,
      );
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao replicar."),
  });

  const importar = useMutation({
    mutationFn: async (file: File) => {
      const linhas = await readTabularFile(file);
      if (linhas.length === 0) throw new Error("Arquivo vazio.");
      const categorias = categoriasQuery.data ?? [];
      const porNomeUnidade = new Map(unidades.map((u) => [u.nome.trim().toLowerCase(), u.id]));
      const porNomeCategoria = new Map(categorias.map((c) => [c.nome.trim().toLowerCase(), c.id]));
      const registros: Array<{
        unidade_id: string;
        categoria_id: string;
        descricao: string;
        valor: number;
        competencia: string;
        fornecedor: string | null;
        recorrente: boolean;
      }> = [];
      const erros: string[] = [];
      linhas.forEach((linha, i) => {
        const pega = (chave: string) =>
          String(linha[chave] ?? linha[chave.toUpperCase()] ?? "").trim();
        const unidadeId = porNomeUnidade.get(pega("unidade").toLowerCase());
        const categoriaId = porNomeCategoria.get(pega("categoria").toLowerCase());
        const valor = parseValorBR(pega("valor"));
        const competencia = parseCompetencia(pega("competencia"));
        const descricao = pega("descricao");
        if (!unidadeId) erros.push(`linha ${i + 2}: unidade "${pega("unidade")}" não encontrada`);
        else if (!categoriaId)
          erros.push(`linha ${i + 2}: categoria "${pega("categoria")}" não encontrada`);
        else if (!descricao) erros.push(`linha ${i + 2}: descrição vazia`);
        else if (valor === null || valor <= 0) erros.push(`linha ${i + 2}: valor inválido`);
        else if (!competencia) erros.push(`linha ${i + 2}: competência inválida (use AAAA-MM)`);
        else
          registros.push({
            unidade_id: unidadeId,
            categoria_id: categoriaId,
            descricao,
            valor,
            competencia,
            fornecedor: pega("fornecedor") || null,
            recorrente: /^(sim|s|true|1)$/i.test(pega("recorrente")),
          });
      });
      if (erros.length > 0) throw new Error(`Import abortado:\n${erros.slice(0, 5).join("\n")}`);
      const { error } = await supabase.from("dre_despesas").insert(registros);
      if (error) throw error;
      return registros.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} despesas importadas.`);
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no import."),
  });

  const despesas = query.data ?? [];
  const total = despesas.reduce((s, d) => s + Number(d.valor), 0);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Unidade</Label>
              <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="dre-desp-mes">
                Competência
              </Label>
              <Input
                id="dre-desp-mes"
                type="month"
                className="w-40"
                value={mes}
                onChange={(e) => e.target.value && setMes(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas</SelectItem>
                  <CategoriaOpcoes categorias={categoriasQuery.data ?? []} />
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={arquivoRef}
              type="file"
              accept=".csv,.txt,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importar.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => arquivoRef.current?.click()}
              disabled={importar.isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importar.isPending ? "Importando…" : "Import CSV"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => replicar.mutate()}
              disabled={replicar.isPending}
            >
              <Copy className="mr-2 h-4 w-4" /> Replicar mês anterior
            </Button>
            <Button size="sm" onClick={() => setDialogo({ despesa: null })}>
              <Plus className="mr-2 h-4 w-4" /> Nova despesa
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Import CSV com colunas:
          unidade;categoria;descricao;valor;competencia;fornecedor;recorrente (competência AAAA-MM).
          "Replicar mês anterior" copia as despesas recorrentes que ainda não existem neste mês.
        </p>

        {query.isPending ? (
          <Skeleton className="h-40 w-full" aria-busy="true" />
        ) : query.isError ? (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : despesas.length === 0 ? (
          <EmptyState
            title="Nenhuma despesa neste mês."
            description="Sem custo fixo lançado o EBITDA fica igual à margem da empresa — lance as despesas da unidade."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-center">Recorrente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead aria-label="Ações" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {despesas.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.unidade?.nome ?? "—"}</TableCell>
                  <TableCell>{d.categoria?.nome ?? "—"}</TableCell>
                  <TableCell className="font-medium">{d.descricao}</TableCell>
                  <TableCell>{d.fornecedor ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{dreData(d.data_pagamento)}</TableCell>
                  <TableCell className="text-center">{d.recorrente ? "Sim" : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {dreMoeda2(Number(d.valor))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDialogo({ despesa: d })}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir despesa"
                        onClick={() => excluir.mutate(d.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={6}>Total ({despesas.length})</TableCell>
                <TableCell className="text-right tabular-nums">{dreMoeda2(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
      {dialogo && (
        <DialogoDespesa
          despesa={dialogo.despesa}
          unidades={unidades}
          categorias={categoriasQuery.data ?? []}
          mesPadrao={mes}
          onFechar={() => setDialogo(null)}
        />
      )}
    </Card>
  );
}

function DialogoDespesa({
  despesa,
  unidades,
  categorias,
  mesPadrao,
  onFechar,
}: {
  despesa: DespesaLinha | null;
  unidades: DreUnidade[];
  categorias: DreCategoria[];
  mesPadrao: string;
  onFechar: () => void;
}) {
  const invalidar = useInvalidarDre();
  const [unidadeId, setUnidadeId] = useState(despesa?.unidade_id ?? unidades[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(despesa?.categoria_id ?? categorias[0]?.id ?? "");
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [valor, setValor] = useState(
    despesa ? Number(despesa.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
  );
  const [competencia, setCompetencia] = useState(
    despesa ? despesa.competencia.slice(0, 7) : mesPadrao,
  );
  const [pagamento, setPagamento] = useState(despesa?.data_pagamento ?? "");
  const [fornecedor, setFornecedor] = useState(despesa?.fornecedor ?? "");
  const [recorrente, setRecorrente] = useState(despesa?.recorrente ?? false);

  const salvar = useMutation({
    mutationFn: async () => {
      const v = parseValorBR(valor);
      if (v === null || v <= 0) throw new Error("Valor inválido.");
      const comp = parseCompetencia(competencia);
      if (!comp) throw new Error("Competência inválida.");
      if (!descricao.trim()) throw new Error("Informe a descrição.");
      if (!unidadeId || !categoriaId) throw new Error("Escolha unidade e categoria.");
      const payload = {
        unidade_id: unidadeId,
        categoria_id: categoriaId,
        descricao: descricao.trim(),
        valor: v,
        competencia: comp,
        data_pagamento: pagamento || null,
        fornecedor: fornecedor.trim() || null,
        recorrente,
      };
      const { error } = despesa
        ? await supabase.from("dre_despesas").update(payload).eq("id", despesa.id)
        : await supabase.from("dre_despesas").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa salva.");
      invalidar();
      onFechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{despesa ? "Editar despesa" : "Nova despesa"}</DialogTitle>
          <DialogDescription>
            Regime competência usa o mês de competência; regime caixa, a data de pagamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label htmlFor="dre-desp-descricao">Descrição</Label>
            <Input
              id="dre-desp-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-desp-valor">Valor (R$)</Label>
            <Input
              id="dre-desp-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-desp-competencia">Competência</Label>
            <Input
              id="dre-desp-competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-desp-pagamento">Data de pagamento (opcional)</Label>
            <Input
              id="dre-desp-pagamento"
              type="date"
              value={pagamento}
              onChange={(e) => setPagamento(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dre-desp-fornecedor">Fornecedor (opcional)</Label>
            <Input
              id="dre-desp-fornecedor"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="dre-desp-recorrente" checked={recorrente} onCheckedChange={setRecorrente} />
            <Label htmlFor="dre-desp-recorrente">
              Recorrente (entra no "replicar mês anterior")
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 6. Orçamento — import CSV unidade;ano;mes;linha;valor
// ---------------------------------------------------------------------------

function AbaOrcamento({ unidades }: { unidades: DreUnidade[] }) {
  const invalidar = useInvalidarDre();
  const arquivoRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["dre", "config", "orcamento-resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("dre_orcamento").select("unidade_id, ano, valor");
      if (error) throw error;
      const grupos = new Map<string, { unidadeId: string; ano: number; linhas: number }>();
      for (const r of data ?? []) {
        const chave = `${r.unidade_id}|${r.ano}`;
        const g = grupos.get(chave) ?? { unidadeId: r.unidade_id, ano: r.ano, linhas: 0 };
        g.linhas += 1;
        grupos.set(chave, g);
      }
      return Array.from(grupos.values()).sort((a, b) => b.ano - a.ano);
    },
  });

  const importar = useMutation({
    mutationFn: async (file: File) => {
      const linhas = await readTabularFile(file);
      if (linhas.length === 0) throw new Error("Arquivo vazio.");
      const porNomeUnidade = new Map(unidades.map((u) => [u.nome.trim().toLowerCase(), u.id]));
      const registros: Array<{
        unidade_id: string;
        ano: number;
        mes: number;
        linha: string;
        valor: number;
      }> = [];
      const erros: string[] = [];
      linhas.forEach((row, i) => {
        const pega = (chave: string) => String(row[chave] ?? row[chave.toUpperCase()] ?? "").trim();
        const unidadeId = porNomeUnidade.get(pega("unidade").toLowerCase());
        const ano = Number(pega("ano"));
        const mes = Number(pega("mes"));
        const linha = pega("linha");
        const valor = parseValorBR(pega("valor"));
        if (!unidadeId) erros.push(`linha ${i + 2}: unidade "${pega("unidade")}" não encontrada`);
        else if (!Number.isInteger(ano) || ano < 2000 || ano > 2100)
          erros.push(`linha ${i + 2}: ano inválido`);
        else if (!Number.isInteger(mes) || mes < 1 || mes > 12)
          erros.push(`linha ${i + 2}: mês inválido`);
        else if (!DRE_LINHA_KEYS.includes(linha as (typeof DRE_LINHA_KEYS)[number]))
          erros.push(`linha ${i + 2}: chave de linha "${linha}" desconhecida`);
        else if (valor === null) erros.push(`linha ${i + 2}: valor inválido`);
        else registros.push({ unidade_id: unidadeId, ano, mes, linha, valor });
      });
      if (erros.length > 0) throw new Error(`Import abortado:\n${erros.slice(0, 5).join("\n")}`);
      const { error } = await supabase
        .from("dre_orcamento")
        .upsert(registros, { onConflict: "unidade_id,ano,mes,linha" });
      if (error) throw error;
      return registros.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} células de orçamento importadas.`);
      invalidar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no import."),
  });

  const baixarModelo = () => {
    const ano = new Date().getFullYear();
    downloadCsv(
      "modelo-orcamento-dre",
      unidades.slice(0, 1).flatMap((u) =>
        ["faturamento", "custos_fixos"].flatMap((linha) =>
          Array.from({ length: 3 }, (_, m) => ({
            unidade: u.nome,
            ano,
            mes: m + 1,
            linha,
            valor: 0,
          })),
        ),
      ),
    );
  };

  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "—";

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            CSV no layout <code>unidade;ano;mes;linha;valor</code>. Chaves de linha válidas:{" "}
            {DRE_LINHA_KEYS.join(", ")}.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={baixarModelo}>
              Baixar modelo
            </Button>
            <input
              ref={arquivoRef}
              type="file"
              accept=".csv,.txt,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importar.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              onClick={() => arquivoRef.current?.click()}
              disabled={importar.isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importar.isPending ? "Importando…" : "Importar CSV"}
            </Button>
          </div>
        </div>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState
            title="Nenhum orçamento importado."
            description='Importe o CSV para ligar o "Comparar com orçado" na DRE.'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Ano</TableHead>
                <TableHead className="text-right">Células orçadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data ?? []).map((g) => (
                <TableRow key={`${g.unidadeId}-${g.ano}`}>
                  <TableCell className="font-medium">{nomeUnidade(g.unidadeId)}</TableCell>
                  <TableCell className="text-right">{g.ano}</TableCell>
                  <TableCell className="text-right">{g.linhas}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
