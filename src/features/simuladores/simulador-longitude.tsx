// Aba Longitude dos Simuladores: as regras do simulador oficial da Longitude
// (modo linear) dentro do CRM. O corretor escolhe o empreendimento, informa a
// entrega, a renda e os recursos do banco e monta o fluxo (ato, pré-chaves,
// anuais, pós-chaves) até o status virar APTO PARA VENDA. As premissas de
// cada empreendimento abrem com os valores do código do simulador e ficam
// editáveis: os vigentes vêm do painel da Longitude (e variam pelo score de
// crédito B2E, que o CRM não consulta).
// Toda a conta mora em lib/simuladores/longitude.

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Copy,
  FilePdf,
  Info,
  Warning,
  XCircle,
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
import { competenciaDeEntrega, rotuloMes } from "@/lib/simuladores/fluxo";
import { simuladorPorId, type SimuladorId } from "@/lib/simuladores/construtoras";
import {
  casaComCatalogoLongitude,
  cenariosEsperaLongitude,
  EMPREENDIMENTOS_LONGITUDE,
  empreendimentoLongitude,
  empreendimentoLongitudeDoProjeto,
  OUTRO_EMPREENDIMENTO_LONGITUDE,
  premissasDe,
  simularLongitude,
  sugestaoPelasPremissas,
  textoStatusLongitude,
  type ConferenciaLongitude,
  type IdLinhaLongitude,
  type LinhaLongitude,
  type PremissasLongitude,
  type ResultadoLongitude,
} from "@/lib/simuladores/longitude";
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
  entradaLongitudeDoForm,
  formInicialLongitude,
  PARCELAS_LONGITUDE_ZERADAS,
  primeiraParcelaEfetiva,
  quandoLinhaLongitude,
  tetoLinhaLongitude,
  textoWhatsAppLongitude,
  type FormLongitude,
} from "./longitude-estado";
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

export function SimuladorLongitude({ prefill }: { prefill?: PrefillFluxo & { projeto?: string } }) {
  const simulador = simuladorPorId("longitude");
  const trocar = useTrocarConstrutora();
  const [form, setForm] = useState<FormLongitude>(() => formInicialLongitude(prefill));
  const set = <K extends keyof FormLongitude>(k: K, v: FormLongitude[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const projetosQ = useProjetosPrateleira();
  const projetosLongitude = useMemo<ProjetoCatalogo[]>(
    () =>
      (projetosQ.data ?? []).filter(
        (p) => parceiraDoProjetoOuNome(p, [{ nome: simulador.nome }]).parceira != null,
      ),
    [projetosQ.data, simulador.nome],
  );

  // Link com ?projeto= (id do catálogo): abre no empreendimento do simulador.
  const projetoDoLink = prefill?.projeto;
  const [linkAplicado, setLinkAplicado] = useState(false);
  useEffect(() => {
    if (linkAplicado || !projetoDoLink || projetosLongitude.length === 0) return;
    setLinkAplicado(true);
    const p = projetosLongitude.find((x) => x.id === projetoDoLink);
    const emp = p ? empreendimentoLongitudeDoProjeto(p.nome) : null;
    if (emp) setForm((f) => ({ ...f, ...escolha(emp.nome, projetosLongitude, f) }));
  }, [linkAplicado, projetoDoLink, projetosLongitude]);

  const entrada = useMemo(() => entradaLongitudeDoForm(form), [form]);
  const r = useMemo(() => simularLongitude(entrada), [entrada]);
  const cenarios = useMemo(() => cenariosEsperaLongitude(entrada), [entrada]);

  const trocarConstrutora = (nova: SimuladorId) => {
    if (nova === simulador.id) return;
    trocar(nova, {
      valor: form.valorTabela,
      renda: form.renda,
      financiamento: form.financiamento,
      subsidio: form.subsidio,
      fgts: form.fgts,
      parcela: form.primeiraParcela,
    });
  };

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsAppLongitude({ form, resultado: r }));
      toast.success("Fluxo copiado. É só colar no WhatsApp do cliente.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }

  async function exportarPdf() {
    try {
      const { imprimirLongitude } = await import("./longitude-pdf");
      await imprimirLongitude({ form, resultado: r, cenarios });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    }
  }

  const adimplencia = r.linhas.find((l) => l.id === "adimplencia")?.total ?? 0;

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
          <CardEmpreendimento
            form={form}
            setForm={setForm}
            set={set}
            projetos={projetosLongitude}
          />
          <CardCliente form={form} set={set} />
          <CardPremissas form={form} setForm={setForm} resultado={r} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-aviso-300 bg-aviso-500/5 px-3 py-2 text-xs text-aviso-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Regras do simulador oficial da Longitude (modo linear), conferidas em{" "}
              {new Date(`${simulador.conferidoEm}T12:00:00`).toLocaleDateString("pt-BR")}. As
              premissas de cada empreendimento abrem com os valores de referência do código: o
              painel da Longitude pode ter outros (inclusive pelo score de crédito do cliente).
              Confira no simulador oficial antes de enviar a proposta.
            </span>
          </div>
          <Alertas alertas={r.alertas} />

          {!r.valido ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {form.empreendimento
                  ? "Informe o valor de tabela da unidade para montar o fluxo."
                  : "Escolha o empreendimento da Longitude para montar o fluxo."}
              </CardContent>
            </Card>
          ) : (
            <>
              <StatusFluxo
                tom={r.status === "apto" ? "ok" : r.status === "incompleto" ? "neutro" : "pendente"}
                texto={textoStatusLongitude(r)}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  titulo="Com a construtora"
                  valor={brl(Math.max(0, r.saldo))}
                  sub="tabela − recursos do banco"
                  destaque
                />
                <Kpi
                  titulo="Ato mínimo para fechar"
                  valor={brl(r.atosMinimos)}
                  sub="com o resto no teto das premissas"
                />
                <Kpi
                  titulo="Referência"
                  valor={pct(r.premissas.referencia, 2)}
                  sub={`ato + banco, mínimo ${pct(form.premissas.referenciaMinima * 100, 0)}`}
                />
                <Kpi
                  titulo="Parcelas"
                  valor={`${r.qtd.pre} pré + ${r.qtd.pos} pós`}
                  sub={`total ${form.premissas.parcelasMax}; ${r.qtd.anuais} ${r.qtd.anuais === 1 ? "anual" : "anuais"}`}
                />
              </div>
              <CardLinhasFluxo
                linhas={r.linhas.map((l) => linhaVisivel(l, form))}
                onValor={(id, v) =>
                  setForm((f) => ({
                    ...f,
                    parcelas: { ...f.parcelas, [id as IdLinhaLongitude]: Math.max(0, v) },
                  }))
                }
                instrucao='Digite o valor da parcela ou o total da linha. Verde: dentro do limite. Vermelho: acima. "Preencher pelas premissas" põe pré-chaves, anuais e pós-chaves no teto (até a referência de 60%) e o resto no ato.'
                rotuloPreencher="Preencher pelas premissas"
                preencher={() =>
                  setForm((f) => ({ ...f, parcelas: sugestaoPelasPremissas(entrada) }))
                }
                podePreencher={form.renda > 0}
                zerar={() => set("parcelas", { ...PARCELAS_LONGITUDE_ZERADAS })}
                rodape={
                  <>
                    <LinhaRodape
                      rotulo="Valor final da venda (sem adimplência)"
                      valor={brl(r.valorFinal)}
                      forte
                    />
                    {r.diferenca > 0.005 ? (
                      <LinhaRodape
                        rotulo="Desconto: o fluxo soma menos que a tabela (pede aprovação)"
                        valor={brl(r.diferenca)}
                        alerta
                      />
                    ) : r.diferenca < -0.005 ? (
                      <LinhaRodape rotulo="Ganho de preço" valor={brl(-r.diferenca)} />
                    ) : (
                      <LinhaRodape rotulo="Desconto" valor="sem desconto" />
                    )}
                    <LinhaRodape
                      rotulo="Pró-soluto (tudo menos ato e banco)"
                      valor={pct(r.proSoluto.pct, 2)}
                    />
                    {adimplencia > 0 && (
                      <LinhaRodape
                        rotulo="Adimplência (avaliação − tabela, fora do valor final)"
                        valor={brl(adimplencia)}
                      />
                    )}
                  </>
                }
              />
              <CardConferencia conferencias={r.conferencias} />
              {form.renda > 0 && <QuantoCustaEsperarLinhas cenarios={cenarios} rotuloAtos="ato" />}
              <CronogramaLinhas
                parcelas={r.cronograma.map((p) => ({
                  ...p,
                  destaque:
                    p.tipo === "ato"
                      ? "entrada"
                      : p.tipo === "mensal"
                        ? null
                        : p.tipo === "pos_chave"
                          ? "pos"
                          : "intermediaria",
                }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Documento informativo: as condições dependem da análise e da aprovação da Longitude
                e das políticas vigentes na formalização. Ficam de fora o modo regressivo e as
                regras por score de crédito, que dependem do painel da Longitude.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Empreendimento escolhido: premissas do código e entrega do catálogo. */
function escolha(
  nome: string,
  projetos: ProjetoCatalogo[],
  f: FormLongitude,
): Partial<FormLongitude> {
  const emp = empreendimentoLongitude(nome);
  const p = emp ? projetos.find((x) => casaComCatalogoLongitude(emp, x.nome)) : undefined;
  const entrega = p ? competenciaDeEntrega(p.mes_entrega, p.ano_entrega) : null;
  return {
    empreendimento: nome,
    unidadeId: null,
    rotuloUnidade: "",
    premissas: premissasDe(emp),
    entrega: entrega ?? f.entrega,
    posParcelas: null,
  };
}

function linhaVisivel(l: LinhaLongitude, f: FormLongitude): LinhaVisivel {
  const ativa = l.qtd > 0;
  return {
    id: l.id,
    rotulo: l.rotulo,
    qtd: l.qtd,
    valor: l.valor,
    total: l.total,
    descricao: ativa
      ? `${quandoLinhaLongitude(l)} · ${tetoLinhaLongitude(l, f)}`
      : (l.indisponivel ?? "não tem nesta assinatura"),
    tom: !ativa
      ? "neutro"
      : l.excedeu
        ? "excedeu"
        : l.teto != null && l.valor > 0
          ? "ok"
          : "neutro",
    travada: l.travada,
  };
}

// ============================================================================
// Formulário
// ============================================================================

type SetForm = React.Dispatch<React.SetStateAction<FormLongitude>>;
type SetCampo = <K extends keyof FormLongitude>(k: K, v: FormLongitude[K]) => void;

function CardEmpreendimento({
  form,
  setForm,
  set,
  projetos,
}: {
  form: FormLongitude;
  setForm: SetForm;
  set: SetCampo;
  projetos: ProjetoCatalogo[];
}) {
  const emp = empreendimentoLongitude(form.empreendimento);
  const doCatalogo = useMemo(
    () => (emp ? projetos.filter((p) => casaComCatalogoLongitude(emp, p.nome)) : []),
    [emp, projetos],
  );
  const ids = doCatalogo.map((p) => p.id);
  const unidadesQ = useQuery({
    queryKey: ["simuladores", "longitude", "unidades", ids],
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
      valorTabela: Number(u.valor),
    }));
  };

  const idHoje = useId();
  const idEntrega = useId();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Empreendimento (simulador da Longitude)">
          <Select
            value={form.empreendimento ?? undefined}
            onValueChange={(nome) => setForm((f) => ({ ...f, ...escolha(nome, projetos, f) }))}
          >
            <SelectTrigger aria-label="Empreendimento (simulador da Longitude)">
              <SelectValue placeholder="Escolha o empreendimento" />
            </SelectTrigger>
            <SelectContent>
              {EMPREENDIMENTOS_LONGITUDE.map((e) => (
                <SelectItem key={e.nome} value={e.nome}>
                  {e.nome} · {e.regiao}
                </SelectItem>
              ))}
              <SelectItem value={OUTRO_EMPREENDIMENTO_LONGITUDE.nome}>
                Outro (premissas padrão do simulador)
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

        <div className="grid grid-cols-2 gap-3">
          <Numero
            label="Valor de tabela"
            value={form.valorTabela}
            onChange={(x) => setForm((f) => ({ ...f, valorTabela: x, unidadeId: null }))}
          />
          <Numero
            label="Valor de avaliação"
            value={form.valorAvaliacao}
            onChange={(x) => set("valorAvaliacao", x)}
            hint="Vazio = igual ao de tabela"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Mês do ato" htmlFor={idHoje} hint="Padrão: este mês">
            <Input
              id={idHoje}
              type="month"
              value={form.hoje}
              onChange={(e) => e.target.value && set("hoje", e.target.value)}
            />
          </Campo>
          <Campo
            label="Previsão de entrega"
            htmlFor={idEntrega}
            hint={form.entrega ? "Pré-chaves vão até ela" : "Informe: o catálogo não tem a data"}
          >
            <Input
              id={idEntrega}
              type="month"
              value={form.entrega}
              onChange={(e) => set("entrega", e.target.value)}
            />
          </Campo>
        </div>
      </CardContent>
    </Card>
  );
}

function CardCliente({ form, set }: { form: FormLongitude; set: SetCampo }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cliente e banco</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Numero
          label="Renda total"
          value={form.renda}
          onChange={(x) => set("renda", x)}
          hint="Somando todos os proponentes, como no simulador oficial."
        />
        <div className="grid grid-cols-2 gap-3">
          <Numero
            label="Financiamento"
            value={form.financiamento}
            onChange={(x) => set("financiamento", x)}
          />
          <Numero label="Subsídio" value={form.subsidio} onChange={(x) => set("subsidio", x)} />
          <Numero label="FGTS" value={form.fgts} onChange={(x) => set("fgts", x)} />
          <Numero
            label="1ª parcela do financiamento"
            value={form.primeiraParcela}
            onChange={(x) => set("primeiraParcela", x)}
            hint={`Vazio = 30% da renda (${brl(primeiraParcelaEfetiva(form))})`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CardPremissas({
  form,
  setForm,
  resultado: r,
}: {
  form: FormLongitude;
  setForm: SetForm;
  resultado: ResultadoLongitude;
}) {
  const emp = empreendimentoLongitude(form.empreendimento);
  const doCodigo = premissasDe(emp);
  const pr = form.premissas;
  const setP = <K extends keyof PremissasLongitude>(k: K, v: PremissasLongitude[K]) =>
    setForm((f) => ({ ...f, premissas: { ...f.premissas, [k]: v } }));
  const ajustou = (Object.keys(doCodigo) as (keyof PremissasLongitude)[]).some(
    (k) => Math.abs(pr[k] - doCodigo[k]) > 1e-9,
  );
  const idPos = useId();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Premissas do empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          {ajustou
            ? "Ajustadas por você nesta simulação."
            : "Valores de referência do código do simulador. Confira no simulador oficial e ajuste se o painel mostrar outros."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Numero
            label="Parcelas do pró-soluto"
            value={pr.parcelasMax}
            onChange={(x) => setP("parcelasMax", Math.max(0, Math.round(x)))}
            hint="pré + pós"
          />
          <Numero
            label="Ato mínimo (R$)"
            value={pr.atoMinimo}
            onChange={(x) => setP("atoMinimo", Math.max(0, x))}
          />
          <Numero
            label="Pré-chaves (% da renda)"
            value={Math.round(pr.comprometimentoPre * 10000) / 100}
            step={0.01}
            onChange={(x) => setP("comprometimentoPre", Math.max(0, x) / 100)}
          />
          <Numero
            label="Pós-chaves (% do valor)"
            value={Math.round(pr.proSolutoPosMax * 10000) / 100}
            step={0.01}
            onChange={(x) => setP("proSolutoPosMax", Math.max(0, x) / 100)}
          />
          <Numero
            label="Total pós (% da renda)"
            value={Math.round(pr.comprometimentoTotal * 10000) / 100}
            step={0.01}
            onChange={(x) => setP("comprometimentoTotal", Math.max(0, x) / 100)}
            hint="pós + 1ª parcela"
          />
          <Numero
            label="Referência mínima (%)"
            value={Math.round(pr.referenciaMinima * 10000) / 100}
            step={0.01}
            onChange={(x) => setP("referenciaMinima", Math.max(0, x) / 100)}
            hint="ato + banco"
          />
        </div>
        <Campo
          label="Parcelas de pós-chaves"
          htmlFor={idPos}
          hint={`Vazio = o máximo (${r.qtd.posMax}: total ${pr.parcelasMax} − ${r.qtd.pre} pré-chaves).`}
        >
          <Input
            id={idPos}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.posParcelas ?? ""}
            placeholder={`máximo (${r.qtd.posMax})`}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                posParcelas:
                  e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))),
              }))
            }
          />
        </Campo>
        {ajustou && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setForm((f) => ({ ...f, premissas: doCodigo }))}
          >
            <ArrowCounterClockwise className="mr-1.5 h-4 w-4" /> Voltar aos valores do código
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Premissas práticas
// ============================================================================

function CardConferencia({ conferencias }: { conferencias: ConferenciaLongitude[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Premissas práticas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {conferencias.map((c) => (
            <li key={c.id} className="flex items-start gap-2 py-1.5">
              {c.ok ? (
                <CheckCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-exito-600" />
              ) : c.nivel === "erro" ? (
                <XCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-perigo-600" />
              ) : (
                <Warning weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-aviso-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-medium">{c.rotulo}</span>
                  <span className={cn("tabular-nums", !c.ok && "text-perigo-600")}>{c.atual}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {c.limite}
                  {!c.ok && c.nivel === "aviso" ? " · pede aprovação" : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
