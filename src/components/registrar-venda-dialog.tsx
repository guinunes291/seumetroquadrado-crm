import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CurrencyDollar, MagnifyingGlass } from "@phosphor-icons/react";
import {
  maskCPF,
  maskCurrencyBRL,
  maskPhoneBR,
  parseCurrencyBRL,
  formatPhoneBR,
} from "@/lib/masks";
import { isValidBrazilPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";
import { mesmaConstrutoraExata, chaveConstrutora } from "@/lib/construtoras";
import { slugify } from "@/lib/projetos";
import { useConstrutorasParceiras } from "@/features/projetos/use-construtoras-parceiras";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { celebrate } from "@/components/ui/celebration";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComissaoSplitFields } from "@/components/comissao-split-fields";
import { EFETIVACAO_INICIAL, EfetivacaoFlagsField } from "@/components/efetivacao-flags-field";
import { parseSplit, type SplitTexto } from "@/lib/comissoes";
import { validarVenda, registrarVenda, type EfetivacaoVenda } from "@/lib/vendas";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useTierNoSplit } from "@/lib/comissao-tier";

const hoje = () => new Date().toISOString().slice(0, 10);

export type LeadOption = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  status: string;
};

type ProjetoOpcao = { id: string; nome: string; construtora: string | null };

type Etapa = 1 | 2 | 3 | 4;

const CAMPOS_LEAD = "id, nome, telefone, email, corretor_id, projeto_id, projeto_nome, status";

/**
 * Botão global "Registrar venda", em etapas:
 * 1) achar o cliente pelo telefone, e-mail ou CPF;
 * 2) escolher a construtora;
 * 3) escolher o produto (ou cadastrar um novo);
 * 4) demais campos da venda. Envia para aprovação da gestão, como o
 * ContractSaleDialog.
 */
export function VendaEtapasDialog({
  open,
  setOpen,
  leadFixo,
  onDone,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  /** Lead já escolhido (ex.: card da lista/Kanban): pula a etapa 1. */
  leadFixo?: LeadOption | null;
  onDone?: () => void;
}) {
  const etapaInicial: Etapa = leadFixo ? 2 : 1;
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isGestor, isSuperintendente } = useUserRoles();
  const podeVerTodos = isAdmin || isGestor || isSuperintendente;
  const podeCriarProjeto = isAdmin || isGestor;

  const [etapa, setEtapa] = useState<Etapa>(etapaInicial);

  // Etapa 1 — busca do cliente
  const [buscaTel, setBuscaTel] = useState("");
  const [buscaEmail, setBuscaEmail] = useState("");
  const [buscaCpf, setBuscaCpf] = useState("");
  const [resultados, setResultados] = useState<LeadOption[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [lead, setLead] = useState<LeadOption | null>(leadFixo ?? null);

  // Etapa 2 — construtora
  const [construtora, setConstrutora] = useState("");
  const [filtroConstrutora, setFiltroConstrutora] = useState("");

  // Etapa 3 — produto
  const [projeto, setProjeto] = useState<ProjetoOpcao | null>(null);
  const [projetoManual, setProjetoManual] = useState(""); // produto sem cadastro
  const [filtroProjeto, setFiltroProjeto] = useState("");
  const [criandoProjeto, setCriandoProjeto] = useState(false);
  const [novoProjetoNome, setNovoProjetoNome] = useState("");

  // Etapa 4
  const [valor, setValor] = useState("");
  const [dataAssinatura, setDataAssinatura] = useState(hoje());
  const [unidade, setUnidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [previsaoRecebimento, setPrevisaoRecebimento] = useState("");
  const [efetivacao, setEfetivacao] = useState<EfetivacaoVenda>(EFETIVACAO_INICIAL);
  const [percentuais, setPercentuais] = useState<SplitTexto>({
    total: "3.50",
    corretor: "1.85",
    gerente: "0.50",
    superintendente: "0.30",
  });

  const tierSplit = useTierNoSplit({
    leadId: lead?.id,
    corretorId: lead?.corretor_id ?? user?.id,
    data: dataAssinatura,
    percentuais,
    setPercentuais,
    gestao: podeVerTodos,
  });

  const reset = () => {
    setEtapa(etapaInicial);
    setBuscaTel("");
    setBuscaEmail("");
    setBuscaCpf("");
    setResultados(null);
    setLead(leadFixo ?? null);
    setConstrutora("");
    setFiltroConstrutora("");
    setProjeto(null);
    setProjetoManual("");
    setFiltroProjeto("");
    setCriandoProjeto(false);
    setNovoProjetoNome("");
    setValor("");
    setDataAssinatura(hoje());
    setUnidade("");
    setObservacoes("");
    setEfetivacao(EFETIVACAO_INICIAL);
  };

  // Só projetos ativos entram numa nova venda (mesma regra de
  // fetchProjetosParaSelecao), agora com a construtora para o filtro.
  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-select-construtora"],
    enabled: open,
    queryFn: async (): Promise<ProjetoOpcao[]> => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, construtora")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: parceirasRes } = useConstrutorasParceiras();

  /** Construtoras: parceiras primeiro (ordem da gestão), depois as dos projetos. */
  const construtoras = useMemo(() => {
    const vistos = new Set<string>();
    const lista: string[] = [];
    const add = (n: string | null | undefined) => {
      const nome = (n ?? "").trim();
      const k = chaveConstrutora(nome);
      if (!k || vistos.has(k)) return;
      // Variações de nome da mesma parceira ("Cury Construtora") não duplicam.
      if (lista.some((x) => mesmaConstrutoraExata(nome, x))) return;
      vistos.add(k);
      lista.push(nome);
    };
    (parceirasRes?.parceiras ?? []).filter((p) => p.ativo).forEach((p) => add(p.nome));
    const resto = projetos
      .map((p) => p.construtora)
      .filter((c): c is string => !!c?.trim())
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    resto.forEach(add);
    return lista;
  }, [parceirasRes, projetos]);

  const construtorasFiltradas = useMemo(() => {
    const f = chaveConstrutora(filtroConstrutora);
    return f ? construtoras.filter((c) => chaveConstrutora(c).includes(f)) : construtoras;
  }, [construtoras, filtroConstrutora]);

  const projetosDaConstrutora = useMemo(() => {
    const f = chaveConstrutora(filtroProjeto);
    return projetos
      .filter((p) => mesmaConstrutoraExata(p.construtora, construtora))
      .filter((p) => !f || chaveConstrutora(p.nome).includes(f));
  }, [projetos, construtora, filtroProjeto]);

  const buscarCliente = async () => {
    const tel = onlyDigits(buscaTel);
    const mail = buscaEmail.trim().toLowerCase();
    const cpf = onlyDigits(buscaCpf);
    if (!tel && !mail && !cpf) {
      toast.error("Preencha o telefone, o e-mail ou o CPF do cliente.");
      return;
    }
    if (tel && !isValidBrazilPhone(tel))
      return void toast.error("Telefone inválido: DDD + número.");
    if (mail && !isValidEmail(mail)) return void toast.error("E-mail inválido.");
    if (cpf && !isValidCPF(cpf)) return void toast.error("CPF inválido.");

    setBuscando(true);
    try {
      const base = () => {
        let q = supabase.from("leads").select(CAMPOS_LEAD).is("deleted_at", null).limit(50);
        if (!podeVerTodos && user?.id) q = q.eq("corretor_id", user.id);
        return q;
      };
      const achados = new Map<string, LeadOption>();
      if (tel) {
        const fim = tel.slice(-8);
        // Telefone é salvo com ou sem máscara: busca pelos 4 finais e confere os 8.
        const { data, error } = await base().ilike("telefone", `%${fim.slice(-4)}%`);
        if (error) throw error;
        (data ?? [])
          .filter((l) => onlyDigits(l.telefone).endsWith(fim))
          .forEach((l) => achados.set(l.id, l as LeadOption));
      }
      if (mail) {
        const { data, error } = await base().ilike("email", mail);
        if (error) throw error;
        (data ?? []).forEach((l) => achados.set(l.id, l as LeadOption));
      }
      if (cpf) {
        const { data, error } = await base().in("cpf", [cpf, maskCPF(cpf)]);
        if (error) throw error;
        (data ?? []).forEach((l) => achados.set(l.id, l as LeadOption));
      }
      setResultados([...achados.values()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  const escolherLead = (l: LeadOption) => {
    setLead(l);
    // Se o lead já tem um produto com construtora, já sugere os dois.
    const atual = projetos.find((p) => p.id === l.projeto_id);
    if (atual?.construtora) {
      setConstrutora(
        construtoras.find((c) => mesmaConstrutoraExata(atual.construtora, c)) ?? atual.construtora,
      );
      setProjeto(atual);
    }
    setEtapa(2);
  };

  // Lead vindo do card: sugere a construtora e o produto que ele já tem.
  useEffect(() => {
    if (!open || !leadFixo || construtora || projetos.length === 0) return;
    const atual = projetos.find((p) => p.id === leadFixo.projeto_id);
    if (atual?.construtora) {
      setConstrutora(
        construtoras.find((c) => mesmaConstrutoraExata(atual.construtora, c)) ?? atual.construtora,
      );
      setProjeto(atual);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadFixo, projetos, construtoras]);

  const criarProjeto = useMutation({
    mutationFn: async () => {
      const nome = novoProjetoNome.trim();
      if (nome.length < 2) throw new Error("Informe o nome do empreendimento");
      const slug = `${slugify(nome)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from("projetos")
        .insert({ nome, slug, construtora, ativo: true, criado_por: user?.id } as never)
        .select("id, nome, construtora")
        .single();
      if (error) throw error;
      return data as ProjetoOpcao;
    },
    onSuccess: (p) => {
      toast.success("Empreendimento cadastrado");
      qc.invalidateQueries({ queryKey: ["projetos-select-construtora"] });
      qc.invalidateQueries({ queryKey: ["projetos-select"] });
      qc.invalidateQueries({ queryKey: ["projetos"] });
      setProjeto(p);
      setProjetoManual("");
      setCriandoProjeto(false);
      setEtapa(4);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Selecione o cliente que comprou");
      if (leadFixo && !lead.corretor_id) {
        throw new Error(
          'Este lead ainda não tem corretor responsável. Clique em "Iniciar atendimento" antes de registrar a venda.',
        );
      }
      const valorNum = parseCurrencyBRL(valor) ?? NaN;
      const split = parseSplit(percentuais);
      const erro = validarVenda({ valorVenda: valorNum, dataAssinatura, hoje: hoje(), split });
      if (erro) throw new Error(erro);
      if (!/^\d{4}-\d{2}$/.test(previsaoRecebimento)) {
        throw new Error("Informe o mês previsto para recebimento");
      }
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const obsConstrutora = !projeto && projetoManual.trim() ? `Construtora: ${construtora}` : "";
      await registrarVenda({
        leadId: lead.id,
        corretorId: lead.corretor_id ?? uid,
        criadoPorId: uid,
        projetoId: projeto?.id ?? null,
        projetoNome: projeto?.nome ?? (projetoManual.trim() || null),
        unidade,
        valorVenda: valorNum,
        dataAssinatura,
        split: split!,
        observacoes: [obsConstrutora, observacoes.trim()].filter(Boolean).join("\n"),
        previsaoRecebimento,
        efetivacao,
      });
    },
    onSuccess: () => {
      toast.success("Venda enviada para aprovação da gestão");
      celebrate("venda");
      qc.invalidateQueries({ queryKey: ["vendas"] });
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      qc.invalidateQueries({ queryKey: ["comissoes-vendas"] });
      qc.invalidateQueries({ queryKey: ["leads-kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-para-venda"] });
      if (lead) {
        qc.invalidateQueries({ queryKey: ["lead", lead.id] });
        qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      }
      onDone?.();
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const TITULOS: Record<Etapa, string> = {
    1: "Quem comprou?",
    2: "Qual construtora?",
    3: "Qual produto?",
    4: "Dados da venda",
  };

  const Resumo = () => (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
      {lead && (
        <div>
          <span className="text-muted-foreground">Cliente: </span>
          <button
            className="font-medium underline-offset-2 hover:underline"
            disabled={!!leadFixo}
            onClick={() => setEtapa(1)}
          >
            {lead.nome}
          </button>
        </div>
      )}
      {etapa > 2 && construtora && (
        <div>
          <span className="text-muted-foreground">Construtora: </span>
          <button
            className="font-medium underline-offset-2 hover:underline"
            onClick={() => setEtapa(2)}
          >
            {construtora}
          </button>
        </div>
      )}
      {etapa > 3 && (projeto || projetoManual) && (
        <div>
          <span className="text-muted-foreground">Produto: </span>
          <button
            className="font-medium underline-offset-2 hover:underline"
            onClick={() => setEtapa(3)}
          >
            {projeto?.nome ?? projetoManual}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar venda</DialogTitle>
            <DialogDescription>
              Etapa {etapa} de 4 — {TITULOS[etapa]} Metas, comissão e fechamento só contam depois da
              aprovação da gestão.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full ${n <= etapa ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>

          {etapa > 1 && <Resumo />}

          {etapa === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  inputMode="tel"
                  value={buscaTel}
                  onChange={(e) => setBuscaTel(maskPhoneBR(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && buscarCliente()}
                  placeholder="(11) 98765-4321"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={buscaEmail}
                    onChange={(e) => setBuscaEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && buscarCliente()}
                    placeholder="cliente@email.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF</Label>
                  <Input
                    inputMode="numeric"
                    value={buscaCpf}
                    onChange={(e) => setBuscaCpf(maskCPF(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && buscarCliente()}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
              <Button className="w-full" onClick={buscarCliente} disabled={buscando}>
                <MagnifyingGlass className="mr-2 h-4 w-4" />
                {buscando ? "Buscando…" : "Buscar cliente"}
              </Button>

              {resultados && resultados.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum cliente encontrado{podeVerTodos ? "" : " na sua carteira"}. Confira os
                  dados ou cadastre o cliente antes de registrar a venda.
                </p>
              )}
              {resultados && resultados.length > 0 && (
                <div className="space-y-1.5">
                  {resultados.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => escolherLead(l)}
                      className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                    >
                      <div className="font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {[l.telefone ? formatPhoneBR(l.telefone) : null, l.email, l.projeto_nome]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {etapa === 2 && (
            <div className="space-y-3">
              <Input
                value={filtroConstrutora}
                onChange={(e) => setFiltroConstrutora(e.target.value)}
                placeholder="Buscar construtora…"
              />
              <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto">
                {construtorasFiltradas.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      if (!mesmaConstrutoraExata(c, construtora)) {
                        setProjeto(null);
                        setProjetoManual("");
                      }
                      setConstrutora(c);
                      setFiltroProjeto("");
                      setEtapa(3);
                    }}
                    className={`rounded-md border px-3 py-2 text-left text-sm hover:bg-muted ${
                      construtora === c ? "border-primary" : ""
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {filtroConstrutora.trim() && construtorasFiltradas.length === 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setConstrutora(filtroConstrutora.trim());
                    setProjeto(null);
                    setProjetoManual("");
                    setEtapa(3);
                  }}
                >
                  Usar “{filtroConstrutora.trim()}”
                </Button>
              )}
            </div>
          )}

          {etapa === 3 && (
            <div className="space-y-3">
              {!criandoProjeto ? (
                <>
                  <Input
                    value={filtroProjeto}
                    onChange={(e) => setFiltroProjeto(e.target.value)}
                    placeholder="Buscar empreendimento…"
                  />
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {projetosDaConstrutora.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setProjeto(p);
                          setProjetoManual("");
                          setEtapa(4);
                        }}
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted ${
                          projeto?.id === p.id ? "border-primary" : ""
                        }`}
                      >
                        {p.nome}
                      </button>
                    ))}
                    {projetosDaConstrutora.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Nenhum empreendimento ativo dessa construtora.
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setNovoProjetoNome(filtroProjeto.trim());
                      setCriandoProjeto(true);
                    }}
                  >
                    Não está na lista? Cadastrar empreendimento
                  </Button>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Nome do empreendimento ({construtora})</Label>
                  <Input
                    value={novoProjetoNome}
                    onChange={(e) => setNovoProjetoNome(e.target.value)}
                    placeholder="Ex.: Residencial Vista Verde"
                    maxLength={160}
                    autoFocus
                  />
                  {!podeCriarProjeto && (
                    <p className="text-xs text-muted-foreground">
                      A venda segue com esse nome e a construtora. A gestão completa o cadastro do
                      empreendimento depois.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setCriandoProjeto(false)}>
                      Voltar
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={criarProjeto.isPending || novoProjetoNome.trim().length < 2}
                      onClick={() => {
                        if (podeCriarProjeto) return criarProjeto.mutate();
                        setProjeto(null);
                        setProjetoManual(novoProjetoNome.trim());
                        setCriandoProjeto(false);
                        setEtapa(4);
                      }}
                    >
                      {criarProjeto.isPending ? "Cadastrando…" : "Cadastrar e continuar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {etapa === 4 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor da venda (VGV) *</Label>
                  <Input
                    inputMode="numeric"
                    value={valor}
                    onChange={(e) => setValor(maskCurrencyBRL(e.target.value))}
                    placeholder="R$ 350.000,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data de assinatura *</Label>
                  <Input
                    type="date"
                    max={hoje()}
                    value={dataAssinatura}
                    onChange={(e) => setDataAssinatura(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Input
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="Ex.: Torre B — apto 1204"
                  maxLength={60}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Previsão para recebimento *</Label>
                <Input
                  type="month"
                  value={previsaoRecebimento}
                  onChange={(e) => setPrevisaoRecebimento(e.target.value)}
                />
              </div>

              <EfetivacaoFlagsField
                valores={efetivacao}
                onChange={(key, value) => setEfetivacao((prev) => ({ ...prev, [key]: value }))}
              />

              <ComissaoSplitFields
                valorVenda={parseCurrencyBRL(valor)}
                valores={percentuais}
                onChange={(campo, v) => setPercentuais((prev) => ({ ...prev, [campo]: v }))}
                travados={tierSplit.travados}
                infoTier={tierSplit.infoTier}
                somenteTier={tierSplit.somenteTier}
              />

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  rows={3}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {etapa > etapaInicial ? (
              <Button variant="ghost" onClick={() => setEtapa((etapa - 1) as Etapa)}>
                Voltar
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            )}
            {etapa === 4 && (
              <Button onClick={() => mut.mutate()} disabled={mut.isPending || !lead}>
                {mut.isPending ? "Salvando…" : "Registrar venda"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Botão "$" do topo: abre o cadastro em etapas começando pela busca do cliente. */
export function RegistrarVendaDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-registrar-venda", onOpen);
    return () => window.removeEventListener("open-registrar-venda", onOpen);
  }, []);
  return (
    <>
      {/* Quadrado navy só com o "$" (identidade Lançamento, 2026-10): o único
          botão preenchido do header, porque é a ação que vale dinheiro. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" onClick={() => setOpen(true)} aria-label="Registrar venda">
            <CurrencyDollar className="h-[18px] w-[18px]" weight="regular" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Registrar venda</TooltipContent>
      </Tooltip>
      <VendaEtapasDialog open={open} setOpen={setOpen} />
    </>
  );
}
