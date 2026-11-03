// Venda por contrato (IA): anexa o contrato → a IA lê → o CRM acha (ou não) o
// cliente → o usuário confere os dados pessoais → abre o cadastro de venda de
// sempre (VendaEtapasDialog) JÁ PREENCHIDO. O cliente só é criado/atualizado
// e o contrato só é anexado quando ele clica em "Registrar venda".
//
// Decisões do dono (01/11/2026): botão no topo e no card, para corretor e
// gestão; busca CPF → telefone → e-mail com confirmação; cliente existente
// mostra "atual → novo" campo a campo; contrato salvo na Documentação; cliente
// novo nasce na carteira de quem anexou (a gestão escolhe o corretor) e fora da
// roleta; campo que a IA não achou fica vazio e marcado "conferir".

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle,
  CircleNotch,
  FileArrowUp,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SamiMark } from "@/components/ui/sami-mark";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { VendaEtapasDialog, type LeadOption } from "@/components/registrar-venda-dialog";
import { useCorretoresParaAtribuir } from "@/features/leads/novo-lead-queries";
import { rotuloMatch } from "@/features/leads/oportunidade";
import { lerContratoVenda } from "@/lib/contrato-venda-ia.functions";
import { validarTelefoneCliente } from "@/lib/telefone-corretor.functions";
import { DOC_MAX_BYTES, DOC_MIME_TYPES } from "@/lib/documentacao";
import {
  formatPhoneBR,
  maskCPF,
  maskCurrencyBRL,
  maskPhoneBR,
  parseCurrencyBRL,
} from "@/lib/masks";
import { onlyDigits } from "@/lib/validators";
import {
  CLIENTE_VAZIO,
  ROTULO_CAMPO,
  diferencasCliente,
  errosCliente,
  type CampoCliente,
  type DadosClienteContrato,
  type LeituraContrato,
} from "./contrato-venda";
import {
  ClienteBloqueado,
  acharClienteDoContrato,
  carregarDadosAtuais,
  finalizarVendaContrato,
  resolverClienteDaVenda,
  type ClienteAchado,
  type DecisaoCliente,
} from "./cliente-contrato";
import { EscolhaCliente, type Escolha } from "./contrato-escolha-cliente";
import { DiferencasCliente, FormularioComprador } from "./contrato-formulario";

type Etapa = "arquivo" | "lendo" | "cliente" | "venda";

export function VendaContratoDialog({
  open,
  onOpenChange,
  leadFixo,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Card do lead: o cliente já é este (a IA só confere e completa). */
  leadFixo?: LeadOption | null;
  onDone?: () => void;
}) {
  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const ler = useServerFn(lerContratoVenda);
  const validarTelefone = useServerFn(validarTelefoneCliente);
  const fileRef = useRef<HTMLInputElement>(null);
  const resolvido = useRef<{ leadId: string; corretorId: string | null } | null>(null);

  const [etapa, setEtapa] = useState<Etapa>("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [progresso, setProgresso] = useState("");
  const [leitura, setLeitura] = useState<LeituraContrato | null>(null);
  const [paginasEnviadas, setPaginasEnviadas] = useState<number[]>([]);
  const [dados, setDados] = useState<DadosClienteContrato>(CLIENTE_VAZIO);
  const [achado, setAchado] = useState<ClienteAchado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [escolha, setEscolha] = useState<Escolha>({ tipo: "pendente" });
  const [atuais, setAtuais] = useState<Record<CampoCliente, string> | null>(null);
  // "atual → novo": o padrão vem de diferencasCliente; aqui só o que o
  // usuário inverteu (desmarcou um padrão ou marcou um que vinha desmarcado).
  const [invertidos, setInvertidos] = useState<Set<CampoCliente>>(new Set());
  const [corretorNovo, setCorretorNovo] = useState<string>("");
  const [continuando, setContinuando] = useState(false);
  const [decisao, setDecisao] = useState<DecisaoCliente | null>(null);

  const { data: corretores } = useCorretoresParaAtribuir(open && gestao);

  const reset = () => {
    resolvido.current = null;
    setEtapa("arquivo");
    setArquivo(null);
    setProgresso("");
    setLeitura(null);
    setPaginasEnviadas([]);
    setDados(CLIENTE_VAZIO);
    setAchado(null);
    setEscolha({ tipo: "pendente" });
    setAtuais(null);
    setInvertidos(new Set());
    setCorretorNovo("");
    setDecisao(null);
  };

  const fechar = () => {
    reset();
    onOpenChange(false);
  };

  // ---------------------------------------------------------------- leitura
  const iniciarLeitura = async (file: File) => {
    if (!DOC_MIME_TYPES.has(file.type) || file.size < 1 || file.size > DOC_MAX_BYTES) {
      toast.error("Envie o contrato em PDF, JPG, PNG ou WebP de até 15 MB.");
      return;
    }
    resolvido.current = null;
    setArquivo(file);
    setEtapa("lendo");
    setProgresso("Abrindo o contrato…");
    let lido: LeituraContrato | null = null;
    try {
      const { prepararContrato } = await import("./extrair-contrato");
      const prep = await prepararContrato(file, (a, t) =>
        setProgresso(`Lendo o texto: página ${a} de ${t}…`),
      );
      setPaginasEnviadas(prep.paginasEnviadas);
      setProgresso("A IA está lendo os dados do comprador e da venda…");
      lido = await ler({
        data: {
          texto: prep.texto || undefined,
          imagens: prep.imagens.length > 0 ? prep.imagens : undefined,
          totalPaginas: prep.totalPaginas,
        },
      });
    } catch (e) {
      toast.warning(
        `A leitura automática falhou: ${(e as Error).message} Preencha os dados à mão — o contrato continua anexado.`,
      );
    }
    setLeitura(lido);
    const base = lido?.cliente ?? CLIENTE_VAZIO;
    setDados(base);
    if (lido) {
      lido.avisos.forEach((a) => toast.warning(a));
      toast.success(`IA preencheu ${lido.camposLidos.length} campos do cliente — confira.`);
    }
    setEtapa("cliente");
    await buscar(base);
  };

  // ------------------------------------------------------------------ busca
  const buscar = async (d: DadosClienteContrato) => {
    setEscolha({ tipo: "pendente" });
    setAtuais(null);
    setInvertidos(new Set());
    if (leadFixo) {
      // Card: o cliente é este. Só carrega o cadastro para o "atual → novo".
      setBuscando(true);
      try {
        setAtuais(await carregarDadosAtuais(leadFixo.id));
        setEscolha({
          tipo: "existente",
          leadId: leadFixo.id,
          corretorId: leadFixo.corretor_id,
          nome: leadFixo.nome,
          meu: true,
        });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBuscando(false);
      }
      return;
    }
    if (!d.cpf && !d.telefone && !d.email) {
      setAchado({ tipo: "nenhum" });
      return;
    }
    setBuscando(true);
    try {
      setAchado(await acharClienteDoContrato(d, gestao));
    } catch (e) {
      toast.error(`Não foi possível buscar o cliente: ${(e as Error).message}`);
      setAchado({ tipo: "nenhum" });
    } finally {
      setBuscando(false);
    }
  };

  const escolherExistente = async (
    leadId: string,
    corretorId: string | null,
    nome: string,
    meu: boolean,
  ) => {
    setBuscando(true);
    try {
      setAtuais(await carregarDadosAtuais(leadId));
      setInvertidos(new Set());
      setEscolha({ tipo: "existente", leadId, corretorId, nome, meu });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  // ----------------------------------------------------- "atual → novo"
  const diferencas = useMemo(
    () =>
      escolha.tipo === "existente" && atuais
        ? diferencasCliente(atuais, dados)
        : escolha.tipo === "registro_filho"
          ? diferencasCliente({}, dados).filter((d) => d.campo !== "telefone")
          : [],
    [escolha, atuais, dados],
  );
  const marcado = (campo: CampoCliente, padrao: boolean) =>
    invertidos.has(campo) ? !padrao : padrao;
  const alternar = (campo: CampoCliente) =>
    setInvertidos((s) => {
      const n = new Set(s);
      if (n.has(campo)) n.delete(campo);
      else n.add(campo);
      return n;
    });
  const camposEscolhidos = diferencas
    .filter((d) => marcado(d.campo, d.marcado))
    .map((d) => d.campo);

  const cpfDivergente =
    escolha.tipo === "existente" &&
    !!atuais?.cpf &&
    !!dados.cpf &&
    onlyDigits(atuais.cpf) !== onlyDigits(dados.cpf);

  const confirmarOportunidade = () => {
    if (achado?.tipo !== "oportunidade") return;
    const o = achado.oportunidade;
    if (o.ja_na_carteira && o.meu_lead_id) {
      void escolherExistente(o.meu_lead_id, user?.id ?? null, o.nome ?? "Cliente", true);
    } else {
      setInvertidos(new Set());
      setEscolha({ tipo: "registro_filho", clienteId: o.cliente_id, nome: o.nome ?? "Cliente" });
    }
  };

  // --------------------------------------------------------- continuar
  const bloqueado =
    achado?.tipo === "oportunidade" &&
    achado.oportunidade.bloqueado &&
    !achado.oportunidade.ja_na_carteira;

  const continuar = async () => {
    if (escolha.tipo === "pendente") {
      toast.error("Confirme o cliente encontrado ou escolha cadastrar um novo.");
      return;
    }
    const novo = escolha.tipo === "novo";
    const erros = errosCliente(dados, novo);
    if (erros.length > 0) {
      toast.error(erros[0]);
      return;
    }
    let d: DecisaoCliente;
    if (escolha.tipo === "existente") {
      if (!escolha.corretorId) {
        toast.error(
          "Este cliente ainda não tem corretor responsável. Atribua um corretor antes de registrar a venda.",
        );
        return;
      }
      d = {
        tipo: "existente",
        leadId: escolha.leadId,
        corretorId: escolha.corretorId,
        campos: camposEscolhidos,
      };
    } else if (escolha.tipo === "registro_filho") {
      d = { tipo: "registro_filho", clienteId: escolha.clienteId, campos: camposEscolhidos };
    } else {
      const corretorId = gestao ? corretorNovo : (user?.id ?? "");
      if (!corretorId) {
        toast.error("Escolha o corretor responsável pela venda.");
        return;
      }
      d = { tipo: "novo", corretorId, origem: gestao ? "outro" : "captacao_corretor" };
    }
    // Telefone que vai ser gravado passa pela checagem de "telefone de
    // corretor" (server-side, sem devolver dado pessoal), como no Novo lead.
    const gravaTelefone = d.tipo === "novo" || camposEscolhidos.includes("telefone");
    setContinuando(true);
    try {
      if (gravaTelefone && dados.telefone) {
        await validarTelefone({ data: { telefone: dados.telefone } });
      }
      setDecisao(d);
      setEtapa("venda");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setContinuando(false);
    }
  };

  // ------------------------------------------------ cadastro de venda
  const leadDaVenda: LeadOption | null = useMemo(() => {
    if (!decisao) return null;
    const corretor =
      decisao.tipo === "existente"
        ? decisao.corretorId
        : decisao.tipo === "novo"
          ? decisao.corretorId
          : (user?.id ?? null);
    return {
      id: decisao.tipo === "existente" ? decisao.leadId : "",
      nome:
        dados.nome.trim() ||
        (escolha.tipo !== "pendente" && "nome" in escolha ? escolha.nome : "Cliente"),
      telefone: dados.telefone || null,
      email: dados.email || null,
      corretor_id: corretor,
      projeto_id: null,
      projeto_nome: null,
      status: leadFixo?.status ?? "aguardando_atendimento",
    };
  }, [decisao, dados, escolha, user?.id, leadFixo?.status]);

  const resolverLead = async (): Promise<LeadOption> => {
    if (!decisao || !leadDaVenda) throw new Error("Confira o cliente antes de registrar a venda.");
    // Nova tentativa depois de a venda falhar (ex.: previsão inválida no
    // banco): o cliente já foi criado/atualizado — reusa, senão o segundo
    // clique acusaria "telefone duplicado" do próprio cliente recém-criado.
    if (resolvido.current) {
      return {
        ...leadDaVenda,
        id: resolvido.current.leadId,
        corretor_id: resolvido.current.corretorId,
      };
    }
    try {
      const r = await resolverClienteDaVenda(decisao, dados);
      resolvido.current = { leadId: r.leadId, corretorId: r.corretorId };
      return { ...leadDaVenda, id: r.leadId, corretor_id: r.corretorId };
    } catch (e) {
      if (e instanceof ClienteBloqueado) throw new Error(e.message);
      throw e;
    }
  };

  const aposRegistrar = ({ vendaId, leadId }: { vendaId: string; leadId: string }) =>
    finalizarVendaContrato({
      vendaId,
      leadId,
      corretorId: resolvido.current?.corretorId ?? null,
      arquivo,
      leitura,
      dados,
      paginasEnviadas,
    });

  // Cada abertura começa do zero (o diálogo do topo fica montado).
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  if (etapa === "venda" && decisao && leadDaVenda) {
    return (
      <VendaEtapasDialog
        open={open}
        setOpen={(o) => {
          if (!o) fechar();
        }}
        leadFixo={leadDaVenda}
        prefill={
          leitura
            ? { ...leitura.venda, observacoes: null }
            : {
                construtora: null,
                empreendimento: null,
                unidade: null,
                valorVenda: null,
                dataAssinatura: null,
              }
        }
        resolverLead={resolverLead}
        onRegistrada={aposRegistrar}
        onDone={onDone}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) fechar();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SamiMark className="h-5 w-5" />
            Venda por contrato
          </DialogTitle>
          <DialogDescription>
            {etapa === "cliente"
              ? "Confira os dados do cliente. Nada é gravado até você registrar a venda."
              : "Anexe o contrato de compra e venda. A IA lê os dados do comprador e da venda e o cadastro já abre preenchido."}
          </DialogDescription>
        </DialogHeader>

        {etapa === "arquivo" && (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void iniciarLeitura(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void iniciarLeitura(f);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center hover:bg-muted/50"
            >
              <FileArrowUp className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium">Escolher ou arrastar o contrato</span>
              <span className="text-xs text-muted-foreground">
                PDF (inclusive o contrato completo de 100 páginas) ou foto, até 15 MB.
              </span>
            </button>
            {leadFixo && (
              <p className="text-xs text-muted-foreground">
                Cliente: <span className="font-medium text-foreground">{leadFixo.nome}</span>. O
                contrato completa o cadastro dele.
              </p>
            )}
          </div>
        )}

        {etapa === "lendo" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CircleNotch className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">{progresso}</p>
            {arquivo && <p className="text-xs text-muted-foreground">{arquivo.name}</p>}
          </div>
        )}

        {etapa === "cliente" && (
          <div className="space-y-5">
            {leitura?.observacoes && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <span className="font-medium">Observação da IA: </span>
                {leitura.observacoes}
              </p>
            )}

            <EscolhaCliente
              buscando={buscando}
              leadFixo={!!leadFixo}
              achado={achado}
              escolha={escolha}
              bloqueado={bloqueado}
              cpfDivergente={cpfDivergente}
              gestao={gestao}
              corretores={corretores}
              corretorNovo={corretorNovo}
              setCorretorNovo={setCorretorNovo}
              onNovo={() => setEscolha({ tipo: "novo" })}
              onConfirmarOportunidade={confirmarOportunidade}
              onEscolherCandidato={(l) =>
                void escolherExistente(l.id, l.corretor_id, l.nome, false)
              }
              onTrocar={() => {
                setEscolha({ tipo: "pendente" });
                setAtuais(null);
              }}
            />

            <DiferencasCliente
              diferencas={diferencas}
              marcado={marcado}
              alternar={alternar}
              registroFilho={escolha.tipo === "registro_filho"}
            />

            {/* --------------------------------------- formulário */}
            <FormularioComprador
              dados={dados}
              setDados={setDados}
              leitura={leitura}
              acao={
                !leadFixo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={buscando}
                    onClick={() => void buscar(dados)}
                  >
                    <MagnifyingGlass className="mr-1.5 h-4 w-4" />
                    Buscar de novo
                  </Button>
                )
              }
            />
          </div>
        )}

        {etapa === "cliente" && (
          <DialogFooter>
            <Button variant="ghost" onClick={reset}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Outro arquivo
            </Button>
            <Button
              onClick={() => void continuar()}
              disabled={continuando || buscando || bloqueado}
            >
              {continuando ? "Conferindo…" : "Continuar para a venda"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
