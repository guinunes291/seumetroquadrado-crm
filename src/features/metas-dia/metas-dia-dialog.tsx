import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  METAS_CHAVES,
  ROTULOS,
  contatosNecessarios,
  descreverProjecao,
  normalizarMeta,
  projecaoPorDia,
  plural,
  popupBloqueante,
  rotuloDoDia,
  sugestaoInicial,
  umACada,
  type Balanco,
  type BalancoItem,
  type MetaChave,
  type MetaDia,
  type MetaGestor,
  type TaxasFunil,
} from "@/features/metas-dia/metas-dia";
import { useSalvarMetaDia } from "@/features/metas-dia/use-metas-dia";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle,
  FileText,
  PhoneCall,
  SunHorizon,
  Target,
  TrendUp,
  Trophy,
} from "@phosphor-icons/react";

const ICONE: Record<MetaChave, typeof Target> = {
  agendamentos: CalendarCheck,
  documentacoes: FileText,
  vendas_semana: Trophy,
};

type Valores = Record<MetaChave, string>;

function valoresIniciais(
  dia: string,
  atual: MetaDia | null | undefined,
  ultima: MetaDia | null | undefined,
  gestor: MetaGestor,
): Valores {
  const base = atual ?? sugestaoInicial({ dia, ultima, gestor });
  return {
    agendamentos: String(base.meta_agendamentos),
    documentacoes: String(base.meta_documentacoes),
    vendas_semana: String(base.meta_vendas_semana),
  };
}

function LinhaBalanco({ item, rotulo }: { item: BalancoItem; rotulo: string }) {
  const Icon = ICONE[item.chave];
  const pct = item.meta > 0 ? Math.min(100, Math.round((item.realizado / item.meta) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {rotulo}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-display font-semibold tabular-nums">
            {item.realizado}
            <span className="font-normal text-muted-foreground">/{item.meta}</span>
          </span>
          {item.batida ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
              <CheckCircle className="h-3 w-3" /> Batida
            </span>
          ) : (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              Faltou {item.faltou}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            item.batida ? "bg-success" : pct >= 50 ? "bg-gradient-gold" : "bg-warning",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BlocoConversao({ taxas }: { taxas: TaxasFunil }) {
  if (!taxas.fonte) {
    return (
      <p className="text-xs text-muted-foreground">
        Sem histórico de conversão ainda. A partir dos primeiros contatos registrados (ligação e
        WhatsApp), esta análise passa a mostrar quantos contatos viram agendamento, pasta e venda.
      </p>
    );
  }
  const base = taxas.fonte === "minha" ? taxas.minhas! : taxas.time!;
  const linhas: { chave: MetaChave; total: number; cada: number | null }[] = [
    {
      chave: "agendamentos",
      total: base.agendamentos,
      cada: umACada(taxas.agendamento_por_contato),
    },
    {
      chave: "documentacoes",
      total: base.documentacoes,
      cada: umACada(taxas.documentacao_por_contato),
    },
    { chave: "vendas_semana", total: base.vendas, cada: umACada(taxas.venda_por_contato) },
  ];
  const time = taxas.time;
  const cadaTime = (chave: MetaChave) => {
    if (!time || taxas.fonte !== "minha" || time.contatos <= 0) return null;
    const n =
      chave === "agendamentos"
        ? time.agendamentos
        : chave === "documentacoes"
          ? time.documentacoes
          : time.vendas;
    return n > 0 ? Math.max(1, Math.round(time.contatos / n)) : null;
  };
  const media = taxas.media_contatos_dia;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {taxas.fonte === "minha" ? (
          <>
            Nos últimos {taxas.dias} dias você registrou{" "}
            <span className="font-semibold text-foreground">{base.contatos} contatos</span> (ligação
            + WhatsApp). Sua conversão:
          </>
        ) : (
          <>
            Você registrou {taxas.minhas?.contatos ?? 0} contatos em {taxas.dias} dias — abaixo do
            mínimo de 20 para ter taxa própria. Usando a referência do time ({base.contatos}{" "}
            contatos):
          </>
        )}
      </p>
      <ul className="space-y-1 text-sm">
        {linhas.map((l) => {
          const Icon = ICONE[l.chave];
          const t = cadaTime(l.chave);
          return (
            <li key={l.chave} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {plural(l.total, l.chave)}
              </span>
              <span className="font-display tabular-nums">
                {l.cada === null ? (
                  <span className="text-xs font-normal text-muted-foreground">sem conversão</span>
                ) : (
                  <>
                    1 a cada <span className="font-semibold">{l.cada}</span> contatos
                    {t !== null && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (time: {t})
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {media !== null && (
        <p className="text-xs text-muted-foreground">
          Seu ritmo atual:{" "}
          <span className="font-semibold text-foreground tabular-nums">{media} contatos</span> por
          dia útil ({taxas.minhas?.contatos ?? 0} em {taxas.dias_uteis_janela} dias úteis).
        </p>
      )}
    </div>
  );
}

function LinhaContatos({
  valores,
  taxas,
  vendasSemanaAtual,
  dia,
  destaque,
}: {
  valores: Valores;
  taxas: TaxasFunil;
  vendasSemanaAtual: number;
  dia: string;
  destaque?: boolean;
}) {
  const calc = useMemo(
    () =>
      contatosNecessarios(
        {
          meta_agendamentos: normalizarMeta(valores.agendamentos),
          meta_documentacoes: normalizarMeta(valores.documentacoes),
          meta_vendas_semana: normalizarMeta(valores.vendas_semana),
        },
        taxas,
        vendasSemanaAtual,
        dia,
      ),
    [valores, taxas, vendasSemanaAtual, dia],
  );
  if (!taxas.fonte) return null;
  const media = taxas.media_contatos_dia;
  // Meta muito acima do ritmo: o corretor precisa mais que o dobro do que faz por dia.
  const acimaDoRitmo = calc.total !== null && media !== null && media > 0 && calc.total > media * 2;
  const projecaoAg = descreverProjecao(
    projecaoPorDia(media, taxas.agendamento_por_contato),
    "agendamentos",
  );
  const partes: string[] = [];
  if (calc.agendamentos !== null && calc.agendamentos > 0)
    partes.push(`${calc.agendamentos} p/ agendamentos`);
  if (calc.documentacoes !== null && calc.documentacoes > 0)
    partes.push(`${calc.documentacoes} p/ documentações`);
  if (calc.vendas !== null && calc.vendas > 0)
    partes.push(`${calc.vendas}/dia p/ ${plural(calc.vendas_faltam, "vendas_semana")} que faltam`);
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        destaque ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm">
          {calc.total === null ? (
            <span className="text-muted-foreground">
              Sem conversão registrada para projetar contatos.
            </span>
          ) : calc.total === 0 ? (
            <span className="text-muted-foreground">
              Com essas metas, nenhum contato extra é necessário hoje.
            </span>
          ) : (
            <>
              Para bater essas metas você precisa de{" "}
              <span className="font-display text-base font-bold tabular-nums">
                ≈ {calc.total} contatos
              </span>{" "}
              hoje.
            </>
          )}
        </p>
      </div>
      {partes.length > 1 && (
        <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{partes.join(" · ")}</p>
      )}
      {media !== null && calc.total !== null && calc.total > 0 && (
        <p
          className={cn(
            "mt-1 pl-6 text-[11px]",
            acimaDoRitmo ? "text-warning" : "text-muted-foreground",
          )}
        >
          Sua média é <span className="font-semibold tabular-nums">{media}</span> contatos por dia
          {projecaoAg ? <>, o que projeta {projecaoAg}</> : null}.
          {acimaDoRitmo &&
            " Para bater essa meta, o volume de contatos precisa subir — ou a meta precisa caber no seu ritmo."}
        </p>
      )}
    </div>
  );
}

/**
 * Popup das metas do dia.
 *  - Passo 1 (só na primeira abertura, quando há resposta anterior): balanço
 *    do último dia declarado, conversão do corretor e contatos necessários.
 *  - Passo 2: as três metas. Em dia útil é BLOQUEANTE: sem X, sem Esc, sem
 *    clique fora. No fim de semana (ou ao reabrir para editar) pode ser fechado.
 */
export function MetasDiaDialog({
  open,
  dia,
  atual,
  ultima,
  gestor,
  balanco,
  taxas,
  vendasSemanaAtual,
  modo,
  onClose,
}: {
  open: boolean;
  dia: string;
  /** Resposta já registrada hoje (modo edição). */
  atual: MetaDia | null | undefined;
  ultima: MetaDia | null | undefined;
  gestor: MetaGestor;
  /** Balanço do último dia declarado (null = sem histórico → sem passo 1). */
  balanco: Balanco | null;
  taxas: TaxasFunil;
  /** Vendas já feitas na semana corrente (para o cálculo de contatos). */
  vendasSemanaAtual: number;
  /** "primeira": abertura do dia (bloqueante em dia útil). "editar": reabertura pelo card. */
  modo: "primeira" | "editar";
  /** Chamado ao fechar sem salvar (só permitido quando não é bloqueante). */
  onClose: (motivo: "salvo" | "pulado") => void;
}) {
  const salvar = useSalvarMetaDia();
  const bloqueante = modo === "primeira" && popupBloqueante(dia);
  const temBalanco = modo === "primeira" && !!balanco;
  const [passo, setPasso] = useState<"balanco" | "metas">(temBalanco ? "balanco" : "metas");
  const [valores, setValores] = useState<Valores>(() =>
    valoresIniciais(dia, atual, ultima, gestor),
  );

  // Recalcula o pré-preenchimento quando o popup abre com dados novos (as
  // queries de "última" e "gestor" podem resolver depois do primeiro render) —
  // mas NUNCA por cima do que o corretor já digitou nesta abertura.
  const tocouRef = useRef(false);
  useEffect(() => {
    if (!open) {
      tocouRef.current = false;
      return;
    }
    if (tocouRef.current) return;
    setValores(valoresIniciais(dia, atual, ultima, gestor));
  }, [open, dia, atual, ultima, gestor]);

  // Ao (re)abrir, volta para o primeiro passo disponível.
  useEffect(() => {
    if (open) setPasso(temBalanco ? "balanco" : "metas");
  }, [open, temBalanco]);

  const set = (k: MetaChave) => (e: React.ChangeEvent<HTMLInputElement>) => {
    tocouRef.current = true;
    setValores((v) => ({ ...v, [k]: e.target.value }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    salvar.mutate(
      {
        dia,
        meta_agendamentos: normalizarMeta(valores.agendamentos),
        meta_documentacoes: normalizarMeta(valores.documentacoes),
        meta_vendas_semana: normalizarMeta(valores.vendas_semana),
      },
      {
        onSuccess: () => {
          toast.success(
            modo === "primeira"
              ? "Metas do dia registradas. Bora pra cima! 🚀"
              : "Metas atualizadas.",
          );
          onClose("salvo");
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  const fechar = (aberto: boolean) => {
    if (aberto) return;
    if (bloqueante) return; // ignorado: a única saída é salvar
    onClose("pulado");
  };

  const rotuloOntem = balanco ? rotuloDoDia(balanco.dia, dia) : "";

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent
        className={cn("max-w-md", bloqueante && "[&>button.absolute]:hidden")}
        onEscapeKeyDown={(e) => bloqueante && e.preventDefault()}
        onPointerDownOutside={(e) => bloqueante && e.preventDefault()}
        onInteractOutside={(e) => bloqueante && e.preventDefault()}
        data-testid="metas-dia-dialog"
      >
        {passo === "balanco" && balanco ? (
          <div data-testid="metas-dia-balanco">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <TrendUp className="h-5 w-5 text-primary" />
                Balanço de {rotuloOntem}
                {balanco.pct_geral !== null && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                      balanco.pct_geral >= 100
                        ? "bg-success/15 text-success"
                        : balanco.pct_geral >= 60
                          ? "bg-primary/15 text-primary"
                          : "bg-warning/15 text-warning",
                    )}
                  >
                    {balanco.pct_geral}%
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                O que você prometeu, o que entregou, e o que a sua conversão diz sobre hoje.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-3">
                {balanco.itens.length === 0 &&
                  !(balanco.vendas.semana_encerrada && balanco.vendas.meta > 0) && (
                    <p className="text-sm text-muted-foreground">
                      Você não declarou metas diárias acima de zero em {rotuloOntem}.
                    </p>
                  )}
                {balanco.itens.map((i) => (
                  <LinhaBalanco key={i.chave} item={i} rotulo={ROTULOS[i.chave].curto} />
                ))}
                {balanco.vendas.meta > 0 &&
                  (balanco.vendas.semana_encerrada ? (
                    <LinhaBalanco item={balanco.vendas} rotulo="Vendas da semana passada" />
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Trophy className="h-3.5 w-3.5" /> Vendas na semana até agora:{" "}
                      <span className="font-display font-semibold tabular-nums text-foreground">
                        {balanco.vendas.realizado}/{balanco.vendas.meta}
                      </span>
                    </p>
                  ))}
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <TrendUp className="h-3.5 w-3.5" /> Sua conversão
                </p>
                <BlocoConversao taxas={taxas} />
              </div>

              <LinhaContatos
                valores={valores}
                taxas={taxas}
                vendasSemanaAtual={vendasSemanaAtual}
                dia={dia}
                destaque
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => setPasso("metas")}
                className="bg-gradient-gold text-navy-900 shadow-glow-gold hover:opacity-90"
              >
                Definir metas de hoje <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <SunHorizon className="h-5 w-5 text-primary" />
                {modo === "primeira" ? "Suas metas de hoje" : "Ajustar metas de hoje"}
              </DialogTitle>
              <DialogDescription>
                {modo === "primeira"
                  ? "Antes de começar, declare o que você vai entregar hoje. O progresso fica visível o dia todo."
                  : "Você pode ajustar as metas declaradas. O histórico do dia fica registrado."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {METAS_CHAVES.map((k) => {
                const Icon = ICONE[k];
                const zero = normalizarMeta(valores[k]) === 0;
                return (
                  <div key={k}>
                    <Label htmlFor={`meta-${k}`} className="flex items-center gap-1.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {ROTULOS[k].pergunta}
                    </Label>
                    <Input
                      id={`meta-${k}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={valores[k]}
                      onChange={set(k)}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-display mt-1 w-32 text-lg tabular-nums"
                      autoFocus={k === "agendamentos"}
                    />
                    {zero && (
                      <p className="mt-1 text-xs text-warning">
                        Meta zero: a barra desta meta não aparece no card hoje.
                      </p>
                    )}
                  </div>
                );
              })}

              <LinhaContatos
                valores={valores}
                taxas={taxas}
                vendasSemanaAtual={vendasSemanaAtual}
                dia={dia}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {temBalanco && (
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => setPasso("balanco")}
                >
                  <ArrowLeft className="h-4 w-4" /> Balanço
                </Button>
              )}
              {!bloqueante && (
                <Button type="button" variant="ghost" onClick={() => onClose("pulado")}>
                  {modo === "primeira" ? "Hoje não" : "Cancelar"}
                </Button>
              )}
              <Button
                type="submit"
                disabled={salvar.isPending}
                className="bg-gradient-gold text-navy-900 shadow-glow-gold hover:opacity-90"
              >
                <Target className="h-4 w-4" />
                {modo === "primeira" ? "Começar o dia" : "Salvar metas"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
