// Diálogo global de "Novo lead" — extraído de leads.index.tsx (F1). Montado
// uma vez no shell autenticado e aberto de qualquer tela pelo evento
// "open-novo-lead" (botão da lista, palette ⌘K).
//
// Corretor: duas etapas. A primeira é SEMPRE a busca por telefone, e-mail ou
// CPF (registro mãe, docs/ops/registro-mae.md): achou, cria o registro filho
// dele; não achou, segue para o cadastro, que vira o cadastro mãe do cliente.
// Gestão e SDR abrem direto no cadastro (a busca e o registro filho são do
// corretor no banco).

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
import { isValidBrazilPhone, isValidCPF, isValidEmail } from "@/lib/validators";
import { maskCPF, maskPhoneBR } from "@/lib/masks";
import { origemLabel } from "@/lib/origem";
import { ZONAS_REGIAO } from "@/lib/zonas";
import { BuscarOportunidade, type ClienteEncontrado } from "@/features/leads/buscar-oportunidade";
import {
  buscarOportunidade,
  errosDaBusca,
  type BuscaCliente,
  type ErrosBusca,
} from "@/features/leads/oportunidade";

/** O telefone já existe na carteira de outro corretor: em vez de erro, o
 *  corretor volta ao "Buscar oportunidade" para criar o registro dele. */
class DuplicadoEmOutraCarteira extends Error {
  constructor() {
    super("Este cliente já existe no CRM.");
  }
}

/** A conferência final do cadastro achou o cliente (o corretor mudou telefone,
 *  e-mail ou CPF depois da busca): volta para a busca, com o resultado. */
class ClienteJaCadastrado extends Error {
  constructor(readonly resultado: ClienteEncontrado) {
    super("Este cliente já tem cadastro no CRM.");
  }
}

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
  "impulso_smq",
  "acao_rua",
  "portal",
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
  const { isAdmin, isGestor, isCorretor, isSdr } = useUserRoles();
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
          // Registro mãe: buscar oportunidade é do corretor (o banco recusa
          // os demais papéis).
          mostrarOportunidade={isCorretor && !canManage && !isSdr}
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
  mostrarOportunidade = false,
}: {
  onClose: () => void;
  canManage: boolean;
  podeDistribuir: boolean; // distribuição via roleta é admin-only (20260720180000)
  currentUserId: string | null;
  mostrarOportunidade?: boolean;
}) {
  const qc = useQueryClient();
  // Corretor começa SEMPRE pela busca; os outros papéis, direto no cadastro.
  // Derivado (não o valor inicial do useState): os papéis chegam depois do
  // login, e o ⌘K logo na entrada abriria o corretor preso no cadastro.
  const [etapaCorretor, setEtapa] = useState<"busca" | "cadastro">("busca");
  const etapa = mostrarOportunidade ? etapaCorretor : "cadastro";
  const [errosBusca, setErrosBusca] = useState<ErrosBusca>({});
  const [encontrado, setEncontrado] = useState<ClienteEncontrado | null>(null);
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    // Só no fluxo do corretor: vem da busca e vai para o cadastro mãe.
    cpf: "",
    origem: canManage ? "outro" : "captacao_corretor",
    projeto_nome: "",
    bairro: "",
    zona: "",
    observacoes: "",
    // Descrição livre da ação de rua (ex.: "Motoboy") — opcional, entra nas
    // observações do lead.
    acao_rua: "",
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

  const identidade: BuscaCliente = { telefone: form.telefone, email: form.email, cpf: form.cpf };

  // Primeira tela do corretor. "duplicado": o cadastro acusou o telefone em
  // outra carteira e a busca roda sozinha para mostrar o cliente.
  const busca = useMutation({
    mutationFn: (v: { b: BuscaCliente; motivo: "busca" | "duplicado" }) => buscarOportunidade(v.b),
    onSuccess: (r, v) => {
      if (r.encontrado) {
        setEncontrado(r);
        return;
      }
      if (v.motivo === "duplicado") {
        // O banco vê o telefone em outra carteira, mas a busca não acha a
        // mãe: voltar ao cadastro só repetiria o erro.
        toast.error("Este telefone já está na carteira de outro corretor. Fale com a gestão.");
        return;
      }
      setEtapa("cadastro");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function buscar() {
    const erros = errosDaBusca(identidade);
    setErrosBusca(erros);
    setEncontrado(null);
    if (Object.keys(erros).length === 0) busca.mutate({ b: identidade, motivo: "busca" });
  }

  function mudarBusca(campo: keyof BuscaCliente, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    // Resultado e erros são do que estava digitado: mudou, some.
    setEncontrado(null);
    setErrosBusca({});
  }

  function voltarParaBusca() {
    setEncontrado(null);
    setErrosBusca({});
    setEtapa("busca");
  }

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
      const cpf = mostrarOportunidade ? form.cpf.trim() : "";
      if (cpf && !isValidCPF(cpf)) {
        throw new Error("CPF inválido: confira os 11 dígitos.");
      }

      // Conferência final do corretor: telefone, e-mail ou CPF podem ter
      // mudado depois da busca. Só nasce cadastro mãe novo se ninguém casa.
      if (mostrarOportunidade) {
        const achado = await buscarOportunidade(identidade);
        if (achado.encontrado) throw new ClienteJaCadastrado(achado);
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

      // Ação de rua: a descrição é opcional e entra como observação, no topo,
      // sem substituir o que o corretor escreveu.
      const acaoRua = form.origem === "acao_rua" ? form.acao_rua.trim() : "";
      const observacoes = [acaoRua ? `Ação de rua: ${acaoRua}` : "", form.observacoes.trim()]
        .filter(Boolean)
        .join("\n");

      const payload: Record<string, unknown> = {
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: emailNorm || null,
        origem: form.origem,
        projeto_nome: form.projeto_nome.trim() || null,
        // Filas por zona: zona explícita manda; sem ela, o trigger do banco
        // resolve pelo bairro (tabela zonas_bairros) ou pelo projeto.
        bairro: form.bairro.trim() || null,
        zona: form.zona || null,
        observacoes: observacoes || null,
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
        /** SDR: o lead já existia e entrou na base de pré-venda (RPC decide). */
        sdr_pegou?: boolean;
        /** SDR: lead existe mas está de agendado para frente — só gestão move. */
        bloqueado_etapa?: boolean;
      } | null;
      if (!resultado?.lead_id) throw new Error("Falha ao criar o lead. Tente novamente.");
      if (resultado.duplicado && resultado.sdr_pegou) {
        return {
          id: resultado.lead_id,
          corretor: null,
          corretorNome: resultado.nome ?? null,
          selfAssigned: false,
          sdrPegou: true,
          cpfPendente: false,
        };
      }
      if (resultado.duplicado && resultado.bloqueado_etapa) {
        throw new Error(
          `"${resultado.nome ?? "Este cliente"}" já existe e está em etapa avançada (agendamento em diante, venda ou perdido). Só a gestão pode mover — peça ao seu gestor.`,
        );
      }
      if (resultado.duplicado && mostrarOportunidade && !resultado.na_carteira) {
        throw new DuplicadoEmOutraCarteira();
      }
      if (resultado.duplicado) {
        throw new Error(
          resultado.na_carteira && resultado.nome
            ? `Lead duplicado: já existe "${resultado.nome}" com este telefone.`
            : "Lead duplicado: já existe um lead com este telefone em outra carteira.",
        );
      }
      const data = { id: resultado.lead_id };

      // CPF da busca: o criar_lead_dedup não recebe CPF, então ele entra logo
      // depois, pelo mesmo caminho do "Editar dados" — e o gatilho do
      // registro mãe o leva para a mãe (é o que a busca por CPF encontra).
      // Falhar aqui não desfaz o lead: o corretor completa na ficha.
      let cpfPendente = false;
      if (cpf) {
        const { error: cpfErr } = await supabase
          .from("leads")
          .update({ cpf: maskCPF(cpf) })
          .eq("id", data.id);
        cpfPendente = !!cpfErr;
      }

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
          sdrPegou: false,
          cpfPendente,
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
        sdrPegou: false,
        cpfPendente,
      };
    },
    onSuccess: (r) => {
      if (r.sdrPegou) qc.invalidateQueries({ queryKey: ["sdr:base"] });
      if (r.cpfPendente) {
        toast.warning("Lead criado, mas o CPF não foi salvo: preencha em “Editar dados”.");
      }
      toast.success(
        r.sdrPegou
          ? `Este cliente já existia no CRM${r.corretorNome ? ` ("${r.corretorNome}")` : ""}: entrou na sua base de pré-venda`
          : r.selfAssigned
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
    onError: (e: Error) => {
      if (e instanceof ClienteJaCadastrado) {
        setErrosBusca({});
        setEncontrado(e.resultado);
        setEtapa("busca");
        toast.info("Este cliente já tem cadastro no CRM: veja o resultado da busca.");
        return;
      }
      if (e instanceof DuplicadoEmOutraCarteira) {
        setErrosBusca({});
        setEncontrado(null);
        setEtapa("busca");
        busca.mutate({ b: identidade, motivo: "duplicado" });
        return;
      }
      toast.error(e.message);
    },
  });

  if (etapa === "busca") {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>
            Primeiro passo: veja se o cliente já tem cadastro no CRM.
          </DialogDescription>
        </DialogHeader>
        <BuscarOportunidade
          valores={identidade}
          onChange={mudarBusca}
          onBuscar={buscar}
          erros={errosBusca}
          resultado={encontrado}
          onCriado={onClose}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {/* Com um resultado na tela, a ação é a dele (criar o registro, abrir
              o lead). Mudar um campo apaga o resultado e o botão volta. */}
          {!encontrado && (
            <Button onClick={buscar} loading={busca.isPending}>
              Buscar cliente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>
          {mostrarOportunidade
            ? "Cliente novo no CRM: preencha o cadastro."
            : "Adicione um lead manualmente."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {mostrarOportunidade && (
          <div
            role="status"
            className="rounded-lg border border-border-subtle bg-muted/30 p-3 text-sm"
            data-testid="cadastro-mae"
          >
            Nenhum cadastro no CRM com esses dados. <b>Este será o cadastro mãe do cliente.</b>{" "}
            <button type="button" className="underline" onClick={voltarParaBusca}>
              Voltar à busca
            </button>
          </div>
        )}
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
        {mostrarOportunidade && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })}
              />
            </div>
          </div>
        )}
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
        {form.origem === "acao_rua" && (
          <div>
            <Label>Qual ação de rua?</Label>
            <Input
              placeholder="Ex.: Motoboy"
              maxLength={255}
              value={form.acao_rua}
              onChange={(e) => setForm({ ...form, acao_rua: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Opcional — entra nas observações do cliente.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Bairro de interesse</Label>
            <Input
              placeholder="Ex.: Tucuruvi"
              value={form.bairro}
              onChange={(e) => setForm({ ...form, bairro: e.target.value })}
            />
          </div>
          <div>
            <Label>Zona</Label>
            <Select
              value={form.zona || "auto"}
              onValueChange={(v) => setForm({ ...form, zona: v === "auto" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automática (bairro/projeto)</SelectItem>
                {ZONAS_REGIAO.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
