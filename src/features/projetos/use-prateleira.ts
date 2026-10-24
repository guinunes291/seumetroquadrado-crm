// Projetos em Foco — estado da prateleira: leituras, filtros, preferências,
// derivados (itens, corredores, contagens) e os gestos dos cards.
// Recortado de projetos-foco-page.tsx sem mudança de comportamento.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePreference } from "@/hooks/use-preference";
import { useWhatsAppLead } from "@/hooks/use-whatsapp-lead";
import { formatBRL, PAPEIS_CATALOGO } from "@/lib/projetos";
import { usePublicarFaseDoLead } from "@/features/nav/contexto-jornada";
import {
  aplicarFiltros,
  contarPorConstrutora,
  FILTROS_VAZIOS,
  focosPorProjeto,
  montarItem,
  montarPrateleira,
  noEscopoDoCorretor,
  ordenar,
  type FiltrosPrateleira,
  type ItemPrateleira,
  type OrdenacaoPrateleira,
} from "@/lib/prateleira";
import { parseRenda } from "@/lib/renda";
import { mensagemEmpreendimento, WHATSAPP_TITULO_EMPREENDIMENTO } from "@/lib/whatsapp";
import { toggleVitrineShortlist, VITRINE_MAX_PROJETOS } from "@/lib/vitrine-publica";
import { SEM_ZONA, ZONAS_PROJETO_ORDEM, type ZonaFiltro } from "@/lib/zonas";
import type { MaterialTipo } from "./produto-card";
import { useConstrutorasParceiras } from "./use-construtoras-parceiras";
import {
  useDemandaPrateleira,
  useFocosPrateleira,
  useLeadDaPrateleira,
  useProjetosPrateleira,
} from "./use-prateleira-dados";
import { useRegistrarEventoProjeto } from "./use-projeto-eventos";
import { montarResumoProjeto } from "./resumo-projeto";
import { LOTE } from "./prateleira-pecas";

export function usePrateleira(leadId: string | undefined) {
  const { isAdmin, isGestor, roles } = useUserRoles();
  const podeGerir = isAdmin || isGestor;
  const podeVerCatalogo = roles.some((r) => PAPEIS_CATALOGO.includes(r));
  const isMobile = useIsMobile();
  const abrirWhatsApp = useWhatsAppLead();
  const registrarEvento = useRegistrarEventoProjeto();

  const projetosQ = useProjetosPrateleira();
  const focosQ = useFocosPrateleira();
  const demandaQ = useDemandaPrateleira();
  const parceirasQ = useConstrutorasParceiras();

  const leadQ = useLeadDaPrateleira(leadId);
  const lead = leadQ.data ?? null;
  // Com lead em contexto a prateleira é passo da jornada (montar seleção): a
  // sidebar mantém o hub da fase do lead. Sem lead, é consulta de estoque.
  usePublicarFaseDoLead(leadId ? (lead?.status ?? null) : null);

  const [filtros, setFiltros] = useState<FiltrosPrateleira>(FILTROS_VAZIOS);
  const set = (patch: Partial<FiltrosPrateleira>) => setFiltros((f) => ({ ...f, ...patch }));
  const [ordem, setOrdem] = usePreference<OrdenacaoPrateleira>("prateleira:ordem", "relevancia");
  const [viewPref, setViewPref] = usePreference<"grade" | "lista">("prateleira:view", "grade");
  const view: "grade" | "lista" = isMobile ? "grade" : viewPref;
  const [favoritos, setFavoritos] = usePreference<string[]>("prateleira:favoritos", []);
  const favoritosSet = useMemo(() => new Set(favoritos), [favoritos]);
  const [sacolaIds, setSacolaIds] = useState<string[]>([]);
  const [enviarItem, setEnviarItem] = useState<ItemPrateleira | null>(null);
  const [reportarItem, setReportarItem] = useState<ItemPrateleira | null>(null);
  const [gerirOpen, setGerirOpen] = useState(false);
  const [limite, setLimite] = useState(LOTE);

  // A renda informada no dossiê pré-preenche a barra uma vez; o corretor pode mudar.
  const rendaDoLeadAplicada = useRef(false);
  useEffect(() => {
    if (lead?.renda_informada && !rendaDoLeadAplicada.current) {
      rendaDoLeadAplicada.current = true;
      const renda = parseRenda(lead.renda_informada);
      if (renda != null) setFiltros((f) => ({ ...f, renda }));
    }
  }, [lead]);

  const parceiras = useMemo(
    () => (parceirasQ.data?.parceiras ?? []).filter((p) => p.ativo),
    [parceirasQ.data],
  );
  // Sem tabela no ambiente, a lista é o fallback local: não há onde gravar,
  // então a gestão não aparece prometendo uma edição que não persiste.
  const podeGerirParceiras = podeGerir && parceirasQ.data?.origem === "banco";

  // "Agora" congela por carga de dados: campanhas e selos não piscam a cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcular quando os dados chegam é o comportamento desejado
  const agora = useMemo(() => Date.now(), [projetosQ.data, focosQ.data]);
  const focos = useMemo(() => focosPorProjeto(focosQ.data ?? [], agora), [focosQ.data, agora]);
  // Corretor fica com foco + parceiras; a gestão enxerga a prateleira inteira.
  const itens = useMemo(() => {
    const todos = (projetosQ.data ?? []).map((p) =>
      montarItem(p, { parceiras, focos, demanda: demandaQ.data, agora }),
    );
    return podeVerCatalogo ? todos : todos.filter(noEscopoDoCorretor);
  }, [projetosQ.data, parceiras, focos, demandaQ.data, agora, podeVerCatalogo]);

  // Base das contagens dos filtros: o que está na prateleira (sem os demais filtros).
  const visiveis = useMemo(
    () =>
      aplicarFiltros(itens, { ...FILTROS_VAZIOS, mostrarIncompletos: filtros.mostrarIncompletos }),
    [itens, filtros.mostrarIncompletos],
  );
  const filtrados = useMemo(
    () => aplicarFiltros(itens, filtros, favoritosSet),
    [itens, filtros, favoritosSet],
  );
  const ordenados = useMemo(
    () => ordenar(filtrados, ordem, parceiras),
    [filtrados, ordem, parceiras],
  );

  const zonas = useMemo(() => {
    const c = new Map<ZonaFiltro, number>();
    for (const i of visiveis) {
      const z: ZonaFiltro = i.zona ?? SEM_ZONA;
      c.set(z, (c.get(z) ?? 0) + 1);
    }
    const ordemChips: readonly ZonaFiltro[] = [...ZONAS_PROJETO_ORDEM, SEM_ZONA];
    return ordemChips
      .filter((z) => (c.get(z) ?? 0) > 0)
      .map((z) => ({ zona: z, total: c.get(z)! }));
  }, [visiveis]);
  const construtoras = useMemo(
    () => contarPorConstrutora(visiveis, parceiras),
    [visiveis, parceiras],
  );
  const incompletosOcultos = filtros.mostrarIncompletos ? 0 : itens.length - visiveis.length;

  const filtroAtivo =
    filtros.busca.trim().length > 0 ||
    filtros.zona != null ||
    filtros.construtora != null ||
    filtros.precoMax != null ||
    filtros.dorms != null ||
    filtros.situacao != null ||
    filtros.comMaterial ||
    filtros.soFavoritos ||
    (filtros.soQueCabe && filtros.renda != null);
  const filtrosAtivos = [
    filtros.zona,
    filtros.construtora,
    filtros.precoMax,
    filtros.dorms,
    filtros.situacao,
    filtros.comMaterial || null,
    filtros.soFavoritos || null,
    filtros.soQueCabe && filtros.renda != null ? true : null,
  ].filter((v) => v != null && v !== false).length;
  const limparFiltros = () =>
    setFiltros((f) => ({
      ...FILTROS_VAZIOS,
      renda: f.renda,
      mostrarIncompletos: f.mostrarIncompletos,
    }));

  // Corredores só na leitura padrão; qualquer filtro ou ordenação vira resultado plano.
  const modoCorredores = ordem === "relevancia" && !filtroAtivo;
  const prateleira = useMemo(() => montarPrateleira(ordenados, parceiras), [ordenados, parceiras]);

  useEffect(() => setLimite(LOTE), [filtros, ordem, view]);

  const sacola = useMemo(
    () =>
      sacolaIds.map((id) => itens.find((i) => i.id === id)).filter((i): i is ItemPrateleira => !!i),
    [sacolaIds, itens],
  );
  const sacolaSet = useMemo(() => new Set(sacolaIds), [sacolaIds]);

  // ----- gestos --------------------------------------------------------------

  const favoritar = (item: ItemPrateleira) =>
    setFavoritos((atual) =>
      atual.includes(item.id) ? atual.filter((id) => id !== item.id) : [...atual, item.id],
    );

  const comparar = (item: ItemPrateleira) => {
    const entrando = !sacolaSet.has(item.id);
    setSacolaIds((atual) => toggleVitrineShortlist(atual, item.id));
    if (entrando) registrarEvento({ tipo: "sacola_add", projetoId: item.id, leadId });
  };

  const abrirMaterial = (item: ItemPrateleira, tipo: MaterialTipo) =>
    registrarEvento({
      tipo: tipo === "book" ? "book_abrir" : "tabela_abrir",
      projetoId: item.id,
      leadId,
    });

  const copiarResumo = (item: ItemPrateleira) => {
    navigator.clipboard
      .writeText(montarResumoProjeto(item))
      .then(() => {
        toast.success("Resumo copiado — cole no WhatsApp do cliente.");
        registrarEvento({ tipo: "resumo_copiar", projetoId: item.id, leadId });
      })
      .catch(() => toast.error("Não foi possível copiar o resumo."));
  };

  const enviar = (item: ItemPrateleira) => {
    if (lead?.telefone) {
      const precoLabel =
        item.sob_consulta || item.preco_a_partir == null
          ? "Sob consulta"
          : formatBRL(item.preco_a_partir);
      abrirWhatsApp(
        { id: lead.id, nome: lead.nome, telefone: lead.telefone },
        {
          mensagem: mensagemEmpreendimento(lead.nome, {
            nome: item.nome,
            bairro: item.local.bairro,
            zona: item.zona,
            precoLabel,
            bookUrl: item.book_url,
          }),
          titulo: `${WHATSAPP_TITULO_EMPREENDIMENTO}: ${item.nome}`,
        },
      );
      registrarEvento({ tipo: "enviar_lead", projetoId: item.id, leadId: lead.id });
      return;
    }
    setEnviarItem(item);
  };

  const abrirFicha = (item: ItemPrateleira) =>
    registrarEvento({ tipo: "ficha_abrir", projetoId: item.id, leadId });

  const cardProps = (item: ItemPrateleira) => ({
    item,
    variante: view,
    renda: filtros.renda,
    favorito: favoritosSet.has(item.id),
    onFavoritar: favoritar,
    emComparacao: sacolaSet.has(item.id),
    comparacaoCheia: sacolaIds.length >= VITRINE_MAX_PROJETOS,
    onComparar: comparar,
    onEnviar: enviar,
    onAbrirMaterial: abrirMaterial,
    onCopiarResumo: copiarResumo,
    onReportarErro: (i: ItemPrateleira) => setReportarItem(i),
    onAbrirFicha: abrirFicha,
    mostrarComissao: podeGerir,
  });

  return {
    projetosQ,
    parceirasQ,
    podeGerir,
    podeGerirParceiras,
    podeVerCatalogo,
    isMobile,
    lead,
    filtros,
    set,
    ordem,
    setOrdem,
    view,
    viewPref,
    setViewPref,
    favoritos,
    setSacolaIds,
    enviarItem,
    setEnviarItem,
    reportarItem,
    setReportarItem,
    gerirOpen,
    setGerirOpen,
    limite,
    setLimite,
    itens,
    visiveis,
    ordenados,
    zonas,
    construtoras,
    incompletosOcultos,
    filtroAtivo,
    filtrosAtivos,
    limparFiltros,
    modoCorredores,
    prateleira,
    sacola,
    registrarEvento,
    enviar,
    abrirMaterial,
    abrirFicha,
    cardProps,
  };
}
