import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { ROTULO_BLOCO, hhmm } from "@/lib/proposta-link";
import {
  agruparPorCorretor,
  calcularMetricas,
  inicioPeriodo,
  type MetricasPainel,
  type Periodo,
  type PropostaPainel,
} from "@/lib/proposta-painel";

export const Route = createFileRoute("/_authenticated/propostas")({
  head: () => ({
    meta: [
      { title: "Links de Proposta: painel | Seu Metro Quadrado" },
      { name: "description", content: "Desempenho dos links de apresentação e proposta enviados aos clientes." },
      { property: "og:title", content: "Links de Proposta: painel" },
      { property: "og:description", content: "Aberturas, leitura, visitas pedidas e aceites por corretor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropostasPage,
});

const PERIODOS: { v: Periodo; r: string }[] = [
  { v: "7d", r: "Últimos 7 dias" },
  { v: "30d", r: "Últimos 30 dias" },
  { v: "90d", r: "Últimos 90 dias" },
  { v: "mes", r: "Mês atual" },
  { v: "tudo", r: "Todo o período" },
];

const fmtPct = (v: number | null) => (v == null ? "sem dado" : `${v.toLocaleString("pt-BR")}%`);
const fmtT = (v: number | null) => (v == null ? "sem dado" : hhmm(v));

type Linha = PropostaPainel & { projeto_nome: string | null };

function PropostasPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente, loading: rolesLoading } = useUserRoles();
  const gestor = isAdmin || isGestor || isSuperintendente;
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [corretor, setCorretor] = useState("todos");
  const [projeto, setProjeto] = useState("todos");

  const q = useQuery({
    queryKey: ["propostas-painel", periodo, gestor, user?.id],
    enabled: !!user && !rolesLoading,
    queryFn: async () => {
      let qb = supabase
        .from("propostas")
        .select(
          "id, modelo, corretor_id, projeto_id, created_at, primeira_abertura_em, aceita_em, projetos(nome), proposta_sessoes(tempo_total_s, tempo_por_secao), proposta_eventos(tipo)",
        )
        .not("token_hash", "is", null)
        .is("deleted_at", null)
        .eq("proposta_eventos.tipo", "visita_pedida");
      const ini = inicioPeriodo(periodo);
      if (ini) qb = qb.gte("created_at", ini);
      if (!gestor && user) qb = qb.eq("corretor_id", user.id);
      const { data, error } = await qb.order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      const linhas: Linha[] = (data ?? []).map((r) => ({
        id: r.id,
        modelo: r.modelo === "proposta" ? "proposta" : "apresentacao",
        corretor_id: r.corretor_id,
        projeto_id: r.projeto_id,
        created_at: r.created_at,
        primeira_abertura_em: r.primeira_abertura_em,
        aceita_em: r.aceita_em,
        sessoes: r.proposta_sessoes ?? [],
        visita_pedida: (r.proposta_eventos ?? []).length > 0,
        projeto_nome: (r.projetos as { nome: string } | null)?.nome ?? null,
      }));
      const ids = [...new Set(linhas.map((l) => l.corretor_id).filter(Boolean))] as string[];
      const nomes: Record<string, string> = {};
      if (ids.length) {
        const { data: perf } = await supabase.from("profiles").select("id, nome").in("id", ids);
        for (const p of perf ?? []) nomes[p.id] = p.nome ?? "Sem nome";
      }
      return { linhas, nomes };
    },
  });

  const linhas = q.data?.linhas ?? [];
  const nomes = q.data?.nomes ?? {};
  const projetos = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (l.projeto_id) m.set(l.projeto_id, l.projeto_nome ?? "Projeto");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [linhas]);
  const filtradas = linhas.filter(
    (l) => (corretor === "todos" || l.corretor_id === corretor) && (projeto === "todos" || l.projeto_id === projeto),
  );
  const m = calcularMetricas(filtradas);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Links de Proposta"
        description={gestor ? "Como os clientes leem as apresentações e propostas do time." : "Como seus clientes leem os links que você enviou."}
      />
      <Tabs defaultValue="painel">
        <TabsList>
          <TabsTrigger value="painel">Painel</TabsTrigger>
        </TabsList>
        <TabsContent value="painel" className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="w-48" aria-label="Período"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.r}</SelectItem>)}</SelectContent>
            </Select>
            {gestor && (
              <Select value={corretor} onValueChange={setCorretor}>
                <SelectTrigger className="w-56" aria-label="Corretor"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os corretores</SelectItem>
                  {Object.entries(nomes).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={projeto} onValueChange={setProjeto}>
              <SelectTrigger className="w-64" aria-label="Projeto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os projetos</SelectItem>
                {projetos.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {q.isError ? (
            <QueryErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : q.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <Cartoes m={m} />
              {gestor && <TabelaCorretores linhas={filtradas} nomes={nomes} />}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-display text-2xl font-bold text-foreground">{valor}</p>
        {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

function Cartoes({ m }: { m: MetricasPainel }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Cartao titulo="Enviadas" valor={String(m.enviadas)} detalhe={`${m.apresentacoes} apresentações · ${m.propostas} propostas`} />
      <Cartao titulo="Abertas" valor={fmtPct(m.pctAbertas)} detalhe={`${m.abertas} de ${m.enviadas}`} />
      <Cartao titulo="Até a 1ª abertura" valor={fmtT(m.tempoPrimeiraAberturaS)} detalhe="média, hh:mm" />
      <Cartao titulo="Tempo de leitura" valor={fmtT(m.tempoMedioLeituraS)} detalhe="média por sessão, hh:mm" />
      <Cartao titulo="Seção mais lida" valor={m.secaoMaisLida ? (ROTULO_BLOCO[m.secaoMaisLida] ?? m.secaoMaisLida) : "sem dado"} />
      <Cartao titulo="Apresentação → visita" valor={fmtPct(m.pctApresentacaoVisita)} detalhe={`${m.visitasPedidas} visitas pedidas`} />
      <Cartao titulo="Proposta → aceite" valor={fmtPct(m.pctPropostaAceite)} detalhe={`${m.aceites} aceites`} />
    </div>
  );
}

type Col = "nome" | "enviadas" | "pctAbertas" | "tempoPrimeiraAberturaS" | "tempoMedioLeituraS" | "pctApresentacaoVisita" | "pctPropostaAceite";
const COLS: { k: Col; r: string }[] = [
  { k: "nome", r: "Corretor" },
  { k: "enviadas", r: "Enviadas" },
  { k: "pctAbertas", r: "% abertas" },
  { k: "tempoPrimeiraAberturaS", r: "Até 1ª abertura" },
  { k: "tempoMedioLeituraS", r: "Leitura média" },
  { k: "pctApresentacaoVisita", r: "Apres. → visita" },
  { k: "pctPropostaAceite", r: "Proposta → aceite" },
];

function TabelaCorretores({ linhas, nomes }: { linhas: PropostaPainel[]; nomes: Record<string, string> }) {
  const [ord, setOrd] = useState<{ k: Col; asc: boolean }>({ k: "enviadas", asc: false });
  const rows = agruparPorCorretor(linhas)
    .map((r) => ({ ...r, nome: nomes[r.corretor_id] ?? "Sem corretor" }))
    .sort((a, b) => {
      const va = a[ord.k], vb = b[ord.k];
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "string" ? va.localeCompare(String(vb)) : Number(va) - Number(vb);
      return ord.asc ? c : -c;
    });
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {COLS.map((c) => (
                <th key={c.k} className="px-4 py-3">
                  <button
                    type="button"
                    className="font-semibold hover:text-foreground"
                    onClick={() => setOrd((o) => ({ k: c.k, asc: o.k === c.k ? !o.asc : c.k === "nome" }))}
                  >
                    {c.r} {ord.k === c.k ? (ord.asc ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Nenhum link no período.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.corretor_id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{r.nome}</td>
                <td className="px-4 py-3">{r.enviadas}</td>
                <td className="px-4 py-3">{fmtPct(r.pctAbertas)}</td>
                <td className="px-4 py-3">{fmtT(r.tempoPrimeiraAberturaS)}</td>
                <td className="px-4 py-3">{fmtT(r.tempoMedioLeituraS)}</td>
                <td className="px-4 py-3">{fmtPct(r.pctApresentacaoVisita)}</td>
                <td className="px-4 py-3">{fmtPct(r.pctPropostaAceite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
