// Card "Registrar N itens?" (Onda S2, decisões D1/D5/D7): o pacote de
// propostas que a Sami montou num turno. O corretor revisa, ajusta o que
// quiser, tira item, e confirma com UM toque. Nada é gravado antes do toque;
// depois, cada item mostra "Registrado · via Sami" com Desfazer por 24 h.

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  CalendarPlus,
  Check,
  CheckCircle,
  ClipboardText,
  Funnel,
  NotePencil,
  PencilSimple,
  PhoneCall,
  UserGear,
  Warning,
  X,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SamiMark } from "@/components/ui/sami-mark";
import { cn } from "@/lib/utils";
import {
  RESULTADO_CONTATO_LABEL,
  SAMIQ_PROPOSTA_LABEL,
  descreverProposta,
  tituloDoPacote,
  type PropostaSamiQ,
  type SamiQPropostaTipo,
} from "@/lib/samiq-propostas";
import {
  confirmarPropostasSamiQ,
  desfazerPropostaSamiQ,
  rejeitarPropostasSamiQ,
} from "@/lib/samiq-confirmar.functions";
import {
  aplicarEdicao,
  inputLocalParaIso,
  isoParaInputLocal,
  podeDesfazerAgora,
  rotuloPrazoDesfazer,
  type EdicaoProposta,
} from "@/components/samiq/samiq-propostas-form";

const ICONE: Record<SamiQPropostaTipo, IconComponent> = {
  registrar_contato: PhoneCall,
  anotar: NotePencil,
  criar_tarefa: ClipboardText,
  atualizar_qualificacao: UserGear,
  agendar_visita: CalendarPlus,
  mudar_etapa: Funnel,
};

/** Queries que uma escrita da Sami pode ter mudado — invalida em bloco. */
const QUERIES_AFETADAS = new Set([
  "interacoes",
  "lead",
  "leads",
  "tarefas",
  "tarefas-lead",
  "atendimento:inbox",
  "blitz-queue",
  "meu-dia:tarefas",
  "meu-dia:sem-acao",
  "agendamentos",
  "agenda-do-dia",
  "pipeline",
]);

type Props = {
  propostas: PropostaSamiQ[];
  onChange: (propostas: PropostaSamiQ[]) => void;
};

export function SamiQPropostasCard({ propostas, onChange }: Props) {
  const qc = useQueryClient();
  const confirmar = useServerFn(confirmarPropostasSamiQ);
  const rejeitar = useServerFn(rejeitarPropostasSamiQ);
  const desfazer = useServerFn(desfazerPropostaSamiQ);

  const [editando, setEditando] = useState<string | null>(null);
  const [edicoes, setEdicoes] = useState<Record<string, EdicaoProposta>>({});
  const [removidas, setRemovidas] = useState<Set<string>>(() => new Set());
  const [errosEdicao, setErrosEdicao] = useState<Record<string, string>>({});

  const pendentes = useMemo(
    () => propostas.filter((p) => p.status === "pendente" || p.status === "falhou"),
    [propostas],
  );
  const ativas = pendentes.filter((p) => !removidas.has(p.id));
  const decididas = propostas.filter((p) => p.status !== "pendente" && p.status !== "falhou");

  const invalidar = () => {
    qc.invalidateQueries({ predicate: (q) => QUERIES_AFETADAS.has(String(q.queryKey[0])) });
  };

  const atualizar = (patch: Map<string, Partial<PropostaSamiQ>>) => {
    onChange(propostas.map((p) => (patch.has(p.id) ? { ...p, ...patch.get(p.id) } : p)));
  };

  const confirmarMutation = useMutation({
    mutationFn: async () => {
      const itens: Array<{ id: string; payload?: unknown }> = [];
      const erros: Record<string, string> = {};
      for (const p of ativas) {
        const edicao = edicoes[p.id];
        if (edicao && Object.keys(edicao).length > 0) {
          const r = aplicarEdicao(p.payload, edicao);
          if ("erro" in r) {
            erros[p.id] = r.erro;
            continue;
          }
          itens.push({ id: p.id, payload: r.payload });
        } else {
          itens.push({ id: p.id });
        }
      }
      setErrosEdicao(erros);
      if (Object.keys(erros).length > 0) throw new Error("Corrija os itens marcados.");
      const descartadas = pendentes.filter((p) => removidas.has(p.id)).map((p) => p.id);
      const [resultado] = await Promise.all([
        itens.length > 0 ? confirmar({ data: { itens } }) : Promise.resolve({ resultados: [] }),
        descartadas.length > 0 ? rejeitar({ data: { ids: descartadas } }) : Promise.resolve(null),
      ]);
      return { resultado, descartadas, itens };
    },
    onSuccess: ({ resultado, descartadas, itens }) => {
      const patch = new Map<string, Partial<PropostaSamiQ>>();
      for (const r of resultado.resultados) {
        const enviado = itens.find((i) => i.id === r.id);
        patch.set(r.id, {
          status: r.ok ? (r.status === "editada" ? "editada" : "aceita") : "falhou",
          erro: r.ok ? null : (r.erro ?? "Não foi possível registrar."),
          desfazerAte: r.desfazerAte ?? null,
          ...(r.ok && enviado?.payload
            ? { payload: enviado.payload as PropostaSamiQ["payload"] }
            : {}),
        });
      }
      for (const id of descartadas) patch.set(id, { status: "rejeitada" });
      atualizar(patch);
      setRemovidas(new Set());
      setEdicoes({});
      setEditando(null);
      const ok = resultado.resultados.filter((r) => r.ok).length;
      const falhas = resultado.resultados.length - ok;
      if (ok > 0) {
        toast.success(ok === 1 ? "Registrado · via Sami" : `${ok} registros feitos · via Sami`, {
          description: "Você pode desfazer nas próximas 24 horas.",
        });
      }
      if (falhas > 0) toast.error(`${falhas} ${falhas === 1 ? "item falhou" : "itens falharam"}.`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const descartarTudo = useMutation({
    mutationFn: async () => {
      const ids = pendentes.map((p) => p.id);
      if (ids.length === 0) return;
      await rejeitar({ data: { ids } });
      return ids;
    },
    onSuccess: (ids) => {
      if (!ids) return;
      atualizar(new Map(ids.map((id) => [id, { status: "rejeitada" as const }])));
      toast("Propostas descartadas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desfazerMutation = useMutation({
    mutationFn: (id: string) => desfazer({ data: { id } }),
    onSuccess: (_r, id) => {
      atualizar(new Map([[id, { status: "desfeita" as const }]]));
      toast.success("Registro desfeito.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (propostas.length === 0) return null;

  const ocupado = confirmarMutation.isPending || descartarTudo.isPending;

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-background p-2.5 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <SamiMark className="h-4 w-4" />
        <span className="font-medium">
          {ativas.length > 0
            ? tituloDoPacote(ativas)
            : decididas.length > 0
              ? "Registros da Sami"
              : "Nenhum item para registrar"}
        </span>
      </div>
      {ativas.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          Nada foi gravado ainda. Revise, ajuste se quiser e confirme com um toque.
        </p>
      )}

      <ul className="space-y-2">
        {propostas.map((p) => {
          const removida = removidas.has(p.id);
          const edicao = edicoes[p.id] ?? {};
          const aplicada = Object.keys(edicao).length ? aplicarEdicao(p.payload, edicao) : null;
          const payloadAtual = aplicada && "payload" in aplicada ? aplicada.payload : p.payload;
          const descricao = descreverProposta(payloadAtual, p.leadNome);
          const Icone = ICONE[p.tipo];
          const pendente = p.status === "pendente" || p.status === "falhou";
          const registrado = p.status === "aceita" || p.status === "editada";
          return (
            <li
              key={p.id}
              className={cn(
                "rounded-md border px-2.5 py-2",
                removida && "opacity-50",
                registrado && "border-success/40",
                p.status === "falhou" && "border-destructive/40",
              )}
            >
              <div className="flex items-start gap-2">
                <Icone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {SAMIQ_PROPOSTA_LABEL[p.tipo]}
                      </div>
                      <div className={cn("font-medium", removida && "line-through")}>
                        {descricao.titulo}
                      </div>
                    </div>
                    {pendente && !ocupado && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        {p.tipo !== "atualizar_qualificacao" && (
                          <button
                            type="button"
                            aria-label="Editar item"
                            className="rounded p-1 text-muted-foreground hover:text-primary"
                            onClick={() => setEditando(editando === p.id ? null : p.id)}
                          >
                            <PencilSimple className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={removida ? "Manter item" : "Tirar item"}
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setRemovidas((s) => {
                              const n = new Set(s);
                              if (n.has(p.id)) n.delete(p.id);
                              else n.add(p.id);
                              return n;
                            })
                          }
                        >
                          {removida ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    {descricao.detalhes.map((d, i) => (
                      <li key={i} className="whitespace-pre-wrap">
                        {d}
                      </li>
                    ))}
                  </ul>
                  {errosEdicao[p.id] && (
                    <p className="mt-1 text-xs text-destructive">{errosEdicao[p.id]}</p>
                  )}
                  {p.status === "falhou" && p.erro && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                      <Warning className="h-3 w-3" /> {p.erro} — ajuste e confirme de novo.
                    </p>
                  )}
                  {registrado && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle className="h-3.5 w-3.5" weight="fill" /> Registrado · via Sami
                      </span>
                      {podeDesfazerAgora(p) && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          disabled={desfazerMutation.isPending}
                          onClick={() => desfazerMutation.mutate(p.id)}
                        >
                          <ArrowCounterClockwise className="h-3 w-3" /> Desfazer
                          <span className="text-muted-foreground/70">
                            ({rotuloPrazoDesfazer(p.desfazerAte)})
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                  {p.status === "desfeita" && (
                    <p className="mt-1 text-xs text-muted-foreground">Desfeito.</p>
                  )}
                  {p.status === "rejeitada" && (
                    <p className="mt-1 text-xs text-muted-foreground">Descartado.</p>
                  )}

                  {pendente && editando === p.id && (
                    <EdicaoCampos
                      proposta={p}
                      edicao={edicao}
                      onChange={(patch) =>
                        setEdicoes((e) => ({ ...e, [p.id]: { ...(e[p.id] ?? {}), ...patch } }))
                      }
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pendentes.length > 0 && (
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={ocupado}
            onClick={() => descartarTudo.mutate()}
          >
            Descartar
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={ocupado || ativas.length === 0}
            onClick={() => confirmarMutation.mutate()}
          >
            <Check className="h-3.5 w-3.5" />
            {confirmarMutation.isPending
              ? "Registrando…"
              : ativas.length === 1
                ? "Confirmar 1 registro"
                : `Confirmar ${ativas.length} registros`}
          </Button>
        </div>
      )}
    </div>
  );
}

function EdicaoCampos({
  proposta,
  edicao,
  onChange,
}: {
  proposta: PropostaSamiQ;
  edicao: EdicaoProposta;
  onChange: (patch: EdicaoProposta) => void;
}) {
  const p = proposta.payload;
  const campo = "mt-2 grid gap-1.5 text-xs";
  const rotulo = "text-[11px] text-muted-foreground";
  switch (p.tipo) {
    case "registrar_contato":
      return (
        <div className={campo}>
          <label className={rotulo}>Resultado</label>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={edicao.resultado ?? p.resultado}
            onChange={(e) => onChange({ resultado: e.target.value })}
          >
            {Object.entries(RESULTADO_CONTATO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className={rotulo}>Resumo</label>
          <Textarea
            rows={2}
            maxLength={2000}
            className="min-h-0 text-xs"
            value={edicao.resumo ?? p.resumo ?? ""}
            onChange={(e) => onChange({ resumo: e.target.value })}
          />
          <label className={rotulo}>Follow-up (vazio = sem follow-up)</label>
          <Input
            type="datetime-local"
            className="h-8 text-xs"
            value={
              edicao.followupEm !== undefined
                ? isoParaInputLocal(edicao.followupEm)
                : isoParaInputLocal(p.followupEm)
            }
            onChange={(e) => onChange({ followupEm: inputLocalParaIso(e.target.value) })}
          />
        </div>
      );
    case "anotar":
      return (
        <div className={campo}>
          <label className={rotulo}>Anotação</label>
          <Textarea
            rows={3}
            maxLength={2000}
            className="min-h-0 text-xs"
            value={edicao.nota ?? p.nota}
            onChange={(e) => onChange({ nota: e.target.value })}
          />
        </div>
      );
    case "criar_tarefa":
      return (
        <div className={campo}>
          <label className={rotulo}>Título</label>
          <Input
            className="h-8 text-xs"
            maxLength={160}
            value={edicao.titulo ?? p.titulo}
            onChange={(e) => onChange({ titulo: e.target.value })}
          />
          <label className={rotulo}>Vencimento</label>
          <Input
            type="datetime-local"
            className="h-8 text-xs"
            value={isoParaInputLocal(edicao.vencimentoEm ?? p.vencimentoEm)}
            onChange={(e) => onChange({ vencimentoEm: inputLocalParaIso(e.target.value) ?? "" })}
          />
        </div>
      );
    case "agendar_visita":
      return (
        <div className={campo}>
          <label className={rotulo}>Quando</label>
          <Input
            type="datetime-local"
            className="h-8 text-xs"
            value={isoParaInputLocal(edicao.inicioEm ?? p.inicioEm)}
            onChange={(e) => onChange({ inicioEm: inputLocalParaIso(e.target.value) ?? "" })}
          />
          <label className={rotulo}>Onde</label>
          <Input
            className="h-8 text-xs"
            maxLength={160}
            value={edicao.local ?? p.local ?? ""}
            onChange={(e) => onChange({ local: e.target.value })}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={edicao.moverParaAgendado ?? p.moverParaAgendado !== false}
              onChange={(e) => onChange({ moverParaAgendado: e.target.checked })}
            />
            Mover o cliente para Agendado
          </label>
        </div>
      );
    case "mudar_etapa":
      return (
        <div className={campo}>
          <label className={rotulo}>Motivo {p.novoStatus === "perdido" && "(obrigatório)"}</label>
          <Textarea
            rows={2}
            maxLength={1000}
            className="min-h-0 text-xs"
            value={edicao.motivo ?? p.motivo ?? ""}
            onChange={(e) => onChange({ motivo: e.target.value })}
          />
          <label className={rotulo}>Próxima ação</label>
          <Input
            className="h-8 text-xs"
            maxLength={500}
            value={edicao.proximaAcao ?? p.proximaAcao ?? ""}
            onChange={(e) => onChange({ proximaAcao: e.target.value })}
          />
          <label className={rotulo}>Follow-up</label>
          <Input
            type="datetime-local"
            className="h-8 text-xs"
            value={
              edicao.proximoFollowupEm !== undefined
                ? isoParaInputLocal(edicao.proximoFollowupEm)
                : isoParaInputLocal(p.proximoFollowupEm)
            }
            onChange={(e) => onChange({ proximoFollowupEm: inputLocalParaIso(e.target.value) })}
          />
        </div>
      );
    default:
      return null;
  }
}
