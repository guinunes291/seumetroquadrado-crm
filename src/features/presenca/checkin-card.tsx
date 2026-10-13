// Card de check-in do corretor: "onde estou hoje?" em um toque.
//
// Filial = plantão: libera a roleta (com a exigência de localização ligada,
// só de dentro da loja). Em casa = libera só com o mínimo de vendas aprovadas
// no mês anterior (regra no banco, presenca_checkin). O card mostra a regra
// ANTES do clique — o corretor com 2 de 3 vendas em setembro vê, em outubro,
// que "Em casa" não libera, e por quê, antes de escolher.
//
// As opções (OpcoesCheckin) e a régua das vendas (RegraDasVendas) também
// formam o diálogo do check-in obrigatório (checkin-obrigatorio-global.tsx).
//
// A mesma proteção do diálogo: antes de qualquer check-in daqui, relê a
// presença na hora; se o check-in de hoje já liberou a roleta e o corretor
// não estava vendo isso quando tocou (a gestão confirmou no plantão, o
// celular fez, o interruptor liberou), NÃO chama a RPC — refazer encerraria a
// confirmação e gravaria um barrado novo. E enquanto o card mostra um
// check-in barrado pela localização, relê sozinho (15 s, aba e janela): o
// "Confirmar no plantão" da gestão tira o card do "fora da roleta".
//
// "Incluir minha localização" (13/10/2026): o mesmo painel do diálogo, entre
// a pergunta e as opções — lê o GPS ANTES da escolha e mostra a distância até
// cada filial. Tocar a filial onde ele está faz o check-in direto com a mesma
// leitura; tocar uma longe mostra o aviso no lugar das opções, sem RPC. No
// barrado sem localização, "Incluir localização" lê o GPS antes de refazer
// (se falhar, nada é gravado). O card também atende o pedido de check-in da
// barra lateral nesta tela (rola até aqui e põe o foco no título) — sem hook
// de router: o card só existe em /presenca e /meu-perfil.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CircleNotch, House, MapPinSimpleArea, SignOut, Storefront } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { INTENT_BADGE_BORDERED } from "@/lib/status-tones";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  AvisoAntesDoCheckinInline,
  BotoesAviso,
  CaixaEncerra,
  PainelIncluirLocalizacao,
} from "./incluir-localizacao";
import {
  avisoAntesDoCheckin,
  decidirToqueFilial,
  encerraDoVisto,
  fraseEncerra,
  previaDasFiliais,
  rotuloDaFilialNaPrevia,
  textoNovaTentativa,
  type Previa,
  type RotuloPrevia,
} from "./localizacao-previa";
import {
  ehComputador,
  iniciarLeituraDoCheckin,
  lerLocalizacaoAgora,
  registrarFalhaLocalizacao,
  useBuscarPresencaFresca,
  useCheckin,
  useCheckinsDoDia,
  useEncerrarPresenca,
  useMinhaPresenca,
  type LeituraIncluida,
} from "./presenca-client";
import {
  AVISO_COMPUTADOR,
  avisoJaNaRoleta,
  avisoLocalizacao,
  barradosSemDestrave,
  checkinAptoAberto,
  DICA_FORA_DA_FILIAL,
  enderecoCurto,
  jaNaRoletaSemSaber,
  leituraValida,
  localizacaoLabel,
  nomeDoMes,
  perguntaConfirmarFilial,
  precisaRefazerCheckin,
  situacaoHoje,
  type FalhaLocalizacao,
  type FilialOpcao,
  type MinhaPresenca,
  type Visto,
} from "./presenca-derive";
import { useLocalizacaoIncluida } from "./use-localizacao-incluida";
import { atenderPedidoCheckin, pedidoVigente, usePedidoCheckin } from "./use-checkin-obrigatorio";

// Movido para presenca-derive (o diálogo também usa); continua exportado daqui.
export { AVISO_COMPUTADOR } from "./presenca-derive";

/** O elemento com o foco saiu da tela (o foco caiu no body)? */
function focoPerdido(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  return !el || el === document.body;
}

/** O usuário pediu menos movimento? (jsdom e navegadores velhos não têm matchMedia.) */
function reduzMovimento(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function CheckinCard({ className }: { className?: string }) {
  const { user } = useAuth();
  // Barrado na tela: relê sozinho, para sair do "fora da roleta" quando a
  // gestão confirmar no plantão (ou o interruptor liberar).
  const q = useMinhaPresenca(true, { releitura: precisaRefazerCheckin });
  const checkin = useCheckin();
  const buscarPresencaFresca = useBuscarPresencaFresca();
  const encerrar = useEncerrarPresenca();
  // Barrado hoje e trocou para "Em casa": o card avisa que o reforço não volta.
  const doDia = useCheckinsDoDia(!!q.data?.dia && !!user, {
    dia: q.data?.dia ?? "",
    corretorId: user?.id,
  });
  // Qual opção foi clicada (o GPS pode levar alguns segundos).
  const [escolha, setEscolha] = useState<string | null>(null);
  // Por que o celular não deu a localização no último check-in daqui (só vale
  // para aquele check-in: a releitura pode trazer outro).
  const [falha, setFalha] = useState<{ id: string; falha: FalhaLocalizacao | null } | null>(null);
  // "Incluir localização" do barrado que falhou de novo (sem RPC): a linha
  // "2ª tentativa às 09:42: …" mostra que o toque fez alguma coisa.
  const [tentativa, setTentativa] = useState<{
    id: string;
    n: number;
    em: number;
    falha: FalhaLocalizacao;
  } | null>(null);
  // Filial tocada esperando o "Estou na loja" (com a exigência ligada), e o
  // check-in que o card mostrava no toque.
  const [confirmar, setConfirmar] = useState<{ filial: FilialOpcao; visto: Visto } | null>(null);
  // Filial tocada que a prévia diz que barraria: o aviso no lugar das opções.
  const [aviso, setAviso] = useState<{
    filial: FilialOpcao;
    visto: Visto;
    variante: "fora" | "sem_localizacao";
  } | null>(null);
  // A leitura do "Incluir minha localização": deste card, some ao sair da tela.
  const loc = useLocalizacaoIncluida();
  const pedido = usePedidoCheckin();
  const cardRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLDivElement>(null);
  const avisoTituloRef = useRef<HTMLParagraphElement>(null);

  // O pedido de check-in da barra lateral nesta tela: o card atende (rola até
  // aqui e põe o foco no título) — nunca dois check-ins na tela.
  const temDados = !!q.data;
  useEffect(() => {
    if (!pedido || !temDados || !pedidoVigente(pedido, Date.now())) return;
    atenderPedidoCheckin(pedido.id);
    cardRef.current?.scrollIntoView?.({
      block: "start",
      behavior: reduzMovimento() ? "auto" : "smooth",
    });
    tituloRef.current?.focus({ preventScroll: true });
  }, [pedido, temDados]);

  // O aviso apareceu: o foco vai para o título dele (o botão tocado sumiu).
  // Saiu (por qualquer caminho: o check-in, "Incluir de novo", o resgate) e o
  // foco ficou no vazio (o botão tocado também sumiu): volta ao título do card.
  const comAviso = !!aviso;
  const tinhaAviso = useRef(false);
  useEffect(() => {
    if (comAviso) avisoTituloRef.current?.focus();
    else if (tinhaAviso.current && focoPerdido()) tituloRef.current?.focus({ preventScroll: true });
    tinhaAviso.current = comAviso;
  }, [comAviso]);

  const filiais = q.data?.filiais;
  const previa: Previa | null = useMemo(
    () =>
      loc.estado.fase === "incluida" && loc.estado.coordenadas && filiais
        ? previaDasFiliais(loc.estado.leitura, filiais, loc.estado.coordenadas)
        : null,
    [loc.estado, filiais],
  );

  if (q.isLoading) return <Skeleton className={cn("h-72 w-full", className)} />;
  // Só sem nenhum dado: a releitura do barrado que falha (rede) mantém o card
  // com o último dado bom, e a próxima releitura tenta de novo.
  if (!q.data) {
    return (
      <QueryErrorState
        className={className}
        title="Não foi possível carregar o seu check-in."
        error={q.error}
        onRetry={() => q.refetch()}
      />
    );
  }

  const p = q.data;
  const computador = ehComputador();
  const barradoHoje = !!user && !!doDia.data && barradosSemDestrave(doDia.data).has(user.id);
  const falhaDaqui = falha && falha.id === p.checkin?.id ? falha.falha : null;
  const sit = situacaoHoje(p, { falhaLocalizacao: falhaDaqui, computador, barradoHoje });
  const aberto = p.checkin && !p.checkin.encerrado_em ? p.checkin : null;
  const ocupado = escolha !== null || checkin.isPending || encerrar.isPending;
  const evidencia =
    aberto?.modo === "loja" ? localizacaoLabel(aberto.localizacao, aberto.distancia_m) : null;

  const lendo = loc.estado.fase === "lendo";
  const barradoSemLocalizacao =
    precisaRefazerCheckin(p) && p.checkin?.motivo === "sem_localizacao" ? p.checkin : null;
  const nomes = Object.fromEntries(p.filiais.map((f) => [f.slug, f.nome]));
  const temCoordenadas = p.filiais.some((f) => f.tem_coordenadas);

  const registrar = async (
    modo: "loja" | "casa",
    filial: string | undefined,
    visto: Visto,
    opts: { leitura?: LeituraIncluida; previaDentro?: boolean; novaLeitura?: boolean } = {},
  ) => {
    setEscolha(filial ?? modo);
    // Refazendo depois de barrado (ou o "assim mesmo"): lê a posição agora,
    // não a de 1 min atrás.
    const novaLeitura = opts.novaLeitura ?? (modo === "loja" && precisaRefazerCheckin(p));
    // O GPS sai AGORA, ainda dentro do toque (o navegador mostra o pedido de
    // permissão), sem leitura incluída que valha. A releitura abaixo espera a
    // resposta: a gestão que confirma enquanto o GPS lê é vista e a leitura é
    // descartada.
    const leituraNoToque = iniciarLeituraDoCheckin({ modo, leitura: opts.leitura, novaLeitura });
    if (leituraNoToque) await leituraNoToque;
    // A presença de agora (sem cache): se o check-in de hoje já liberou a
    // roleta sem o corretor saber, avisa e não refaz. Falha na leitura não
    // impede o check-in.
    const fresca = await buscarPresencaFresca().catch(() => null);
    const jaVale = jaNaRoletaSemSaber(fresca, visto);
    if (jaVale) {
      toast.info(avisoJaNaRoleta(jaVale));
      setEscolha(null);
      setConfirmar(null);
      setAviso(null);
      return;
    }
    // A leitura venceu durante a espera: nada de RPC com posição velha — a
    // pergunta dessa filial, como antes do "Incluir".
    if (opts.leitura && !leituraValida(opts.leitura, Date.now())) {
      const f = p.filiais.find((x) => x.slug === filial);
      setEscolha(null);
      setAviso(null);
      if (f) setConfirmar({ filial: f, visto });
      return;
    }
    checkin.mutate(
      {
        modo,
        filial,
        novaLeitura,
        leitura: opts.leitura,
        leituraNoToque,
        previaDentro: opts.previaDentro,
        barradoHoje,
      },
      {
        onSuccess: (r) => setFalha({ id: r.presenca.checkin?.id ?? "", falha: r.falhaLocalizacao }),
        onSettled: () => {
          setEscolha(null);
          setConfirmar(null);
          setAviso(null);
          // A mutação leva a posição nas variáveis: some do react-query aqui.
          checkin.reset();
        },
      },
    );
  };

  /** A prévia disse "dentro" desta filial? */
  const previaDentro = (slug: string) => previa?.porFilial[slug]?.tipo === "dentro";

  /** O toque numa filial (ou no resgate): direto com a leitura, a pergunta ou o aviso. */
  const tocarFilial = (f: FilialOpcao, visto: Visto) => {
    const leitura = loc.leituraValidaAgora();
    const decisao = decidirToqueFilial({
      exige: p.exige_localizacao,
      filial: f,
      leitura,
      falhaRecente: loc.falhaRecenteAgora(),
      previa: leitura ? previa : null,
    });
    if (decisao === "direto") {
      return void registrar("loja", f.slug, visto, {
        leitura: leitura ?? undefined,
        previaDentro: previaDentro(f.slug),
      });
    }
    if (decisao === "confirmar") {
      setAviso(null);
      return setConfirmar({ filial: f, visto });
    }
    setAviso({ filial: f, visto, variante: decisao === "aviso_fora" ? "fora" : "sem_localizacao" });
  };

  // Com a exigência ligada, a filial pede confirmação (ou o aviso, com a
  // prévia): um toque "para ver" fora da loja vira check-in barrado e tira
  // das roletas e do reforço. O resgate do aviso passa por aqui também, com o
  // check-in que ele via quando tocou a filial (`visto`).
  const escolher = (modo: "loja" | "casa", filial?: string, visto: Visto = p.checkin) => {
    // Já na roleta nesta filial (GPS ou a gestão confirmando no plantão):
    // refazer só arriscaria rebaixar o check-in que vale.
    if (
      modo === "loja" &&
      aberto?.apto_roleta &&
      aberto.modo === "loja" &&
      aberto.filial_slug === filial
    ) {
      toast.info(avisoJaNaRoleta(aberto));
      setAviso(null);
      return;
    }
    const f = modo === "loja" ? p.filiais.find((x) => x.slug === filial) : undefined;
    if (f) return tocarFilial(f, visto);
    void registrar(modo, filial, visto);
  };

  /**
   * Barrado sem localização: lê o GPS ANTES de refazer. Se falhar, nada é
   * gravado (sem barrado repetido) e o cabeçalho mostra o passo a passo da
   * falha nova; se der, refaz na mesma filial com essa leitura.
   */
  const incluirLocalizacao = async (slug: string) => {
    const c = p.checkin;
    if (!c) return;
    setEscolha(slug);
    const r = await lerLocalizacaoAgora();
    if (!r.ok) {
      // Uma tentativa de check-in: conta no diagnóstico de "todo mundo barrado".
      registrarFalhaLocalizacao(r.falha);
      setFalha({ id: c.id, falha: r.falha });
      setTentativa((t) => ({
        id: c.id,
        n: t && t.id === c.id ? t.n + 1 : 2,
        em: Date.now(),
        falha: r.falha,
      }));
      setEscolha(null);
      return;
    }
    await registrar("loja", slug, c, { leitura: r.leitura });
  };

  const leituraAgora = loc.leituraValidaAgora();
  const aquiFora = (slug: string) =>
    leituraAgora && previa?.aqui && previa.aqui !== slug && !previa.aproximada
      ? { slug: previa.aqui, nome: nomes[previa.aqui] ?? previa.aqui }
      : null;
  const textosAviso = aviso
    ? avisoAntesDoCheckin({
        variante: aviso.variante,
        filial: aviso.filial.nome,
        conferencia: previa?.porFilial[aviso.filial.slug] ?? null,
        previa,
        falha: loc.estado.fase === "falhou" ? loc.estado.falha : null,
        computador,
        // "Continua fora das roletas" só se ele está fora delas agora: o
        // "Em casa" que vale depois de um barrado está nas roletas (o
        // reforço é que não volta).
        jaBarrado: precisaRefazerCheckin(p) || (barradoHoje && !checkinAptoAberto(p)),
        encerra: encerraDoVisto(p.checkin),
        aqui: aquiFora(aviso.filial.slug),
      })
    : null;
  const linhaTentativa =
    tentativa && tentativa.id === p.checkin?.id
      ? textoNovaTentativa(tentativa.n, tentativa.em, tentativa.falha, computador)
      : null;

  return (
    <Card ref={cardRef} className={className}>
      <CardHeader className="pb-3">
        <CardTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-base outline-none"
        >
          <Storefront className="h-5 w-5 text-primary" /> Check-in de hoje
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div
            role="status"
            className={cn("rounded-lg border px-4 py-3", INTENT_BADGE_BORDERED[sit.intent])}
          >
            <p className="font-semibold">{sit.titulo}</p>
            {sit.detalhe && <p className="mt-0.5 text-sm text-foreground/80">{sit.detalhe}</p>}
            {linhaTentativa && (
              <p className="mt-1 text-sm font-medium" data-testid="checkin-nova-tentativa">
                {linhaTentativa}
              </p>
            )}
            {evidencia && (
              <StatusBadge intent={evidencia.intent} className="mt-2">
                {evidencia.texto}
              </StatusBadge>
            )}
          </div>
          {barradoSemLocalizacao?.filial_slug && (
            <div
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              data-testid="card-incluir-localizacao-barrado"
            >
              <p className="text-sm">Está na loja? Inclua a localização para ser liberado.</p>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={ocupado}
                onClick={() => {
                  const slug = barradoSemLocalizacao.filial_slug;
                  if (slug) void incluirLocalizacao(slug);
                }}
              >
                {escolha === barradoSemLocalizacao.filial_slug ? (
                  <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <MapPinSimpleArea className="mr-1.5 h-4 w-4" />
                )}
                Incluir localização
              </Button>
            </div>
          )}
        </div>

        {confirmar ? (
          <ConfirmarFilial
            filial={confirmar.filial}
            encerra={fraseEncerra(encerraDoVisto(p.checkin))}
            carregando={escolha === confirmar.filial.slug}
            disabled={ocupado}
            computador={computador}
            // Depois de um barrado, a posição é lida na hora; sem barrado, vai
            // a leitura do painel, se ainda vale.
            onConfirmar={() => {
              const leitura = precisaRefazerCheckin(p)
                ? undefined
                : (loc.leituraValidaAgora() ?? undefined);
              void registrar("loja", confirmar.filial.slug, confirmar.visto, {
                leitura,
                previaDentro: !!leitura && previaDentro(confirmar.filial.slug),
              });
            }}
            onVoltar={() => setConfirmar(null)}
          />
        ) : (
          <div>
            <p className="mb-2 text-sm font-medium">Onde você está trabalhando hoje?</p>
            {temCoordenadas && (
              <div className="mb-3">
                <PainelIncluirLocalizacao
                  estado={loc.estado}
                  previa={previa}
                  nomes={nomes}
                  computador={computador}
                  desabilitado={ocupado}
                  regiaoPropria
                  // Com o aviso na tela, a região diz o título dele (os botões são os do aviso).
                  anuncio={textosAviso?.titulo}
                  // No barrado sem localização, o botão que vale é o "Incluir
                  // localização" lá de cima (refaz o check-in): um segundo,
                  // quase igual e que não grava nada, só confundiria.
                  controlesOcultos={!!aviso || !!barradoSemLocalizacao}
                  onIncluir={() => void loc.incluir()}
                  onCancelar={loc.cancelar}
                />
              </div>
            )}
            {aviso && textosAviso ? (
              <AvisoAntesDoCheckinInline textos={textosAviso} tituloRef={avisoTituloRef}>
                <BotoesAviso
                  variante={aviso.variante}
                  filial={aviso.filial}
                  aqui={aquiFora(aviso.filial.slug)}
                  escolha={escolha}
                  disabled={ocupado}
                  // O resgate passa pela trava "já na roleta nesta filial":
                  // nunca refaz (nem rebaixa) o check-in que vale lá.
                  onResgate={() => {
                    const aqui = aquiFora(aviso.filial.slug);
                    if (aqui) escolher("loja", aqui.slug, aviso.visto);
                  }}
                  onVoltar={() => {
                    setAviso(null);
                    tituloRef.current?.focus({ preventScroll: true });
                  }}
                  onIncluir={() => {
                    // Volta às opções e relê; nada de check-in depois.
                    setAviso(null);
                    void loc.incluir();
                  }}
                  onAssimMesmo={() =>
                    void registrar("loja", aviso.filial.slug, aviso.visto, { novaLeitura: true })
                  }
                />
              </AvisoAntesDoCheckinInline>
            ) : (
              <>
                <OpcoesCheckin
                  p={p}
                  previa={previa}
                  escolha={escolha}
                  disabled={ocupado || lendo}
                  onEscolher={escolher}
                  className="lg:grid-cols-4"
                />
                <p className="mt-2 text-xs text-muted-foreground">{DICA_FORA_DA_FILIAL}</p>
              </>
            )}
          </div>
        )}

        <RegraDasVendas p={p} />

        <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{avisoLocalizacao(p.exige_localizacao)}</p>
          {aberto && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={ocupado}
              onClick={() => encerrar.mutate()}
            >
              <SignOut className="mr-1.5 h-4 w-4" /> Encerrar presença
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * "Você está dentro da loja X agora?" — o passo antes do check-in na filial
 * com a exigência ligada (no card; o diálogo tem o seu, com o título). Com um
 * check-in valendo, diz o que o toque encerra (a mesma caixa do aviso).
 */
export function ConfirmarFilial({
  filial,
  encerra,
  carregando,
  disabled,
  computador,
  onConfirmar,
  onVoltar,
}: {
  filial: FilialOpcao;
  /** "Isso também encerra…" (fraseEncerra); null sem check-in valendo. */
  encerra: string | null;
  carregando: boolean;
  disabled: boolean;
  computador: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  const pergunta = perguntaConfirmarFilial(filial.nome);
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div>
        <p className="font-medium">{pergunta.titulo}</p>
        <p className="mt-0.5 text-sm text-foreground/80">{pergunta.detalhe}</p>
        {computador && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
            <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0" />
            {AVISO_COMPUTADOR}
          </p>
        )}
      </div>
      {encerra && <CaixaEncerra texto={encerra} testId="confirmar-checkin-encerra" />}
      <BotoesConfirmarFilial
        carregando={carregando}
        disabled={disabled}
        onConfirmar={onConfirmar}
        onVoltar={onVoltar}
      />
    </div>
  );
}

/** [Voltar] [Estou na loja] — o card e o diálogo usam os mesmos. */
export function BotoesConfirmarFilial({
  carregando,
  disabled,
  onConfirmar,
  onVoltar,
}: {
  carregando: boolean;
  disabled: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={disabled} onClick={onVoltar}>
        Voltar
      </Button>
      <Button type="button" disabled={disabled} onClick={onConfirmar}>
        {carregando ? (
          <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Storefront className="mr-1.5 h-4 w-4" />
        )}
        Estou na loja
      </Button>
    </div>
  );
}

/**
 * As filiais ativas e "Em casa", um toque cada. A opção do check-in aberto de
 * hoje fica marcada só se ele liberou a roleta (o barrado e o "Em casa" abaixo
 * do mínimo não aparecem como escolha feita); `escolha` = a que está
 * confirmando (o GPS leva segundos).
 */
export function OpcoesCheckin({
  p,
  escolha,
  disabled,
  onEscolher,
  className,
  previa,
}: {
  p: MinhaPresenca;
  escolha: string | null;
  disabled: boolean;
  onEscolher: (modo: "loja" | "casa", filial?: string) => void;
  className?: string;
  /**
   * A prévia do "Incluir minha localização": a distância no lugar do endereço
   * e "Você está aqui" em destaque. Sem ela, as opções ficam como sempre. A
   * ordem nunca muda (nada sai de baixo do dedo).
   */
  previa?: Previa | null;
}) {
  const aberto = p.checkin && !p.checkin.encerrado_em && p.checkin.apto_roleta ? p.checkin : null;
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {p.filiais.map((f) => (
        <OpcaoFilial
          key={f.slug}
          filial={f}
          rotulo={previa ? rotuloDaFilialNaPrevia(previa, f.slug) : null}
          selecionada={aberto?.modo === "loja" && aberto.filial_slug === f.slug}
          carregando={escolha === f.slug}
          disabled={disabled}
          onClick={() => onEscolher("loja", f.slug)}
        />
      ))}
      <OpcaoCasa
        p={p}
        selecionada={aberto?.modo === "casa"}
        carregando={escolha === "casa"}
        disabled={disabled}
        onClick={() => onEscolher("casa")}
      />
    </div>
  );
}

function OpcaoBotao({
  icone,
  titulo,
  detalhe,
  selecionada,
  carregando,
  disabled,
  onClick,
  aviso,
  aqui,
  sucesso,
}: {
  icone: React.ReactNode;
  titulo: string;
  detalhe: string | null;
  selecionada: boolean;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
  aviso?: boolean;
  /** "Você está aqui" (a prévia): o destaque em verde. */
  aqui?: boolean;
  /** O detalhe em verde (dentro do raio). */
  sucesso?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selecionada}
      className={cn(
        "flex min-h-[84px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        "hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
        // O check-in que vale manda na borda; senão, o "Você está aqui".
        selecionada
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : aqui && "border-success bg-success/10 ring-1 ring-success",
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {carregando ? <CircleNotch className="h-4 w-4 animate-spin" /> : icone}
        {titulo}
      </span>
      {detalhe && (
        <span
          className={cn(
            "text-xs",
            aviso ? "text-warning" : aqui || sucesso ? "text-success" : "text-muted-foreground",
          )}
        >
          {carregando ? "Confirmando…" : detalhe}
        </span>
      )}
    </button>
  );
}

function OpcaoFilial(props: {
  filial: FilialOpcao;
  /** O rótulo da prévia (null = o endereço, como sempre). */
  rotulo: RotuloPrevia | null;
  selecionada: boolean;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { rotulo } = props;
  return (
    <OpcaoBotao
      icone={<Storefront className="h-4 w-4 text-primary" />}
      titulo={props.filial.nome}
      detalhe={rotulo?.texto ?? enderecoCurto(props.filial.endereco) ?? "Plantão: libera a roleta"}
      aqui={rotulo?.aqui}
      sucesso={rotulo?.intent === "success"}
      selecionada={props.selecionada}
      carregando={props.carregando}
      disabled={props.disabled}
      onClick={props.onClick}
    />
  );
}

function OpcaoCasa(props: {
  p: MinhaPresenca;
  selecionada: boolean;
  carregando: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { p } = props;
  const mes = nomeDoMes(p.mes_referencia);
  return (
    <OpcaoBotao
      icone={<House className="h-4 w-4 text-primary" />}
      titulo="Em casa"
      detalhe={
        p.casa_liberada
          ? `Libera a roleta (meta de ${mes} batida)`
          : `Não libera a roleta: ${p.vendas_mes_anterior} de ${p.vendas_minimas} vendas em ${mes}`
      }
      aviso={!p.casa_liberada}
      selecionada={props.selecionada}
      carregando={props.carregando}
      disabled={props.disabled}
      onClick={props.onClick}
    />
  );
}

/**
 * "2 de 3 vendas aprovadas em setembro" — a régua do trabalho em casa. Conta o
 * MÊS ANTERIOR: vale o mês inteiro e não zera no dia 1º.
 */
export function RegraDasVendas({ p }: { p: MinhaPresenca }) {
  if (p.vendas_minimas <= 0) return null;
  const mes = nomeDoMes(p.mes_referencia);
  const pct = Math.min(100, Math.round((100 * p.vendas_mes_anterior) / p.vendas_minimas));
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          Vendas aprovadas em {mes}:{" "}
          <strong>
            {p.vendas_mes_anterior} de {p.vendas_minimas}
          </strong>
        </span>
        <span className="text-xs text-muted-foreground">
          {p.casa_liberada
            ? "este mês, pode receber leads de casa"
            : "este mês, a roleta só libera no plantão"}
        </span>
      </div>
      <Progress
        value={pct}
        className="mt-2 h-1.5"
        aria-label={`${p.vendas_mes_anterior} de ${p.vendas_minimas} vendas em ${mes}`}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Conta as vendas assinadas em {mes} e aprovadas no CRM (sem distrato).
      </p>
    </div>
  );
}
