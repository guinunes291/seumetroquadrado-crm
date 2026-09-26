// Painel do gestor da cadência.
//
// Quatro perguntas, nesta ordem, porque é a ordem em que a gestão pergunta:
//   1. quem está devendo hoje (por corretor);
//   2. o D3 se paga? (taxa de resposta por etapa, semana e empreendimento);
//   3. a reativação anda? (descanso, reativados, conversão);
//   4. o motor rodou? (últimos lotes, direto do log).
//
// Nenhuma soma acontece aqui: cada bloco é uma RPC (20260924120000).
//
// A coluna "Encerrados no processo" é cinza e fica SEPARADA de "Perdas por
// falha" de propósito — cadência cumprida sem retorno não conta contra o
// corretor. Juntá-las devolveria o incentivo de segurar lead para não perder,
// que é o comportamento que a cadência inteira existe para acabar.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  ChartLineUp,
  ClockCounterClockwise,
  Gear,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { rotuloEtapa } from "@/features/cadencia/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRoles } from "@/hooks/use-auth";
import { formatDuration } from "@/lib/duracao";
import { cn } from "@/lib/utils";
import {
  admitirEstoque,
  desfazerLote,
  fetchFase0Lotes,
  fetchFase0Pendentes,
  fetchPainelCorretores,
  fetchPainelEtapas,
  fetchPainelMotor,
  fetchPainelReativacao,
  type LinhaCorretor,
} from "@/features/cadencia/painel-client";

const pct = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const dia = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

function BlocoSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function PainelCadenciaView() {
  const { isAdmin } = useUserRoles();

  return (
    <div className="space-y-6">
      <TabelaCorretores />
      <TabelaEtapas />
      <BlocoReativacao />
      {isAdmin && <CardFase0 />}
      <TabelaMotor />
    </div>
  );
}

type Ordem = keyof Pick<
  LinhaCorretor,
  | "corretor_nome"
  | "fazer_hoje"
  | "atrasados"
  | "cumprimento_pct"
  | "perdas_por_falha"
  | "taxa_resposta_pct"
  | "minutos_1a_tentativa"
>;

function TabelaCorretores() {
  const [ordem, setOrdem] = useState<Ordem>("atrasados");
  const q = useQuery({
    queryKey: ["cadencia:painel:corretores"],
    queryFn: () => fetchPainelCorretores(),
  });

  const linhas = useMemo(() => {
    const base = [...(q.data ?? [])];
    return base.sort((a, b) => {
      if (ordem === "corretor_nome") {
        return (a.corretor_nome ?? "").localeCompare(b.corretor_nome ?? "");
      }
      const va = a[ordem] ?? -1;
      const vb = b[ordem] ?? -1;
      return Number(vb) - Number(va);
    });
  }, [q.data, ordem]);

  if (q.isLoading) return <BlocoSkeleton />;
  if (q.isError)
    return <QueryErrorState error={q.error as Error} onRetry={() => void q.refetch()} />;

  const Coluna = ({ campo, children }: { campo: Ordem; children: React.ReactNode }) => (
    <TableHead>
      <button
        type="button"
        className={cn("hover:underline", ordem === campo && "font-semibold text-foreground")}
        onClick={() => setOrdem(campo)}
      >
        {children}
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersThree size={18} weight="duotone" /> Por corretor
        </CardTitle>
        <CardDescription>
          Últimos 30 dias. Cadência cumprida sem retorno aparece como{" "}
          <strong>encerrado no processo</strong> e não entra nas perdas do corretor — só o prazo
          deixado vencer conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <EmptyState
            icon={UsersThree}
            title="Sem corretores no seu escopo"
            description="Quando o time tiver leads em cadência, os indicadores aparecem aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <Coluna campo="corretor_nome">Corretor</Coluna>
                  <Coluna campo="fazer_hoje">Fazer hoje</Coluna>
                  <Coluna campo="atrasados">Atrasados</Coluna>
                  <TableHead>Encerrados no processo</TableHead>
                  <Coluna campo="cumprimento_pct">Cumprimento</Coluna>
                  <Coluna campo="perdas_por_falha">Perdas por falha</Coluna>
                  <Coluna campo="taxa_resposta_pct">Taxa de resposta</Coluna>
                  <Coluna campo="minutos_1a_tentativa">1ª tentativa</Coluna>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.corretor_id}>
                    <TableCell className="font-medium">{l.corretor_nome ?? "—"}</TableCell>
                    <TableCell>{l.fazer_hoje}</TableCell>
                    <TableCell>
                      {l.atrasados > 0 ? (
                        <Badge variant="destructive">{l.atrasados}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.encerrados_no_processo}
                    </TableCell>
                    <TableCell>{pct(l.cumprimento_pct)}</TableCell>
                    <TableCell>{l.perdas_por_falha}</TableCell>
                    <TableCell>
                      {pct(l.taxa_resposta_pct)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({l.responderam}/{l.entraram_d1})
                      </span>
                    </TableCell>
                    <TableCell>{formatDuration(l.minutos_1a_tentativa)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TabelaEtapas() {
  const q = useQuery({
    queryKey: ["cadencia:painel:etapas"],
    queryFn: () => fetchPainelEtapas(),
  });

  if (q.isLoading) return <BlocoSkeleton />;
  if (q.isError)
    return <QueryErrorState error={q.error as Error} onRetry={() => void q.refetch()} />;

  const linhas = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChartLineUp size={18} weight="duotone" /> Resposta por etapa
        </CardTitle>
        <CardDescription>
          Por semana e empreendimento. É o número que diz se o D3 se paga: o denominador conta quem
          recebeu toque na etapa, não quem passou por ela no papel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <EmptyState
            icon={ChartLineUp}
            title="Sem toques no período"
            description="A taxa por etapa aparece assim que houver ligações e mensagens registradas."
          />
        ) : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Empreendimento</TableHead>
                  <TableHead>Alcançaram</TableHead>
                  <TableHead>Responderam</TableHead>
                  <TableHead>Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={`${l.semana}-${l.etapa}-${l.empreendimento}`}>
                    <TableCell>{dia(l.semana)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rotuloEtapa(l.etapa)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{l.empreendimento}</TableCell>
                    <TableCell>{l.alcancaram}</TableCell>
                    <TableCell>{l.responderam}</TableCell>
                    <TableCell>{pct(l.taxa_resposta_pct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BlocoReativacao() {
  const q = useQuery({
    queryKey: ["cadencia:painel:reativacao"],
    queryFn: () => fetchPainelReativacao(),
  });

  if (q.isLoading) return <BlocoSkeleton />;
  if (q.isError)
    return <QueryErrorState error={q.error as Error} onRetry={() => void q.refetch()} />;

  const r = q.data!;
  const itens: Array<[string, string]> = [
    ["Em descanso", String(r.em_descanso)],
    ["Elegíveis hoje", String(r.elegiveis_hoje)],
    ["Em trabalho", String(r.em_trabalho)],
    ["Reativados (30 d)", String(r.reativados)],
    ["Sem retorno (30 d)", String(r.sem_retorno)],
    ["Taxa de reativação", pct(r.taxa_reativacao_pct)],
    ["Chegaram a agendado+", String(r.convertidos)],
    ["Conversão do reativado", pct(r.conversao_pct)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowCounterClockwise size={18} weight="duotone" /> Reativação
        </CardTitle>
        <CardDescription>
          Quem está em descanso não é acionável — a janela existe para o número não ser bloqueado no
          discador.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="text-xl font-semibold">{valor}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TabelaMotor() {
  const q = useQuery({
    queryKey: ["cadencia:painel:motor"],
    queryFn: () => fetchPainelMotor(20),
  });

  if (q.isLoading) return <BlocoSkeleton />;
  if (q.isError)
    return <QueryErrorState error={q.error as Error} onRetry={() => void q.refetch()} />;

  const linhas = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gear size={18} weight="duotone" /> Motor
        </CardTitle>
        <CardDescription>
          Últimas execuções, direto do registro do motor. Em modo sombra as decisões são gravadas e
          nada é movido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <EmptyState
            icon={Warning}
            title="O motor ainda não registrou nada"
            description="As varreduras rodam de hora em hora e diariamente. Se nada aparecer aqui em 24 horas, avise o time técnico."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Rotina</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Avaliados</TableHead>
                  <TableHead>Aplicados</TableHead>
                  <TableHead>Motivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.lote_id}>
                    <TableCell>{dataHora(l.executado_em)}</TableCell>
                    <TableCell className="font-medium">{l.job}</TableCell>
                    <TableCell>
                      <Badge variant={l.modo === "ativo" ? "default" : "secondary"}>{l.modo}</Badge>
                    </TableCell>
                    <TableCell>{l.avaliados}</TableCell>
                    <TableCell>{l.aplicados}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Object.entries(l.motivos ?? {})
                        .map(([m, n]) => `${m}: ${n}`)
                        .join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Admissão do estoque (Fase 0) pela tela — admin.
 *
 * Não vira rotina automática: a taxa de admissão é decisão de gestão, e o
 * volume por corretor ainda está em discussão. O ensaio (modo sombra) fica ao
 * lado do botão real justamente para que a decisão seja tomada com o número
 * na frente.
 */
function CardFase0() {
  const qc = useQueryClient();
  const [taxa, setTaxa] = useState("15");

  const pendentes = useQuery({
    queryKey: ["cadencia:fase0:pendentes"],
    queryFn: fetchFase0Pendentes,
  });
  const lotes = useQuery({
    queryKey: ["cadencia:fase0:lotes"],
    queryFn: () => fetchFase0Lotes(20),
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["cadencia:fase0:pendentes"] });
    void qc.invalidateQueries({ queryKey: ["cadencia:fase0:lotes"] });
    void qc.invalidateQueries({ queryKey: ["cadencia:painel:corretores"] });
  };

  const admitir = useMutation({
    mutationFn: ({ modo }: { modo: "sombra" | "ativo" }) =>
      admitirEstoque(modo, Math.max(1, Number(taxa) || 1)),
    onSuccess: (r) => {
      toast.success(
        r.modo === "ativo"
          ? `${r.admitidos} leads admitidos na cadência, de ${r.corretores} corretores.`
          : `Ensaio: ${r.admitidos} leads de ${r.corretores} corretores entrariam. Nada foi movido.`,
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desfazer = useMutation({
    mutationFn: (lote: string) => desfazerLote(lote),
    onSuccess: (n) => {
      toast.success(`${n} leads voltaram ao estado anterior.`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = (pendentes.data ?? []).reduce((s, p) => s + p.pendentes, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClockCounterClockwise size={18} weight="duotone" /> Admissão do estoque
        </CardTitle>
        <CardDescription>
          {total} leads de carteira ainda fora da cadência. A admissão é por corretor, do mais
          quente para o mais frio, e nunca automática.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="fase0-taxa">Leads por corretor</Label>
            <Input
              id="fase0-taxa"
              type="number"
              min={1}
              max={200}
              value={taxa}
              onChange={(e) => setTaxa(e.target.value)}
              className="w-32"
            />
          </div>
          <Button
            variant="outline"
            disabled={admitir.isPending}
            onClick={() => admitir.mutate({ modo: "sombra" })}
          >
            Ensaiar
          </Button>
          <Button disabled={admitir.isPending} onClick={() => admitir.mutate({ modo: "ativo" })}>
            Admitir agora
          </Button>
        </div>

        {pendentes.isLoading ? (
          <BlocoSkeleton />
        ) : pendentes.isError ? (
          <QueryErrorState
            error={pendentes.error as Error}
            onRetry={() => void pendentes.refetch()}
          />
        ) : (
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corretor</TableHead>
                  <TableHead>A admitir</TableHead>
                  <TableHead>Dias parados (média)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pendentes.data ?? []).map((p) => (
                  <TableRow key={p.corretor_id ?? p.corretor_nome}>
                    <TableCell>{p.corretor_nome}</TableCell>
                    <TableCell>{p.pendentes}</TableCell>
                    <TableCell>{p.dias_medio ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Lotes já admitidos</p>
          {(lotes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma admissão registrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Admitidos</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lotes.data ?? []).map((l) => (
                  <TableRow key={l.lote_id}>
                    <TableCell>{dataHora(l.executado_em)}</TableCell>
                    <TableCell>
                      <Badge variant={l.modo === "ativo" ? "default" : "secondary"}>{l.modo}</Badge>
                    </TableCell>
                    <TableCell>
                      {l.aplicados} de {l.avaliados}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.desfeito ? (
                        <span className="text-xs text-muted-foreground">desfeito</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={desfazer.isPending}
                          onClick={() => desfazer.mutate(l.lote_id)}
                        >
                          Desfazer
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
