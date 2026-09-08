import { useMemo } from "react";
import { UsersThree } from "@phosphor-icons/react";
import { RankingRealXMeta } from "./ranking-real-x-meta";
import { RankingVendas } from "./ranking-vendas";
import { RankingProdutividade } from "./ranking-produtividade";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { AvatarCorretor, Painel } from "./ranking-ui";
import { Classificacao } from "./campeonato-views";
import {
  agregarMetas,
  fmtBRLCompacto,
  escopoDe,
  janelaMesAnteriorComparavel,
  normalizarCalendarioPacing,
  pesosDeConfig,
  somarTotais,
} from "./ranking-derive";
import {
  participantes,
  classificarGestores,
  conversaoCorretor,
  type RankingSnapshot,
} from "./ranking-campeonato";

function ConversaoCarteira({ snapshot }: { snapshot: RankingSnapshot }) {
  const data = participantes(snapshot)
    .filter((r) => r.categoria === "corretor")
    .map((r) => conversaoCorretor(snapshot, r.corretorId))
    .filter((r) => r !== null);
  const leads = data.reduce((n, r) => n + r.leads, 0);
  const convertidos = data.reduce((n, r) => n + r.convertidos, 0);
  const pct = leads ? (convertidos / leads) * 100 : null;
  return (
    <div className="smq-cohort">
      <strong>
        {pct === null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
      </strong>
      <p>
        {pct === null
          ? "Conversão ainda não apurada"
          : `${convertidos} de ${leads} leads com venda aprovada`}
      </p>
      <div className="smq-cohort-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${(pct ?? 0) / 100})` }} />
      </div>
      <p>
        Coorte da carteira atual. Ligações, visitas e vendas do período continuam nos indicadores;
        eventos independentes não formam uma taxa de conversão.
      </p>
    </div>
  );
}

/** Mesmas três visões familiares, alimentadas pelo snapshot completo e pelas permissões do CRM. */
export function RankingRefinado({
  snapshot,
  hoje,
  visao,
  tv = false,
  pagina = 0,
  onSelect,
  userKey,
}: {
  snapshot: RankingSnapshot;
  hoje: Date;
  visao: "metas" | "podio" | "produtividade";
  tv?: boolean;
  pagina?: number;
  onSelect?: (id: string) => void;
  userKey: string;
}) {
  const rows = useMemo(() => participantes(snapshot), [snapshot]);
  const corretores = rows.filter((r) => r.categoria === "corretor");
  const totais = somarTotais(rows);
  const [ano, mes] = snapshot.inicio.split("-").map(Number);
  const periodo = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const individual = snapshot.escopo === "individual";
  if (individual && visao !== "metas") {
    const me = corretores.find((r) => r.corretorId === userKey) ?? corretores[0];
    const metrics =
      visao === "produtividade"
        ? ([
            ["Pontos", me?.pontos],
            ["Ligações", me?.ligacoes],
            ["WhatsApp", me?.whatsapp],
            ["Agendamentos", me?.agendamentos],
            ["Visitas", me?.visitas],
            ["Documentações", me?.documentacoes],
            ["Vendas", me?.vendas],
          ] as const)
        : ([
            ["VGV", fmtBRLCompacto(me?.vgv ?? 0)],
            ["Vendas aprovadas", me?.vendas],
            ["Ticket médio", me?.vendas ? fmtBRLCompacto(me.vgv / me.vendas) : "—"],
            ["Visitas", me?.visitas],
            ["Agendamentos", me?.agendamentos],
          ] as const);
    return (
      <div className="smq-dashboard">
        <Painel
          titulo="Seu resultado no mês"
          descricao="Visão individual. A classificação da operação não está disponível neste perfil."
        >
          {me ? (
            <>
              <div className="smq-personal-heading">
                <AvatarCorretor nome={me.nome} foto={me.foto} />
                <strong>{me.nome}</strong>
                {onSelect && (
                  <button type="button" onClick={() => onSelect(me.corretorId)}>
                    Abrir análise comercial
                  </button>
                )}
              </div>
              <StatGrid>
                {metrics.map(([title, value]) => (
                  <StatTile key={title} title={title} value={value ?? 0} />
                ))}
              </StatGrid>
            </>
          ) : (
            <p>Nenhum resultado disponível neste mês.</p>
          )}
        </Painel>
      </div>
    );
  }
  const metas = agregarMetas(
    snapshot.metas,
    escopoDe(rows, snapshot.escopo === "operacao", snapshot.escopo !== "individual"),
  );
  if (visao === "metas")
    return (
      <div className="smq-dashboard smq-overview-meta">
        <RankingRealXMeta
          ano={ano}
          mes={mes}
          hoje={hoje}
          rankingMes={corretores}
          totaisMes={totais}
          totaisMesAnterior={somarTotais([])}
          janelaAnterior={janelaMesAnteriorComparavel(ano, mes, hoje)}
          comparacaoDisponivel={false}
          metas={snapshot.metas}
          metaTotais={metas}
          calendario={
            snapshot.calendario == null
              ? undefined
              : normalizarCalendarioPacing(snapshot.calendario)
          }
          individual={individual}
          exigirBaseProjecao
          podeGerirMetas={false}
          onSelect={onSelect}
          limiteRanking={tv ? 6 : 8}
        />
      </div>
    );
  if (visao === "podio")
    return (
      <div className="smq-dashboard smq-overview-sales">
        <RankingVendas
          ranking={corretores}
          totais={totais}
          periodoLabel={periodo}
          loading={false}
          incluirZerados
          onSelect={onSelect}
          userKey={userKey}
          limiteRanking={tv ? 6 : 8}
          paginaPodio={tv ? pagina : undefined}
          funilConteudo={<ConversaoCarteira snapshot={snapshot} />}
        />
        {!tv && (
          <Painel
            titulo="Gestores & equipes"
            icone={UsersThree}
            descricao="Classificação separada pelo VGV total de cada equipe"
          >
            <Classificacao rows={classificarGestores(snapshot)} gestor />
          </Painel>
        )}
      </div>
    );
  return (
    <div className="smq-dashboard smq-overview-productivity">
      <RankingProdutividade
        ranking={corretores}
        totais={totais}
        pesos={pesosDeConfig(snapshot.pesos)}
        mudancas={new Map()}
        periodoLabel={periodo}
        loading={false}
        incluirZerados
        onSelect={onSelect}
        userKey={userKey}
        limiteRanking={8}
      />
    </div>
  );
}
