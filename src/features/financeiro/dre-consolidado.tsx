// DRE · Consolidado — o que a visão por unidade não mostra: comparativo entre
// as unidades, matriz societária editável (% por sócio × unidade), distribuição
// do lucro por sócio e renda total por pessoa (cadeiras + distribuição).
// Renderizado abaixo da cascata quando o filtro de unidade é "Consolidado rede".
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  MESES_CURTOS,
  dreMoeda,
  dreMoeda2,
  fetchDreGrade,
  fracaoParaPontos,
  pontosParaFracao,
  type DreGrade,
  type DreModoPct,
  type DreRegime,
  type DreSocio,
  type DreUnidade,
} from "@/lib/dre";

const CORES_BARRAS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function DreConsolidado({
  ano,
  regime,
  modoPct,
  unidades,
}: {
  ano: number;
  regime: DreRegime;
  modoPct: DreModoPct;
  unidades: DreUnidade[];
}) {
  const gradesQueries = useQueries({
    queries: unidades.map((u) => ({
      queryKey: ["dre", "grade", u.id, ano, regime, modoPct],
      queryFn: () => fetchDreGrade(u.id, ano, regime, modoPct),
    })),
  });
  const carregando = gradesQueries.some((q) => q.isPending);
  const grades = useMemo(
    () =>
      unidades.map((u, i) => ({ unidade: u, grade: gradesQueries[i]?.data })) as Array<{
        unidade: DreUnidade;
        grade: DreGrade | undefined;
      }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useQueries devolve array novo a cada render; os dados são a dependência real
    [unidades, ...gradesQueries.map((q) => q.data)],
  );

  return (
    <div className="space-y-4">
      <ComparativoUnidades grades={grades} carregando={carregando} ano={ano} />
      <MatrizSocietaria unidades={unidades} grades={grades} ano={ano} />
      <RendaPorPessoa ano={ano} unidades={unidades} grades={grades} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// a) Comparativo entre unidades + EBITDA por mês
// ---------------------------------------------------------------------------

function ComparativoUnidades({
  grades,
  carregando,
  ano,
}: {
  grades: Array<{ unidade: DreUnidade; grade: DreGrade | undefined }>;
  carregando: boolean;
  ano: number;
}) {
  const dadosBarras = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        mes: MESES_CURTOS[i],
        ...Object.fromEntries(
          grades.map(({ unidade, grade }) => [unidade.nome, grade?.ebitda?.[i + 1] ?? 0]),
        ),
      })),
    [grades],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparativo entre unidades — {ano}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <Skeleton className="h-40 w-full" aria-busy="true" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">VGV</TableHead>
                    <TableHead className="text-right">Receita Líquida</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="text-right">EBITDA</TableHead>
                    <TableHead className="text-right">Lucro p/ Distribuição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map(({ unidade, grade }) => (
                    <TableRow key={unidade.id}>
                      <TableCell className="font-medium">{unidade.nome}</TableCell>
                      <Num v={grade?.vgv?.[0]} />
                      <Num v={grade?.receita_liquida?.[0]} />
                      <Num v={grade?.margem_empresa?.[0]} />
                      <Num v={grade?.ebitda?.[0]} />
                      <Num v={grade?.lucro_distribuicao?.[0]} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosBarras} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => dreMoeda(v)}
                    width={90}
                  />
                  <Tooltip formatter={(v) => dreMoeda2(Number(v))} />
                  <Legend />
                  {grades.map(({ unidade }, i) => (
                    <Bar
                      key={unidade.id}
                      dataKey={unidade.nome}
                      fill={CORES_BARRAS[i % CORES_BARRAS.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                EBITDA por unidade, mês a mês
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Num({ v }: { v: number | undefined }) {
  return (
    <TableCell className={cn("text-right tabular-nums", (v ?? 0) < 0 && "text-destructive")}>
      {v === undefined ? "—" : dreMoeda2(v)}
    </TableCell>
  );
}

// ---------------------------------------------------------------------------
// b) + c) Matriz societária editável e distribuição do lucro por sócio
// ---------------------------------------------------------------------------

async function fetchSocios(): Promise<DreSocio[]> {
  const { data, error } = await supabase
    .from("dre_socios_participacao")
    .select("*")
    .is("vigencia_fim", null)
    .order("socio_nome");
  if (error) throw error;
  return data ?? [];
}

function MatrizSocietaria({
  unidades,
  grades,
  ano,
}: {
  unidades: DreUnidade[];
  grades: Array<{ unidade: DreUnidade; grade: DreGrade | undefined }>;
  ano: number;
}) {
  const queryClient = useQueryClient();
  const sociosQuery = useQuery({ queryKey: ["dre", "socios"], queryFn: fetchSocios });
  const socios = sociosQuery.data ?? [];
  const nomes = useMemo(() => Array.from(new Set(socios.map((s) => s.socio_nome))), [socios]);

  // edição local: id da linha → texto digitado (pontos percentuais)
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  useEffect(() => setEdicao({}), [sociosQuery.data]);

  const valorAtual = (s: DreSocio): number | null => {
    const texto = edicao[s.id];
    if (texto === undefined) return s.percentual;
    return pontosParaFracao(texto);
  };

  const somaUnidade = (unidadeId: string): number | null => {
    let soma = 0;
    for (const s of socios.filter((x) => x.unidade_id === unidadeId)) {
      const v = valorAtual(s);
      if (v === null) return null;
      soma += v;
    }
    return soma;
  };

  // A planilha oficial usa 0,1670 para 1/6, então cada unidade fecha em 100,1%
  // — tolera-se o arredondamento (±0,5 p.p.); fora disso o salvamento bloqueia.
  const somaOk = (soma: number | null) => soma !== null && Math.abs(soma - 1) <= 0.005;
  const tudoValido = unidades.every((u) => somaOk(somaUnidade(u.id)));
  const temMudanca = Object.keys(edicao).length > 0;

  const salvar = useMutation({
    mutationFn: async () => {
      const mudancas = socios
        .filter((s) => edicao[s.id] !== undefined)
        .map((s) => ({ id: s.id, percentual: pontosParaFracao(edicao[s.id]) }));
      if (mudancas.some((m) => m.percentual === null)) {
        throw new Error("Percentual inválido — use números como 16,70.");
      }
      for (const m of mudancas) {
        const { error } = await supabase
          .from("dre_socios_participacao")
          .update({ percentual: m.percentual! })
          .eq("id", m.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Matriz societária salva.");
      void queryClient.invalidateQueries({ queryKey: ["dre", "socios"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar."),
  });

  const lucroDaUnidade = (unidadeId: string) =>
    grades.find((g) => g.unidade.id === unidadeId)?.grade?.lucro_distribuicao?.[0] ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Matriz societária e distribuição do lucro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {sociosQuery.isPending ? (
          <Skeleton className="h-32 w-full" aria-busy="true" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sócio</TableHead>
                    {unidades.map((u) => (
                      <TableHead key={u.id} className="text-right">
                        {u.nome} (%)
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nomes.map((nome) => (
                    <TableRow key={nome}>
                      <TableCell className="font-medium">{nome}</TableCell>
                      {unidades.map((u) => {
                        const linha = socios.find(
                          (s) => s.socio_nome === nome && s.unidade_id === u.id,
                        );
                        if (!linha)
                          return (
                            <TableCell key={u.id} className="text-right">
                              —
                            </TableCell>
                          );
                        return (
                          <TableCell key={u.id} className="text-right">
                            <Input
                              inputMode="decimal"
                              className="ml-auto h-8 w-24 text-right tabular-nums"
                              aria-label={`Participação de ${nome} em ${u.nome}`}
                              value={edicao[linha.id] ?? fracaoParaPontos(linha.percentual)}
                              onChange={(e) =>
                                setEdicao((prev) => ({ ...prev, [linha.id]: e.target.value }))
                              }
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Soma</TableCell>
                    {unidades.map((u) => {
                      const soma = somaUnidade(u.id);
                      return (
                        <TableCell
                          key={u.id}
                          className={cn(
                            "text-right tabular-nums",
                            !somaOk(soma) && "text-destructive",
                          )}
                        >
                          {soma === null ? "inválido" : `${fracaoParaPontos(soma)}%`}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                A soma de cada unidade precisa fechar em 100% (tolerância de 0,5 p.p. para o
                arredondamento da planilha). Fora disso o salvamento é bloqueado.
              </p>
              <Button
                size="sm"
                disabled={!temMudanca || !tudoValido || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                {salvar.isPending ? "Salvando…" : "Salvar matriz"}
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">
                Distribuição do lucro por sócio — {ano}
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sócio</TableHead>
                      {unidades.map((u) => (
                        <TableHead key={u.id} className="text-right">
                          {u.nome}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nomes.map((nome) => {
                      const porUnidade = unidades.map((u) => {
                        const linha = socios.find(
                          (s) => s.socio_nome === nome && s.unidade_id === u.id,
                        );
                        return lucroDaUnidade(u.id) * (linha?.percentual ?? 0);
                      });
                      const total = porUnidade.reduce((s, v) => s + v, 0);
                      return (
                        <TableRow key={nome}>
                          <TableCell className="font-medium">{nome}</TableCell>
                          {porUnidade.map((v, i) => (
                            <Num key={unidades[i].id} v={v} />
                          ))}
                          <TableCell className="text-right font-semibold tabular-nums">
                            {dreMoeda2(total)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Lucro para Distribuição de cada unidade no ano × participação vigente do sócio.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// d) Renda total por pessoa (cadeiras + distribuição)
// ---------------------------------------------------------------------------

type RendaPessoa = {
  nome: string;
  corretor: number;
  gerente: number;
  superintendente: number;
  distribuicao: number;
};

function RendaPorPessoa({
  ano,
  unidades,
  grades,
}: {
  ano: number;
  unidades: DreUnidade[];
  grades: Array<{ unidade: DreUnidade; grade: DreGrade | undefined }>;
}) {
  const rendaQuery = useQuery({
    queryKey: ["dre", "renda-pessoas", ano],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dre_renda_pessoas", { p_ano: ano });
      if (error) throw error;
      return data ?? [];
    },
  });
  const sociosQuery = useQuery({ queryKey: ["dre", "socios"], queryFn: fetchSocios });

  const linhas = useMemo((): RendaPessoa[] => {
    const porNome = new Map<string, RendaPessoa>();
    const garante = (nome: string) => {
      const chave = nome.trim();
      let atual = porNome.get(chave);
      if (!atual) {
        atual = { nome: chave, corretor: 0, gerente: 0, superintendente: 0, distribuicao: 0 };
        porNome.set(chave, atual);
      }
      return atual;
    };
    for (const r of rendaQuery.data ?? []) {
      const linha = garante(r.nome);
      if (r.tipo === "corretor") linha.corretor += Number(r.total) || 0;
      else if (r.tipo === "gerente") linha.gerente += Number(r.total) || 0;
      else linha.superintendente += Number(r.total) || 0;
    }
    // Distribuição por sócio: casa com a pessoa quando o primeiro nome do
    // beneficiário é o nome do sócio na matriz (a matriz usa primeiros nomes).
    const socios = sociosQuery.data ?? [];
    const nomesSocios = Array.from(new Set(socios.map((s) => s.socio_nome)));
    for (const socio of nomesSocios) {
      const total = unidades.reduce((soma, u) => {
        const linha = socios.find((s) => s.socio_nome === socio && s.unidade_id === u.id);
        const lucro =
          grades.find((g) => g.unidade.id === u.id)?.grade?.lucro_distribuicao?.[0] ?? 0;
        return soma + lucro * (linha?.percentual ?? 0);
      }, 0);
      const existente = Array.from(porNome.values()).find(
        (p) =>
          p.nome.toLowerCase() === socio.toLowerCase() ||
          p.nome.toLowerCase().startsWith(`${socio.toLowerCase()} `),
      );
      if (existente) existente.distribuicao += total;
      else garante(socio).distribuicao = total;
    }
    return Array.from(porNome.values()).sort(
      (a, b) =>
        b.corretor +
        b.gerente +
        b.superintendente +
        b.distribuicao -
        (a.corretor + a.gerente + a.superintendente + a.distribuicao),
    );
  }, [rendaQuery.data, sociosQuery.data, unidades, grades]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Renda total por pessoa — {ano}</CardTitle>
      </CardHeader>
      <CardContent>
        {rendaQuery.isPending ? (
          <Skeleton className="h-32 w-full" aria-busy="true" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead className="text-right">Corretor</TableHead>
                  <TableHead className="text-right">Gerente</TableHead>
                  <TableHead className="text-right">Sócio operador</TableHead>
                  <TableHead className="text-right">Distribuição de lucro</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((p) => (
                  <TableRow key={p.nome}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <Num v={p.corretor} />
                    <Num v={p.gerente} />
                    <Num v={p.superintendente} />
                    <Num v={p.distribuicao} />
                    <TableCell className="text-right font-semibold tabular-nums">
                      {dreMoeda2(p.corretor + p.gerente + p.superintendente + p.distribuicao)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              Cadeiras lidas das comissões de vendas aprovadas no ano (valor líquido); a coluna de
              distribuição usa a matriz societária vigente. A cadeira de sócio operador é a comissão
              de superintendência do CRM.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
