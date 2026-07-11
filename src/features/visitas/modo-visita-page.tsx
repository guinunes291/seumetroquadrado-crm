import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  Route as RouteIcon,
  Save,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { leadStatusLabel, type LeadStatus } from "@/lib/leads";
import { buildWhatsAppUrl } from "@/lib/templates";

const agendaLeadSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  status: z.string(),
  projeto_nome: z.string().nullable(),
  renda_informada: z.string().nullable(),
  proxima_acao: z.string().nullable(),
  proximo_followup: z.string().nullable(),
});

const agendaSchema = z.object({
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
});

const formSchema = z
  .object({
    notaTranscrita: z.string().max(5000, "A nota pode ter no máximo 5.000 caracteres."),
    observacoes: z.string().max(5000, "As observações podem ter no máximo 5.000 caracteres."),
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
    if (value.proximaEtapa === "aguardando_retorno") {
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

const CHECKLIST = [
  { key: "horario_confirmado", label: "Horário confirmado com o cliente" },
  { key: "documentos_separados", label: "Documentos necessários conferidos" },
  { key: "simulacao_revisada", label: "Simulação e condições revisadas" },
  { key: "projeto_apresentado", label: "Projeto e disponibilidade apresentados" },
  { key: "objecoes_registradas", label: "Objeções e próximos passos registrados" },
] as const;

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

export function ModoVisitaPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(CHECKLIST_INICIAL);
  const [listening, setListening] = useState(false);
  const [speechConsent, setSpeechConsent] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionSupported = useMemo(() => speechRecognitionConstructor() !== null, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      notaTranscrita: "",
      observacoes: "",
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
      const inicio = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const fim = addDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from("agendamentos")
        .select(
          "id, data_inicio, data_fim, local, titulo, status, lead_id, lead:leads(id, nome, telefone, status, projeto_nome, renda_informada, proxima_acao, proximo_followup)",
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
          "id, checklist, nota_transcrita, observacoes, status, proxima_etapa, proxima_acao, proximo_followup",
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
    setChecklist(nextChecklist);
    form.reset({
      notaTranscrita: execucao?.nota_transcrita ?? "",
      observacoes: execucao?.observacoes ?? "",
      proximaEtapa:
        execucao?.proxima_etapa === "aguardando_retorno"
          ? "aguardando_retorno"
          : "visita_realizada",
      proximaAcao: execucao?.proxima_acao ?? "Confirmar documentação e preparar a próxima proposta",
      proximoFollowup: execucao?.proximo_followup
        ? toLocalInput(new Date(execucao.proximo_followup))
        : toLocalInput(addDays(new Date(), 1)),
    });
  }, [execucaoQ.data, form, selected]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    [],
  );

  const saveMutation = useMutation({
    mutationFn: async ({ values, concluir }: { values: FormValues; concluir: boolean }) => {
      if (!selected) throw new Error("Selecione uma visita.");
      const { data, error } = await supabase.rpc("salvar_modo_visita", {
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
      });
      if (error) throw error;
      return { data: execucaoSchema.parse(data), concluir };
    },
    onSuccess: async ({ concluir }) => {
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

  const completed = execucaoQ.data?.status === "concluida";
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
        description="Agenda, rota e próximo passo em um fluxo pensado para usar em campo."
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
            icon={CalendarDays}
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
            <div className="space-y-2">
              <Label htmlFor="visita-atual">Visita em campo</Label>
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-5">
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg">{selected.lead.nome}</CardTitle>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {selected.titulo}
                              </p>
                            </div>
                            <Badge variant={completed ? "default" : "secondary"}>
                              {completed ? "Concluída" : "Em campo"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <InfoLine icon={Clock3}>
                            {format(
                              new Date(selected.data_inicio),
                              "EEEE, dd 'de' MMMM 'às' HH:mm",
                              {
                                locale: ptBR,
                              },
                            )}
                          </InfoLine>
                          <InfoLine icon={MapPin}>
                            {selected.local || "Local não informado"}
                          </InfoLine>
                          <InfoLine icon={UserRound}>
                            {leadStatusLabel(selected.lead.status)}
                            {selected.lead.projeto_nome ? ` · ${selected.lead.projeto_nome}` : ""}
                          </InfoLine>
                          {selected.lead.renda_informada && (
                            <p className="rounded-md bg-muted px-3 py-2">
                              Renda informada: {selected.lead.renda_informada}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4 lg:grid-cols-2">
                            {selected.lead.telefone ? (
                              <Button variant="outline" asChild>
                                <a href={`tel:${selected.lead.telefone}`}>
                                  <Phone className="mr-2 h-4 w-4" /> Ligar
                                </a>
                              </Button>
                            ) : (
                              <Button variant="outline" disabled>
                                <Phone className="mr-2 h-4 w-4" /> Ligar
                              </Button>
                            )}
                            {whatsappUrl ? (
                              <Button variant="outline" asChild>
                                <a href={whatsappUrl} target="_blank" rel="noreferrer">
                                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                                </a>
                              </Button>
                            ) : (
                              <Button variant="outline" disabled>
                                <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                              </Button>
                            )}
                            {mapUrl ? (
                              <Button variant="outline" asChild>
                                <a href={mapUrl} target="_blank" rel="noreferrer">
                                  <RouteIcon className="mr-2 h-4 w-4" /> Rota
                                </a>
                              </Button>
                            ) : (
                              <Button variant="outline" disabled>
                                <RouteIcon className="mr-2 h-4 w-4" /> Rota
                              </Button>
                            )}
                            <Button variant="outline" asChild>
                              <Link
                                to="/leads/$leadId"
                                params={{ leadId: selected.lead.id }}
                                search={{ tab: "documentacao" }}
                              >
                                <FileText className="mr-2 h-4 w-4" /> Documentos
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Checklist da visita</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                          {CHECKLIST.map((item) => (
                            <Label
                              key={item.key}
                              htmlFor={`check-${item.key}`}
                              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-accent"
                            >
                              <Checkbox
                                id={`check-${item.key}`}
                                checked={checklist[item.key]}
                                disabled={completed}
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
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-5">
                      <Card>
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
                                <MicOff className="mr-2 h-4 w-4" />
                              ) : (
                                <Mic className="mr-2 h-4 w-4" />
                              )}
                              {listening ? "Parar ditado" : "Ditar nota"}
                            </Button>
                          </div>
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

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Próximo passo</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FieldError message={form.formState.errors.proximaEtapa?.message}>
                            <Label htmlFor="proxima-etapa">Etapa ao concluir</Label>
                            <Select
                              value={form.watch("proximaEtapa")}
                              disabled={completed}
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
                                <SelectItem value="visita_realizada">Visita realizada</SelectItem>
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
                              <Save className="mr-2 h-4 w-4" /> Salvar progresso
                            </Button>
                            <Button
                              type="button"
                              onClick={() => submit(true)}
                              disabled={saveMutation.isPending || completed}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {completed ? "Visita concluída" : "Concluir visita"}
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
                      <Save className="mr-1 h-4 w-4" /> Salvar
                    </Button>
                    <Button
                      type="button"
                      className="flex-[1.4]"
                      onClick={() => submit(true)}
                      disabled={saveMutation.isPending || completed}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      {completed ? "Concluída" : "Concluir"}
                    </Button>
                  </StickyActionRail>
                </form>
              ) : (
                <EmptyState
                  icon={UserRound}
                  title="Visita sem cliente acessível"
                  description="Revise o vínculo do compromisso com o lead na agenda."
                  action={
                    <Button asChild variant="outline">
                      <Link to="/agendamentos">
                        Abrir agenda <ExternalLink className="ml-2 h-4 w-4" />
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

function InfoLine({ icon: Icon, children }: { icon: typeof Clock3; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>{children}</span>
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
