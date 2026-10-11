// Aba Vibra dos Simuladores: a tabela oficial do canal (Vibra Parcerias,
// Equipe Grego) dentro do CRM. Mesmo jeito de usar do simulador que os
// corretores já conhecem: escolhe o empreendimento, informa renda e recursos
// do banco e monta o fluxo digitando o valor da parcela OU o total de cada
// linha (verde = dentro do limite, vermelho = acima) até aparecer "FECHOU!".
//
// O que o CRM acrescenta:
//   • as mensais contam a partir do mês do ato (cada mês sem assinar sai uma),
//     em vez de ficarem presas ao mês da tabela;
//   • "Preencher pelo teto" monta um fluxo que fecha respeitando os limites;
//   • quanto custa esperar (o ato mínimo sobe a cada mensal perdida);
//   • unidade disponível do catálogo, WhatsApp, PDF e cronograma mês a mês.
// Toda a conta mora em lib/simuladores/vibra.

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle,
  Copy,
  Eraser,
  FilePdf,
  Hourglass,
  ListChecks,
  MagicWand,
  SealCheck,
  WarningCircle,
} from "@phosphor-icons/react";
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
import { supabase } from "@/integrations/supabase/client";
import { useProjetosPrateleira } from "@/features/projetos/use-prateleira-dados";
import { parceiraDoProjetoOuNome } from "@/lib/construtoras";
import { centavos } from "@/lib/amortizacao";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import { simuladorPorId, type SimuladorId } from "@/lib/simuladores/construtoras";
import { estimarRecursosPelaRenda } from "@/lib/simuladores/recursos";
import {
  casaComCatalogo,
  cenariosEsperaVibra,
  empreendimentoDoProjeto,
  empreendimentoVibra,
  EMPREENDIMENTOS_VIBRA,
  simularVibra,
  sugestaoPeloTeto,
  textoStatusVibra,
  VIGENCIA_VIBRA,
  type CenarioEsperaVibra,
  type IdLinhaVibra,
  type LinhaResultadoVibra,
  type ParcelaVibra,
  type ResultadoVibra,
} from "@/lib/simuladores/vibra";
import { cn } from "@/lib/utils";
import { brl, pct, type PrefillFluxo } from "./estado";
import {
  Alertas,
  CabecalhoSimuladores,
  Campo,
  CampoValor,
  Kpi,
  Numero,
  SwitchLinha,
  useTrocarConstrutora,
} from "./pecas";
import {
  entradaVibraDoForm,
  formInicialVibra,
  notaCaixa,
  notaRetencao,
  PARCELAS_ZERADAS,
  quandoLinha,
  tetoLinha,
  textoWhatsAppVibra,
  type Documentacao,
  type FormVibra,
} from "./vibra-estado";

type UnidadeOpcao = {
  id: string;
  projeto_id: string;
  identificador: string;
  bloco: string | null;
  tipologia: string | null;
  dormitorios: number | null;
  area_privativa: number | null;
  valor: number;
};

export function SimuladorVibra({ prefill }: { prefill?: PrefillFluxo & { projeto?: string } }) {
  const simulador = simuladorPorId("vibra");
  const trocar = useTrocarConstrutora();
  const [form, setForm] = useState<FormVibra>(() => formInicialVibra(prefill));
  const set = <K extends keyof FormVibra>(k: K, v: FormVibra[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Projetos da Vibra no catálogo: dão as unidades disponíveis (o valor).
  const projetosQ = useProjetosPrateleira();
  const projetosVibra = useMemo(
    () =>
      (projetosQ.data ?? []).filter(
        (p) => parceiraDoProjetoOuNome(p, [{ nome: simulador.nome }]).parceira != null,
      ),
    [projetosQ.data, simulador.nome],
  );

  // Link com ?projeto= (id do catálogo): abre no empreendimento da tabela.
  const projetoDoLink = prefill?.projeto;
  const [linkAplicado, setLinkAplicado] = useState(false);
  useEffect(() => {
    if (linkAplicado || !projetoDoLink || projetosVibra.length === 0) return;
    setLinkAplicado(true);
    const p = projetosVibra.find((x) => x.id === projetoDoLink);
    const emp = p ? empreendimentoDoProjeto(p.nome) : null;
    if (emp) setForm((f) => ({ ...f, empreendimento: emp.nome }));
  }, [linkAplicado, projetoDoLink, projetosVibra]);

  const entrada = useMemo(() => entradaVibraDoForm(form), [form]);
  const r = useMemo(() => simularVibra(entrada), [entrada]);
  const cenarios = useMemo(() => cenariosEsperaVibra(entrada), [entrada]);

  const trocarConstrutora = (nova: SimuladorId) => {
    if (nova === simulador.id) return;
    trocar(nova, {
      valor: form.valorImovel,
      renda: form.renda,
      financiamento: form.financiamento,
      // As outras abas separam subsídio e FGTS; a soma vai como subsídio.
      subsidio: form.subsidioFgts,
    });
  };

  const setParcela = (id: IdLinhaVibra, v: number) =>
    setForm((f) => ({ ...f, parcelas: { ...f.parcelas, [id]: Math.max(0, v) } }));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsAppVibra({ form, resultado: r }));
      toast.success("Fluxo copiado. É só colar no WhatsApp do cliente.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }

  async function exportarPdf() {
    try {
      const { imprimirVibra } = await import("./vibra-pdf");
      await imprimirVibra({ form, resultado: r, cenarios });
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
          <CardEmpreendimento form={form} setForm={setForm} set={set} projetos={projetosVibra} />
          <CardCliente form={form} setForm={setForm} set={set} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <SealCheck className="mt-0.5 h-4 w-4 shrink-0 text-exito-600" />
            <span>
              Tabela da Vibra de {rotuloMes(VIGENCIA_VIBRA)}, conferida em{" "}
              {new Date(`${simulador.conferidoEm}T12:00:00`).toLocaleDateString("pt-BR")} (
              {simulador.fonte}). As mensais são contadas a partir do mês do ato.
            </span>
          </div>
          <Alertas alertas={r.alertas} />

          {!r.valido ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {form.empreendimento
                  ? "Informe o valor da unidade para montar o fluxo."
                  : "Escolha o empreendimento da tabela da Vibra para montar o fluxo."}
              </CardContent>
            </Card>
          ) : (
            <>
              <Status resultado={r} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  titulo="Financiamento líquido"
                  valor={brl(r.financiamentoLiquido)}
                  sub={`${pct(r.retencaoPct, r.retencaoPct % 1 ? 1 : 0)} retido para o INCC`}
                />
                <Kpi
                  titulo="Total até a entrega"
                  valor={brl(r.totalAteEntrega)}
                  sub="o que o fluxo precisa somar"
                  destaque
                />
                <Kpi
                  titulo="Parcela morando"
                  valor={form.renda > 0 ? brl(r.potencialMorando) : "-"}
                  sub="depois da entrega: 30% da renda"
                />
                <Kpi
                  titulo="Previsão de entrega"
                  valor={r.entrega ? rotuloMes(r.entrega) : "-"}
                  sub="pela tabela da Vibra"
                />
              </div>
              <CardFluxo
                resultado={r}
                renda={form.renda}
                setParcela={setParcela}
                preencher={() => {
                  const parcelas = sugestaoPeloTeto(entrada);
                  setForm((f) => ({ ...f, parcelas }));
                  if (form.renda <= 0) toast.info("Informe a renda: os tetos dependem dela.");
                }}
                zerar={() => set("parcelas", { ...PARCELAS_ZERADAS })}
              />
              {form.renda > 0 && <QuantoCustaEsperar cenarios={cenarios} />}
              <Cronograma parcelas={r.cronograma} />
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <p>{notaRetencao(r)}</p>
                <p>{notaCaixa(form.documentacao)}</p>
                <p>
                  Simulação sem valor contratual, sujeita à aprovação bancária, à disponibilidade da
                  unidade e à tabela vigente da Vibra.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Formulário
// ============================================================================

type SetForm = React.Dispatch<React.SetStateAction<FormVibra>>;
type SetCampo = <K extends keyof FormVibra>(k: K, v: FormVibra[K]) => void;
type ProjetoCatalogo = { id: string; nome: string };

function CardEmpreendimento({
  form,
  setForm,
  set,
  projetos,
}: {
  form: FormVibra;
  setForm: SetForm;
  set: SetCampo;
  projetos: ProjetoCatalogo[];
}) {
  const emp = empreendimentoVibra(form.empreendimento);
  // Projeto(s) do catálogo que são este empreendimento (o catálogo às vezes
  // tem o mesmo produto cadastrado duas vezes: junta as unidades dos dois).
  const doCatalogo = useMemo(
    () => (emp ? projetos.filter((p) => casaComCatalogo(emp, p.nome)) : []),
    [emp, projetos],
  );
  const ids = doCatalogo.map((p) => p.id);
  const unidadesQ = useQuery({
    queryKey: ["simuladores", "vibra", "unidades", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<UnidadeOpcao[]> => {
      const { data, error } = await supabase
        .from("unidades")
        .select(
          "id, projeto_id, identificador, bloco, tipologia, dormitorios, area_privativa, valor",
        )
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

  const escolherEmpreendimento = (nome: string) =>
    setForm((f) => ({ ...f, empreendimento: nome, unidadeId: null, rotuloUnidade: "" }));

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

  const idHoje = useId();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Empreendimento (tabela da Vibra)">
          <Select value={form.empreendimento ?? undefined} onValueChange={escolherEmpreendimento}>
            <SelectTrigger aria-label="Empreendimento (tabela da Vibra)">
              <SelectValue placeholder="Escolha o empreendimento" />
            </SelectTrigger>
            <SelectContent>
              {EMPREENDIMENTOS_VIBRA.map((e) => (
                <SelectItem key={e.nome} value={e.nome}>
                  {e.nome} · entrega {rotuloMes(e.entrega)}
                </SelectItem>
              ))}
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
          label="Valor total do imóvel"
          value={form.valorImovel}
          onChange={(v) => setForm((f) => ({ ...f, valorImovel: v, unidadeId: null }))}
        />
        <Campo
          label="Mês do ato (assinatura)"
          htmlFor={idHoje}
          hint={`Padrão: este mês. A tabela é de ${rotuloMes(VIGENCIA_VIBRA)}: cada mês depois dela tira uma mensal.`}
        >
          <Input
            id={idHoje}
            type="month"
            value={form.hoje}
            onChange={(e) => e.target.value && set("hoje", e.target.value)}
          />
        </Campo>
      </CardContent>
    </Card>
  );
}

function CardCliente({ form, setForm, set }: { form: FormVibra; setForm: SetForm; set: SetCampo }) {
  const [nota, setNota] = useState<string | null>(null);
  const estimar = () => {
    const e = estimarRecursosPelaRenda({
      renda: form.renda,
      tem36MesesRegistro: form.tem36,
      temDependente: form.temDependente,
      valorImovel: form.valorImovel,
    });
    if (!e.enquadra) {
      setNota(null);
      toast.error(e.motivo ?? "Renda fora da tabela APROVE.");
      return;
    }
    setForm((f) => ({ ...f, financiamento: e.financiamento, subsidioFgts: e.subsidio }));
    setNota(
      `Faixa ${e.faixa} · ${e.segmento}. Estimativa da tabela APROVE 2026 (sem FGTS: some o saldo do cliente). Troque pelo valor aprovado quando sair a análise.`,
    );
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cliente e banco</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Numero label="Renda mensal" value={form.renda} onChange={(v) => set("renda", v)} />
        <div className="grid grid-cols-2 gap-2">
          <SwitchLinha
            label="36 meses de FGTS"
            checked={form.tem36}
            onChange={(v) => set("tem36", v)}
          />
          <SwitchLinha
            label="Tem dependente"
            checked={form.temDependente}
            onChange={(v) => set("temDependente", v)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={estimar}
          disabled={form.renda <= 0}
        >
          <MagicWand className="mr-1.5 h-4 w-4" /> Estimar financiamento e subsídio pela renda
        </Button>
        {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Numero
            label="Financiado pelo banco"
            value={form.financiamento}
            onChange={(v) => set("financiamento", v)}
          />
          <Numero
            label="Subsídio + FGTS"
            value={form.subsidioFgts}
            onChange={(v) => set("subsidioFgts", v)}
          />
        </div>
        <Campo label="Documentação do imóvel">
          <Select
            value={form.documentacao}
            onValueChange={(v) => set("documentacao", v as Documentacao)}
          >
            <SelectTrigger aria-label="Documentação do imóvel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gratis">Grátis</SelectItem>
              <SelectItem value="cliente">Paga pelo cliente</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Resultado
// ============================================================================

function Status({ resultado: r }: { resultado: ResultadoVibra }) {
  const ok = r.status === "fechou";
  const neutro = r.status === "incompleto";
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-bold",
        ok && "border-exito-500 bg-exito-500/10 text-exito-700 dark:text-exito-300",
        !ok && !neutro && "border-perigo-500 bg-perigo-500/5 text-perigo-700 dark:text-perigo-300",
        neutro && "bg-muted/40 font-medium text-muted-foreground",
      )}
    >
      {ok ? (
        <CheckCircle weight="fill" className="h-5 w-5 shrink-0" />
      ) : (
        <WarningCircle className="h-5 w-5 shrink-0" />
      )}
      <span>{textoStatusVibra(r)}</span>
    </div>
  );
}

const GRADE_LINHA = "sm:grid-cols-[minmax(0,1fr)_2.5rem_8.5rem_8.5rem]";

function CardFluxo({
  resultado: r,
  renda,
  setParcela,
  preencher,
  zerar,
}: {
  resultado: ResultadoVibra;
  renda: number;
  setParcela: (id: IdLinhaVibra, v: number) => void;
  preencher: () => void;
  zerar: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm">Fluxo de pagamento</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={zerar}>
            <Eraser className="mr-1.5 h-4 w-4" /> Zerar
          </Button>
          <Button size="sm" onClick={preencher} disabled={renda <= 0}>
            <ListChecks className="mr-1.5 h-4 w-4" /> Preencher pelo teto
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Digite o valor da parcela ou o total da linha. Verde: dentro do limite. Vermelho: acima.
          &quot;Preencher pelo teto&quot; põe cada parcela no máximo, na ordem do calendário, e o
          que não couber vai para os 4 atos.
        </p>
        <div
          className={cn(
            "hidden gap-2 border-b pb-1 text-[11px] font-medium text-muted-foreground sm:grid",
            GRADE_LINHA,
          )}
        >
          <span>Parcela</span>
          <span className="text-center">Qtd</span>
          <span className="text-right">Valor da parcela</span>
          <span className="text-right">Total</span>
        </div>
        <ul>
          {r.linhas.map((l) => (
            <LinhaFluxo key={l.id} l={l} r={r} onValor={(v) => setParcela(l.id, v)} />
          ))}
        </ul>
        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between font-semibold">
            <span>Total do fluxo</span>
            <span className="tabular-nums">{brl(r.totalFluxo)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Pró-soluto comprometido (sem os atos, máximo 15%)
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                r.proSoluto.excedeu && "text-perigo-600 dark:text-perigo-400",
              )}
            >
              {pct(r.proSoluto.pct)}
            </span>
          </div>
          {r.posChave.total > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Pós-chave no total (máximo {brl(r.posChave.teto)}, 5% do imóvel)
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  r.posChave.excedeu && "text-perigo-600 dark:text-perigo-400",
                )}
              >
                {brl(r.posChave.total)}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaFluxo({
  l,
  r,
  onValor,
}: {
  l: LinhaResultadoVibra;
  r: ResultadoVibra;
  onValor: (v: number) => void;
}) {
  const ativa = l.qtd > 0;
  const tom = !ativa
    ? ""
    : l.excedeu || (l.tipo === "pos_chave" && r.posChave.excedeu)
      ? "border-perigo-500 bg-perigo-500/5"
      : l.teto != null && l.valor > 0
        ? "border-exito-500 bg-exito-500/5"
        : "";
  return (
    <li
      className={cn(
        "grid grid-cols-2 items-center gap-x-2 gap-y-1.5 border-b py-2 last:border-0",
        GRADE_LINHA,
        !ativa && "opacity-55",
      )}
    >
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="text-sm font-medium">
          {l.rotulo}
          {ativa && l.qtd > 1 && (
            <span className="font-normal text-muted-foreground sm:hidden"> · {l.qtd}x</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {ativa ? `${quandoLinha(l)} · ${tetoLinha(l, r)}` : "não tem nesta assinatura"}
        </div>
      </div>
      <div className="hidden text-center text-sm tabular-nums sm:block">{ativa ? l.qtd : "-"}</div>
      <CampoValor
        rotulo={`${l.rotulo}: valor da parcela`}
        value={l.valor}
        onChange={onValor}
        disabled={!ativa}
        className={tom}
      />
      {l.qtd > 1 ? (
        <CampoValor
          rotulo={`${l.rotulo}: total`}
          value={l.total}
          onChange={(t) => onValor(centavos(t / l.qtd))}
          className={tom}
        />
      ) : (
        <div className="pr-3 text-right text-sm tabular-nums text-muted-foreground">
          {l.total > 0 ? brl(l.total) : "-"}
        </div>
      )}
    </li>
  );
}

function QuantoCustaEsperar({ cenarios }: { cenarios: CenarioEsperaVibra[] }) {
  if (cenarios.length < 2 || cenarios[0].mensais === 0) return null;
  const [agora, prox] = cenarios;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Hourglass className="h-4 w-4 text-gold-600" /> Quanto custa esperar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Assinando em <b>{rotuloMes(agora.hoje)}</b> são <b>{agora.mensais} mensais</b> e os atos
          precisam somar no mínimo <b>{brl(agora.atosMinimos)}</b>.{" "}
          {prox.mensais < agora.mensais &&
            (prox.diferenca > 0 ? (
              <>
                Em {rotuloMes(prox.hoje)} sobram {prox.mensais} e o mínimo dos atos sobe{" "}
                <b>{brl(prox.diferenca)}</b>.
              </>
            ) : (
              <>
                Em {rotuloMes(prox.hoje)} sobram {prox.mensais}; os atos ainda não sobem porque o
                fluxo tem folga (ou o pró-soluto já está no limite de 15%).
              </>
            ))}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1.5 pr-3 text-left font-medium">Assinando em</th>
                <th className="py-1.5 pr-3 text-right font-medium">Mensais</th>
                <th className="hidden py-1.5 pr-3 text-right font-medium sm:table-cell">
                  Parcelado máx.
                </th>
                <th className="py-1.5 pr-3 text-right font-medium">Atos no mínimo</th>
                <th className="py-1.5 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {cenarios.map((c, i) => (
                <tr
                  key={c.hoje}
                  className={cn("border-b last:border-0", i === 0 && "font-semibold")}
                >
                  <td className="py-1.5 pr-3">
                    {rotuloMes(c.hoje)}
                    {i === 0 && " (agora)"}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{c.mensais}</td>
                  <td className="hidden py-1.5 pr-3 text-right sm:table-cell">
                    {brl(c.capacidadeParcelado)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{brl(c.atosMinimos)}</td>
                  <td
                    className={cn(
                      "py-1.5 text-right",
                      c.diferenca > 0 && "text-perigo-600 dark:text-perigo-400",
                    )}
                  >
                    {i === 0 ? "-" : `+${brl(c.diferenca)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const TOM_PARCELA: Record<ParcelaVibra["tipo"], string> = {
  ato: "bg-gold/10",
  mensal: "",
  anual: "bg-anil-500/5",
  unica: "bg-anil-500/5",
  pos_chave: "bg-ardosia-500/5",
};

function Cronograma({ parcelas }: { parcelas: ParcelaVibra[] }) {
  if (parcelas.length === 0) return null;
  let acumulado = 0;
  const TH = "sticky top-0 bg-card px-2 py-2 text-right font-medium text-muted-foreground";
  const TD = "px-2 py-1.5 text-right tabular-nums";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cronograma mês a mês</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className={cn(TH, "text-left")}>Mês</th>
                <th className={cn(TH, "text-left")}>Parcela</th>
                <th className={TH}>Valor</th>
                <th className={TH}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p, i) => {
                acumulado = centavos(acumulado + p.valor);
                return (
                  <tr
                    key={`${p.competencia}-${p.id}-${i}`}
                    className={cn("border-b last:border-0", TOM_PARCELA[p.tipo])}
                  >
                    <td className={cn(TD, "text-left")}>{rotuloMes(p.competencia)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-left")}>{p.rotulo}</td>
                    <td className={cn(TD, "font-semibold")}>{brl(p.valor)}</td>
                    <td className={TD}>{brl(acumulado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
