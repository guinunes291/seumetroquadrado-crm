import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Mail,
  Phone,
  MapPin,
  Calendar,
  User,
  Building2,
  MessageCircle,
} from "lucide-react";
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
import { LEAD_STATUS_ORDER, LEAD_STATUS_LABEL, type StageLead } from "@/lib/leads";
import { PerdidoDialog } from "@/components/lead-stage/perdido-dialog";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
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
  observacoes: string | null;
  cpf: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean;
  campanha: string | null;
  created_at: string;
  ultima_interacao: string | null;
  proximo_followup: string | null;
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

const TIPO_OPTIONS: InteracaoTipo[] = [
  "ligacao",
  "whatsapp",
  "email",
  "sms",
  "visita",
  "reuniao",
  "nota",
  "proposta",
  "outro",
];

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const qc = useQueryClient();
  const [perdidoOpen, setPerdidoOpen] = useState(false);


  const { data: lead, isLoading } = useQuery({
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

  const { data: interacoes = [] } = useQuery({
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

  const { data: agendamentos = [] } = useQuery({
    queryKey: ["agendamentos-lead", leadId],
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

  const { data: templatesWa = [] } = useQuery({
    queryKey: ["templates-whatsapp"],
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipo, setTipo] = useState<InteracaoTipo>("ligacao");
  const [direcao, setDirecao] = useState<InteracaoDirecao>("saida");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [waTemplateId, setWaTemplateId] = useState<string>("");
  const [waMensagem, setWaMensagem] = useState("");

  const criarInteracao = useMutation({
    mutationFn: async () => {
      const conteudoTrim = conteudo.trim();
      if (conteudoTrim.length === 0) throw new Error("Descreva a interação.");
      if (conteudoTrim.length > 2000) throw new Error("Conteúdo muito longo (máx 2000).");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("interacoes").insert({
        lead_id: leadId,
        autor_id: u.user?.id ?? null,
        tipo,
        direcao,
        titulo: titulo.trim() || null,
        conteudo: conteudoTrim,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Interação registrada");
      setDialogOpen(false);
      setTitulo("");
      setConteudo("");
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarWhatsapp = useMutation({
    mutationFn: async () => {
      const msg = waMensagem.trim();
      if (msg.length === 0) throw new Error("Escreva a mensagem.");
      const url = buildWhatsAppUrl(lead?.telefone ?? "", msg);
      window.open(url, "_blank", "noopener,noreferrer");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("interacoes").insert({
        lead_id: leadId,
        autor_id: u.user?.id ?? null,
        tipo: "whatsapp",
        direcao: "saida",
        titulo: "Mensagem enviada via WhatsApp",
        conteudo: msg,
      });
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

  const atualizarStatus = useMutation({
    mutationFn: async (novo: string) => {
      if (!lead || novo === lead.status) return;
      const { error } = await supabase
        .from("leads")
        .update({ status: novo as never })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando lead…</div>;
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
          <div className="flex gap-2">
            <Dialog open={waOpen} onOpenChange={setWaOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                >
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

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> Registrar interação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova interação</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo</Label>
                      <Select value={tipo} onValueChange={(v) => setTipo(v as InteracaoTipo)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPO_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {INTERACAO_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Direção</Label>
                      <Select
                        value={direcao}
                        onValueChange={(v) => setDirecao(v as InteracaoDirecao)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada (do lead)</SelectItem>
                          <SelectItem value="saida">Saída (para o lead)</SelectItem>
                          <SelectItem value="interna">Interna</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Título (opcional)</Label>
                    <Input
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      maxLength={160}
                    />
                  </div>
                  <div>
                    <Label>
                      O que aconteceu? <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={conteudo}
                      onChange={(e) => setConteudo(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      placeholder="Resumo da conversa, próximos passos, objeções…"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => criarInteracao.mutate()}
                    disabled={criarInteracao.isPending}
                  >
                    Registrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Select
              value={lead.status}
              onValueChange={(v) => {
                if (v === "perdido") {
                  setPerdidoOpen(true);
                  return;
                }
                atualizarStatus.mutate(v);
              }}
              disabled={atualizarStatus.isPending}
            >
              <SelectTrigger className="h-8 w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lead.temperatura && <Badge variant="outline">{lead.temperatura}</Badge>}
            {perdidoOpen && (
              <PerdidoDialog
                lead={{
                  id: lead.id,
                  nome: lead.nome,
                  status: lead.status,
                  corretor_id: lead.corretor_id,
                  projeto_id: lead.projeto_id,
                  projeto_nome: lead.projeto_nome,
                  observacoes: lead.observacoes,
                } as StageLead}
                onOpenChange={setPerdidoOpen}
                onDone={() => {
                  qc.invalidateQueries({ queryKey: ["lead", leadId] });
                  qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
                }}
              />
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

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline ({interacoes.length})</TabsTrigger>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas ({tarefas.length})</TabsTrigger>
          <TabsTrigger value="agendamentos">Agendamentos ({agendamentos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          {interacoes.length === 0 ? (
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
              <DataRow icon={User} label="CPF" value={lead.cpf} />
              <DataRow icon={User} label="Entrada disponível" value={lead.entrada_disponivel} />
              <DataRow icon={User} label="Usa FGTS" value={lead.usa_fgts ? "Sim" : "Não"} />
              {lead.observacoes && (
                <div className="md:col-span-2">
                  <div className="text-xs uppercase text-muted-foreground mb-1">Observações</div>
                  <p className="whitespace-pre-wrap">{lead.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tarefas" className="mt-4">
          {tarefas.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Sem tarefas vinculadas.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 divide-y">
                {tarefas.map((t) => (
                  <div key={t.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{t.titulo}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.data_vencimento
                          ? new Date(t.data_vencimento).toLocaleString("pt-BR")
                          : "Sem prazo"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="outline">{t.status}</Badge>
                      <Badge variant="outline">{t.prioridade}</Badge>
                    </div>
                  </div>
                ))}
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
      </Tabs>
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
