// Sub-aba SDR dos Relatórios (admin): o relatório PADRÃO do time de pré-venda,
// na semana em que a operação paga — SÁBADO a SEXTA, fechada no sábado de
// manhã. Quatro números por SDR, na ordem em que o pagamento é conferido:
// agendamentos, visitas realizadas, pastas (análise de crédito) e vendas —
// com a coluna de vendas RECEBIDAS, que é o que de fato libera o pagamento da
// venda ("venda só é paga no recebimento pela imobiliária").
//
// Cada número tem a lista nominal embaixo (cliente, SDR, corretor, data), para
// conferir linha a linha antes de pagar, e o PDF sai pronto para virar a folha
// da semana.

import { useMemo, useState } from "react";
import {
  CalendarBlank,
  CheckCircle,
  Eye,
  FileMagnifyingGlass,
  HandCoins,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportarPdfButton } from "@/features/dashboard/exportar-pdf-button";
import type { DocumentoRelatorio } from "@/features/dashboard/relatorios-pdf";
import { useCorretorNomes } from "@/features/dashboard/relatorios-nominais";
import {
  corretorNome,
  dataCurta,
  dataHora,
  fmtBRL,
  LeadCell,
  VazioPeriodo,
} from "@/features/dashboard/relatorios-partes";
import {
  useAgendamentosSemanaSdr,
  usePastasSemanaSdr,
  useSdrsDoTime,
  useVendasRecebidasSemanaSdr,
  useVendasSemanaSdr,
  useVisitasSemanaSdr,
  type AgendamentoSdrRow,
  type PastaSdrRow,
  type VendaSdrRow,
} from "@/features/dashboard/relatorios-sdr-queries";
import {
  comparecimentoSemana,
  offsetPadraoSdr,
  rangeSemanaSdr,
  resumoSemanaSdr,
  sdrDoRegistro,
  semanaFechada,
  semanasRecentesSdr,
  totalSemanaSdr,
  type LinhaSemanaSdr,
} from "@/features/dashboard/semana-sdr";

const QTD_SEMANAS = 8;

const VISITA_STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  realizado: { label: "Realizada", variant: "default" },
  nao_compareceu: { label: "Não compareceu", variant: "destructive" },
  agendado: { label: "Sem desfecho", variant: "outline" },
  confirmado: { label: "Sem desfecho", variant: "outline" },
  remarcado: { label: "Remarcada", variant: "outline" },
  cancelado: { label: "Cancelada", variant: "destructive" },
};

const RECEBIMENTO_LABEL: Record<string, string> = {
  pendente: "A receber",
  parcial: "Parcial",
  recebido: "Recebida",
};

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

/** Linha com SDR resolvido — a atribuição mora em `sdrDoRegistro`. */
type ComSdr<T> = T & { sdr_id: string | null };

export function RelatoriosSdrTab() {
  // As semanas são calculadas uma vez por montagem: a página não fica aberta
  // de um sábado para o outro, e recalcular a cada render trocaria o rótulo no
  // meio de uma conferência.
  const semanas = useMemo(() => semanasRecentesSdr(QTD_SEMANAS), []);
  // Sábado de manhã o gestor está fechando a folha: a aba já abre na semana
  // que acabou de terminar (`offsetPadraoSdr`), não na que começou hoje.
  const [chave, setChave] = useState(
    () => semanas[Math.abs(offsetPadraoSdr())]?.chave ?? semanas[0].chave,
  );
  const semana = semanas.find((s) => s.chave === chave) ?? semanas[0];
  const range = useMemo(() => rangeSemanaSdr(semana), [semana]);
  const fechada = useMemo(() => semanaFechada(semana), [semana]);

  const sdrsQ = useSdrsDoTime();
  const nomesQ = useCorretorNomes();
  const agendamentosQ = useAgendamentosSemanaSdr(range);
  const visitasQ = useVisitasSemanaSdr(range);
  const pastasQ = usePastasSemanaSdr(range);
  const vendasQ = useVendasSemanaSdr(range);
  const recebidasQ = useVendasRecebidasSemanaSdr(range);

  const [sdrFiltro, setSdrFiltro] = useState("todos");

  const sdrIds = useMemo(() => new Set((sdrsQ.data ?? []).map((s) => s.id)), [sdrsQ.data]);

  const agendamentos = useMemo<ComSdr<AgendamentoSdrRow>[]>(
    () =>
      (agendamentosQ.data ?? []).map((a) => ({
        ...a,
        sdr_id: sdrDoRegistro(a.lead?.sdr_id, a.criado_por_id, sdrIds),
      })),
    [agendamentosQ.data, sdrIds],
  );
  const visitas = useMemo<ComSdr<AgendamentoSdrRow>[]>(
    () =>
      (visitasQ.data ?? []).map((a) => ({
        ...a,
        sdr_id: sdrDoRegistro(a.lead?.sdr_id, a.criado_por_id, sdrIds),
      })),
    [visitasQ.data, sdrIds],
  );
  const pastas = useMemo<ComSdr<PastaSdrRow>[]>(
    () =>
      (pastasQ.data ?? []).map((p) => ({
        ...p,
        sdr_id: sdrDoRegistro(p.lead?.sdr_id, p.alterado_por, sdrIds),
      })),
    [pastasQ.data, sdrIds],
  );
  // Venda não tem "quem criou" que valha para a pré-venda: o vínculo é o dono
  // de pré-venda do lead, e só ele.
  const vendas = useMemo<ComSdr<VendaSdrRow>[]>(
    () => (vendasQ.data ?? []).map((v) => ({ ...v, sdr_id: v.lead?.sdr_id ?? null })),
    [vendasQ.data],
  );
  const recebidas = useMemo<ComSdr<VendaSdrRow>[]>(
    () => (recebidasQ.data ?? []).map((v) => ({ ...v, sdr_id: v.lead?.sdr_id ?? null })),
    [recebidasQ.data],
  );

  const linhas = useMemo(
    () =>
      resumoSemanaSdr({
        sdrs: sdrsQ.data ?? [],
        agendamentos,
        visitas,
        pastas,
        vendas: vendas.map((v) => ({ sdr_id: v.sdr_id, valor: Number(v.valor_venda) || 0 })),
        vendasRecebidas: recebidas.map((v) => ({
          sdr_id: v.sdr_id,
          valor: Number(v.valor_venda) || 0,
        })),
        nomes: nomesQ.data,
      }),
    [sdrsQ.data, agendamentos, visitas, pastas, vendas, recebidas, nomesQ.data],
  );
  const total = useMemo(() => totalSemanaSdr(linhas), [linhas]);

  const carregando =
    sdrsQ.isLoading ||
    agendamentosQ.isLoading ||
    visitasQ.isLoading ||
    pastasQ.isLoading ||
    vendasQ.isLoading ||
    recebidasQ.isLoading;
  const erro =
    sdrsQ.error ??
    agendamentosQ.error ??
    visitasQ.error ??
    pastasQ.error ??
    vendasQ.error ??
    recebidasQ.error;

  // Listas nominais: só o que é do SDR (é um relatório de pré-venda), com o
  // recorte por pessoa quando o gestor está conferindo a folha de alguém.
  const doSdr = <T extends { sdr_id: string | null }>(itens: T[]): T[] =>
    itens.filter((i) => i.sdr_id && (sdrFiltro === "todos" || i.sdr_id === sdrFiltro));

  const agendamentosLista = doSdr(agendamentos);
  const visitasLista = doSdr(visitas);
  const realizadasLista = visitasLista.filter((v) => v.status === "realizado");
  const pastasLista = doSdr(pastas);
  const vendasLista = doSdr(vendas);
  const recebidasLista = doSdr(recebidas);

  const nomeSdr = (id: string | null) => (id ? (nomesQ.data?.get(id) ?? "—") : "—");

  const montarPdf = (pdf: typeof import("@/features/dashboard/relatorios-pdf")) =>
    ({
      titulo: "Relatório semanal do SDR",
      periodo: semana.rotulo,
      blocos: [
        {
          titulo: "Resumo da semana",
          sub: `${linhas.length} SDR(s) · semana de pagamento sábado a sexta`,
          html:
            pdf.kpisPdf([
              { label: "Agendamentos", valor: String(total.agendamentos) },
              {
                label: "Visitas realizadas",
                valor: String(total.visitas_realizadas),
                hint: `${total.no_show} não compareceu`,
              },
              { label: "Pastas", valor: String(total.pastas) },
              { label: "Vendas assinadas", valor: String(total.vendas) },
              {
                label: "Vendas recebidas",
                valor: String(total.vendas_recebidas),
                hint: fmtBRL(total.vgv_recebido),
              },
            ]) +
            pdf.tabelaPdf(
              [
                "SDR",
                "Agend.",
                "Visitas",
                "No-show",
                "Compar.",
                "Pastas",
                "Vendas",
                "VGV",
                "Recebidas",
              ],
              [
                ...linhas.map((l) => [
                  l.nome,
                  l.agendamentos,
                  l.visitas_realizadas,
                  l.no_show,
                  pct(comparecimentoSemana(l.visitas_realizadas, l.no_show)),
                  l.pastas,
                  l.vendas,
                  fmtBRL(l.vgv),
                  l.vendas_recebidas,
                ]),
                [
                  "TOTAL",
                  total.agendamentos,
                  total.visitas_realizadas,
                  total.no_show,
                  pct(comparecimentoSemana(total.visitas_realizadas, total.no_show)),
                  total.pastas,
                  total.vendas,
                  fmtBRL(total.vgv),
                  total.vendas_recebidas,
                ],
              ],
              { direita: [1, 2, 3, 4, 5, 6, 7, 8] },
            ),
        },
        {
          titulo: "Agendamentos da semana",
          sub: `${agendamentosLista.length} visita(s) marcada(s)`,
          html: pdf.tabelaPdf(
            ["Marcado em", "Cliente", "SDR", "Corretor", "Para quando"],
            agendamentosLista.map((a) => [
              dataCurta(a.created_at),
              a.lead?.nome ?? "—",
              nomeSdr(a.sdr_id),
              corretorNome(a.corretor_id, nomesQ.data),
              dataHora(a.data_inicio),
            ]),
          ),
        },
        {
          titulo: "Visitas realizadas na semana",
          sub: `${realizadasLista.length} visita(s) com presença validada`,
          html: pdf.tabelaPdf(
            ["Dia da visita", "Cliente", "SDR", "Corretor"],
            realizadasLista.map((v) => [
              dataHora(v.data_inicio),
              v.lead?.nome ?? "—",
              nomeSdr(v.sdr_id),
              corretorNome(v.corretor_id, nomesQ.data),
            ]),
          ),
        },
        {
          titulo: "Pastas enviadas para análise de crédito",
          sub: `${pastasLista.length} pasta(s)`,
          html: pdf.tabelaPdf(
            ["Quando", "Cliente", "SDR", "Corretor"],
            pastasLista.map((p) => [
              dataCurta(p.created_at),
              p.lead?.nome ?? "—",
              nomeSdr(p.sdr_id),
              corretorNome(p.corretor_id, nomesQ.data),
            ]),
          ),
        },
        {
          titulo: "Vendas assinadas na semana",
          sub: `${vendasLista.length} venda(s)`,
          html: pdf.tabelaPdf(
            ["Assinatura", "Cliente", "SDR", "Corretor", "Empreendimento", "Valor", "Recebimento"],
            vendasLista.map((v) => [
              dataCurta(v.data_assinatura),
              v.lead?.nome ?? "—",
              nomeSdr(v.sdr_id),
              corretorNome(v.corretor_id, nomesQ.data),
              v.projeto_nome ?? "—",
              fmtBRL(Number(v.valor_venda) || 0),
              RECEBIMENTO_LABEL[v.status_recebimento] ?? v.status_recebimento,
            ]),
            { direita: [5] },
          ),
        },
        {
          titulo: "Vendas recebidas na semana (libera o pagamento)",
          sub: `${recebidasLista.length} venda(s) · ${fmtBRL(total.vgv_recebido)}`,
          html: pdf.tabelaPdf(
            ["Recebida em", "Cliente", "SDR", "Corretor", "Assinada em", "Valor"],
            recebidasLista.map((v) => [
              dataCurta(v.data_recebimento),
              v.lead?.nome ?? "—",
              nomeSdr(v.sdr_id),
              corretorNome(v.corretor_id, nomesQ.data),
              dataCurta(v.data_assinatura),
              fmtBRL(Number(v.valor_venda) || 0),
            ]),
            { direita: [5] },
          ),
        },
      ],
      rodape:
        "Semana do SDR: sábado a sexta (pagamento no sábado de manhã). Agendamento pela data em que foi marcado; visita pelo dia da visita com presença validada; pasta pela entrada em análise de crédito; venda pela assinatura, e o recebimento pela data em que a imobiliária recebeu. Cada número é do SDR dono de pré-venda do lead.",
    }) satisfies DocumentoRelatorio;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-2">
            <CalendarBlank className="h-4 w-4 text-muted-foreground" />
            <Select value={semana.chave} onValueChange={setChave}>
              <SelectTrigger className="w-[220px]" aria-label="Semana do SDR">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {semanas.map((s) => (
                  <SelectItem key={s.chave} value={s.chave}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant={fechada ? "default" : "outline"}>
            {fechada ? "Semana fechada — folha do sábado" : "Semana em curso"}
          </Badge>
          <span className="text-xs text-muted-foreground">{semana.rotulo}</span>
          <div className="ml-auto flex items-center gap-2">
            <Select value={sdrFiltro} onValueChange={setSdrFiltro}>
              <SelectTrigger className="w-[190px]" aria-label="Filtrar por SDR">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os SDRs</SelectItem>
                {(sdrsQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportarPdfButton montar={montarPdf} disabled={carregando} />
          </div>
        </CardContent>
      </Card>

      <StatGrid className="xl:grid-cols-5">
        <StatTile
          title="Agendamentos"
          value={total.agendamentos}
          icon={CalendarBlank}
          intent="info"
          loading={carregando}
          hint="Visitas marcadas na semana"
        />
        <StatTile
          title="Visitas realizadas"
          value={total.visitas_realizadas}
          icon={Eye}
          intent="success"
          loading={carregando}
          hint={`${total.no_show} não compareceu · ${pct(
            comparecimentoSemana(total.visitas_realizadas, total.no_show),
          )} de comparecimento`}
        />
        <StatTile
          title="Pastas"
          value={total.pastas}
          icon={FileMagnifyingGlass}
          intent="info"
          loading={carregando}
          hint="Entraram em análise de crédito"
        />
        <StatTile
          title="Vendas assinadas"
          value={total.vendas}
          icon={HandCoins}
          intent="neutral"
          loading={carregando}
          hint={fmtBRL(total.vgv)}
        />
        <StatTile
          title="Vendas recebidas"
          value={total.vendas_recebidas}
          icon={CheckCircle}
          intent="success"
          loading={carregando}
          hint={`${fmtBRL(total.vgv_recebido)} — libera o pagamento`}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por SDR</CardTitle>
          <p className="text-xs text-muted-foreground">
            Semana de pagamento: <strong>sábado a sexta</strong>. O SDR recebe por visita realizada,
            pasta (análise de crédito) enviada e venda — a venda só entra no pagamento quando a
            imobiliária recebe o valor, por isso a coluna “Recebidas”.
          </p>
        </CardHeader>
        <CardContent>
          <AsyncBoundary
            isLoading={carregando}
            isError={!!erro}
            error={erro}
            errorTitle="Não foi possível carregar o relatório do SDR."
            onRetry={() => {
              void sdrsQ.refetch();
              void agendamentosQ.refetch();
              void visitasQ.refetch();
              void pastasQ.refetch();
              void vendasQ.refetch();
              void recebidasQ.refetch();
            }}
            loadingFallback={<Skeleton className="h-48 w-full" />}
          >
            {linhas.length === 0 ? (
              <VazioPeriodo>
                Nenhum SDR cadastrado com o papel “sdr”. Atribua o papel em Configurações → Pessoas
                para o time aparecer aqui.
              </VazioPeriodo>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SDR</TableHead>
                      <TableHead className="text-right">Agendamentos</TableHead>
                      <TableHead className="text-right">Visitas realizadas</TableHead>
                      <TableHead className="text-right">No-show</TableHead>
                      <TableHead className="text-right">Comparecimento</TableHead>
                      <TableHead className="text-right">Pastas</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">VGV</TableHead>
                      <TableHead className="text-right">Recebidas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <LinhaSdr key={l.sdr_id} linha={l} />
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{total.agendamentos}</TableCell>
                      <TableCell className="text-right">{total.visitas_realizadas}</TableCell>
                      <TableCell className="text-right">{total.no_show}</TableCell>
                      <TableCell className="text-right">
                        {pct(comparecimentoSemana(total.visitas_realizadas, total.no_show))}
                      </TableCell>
                      <TableCell className="text-right">{total.pastas}</TableCell>
                      <TableCell className="text-right">{total.vendas}</TableCell>
                      <TableCell className="text-right">{fmtBRL(total.vgv)}</TableCell>
                      <TableCell className="text-right">{total.vendas_recebidas}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </AsyncBoundary>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaCard
          titulo="Agendamentos da semana"
          icone={<CalendarBlank className="h-4 w-4" />}
          contagem={agendamentosLista.length}
          vazio="Nenhuma visita marcada por SDR nesta semana."
          colunas={["Marcado em", "Cliente", "SDR", "Corretor", "Para quando"]}
          linhas={agendamentosLista.map((a) => ({
            id: a.id,
            celulas: [
              dataCurta(a.created_at),
              <LeadCell
                key="c"
                leadId={a.lead?.id ?? a.lead_id}
                nome={a.lead?.nome}
                telefone={a.lead?.telefone}
              />,
              nomeSdr(a.sdr_id),
              corretorNome(a.corretor_id, nomesQ.data),
              dataHora(a.data_inicio),
            ],
          }))}
        />

        <ListaCard
          titulo="Visitas da semana"
          icone={<Eye className="h-4 w-4" />}
          contagem={visitasLista.length}
          sub={`${realizadasLista.length} realizada(s) — só elas entram no pagamento`}
          vazio="Nenhuma visita de lead de SDR com dia nesta semana."
          colunas={["Dia da visita", "Cliente", "SDR", "Corretor", "Situação"]}
          linhas={visitasLista.map((v) => ({
            id: v.id,
            celulas: [
              dataHora(v.data_inicio),
              <LeadCell
                key="c"
                leadId={v.lead?.id ?? v.lead_id}
                nome={v.lead?.nome}
                telefone={v.lead?.telefone}
              />,
              nomeSdr(v.sdr_id),
              corretorNome(v.corretor_id, nomesQ.data),
              <Badge key="s" variant={VISITA_STATUS[v.status]?.variant ?? "outline"}>
                {VISITA_STATUS[v.status]?.label ?? v.status}
              </Badge>,
            ],
          }))}
        />

        <ListaCard
          titulo="Pastas (análise de crédito)"
          icone={<FileMagnifyingGlass className="h-4 w-4" />}
          contagem={pastasLista.length}
          vazio="Nenhuma pasta de lead de SDR entrou em análise nesta semana."
          colunas={["Quando", "Cliente", "SDR", "Corretor"]}
          linhas={pastasLista.map((p) => ({
            id: p.id,
            celulas: [
              dataCurta(p.created_at),
              <LeadCell
                key="c"
                leadId={p.lead?.id ?? p.lead_id}
                nome={p.lead?.nome}
                telefone={p.lead?.telefone}
              />,
              nomeSdr(p.sdr_id),
              corretorNome(p.corretor_id, nomesQ.data),
            ],
          }))}
        />

        <ListaCard
          titulo="Vendas assinadas na semana"
          icone={<HandCoins className="h-4 w-4" />}
          contagem={vendasLista.length}
          sub={fmtBRL(vendasLista.reduce((s, v) => s + (Number(v.valor_venda) || 0), 0))}
          vazio="Nenhuma venda de lead de SDR assinada nesta semana."
          colunas={["Assinatura", "Cliente", "SDR", "Empreendimento", "Valor", "Recebimento"]}
          linhas={vendasLista.map((v) => ({
            id: v.id,
            celulas: [
              dataCurta(v.data_assinatura),
              <LeadCell
                key="c"
                leadId={v.lead?.id ?? v.lead_id}
                nome={v.lead?.nome}
                telefone={v.lead?.telefone}
              />,
              nomeSdr(v.sdr_id),
              v.projeto_nome ?? "—",
              fmtBRL(Number(v.valor_venda) || 0),
              <Badge key="r" variant={v.status_recebimento === "recebido" ? "default" : "outline"}>
                {RECEBIMENTO_LABEL[v.status_recebimento] ?? v.status_recebimento}
              </Badge>,
            ],
          }))}
        />

        <ListaCard
          titulo="Vendas recebidas na semana"
          icone={<CheckCircle className="h-4 w-4" />}
          contagem={recebidasLista.length}
          sub="É o recebimento que libera o pagamento da venda ao SDR"
          vazio="Nenhuma venda de lead de SDR foi recebida nesta semana."
          colunas={["Recebida em", "Cliente", "SDR", "Assinada em", "Valor"]}
          linhas={recebidasLista.map((v) => ({
            id: v.id,
            celulas: [
              dataCurta(v.data_recebimento),
              <LeadCell
                key="c"
                leadId={v.lead?.id ?? v.lead_id}
                nome={v.lead?.nome}
                telefone={v.lead?.telefone}
              />,
              nomeSdr(v.sdr_id),
              dataCurta(v.data_assinatura),
              fmtBRL(Number(v.valor_venda) || 0),
            ],
          }))}
        />
      </div>
    </div>
  );
}

function LinhaSdr({ linha }: { linha: LinhaSemanaSdr }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{linha.nome}</TableCell>
      <TableCell className="text-right">{linha.agendamentos}</TableCell>
      <TableCell className="text-right">{linha.visitas_realizadas}</TableCell>
      <TableCell className="text-right">{linha.no_show}</TableCell>
      <TableCell className="text-right">
        {pct(comparecimentoSemana(linha.visitas_realizadas, linha.no_show))}
      </TableCell>
      <TableCell className="text-right">{linha.pastas}</TableCell>
      <TableCell className="text-right">{linha.vendas}</TableCell>
      <TableCell className="text-right">{fmtBRL(linha.vgv)}</TableCell>
      <TableCell className="text-right">{linha.vendas_recebidas}</TableCell>
    </TableRow>
  );
}

/** Lista nominal padrão das conferências (mesma casca nos cinco blocos). */
function ListaCard({
  titulo,
  icone,
  contagem,
  sub,
  vazio,
  colunas,
  linhas,
}: {
  titulo: string;
  icone: React.ReactNode;
  contagem: number;
  sub?: string;
  vazio: string;
  colunas: string[];
  linhas: Array<{ id: string; celulas: React.ReactNode[] }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icone} {titulo}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {contagem.toLocaleString("pt-BR")}
          </span>
        </CardTitle>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <VazioPeriodo>{vazio}</VazioPeriodo>
        ) : (
          <div className="overflow-x-auto max-h-[360px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {colunas.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    {l.celulas.map((celula, i) => (
                      <TableCell key={colunas[i]} className="text-xs">
                        {celula}
                      </TableCell>
                    ))}
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
