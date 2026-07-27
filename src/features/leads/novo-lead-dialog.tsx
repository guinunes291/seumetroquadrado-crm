// Diálogo global de "Novo lead" — extraído de leads.index.tsx (F1) sem
// mudança de comportamento. Montado uma vez no shell autenticado e aberto de
// qualquer tela pelo evento "open-novo-lead" (botão da lista, palette ⌘K).

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isValidBrazilPhone, isValidEmail } from "@/lib/validators";
import { maskPhoneBR } from "@/lib/masks";
import { origemLabel } from "@/lib/origem";

export const ORIGEM_OPTIONS = [
  "facebook",
  "google_sheets",
  "site",
  "indicacao",
  "captacao_corretor",
  "investimento_corretor",
  "whatsapp",
  "telefone",
  "plantao",
  "agendamento_self_service",
  "chatbot",
  "outro",
] as const;

// Sentinel do select "Atribuir a": Radix Select não aceita value="", então o
// item "Sem corretor (triagem manual)" usa este valor reservado.
const SEM_CORRETOR = "__sem_corretor__";

/** Abre o diálogo global de novo lead (de botões, palette ou atalho). */
// eslint-disable-next-line react-refresh/only-export-components -- helper imperativo do mesmo evento global; conviver com o componente é intencional
export function abrirNovoLead(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("open-novo-lead"));
}

/**
 * Host global: escuta "open-novo-lead" e cuida do próprio estado. O papel e o
 * usuário vêm dos hooks — nenhuma tela precisa passar contexto.
 */
export function NovoLeadDialogHost() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-novo-lead", onOpen);
    return () => window.removeEventListener("open-novo-lead", onOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && (
        <NovoLeadForm
          onClose={() => setOpen(false)}
          canManage={canManage}
          podeDistribuir={isAdmin}
          currentUserId={user?.id ?? null}
        />
      )}
    </Dialog>
  );
}

function NovoLeadForm({
  onClose,
  canManage,
  podeDistribuir,
  currentUserId,
}: {
  onClose: () => void;
  canManage: boolean;
  podeDistribuir: boolean; // distribuição via roleta é admin-only (20260720180000)
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
  // Atribuição manual: default "sem corretor" para o gestor (triagem depois).
  const [corretorId, setCorretorId] = useState<string>(SEM_CORRETOR);

  // O select "Atribuir a" vale para quem gerencia: gestor sempre; admin apenas
  // com a roleta DESMARCADA (roleta e atribuição manual são mutuamente
  // exclusivas — com a roleta ligada, quem decide é a triagem v3).
  const mostrarAtribuirA = canManage && (!podeDistribuir || !distribuirAuto);

  const { data: corretores } = useQuery({
    queryKey: ["corretores-atribuir-novo-lead"],
    enabled: mostrarAtribuirA,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        // "docs-bot" é a conta de serviço (perfil ativo para operar via API);
        // nunca atende lead, então fica fora das opções de atribuição.
        .neq("nome", "docs-bot")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

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

      // Duplicidade por e-mail: checagem client-side (best-effort, sob RLS).
      // A duplicidade por TELEFONE é decidida no servidor pela RPC abaixo,
      // com lock transacional — imune a corrida e a variações de máscara/DDI.
      const emailNorm = form.email.trim().toLowerCase();
      if (emailNorm) {
        const { data: dup, error: dupErr } = await supabase
          .from("leads")
          .select("id, nome, email")
          .ilike("email", emailNorm)
          .limit(1);
        if (dupErr) throw dupErr;
        if (dup && dup.length > 0) {
          throw new Error(`Lead duplicado: já existe "${dup[0].nome}" com este e-mail.`);
        }
      }

      const payload: Record<string, unknown> = {
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: emailNorm || null,
        origem: form.origem,
        projeto_nome: form.projeto_nome.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      // Corretor: atribui automaticamente a si mesmo e já entra como "aguardando atendimento"
      const atribuicaoManual = mostrarAtribuirA && corretorId !== SEM_CORRETOR;
      if (!canManage && currentUserId) {
        payload.corretor_id = currentUserId;
        payload.status = "aguardando_atendimento";
      } else if (atribuicaoManual) {
        // Gestor/admin escolheu um corretor: mesmo padrão da auto-atribuição
        // acima — o lead já nasce na carteira dele, aguardando atendimento.
        payload.corretor_id = corretorId;
        payload.status = "aguardando_atendimento";
      }

      // RPC já presente nos tipos gerados — chamada tipada, sem cast do client.
      const { data: criacao, error } = await supabase.rpc("criar_lead_dedup", {
        _payload: payload as Json,
      });
      if (error) throw error;
      const resultado = criacao as {
        duplicado: boolean;
        lead_id: string;
        nome?: string | null;
        na_carteira?: boolean;
      } | null;
      if (!resultado?.lead_id) throw new Error("Falha ao criar o lead. Tente novamente.");
      if (resultado.duplicado) {
        throw new Error(
          resultado.na_carteira && resultado.nome
            ? `Lead duplicado: já existe "${resultado.nome}" com este telefone.`
            : "Lead duplicado: já existe um lead com este telefone em outra carteira.",
        );
      }
      const data = { id: resultado.lead_id };

      if (podeDistribuir && distribuirAuto && data?.id) {
        // Distribuição v3: triagem única (origem → roleta → corretor apto).
        const { data: triagem } = await supabase.rpc("triar_e_distribuir_lead", {
          _lead_id: data.id,
          _gatilho: "manual_criacao",
        });
        const res = triagem as { ok?: boolean; corretor_id?: string } | null;
        return {
          id: data.id,
          corretor: res?.ok ? (res.corretor_id ?? null) : null,
          corretorNome: null as string | null,
          selfAssigned: false,
        };
      }
      return {
        id: data!.id,
        corretor: atribuicaoManual ? corretorId : null,
        // Nome para o toast — resolvido da lista já carregada no select.
        corretorNome: atribuicaoManual
          ? ((corretores ?? []).find((c) => c.id === corretorId)?.nome ?? null)
          : null,
        selfAssigned: !canManage,
      };
    },
    onSuccess: (r) => {
      toast.success(
        r.selfAssigned
          ? "Lead criado e atribuído a você"
          : r.corretorNome
            ? `Lead criado e atribuído a ${r.corretorNome}`
            : r.corretor
              ? "Lead criado e atribuído"
              : podeDistribuir && distribuirAuto
                ? "Lead criado (nenhum corretor disponível na fila)"
                : "Lead criado",
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      // Contadores e Kanban: sem estas invalidações, criar lead com o board
      // aberto deixava os números defasados até o próximo refetch.
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
      qc.invalidateQueries({ queryKey: ["pipeline-stage-v2"] });
      qc.invalidateQueries({ queryKey: ["pipeline-snapshot-v2"] });
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
              inputMode="tel"
              placeholder="(11) 98765-4321"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: maskPhoneBR(e.target.value) })}
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
                    {origemLabel(o)}
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
        {podeDistribuir && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={distribuirAuto}
              onChange={(e) => setDistribuirAuto(e.target.checked)}
            />
            Distribuir automaticamente via roleta
          </label>
        )}
        {mostrarAtribuirA ? (
          <div>
            <Label>Atribuir a</Label>
            <Select value={corretorId} onValueChange={setCorretorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CORRETOR}>Sem corretor (triagem manual)</SelectItem>
                {(corretores ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {corretorId === SEM_CORRETOR
                ? "O lead ficará sem corretor até você atribuir — ele aparece na sua lista de leads."
                : "O lead entra direto na carteira do corretor escolhido, aguardando atendimento."}
            </p>
          </div>
        ) : (
          !canManage && (
            <p className="text-xs text-muted-foreground">
              Este lead será atribuído automaticamente a você.
            </p>
          )
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          Criar lead
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
