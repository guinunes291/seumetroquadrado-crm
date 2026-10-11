// Aba Mundo Apto dos Simuladores: a Política de Análise de Crédito da Mundo
// Apto (Tabelão out/2026) dentro do CRM. O corretor escolhe o empreendimento
// (os vencimentos vêm da política), a modalidade (associativo, SFH ou tabela
// direta) e monta o fluxo digitando o valor da parcela OU o total de cada
// linha, até aparecer "FECHOU!". A conferência da política mostra regra a
// regra o que atende e o que não atende.
// Toda a conta mora em lib/simuladores/mundo-apto.

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle, Copy, FilePdf, Question, SealCheck, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useProjetosPrateleira } from "@/features/projetos/use-prateleira-dados";
import { parceiraDoProjetoOuNome } from "@/lib/construtoras";
import { competenciaDeEntrega, indiceMes, rotuloMes } from "@/lib/simuladores/fluxo";
import { simuladorPorId, type SimuladorId } from "@/lib/simuladores/construtoras";
import {
  casaComCatalogoMA,
  cenariosEsperaMA,
  EMPREENDIMENTOS_MA,
  empreendimentoMA,
  empreendimentoMADoProjeto,
  MODALIDADES_MA,
  OUTRO_EMPREENDIMENTO_MA,
  posAutomatico,
  simularMA,
  sugestaoPelaPolitica,
  textoStatusMA,
  type ConferenciaMA,
  type IdLinhaMA,
  type IntermediariaMA,
  type LinhaResultadoMA,
  type ModalidadeMA,
  type ResultadoMA,
} from "@/lib/simuladores/mundo-apto";
import { cn } from "@/lib/utils";
import { brl, pct, type PrefillFluxo } from "./estado";
import {
  CardLinhasFluxo,
  CronogramaLinhas,
  LinhaRodape,
  QuantoCustaEsperarLinhas,
  StatusFluxo,
  type LinhaVisivel,
} from "./fluxo-linhas";
import {
  entradaMADoForm,
  formInicialMA,
  notasMA,
  PARCELAS_MA_ZERADAS,
  quandoLinhaMA,
  tetoLinhaMA,
  textoWhatsAppMA,
  type FormMA,
} from "./mundo-apto-estado";
import { Alertas, CabecalhoSimuladores, Campo, Kpi, Numero, useTrocarConstrutora } from "./pecas";

type UnidadeOpcao = {
  id: string;
  identificador: string;
  bloco: string | null;
  tipologia: string | null;
  dormitorios: number | null;
  area_privativa: number | null;
  valor: number;
};

type ProjetoCatalogo = {
  id: string;
  nome: string;
  mes_entrega: number | null;
  ano_entrega: number | null;
};

export function SimuladorMundoApto({ prefill }: { prefill?: PrefillFluxo & { projeto?: string } }) {
  const simulador = simuladorPorId("mundo-apto");
  const trocar = useTrocarConstrutora();
  const [form, setForm] = useState<FormMA>(() => formInicialMA(prefill));
  const set = <K extends keyof FormMA>(k: K, v: FormMA[K]) => setForm((f) => ({ ...f, [k]: v }));

  const projetosQ = useProjetosPrateleira();
  const projetosMA = useMemo<ProjetoCatalogo[]>(
    () =>
      (projetosQ.data ?? []).filter(
        (p) => parceiraDoProjetoOuNome(p, [{ nome: simulador.nome }]).parceira != null,
      ),
    [projetosQ.data, simulador.nome],
  );

  // Link com ?projeto= (id do catálogo): abre no empreendimento da política.
  const projetoDoLink = prefill?.projeto;
  const [linkAplicado, setLinkAplicado] = useState(false);
  useEffect(() => {
    if (linkAplicado || !projetoDoLink || projetosMA.length === 0) return;
    setLinkAplicado(true);
    const p = projetosMA.find((x) => x.id === projetoDoLink);
    const emp = p ? empreendimentoMADoProjeto(p.nome) : null;
    if (p && emp) setForm((f) => ({ ...f, ...escolha(emp.nome, projetosMA) }));
  }, [linkAplicado, projetoDoLink, projetosMA]);

  const entrada = useMemo(() => entradaMADoForm(form), [form]);
  const r = useMemo(() => simularMA(entrada), [entrada]);
  const cenarios = useMemo(() => cenariosEsperaMA(entrada), [entrada]);
  const regras = MODALIDADES_MA[form.modalidade];

  const trocarConstrutora = (nova: SimuladorId) => {
    if (nova === simulador.id) return;
    trocar(nova, {
      valor: form.valorImovel,
      renda: form.renda,
      financiamento: form.financiamento,
      subsidio: form.subsidio,
      fgts: form.fgts,
    });
  };

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsAppMA({ form, resultado: r }));
      toast.success("Fluxo copiado. É só colar no WhatsApp do cliente.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }

  async function exportarPdf() {
    try {
      const { imprimirMA } = await import("./mundo-apto-pdf");
      await imprimirMA({ form, resultado: r, cenarios });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <CabecalhoSimuladores
        atual={simulador.id}
        onTrocar={trocarConstrutora}
        acoes={
          <>
            <Button variant="outline" onClick={copiar} disabled={!r.valido}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar para WhatsApp
            </Button>
            <Button onClick={exportarPdf} disabled={!r.valido}>
              <FilePdf className="mr-1.5 h-4 w-4" /> Exportar PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <CardEmpreendimento form={form} setForm={setForm} set={set} projetos={projetosMA} />
          <CardModalidade form={form} set={set} resultado={r} />
          <CardCliente form={form} set={set} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <SealCheck className="mt-0.5 h-4 w-4 shrink-0 text-exito-600" />
            <span>
              Política de crédito da Mundo Apto de 09/04/2026 (Tabelão de out/2026), conferida em{" "}
              {new Date(`${simulador.conferidoEm}T12:00:00`).toLocaleDateString("pt-BR")}. As
              mensais da obra são contadas a partir do mês do ato.
            </span>
          </div>
          <Alertas alertas={r.alertas} />

          {!r.valido ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {form.empreendimento
                  ? "Informe o valor da unidade para montar o fluxo."
                  : "Escolha o empreendimento da Mundo Apto para montar o fluxo."}
              </CardContent>
            </Card>
          ) : (
            <>
              <StatusFluxo
                tom={
                  r.status === "fechou" ? "ok" : r.status === "incompleto" ? "neutro" : "pendente"
                }
                texto={textoStatusMA(r)}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  titulo="Com a construtora"
                  valor={brl(r.saldoConstrutora)}
                  sub="o que o fluxo precisa somar"
                  destaque
                />
                <Kpi
                  titulo="Entrada mínima"
                  valor={brl(r.atosMinimos)}
                  sub="ato + entradas, com o resto no teto"
                />
                <Kpi
                  titulo="Pró-soluto"
                  valor={r.proSoluto.teto != null ? pct(r.proSoluto.pct) : "-"}
                  sub={r.proSoluto.teto != null ? "sem ato e entradas, máx. 25%" : "não se aplica"}
                />
                <Kpi
                  titulo="Prazo do contrato"
                  valor={r.prazoMeses > 0 ? `${r.prazoMeses} meses` : "-"}
                  sub={regras.prazoMinimo ? "mínimo de 36 meses" : "tabela direta"}
                />
              </div>
              <CardLinhasFluxo
                linhas={r.linhas.map((l) => linhaVisivel(l, r))}
                onValor={(id, v) =>
                  setForm((f) => ({
                    ...f,
                    parcelas: { ...f.parcelas, [id as IdLinhaMA]: Math.max(0, v) },
                  }))
                }
                instrucao='Digite o valor da parcela ou o total da linha. Verde: dentro do limite. Vermelho: acima. "Preencher pela política" põe R$ 100 no pós (prazo de 36 meses), leva as parcelas até o limite de cada regra e deixa o resto no ato e nas entradas.'
                rotuloPreencher="Preencher pela política"
                preencher={() =>
                  setForm((f) => ({ ...f, parcelas: sugestaoPelaPolitica(entrada) }))
                }
                podePreencher={!regras.temBanco || form.renda > 0}
                zerar={() => set("parcelas", { ...PARCELAS_MA_ZERADAS })}
                rodape={
                  <>
                    <LinhaRodape rotulo="Total do fluxo" valor={brl(r.totalFluxo)} forte />
                    <LinhaRodape rotulo="Ato + entradas" valor={brl(r.totalEntradas)} />
                    {r.proSoluto.teto != null && (
                      <LinhaRodape
                        rotulo="Pró-soluto (sem ato e entradas, máximo 25%)"
                        valor={pct(r.proSoluto.pct)}
                        alerta={r.proSoluto.excedeu}
                      />
                    )}
                  </>
                }
              />
              <CardConferencia conferencias={r.conferencias} />
              {(!regras.temBanco || form.renda > 0) && (
                <QuantoCustaEsperarLinhas cenarios={cenarios} rotuloAtos="ato e entradas" />
              )}
              <CronogramaLinhas
                parcelas={r.cronograma.map((p) => ({
                  ...p,
                  destaque:
                    p.tipo === "ato" || p.tipo === "entrada"
                      ? "entrada"
                      : p.tipo === "mensal"
                        ? null
                        : p.tipo === "pos_chave"
                          ? "pos"
                          : "intermediaria",
                }))}
              />
              <div className="space-y-1 text-[11px] text-muted-foreground">
                {notasMA(r).map((n) => (
                  <p key={n}>{n}</p>
                ))}
                <p>
                  Simulação sem valor contratual, sujeita à análise de crédito, à disponibilidade da
                  unidade e à política vigente da Mundo Apto.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Empreendimento escolhido: sem vencimento na política, o habite-se vem do catálogo. */
function escolha(nome: string, projetos: ProjetoCatalogo[]): Partial<FormMA> {
  const emp = empreendimentoMA(nome);
  const p = emp ? projetos.find((x) => casaComCatalogoMA(emp, x.nome)) : undefined;
  const doCatalogo = p ? competenciaDeEntrega(p.mes_entrega, p.ano_entrega) : null;
  return {
    empreendimento: nome,
    unidadeId: null,
    rotuloUnidade: "",
    habiteSe: emp && !emp.vencimentos.unica ? (doCatalogo ?? "") : "",
  };
}

function linhaVisivel(l: LinhaResultadoMA, r: ResultadoMA): LinhaVisivel {
  const ativa = l.qtd > 0;
  return {
    id: l.id,
    rotulo: l.rotulo,
    qtd: l.qtd,
    valor: l.valor,
    total: l.total,
    descricao: ativa
      ? `${quandoLinhaMA(l)} · ${tetoLinhaMA(l, r)}`
      : (l.indisponivel ?? "não tem nesta assinatura"),
    tom: !ativa
      ? "neutro"
      : l.excedeu
        ? "excedeu"
        : l.teto != null && l.valor > 0
          ? "ok"
          : "neutro",
  };
}

// ============================================================================
// Formulário
// ============================================================================

type SetForm = React.Dispatch<React.SetStateAction<FormMA>>;
type SetCampo = <K extends keyof FormMA>(k: K, v: FormMA[K]) => void;

function CardEmpreendimento({
  form,
  setForm,
  set,
  projetos,
}: {
  form: FormMA;
  setForm: SetForm;
  set: SetCampo;
  projetos: ProjetoCatalogo[];
}) {
  const emp = empreendimentoMA(form.empreendimento);
  const doCatalogo = useMemo(
    () => (emp ? projetos.filter((p) => casaComCatalogoMA(emp, p.nome)) : []),
    [emp, projetos],
  );
  const ids = doCatalogo.map((p) => p.id);
  const unidadesQ = useQuery({
    queryKey: ["simuladores", "mundo-apto", "unidades", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<UnidadeOpcao[]> => {
      const { data, error } = await supabase
        .from("unidades")
        .select("id, identificador, bloco, tipologia, dormitorios, area_privativa, valor")
        .in("projeto_id", ids)
        .eq("status", "disponivel")
        .is("deleted_at", null)
        .not("valor", "is", null)
        .order("valor");
      if (error) throw error;
      return (data ?? []) as UnidadeOpcao[];
    },
  });
  const unidades = unidadesQ.data ?? [];

  const escolherUnidade = (id: string) => {
    const u = unidades.find((x) => x.id === id);
    if (!u) return;
    setForm((f) => ({
      ...f,
      unidadeId: u.id,
      rotuloUnidade: [u.identificador, u.bloco ? `Bloco ${u.bloco}` : null]
        .filter(Boolean)
        .join(" · "),
      valorImovel: Number(u.valor),
    }));
  };

  const v = emp?.vencimentos;
  const idHoje = useId();
  const idHabite = useId();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Empreendimento (política da Mundo Apto)">
          <Select
            value={form.empreendimento ?? undefined}
            onValueChange={(nome) => setForm((f) => ({ ...f, ...escolha(nome, projetos) }))}
          >
            <SelectTrigger aria-label="Empreendimento (política da Mundo Apto)">
              <SelectValue placeholder="Escolha o empreendimento" />
            </SelectTrigger>
            <SelectContent>
              {EMPREENDIMENTOS_MA.map((e) => (
                <SelectItem key={e.nome} value={e.nome}>
                  {e.nome}
                  {e.vencimentos.unica ? ` · habite-se ${rotuloMes(e.vencimentos.unica)}` : ""}
                </SelectItem>
              ))}
              <SelectItem value={OUTRO_EMPREENDIMENTO_MA.nome}>
                Outro (fora da tabela de vencimentos)
              </SelectItem>
            </SelectContent>
          </Select>
        </Campo>

        {unidades.length > 0 && (
          <Campo
            label="Unidade disponível"
            hint={`Valor da tabela de unidades (${doCatalogo.map((p) => p.nome).join(", ")}).`}
          >
            <Select value={form.unidadeId ?? undefined} onValueChange={escolherUnidade}>
              <SelectTrigger>
                <SelectValue placeholder={`${unidades.length} disponíveis, escolha uma`} />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {[
                      u.identificador,
                      u.bloco ? `Bl. ${u.bloco}` : null,
                      u.tipologia ?? (u.dormitorios ? `${u.dormitorios} dorm.` : null),
                      u.area_privativa ? `${u.area_privativa} m²` : null,
                      brl(Number(u.valor)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        )}

        <Numero
          label="Valor do imóvel (preço bruto de venda)"
          value={form.valorImovel}
          onChange={(x) => setForm((f) => ({ ...f, valorImovel: x, unidadeId: null }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Mês do ato (assinatura)" htmlFor={idHoje} hint="Padrão: este mês">
            <Input
              id={idHoje}
              type="month"
              value={form.hoje}
              onChange={(e) => e.target.value && set("hoje", e.target.value)}
            />
          </Campo>
          <Campo
            label="Habite-se"
            htmlFor={idHabite}
            hint={
              v?.unica && !form.habiteSe
                ? `Da política: única em ${rotuloMes(v.unica)}`
                : v?.unica
                  ? "Alterado (a política diz " + rotuloMes(v.unica) + ")"
                  : "Informe: a política não traz a data"
            }
          >
            <Input
              id={idHabite}
              type="month"
              value={form.habiteSe || v?.unica || ""}
              onChange={(e) => set("habiteSe", e.target.value === v?.unica ? "" : e.target.value)}
            />
          </Campo>
        </div>
      </CardContent>
    </Card>
  );
}

function CardModalidade({
  form,
  set,
  resultado: r,
}: {
  form: FormMA;
  set: SetCampo;
  resultado: ResultadoMA;
}) {
  const regras = MODALIDADES_MA[form.modalidade];
  const idPos = useId();
  const habite = r.habiteSe;
  const iHoje = indiceMes(form.hoje);
  const auto =
    habite && Number.isFinite(iHoje)
      ? Math.min(
          regras.posMaxParcelas,
          posAutomatico(iHoje, Math.max(indiceMes(habite) + 1, iHoje + 4)),
        )
      : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Modalidade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ToggleGroup
          type="single"
          value={form.modalidade}
          onValueChange={(x) => x && set("modalidade", x as ModalidadeMA)}
          className="flex-wrap justify-start"
        >
          {(Object.keys(MODALIDADES_MA) as ModalidadeMA[]).map((m) => (
            <ToggleGroupItem key={m} value={m}>
              {MODALIDADES_MA[m].rotulo}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-[11px] text-muted-foreground">{regras.descricao}.</p>
        <Campo label="Intermediárias (uma ou outra)">
          <ToggleGroup
            type="single"
            value={form.intermediaria}
            onValueChange={(x) => x && set("intermediaria", x as IntermediariaMA)}
            className="justify-start"
          >
            <ToggleGroupItem value="anual">Anual (dezembro)</ToggleGroupItem>
            <ToggleGroupItem value="semestral">Semestral</ToggleGroupItem>
          </ToggleGroup>
        </Campo>
        {regras.posPermitido && (
          <Campo
            label="Parcelas depois do habite-se"
            htmlFor={idPos}
            hint={
              form.modalidade === "sfh"
                ? `R$ 100 por mês só para fechar o prazo de 36 meses. Automático: ${auto}.`
                : `Automático: ${auto} (fecha 36 meses). Até ${regras.posMaxParcelas}.`
            }
          >
            <div className="flex gap-2">
              <Input
                id={idPos}
                type="number"
                inputMode="numeric"
                min={0}
                max={regras.posMaxParcelas}
                value={form.posParcelas ?? ""}
                placeholder={`automático (${auto})`}
                onChange={(e) =>
                  set(
                    "posParcelas",
                    e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))),
                  )
                }
              />
              {form.posParcelas != null && (
                <Button variant="ghost" size="sm" onClick={() => set("posParcelas", null)}>
                  Automático
                </Button>
              )}
            </div>
          </Campo>
        )}
      </CardContent>
    </Card>
  );
}

function CardCliente({ form, set }: { form: FormMA; set: SetCampo }) {
  const regras = MODALIDADES_MA[form.modalidade];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cliente e banco</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Numero
          label="Renda líquida familiar"
          value={form.renda}
          onChange={(x) => set("renda", x)}
          hint="A política limita cada parcela pela renda líquida."
        />
        {regras.temBanco ? (
          <div className="grid grid-cols-2 gap-3">
            <Numero
              label="Financiamento"
              value={form.financiamento}
              onChange={(x) => set("financiamento", x)}
            />
            <Numero label="Subsídio" value={form.subsidio} onChange={(x) => set("subsidio", x)} />
            <Numero label="FGTS" value={form.fgts} onChange={(x) => set("fgts", x)} />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Tabela direta: sem banco, todo o valor é pago à construtora.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Conferência da política
// ============================================================================

function CardConferencia({ conferencias }: { conferencias: ConferenciaMA[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Conferência da política</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {conferencias.map((c) => (
            <li key={c.id} className="flex items-start gap-2 py-1.5">
              {c.ok ? (
                <CheckCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-exito-600" />
              ) : c.bloqueia ? (
                <XCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-perigo-600" />
              ) : (
                <Question weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-aviso-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-medium">{c.rotulo}</span>
                  <span className={cn("tabular-nums", !c.ok && c.bloqueia && "text-perigo-600")}>
                    {c.atual}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {c.limite}
                  {c.nota ? ` · ${c.nota}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
