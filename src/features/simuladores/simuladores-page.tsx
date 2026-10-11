// Simuladores — o fluxo de pagamento das construtoras parceiras (Vibra,
// Direcional, Longitude, Mundo Apto), uma aba por construtora.
//
// A Vibra (simulador-vibra.tsx) e a Mundo Apto (simulador-mundo-apto.tsx)
// têm simulador próprio: as regras delas limitam cada parcela pela renda, um
// modelo diferente do daqui. As outras abas usam o fluxo genérico abaixo até
// cada uma ganhar a regra conferida.
//
// No fluxo genérico, o corretor escolhe o empreendimento (a entrega vem do cadastro do projeto),
// a unidade (o valor vem da tabela de unidades), digita os recursos do banco
// e a negociação, e a tela devolve o fluxo mês a mês. O nº de mensais é
// contado a partir do mês do ato até a entrega: cada mês sem fechar é uma
// mensal a menos, e o card "Quanto custa esperar" mostra isso em reais — é o
// argumento de urgência pronto para o atendimento.
//
// Toda a conta mora em lib/simuladores/fluxo; esta tela só coleta e formata.
// As regras de cada construtora abrem pelo preset (lib/simuladores/
// construtoras) e os ajustes do corretor ficam salvos por usuário.

import { lazy, Suspense, useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  CaretDown,
  Copy,
  FilePdf,
  Hourglass,
  Info,
  MagicWand,
  SealCheck,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
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
import { usePreference } from "@/hooks/use-preference";
import { useProjetosPrateleira } from "@/features/projetos/use-prateleira-dados";
import { parceiraDoProjetoOuNome } from "@/lib/construtoras";
import {
  competenciaDeEntrega,
  efeitoDoProximoMes,
  rotuloMes,
  somarMeses,
  type ParcelaFluxo,
  type Periodicidade,
  type RegrasFluxo,
  type ResultadoFluxo,
} from "@/lib/simuladores/fluxo";
import {
  chaveRegrasAjustadas,
  diferencasDoPreset,
  regrasComAjustes,
  simuladorPorId,
  type SimuladorConstrutora,
  type SimuladorId,
} from "@/lib/simuladores/construtoras";
import { estimarRecursosPelaRenda } from "@/lib/simuladores/recursos";
import { cn } from "@/lib/utils";
import {
  brl,
  cenariosDeEspera,
  entradaDoForm,
  formInicial,
  formParaOutraConstrutora,
  linhasDoFluxo,
  pct,
  rotuloParcela,
  textoWhatsApp,
  type FormFluxo,
  type PrefillFluxo,
} from "./estado";
import {
  Alertas,
  CabecalhoSimuladores,
  Campo,
  Kpi,
  Numero,
  SwitchLinha,
  useTrocarConstrutora,
} from "./pecas";

// As abas da Vibra e da Mundo Apto são módulos à parte (tabela, motor e PDF
// próprios): só carregam quando o corretor abre a aba.
const SimuladorVibra = lazy(() =>
  import("./simulador-vibra").then((m) => ({ default: m.SimuladorVibra })),
);
const SimuladorMundoApto = lazy(() =>
  import("./simulador-mundo-apto").then((m) => ({ default: m.SimuladorMundoApto })),
);

const SEM_PROJETO = "__outro";

type ProjetoOpcao = {
  id: string;
  nome: string;
  entrega: string | null;
  /** Mês de entrega ausente no cadastro (a competência assumiu dezembro). */
  mesSuposto: boolean;
  statusEntrega: string | null;
};

type UnidadeOpcao = {
  id: string;
  identificador: string;
  bloco: string | null;
  tipologia: string | null;
  dormitorios: number | null;
  area_privativa: number | null;
  valor: number;
};

type PropsSimulador = {
  construtora: SimuladorId;
  prefill?: PrefillFluxo & { projeto?: string };
};

export function SimuladoresPage(props: PropsSimulador) {
  const { modelo } = simuladorPorId(props.construtora);
  if (modelo === "generico") return <SimuladorGenerico {...props} />;
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-muted-foreground">Carregando as regras…</div>}
    >
      {modelo === "tabela_vibra" ? (
        <SimuladorVibra prefill={props.prefill} />
      ) : (
        <SimuladorMundoApto prefill={props.prefill} />
      )}
    </Suspense>
  );
}

function SimuladorGenerico({ construtora, prefill }: PropsSimulador) {
  const trocar = useTrocarConstrutora();
  const simulador = simuladorPorId(construtora);
  const [form, setForm] = useState<FormFluxo>(() => formInicial(prefill));
  const set = <K extends keyof FormFluxo>(k: K, v: FormFluxo[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Ajustes de regra do corretor, por construtora (chave versionada).
  const [ajustes, setAjustes] = usePreference<Partial<RegrasFluxo>>(
    chaveRegrasAjustadas(simulador),
    {},
  );
  const regras = useMemo(
    () => regrasComAjustes(simulador.regras, ajustes),
    [simulador.regras, ajustes],
  );
  const ajustou = Object.keys(diferencasDoPreset(simulador.regras, regras)).length > 0;
  const setRegra = <K extends keyof RegrasFluxo>(k: K, v: RegrasFluxo[K]) =>
    setAjustes(diferencasDoPreset(simulador.regras, { ...regras, [k]: v }));

  const projetosQ = useProjetosPrateleira();
  const projetos = useMemo<ProjetoOpcao[]>(
    () =>
      (projetosQ.data ?? [])
        .filter((p) => parceiraDoProjetoOuNome(p, [{ nome: simulador.nome }]).parceira != null)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          entrega: competenciaDeEntrega(p.mes_entrega, p.ano_entrega),
          mesSuposto: !!p.ano_entrega && !p.mes_entrega,
          statusEntrega: p.status_entrega,
        })),
    [projetosQ.data, simulador.nome],
  );
  const projeto = projetos.find((p) => p.id === form.projetoId) ?? null;

  // Link vindo de fora com ?projeto=: seleciona quando a lista chega (uma vez).
  const projetoDoLink = prefill?.projeto;
  const [linkAplicado, setLinkAplicado] = useState(false);
  useEffect(() => {
    if (linkAplicado || !projetoDoLink || projetos.length === 0) return;
    setLinkAplicado(true);
    const p = projetos.find((x) => x.id === projetoDoLink);
    if (p) setForm((f) => ({ ...f, projetoId: p.id, entrega: p.entrega ?? f.entrega }));
  }, [linkAplicado, projetoDoLink, projetos]);

  const entrada = useMemo(() => entradaDoForm(form, regras), [form, regras]);
  const efeito = useMemo(() => efeitoDoProximoMes(entrada), [entrada]);
  const resultado = efeito.atual;

  const trocarConstrutora = (nova: SimuladorId) => {
    if (nova === simulador.id) return;
    setForm(formParaOutraConstrutora);
    trocar(nova, {
      valor: form.valorImovel,
      renda: form.renda,
      financiamento: form.financiamento,
      subsidio: form.subsidio,
      fgts: form.fgts,
      parcela: form.parcelaBanco,
    });
  };

  const ctxTexto = {
    construtora: simulador.nome,
    projeto: projeto?.nome ?? null,
    form,
    resultado,
    regras,
  };

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsApp(ctxTexto));
      toast.success("Fluxo copiado. É só colar no WhatsApp do cliente.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }

  // PDF é o único formato de exportação (mesma decisão da planilha de
  // amortização, 2026-10-11): o material vai para o cliente.
  async function exportarPdf() {
    try {
      const { imprimirFluxo } = await import("./fluxo-pdf");
      await imprimirFluxo({ ...ctxTexto, cenarios: cenariosDeEspera(entrada) });
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
            <Button variant="outline" onClick={copiar} disabled={!resultado.valido}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar para WhatsApp
            </Button>
            <Button onClick={exportarPdf} disabled={!resultado.valido}>
              <FilePdf className="mr-1.5 h-4 w-4" /> Exportar PDF
            </Button>
          </>
        }
      />

      {/* Ordem no celular: formulário, resultado, regras (o corretor está com o
          cliente na frente e não pode rolar as regras para achar a mensal). No
          desktop as regras ficam embaixo do formulário, na 1ª coluna. */}
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
          <CardEmpreendimento
            form={form}
            setForm={setForm}
            set={set}
            projetos={projetos}
            carregando={projetosQ.isLoading}
            projeto={projeto}
            regras={regras}
          />
          <CardBanco form={form} setForm={setForm} set={set} />
          <CardNegociacao form={form} set={set} regras={regras} resultado={resultado} />
        </div>

        <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <AvisoRegras simulador={simulador} ajustou={ajustou} />
          <Alertas alertas={resultado.alertas} />

          {!resultado.valido ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {form.valorImovel > 0
                  ? "Informe a previsão de entrega (ou escolha o empreendimento) para montar o fluxo."
                  : "Escolha o empreendimento e informe o valor da unidade para montar o fluxo."}
              </CardContent>
            </Card>
          ) : (
            <>
              <Resumo resultado={resultado} />
              <QuantoCustaEsperar
                cenarios={cenariosDeEspera(entrada)}
                modo={form.modo}
                mensaisPerdidas={efeito.mensaisPerdidas}
              />
              <Composicao resultado={resultado} />
              {resultado.comprometimento && (
                <Comprometimento
                  resultado={resultado}
                  limite={regras.comprometimentoMaxPct}
                  temBanco={form.parcelaBanco > 0}
                />
              )}
              <Cronograma parcelas={resultado.parcelas} />
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            Simulação comercial. Os valores oficiais são os da tabela vigente e do contrato da
            construtora. A coluna "com INCC" é projeção ({pct(regras.inccAnualPct, 2)} ao ano até as
            chaves) e os recursos do banco dependem da aprovação de crédito.
          </p>
        </div>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <CardRegras
            simulador={simulador}
            regras={regras}
            ajustou={ajustou}
            setRegra={setRegra}
            restaurar={() => setAjustes({})}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Formulário
// ============================================================================

type SetForm = React.Dispatch<React.SetStateAction<FormFluxo>>;
type SetCampo = <K extends keyof FormFluxo>(k: K, v: FormFluxo[K]) => void;

function CardEmpreendimento({
  form,
  setForm,
  set,
  projetos,
  carregando,
  projeto,
  regras,
}: {
  form: FormFluxo;
  setForm: SetForm;
  set: SetCampo;
  projetos: ProjetoOpcao[];
  carregando: boolean;
  projeto: ProjetoOpcao | null;
  regras: RegrasFluxo;
}) {
  const unidadesQ = useQuery({
    queryKey: ["simuladores", "unidades", form.projetoId],
    enabled: !!form.projetoId,
    staleTime: 60_000,
    queryFn: async (): Promise<UnidadeOpcao[]> => {
      const { data, error } = await supabase
        .from("unidades")
        .select("id, identificador, bloco, tipologia, dormitorios, area_privativa, valor")
        .eq("projeto_id", form.projetoId!)
        .eq("status", "disponivel")
        .is("deleted_at", null)
        .not("valor", "is", null)
        .order("valor");
      if (error) throw error;
      return (data ?? []) as UnidadeOpcao[];
    },
  });
  const unidades = unidadesQ.data ?? [];

  const escolherProjeto = (id: string) => {
    const p = projetos.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      projetoId: p?.id ?? null,
      unidadeId: null,
      rotuloUnidade: "",
      entrega: p?.entrega ?? (p ? "" : f.entrega),
      ultimaMensal: "",
    }));
  };

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

  const ultimaAutomatica = form.entrega
    ? somarMeses(form.entrega, -regras.mesesAntesDaEntrega)
    : "";
  const idBase = useId();
  const ids = { entrega: `${idBase}-entrega`, hoje: `${idBase}-hoje`, ultima: `${idBase}-ultima` };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Empreendimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo
          label="Empreendimento"
          hint={
            !carregando && projetos.length === 0
              ? "Nenhum projeto ativo desta construtora no catálogo. Informe valor e entrega à mão."
              : undefined
          }
        >
          <Select value={form.projetoId ?? SEM_PROJETO} onValueChange={escolherProjeto}>
            <SelectTrigger>
              <SelectValue placeholder={carregando ? "Carregando…" : "Escolha o empreendimento"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PROJETO}>Outro / não cadastrado</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                  {p.entrega ? ` · entrega ${rotuloMes(p.entrega)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        {form.projetoId && unidades.length > 0 && (
          <Campo label="Unidade disponível" hint="O valor vem da tabela de unidades do projeto.">
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
          label="Valor do imóvel (tabela)"
          value={form.valorImovel}
          onChange={(v) => setForm((f) => ({ ...f, valorImovel: v, unidadeId: null }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Entrega das chaves"
            htmlFor={ids.entrega}
            hint={
              projeto?.entrega && form.entrega === projeto.entrega
                ? projeto.mesSuposto
                  ? "Cadastro sem mês: assumido dezembro"
                  : "Do cadastro do projeto"
                : !form.entrega
                  ? "Informe a previsão"
                  : undefined
            }
          >
            <Input
              id={ids.entrega}
              type="month"
              value={form.entrega}
              onChange={(e) => set("entrega", e.target.value)}
            />
          </Campo>
          <Campo label="Mês do ato" hint="Padrão: este mês" htmlFor={ids.hoje}>
            <Input
              id={ids.hoje}
              type="month"
              value={form.hoje}
              onChange={(e) => e.target.value && set("hoje", e.target.value)}
            />
          </Campo>
        </div>
        <Campo
          label="Última mensal"
          htmlFor={ids.ultima}
          hint={
            form.ultimaMensal
              ? "Fixada pela tabela da construtora"
              : ultimaAutomatica
                ? `Automático: ${rotuloMes(ultimaAutomatica)} (${regras.mesesAntesDaEntrega} ${regras.mesesAntesDaEntrega === 1 ? "mês" : "meses"} antes da entrega). Preencha se a tabela disser "mensais até…"`
                : "Automático pela entrega"
          }
        >
          <div className="flex gap-2">
            <Input
              id={ids.ultima}
              type="month"
              value={form.ultimaMensal}
              onChange={(e) => set("ultimaMensal", e.target.value)}
            />
            {form.ultimaMensal && (
              <Button variant="ghost" size="sm" onClick={() => set("ultimaMensal", "")}>
                Automático
              </Button>
            )}
          </div>
        </Campo>
      </CardContent>
    </Card>
  );
}

function CardBanco({ form, setForm, set }: { form: FormFluxo; setForm: SetForm; set: SetCampo }) {
  const [nota, setNota] = useState<string | null>(null);

  const estimar = () => {
    const r = estimarRecursosPelaRenda({
      renda: form.renda,
      tem36MesesRegistro: form.tem36,
      temDependente: form.temDependente,
      valorImovel: form.valorImovel,
    });
    if (!r.enquadra) {
      setNota(null);
      toast.error(r.motivo ?? "Renda fora da tabela APROVE.");
      return;
    }
    setForm((f) => ({
      ...f,
      financiamento: r.financiamento,
      subsidio: r.subsidio,
      parcelaBanco: r.parcelaBanco,
    }));
    setNota(
      `Faixa ${r.faixa} · ${r.segmento}${r.limitadoPeloImovel ? " · financiamento limitado a 80% do imóvel" : ""}. Estimativa da tabela APROVE 2026: troque pelo valor aprovado quando sair a análise.`,
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Recursos do banco</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Numero label="Renda familiar bruta" value={form.renda} onChange={(v) => set("renda", v)} />
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
            label="Financiamento"
            value={form.financiamento}
            onChange={(v) => set("financiamento", v)}
          />
          <Numero label="Subsídio" value={form.subsidio} onChange={(v) => set("subsidio", v)} />
          <Numero label="FGTS" value={form.fgts} onChange={(v) => set("fgts", v)} />
          <Numero
            label="Parcela do banco"
            value={form.parcelaBanco}
            onChange={(v) => set("parcelaBanco", v)}
            hint="Para medir a renda comprometida"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CardNegociacao({
  form,
  set,
  regras,
  resultado,
}: {
  form: FormFluxo;
  set: SetCampo;
  regras: RegrasFluxo;
  resultado: ResultadoFluxo;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Fluxo com a construtora</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Campo label="Como fechar o saldo">
          <ToggleGroup
            type="single"
            value={form.modo}
            onValueChange={(v) => v && set("modo", v as FormFluxo["modo"])}
            className="justify-start"
          >
            <ToggleGroupItem value="fechar_nas_mensais">Saldo nas mensais</ToggleGroupItem>
            <ToggleGroupItem value="mensal_fixa">Mensal fixa</ToggleGroupItem>
          </ToggleGroup>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Numero
            label="Ato (sinal)"
            value={form.ato}
            onChange={(v) => set("ato", v)}
            hint={resultado.atoMinimo > 0 ? `Mínimo ${brl(resultado.atoMinimo)}` : undefined}
          />
          {form.modo === "fechar_nas_mensais" ? (
            <Numero label="Chaves" value={form.chaves} onChange={(v) => set("chaves", v)} />
          ) : (
            <Numero
              label="Mensal que cabe no bolso"
              value={form.mensalFixa}
              onChange={(v) => set("mensalFixa", v)}
              hint="O resto vai para as chaves"
            />
          )}
        </div>
        {regras.intermediarias !== "nenhuma" ? (
          <Numero
            label={`Intermediária (${ROTULO_PERIODICIDADE[regras.intermediarias].toLowerCase()}), valor de cada`}
            value={form.intermediariaValor}
            onChange={(v) => set("intermediariaValor", v)}
            hint={
              resultado.valido
                ? form.intermediariaValor > 0
                  ? `${resultado.intermediarias.quantidade} no prazo: ${resultado.intermediarias.meses.map(rotuloMes).join(", ") || "nenhuma"}`
                  : "0 = sem intermediárias"
                : undefined
            }
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Sem intermediárias nas regras desta construtora (ajuste em "Regras da construtora").
          </p>
        )}
        {regras.posChavesPermitido && (
          <Numero
            label="Parcelas depois das chaves"
            value={form.posChavesParcelas}
            onChange={(v) => set("posChavesParcelas", Math.max(0, Math.round(v)))}
            hint={`Juros de ${pct(regras.jurosPosChavesPct, 2)} a.m. (Price)${regras.posChavesMaxParcelas > 0 ? ` · até ${regras.posChavesMaxParcelas}x` : ""}`}
          />
        )}
      </CardContent>
    </Card>
  );
}

const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  nenhuma: "Sem intermediárias",
  anual: "Anual (a cada 12 meses do ato)",
  semestral: "Semestral (a cada 6 meses do ato)",
  dezembro: "Todo dezembro",
};

function CardRegras({
  simulador,
  regras,
  ajustou,
  setRegra,
  restaurar,
}: {
  simulador: SimuladorConstrutora;
  regras: RegrasFluxo;
  ajustou: boolean;
  setRegra: <K extends keyof RegrasFluxo>(k: K, v: RegrasFluxo[K]) => void;
  restaurar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <CardTitle className="flex items-center gap-2 text-sm">
            Regras da {simulador.nome}
            {ajustou ? (
              <Badge variant="secondary">ajustadas por você</Badge>
            ) : simulador.conferidoEm ? (
              <Badge variant="outline">conferidas</Badge>
            ) : (
              <Badge variant="outline" className="border-aviso-300 text-aviso-700">
                a conferir
              </Badge>
            )}
          </CardTitle>
          <CaretDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
        </button>
      </CardHeader>
      {aberto && (
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            0 = sem regra. O ajuste fica salvo só para você até a regra oficial ser atualizada.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Numero
              label="Ato mínimo (% do imóvel)"
              value={regras.atoMinimoPct}
              step={0.1}
              onChange={(v) => setRegra("atoMinimoPct", Math.max(0, v))}
            />
            <Numero
              label="Ato mínimo (R$)"
              value={regras.atoMinimoValor}
              onChange={(v) => setRegra("atoMinimoValor", Math.max(0, v))}
            />
            <Numero
              label="Mensal mínima (R$)"
              value={regras.mensalMinima}
              onChange={(v) => setRegra("mensalMinima", Math.max(0, v))}
            />
            <Numero
              label="Última mensal (meses antes da entrega)"
              value={regras.mesesAntesDaEntrega}
              onChange={(v) => setRegra("mesesAntesDaEntrega", Math.max(0, Math.round(v)))}
            />
            <Numero
              label="Parcelado máx. (% do imóvel)"
              value={regras.parceladoMaxPct}
              step={0.5}
              onChange={(v) => setRegra("parceladoMaxPct", Math.max(0, v))}
              hint="Tudo menos o ato"
            />
            <Numero
              label="Renda comprometida máx. (%)"
              value={regras.comprometimentoMaxPct}
              onChange={(v) => setRegra("comprometimentoMaxPct", Math.max(0, v))}
              hint="Banco + construtora"
            />
          </div>
          <Campo label="Intermediárias">
            <Select
              value={regras.intermediarias}
              onValueChange={(v) => setRegra("intermediarias", v as Periodicidade)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROTULO_PERIODICIDADE) as Periodicidade[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROTULO_PERIODICIDADE[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <SwitchLinha
            label="Parcela depois das chaves (pós-chaves)"
            checked={regras.posChavesPermitido}
            onChange={(v) => setRegra("posChavesPermitido", v)}
          />
          {regras.posChavesPermitido && (
            <div className="grid grid-cols-2 gap-3">
              <Numero
                label="Pós-chaves máx. (parcelas)"
                value={regras.posChavesMaxParcelas}
                onChange={(v) => setRegra("posChavesMaxParcelas", Math.max(0, Math.round(v)))}
              />
              <Numero
                label="Juros pós-chaves (% a.m.)"
                value={regras.jurosPosChavesPct}
                step={0.01}
                onChange={(v) => setRegra("jurosPosChavesPct", Math.max(0, v))}
              />
            </div>
          )}
          <Numero
            label="INCC projetado (% ao ano)"
            value={regras.inccAnualPct}
            step={0.01}
            onChange={(v) => setRegra("inccAnualPct", v)}
            hint="Só para a coluna 'com INCC'. A tabela segue nominal."
          />
          {ajustou && (
            <Button variant="outline" size="sm" onClick={restaurar}>
              <ArrowCounterClockwise className="mr-1.5 h-4 w-4" /> Restaurar regras padrão
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================================
// Resultado
// ============================================================================

function AvisoRegras({
  simulador,
  ajustou,
}: {
  simulador: SimuladorConstrutora;
  ajustou: boolean;
}) {
  if (simulador.conferidoEm) {
    return (
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <SealCheck className="mt-0.5 h-4 w-4 shrink-0 text-exito-600" />
        <span>
          Regras da {simulador.nome} conferidas em{" "}
          {new Date(`${simulador.conferidoEm}T12:00:00`).toLocaleDateString("pt-BR")}
          {simulador.fonte ? ` (${simulador.fonte})` : ""}
          {ajustou ? ", com ajustes seus por cima." : "."}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-aviso-300 bg-aviso-500/5 px-3 py-2 text-xs text-aviso-700">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        As regras da {simulador.nome} (ato mínimo, intermediárias, pós-chaves) ainda não foram
        conferidas com a tabela vigente: o simulador abre com o padrão da operação (parcelado até
        20% do imóvel). Confira a tabela do mês antes de mandar o fluxo ao cliente.
      </span>
    </div>
  );
}

function Resumo({ resultado: r }: { resultado: ResultadoFluxo }) {
  const mensal =
    r.mensais.quantidade > 0 && r.mensais.valor > 0
      ? {
          valor: `${r.mensais.quantidade}x ${brl(r.mensais.valor)}`,
          sub: `${rotuloMes(r.mensais.primeira!)} a ${rotuloMes(r.mensais.ultima!)}`,
        }
      : {
          valor: "—",
          sub: r.mensais.quantidade === 0 ? "sem meses até a entrega" : "saldo zerado",
        };
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            titulo="Com a construtora"
            valor={brl(r.saldoConstrutora)}
            sub={`${pct((r.saldoConstrutora / r.valorImovel) * 100)} do imóvel · parcelado ${pct(r.parceladoPct)}`}
          />
          <Kpi titulo="Mensais" valor={mensal.valor} sub={mensal.sub} destaque />
          <Kpi
            titulo="Chaves"
            valor={r.chaves.valor > 0 ? brl(r.chaves.valor) : "—"}
            sub={rotuloMes(r.chaves.competencia)}
          />
          <Kpi
            titulo="Total à construtora"
            valor={brl(r.totalNominal)}
            sub={`≈ ${brl(r.totalCorrigido)} com INCC`}
          />
        </div>
        <ul className="space-y-1 text-sm">
          {linhasDoFluxo(r).map((l) => (
            <li key={l} className="flex gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
        {r.posChaves.quantidade > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Atravessam as chaves {brl(r.posChaves.saldoNasChaves)}, financiados pela construtora:
            juros de {brl(r.posChaves.juros)} no período, já somados ao total.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// A coluna que não muda entre os cenários (as chaves, no modo "saldo nas
// mensais"; a mensal, no modo "mensal fixa") some na tela estreita: no celular
// a tabela cabe sem rolagem e a coluna que importa fica à vista.
const ESTREITO = "hidden sm:table-cell";

function QuantoCustaEsperar({
  cenarios,
  modo,
  mensaisPerdidas,
}: {
  cenarios: ReturnType<typeof cenariosDeEspera>;
  modo: FormFluxo["modo"];
  mensaisPerdidas: number;
}) {
  if (cenarios.length < 2 || cenarios[0].mensais === 0) return null;
  const fixa = modo === "mensal_fixa";
  const prox = cenarios[1];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Hourglass className="h-4 w-4 text-gold-600" /> Quanto custa esperar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Assinando em <b>{rotuloMes(cenarios[0].hoje)}</b> são <b>{cenarios[0].mensais} mensais</b>
          .
          {mensaisPerdidas > 0 && (
            <>
              {" "}
              Se o cliente deixar para {rotuloMes(prox.hoje)}, sobram {prox.mensais}
              {fixa ? (
                <>
                  {" "}
                  e as chaves sobem <b>{brl(prox.diferenca)}</b>.
                </>
              ) : (
                <>
                  {" "}
                  e cada mensal sobe <b>{brl(prox.diferenca)}</b>.
                </>
              )}
            </>
          )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1.5 pr-3 text-left font-medium">Assinando em</th>
                <th className="py-1.5 pr-3 text-right font-medium">Mensais</th>
                <th className={cn("py-1.5 pr-3 text-right font-medium", fixa && ESTREITO)}>
                  Mensal
                </th>
                <th className={cn("py-1.5 pr-3 text-right font-medium", !fixa && ESTREITO)}>
                  Chaves
                </th>
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
                  <td className={cn("py-1.5 pr-3 text-right", fixa && ESTREITO)}>
                    {c.mensal > 0 ? brl(c.mensal) : "—"}
                  </td>
                  <td className={cn("py-1.5 pr-3 text-right", !fixa && ESTREITO)}>
                    {c.chaves > 0 ? brl(c.chaves) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right",
                      c.diferenca > 0 && "text-perigo-600 dark:text-perigo-400",
                    )}
                  >
                    {i === 0 ? "—" : `+${brl(c.diferenca)}${fixa ? " nas chaves" : "/mês"}`}
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

const CORES_COMPOSICAO = {
  financiamento: "bg-navy-500",
  subsidio: "bg-exito-500",
  fgts: "bg-ciano-500",
  ato: "bg-gold-500",
  mensais: "bg-laranja-500",
  intermediarias: "bg-anil-500",
  chaves: "bg-perigo-500",
  posChaves: "bg-ardosia-500",
} as const;

function Composicao({ resultado: r }: { resultado: ResultadoFluxo }) {
  const somaTipo = (t: ParcelaFluxo["tipo"]) =>
    r.parcelas.filter((p) => p.tipo === t).reduce((s, p) => s + p.valor, 0);
  const posSemJuros = r.posChaves.saldoNasChaves;
  const fatias = [
    { id: "financiamento", rotulo: "Financiamento", valor: r.recursos.financiamento },
    { id: "subsidio", rotulo: "Subsídio", valor: r.recursos.subsidio },
    { id: "fgts", rotulo: "FGTS", valor: r.recursos.fgts },
    { id: "ato", rotulo: "Ato", valor: r.ato },
    { id: "mensais", rotulo: "Mensais", valor: somaTipo("mensal") },
    { id: "intermediarias", rotulo: "Intermediárias", valor: somaTipo("intermediaria") },
    { id: "chaves", rotulo: "Chaves", valor: r.chaves.valor },
    { id: "posChaves", rotulo: "Pós-chaves (sem juros)", valor: posSemJuros },
  ].filter((f) => f.valor > 0) as {
    id: keyof typeof CORES_COMPOSICAO;
    rotulo: string;
    valor: number;
  }[];
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Como o imóvel é pago</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {fatias.map((f) => (
            <div
              key={f.id}
              className={CORES_COMPOSICAO[f.id]}
              style={{ width: `${(f.valor / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {fatias.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", CORES_COMPOSICAO[f.id])} />
                {f.rotulo}
              </span>
              <span className="tabular-nums">
                {brl(f.valor)}{" "}
                <span className="text-muted-foreground">
                  ({pct((f.valor / r.valorImovel) * 100)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Comprometimento({
  resultado: r,
  limite,
  temBanco,
}: {
  resultado: ResultadoFluxo;
  limite: number;
  temBanco: boolean;
}) {
  const c = r.comprometimento!;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Renda comprometida</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Kpi titulo="Mensal da construtora" valor={pct(c.mensalPct)} sub="da renda" />
        <Kpi
          titulo="Na obra (banco + construtora)"
          valor={temBanco ? pct(c.obraPct) : "—"}
          sub={
            temBanco
              ? limite > 0
                ? `limite da construtora: ${pct(limite)}`
                : "conservador: parcela cheia do banco"
              : "informe a parcela do banco"
          }
        />
        <Kpi
          titulo="Depois das chaves"
          valor={r.posChaves.quantidade > 0 && temBanco ? pct(c.posChavesPct) : "—"}
          sub={r.posChaves.quantidade > 0 ? "banco + pós-chaves" : "sem pós-chaves"}
        />
      </CardContent>
    </Card>
  );
}

const TH = "sticky top-0 bg-card px-2 py-2 text-right font-medium text-muted-foreground";
const TD = "px-2 py-1.5 text-right tabular-nums";

const TOM_PARCELA: Record<ParcelaFluxo["tipo"], string> = {
  ato: "bg-gold/10",
  mensal: "",
  intermediaria: "bg-anil-500/5",
  chaves: "bg-perigo-500/5",
  pos_chaves: "bg-ardosia-500/5",
};

function Cronograma({ parcelas }: { parcelas: ParcelaFluxo[] }) {
  let acumulado = 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cronograma mês a mês</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className={cn(TH, "text-left")}>Mês</th>
                <th className={cn(TH, "text-left")}>Parcela</th>
                <th className={TH}>Valor (tabela)</th>
                <th className={cn(TH, ESTREITO)}>Com INCC (estim.)</th>
                <th className={TH}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p) => {
                acumulado += p.valor;
                return (
                  <tr
                    key={`${p.competencia}-${p.tipo}`}
                    className={cn("border-b last:border-0", TOM_PARCELA[p.tipo])}
                  >
                    <td className={cn(TD, "text-left")}>{rotuloMes(p.competencia)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-left")}>{rotuloParcela(p)}</td>
                    <td className={cn(TD, "font-semibold")}>{brl(p.valor)}</td>
                    <td className={cn(TD, ESTREITO, "text-muted-foreground")}>
                      {brl(p.valorCorrigido)}
                    </td>
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
