import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format, isPast, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowSquareOut,
  CalendarDots,
  CheckCircle,
  ClockAfternoon,
  FileText,
  FloppyDisk,
  Microphone,
  MicrophoneSlash,
  Path as RouteIcon,
  Phone,
  UserCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StickyActionRail } from "@/components/ui/sticky-action-rail";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { BriefingVisita, PotencialDeCreditoCard } from "@/features/visitas/briefing-visita";
import {
  INTERESSE_LABEL,
  INTERESSE_VISITA,
  OBJECAO_LABEL,
  OBJECAO_VISITA,
  temperaturaSugerida,
  type InteresseVisita,
} from "@/features/visitas/resultado-visita";
import {
  ehFalhaDeRede,
  enfileirar,
  listarFila,
  sincronizarFila,
} from "@/features/visitas/fila-offline";
import { briefingCurto, estadoDaVisita, quandoDaVisita } from "@/features/visitas/visita-derive";
import { supabase } from "@/integrations/supabase/client";
import { leadStatusLabel, type LeadStatus } from "@/lib/leads";
import { buildWhatsAppUrl } from "@/lib/templates";
import { cn } from "@/lib/utils";

const agendaLeadSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  projeto_nome: z.string().nullable(),
  renda_informada: z.string().nullable(),
  proxima_acao: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  // Briefing e potencial de crédito.
  //
  // Todos com .catch(): são campos de EXIBIÇÃO. Um deles vir com tipo
  // diferente do esperado tem que degradar aquela linha do briefing, nunca
  // derrubar a tela do corretor no meio do estande — foi exatamente o que
  // aconteceu quando `objecoes` (text[]) foi declarado como string.
  temperatura: z.string().nullable().catch(null),
  tipo_renda: z.string().nullable().catch(null),
  faixa_mcmv: z.string().nullable().catch(null),
  entrada_disponivel: z.union([z.string(), z.number()]).nullable().catch(null),
  fgts_valor: z.union([z.string(), z.number()]).nullable().catch(null),
  usa_fgts: z.boolean().nullable().catch(null),
  objecoes: z.array(z.string()).nullable().catch(null),
  observacoes: z.string().nullable().catch(null),
  ultima_interacao: z.string().nullable().catch(null),
  created_at: z.string().nullable().catch(null),
});

export const agendaSchema = z.object({
  id: z.string().uuid(),
  data_inicio: z.string(),
  data_fim: z.string(),
  local: z.string().nullable(),
  titulo: z.string(),
  status: z.string(),
  lead_id: z.string().uuid(),
  lead: agendaLeadSchema.nullable(),
});

const execucaoSchema = z.object({
  id: z.string().uuid(),
  checklist: z.record(z.string(), z.boolean()),
  nota_transcrita: z.string().nullable(),
  observacoes: z.string().nullable(),
  status: z.enum(["em_andamento", "concluida"]),
  proxima_etapa: z.string().nullable(),
  proxima_acao: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  interesse: z.string().nullable().optional(),
  objecao_principal: z.string().nullable().optional(),
});

const formSchema = z
  .object({
    notaTranscrita: z.string().max(5000, "A nota pode ter no máximo 5.000 caracteres."),
    observacoes: z.string().max(5000, "As observações podem ter no máximo 5.000 caracteres."),
    // "nao_compareceu" é desfecho, não etapa do lead: quem não apareceu volta
    // para aguardando_retorno. O agendamento é que fica marcado como no-show.
    desfecho: z.enum(["realizada", "nao_compareceu"]),
    interesse: z.enum(INTERESSE_VISITA).or(z.literal("")),
    objecao: z.enum(OBJECAO_VISITA).or(z.literal("")),
    reagendarPara: z.string(),
    proximaEtapa: z.enum(["visita_realizada", "aguardando_retorno"]),
    proximaAcao: z.string().max(500, "A próxima ação pode ter no máximo 500 caracteres."),
    proximoFollowup: z.string(),
  })
  .superRefine((value, context) => {
    if (!value.proximaAcao.trim() && !value.proximoFollowup) {
      context.addIssue({
        code: "custom",
        path: ["proximaAcao"],
        message: "Informe a próxima ação ou um follow-up.",
      });
    }
    // Visita que aconteceu sem leitura de interesse é a visita que ninguém
    // consegue analisar depois — é o dado que estamos aqui para capturar.
    if (value.desfecho === "realizada" && !value.interesse) {
      context.addIssue({
        code: "custom",
        path: ["interesse"],
        message: "Diga como o cliente saiu da visita.",
      });
    }
    if (value.reagendarPara) {
      const quando = Date.parse(value.reagendarPara);
      if (Number.isNaN(quando) || quando <= Date.now()) {
        context.addIssue({
          code: "custom",
          path: ["reagendarPara"],
          message: "O reagendamento precisa ser no futuro.",
        });
      }
    }
    if (value.proximaEtapa === "aguardando_retorno" || value.desfecho === "nao_compareceu") {
      const followup = Date.parse(value.proximoFollowup);
      if (!value.proximoFollowup || Number.isNaN(followup) || followup <= Date.now()) {
        context.addIssue({
          code: "custom",
          path: ["proximoFollowup"],
          message: "Escolha uma data futura para o retorno.",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;
type Agenda = z.infer<typeof agendaSchema>;
type ChecklistKey = (typeof CHECKLIST)[number]["key"];

// Rótulos curtos, como no vídeo de lançamento; as CHAVES são as gravadas em
// visita_execucoes.checklist e não mudam.
const CHECKLIST = [
  { key: "horario_confirmado", label: "Horário confirmado" },
  { key: "documentos_separados", label: "Documentos conferidos" },
  { key: "simulacao_revisada", label: "Simulação revisada" },
  { key: "projeto_apresentado", label: "Projeto apresentado" },
  { key: "objecoes_registradas", label: "Objeções registradas" },
] as const;

/** Botões do cartão navy da visita (Ligar, WhatsApp, Rota, Documentos). */
const BOTAO_NAVY =
  "min-h-11 justify-center border border-white/10 bg-white/[0.08] text-white hover:bg-white/15 hover:text-white";

const CHECKLIST_INICIAL: Record<ChecklistKey, boolean> = {
  horario_confirmado: false,
  documentos_separados: false,
  simulacao_revisada: false,
  projeto_apresentado: false,
  objecoes_registradas: false,
};

type SpeechResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Rascunho local da visita em andamento.
 *
 * O Modo Visita é usado em estande e subsolo, onde a conexão cai, e a nota
 * pode levar minutos de ditado. Antes, trocar de visita no seletor disparava
 * um form.reset() e o texto sumia sem aviso. O rascunho fica por agendamento,
 * é gravado a cada mudança e some no primeiro salvamento bem-sucedido.
 */
type RascunhoVisita = {
  valores: Partial<FormValues>;
  checklist: Partial<Record<ChecklistKey, boolean>>;
  salvoEm: number;
};

const RASCUNHO_PREFIXO = "modo-visita:rascunho:";
/** Rascunho velho não ajuda ninguém: some depois de 7 dias. */
const RASCUNHO_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function lerRascunho(agendamentoId: string): RascunhoVisita | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(RASCUNHO_PREFIXO + agendamentoId);
    if (!bruto) return null;
    const rascunho = JSON.parse(bruto) as RascunhoVisita;
    if (!rascunho?.salvoEm || Date.now() - rascunho.salvoEm > RASCUNHO_VALIDADE_MS) {
      window.localStorage.removeItem(RASCUNHO_PREFIXO + agendamentoId);
      return null;
    }
    return rascunho;
  } catch {
    return null;
  }
}

function gravarRascunho(agendamentoId: string, rascunho: RascunhoVisita) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RASCUNHO_PREFIXO + agendamentoId, JSON.stringify(rascunho));
  } catch {
    // Cota cheia ou storage bloqueado: seguir sem rascunho é melhor que travar
    // o corretor no meio da visita.
  }
}

function limparRascunho(agendamentoId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RASCUNHO_PREFIXO + agendamentoId);
  } catch {
    /* idem */
  }
}

export function ModoVisitaPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(CHECKLIST_INICIAL);
  const [listening, setListening] = useState(false);
  const [rascunhoEm, setRascunhoEm] = useState<number | null>(null);
  const [pendentesOffline, setPendentesOffline] = useState(0);
  const [speechConsent, setSpeechConsent] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionSupported = useMemo(() => speechRecognitionConstructor() !== null, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      notaTranscrita: "",
      observacoes: "",
      desfecho: "realizada",
      interesse: "",
      objecao: "",
      reagendarPara: "",
      proximaEtapa: "visita_realizada",
      proximaAcao: "Confirmar documentação e preparar a próxima proposta",
      proximoFollowup: toLocalInput(addDays(new Date(), 1)),
    },
  });

  const agendaQ = useQuery({
    queryKey: ["modo-visita", "agenda", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<Agenda[]> => {
      // Janela retroativa de 7 dias (era 12h): visita de terça que o corretor
      // não validou na hora sumia da tela na quarta — e, como a métrica conta
      // agendamento VALIDADO, visita que some é visita que não entra no
      // relatório. Aqui é onde ela volta a ser alcançável.
      const inicio = subDays(new Date(), 7).toISOString();
      const fim = addDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("agendamentos")
        .select(
          "id, data_inicio, data_fim, local, titulo, status, lead_id, " +
            "lead:leads(id, nome, telefone, status, projeto_nome, renda_informada, proxima_acao, " +
            "proximo_followup, temperatura, tipo_renda, faixa_mcmv, entrada_disponivel, " +
            "fgts_valor, usa_fgts, objecoes, observacoes, ultima_interacao, created_at)",
        )
        .eq("tipo", "visita")
        .not("lead_id", "is", null)
        .is("deleted_at", null)
        .in("status", ["agendado", "confirmado"])
        .gte("data_inicio", inicio)
        .lte("data_inicio", fim)
        .order("data_inicio")
        .limit(20);
      if (error) throw error;
      return z.array(agendaSchema).parse(data ?? []);
    },
  });

  useEffect(() => {
    if (!selectedId && agendaQ.data?.[0]) setSelectedId(agendaQ.data[0].id);
  }, [agendaQ.data, selectedId]);

  const selected = agendaQ.data?.find((item) => item.id === selectedId) ?? null;
  const execucaoQ = useQuery({
    queryKey: ["modo-visita", "execucao", user?.id, selectedId],
    enabled: Boolean(user?.id && selectedId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visita_execucoes")
        .select(
          "id, checklist, nota_transcrita, observacoes, status, proxima_etapa, proxima_acao, " +
            "proximo_followup, interesse, objecao_principal",
        )
        .eq("agendamento_id", selectedId!)
        .maybeSingle();
      if (error) throw error;
      return data ? execucaoSchema.parse(data) : null;
    },
  });

  useEffect(() => {
    if (!selected) return;
    const execucao = execucaoQ.data;
    const nextChecklist = { ...CHECKLIST_INICIAL };
    for (const item of CHECKLIST) {
      nextChecklist[item.key] = execucao?.checklist[item.key] ?? false;
    }
    const doServidor: FormValues = {
      notaTranscrita: execucao?.nota_transcrita ?? "",
      observacoes: execucao?.observacoes ?? "",
      desfecho: "realizada",
      interesse: (execucao?.interesse ?? "") as FormValues["interesse"],
      objecao: (execucao?.objecao_principal ?? "") as FormValues["objecao"],
      reagendarPara: "",
      proximaEtapa:
        execucao?.proxima_etapa === "aguardando_retorno"
          ? "aguardando_retorno"
          : "visita_realizada",
      proximaAcao: execucao?.proxima_acao ?? "Confirmar documentação e preparar a próxima proposta",
      proximoFollowup: execucao?.proximo_followup
        ? toLocalInput(new Date(execucao.proximo_followup))
        : toLocalInput(addDays(new Date(), 1)),
    };

    // Rascunho local vence o servidor: em campo a conexão cai, o corretor
    // troca de visita no seletor ou o navegador descarta a aba — e antes
    // disso tudo a nota digitada ia embora sem aviso.
    const rascunho = lerRascunho(selected.id);
    if (rascunho && execucao?.status !== "concluida") {
      setChecklist({ ...nextChecklist, ...rascunho.checklist });
      form.reset({ ...doServidor, ...rascunho.valores });
      setRascunhoEm(rascunho.salvoEm);
    } else {
      setChecklist(nextChecklist);
      form.reset(doServidor);
      setRascunhoEm(null);
    }
  }, [execucaoQ.data, form, selected]);

  // Autosave do rascunho a cada mudança (form ou checklist), com debounce
  // curto — o custo é um write em localStorage, o ganho é nunca perder a nota.
  const valoresAtuais = form.watch();
  useEffect(() => {
    if (!selected || execucaoQ.data?.status === "concluida") return;
    const timer = setTimeout(() => {
      gravarRascunho(selected.id, { valores: valoresAtuais, checklist, salvoEm: Date.now() });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, JSON.stringify(valoresAtuais), checklist]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    [],
  );

  // Fila offline: tenta subir ao abrir a página e sempre que a conexão volta.
  // O corretor sai do estande, pega sinal no carro e a visita entra sozinha.
  useEffect(() => {
    let vivo = true;
    const subir = async () => {
      if (listarFila().length === 0) {
        if (vivo) setPendentesOffline(0);
        return;
      }
      const { enviados, pendentes } = await sincronizarFila(
        async (payload) => {
          const { error } = await supabase.rpc("salvar_modo_visita", payload as never);
          if (error) throw error;
        },
        (item, erro) => {
          // Falha de regra não volta para a fila: o corretor precisa saber.
          toast.error(`A visita de ${item.leadNome} não pôde ser registrada.`, {
            description: erro instanceof Error ? erro.message : "Abra a visita e revise.",
          });
        },
      );
      if (!vivo) return;
      setPendentesOffline(pendentes);
      if (enviados > 0) {
        toast.success(
          enviados === 1 ? "1 visita pendente foi enviada." : `${enviados} visitas foram enviadas.`,
        );
        await queryClient.invalidateQueries({ queryKey: ["modo-visita"] });
        await queryClient.invalidateQueries({ queryKey: ["leads"] });
      }
    };
    void subir();
    window.addEventListener("online", subir);
    return () => {
      vivo = false;
      window.removeEventListener("online", subir);
    };
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async ({ values, concluir }: { values: FormValues; concluir: boolean }) => {
      if (!selected) throw new Error("Selecione uma visita.");
      const payload = {
        p_agendamento_id: selected.id,
        p_checklist: checklist,
        p_nota_transcrita: values.notaTranscrita.trim() || undefined,
        p_observacoes: values.observacoes.trim() || undefined,
        p_concluir: concluir,
        p_proxima_etapa: concluir ? values.proximaEtapa : undefined,
        p_proxima_acao: concluir ? values.proximaAcao.trim() || undefined : undefined,
        p_proximo_followup:
          concluir && values.proximoFollowup
            ? new Date(values.proximoFollowup).toISOString()
            : undefined,
        p_compareceu: values.desfecho === "realizada",
        p_interesse: concluir && values.interesse ? values.interesse : undefined,
        p_objecao_principal: concluir && values.objecao ? values.objecao : undefined,
        p_reagendar_para:
          concluir && values.reagendarPara
            ? new Date(values.reagendarPara).toISOString()
            : undefined,
      };
      const { data, error } = await supabase.rpc("salvar_modo_visita", payload);
      if (error) {
        // Sem rede, a visita não se perde: vai para a fila do aparelho e sobe
        // quando a conexão voltar. Erro de REGRA continua na cara do corretor.
        if (concluir && ehFalhaDeRede(error)) {
          enfileirar({
            agendamentoId: selected.id,
            leadNome: selected.lead?.nome ?? "lead",
            payload,
          });
          setPendentesOffline(listarFila().length);
          return { data: null, concluir, enfileirado: true as const };
        }
        throw error;
      }
      return { data: execucaoSchema.parse(data), concluir, enfileirado: false as const };
    },
    onSuccess: async ({ concluir, enfileirado }) => {
      // O que está no servidor (ou na fila) não precisa mais de rascunho local.
      if (selected) limparRascunho(selected.id);
      setRascunhoEm(null);
      if (enfileirado) {
        toast.success("Sem conexão: visita salva no aparelho.", {
          description: "Ela sobe sozinha assim que a internet voltar.",
        });
        setSelectedId(null);
        return;
      }
      toast.success(concluir ? "Visita concluída e próxima etapa registrada." : "Progresso salvo.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["modo-visita"] }),
        queryClient.invalidateQueries({ queryKey: ["agendamentos"] }),
        queryClient.invalidateQueries({ queryKey: ["lead", selected?.lead_id] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["leads-kanban"] }),
      ]);
      if (concluir) setSelectedId(null);
    },
    onError: (error) => {
      toast.error("Não foi possível salvar a visita.", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    },
  });

  const startDictation = () => {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor || listening || !speechConsent) return;
    const recognition = new Constructor();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) parts.push(event.results[index][0].transcript);
      }
      if (parts.length > 0) {
        const current = form.getValues("notaTranscrita").trim();
        form.setValue("notaTranscrita", [current, parts.join(" ")].filter(Boolean).join(" "), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    };
    recognition.onerror = () => {
      setListening(false);
      toast.error("O ditado foi interrompido. Você ainda pode digitar a nota.");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopDictation = () => recognitionRef.current?.stop();
  const handleSpeechConsent = (checked: boolean | "indeterminate") => {
    const consentGranted = checked === true;
    if (!consentGranted && listening) {
      // Revogar o consentimento também encerra a captura em andamento. O
      // resultado pendente é descartado para não anexar texto após a revogação.
      if (recognitionRef.current) recognitionRef.current.onresult = null;
      stopDictation();
    }
    setSpeechConsent(consentGranted);
  };
  const submit = (concluir: boolean) =>
    form.handleSubmit((values) => saveMutation.mutate({ values, concluir }))();

  // "Marcar como realizada" (cartão da visita): marca que o cliente compareceu
  // e leva às perguntas que a conclusão exige — como o cliente saiu e o
  // próximo passo. Concluir continua sendo o botão do formulário.
  const marcarRealizada = () => {
    form.setValue("desfecho", "realizada", { shouldDirty: true, shouldValidate: true });
    document.getElementById("resultado-visita")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(
      () => document.getElementById("interesse-visita")?.focus({ preventScroll: true }),
      400,
    );
  };

  // "Ditar nota da conversa" (checklist): com o consentimento já dado, começa
  // o ditado; sem ele, leva ao aceite — o ditado nunca começa sem o cliente
  // ter autorizado. Sem suporte no navegador, leva à nota para digitar.
  const ditarNota = () => {
    document.getElementById("notas-visita")?.scrollIntoView({ behavior: "smooth" });
    if (!recognitionSupported) {
      document.getElementById("nota-transcrita")?.focus({ preventScroll: true });
    } else if (!speechConsent) {
      document.getElementById("consentimento-ditado")?.focus({ preventScroll: true });
    } else {
      startDictation();
    }
  };

  const completed = execucaoQ.data?.status === "concluida";
  const naoCompareceu = form.watch("desfecho") === "nao_compareceu";
  const interesseAtual = (form.watch("interesse") || null) as InteresseVisita | null;
  /** Visitas cujo horário já passou e que seguem sem validação — sem elas o
   *  relatório de visitas fica menor do que a operação realmente fez. */
  const pendentesValidacao = useMemo(
    () => (agendaQ.data ?? []).filter((item) => isPast(new Date(item.data_fim))).length,
    [agendaQ.data],
  );
  const mapUrl = selected?.local
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.local)}`
    : null;
  const whatsappUrl = selected?.lead?.telefone
    ? buildWhatsAppUrl(
        selected.lead.telefone,
        `Olá ${selected.lead.nome.split(" ")[0]}, estou a caminho da nossa visita.`,
      )
    : null;

  return (
    <div className="pb-44 md:pb-8">
      <PageHeader
        title="Modo Visita"
        description="Em campo com o cliente: rota, briefing de 30 segundos e o resultado da visita."
        actions={
          (agendaQ.data?.length ?? 0) > 0 ? (
            <div className="w-full space-y-1.5 md:w-80">
              <Label htmlFor="visita-atual" className="text-xs text-muted-foreground">
                Visita em campo
              </Label>
              <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger id="visita-atual" className="min-h-11">
                  <SelectValue placeholder="Selecione uma visita" />
                </SelectTrigger>
                <SelectContent>
                  {agendaQ.data?.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {format(new Date(item.data_inicio), "EEE, dd/MM 'às' HH:mm", {
                        locale: ptBR,
                      })}
                      {item.lead ? ` — ${item.lead.nome}` : ""}
                      {isPast(new Date(item.data_fim)) ? " · pendente" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : undefined
        }
      />

      <AsyncBoundary
        isLoading={agendaQ.isLoading}
        isError={agendaQ.isError}
        error={agendaQ.error}
        errorTitle="Não foi possível carregar suas visitas."
        onRetry={() => void agendaQ.refetch()}
        loadingLabel="Carregando visitas"
      >
        {agendaQ.data?.length === 0 ? (
          <EmptyState
            icon={CalendarDots}
            title="Nenhuma visita nos próximos sete dias"
            description="Abra a agenda para criar ou confirmar um compromisso de visita."
            action={
              <Button asChild>
                <Link to="/agendamentos">Abrir agenda</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {pendentesOffline > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
                <FloppyDisk className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p>
                  <strong>
                    {pendentesOffline} {pendentesOffline === 1 ? "visita salva" : "visitas salvas"}{" "}
                    no aparelho
                  </strong>{" "}
                  aguardando conexão. {pendentesOffline === 1 ? "Ela sobe" : "Elas sobem"} sozinha
                  {pendentesOffline === 1 ? "" : "s"} assim que a internet voltar.
                </p>
              </div>
            )}

            {pendentesValidacao > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <ClockAfternoon
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <p>
                  <strong>
                    {pendentesValidacao}{" "}
                    {pendentesValidacao === 1 ? "visita já passou" : "visitas já passaram"}
                  </strong>{" "}
                  e {pendentesValidacao === 1 ? "continua" : "continuam"} sem validação. Enquanto
                  não forem concluídas aqui, não entram no relatório de visitas.
                </p>
              </div>
            )}

            <AsyncBoundary
              isLoading={execucaoQ.isLoading}
              isError={execucaoQ.isError}
              error={execucaoQ.error}
              errorTitle="Não foi possível carregar o progresso desta visita."
              onRetry={() => void execucaoQ.refetch()}
              loadingLabel="Carregando progresso da visita"
            >
              {selected && selected.lead ? (
                <form id="modo-visita-form" onSubmit={(event) => event.preventDefault()}>
                  {/* Identidade Lançamento (como no vídeo): a visita em navy, o
                      potencial de crédito e o checklist lado a lado; embaixo, a
                      ficha, as notas e o resultado. */}
                  <div className="grid gap-4 lg:grid-cols-3">
                    <section
                      aria-label={`Visita com ${selected.lead.nome}`}
                      className="flex flex-col rounded-2xl bg-gradient-command p-5 text-white shadow-elev-2 dark:ring-1 dark:ring-white/10"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-400">
                        {estadoDaVisita(selected, completed)} ·{" "}
                        {quandoDaVisita(selected.data_inicio)}
                      </p>
                      <h2 className="mt-2 truncate font-display text-2xl font-bold">
                        {selected.lead.nome}
                      </h2>
                      <p className="mt-1 truncate text-sm text-white/70">
                        {selected.local || "Local não informado"}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        {[selected.lead.projeto_nome, leadStatusLabel(selected.lead.status)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {selected.lead.telefone ? (
                          <Button variant="ghost" className={BOTAO_NAVY} asChild>
                            <a href={`tel:${selected.lead.telefone}`}>
                              <Phone className="mr-2 h-4 w-4" /> Ligar
                            </a>
                          </Button>
                        ) : (
                          <Button variant="ghost" className={BOTAO_NAVY} disabled>
                            <Phone className="mr-2 h-4 w-4" /> Ligar
                          </Button>
                        )}
                        {whatsappUrl ? (
                          <Button variant="ghost" className={BOTAO_NAVY} asChild>
                            <a href={whatsappUrl} target="_blank" rel="noreferrer">
                              <WhatsappLogo className="mr-2 h-4 w-4" /> WhatsApp
                            </a>
                          </Button>
                        ) : (
                          <Button variant="ghost" className={BOTAO_NAVY} disabled>
                            <WhatsappLogo className="mr-2 h-4 w-4" /> WhatsApp
                          </Button>
                        )}
                        {mapUrl ? (
                          <Button variant="ghost" className={BOTAO_NAVY} asChild>
                            <a href={mapUrl} target="_blank" rel="noreferrer">
                              <RouteIcon className="mr-2 h-4 w-4" /> Rota
                            </a>
                          </Button>
                        ) : (
                          <Button variant="ghost" className={BOTAO_NAVY} disabled>
                            <RouteIcon className="mr-2 h-4 w-4" /> Rota
                          </Button>
                        )}
                        <Button variant="ghost" className={BOTAO_NAVY} asChild>
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: selected.lead.id }}
                            search={{ tab: "documentacao" }}
                          >
                            <FileText className="mr-2 h-4 w-4" /> Documentos
                          </Link>
                        </Button>
                      </div>
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.06] p-3">
                        <p className="text-xs font-semibold text-gold-400">
                          Briefing de 30 segundos
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-white/85">
                          {briefingCurto(selected.lead)}
                        </p>
                      </div>
                      {/* Não conclui sozinho: concluir exige como o cliente saiu
                          e o próximo passo. O botão marca "compareceu" e leva
                          direto a essas perguntas. */}
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(BOTAO_NAVY, "mt-4 w-full font-semibold lg:mt-auto")}
                        onClick={marcarRealizada}
                        disabled={completed}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {completed ? "Visita concluída" : "Marcar como realizada"}
                      </Button>
                    </section>

                    <PotencialDeCreditoCard lead={selected.lead} />

                    <section
                      aria-label="Checklist da visita"
                      className="flex flex-col rounded-2xl border border-border-subtle bg-card p-5 text-card-foreground"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="font-display text-lg font-bold">Checklist da visita</h2>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {CHECKLIST.filter((item) => checklist[item.key]).length} de{" "}
                          {CHECKLIST.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1">
                        {CHECKLIST.map((item) => (
                          <Label
                            key={item.key}
                            htmlFor={`check-${item.key}`}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-[15px] font-medium hover:bg-accent"
                          >
                            <Checkbox
                              id={`check-${item.key}`}
                              checked={checklist[item.key]}
                              disabled={completed}
                              className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 data-[state=checked]:border-success data-[state=checked]:bg-success data-[state=checked]:text-success-foreground [&_svg]:h-3.5 [&_svg]:w-3.5"
                              onCheckedChange={(checked) =>
                                setChecklist((current) => ({
                                  ...current,
                                  [item.key]: checked === true,
                                }))
                              }
                            />
                            <span>{item.label}</span>
                          </Label>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 min-h-11 w-full lg:mt-auto"
                        onClick={listening ? stopDictation : ditarNota}
                        disabled={completed}
                      >
                        {listening ? (
                          <MicrophoneSlash className="mr-2 h-4 w-4" />
                        ) : (
                          <Microphone className="mr-2 h-4 w-4" />
                        )}
                        {listening ? "Parar ditado" : "Ditar nota da conversa"}
                      </Button>
                    </section>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <div className="space-y-5">
                      <BriefingVisita lead={selected.lead} />
                      <Card id="notas-visita" className="scroll-mt-24">
                        <CardHeader>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle className="text-base">Notas da conversa</CardTitle>
                            <Button
                              type="button"
                              variant={listening ? "destructive" : "outline"}
                              onClick={listening ? stopDictation : startDictation}
                              disabled={
                                !recognitionSupported || (!speechConsent && !listening) || completed
                              }
                              aria-pressed={listening}
                              title={
                                recognitionSupported
                                  ? listening
                                    ? "Parar ditado"
                                    : "Iniciar ditado"
                                  : "Ditado indisponível neste navegador"
                              }
                            >
                              {listening ? (
                                <MicrophoneSlash className="mr-2 h-4 w-4" />
                              ) : (
                                <Microphone className="mr-2 h-4 w-4" />
                              )}
                              {listening ? "Parar ditado" : "Ditar nota"}
                            </Button>
                          </div>
                          {rascunhoEm && !completed && (
                            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                              Rascunho local restaurado (
                              {format(new Date(rascunhoEm), "dd/MM 'às' HH:mm", { locale: ptBR })}).
                              Ele fica só neste aparelho até você salvar.
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground">
                            O CRM não grava nem armazena o áudio, mas o navegador pode enviá-lo ao
                            próprio provedor de reconhecimento. Use somente com autorização do
                            cliente e revise o texto antes de salvar.
                          </p>
                          <Label
                            htmlFor="consentimento-ditado"
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3"
                          >
                            <Checkbox
                              id="consentimento-ditado"
                              checked={speechConsent}
                              disabled={completed}
                              onCheckedChange={handleSpeechConsent}
                            />
                            <span>Confirmo que o cliente autorizou o ditado.</span>
                          </Label>
                          <span className="sr-only" role="status" aria-live="polite">
                            {listening ? "Ditado em andamento" : "Ditado parado"}
                          </span>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FieldError message={form.formState.errors.notaTranscrita?.message}>
                            <Label htmlFor="nota-transcrita">Nota revisada</Label>
                            <Textarea
                              id="nota-transcrita"
                              rows={7}
                              disabled={completed}
                              {...form.register("notaTranscrita")}
                              aria-invalid={Boolean(form.formState.errors.notaTranscrita)}
                            />
                          </FieldError>
                          <FieldError message={form.formState.errors.observacoes?.message}>
                            <Label htmlFor="observacoes-visita">Observações internas</Label>
                            <Textarea
                              id="observacoes-visita"
                              rows={3}
                              disabled={completed}
                              {...form.register("observacoes")}
                              aria-invalid={Boolean(form.formState.errors.observacoes)}
                            />
                          </FieldError>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-5">
                      <Card id="resultado-visita" className="scroll-mt-24">
                        <CardHeader>
                          <CardTitle className="text-base">Próximo passo</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FieldError message={form.formState.errors.desfecho?.message}>
                            <Label htmlFor="desfecho-visita">A visita aconteceu?</Label>
                            <Select
                              value={form.watch("desfecho")}
                              disabled={completed}
                              onValueChange={(value) => {
                                const desfecho = value as FormValues["desfecho"];
                                form.setValue("desfecho", desfecho, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                // Quem não apareceu não vira "visita realizada":
                                // volta para a fila de retorno, com follow-up.
                                if (desfecho === "nao_compareceu") {
                                  form.setValue("proximaEtapa", "aguardando_retorno", {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                  form.setValue(
                                    "proximaAcao",
                                    "Retomar contato e reagendar a visita",
                                    { shouldDirty: true },
                                  );
                                }
                              }}
                            >
                              <SelectTrigger id="desfecho-visita" className="min-h-11">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="realizada">Sim — cliente compareceu</SelectItem>
                                <SelectItem value="nao_compareceu">
                                  Não — cliente não compareceu
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FieldError>
                          {/* Resultado estruturado: sem estes dois campos, "por que
                              as visitas do mês não viraram venda" não tem resposta. */}
                          {!naoCompareceu && (
                            <FieldError message={form.formState.errors.interesse?.message}>
                              <Label htmlFor="interesse-visita">Como o cliente saiu?</Label>
                              <Select
                                value={form.watch("interesse")}
                                disabled={completed}
                                onValueChange={(value) =>
                                  form.setValue("interesse", value as FormValues["interesse"], {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                              >
                                <SelectTrigger id="interesse-visita" className="min-h-11">
                                  <SelectValue placeholder="Selecione o interesse" />
                                </SelectTrigger>
                                <SelectContent>
                                  {INTERESSE_VISITA.map((i) => (
                                    <SelectItem key={i} value={i}>
                                      {INTERESSE_LABEL[i]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {interesseAtual && (
                                <p className="text-xs text-muted-foreground">
                                  Sugere temperatura{" "}
                                  <strong>{temperaturaSugerida(interesseAtual)}</strong> — ajuste no
                                  lead se discordar.
                                </p>
                              )}
                            </FieldError>
                          )}

                          {!naoCompareceu && (
                            <FieldError message={form.formState.errors.objecao?.message}>
                              <Label htmlFor="objecao-visita">O que trava a decisão?</Label>
                              <Select
                                value={form.watch("objecao")}
                                disabled={completed}
                                onValueChange={(value) =>
                                  form.setValue("objecao", value as FormValues["objecao"], {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  })
                                }
                              >
                                <SelectTrigger id="objecao-visita" className="min-h-11">
                                  <SelectValue placeholder="Objeção principal" />
                                </SelectTrigger>
                                <SelectContent>
                                  {OBJECAO_VISITA.map((o) => (
                                    <SelectItem key={o} value={o}>
                                      {OBJECAO_LABEL[o]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FieldError>
                          )}

                          {/* Reagendar aqui: cliente que não veio sai com data nova,
                              não com uma intenção de remarcar. */}
                          <FieldError message={form.formState.errors.reagendarPara?.message}>
                            <Label htmlFor="reagendar-para">
                              {naoCompareceu
                                ? "Reagendar a visita"
                                : "Marcar nova visita (opcional)"}
                            </Label>
                            <Input
                              id="reagendar-para"
                              type="datetime-local"
                              disabled={completed}
                              {...form.register("reagendarPara")}
                              aria-invalid={Boolean(form.formState.errors.reagendarPara)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Preenchido, cria o novo agendamento junto com a conclusão.
                            </p>
                          </FieldError>

                          <FieldError message={form.formState.errors.proximaEtapa?.message}>
                            <Label htmlFor="proxima-etapa">Etapa ao concluir</Label>
                            <Select
                              value={form.watch("proximaEtapa")}
                              disabled={completed || naoCompareceu}
                              onValueChange={(value) =>
                                form.setValue("proximaEtapa", value as FormValues["proximaEtapa"], {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }
                            >
                              <SelectTrigger id="proxima-etapa" className="min-h-11">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="visita_realizada" disabled={naoCompareceu}>
                                  Visita realizada
                                </SelectItem>
                                <SelectItem value="aguardando_retorno">
                                  Aguardando retorno
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FieldError>
                          <FieldError message={form.formState.errors.proximaAcao?.message}>
                            <Label htmlFor="proxima-acao">Próxima ação</Label>
                            <Input
                              id="proxima-acao"
                              disabled={completed}
                              {...form.register("proximaAcao")}
                              aria-invalid={Boolean(form.formState.errors.proximaAcao)}
                            />
                          </FieldError>
                          <FieldError message={form.formState.errors.proximoFollowup?.message}>
                            <Label htmlFor="proximo-followup">Follow-up</Label>
                            <Input
                              id="proximo-followup"
                              type="datetime-local"
                              disabled={completed}
                              {...form.register("proximoFollowup")}
                              aria-invalid={Boolean(form.formState.errors.proximoFollowup)}
                            />
                          </FieldError>
                          <div className="hidden justify-end gap-2 md:flex">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => submit(false)}
                              disabled={saveMutation.isPending || completed}
                            >
                              <FloppyDisk className="mr-2 h-4 w-4" /> Salvar progresso
                            </Button>
                            <Button
                              type="button"
                              onClick={() => submit(true)}
                              disabled={saveMutation.isPending || completed}
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              {completed
                                ? "Visita concluída"
                                : naoCompareceu
                                  ? "Registrar não comparecimento"
                                  : "Concluir visita"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <StickyActionRail
                    statusMessage={
                      saveMutation.isPending
                        ? "Salvando visita"
                        : completed
                          ? "Visita concluída"
                          : undefined
                    }
                  >
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => submit(false)}
                      disabled={saveMutation.isPending || completed}
                    >
                      <FloppyDisk className="mr-1 h-4 w-4" /> Salvar
                    </Button>
                    <Button
                      type="button"
                      className="flex-[1.4]"
                      onClick={() => submit(true)}
                      disabled={saveMutation.isPending || completed}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      {completed ? "Concluída" : "Concluir"}
                    </Button>
                  </StickyActionRail>
                </form>
              ) : (
                <EmptyState
                  icon={UserCircle}
                  title="Visita sem cliente acessível"
                  description="Revise o vínculo do compromisso com o lead na agenda."
                  action={
                    <Button asChild variant="outline">
                      <Link to="/agendamentos">
                        Abrir agenda <ArrowSquareOut className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  }
                />
              )}
            </AsyncBoundary>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}

function FieldError({ children, message }: { children: React.ReactNode; message?: string }) {
  return (
    <div className="space-y-2">
      {children}
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
