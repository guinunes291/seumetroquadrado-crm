// Diálogo global de "Novo lead" — extraído de leads.index.tsx (F1). Montado
// uma vez no shell autenticado e aberto de qualquer tela pelo evento
// "open-novo-lead" (botão da lista, palette ⌘K).
//
// Corretor: duas etapas. A primeira é SEMPRE a busca por telefone, e-mail ou
// CPF (registro mãe, docs/ops/registro-mae.md): achou, cria o registro filho
// dele; não achou, segue para o cadastro, que vira o cadastro mãe do cliente.
// Gestão e SDR abrem direto no cadastro (a busca e o registro filho são do
// corretor no banco).

//
// Desde a quebra em módulos (2026-10): regras da criação em
// novo-lead-criacao.ts, acesso a dados em novo-lead-queries.ts e a etapa de
// cadastro em novo-lead-cadastro.tsx.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { validarTelefoneCliente } from "@/lib/telefone-corretor.functions";
import { BuscarOportunidade, type ClienteEncontrado } from "@/features/leads/buscar-oportunidade";
import {
  buscarOportunidade,
  errosDaBusca,
  type BuscaCliente,
  type ErrosBusca,
} from "@/features/leads/oportunidade";
import { CadastroNovoLead } from "./novo-lead-cadastro";
import {
  ClienteJaCadastrado,
  criarNovoLead,
  DuplicadoEmOutraCarteira,
  SEM_CORRETOR,
  type FormNovoLead,
} from "./novo-lead-criacao";
import { useCorretoresParaAtribuir } from "./novo-lead-queries";

export { ORIGEM_OPTIONS } from "./novo-lead-criacao";

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
  const validarTelefone = useServerFn(validarTelefoneCliente);
  // Corretor começa SEMPRE pela busca; os outros papéis, direto no cadastro.
  // Derivado (não o valor inicial do useState): os papéis chegam depois do
  // login, e o ⌘K logo na entrada abriria o corretor preso no cadastro.
  const [etapaCorretor, setEtapa] = useState<"busca" | "cadastro">("busca");
  const etapa = mostrarOportunidade ? etapaCorretor : "cadastro";
  const [errosBusca, setErrosBusca] = useState<ErrosBusca>({});
  const [encontrado, setEncontrado] = useState<ClienteEncontrado | null>(null);
  const [form, setForm] = useState<FormNovoLead>({
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

  const { data: corretores } = useCorretoresParaAtribuir(mostrarAtribuirA);

  const identidade: BuscaCliente = { telefone: form.telefone, email: form.email, cpf: form.cpf };

  // Primeira tela do corretor. "duplicado": o cadastro acusou o telefone em
  // outra carteira e a busca roda sozinha para mostrar o cliente.
  const busca = useMutation({
    mutationFn: async (v: { b: BuscaCliente; motivo: "busca" | "duplicado" }) => {
      if (v.b.telefone.trim()) await validarTelefone({ data: { telefone: v.b.telefone } });
      return buscarOportunidade(v.b);
    },
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
    mutationFn: () =>
      criarNovoLead({
        form,
        identidade,
        mostrarOportunidade,
        mostrarAtribuirA,
        corretorId,
        canManage,
        currentUserId,
        podeDistribuir,
        distribuirAuto,
        corretores,
        validarTelefone,
      }),
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
    <CadastroNovoLead
      form={form}
      setForm={setForm}
      mostrarOportunidade={mostrarOportunidade}
      voltarParaBusca={voltarParaBusca}
      podeDistribuir={podeDistribuir}
      distribuirAuto={distribuirAuto}
      setDistribuirAuto={setDistribuirAuto}
      mostrarAtribuirA={mostrarAtribuirA}
      corretorId={corretorId}
      setCorretorId={setCorretorId}
      corretores={corretores}
      canManage={canManage}
      onClose={onClose}
      create={create}
    />
  );
}
