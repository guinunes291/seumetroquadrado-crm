import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { SlaBadge } from "@/components/sla-badge";
import { TransferSlaBadge, useTransferTimeouts } from "@/components/transfer-sla-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Plus,
  Mail,
  Phone,
  PhoneCall,
  MapPin,
  Calendar,
  RefreshCw,
  User,
  Building2,
  Map,
  MessageCircle,
  Pencil,
  Check,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  INTERACAO_ICON,
  INTERACAO_LABEL,
  INTERACAO_TONE,
  DIRECAO_LABEL,
  describeInteracao,
  formatRelativeTime,
  type InteracaoTipo,
  type InteracaoDirecao,
} from "@/lib/interacoes";
import { buildWhatsAppUrl, renderTemplate } from "@/lib/templates";
import { maskPhoneBR, maskCPF } from "@/lib/masks";
import {
  LEAD_STATUS_LABEL,
  FUNNEL_STAGES,
  PROXIMA_ACAO,
  leadStatusLabel,
  motivoPerdaLabel,
  resolveStageAction,
  type StageLead,
  type LeadStatus,
} from "@/lib/leads";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { ResumoIA } from "@/components/resumo-ia";
import { DocumentacaoTab } from "@/components/documentacao-tab";
import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";
import { SimuladorFinanciamento } from "@/components/simulador-financiamento";
import { EmpreendimentoRecomendado } from "@/components/empreendimento-recomendado";
import { LeadObjecoes } from "@/components/lead-objecoes";
import { sugerirMensagemLeadIA } from "@/lib/lead-mensagem-ia.functions";
import { OBJETIVOS_MENSAGEM, type ObjetivoMensagem } from "@/lib/lead-mensagem";
import {
  TAREFA_TIPOS,
  TAREFA_PRIORIDADES,
  TIPO_LABEL as TAREFA_TIPO_LABEL,
  PRIORIDADE_LABEL as TAREFA_PRIORIDADE_LABEL,
  type TarefaTipo,
  type TarefaPrioridade,
} from "@/lib/tarefas";

const LEAD_TABS = [
  "timeline",
  "dados",
  "qualificacao",
  "tarefas",
  "agendamentos",
  "documentacao",
] as const;
type LeadTab = (typeof LEAD_TABS)[number];

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  // `tab` permite deep-linkar/recarregar mantendo a aba ativa (padrão: timeline).
  validateSearch: (search: Record<string, unknown>): { tab?: LeadTab } => ({
    tab: LEAD_TABS.includes(search.tab as LeadTab) ? (search.tab as LeadTab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Lead — Seu Metro Quadrado" }] }),
  component: LeadDetailPage,
});

type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  origem: string;
  status: string;
  temperatura: string | null;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  construtora: string | null;
  observacoes: string | null;
  cpf: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean;
  campanha: string | null;
  created_at: string;
  ultima_interacao: string | null;
  proximo_followup: string | null;
  desfecho: string | null;
  fase: string | null;
  visita_data: string | null;
  visita_hora: string | null;
  visita_empreendimento: string | null;
  docs_recebidos: string[] | null;
  docs_pendentes: string[] | null;
  tipo_renda: string | null;
  decisor: string | null;
  faixa_mcmv: string | null;
  // Opcional: a coluna `objecoes` chega depois da migration 20260629120000.
  objecoes?: string[] | null;
};

type Interacao = {
  id: string;
  lead_id: string;
  autor_id: string | null;
  tipo: InteracaoTipo;
  direcao: InteracaoDirecao;
  titulo: string | null;
  conteudo: string;
  ocorreu_em: string;
};

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: LeadTab = tab ?? "timeline";
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);

  const {
    data: lead,
    isLoading,
    isError: leadError,
    refetch: refetchLead,
  } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async (): Promise<Lead | null> => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return (data as Lead) ?? null;
    },
  });

  const {
    data: interacoes = [],
    isError: interacoesError,
    refetch: refetchInteracoes,
  } = useQuery({
    queryKey: ["interacoes", leadId],
    queryFn: async (): Promise<Interacao[]> => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("*")
        .eq("lead_id", leadId)
        .order("ocorreu_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Interacao[];
    },
  });

  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas-lead", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, status, data_vencimento, prioridade")
        .eq("lead_id", leadId)
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Carrega só quando a aba Agendamentos é aberta (evita fetch em toda visita).
  const { data: agendamentosData } = useQuery({
    queryKey: ["agendamentos-lead", leadId],
    enabled: activeTab === "agendamentos",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, titulo, data_inicio, status, tipo, local")
        .eq("lead_id", leadId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const agendamentos = agendamentosData ?? [];

  const [waOpen, setWaOpen] = useState(false);

  // Templates só são usados dentro do diálogo de WhatsApp — não buscar antes.
  const { data: templatesWa = [] } = useQuery({
    queryKey: ["templates-whatsapp"],
    enabled: waOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates_mensagem")
        .select("id, nome, conteudo")
        .eq("canal", "whatsapp")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [waTemplateId, setWaTemplateId] = useState<string>("");
  const [waMensagem, setWaMensagem] = useState("");
  const [waObjetivo, setWaObjetivo] = useState<ObjetivoMensagem>("primeiro_contato");
  const [waObjecao, setWaObjecao] = useState<string>("");
  const [notaRapida, setNotaRapida] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [contatoOpen, setContatoOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    cpf: "",
    renda_informada: "",
    entrada_disponivel: "",
    usa_fgts: false,
    projeto_nome: "",
    observacoes: "",
  });


  // "+ Tarefa" inline: cria uma tarefa já vinculada a este lead, sem ir até a página de Tarefas.
  const [tarefaOpen, setTarefaOpen] = useState(false);
  const [tarefaForm, setTarefaForm] = useState({
    titulo: "",
    tipo: "follow_up" as TarefaTipo,
    prioridade: "media" as TarefaPrioridade,
    data_vencimento: "",
  });

  const openEdit = () => {
    if (!lead) return;
    setEditForm({
      nome: lead.nome ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      cpf: lead.cpf ?? "",
      renda_informada: lead.renda_informada ?? "",
      entrada_disponivel: lead.entrada_disponivel ?? "",
      usa_fgts: !!lead.usa_fgts,
      projeto_nome: lead.projeto_nome ?? "",
      observacoes: lead.observacoes ?? "",
    });
    setEditOpen(true);
  };

  const editarLead = useMutation({
    mutationFn: async () => {
      const nome = editForm.nome.trim();
      if (nome.length < 2) throw new Error("Informe o nome do cliente.");
      const telefone = editForm.telefone.trim();
      if (telefone.replace(/\D/g, "").length < 8) throw new Error("Telefone inválido.");
      const email = editForm.email.trim();
      if (email && !email.includes("@")) throw new Error("E-mail inválido.");
      // Nota: `proximo_followup` é derivado das tarefas (trigger do banco) e
      // não é editável aqui — o corretor mexe criando/adiando tarefas.
      const payload = {
        nome,
        telefone,
        email: email || null,
        cpf: editForm.cpf.trim() || null,
        renda_informada: editForm.renda_informada.trim() || null,
        entrada_disponivel: editForm.entrada_disponivel.trim() || null,
        usa_fgts: editForm.usa_fgts,
        projeto_nome: editForm.projeto_nome.trim() || null,
        observacoes: editForm.observacoes.trim() || null,
      };
      const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarTarefa = useMutation({
    mutationFn: async () => {
      const titulo = tarefaForm.titulo.trim();
      if (titulo.length < 2) throw new Error("Informe o título da tarefa.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const { error } = await supabase.from("tarefas").insert({
        titulo,
        tipo: tarefaForm.tipo,
        prioridade: tarefaForm.prioridade,
        status: "pendente",
        lead_id: leadId,
        corretor_id: lead?.corretor_id ?? uid,
        criado_por: uid,
        data_vencimento: tarefaForm.data_vencimento
          ? new Date(tarefaForm.data_vencimento).toISOString()
          : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      setTarefaOpen(false);
      setTarefaForm({ titulo: "", tipo: "follow_up", prioridade: "media", data_vencimento: "" });
      qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Concluir/adiar tarefas direto da aba Tarefas — evita ir até /agendamentos
  // só para bater "feito". Mesma semântica do card do Hoje: grava data_conclusao
  // para entrar no "Concluídas hoje".
  const concluirTarefa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa concluída");
      qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const adiarTarefa = useMutation({
    mutationFn: async ({ id, ms }: { id: string; ms: number }) => {
      const novo = new Date(Date.now() + ms).toISOString();
      const { error } = await supabase
        .from("tarefas")
        .update({ data_vencimento: novo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adiada");
      qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Nota rápida: registra uma interação (nota interna) em 1 passo, sem o modal completo.
  const criarNotaRapida = useMutation({
    mutationFn: async () => {
      const txt = notaRapida.trim();
      if (txt.length === 0) throw new Error("Escreva a nota.");
      if (txt.length > 2000) throw new Error("Nota muito longa (máx 2000).");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("interacoes").insert({
        lead_id: leadId,
        autor_id: u.user?.id ?? null,
        tipo: "nota",
        direcao: "interna",
        conteudo: txt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNotaRapida("");
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // SLA do lead (mesma fonte do Kanban: view leads_com_sla). O RPC aceita
  // `_corretor` e filtra no banco — evita varrer todos os leads para 1 badge.
  const transferTimeouts = useTransferTimeouts();

  const { data: slaInfo } = useQuery({
    queryKey: ["lead-sla", leadId, lead?.corretor_id ?? null],
    enabled: !!lead,
    queryFn: async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args?: Record<string, unknown>,
        ) => Promise<{
          data: Array<{ lead_id: string; sla_minutos: number }> | null;
          error: unknown;
        }>
      )("leads_com_sla", { _corretor: lead?.corretor_id ?? null });
      if (error) throw error;
      return (data ?? []).find((r) => r.lead_id === leadId) ?? null;
    },
    staleTime: 60_000,
  });

  const enviarWhatsapp = useMutation({
    mutationFn: async () => {
      const msg = waMensagem.trim();
      if (msg.length === 0) throw new Error("Escreva a mensagem.");
      const url = buildWhatsAppUrl(lead?.telefone ?? "", msg);
      // Registra a interação ANTES de abrir o WhatsApp: se o insert falhar, o
      // histórico não fica perdido silenciosamente. O WhatsApp abre de qualquer
      // forma (o corretor não fica bloqueado), mas o erro de log é surfaceado.
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("interacoes").insert({
        lead_id: leadId,
        autor_id: u.user?.id ?? null,
        tipo: "whatsapp",
        direcao: "saida",
        titulo: "Mensagem enviada via WhatsApp",
        conteudo: msg,
      });
      window.open(url, "_blank", "noopener,noreferrer");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("WhatsApp aberto e interação registrada");
      setWaOpen(false);
      setWaMensagem("");
      setWaTemplateId("");
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sugerirMsg = useServerFn(sugerirMensagemLeadIA);
  const sugerirMensagem = useMutation({
    mutationFn: () =>
      sugerirMsg({
        data: { leadId, objetivo: waObjetivo, objecao: waObjecao.trim() || undefined },
      }),
    onSuccess: (r) => {
      setWaMensagem(r.mensagem);
      toast.success("Rascunho gerado — revise antes de enviar");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useLeadStatusMutation({
    invalidateKeys: [["lead", leadId], ["interacoes", leadId], ["leads"], ["leads-kanban"]],
    onSuccess: () => toast.success("Status atualizado"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  // Erro de rede não é "lead não encontrado": oferece tentar de novo.
  if (leadError) {
    return (
      <div>
        <Link to="/leads" className="text-sm text-primary hover:underline">
          ← Voltar para leads
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive opacity-70" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar o lead. Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchLead()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!lead) {
    return (
      <div>
        <Link to="/leads" className="text-sm text-primary hover:underline">
          ← Voltar para leads
        </Link>
        <div className="mt-4 text-muted-foreground">Lead não encontrado.</div>
      </div>
    );
  }

  // Forma mínima usada pelos modais/menu de etapa (mesma rota da lista e do Kanban).
  const stageLead: StageLead = {
    id: lead.id,
    nome: lead.nome,
    status: lead.status,
    corretor_id: lead.corretor_id,
    projeto_id: lead.projeto_id,
    projeto_nome: lead.projeto_nome,
    observacoes: lead.observacoes,
  };

  // Roteamento único de etapa: direto, modal (captura dados) ou perdido.
  const goToStage = (target: LeadStatus) => {
    if (target === lead.status) return;
    const action = resolveStageAction(target);
    if (action.kind === "perdido") setPerdidoLead(stageLead);
    else if (action.kind === "modal") setModalState({ modal: action.modal, lead: stageLead });
    else mudarStatus.mutate({ id: lead.id, status: target });
  };

  // Ação comercial sugerida para a etapa atual (botão inteligente).
  const acaoSugerida = PROXIMA_ACAO[lead.status as LeadStatus] ?? null;

  const telHref = `tel:${(lead.telefone ?? "").replace(/[^\d+]/g, "")}`;

  return (
    <div>
      <Link
        to="/leads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para leads
      </Link>

      <PageHeader
        title={lead.nome}
        description={`${lead.telefone}${lead.email ? " · " + lead.email : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={telHref}>
                <Phone className="h-4 w-4 mr-2" /> Ligar
              </a>
            </Button>
            <Button variant="outline" onClick={() => setContatoOpen(true)}>
              <PhoneCall className="h-4 w-4 mr-2" /> Registrar contato
            </Button>
            <Dialog open={waOpen} onOpenChange={setWaOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enviar WhatsApp</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div>
                    <Label>Template (opcional)</Label>
                    <Select
                      value={waTemplateId}
                      onValueChange={(v) => {
                        setWaTemplateId(v);
                        const t = templatesWa.find((x) => x.id === v);
                        if (t) {
                          setWaMensagem(
                            renderTemplate(t.conteudo, {
                              nome: lead.nome,
                              primeiro_nome: lead.nome.trim().split(/\s+/)[0] || lead.nome,
                              projeto: lead.projeto_nome ?? "",
                            }),
                          );
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            templatesWa.length === 0 ? "Nenhum template ativo" : "Escolha um modelo"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {templatesWa.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Sugerir com IA
                    </div>
                    <Select
                      value={waObjetivo}
                      onValueChange={(v) => setWaObjetivo(v as ObjetivoMensagem)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OBJETIVOS_MENSAGEM.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(lead.objecoes ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[11px] text-muted-foreground self-center">
                          Objeção:
                        </span>
                        {(lead.objecoes ?? []).map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => setWaObjecao(waObjecao === o ? "" : o)}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px]",
                              waObjecao === o
                                ? "border-primary bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-full"
                      onClick={() => sugerirMensagem.mutate()}
                      disabled={sugerirMensagem.isPending}
                    >
                      {sugerirMensagem.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Gerando…
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1 h-3.5 w-3.5" /> Gerar rascunho
                        </>
                      )}
                    </Button>
                  </div>
                  <div>
                    <Label>Mensagem</Label>
                    <Textarea
                      value={waMensagem}
                      onChange={(e) => setWaMensagem(e.target.value)}
                      rows={6}
                      maxLength={2000}
                      placeholder={`Olá ${lead.nome}, tudo bem?`}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setWaOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => enviarWhatsapp.mutate()}
                    disabled={enviarWhatsapp.isPending}
                  >
                    Abrir WhatsApp
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-2" /> Editar dados
            </Button>
          </div>
        }
      />

      {/* Faixa "Próxima melhor ação" — orienta o corretor sobre o próximo passo. */}
      <Card className="mb-6 border-primary/40 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Próxima melhor ação
            </div>
            <div className="text-sm font-medium">
              {acaoSugerida ? acaoSugerida.label : "Registrar um contato e definir o próximo passo"}
            </div>
          </div>
          <div className="flex gap-2">
            {acaoSugerida && (
              <Button
                size="sm"
                disabled={mudarStatus.isPending}
                onClick={() => goToStage(acaoSugerida.target)}
              >
                {acaoSugerida.label} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Etapas do funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FUNNEL_STAGES.map((s) => {
              const currentIdx = FUNNEL_STAGES.indexOf(lead.status as LeadStatus);
              const idx = FUNNEL_STAGES.indexOf(s);
              const isCurrent = s === lead.status;
              const isPast = currentIdx >= 0 && idx < currentIdx;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={isCurrent ? "default" : isPast ? "secondary" : "outline"}
                  className={cn("h-8", isCurrent && "ring-2 ring-primary/40")}
                  disabled={isCurrent || mudarStatus.isPending}
                  onClick={() => goToStage(s)}
                  title={LEAD_STATUS_LABEL[s]}
                >
                  {isPast && <Check className="h-3.5 w-3.5 mr-1" />}
                  {LEAD_STATUS_LABEL[s]}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:text-destructive"
              disabled={lead.status === "perdido"}
              onClick={() => setPerdidoLead(stageLead)}
            >
              Marcar como perdido
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {leadStatusLabel(lead.status)}
              </Badge>
              {lead.temperatura && <Badge variant="outline">{lead.temperatura}</Badge>}
              {slaInfo && (
                <SlaBadge
                  slaMinutos={slaInfo.sla_minutos}
                  referencia={
                    (lead as { data_distribuicao?: string | null }).data_distribuicao ??
                    lead.created_at
                  }
                />
              )}
              <TransferSlaBadge
                leadId={lead.id}
                origem={lead.origem}
                status={lead.status}
                dataDistribuicao={
                  (lead as { data_distribuicao?: string | null }).data_distribuicao ?? null
                }
                tentativas={
                  (lead as { tentativas_redistribuicao?: number | null })
                    .tentativas_redistribuicao ?? 0
                }
                timeouts={transferTimeouts}
              />
            </div>
            {lead.status === "perdido" &&
              (lead as { motivo_perda_categoria?: string | null }).motivo_perda_categoria && (
                <div className="text-xs text-muted-foreground">
                  <Badge variant="destructive" className="text-xs">
                    Perdido —{" "}
                    {motivoPerdaLabel(
                      (lead as { motivo_perda_categoria?: string | null })
                        .motivo_perda_categoria,
                    )}
                  </Badge>
                  {(lead as { motivo_perdido?: string | null }).motivo_perdido && (
                    <p className="mt-1 whitespace-pre-wrap">
                      {(lead as { motivo_perdido?: string | null }).motivo_perdido}
                    </p>
                  )}
                </div>
              )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Origem</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {lead.origem}
            {lead.campanha && (
              <div className="text-xs text-muted-foreground mt-1">{lead.campanha}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Última interação</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {lead.ultima_interacao ? formatRelativeTime(lead.ultima_interacao) : "—"}
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          navigate({ search: { tab: v === "timeline" ? undefined : (v as LeadTab) } })
        }
      >
        <TabsList>
          <TabsTrigger value="timeline">Timeline ({interacoes.length})</TabsTrigger>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="qualificacao">Qualificação</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas ({tarefas.length})</TabsTrigger>
          <TabsTrigger value="agendamentos">
            Agendamentos{agendamentosData ? ` (${agendamentos.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="documentacao">Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          {/* Briefing do lead por IA — mesmo resumo do Modo Blitz, agora no detalhe. */}
          <div className="mb-4">
            <ResumoIA leadId={leadId} />
          </div>
          {/* Nota rápida: registra em 1 passo, sem abrir o modal de interação. */}
          <Card className="mb-4">
            <CardContent className="pt-4 space-y-2">
              <Textarea
                value={notaRapida}
                onChange={(e) => setNotaRapida(e.target.value)}
                placeholder="Nota rápida (Ctrl+Enter para salvar)…"
                rows={2}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && notaRapida.trim()) {
                    e.preventDefault();
                    criarNotaRapida.mutate();
                  }
                }}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!notaRapida.trim() || criarNotaRapida.isPending}
                  onClick={() => criarNotaRapida.mutate()}
                >
                  Salvar nota
                </Button>
              </div>
            </CardContent>
          </Card>
          {interacoesError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
                <p>Não foi possível carregar a timeline.</p>
                <Button variant="outline" size="sm" onClick={() => refetchInteracoes()}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : interacoes.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma interação registrada ainda.
              </CardContent>
            </Card>
          ) : (
            <ol className="relative border-l border-border ml-4 space-y-4">
              {interacoes.map((i) => {
                const Icon = INTERACAO_ICON[i.tipo];
                return (
                  <li key={i.id} className="ml-6">
                    <span
                      className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${INTERACAO_TONE[i.tipo]}`}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="font-medium text-sm">
                            {i.titulo || describeInteracao(i.tipo, i.direcao)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(i.ocorreu_em)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mb-2">
                          <Badge variant="outline" className="text-[10px]">
                            {INTERACAO_LABEL[i.tipo]}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {DIRECAO_LABEL[i.direcao]}
                          </Badge>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{i.conteudo}</p>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-4 md:grid-cols-2 text-sm">
              <DataRow icon={User} label="Nome" value={lead.nome} />
              <DataRow icon={Phone} label="Telefone" value={lead.telefone} />
              <DataRow icon={Mail} label="E-mail" value={lead.email} />
              <DataRow icon={Building2} label="Empreendimento" value={lead.projeto_nome} />
              <DataRow
                icon={Calendar}
                label="Próximo follow-up"
                value={
                  lead.proximo_followup
                    ? new Date(lead.proximo_followup).toLocaleString("pt-BR")
                    : null
                }
              />
              <DataRow icon={MapPin} label="Renda informada" value={lead.renda_informada} />
              <DataRow icon={User} label="Tipo de renda" value={lead.tipo_renda} />
              <DataRow icon={User} label="CPF" value={lead.cpf} />
              <DataRow icon={User} label="Entrada disponível" value={lead.entrada_disponivel} />
              <DataRow icon={User} label="Usa FGTS" value={lead.usa_fgts ? "Sim" : "Não"} />
              <DataRow icon={User} label="Faixa MCMV" value={lead.faixa_mcmv} />
              <DataRow icon={User} label="Decisor" value={lead.decisor} />
              {lead.observacoes && (
                <div className="md:col-span-2">
                  <div className="text-xs uppercase text-muted-foreground mb-1">
                    Resumo / Observações
                  </div>
                  <p className="whitespace-pre-wrap">{lead.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(lead.desfecho ||
            lead.fase ||
            lead.visita_data ||
            (lead.docs_recebidos?.length ?? 0) > 0 ||
            (lead.docs_pendentes?.length ?? 0) > 0) && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Handoff do qualificador</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
                <DataRow icon={ArrowRight} label="Desfecho" value={lead.desfecho} />
                <DataRow icon={ArrowRight} label="Fase" value={lead.fase} />
                <DataRow icon={Calendar} label="Visita — data" value={lead.visita_data} />
                <DataRow icon={Calendar} label="Visita — hora" value={lead.visita_hora} />
                <DataRow
                  icon={Building2}
                  label="Visita — empreendimento"
                  value={lead.visita_empreendimento}
                />
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Docs recebidos</div>
                  {lead.docs_recebidos && lead.docs_recebidos.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {lead.docs_recebidos.map((d) => (
                        <Badge key={d} variant="secondary" className="text-[10px]">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Docs pendentes</div>
                  {lead.docs_pendentes && lead.docs_pendentes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {lead.docs_pendentes.map((d) => (
                        <Badge key={d} variant="outline" className="text-[10px]">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="qualificacao" className="mt-4 space-y-4">
          <LeadObjecoes leadId={lead.id} objecoes={lead.objecoes ?? null} />
          <SimuladorFinanciamento
            entradaInicial={lead.entrada_disponivel}
            rendaInicial={lead.renda_informada}
          />
          <Button asChild variant="outline" className="w-full justify-start">
            <Link to="/vitrine" search={{ leadId: lead.id }}>
              <Map className="mr-2 h-4 w-4" />
              Abrir Vitrine para este lead
            </Link>
          </Button>
          <EmpreendimentoRecomendado
            lead={{
              id: lead.id,
              renda_informada: lead.renda_informada,
              entrada_disponivel: lead.entrada_disponivel,
              usa_fgts: lead.usa_fgts,
              faixa_mcmv: lead.faixa_mcmv,
              projeto_nome: lead.projeto_nome,
              observacoes: lead.observacoes,
            }}
          />
        </TabsContent>

        <TabsContent value="tarefas" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setTarefaOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nova tarefa
            </Button>
          </div>
          {tarefas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Sem tarefas vinculadas.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 divide-y">
                {tarefas.map((t) => {
                  const venc = t.data_vencimento ? new Date(t.data_vencimento) : null;
                  const aberta = t.status === "pendente" || t.status === "em_andamento";
                  const atrasada = aberta && !!venc && venc.getTime() < Date.now();
                  const diasAtraso = venc
                    ? Math.floor((Date.now() - venc.getTime()) / (24 * 60 * 60 * 1000))
                    : 0;
                  return (
                    <div key={t.id} className="py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{t.titulo}</div>
                        <div
                          className={cn(
                            "text-xs text-muted-foreground",
                            atrasada && "text-destructive font-medium",
                          )}
                        >
                          {venc
                            ? atrasada
                              ? `atrasada há ${diasAtraso === 0 ? "hoje" : `${diasAtraso}d`} · ${venc.toLocaleString("pt-BR")}`
                              : venc.toLocaleString("pt-BR")
                            : "Sem prazo"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">{t.status}</Badge>
                        <Badge variant="outline">{t.prioridade}</Badge>
                        {aberta && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              disabled={concluirTarefa.isPending}
                              onClick={() => concluirTarefa.mutate(t.id)}
                            >
                              Concluir
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7">
                                  Adiar
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() =>
                                    adiarTarefa.mutate({ id: t.id, ms: 60 * 60 * 1000 })
                                  }
                                >
                                  +1 hora
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    adiarTarefa.mutate({ id: t.id, ms: 24 * 60 * 60 * 1000 })
                                  }
                                >
                                  +1 dia
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    adiarTarefa.mutate({ id: t.id, ms: 7 * 24 * 60 * 60 * 1000 })
                                  }
                                >
                                  +1 semana
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

        </TabsContent>

        <TabsContent value="agendamentos" className="mt-4">
          {agendamentos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Sem agendamentos vinculados.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 divide-y">
                {agendamentos.map((a) => (
                  <div key={a.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{a.titulo}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(a.data_inicio).toLocaleString("pt-BR")}
                        {a.local ? ` · ${a.local}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="outline">{a.tipo}</Badge>
                      <Badge variant="outline">{a.status}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documentacao" className="mt-4">
          <DocumentacaoTab
            leadId={leadId}
            lead={{
              nome: lead.nome,
              telefone: lead.telefone,
              corretor_id: lead.corretor_id,
              status: lead.status,
              projeto_id: lead.projeto_id,
              projeto_nome: lead.projeto_nome,
              construtora: lead.construtora,
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Os próprios modais invalidam lead/interações/agendamentos no onSuccess;
          fechar/cancelar não precisa refazer as queries. */}
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
      />

      <RegistrarContatoDialog
        open={contatoOpen}
        onOpenChange={setContatoOpen}
        lead={{ id: lead.id, nome: lead.nome, corretor_id: lead.corretor_id }}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar dados do cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome *</Label>
              <Input
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                maxLength={160}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                inputMode="tel"
                placeholder="(11) 98765-4321"
                value={editForm.telefone}
                onChange={(e) =>
                  setEditForm({ ...editForm, telefone: maskPhoneBR(e.target.value) })
                }
                maxLength={40}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                maxLength={160}
              />
            </div>
            <div>
              <Label>CPF</Label>
              <Input
                inputMode="numeric"
                placeholder="123.456.789-09"
                value={editForm.cpf}
                onChange={(e) => setEditForm({ ...editForm, cpf: maskCPF(e.target.value) })}
                maxLength={20}
              />
            </div>
            <div>
              <Label>Empreendimento</Label>
              <Input
                value={editForm.projeto_nome}
                onChange={(e) => setEditForm({ ...editForm, projeto_nome: e.target.value })}
                maxLength={160}
              />
            </div>
            <div>
              <Label>Renda informada</Label>
              <Input
                value={editForm.renda_informada}
                onChange={(e) => setEditForm({ ...editForm, renda_informada: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <Label>Entrada disponível</Label>
              <Input
                value={editForm.entrada_disponivel}
                onChange={(e) => setEditForm({ ...editForm, entrada_disponivel: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <Label>Próximo follow-up</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {lead.proximo_followup
                  ? new Date(lead.proximo_followup).toLocaleString("pt-BR")
                  : "—"}
                <div className="text-[11px] mt-0.5">
                  Derivado das tarefas. Crie/adie uma tarefa para alterar.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={editForm.usa_fgts}
                onCheckedChange={(v) => setEditForm({ ...editForm, usa_fgts: v })}
                id="usa-fgts"
              />
              <Label htmlFor="usa-fgts">Usa FGTS</Label>
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={editForm.observacoes}
                onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => editarLead.mutate()} disabled={editarLead.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tarefaOpen} onOpenChange={setTarefaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>
                Título <span className="text-destructive">*</span>
              </Label>
              <Input
                value={tarefaForm.titulo}
                onChange={(e) => setTarefaForm({ ...tarefaForm, titulo: e.target.value })}
                placeholder="Ex.: Ligar para retomar o atendimento"
                maxLength={160}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={tarefaForm.tipo}
                  onValueChange={(v) => setTarefaForm({ ...tarefaForm, tipo: v as TarefaTipo })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAREFA_TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TAREFA_TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select
                  value={tarefaForm.prioridade}
                  onValueChange={(v) =>
                    setTarefaForm({ ...tarefaForm, prioridade: v as TarefaPrioridade })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAREFA_PRIORIDADES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {TAREFA_PRIORIDADE_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input
                type="datetime-local"
                value={tarefaForm.data_vencimento}
                onChange={(e) => setTarefaForm({ ...tarefaForm, data_vencimento: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarefaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => criarTarefa.mutate()} disabled={criarTarefa.isPending}>
              Criar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div>{value || "—"}</div>
      </div>
    </div>
  );
}
