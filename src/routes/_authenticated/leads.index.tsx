import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Search, Trash2, Shuffle, Trello, Upload } from "lucide-react";
import { ImportLeadsDialog } from "@/components/import-leads-dialog";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { isValidBrazilPhone, isValidEmail } from "@/lib/validators";
import {
  LEAD_STATUS_ORDER,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_BADGE_TONE,
  leadStatusLabel,
  resolveStageAction,
  type LeadStatus,
} from "@/lib/leads";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";
import { LeadStageMenu } from "@/components/lead-stage-menu";
import {
  LeadStageModals,
  type StageModalState,
  type PerdidoState,
} from "@/components/lead-stage/lead-stage-modals";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Leads — Seu Metro Quadrado" }] }),
  component: LeadsPage,
});

const ORIGEM_OPTIONS = [
  "facebook",
  "google_sheets",
  "site",
  "indicacao",
  "captacao_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "agendamento_self_service",
  "chatbot",
  "outro",
] as const;

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
  created_at: string;
  na_lixeira: boolean;
};

function LeadsPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const { user } = useAuth();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();

  const [modalState, setModalState] = useState<StageModalState>(null);
  const [perdidoLead, setPerdidoLead] = useState<PerdidoState>(null);
  const updateStatus = useLeadStatusMutation({ invalidateKeys: [["leads"]] });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [corretorFilter, setCorretorFilter] = useState<string>("all");
  const [showLixeira, setShowLixeira] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const corretoresMap = useMemo(() => {
    const m = new Map<string, string>();
    (corretores ?? []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [corretores]);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", { statusFilter, origemFilter, corretorFilter, showLixeira }],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select(
          "id, nome, email, telefone, origem, status, temperatura, corretor_id, projeto_id, projeto_nome, observacoes, created_at, na_lixeira",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      q = q.eq("na_lixeira", showLixeira);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as never);
      if (origemFilter !== "all") q = q.eq("origem", origemFilter as never);
      if (corretorFilter === "unassigned") q = q.is("corretor_id", null);
      else if (corretorFilter !== "all") q = q.eq("corretor_id", corretorFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  useRealtimeInvalidate("leads", [["leads"]]);



  const filtered = useMemo(() => {
    if (!leads) return [];
    if (!search.trim()) return leads;
    const s = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.nome.toLowerCase().includes(s) ||
        (l.email ?? "").toLowerCase().includes(s) ||
        l.telefone.toLowerCase().includes(s),
    );
  }, [leads, search]);

  const distribuir = useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.rpc(
        "distribuir_lead" as never,
        {
          _lead_id: leadId,
          _tipo: "manual",
        } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (corretorId) => {
      if (!corretorId) {
        toast.error("Nenhum corretor disponível na fila. Ative corretores em Distribuição.");
      } else {
        toast.success("Lead atribuído via roleta");
      }
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moverLixeira = useMutation({
    mutationFn: async ({ id, lixeira }: { id: string; lixeira: boolean }) => {
      const { error } = await supabase
        .from("leads")
        .update({
          na_lixeira: lixeira,
          data_movido_lixeira: lixeira ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.lixeira ? "Movido para lixeira" : "Restaurado");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Funil de leads, distribuição e qualificação."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/kanban">
                <Trello className="h-4 w-4 mr-1" /> Kanban
              </Link>
            </Button>
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Importar
                </Button>
                <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
              </>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-1" /> Novo lead
                </Button>
              </DialogTrigger>
              <NovoLeadDialog
                onClose={() => setCreateOpen(false)}
                canManage={canManage}
                currentUserId={user?.id ?? null}
              />
            </Dialog>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, email ou telefone…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {LEAD_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={origemFilter} onValueChange={setOrigemFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {ORIGEM_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Select value={corretorFilter} onValueChange={setCorretorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Corretor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os corretores</SelectItem>
                  <SelectItem value="unassigned">Sem corretor</SelectItem>
                  {(corretores ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {isLoading ? "Carregando…" : `${filtered.length} lead(s)`}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowLixeira(!showLixeira)}>
              {showLixeira ? "Ver ativos" : "Ver lixeira"}
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Nenhum lead encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="font-medium hover:underline"
                      >
                        {l.nome}
                      </Link>
                      {l.projeto_nome && (
                        <div className="text-xs text-muted-foreground">{l.projeto_nome}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{l.telefone}</div>
                      <div className="text-xs text-muted-foreground">{l.email ?? "—"}</div>
                    </TableCell>
                    <TableCell className="capitalize text-sm">
                      {l.origem.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                        variant="secondary"
                      >
                        {leadStatusLabel(l.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.corretor_id ? (
                        (corretoresMap.get(l.corretor_id) ?? "—")
                      ) : (
                        <span className="text-muted-foreground italic">sem corretor</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!l.na_lixeira && (canManage || l.corretor_id === user?.id) && (
                          <LeadStageMenu
                            lead={l}
                            onPickDirect={(target) =>
                              updateStatus.mutate({ id: l.id, status: target })
                            }
                            onPickModal={(modal) => setModalState({ modal, lead: l })}
                            onPickPerdido={() => setPerdidoLead(l)}
                          />
                        )}
                        {canManage && !l.corretor_id && !l.na_lixeira && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => distribuir.mutate(l.id)}
                            disabled={distribuir.isPending}
                          >
                            <Shuffle className="h-3.5 w-3.5 mr-1" /> Roleta
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              moverLixeira.mutate({ id: l.id, lixeira: !l.na_lixeira })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <LeadStageModals
        modalState={modalState}
        onModalOpenChange={(o) => !o && setModalState(null)}
        perdidoLead={perdidoLead}
        onPerdidoOpenChange={(o) => !o && setPerdidoLead(null)}
      />
    </div>
  );
}

function NovoLeadDialog({
  onClose,
  canManage,
  currentUserId,
}: {
  onClose: () => void;
  canManage: boolean;
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    origem: canManage ? "outro" : "captacao_corretor",
    projeto_nome: "",
    observacoes: "",
  });
  const [distribuirAuto, setDistribuirAuto] = useState(true);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim() || !form.telefone.trim()) {
        throw new Error("Nome e telefone são obrigatórios");
      }
      if (!isValidBrazilPhone(form.telefone)) {
        throw new Error("Telefone inválido. Informe DDD + número (ex.: 11 91234-5678).");
      }
      if (form.email.trim() && !isValidEmail(form.email)) {
        throw new Error("E-mail inválido.");
      }

      // Checagem de duplicidade por telefone (somente dígitos) e/ou e-mail
      const telDigits = form.telefone.replace(/\D/g, "");
      const emailNorm = form.email.trim().toLowerCase();
      const orFilters: string[] = [];
      if (telDigits) orFilters.push(`telefone.ilike.%${telDigits.slice(-10)}%`);
      if (emailNorm) orFilters.push(`email.ilike.${emailNorm}`);
      if (orFilters.length > 0) {
        const { data: dup, error: dupErr } = await supabase
          .from("leads")
          .select("id, nome, telefone, email, na_lixeira")
          .or(orFilters.join(","))
          .limit(1);
        if (dupErr) throw dupErr;
        if (dup && dup.length > 0) {
          const d = dup[0];
          throw new Error(
            `Lead duplicado: já existe "${d.nome}" (${d.telefone}${d.email ? " / " + d.email : ""}).`,
          );
        }
      }

      const insertPayload: Record<string, unknown> = {
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: emailNorm || null,
        origem: form.origem as never,
        projeto_nome: form.projeto_nome.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      // Corretor: atribui automaticamente a si mesmo
      if (!canManage && currentUserId) {
        insertPayload.corretor_id = currentUserId;
      }

      const { data, error } = await supabase
        .from("leads")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (error) throw error;

      if (canManage && distribuirAuto && data?.id) {
        const { data: corretor } = await supabase.rpc(
          "distribuir_lead" as never,
          {
            _lead_id: data.id,
            _tipo: "inicial",
          } as never,
        );
        return { id: data.id, corretor, selfAssigned: false };
      }
      return { id: data!.id, corretor: null, selfAssigned: !canManage };
    },
    onSuccess: (r) => {
      toast.success(
        r.selfAssigned
          ? "Lead criado e atribuído a você"
          : r.corretor
            ? "Lead criado e atribuído"
            : canManage && distribuirAuto
              ? "Lead criado (nenhum corretor disponível na fila)"
              : "Lead criado",
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>Adicione um lead manualmente.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome *</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefone *</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Origem</Label>
            <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGEM_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Projeto de interesse</Label>
            <Input
              value={form.projeto_nome}
              onChange={(e) => setForm({ ...form, projeto_nome: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        {canManage ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={distribuirAuto}
              onChange={(e) => setDistribuirAuto(e.target.checked)}
            />
            Distribuir automaticamente via roleta
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Este lead será atribuído automaticamente a você.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Salvando…" : "Criar lead"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
