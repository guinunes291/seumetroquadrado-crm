// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório").
//
// O corretor só usa o CRM depois de dizer onde está hoje: Barra Funda,
// Liberdade, Belém ou Em casa. Montado no shell /_authenticated, carregado
// sob demanda, entre o onboarding e o estudo do funil — ordem da abertura:
// onboarding → CHECK-IN → estudo do funil (quinta) → metas do dia.
//
// Quando abre: papel corretor (inclusive quem também é gestor), nenhum
// check-in hoje (aberto, encerrado ou barrado — "Encerrar presença" não reabre
// o bloqueio; fica a faixa do topo), treino do onboarding fora da tela e rota
// que não seja /presenca, /meu-perfil (já têm o card) nem a tela cheia de
// campo (/modo-visita). Gestão sem papel corretor nunca. Leitura carregando:
// nada abre (sem piscar). A primeira leitura com erro: libera — falha técnica
// nunca prende ninguém. Já com o diálogo na tela, uma releitura que falha não
// fecha nada (vale o último dado bom; a releitura de 15 s continua).
//
// Com a exigência de localização ligada, tocar numa filial pede confirmação
// ("Você está dentro da loja X agora?"): um toque "para ver" fora da loja
// vira check-in barrado e tira das roletas e do reforço no dia.
//
// Enquanto está na tela, relê a presença (15 s, ao voltar para a aba e para a
// janela): o check-in feito no celular, o "Confirmar no plantão" da gestão ou
// o interruptor fecham o diálogo com o verde. E antes de QUALQUER check-in
// daqui, relê na hora: se o check-in de hoje já liberou a roleta, fecha sem
// chamar a RPC — nunca rebaixa uma confirmação. (O card de /presenca e Meu
// Perfil tem a mesma proteção.)
//
// Leitor de tela: o foco vai para o título de cada tela nova, e UMA região
// aria-live, sempre montada, troca só o texto — "Conferindo a localização…"
// durante a leitura, depois o motivo do barrado ou do recusado.
//
// Depois do check-in:
// - liberou a roleta → fecha (toast verde);
// - em casa abaixo do mínimo de vendas → mostra o motivo e libera o CRM (ele
//   disse a verdade; só não entra na roleta);
// - filial barrada pela localização (fora do raio ou sem localização) →
//   continua aberto com o porquê e as saídas: tentar de novo (sem localização:
//   "Incluir localização", que lê o GPS ANTES e, se falhar, não grava nada),
//   "Estou em casa" ou continuar fora das roletas. Sem armadilha.
//
// "Incluir minha localização" (13/10/2026): o painel acima das opções lê o
// GPS ANTES da escolha e mostra a distância até cada filial — prévia, nada é
// gravado. Com a leitura, tocar a filial onde ele está faz o check-in direto
// (a MESMA leitura vai à RPC: no iPhone, nenhum segundo pedido de permissão);
// tocar uma filial longe mostra o aviso ANTES do barrado, sem RPC; o check-in
// só sai pelo link explícito "assim mesmo", que diz o custo. Quem decide
// continua sendo o banco.
//
// Modo voluntário (13/10/2026): o bloco da barra lateral e a faixa do topo
// PEDEM o check-in (pedirCheckin); este diálogo atende em qualquer tela, menos
// /presenca e /meu-perfil (o card atende lá). Voluntário nunca prende (ESC, X
// e clique fora fecham), não fecha sozinho ao ver o check-in de hoje (é
// justamente para trocá-lo) e só fecha com o verde quando chega um check-in
// que ele NÃO estava vendo. Se o dia virar com ele aberto, vira obrigatório.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowCounterClockwise,
  CircleNotch,
  House,
  MapPinSimpleArea,
  Storefront,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mensagemDeErro } from "@/lib/mensagem-erro";
import { cn } from "@/lib/utils";
import { useEstadoTreino } from "@/features/onboarding/treino-estado";
import { BotoesConfirmarFilial, OpcoesCheckin, RegraDasVendas } from "./checkin-card";
import {
  descricaoDoDialogo,
  desfechoCheckin,
  destinoDoPedido,
  dialogoBloqueante,
  rotaSemCheckinObrigatorio,
  type ModoDialogo,
} from "./checkin-obrigatorio";
import {
  BotoesAviso,
  CorpoAviso,
  PainelIncluirLocalizacao,
  ResgateAqui,
} from "./incluir-localizacao";
import {
  anuncioDaLeitura,
  avisoAntesDoCheckin,
  decidirToqueFilial,
  encerraDoVisto,
  previaDasFiliais,
  type Previa,
  type TextosAviso,
} from "./localizacao-previa";
import {
  avisarNaRoletaDeFora,
  ehComputador,
  lerLocalizacaoAgora,
  motivoDoResultado,
  registrarFalhaLocalizacao,
  useBuscarPresencaFresca,
  useCheckin,
  type LeituraIncluida,
  type ResultadoCheckin,
} from "./presenca-client";
import {
  AVISO_COMPUTADOR,
  AVISO_FORA_DO_REFORCO,
  avisoJaNaRoleta,
  avisoLocalizacao,
  avisoTrocaDoValido,
  checkinAptoAberto,
  DICA_FORA_DA_FILIAL,
  jaNaRoletaSemSaber,
  leituraValida,
  perguntaConfirmarFilial,
  precisaoAproximada,
  precisaRefazerCheckin,
  rotuloLocal,
  type CheckinAtual,
  type FilialOpcao,
  type Visto,
} from "./presenca-derive";
import { useLocalizacaoIncluida } from "./use-localizacao-incluida";
import {
  atenderPedidoCheckin,
  liberarCheckinPorFalha,
  pedidoVigente,
  publicarDialogoCheckin,
  useCheckinObrigatorio,
  usePedidoCheckin,
  VALIDADE_PEDIDO_MS,
} from "./use-checkin-obrigatorio";

type Tela = "opcoes" | "confirmar" | "aviso" | "barrado" | "recusado";

/** O aviso antes do check-in na tela (sem RPC): a filial tocada e por quê. */
type AvisoNaTela = { filial: FilialOpcao; variante: "fora" | "sem_localizacao" };

type OpcoesEscolher = {
  novaLeitura?: boolean;
  /** A leitura do painel, conferida pela prévia: vai à RPC sem ler o GPS de novo. */
  leitura?: LeituraIncluida;
  previaDentro?: boolean;
  /** O check-in que ele via quando tocou (o padrão: o da tela agora). */
  visto?: Visto;
};

export function CheckinObrigatorioGlobal() {
  // Uma vez aberto, só fecha por decisão daqui: o check-in barrado já conta
  // como "fez check-in hoje", mas o diálogo precisa ficar para explicar.
  const [ativo, setAtivo] = useState(false);
  // Obrigatório (falta o check-in de hoje) ou voluntário (pedido pelo bloco da
  // barra lateral ou pela faixa): o voluntário nunca prende.
  const [modo, setModo] = useState<ModoDialogo>("obrigatorio");
  // A presença lida pelo hook traz as filiais e a régua das vendas. Com o
  // diálogo na tela, ela é relida (check-in vindo de fora fecha o diálogo).
  const { pendente, dia, uid, presenca } = useCheckinObrigatorio({ releitura: ativo });
  const treino = useEstadoTreino();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // O motivo e o erro aparecem aqui dentro: nada de toast amarelo ou vermelho repetindo.
  const checkin = useCheckin({ avisarRecusa: false, avisarErro: false });
  const buscarPresencaFresca = useBuscarPresencaFresca();
  const computador = ehComputador();
  // A leitura do "Incluir minha localização": deste diálogo, some ao fechar.
  const loc = useLocalizacaoIncluida();
  const { limpar: limparLeitura } = loc;
  const pedido = usePedidoCheckin();

  const deveAbrir =
    pendente === true &&
    treino.decidido &&
    !treino.aberto &&
    !rotaSemCheckinObrigatorio(pathname) &&
    !!presenca;

  // O último check-in daqui que NÃO liberou a roleta (motivo na tela).
  const [resultado, setResultado] = useState<ResultadoCheckin | null>(null);
  // Filial tocada esperando o "Estou na loja".
  const [confirmar, setConfirmar] = useState<FilialOpcao | null>(null);
  // Filial tocada que a prévia diz que barraria: o aviso, sem RPC.
  const [aviso, setAviso] = useState<AvisoNaTela | null>(null);
  // Qual opção está em andamento (relendo a presença, o GPS, a RPC).
  const [escolha, setEscolha] = useState<string | null>(null);
  // A RPC em curso vai com a leitura do painel (não lê o GPS): "Registrando…".
  const [viaLeitura, setViaLeitura] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Já houve check-in por este diálogo (barrado volta às opções sem fechar).
  const [fezCheckin, setFezCheckin] = useState(false);
  // A localização barrou um check-in daqui: o reforço não volta com "Em casa".
  const [houveBarrado, setHouveBarrado] = useState(false);
  // O pedido "Incluir localização" (faixa, bloco) abre no barrado e refaz.
  const [refazerAoAbrir, setRefazerAoAbrir] = useState<string | null>(null);
  // Reavalia um pedido que está esperando (o treino decidir, a presença chegar).
  const [tick, setTick] = useState(0);
  // O verde do check-in vindo de fora sai uma vez só por check-in.
  const avisado = useRef<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // No voluntário: o check-in que ele via ao abrir e o último feito daqui. Só
  // um check-in DIFERENTE desses, que liberou a roleta, fecha com o verde.
  const vistoNaAbertura = useRef<Visto>(null);
  const ultimoIdDaqui = useRef<string | null>(null);
  // O pedido que este diálogo já atendeu (um efeito que roda duas vezes não abre duas).
  const pedidoAtendido = useRef<number | null>(null);

  const fechar = useCallback(() => {
    setAtivo(false);
    setResultado(null);
    setConfirmar(null);
    setAviso(null);
    setErro(null);
    setFezCheckin(false);
    setHouveBarrado(false);
    setEscolha(null);
    setRefazerAoAbrir(null);
    setViaLeitura(false);
    limparLeitura();
    vistoNaAbertura.current = null;
    ultimoIdDaqui.current = null;
    setModo("obrigatorio");
  }, [limparLeitura]);

  // Falta o check-in de hoje: abre (ou prende). Com o voluntário aberto, é a
  // virada do dia: vira obrigatório e volta às opções, com tudo zerado.
  useEffect(() => {
    if (!deveAbrir) return;
    if (modo === "voluntario") {
      setResultado(null);
      setConfirmar(null);
      setAviso(null);
      setErro(null);
      setFezCheckin(false);
      setHouveBarrado(false);
      setRefazerAoAbrir(null);
      limparLeitura();
      vistoNaAbertura.current = null;
      ultimoIdDaqui.current = null;
    }
    setModo("obrigatorio");
    setAtivo(true);
  }, [deveAbrir, modo, limparLeitura]);

  /** O check-in de hoje que liberou a roleta chegou de fora: verde e fecha. */
  const fecharPorCheckinDeFora = useCallback(
    (c: CheckinAtual) => {
      if (avisado.current !== c.id) {
        avisado.current = c.id;
        avisarNaRoletaDeFora(c);
      }
      fechar();
    },
    [fechar],
  );

  const ocupado = escolha !== null || checkin.isPending;
  const p = resultado?.presenca ?? presenca;
  const aberto = (deveAbrir || ativo) && !!p;
  // As filiais vêm da leitura da presença (a resposta da RPC não as traz).
  const filiais = useMemo(() => presenca?.filiais ?? p?.filiais ?? [], [presenca, p]);
  const nomes = useMemo(() => Object.fromEntries(filiais.map((f) => [f.slug, f.nome])), [filiais]);
  const lendo = loc.estado.fase === "lendo";
  // A prévia das distâncias (só com a leitura incluída e as coordenadas lidas).
  const previa: Previa | null = useMemo(
    () =>
      loc.estado.fase === "incluida" && loc.estado.coordenadas
        ? previaDasFiliais(loc.estado.leitura, filiais, loc.estado.coordenadas)
        : null,
    [loc.estado, filiais],
  );

  // Um pedido de check-in (bloco da barra lateral, faixa do topo).
  useEffect(() => {
    if (!pedido || pedidoAtendido.current === pedido.id) return;
    const destino = destinoDoPedido({
      vigente: pedidoVigente(pedido, Date.now()),
      pathname,
      treinoDecidido: treino.decidido,
      treinoAberto: treino.aberto,
      presencaPronta: pendente !== null && !!presenca,
      dialogoAberto: aberto,
    });
    // /presenca e /meu-perfil: o card atende.
    if (destino === "card") return;
    if (destino === "esperar") {
      // Reavalia quando o pedido vencer (se nada mudar antes).
      const t = setTimeout(
        () => setTick((n) => n + 1),
        Math.max(0, pedido.em + VALIDADE_PEDIDO_MS - Date.now()) + 10,
      );
      return () => clearTimeout(t);
    }
    pedidoAtendido.current = pedido.id;
    atenderPedidoCheckin(pedido.id);
    if (destino === "descartar" || !presenca) return;
    const c = presenca.checkin;
    // "Incluir localização" com o check-in de hoje já valendo (a gestão
    // confirmou antes do toque): nada a refazer.
    if (pedido.acao === "incluir-localizacao" && c && checkinAptoAberto(presenca)) {
      toast.info(avisoJaNaRoleta(c));
      return;
    }
    setModo(deveAbrir ? "obrigatorio" : "voluntario");
    vistoNaAbertura.current = c;
    ultimoIdDaqui.current = null;
    if (c && precisaRefazerCheckin(presenca)) {
      // Barrado: abre explicando (e com a saída certa para o motivo).
      setResultado({ presenca, falhaLocalizacao: c.falha_localizacao });
      setHouveBarrado(true);
      if (
        pedido.acao === "incluir-localizacao" &&
        c.motivo === "sem_localizacao" &&
        c.filial_slug
      ) {
        setRefazerAoAbrir(c.filial_slug);
      }
    }
    setAtivo(true);
    // Uma leitura por abertura: se algo novo já liberou, a releitura fecha com o verde.
    void buscarPresencaFresca().catch(() => null);
  }, [
    pedido,
    tick,
    pathname,
    treino.decidido,
    treino.aberto,
    pendente,
    presenca,
    aberto,
    deveAbrir,
    buscarPresencaFresca,
  ]);

  // A presença relida mudou enquanto o diálogo está na tela.
  useEffect(() => {
    if (!ativo || ocupado) return;
    const c = presenca?.checkin ?? null;
    if (modo === "obrigatorio" && !fezCheckin) {
      // Só as opções (ou a confirmação) na tela: o check-in de hoje feito em
      // outro lugar fecha — com o verde, se liberou a roleta; senão, a faixa
      // do topo continua avisando.
      if (pendente !== false) return;
      if (c && checkinAptoAberto(presenca)) fecharPorCheckinDeFora(c);
      else fechar();
      return;
    }
    // Depois de um check-in daqui (ou no voluntário, que abre justamente com
    // o check-in de hoje na tela): só OUTRO check-in de hoje que liberou (o
    // celular, a gestão confirmando no plantão, o interruptor) fecha.
    const referencia = ultimoIdDaqui.current ?? vistoNaAbertura.current?.id ?? null;
    if (c && c.id !== referencia && checkinAptoAberto(presenca)) fecharPorCheckinDeFora(c);
  }, [ativo, ocupado, presenca, pendente, modo, fezCheckin, fechar, fecharPorCheckinDeFora]);

  const escolher = async (
    modoCheckin: "loja" | "casa",
    filial?: string,
    opts: OpcoesEscolher = {},
  ) => {
    // O que ele via no toque, antes de qualquer espera.
    const visto: Visto = opts.visto !== undefined ? opts.visto : (p?.checkin ?? null);
    setEscolha(filial ?? modoCheckin);
    setViaLeitura(!!opts.leitura);
    setErro(null);
    // Antes de qualquer check-in, a presença de agora: se o de hoje já
    // liberou a roleta sem ele ver (feito no celular, confirmado pela gestão),
    // fecha sem chamar a RPC — refazer aqui encerraria a confirmação.
    const fresca = await buscarPresencaFresca().catch(() => null);
    const jaVale = jaNaRoletaSemSaber(fresca, visto);
    if (jaVale) {
      fecharPorCheckinDeFora(jaVale);
      return;
    }
    // A leitura venceu durante a espera: nada de RPC com posição velha — a
    // pergunta dessa filial, como antes do "Incluir".
    if (opts.leitura && !leituraValida(opts.leitura, Date.now())) {
      const f = filiais.find((x) => x.slug === filial);
      setEscolha(null);
      setViaLeitura(false);
      setAviso(null);
      if (f) setConfirmar(f);
      return;
    }
    checkin.mutate(
      {
        modo: modoCheckin,
        filial,
        novaLeitura: opts.novaLeitura,
        leitura: opts.leitura,
        previaDentro: opts.previaDentro,
        barradoHoje: houveBarrado,
      },
      {
        onSuccess: (r) => {
          ultimoIdDaqui.current = r.presenca.checkin?.id ?? null;
          if (desfechoCheckin(r.presenca) === "na_roleta") return fechar();
          setFezCheckin(true);
          setResultado(r);
          if (desfechoCheckin(r.presenca) === "barrado") setHouveBarrado(true);
        },
        onError: (e) => setErro(mensagemDeErro(e) ?? "sem detalhe do servidor"),
        onSettled: () => {
          setEscolha(null);
          setViaLeitura(false);
          setConfirmar(null);
          setAviso(null);
        },
      },
    );
  };

  /** A prévia disse "dentro" desta filial com a leitura de agora? */
  const previaDentro = (slug: string) => previa?.porFilial[slug]?.tipo === "dentro";

  /**
   * O toque numa filial (ou no resgate "Fazer check-in na X"): direto com a
   * leitura, a pergunta, ou o aviso — sem RPC no aviso.
   */
  const tocarFilial = (slug: string) => {
    const f = filiais.find((x) => x.slug === slug);
    if (!f || !p) return void escolher("loja", slug);
    const leitura = loc.leituraValidaAgora();
    const decisao = decidirToqueFilial({
      exige: p.exige_localizacao,
      filial: f,
      leitura,
      falhaRecente: loc.falhaRecenteAgora(),
      previa: leitura ? previa : null,
    });
    if (decisao === "direto") {
      return void escolher("loja", slug, {
        leitura: leitura ?? undefined,
        previaDentro: previaDentro(slug),
      });
    }
    if (decisao === "confirmar") {
      setAviso(null);
      return setConfirmar(f);
    }
    setAviso({ filial: f, variante: decisao === "aviso_fora" ? "fora" : "sem_localizacao" });
  };

  const tocarOpcao = (modoCheckin: "loja" | "casa", slug?: string) => {
    if (modoCheckin === "casa") return void escolher("casa");
    const c = p?.checkin;
    // Já na roleta NESTA filial (GPS ou a gestão confirmando no plantão):
    // refazer só arriscaria rebaixar o check-in que vale.
    if (c && checkinAptoAberto(p) && c.modo === "loja" && c.filial_slug === slug) {
      toast.info(avisoJaNaRoleta(c));
      if (modo === "voluntario" && !deveAbrir) fechar();
      return;
    }
    if (slug) tocarFilial(slug);
  };

  /**
   * "Incluir localização" do barrado sem localização (e o pedido da faixa ou
   * do bloco): lê o GPS ANTES; se falhar, não chama a RPC (o barrado não se
   * repete) e o motivo muda para o da falha nova. Se der, refaz na mesma
   * filial com essa leitura — já barrado, um barrado novo não custa nada a
   * mais e dá à gestão a distância nova.
   */
  const refazerComLocalizacao = async (slug: string) => {
    const visto: Visto = p?.checkin ?? null;
    setEscolha(slug);
    setErro(null);
    const r = await lerLocalizacaoAgora();
    if (!r.ok) {
      // Uma tentativa de check-in: conta no diagnóstico de "todo mundo barrado".
      registrarFalhaLocalizacao(r.falha);
      setResultado((prev) => prev && { ...prev, falhaLocalizacao: r.falha });
      setEscolha(null);
      return;
    }
    await escolher("loja", slug, { leitura: r.leitura, visto });
  };

  const seguirSemCheckin = () => {
    liberarCheckinPorFalha(uid, dia);
    fechar();
  };

  const desfecho = resultado ? desfechoCheckin(resultado.presenca) : null;
  const tela: Tela = confirmar
    ? "confirmar"
    : aviso
      ? "aviso"
      : resultado && desfecho === "barrado"
        ? "barrado"
        : resultado && desfecho === "recusado"
          ? "recusado"
          : "opcoes";

  // O pedido "Incluir localização" abriu no barrado: refaz assim que a tela
  // estiver de pé (num efeito, para usar a presença e o barrado de agora; a
  // função nova a cada render é de propósito — o pedido zera na 1ª vez).
  useEffect(() => {
    if (refazerAoAbrir && ativo && tela === "barrado" && !ocupado) {
      const slug = refazerAoAbrir;
      setRefazerAoAbrir(null);
      void refazerComLocalizacao(slug);
    }
  }, [refazerAoAbrir, ativo, tela, ocupado, refazerComLocalizacao]);

  // O estudo do funil e as metas do dia esperam o diálogo fechar.
  useEffect(() => {
    publicarDialogoCheckin(aberto);
  }, [aberto]);
  useEffect(() => () => publicarDialogoCheckin(false), []);

  // Cada tela nova: o foco vai para o título (o leitor de tela lê a mudança;
  // nada de Enter solto num botão de filial).
  useEffect(() => {
    if (aberto) tituloRef.current?.focus();
  }, [aberto, tela]);

  if (!aberto || !p) return null;

  const modoNaTela: ModoDialogo = deveAbrir ? "obrigatorio" : modo;
  const bloqueante = dialogoBloqueante({ modo, deveAbrir, tela });
  const temCoordenadas = filiais.some((f) => f.tem_coordenadas);
  const leituraAgora = loc.leituraValidaAgora();
  // "Você está na filial X" — noutra filial que não a tocada (ou a barrada),
  // com a leitura ainda valendo e precisa.
  const aquiFora = (slug: string | null | undefined) =>
    leituraAgora && previa?.aqui && previa.aqui !== slug && !previa.aproximada
      ? { slug: previa.aqui, nome: nomes[previa.aqui] ?? previa.aqui }
      : null;
  const textosAviso: TextosAviso | null = aviso
    ? avisoAntesDoCheckin({
        variante: aviso.variante,
        filial: aviso.filial.nome,
        conferencia: previa?.porFilial[aviso.filial.slug] ?? null,
        previa,
        falha: loc.estado.fase === "falhou" ? loc.estado.falha : null,
        computador,
        jaBarrado: houveBarrado || precisaRefazerCheckin(p),
        encerra: encerraDoVisto(p.checkin),
        aqui: aquiFora(aviso.filial.slug),
      })
    : null;

  const anuncio = ocupado
    ? escolha === "casa" || viaLeitura
      ? "Registrando o check-in…"
      : "Conferindo a localização…"
    : lendo
      ? "Lendo a localização…"
      : resultado && tela === "barrado"
        ? (motivoDoResultado(resultado, { computador }) ?? "")
        : resultado && tela === "recusado"
          ? (motivoDoResultado(resultado) ?? "")
          : tela === "aviso" && textosAviso
            ? textosAviso.titulo
            : tela === "opcoes"
              ? anuncioDaLeitura(loc.estado, previa, nomes, { computador })
              : "";
  const avisoTroca = modoNaTela === "voluntario" ? avisoTrocaDoValido(p.checkin) : null;
  const barradaSlug = resultado?.presenca.checkin?.filial_slug ?? null;
  const resgateBarrado = tela === "barrado" ? aquiFora(barradaSlug) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && !bloqueante && !ocupado && fechar()}>
      <DialogContent
        className={cn(
          "max-h-[92vh] max-w-xl overflow-y-auto",
          bloqueante && "[&>button.absolute]:hidden",
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          tituloRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => bloqueante && e.preventDefault()}
        onPointerDownOutside={(e) => bloqueante && e.preventDefault()}
        onInteractOutside={(e) => bloqueante && e.preventDefault()}
        data-testid="checkin-obrigatorio-dialog"
        data-modo={modoNaTela}
      >
        {tela === "confirmar" && confirmar ? (
          <ConfirmarNaLoja
            tituloRef={tituloRef}
            filial={confirmar}
            computador={computador}
            carregando={escolha === confirmar.slug}
            ocupado={ocupado}
            // Depois de um barrado, a posição é lida na hora (nada da de 1 min
            // atrás); sem barrado, vai a leitura do painel, se ainda vale.
            onConfirmar={() => {
              const leitura = houveBarrado ? undefined : (loc.leituraValidaAgora() ?? undefined);
              void escolher("loja", confirmar.slug, {
                leitura,
                novaLeitura: houveBarrado,
                previaDentro: !!leitura && previaDentro(confirmar.slug),
              });
            }}
            onVoltar={() => setConfirmar(null)}
          />
        ) : tela === "aviso" && aviso && textosAviso ? (
          <AvisoAntesDoCheckin
            tituloRef={tituloRef}
            textos={textosAviso}
            variante={aviso.variante}
            filial={aviso.filial}
            aqui={aquiFora(aviso.filial.slug)}
            escolha={escolha}
            ocupado={ocupado}
            onResgate={(slug) => tocarFilial(slug)}
            onVoltar={() => setAviso(null)}
            onIncluir={() => {
              // Volta às opções e relê; nada de check-in depois.
              setAviso(null);
              void loc.incluir();
            }}
            onAssimMesmo={() => void escolher("loja", aviso.filial.slug, { novaLeitura: true })}
          />
        ) : tela === "barrado" && resultado ? (
          <Barrado
            tituloRef={tituloRef}
            resultado={resultado}
            computador={computador}
            escolha={escolha}
            ocupado={ocupado}
            erro={erro}
            resgate={resgateBarrado}
            onTentarDeNovo={(filial) => void escolher("loja", filial, { novaLeitura: true })}
            onIncluirLocalizacao={(filial) => void refazerComLocalizacao(filial)}
            onResgate={(slug) => tocarFilial(slug)}
            onEmCasa={() => void escolher("casa")}
            onOutraFilial={() => setResultado(null)}
            onContinuar={fechar}
          />
        ) : tela === "recusado" && resultado ? (
          <Recusado
            tituloRef={tituloRef}
            resultado={resultado}
            houveBarrado={houveBarrado}
            onFechar={fechar}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle
                ref={tituloRef}
                tabIndex={-1}
                className="flex items-center gap-2 font-display outline-none"
              >
                <Storefront className="h-5 w-5 text-primary" /> Check-in de hoje
              </DialogTitle>
              <DialogDescription>{descricaoDoDialogo(p, modoNaTela)}</DialogDescription>
            </DialogHeader>
            {avisoTroca && (
              <p
                className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
                data-testid="checkin-aviso-troca"
              >
                {avisoTroca}
              </p>
            )}
            {temCoordenadas && (
              <PainelIncluirLocalizacao
                estado={loc.estado}
                previa={previa}
                nomes={nomes}
                computador={computador}
                desabilitado={ocupado}
                // Uma região só no diálogo: o texto da leitura entra na de baixo.
                regiaoPropria={false}
                onIncluir={() => void loc.incluir()}
                onCancelar={loc.cancelar}
              />
            )}
            <div className="space-y-2">
              <OpcoesCheckin
                p={p}
                previa={previa}
                escolha={escolha}
                disabled={ocupado || lendo}
                onEscolher={tocarOpcao}
              />
              <p className="text-xs text-muted-foreground">{DICA_FORA_DA_FILIAL}</p>
            </div>
            <RegraDasVendas p={p} />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0" />
              {avisoLocalizacao(p.exige_localizacao)}
            </p>
            {erro && (
              <ErroCheckin
                erro={erro}
                voluntario={modoNaTela === "voluntario"}
                onSeguir={seguirSemCheckin}
              />
            )}
            {/* Voltou do "barrado" para escolher outra filial: a saída continua aqui. */}
            {fezCheckin && !erro && (
              <Button
                type="button"
                variant="ghost"
                className="justify-self-start text-muted-foreground"
                disabled={ocupado}
                onClick={fechar}
              >
                Continuar fora das roletas
              </Button>
            )}
          </>
        )}
        {/* O que se vê (o leitor de tela ouve a região abaixo). */}
        {ocupado && (
          <p
            aria-hidden="true"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="checkin-status"
          >
            <CircleNotch className="h-4 w-4 animate-spin" />
            {anuncio}
          </p>
        )}
        {/* Sempre montada: uma região que já existe e só troca o texto é
            anunciada; uma que nasce com o texto, muitas vezes não. É a ÚNICA
            do diálogo (a leitura do painel também fala por ela). */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="checkin-anuncio"
        >
          {anuncio}
        </p>
      </DialogContent>
    </Dialog>
  );
}

type TituloRef = React.RefObject<HTMLHeadingElement | null>;

/** "Você está dentro da loja X agora?" — antes do check-in na filial. */
function ConfirmarNaLoja({
  tituloRef,
  filial,
  computador,
  carregando,
  ocupado,
  onConfirmar,
  onVoltar,
}: {
  tituloRef: TituloRef;
  filial: FilialOpcao;
  computador: boolean;
  carregando: boolean;
  ocupado: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  const pergunta = perguntaConfirmarFilial(filial.nome);
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display leading-snug outline-none"
        >
          <Storefront className="h-5 w-5 shrink-0 text-primary" /> {pergunta.titulo}
        </DialogTitle>
        <DialogDescription className="text-foreground/90">{pergunta.detalhe}</DialogDescription>
      </DialogHeader>
      {computador && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0" />
          {AVISO_COMPUTADOR}
        </p>
      )}
      <BotoesConfirmarFilial
        carregando={carregando}
        disabled={ocupado}
        onConfirmar={onConfirmar}
        onVoltar={onVoltar}
      />
    </>
  );
}

/**
 * O aviso ANTES do check-in (a prévia diz que barraria): sem RPC. O check-in
 * só sai pelo link "assim mesmo", que diz o custo e lê a posição de novo.
 */
function AvisoAntesDoCheckin({
  tituloRef,
  textos,
  variante,
  filial,
  aqui,
  escolha,
  ocupado,
  onResgate,
  onVoltar,
  onIncluir,
  onAssimMesmo,
}: {
  tituloRef: TituloRef;
  textos: TextosAviso;
  variante: "fora" | "sem_localizacao";
  filial: FilialOpcao;
  aqui: { slug: string; nome: string } | null;
  escolha: string | null;
  ocupado: boolean;
  onResgate: (slug: string) => void;
  onVoltar: () => void;
  onIncluir: () => void;
  onAssimMesmo: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display leading-snug outline-none"
        >
          <MapPinSimpleArea className="h-5 w-5 shrink-0 text-warning" /> {textos.titulo}
        </DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-1.5 text-foreground/90" data-testid="aviso-checkin-texto">
            {textos.orientacao && <p>{textos.orientacao}</p>}
            <p>{textos.consequencia}</p>
          </div>
        </DialogDescription>
      </DialogHeader>
      <CorpoAviso textos={textos} />
      <BotoesAviso
        variante={variante}
        filial={filial}
        aqui={aqui}
        escolha={escolha}
        disabled={ocupado}
        onResgate={() => aqui && onResgate(aqui.slug)}
        onVoltar={onVoltar}
        onIncluir={onIncluir}
        onAssimMesmo={onAssimMesmo}
      />
    </>
  );
}

/** Filial barrada pela localização: o porquê e as saídas. */
function Barrado({
  tituloRef,
  resultado,
  computador,
  escolha,
  ocupado,
  erro,
  resgate,
  onTentarDeNovo,
  onIncluirLocalizacao,
  onResgate,
  onEmCasa,
  onOutraFilial,
  onContinuar,
}: {
  tituloRef: TituloRef;
  resultado: ResultadoCheckin;
  computador: boolean;
  escolha: string | null;
  ocupado: boolean;
  erro: string | null;
  /** A leitura do painel diz que ele está noutra filial (o resgate). */
  resgate: { slug: string; nome: string } | null;
  onTentarDeNovo: (filial: string) => void;
  onIncluirLocalizacao: (filial: string) => void;
  onResgate: (slug: string) => void;
  onEmCasa: () => void;
  onOutraFilial: () => void;
  onContinuar: () => void;
}) {
  const c = resultado.presenca.checkin;
  const filial = c?.filial_slug ?? null;
  const semLocalizacao = c?.motivo === "sem_localizacao";
  // Sem localização na filial: lê o GPS ANTES de refazer (se falhar, nada é
  // gravado). Fora do raio: "Tentar de novo", como sempre.
  const incluir = semLocalizacao && !!filial;
  const girando = escolha !== null && escolha !== "casa" && escolha !== resgate?.slug;
  const titulo =
    c?.motivo === "sem_localizacao"
      ? computador
        ? "Sem a localização deste computador"
        : "Sem a localização do celular"
      : precisaoAproximada(c?.precisao_m)
        ? "A localização deste aparelho é aproximada"
        : `A localização não confirmou a filial ${c?.filial_nome ?? ""}`.trim();
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display leading-snug outline-none"
        >
          <WarningCircle className="h-5 w-5 shrink-0 text-warning" /> {titulo}
        </DialogTitle>
        <DialogDescription className="text-foreground/90" data-testid="checkin-barrado-motivo">
          {motivoDoResultado(resultado, { computador })}
        </DialogDescription>
      </DialogHeader>
      <div
        className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        data-testid="checkin-barrado-efeito"
      >
        <p>
          Seu check-in em {rotuloLocal(c?.modo ?? null, c?.filial_nome ?? null)} ficou registrado,
          mas não vale para as roletas nem para o reforço de hoje. Visitas marcadas pelo SDR
          continuam chegando.
        </p>
        <p className="text-foreground/80">
          {semLocalizacao
            ? "Chegou à loja depois? Inclua a localização pela faixa no topo do CRM ou pelo Check-in da barra lateral."
            : "Chegou à loja depois? Refaça o check-in pela faixa no topo do CRM ou pelo Check-in da barra lateral."}
        </p>
      </div>
      {resgate && (
        <ResgateAqui
          texto={`Pela localização, você está na filial ${resgate.nome}.`}
          nome={resgate.nome}
          carregando={escolha === resgate.slug}
          disabled={ocupado}
          onClick={() => onResgate(resgate.slug)}
        />
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível registrar o check-in: {erro}
        </p>
      )}
      <DialogFooter className="gap-2 sm:flex-wrap sm:justify-between sm:space-x-0">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          disabled={ocupado}
          onClick={onContinuar}
        >
          Continuar fora das roletas
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={ocupado} onClick={onEmCasa}>
            {escolha === "casa" ? (
              <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <House className="mr-1.5 h-4 w-4" />
            )}
            Estou em casa
          </Button>
          {incluir && filial ? (
            <Button type="button" disabled={ocupado} onClick={() => onIncluirLocalizacao(filial)}>
              {escolha === filial ? (
                <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MapPinSimpleArea className="mr-1.5 h-4 w-4" />
              )}
              Incluir localização
            </Button>
          ) : (
            <Button
              type="button"
              disabled={ocupado}
              onClick={() => (filial ? onTentarDeNovo(filial) : onOutraFilial())}
            >
              {girando ? (
                <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ArrowCounterClockwise className="mr-1.5 h-4 w-4" />
              )}
              Tentar de novo
            </Button>
          )}
        </div>
      </DialogFooter>
      <button
        type="button"
        className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
        disabled={ocupado}
        onClick={onOutraFilial}
      >
        Escolher outra filial
      </button>
    </>
  );
}

/** Em casa abaixo do mínimo de vendas: registrado, fora da roleta, CRM liberado. */
function Recusado({
  tituloRef,
  resultado,
  houveBarrado,
  onFechar,
}: {
  tituloRef: TituloRef;
  resultado: ResultadoCheckin;
  houveBarrado: boolean;
  onFechar: () => void;
}) {
  const c = resultado.presenca.checkin;
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display outline-none"
        >
          <House className="h-5 w-5 text-primary" /> Check-in feito:{" "}
          {rotuloLocal(c?.modo ?? null, c?.filial_nome ?? null)}
        </DialogTitle>
        <DialogDescription className="text-foreground/90" data-testid="checkin-recusado-motivo">
          {motivoDoResultado(resultado)}
        </DialogDescription>
      </DialogHeader>
      {houveBarrado && (
        <p
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          data-testid="checkin-recusado-reforco"
        >
          {AVISO_FORA_DO_REFORCO}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Você já pode usar o CRM: o check-in de hoje está feito.
      </p>
      <DialogFooter>
        <Button type="button" onClick={onFechar}>
          Entendi
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * O check-in deu erro técnico: tenta de novo nas opções, ou segue sem ele. No
 * voluntário, nada a liberar (o CRM não está preso): tente de novo ou feche.
 */
function ErroCheckin({
  erro,
  voluntario,
  onSeguir,
}: {
  erro: string;
  voluntario: boolean;
  onSeguir: () => void;
}) {
  if (voluntario) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
      >
        Não foi possível registrar o check-in ({erro}). Tente de novo ou feche esta janela.
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        Não foi possível registrar o check-in ({erro}). Tente de novo ou siga sem ele por hoje.
      </span>
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onSeguir}>
        Continuar sem check-in
      </Button>
    </div>
  );
}

export default CheckinObrigatorioGlobal;
