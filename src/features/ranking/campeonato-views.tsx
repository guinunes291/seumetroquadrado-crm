import { useRef, useState } from "react";
import { useAurumReorder } from "./aurum-motion";
import {
  ArrowUpRight,
  CalendarCheck,
  ChartLineUp,
  CheckCircle,
  Clock,
  Crown,
  Phone,
  Target,
  Trophy,
  WhatsappLogo,
  FileText,
  MapPin,
} from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { dateKey, diasNoMes } from "@/lib/periodo";
import {
  agregarMetas,
  decomporPontos,
  escopoDe,
  fmtBRL,
  fmtBRLCompacto,
  formatNum,
  iniciais,
  metasPorCorretor,
  NIVEL_META_LABEL,
  normalizarCalendarioPacing,
  pesosDeConfig,
  pesosDivergem,
  posicaoDoMes,
  projetarMes,
  somarTotais,
  type RankRow,
} from "./ranking-derive";
import {
  classificacaoCompleta,
  conversaoCorretor,
  destaques,
  LINHAS_TV,
  participantes,
  type Classificado,
  type GestorClassificado,
  type RankingSnapshot,
} from "./ranking-campeonato";

export function Foto({
  nome,
  foto,
  className,
}: {
  nome: string;
  foto: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("arena-foto", className)}>
      {foto && <AvatarImage src={foto} alt={nome} className="object-cover" />}
      <AvatarFallback>{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}
export function Numero({ valor, moeda = false }: { valor: number; moeda?: boolean }) {
  return (
    <span className="arena-numero" title={moeda ? fmtBRL(valor) : undefined}>
      {moeda ? fmtBRLCompacto(valor) : formatNum(valor)}
    </span>
  );
}
export function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="arena-empty">
      <Trophy weight="duotone" aria-hidden="true" />
      <h3>{titulo}</h3>
      <p>{texto}</p>
    </div>
  );
}
export function CabecalhoVisao({
  indice,
  titulo,
  detalhe,
}: {
  indice: string;
  titulo: string;
  detalhe: string;
}) {
  return (
    <div className="arena-section-heading">
      <div>
        <span className="arena-eyebrow">{indice}</span>
        <h2>{titulo}</h2>
      </div>
      <p>{detalhe}</p>
    </div>
  );
}

export function PodioCampeonato({
  rows,
  snapshot,
  hoje,
  pagina = 0,
  onSelect,
  tv = false,
  userKey,
}: {
  rows: Classificado[];
  tv?: boolean;
  userKey?: string;
  snapshot: RankingSnapshot;
  hoje: Date;
  pagina?: number;
  onSelect?: (id: string) => void;
}) {
  const elegiveis = rows.filter((r) => r.pos > 0 && r.pos <= 3);
  const paginas = Math.max(1, Math.ceil(elegiveis.length / 3));
  const [paginaManual, setPaginaManual] = useState(0);
  const atualPagina = (tv ? pagina : paginaManual) % paginas;
  const podio = elegiveis.slice(atualPagina * 3, atualPagina * 3 + 3);
  const temEmpate = podio.some((r) => r.empatado);
  const pessoal = snapshot.escopo === "individual" ? rows[0] : undefined;
  const t = somarTotais(participantes(snapshot));
  const atual = snapshot.inicio.slice(0, 7) === dateKey(hoje).slice(0, 7);
  return (
    <div className="arena-podium-view">
      <CabecalhoVisao
        indice="Seu Metro Quadrado / Arena Aurum"
        titulo="Ranking de vendas"
        detalhe={
          paginas > 1
            ? `Pódio · grupo ${atualPagina + 1} de ${paginas} · empates preservados`
            : "Classificação por VGV · desempate por vendas"
        }
      />
      <div className="arena-podium-layout">
        <div
          className={cn("arena-podium", temEmpate && "arena-podium-tied")}
          role="list"
          aria-label="Pódio dos corretores"
        >
          <div className="aurum-stage-light" aria-hidden="true" />
          <div className="aurum-stage-floor" aria-hidden="true" />
          {pessoal ? (
            <div className="aurum-personal">
              <Foto nome={pessoal.nome} foto={pessoal.foto} />
              <span className="arena-eyebrow">Seu resultado no mês</span>
              <h3>{pessoal.nome}</h3>
              <Numero valor={pessoal.vgv} moeda />
              <strong>{pessoal.vendas} vendas aprovadas</strong>
              <p>Visão individual. Classificação da operação indisponível neste perfil.</p>
              {onSelect && (
                <button type="button" onClick={() => onSelect(pessoal.corretorId)}>
                  Abrir análise comercial
                </button>
              )}
            </div>
          ) : podio.length === 0 ? (
            <Vazio
              titulo={rows.length ? "Pódio em aberto" : "Nenhum participante disponível"}
              texto={
                rows.length
                  ? "O pódio abre com a primeira venda aprovada do mês."
                  : "Não há profissionais no escopo desta consulta."
              }
            />
          ) : (
            podio.map((r) => (
              <div
                key={r.corretorId}
                role="listitem"
                className={cn("aurum-podium-item", `arena-place-${r.pos}`)}
              >
                <button
                  data-tilt
                  data-self={r.corretorId === userKey || undefined}
                  type="button"
                  disabled={!onSelect}
                  onClick={() => onSelect?.(r.corretorId)}
                  className={cn("arena-contender", `arena-place-${r.pos}`)}
                  aria-label={`Analisar ${r.nome}, ${r.pos}º lugar${r.empatado ? ", empatado" : ""}`}
                >
                  <div className="arena-portrait-stage">
                    <span className="arena-ordinal" aria-hidden="true">
                      {String(r.pos).padStart(2, "0")}
                    </span>
                    <div className="arena-portrait">
                      <span className="aurum-metal-shine" aria-hidden="true" />
                      <Foto nome={r.nome} foto={r.foto} />
                      <span className="arena-portrait-caption" aria-hidden="true">
                        {r.pos === 1 && <Crown weight="fill" />} {r.pos}º LUGAR
                      </span>
                    </div>
                  </div>
                  <h3>{r.nome}</h3>
                  <span className="arena-place-label">
                    {r.empatado
                      ? "Posição compartilhada"
                      : r.pos === 1
                        ? "Liderança do mês"
                        : `${r.pos}º lugar no mês`}
                  </span>
                  <span className="aurum-delta" title="Ainda não há uma base histórica comparável">
                    — Sem comparação
                  </span>
                  <div className="arena-podium-score">
                    <Numero valor={r.vgv} moeda />
                    <span>VGV vendido</span>
                    <strong>
                      {r.vendas} {r.vendas === 1 ? "venda aprovada" : "vendas aprovadas"}
                    </strong>
                  </div>
                </button>
              </div>
            ))
          )}
        </div>
        <aside className="arena-scoreboard">
          <span className="arena-eyebrow">
            {snapshot.escopo === "individual" ? "Seu resultado" : "Resultado do time"}
          </span>
          <div className="arena-award" aria-hidden="true">
            <img
              src="/images/ranking/trofeu-smq.webp"
              alt=""
              width={675}
              height={1200}
              decoding="async"
            />
          </div>
          <Numero valor={t.vgv} moeda />
          <p>em vendas aprovadas no mês</p>
          <div className="arena-scoreboard-bottom">
            <div>
              <strong>{formatNum(t.vendas)}</strong>
              <span>vendas</span>
            </div>
            <div>
              <strong>{t.corretoresComVenda}</strong>
              <span>profissionais venderam</span>
            </div>
          </div>
        </aside>
      </div>
      {!tv && paginas > 1 && (
        <div className="aurum-podium-pagination">
          <button type="button" onClick={() => setPaginaManual((p) => (p + paginas - 1) % paginas)}>
            Anterior
          </button>
          <span>
            Empates no pódio · {atualPagina + 1}/{paginas}
          </span>
          <button type="button" onClick={() => setPaginaManual((p) => (p + 1) % paginas)}>
            Próximos
          </button>
        </div>
      )}
      <div className="arena-highlights">
        {atual ? (
          (["semana", "dia"] as const).map((janela) => {
            const lideres = destaques(snapshot, hoje, janela);
            return (
              <div className="arena-highlight" key={janela}>
                <span className="arena-highlight-icon">
                  {janela === "dia" ? <Crown /> : <ChartLineUp />}
                </span>
                <div>
                  <span className="arena-eyebrow">
                    {janela === "dia" ? "Destaque de hoje" : "Destaque da semana no mês"}
                  </span>
                  <strong>
                    {lideres.length
                      ? lideres.length > 1
                        ? `${lideres.length} profissionais dividem a liderança`
                        : lideres[0].nome
                      : "Sem vendas nesta janela"}
                  </strong>
                  <span>
                    {lideres.length
                      ? `${fmtBRLCompacto(lideres[0].vgv)} · ${lideres[0].vendas} venda(s)${lideres.length > 1 ? " cada · empate" : ""}`
                      : "Aguardando uma venda aprovada"}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="arena-highlight">
            <CheckCircle />
            <div>
              <span className="arena-eyebrow">Ciclo encerrado</span>
              <strong>Resultado do período selecionado.</strong>
              <span>Resultado líquido de aprovações e estornos do mês selecionado.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Classificacao({
  rows,
  gestor = false,
  tv = false,
  pagina = 0,
  onSelect,
  userKey,
  embedded = false,
  leaderVgv,
  individual = false,
}: {
  individual?: boolean;
  userKey?: string;
  embedded?: boolean;
  leaderVgv?: number;
  rows: (Classificado & { equipes?: string[] })[];
  gestor?: boolean;
  tv?: boolean;
  pagina?: number;
  onSelect?: (id: string) => void;
}) {
  const visiveis = tv ? rows.slice(pagina * LINHAS_TV, (pagina + 1) * LINHAS_TV) : rows;
  const listRoot = useRef<HTMLDivElement>(null);
  useAurumReorder(listRoot, visiveis.map((r) => r.corretorId).join("|"));
  const lider = leaderVgv ?? Math.max(...rows.map((r) => r.vgv), 0);
  const paginas = Math.max(1, Math.ceil(rows.length / LINHAS_TV));
  return (
    <div className={cn("arena-classification-view", embedded && "aurum-classification-embedded")}>
      <CabecalhoVisao
        indice={gestor ? "03 / Liderança" : "02 / Classificação"}
        titulo={
          gestor ? "Gestores & equipes" : embedded ? "Demais posições" : "Classificação geral"
        }
        detalhe={
          tv
            ? `Grupo ${pagina + 1} de ${paginas} · ${rows.length} ${gestor ? "gestores" : "corretores"}`
            : "VGV vendido ↓ · vendas como desempate"
        }
      />
      {!rows.length ? (
        <Vazio
          titulo={gestor ? "Nenhum gestor neste escopo" : "Nenhum corretor neste escopo"}
          texto={
            gestor
              ? "A classificação depende dos vínculos de equipe e das permissões da sua conta."
              : "Os participantes aparecem conforme os perfis ativos e suas permissões."
          }
        />
      ) : (
        <div
          ref={listRoot}
          className={cn(
            "arena-ranking-table",
            gestor && visiveis.length <= 3 && "arena-managers-short",
          )}
          role="table"
          aria-label={gestor ? "Classificação dos gestores" : "Classificação dos corretores"}
        >
          <div role="row" className="arena-ranking-head">
            <span role="columnheader">Pos.</span>
            <span role="columnheader">{gestor ? "Gestor / equipe" : "Corretor"}</span>
            <span role="columnheader">VGV vendido</span>
            <span role="columnheader">Vendas</span>
            {!gestor && <span aria-hidden="true" />}
          </div>
          {visiveis.map((r) => (
            <div
              className={cn("arena-ranking-row", r.pos === 1 && "arena-ranking-leader")}
              role="row"
              data-tilt={onSelect ? true : undefined}
              data-ranking-id={r.corretorId}
              data-self={userKey === r.corretorId || undefined}
              key={r.corretorId}
            >
              <span className="arena-ranking-position" role="cell">
                {!individual && r.pos ? String(r.pos).padStart(2, "0") : "—"}
              </span>
              <div className="arena-ranking-person" role="cell">
                <Foto nome={r.nome} foto={r.foto} />
                <div>
                  {!gestor && onSelect ? (
                    <button type="button" onClick={() => onSelect(r.corretorId)}>
                      {r.nome}
                    </button>
                  ) : (
                    <strong>{r.nome}</strong>
                  )}
                  <span>
                    {individual
                      ? "Escopo individual · sem classificação global"
                      : gestor && r.equipes
                        ? `${r.equipes.join(" · ")}${r.empatado ? " · Empate em VGV e vendas" : ""}`
                        : r.pos === 0
                          ? "Em busca da primeira venda"
                          : r.empatado
                            ? "Empatado em VGV e vendas"
                            : r.pos === 1
                              ? "Liderança do mês"
                              : "Sem comparação histórica"}
                  </span>
                </div>
              </div>
              <span role="cell" className="arena-ranking-vgv">
                <span className="arena-numero">{fmtBRL(r.vgv)}</span>
                <span
                  className="aurum-relative"
                  hidden={individual}
                  aria-label={`${lider > 0 ? Math.round((r.vgv / lider) * 100) : 0}% do VGV líder`}
                >
                  <span
                    style={{ transform: `scaleX(${lider > 0 ? Math.min(r.vgv / lider, 1) : 0})` }}
                  />
                </span>
              </span>
              <span role="cell" className="arena-ranking-sales">
                {formatNum(r.vendas)}
                <small>{r.vendas === 1 ? "venda" : "vendas"}</small>
              </span>
              {!gestor && (
                <span role="cell" className="arena-ranking-arrow">
                  {onSelect && (
                    <button
                      type="button"
                      aria-label={`Abrir análise de ${r.nome}`}
                      onClick={() => onSelect(r.corretorId)}
                    >
                      <ArrowUpRight />
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="arena-footnote">
        {gestor
          ? "VGV líquido da equipe · vínculos atuais do CRM. Cada equipe entra uma única vez no resultado de seu gestor."
          : "Empates compartilham a posição. Nomes ordenam apenas a exibição; não desempatam resultados."}
      </p>
    </div>
  );
}

export function MetasCampeonato({ snapshot, hoje }: { snapshot: RankingSnapshot; hoje: Date }) {
  const rows = participantes(snapshot);
  const total = somarTotais(rows);
  const metas = agregarMetas(
    snapshot.metas,
    escopoDe(rows, snapshot.escopo === "operacao", snapshot.escopo !== "individual"),
  );
  const [ano, mes] = snapshot.inicio.split("-").map(Number);
  const calendario = normalizarCalendarioPacing(snapshot.calendario);
  const proj = projetarMes({ realizado: total.vgv, meta: metas.vgv, ano, mes, hoje, calendario });
  // Não transforma zero ou uma única venda em previsão confiável. Amostra mínima explícita.
  const podeProjetar =
    proj.posicao === "atual" &&
    proj.diasUteisPassados >= 3 &&
    total.vendas >= 3 &&
    snapshot.calendario != null;
  const pct = metas.vgv > 0 ? (total.vgv / metas.vgv) * 100 : null;
  const restantes =
    proj.posicao === "atual"
      ? diasNoMes(ano, mes) - hoje.getDate()
      : proj.posicao === "futuro"
        ? diasNoMes(ano, mes)
        : 0;
  return (
    <div className="arena-goals-view">
      <CabecalhoVisao
        indice="04 / Destino do mês"
        titulo="Realizado × meta"
        detalhe={
          proj.posicao === "atual"
            ? `${restantes} dias para fechar o ciclo`
            : proj.posicao === "passado"
              ? "Ciclo encerrado"
              : "Ciclo ainda não iniciado"
        }
      />
      <div className="arena-goal-main">
        <div className="arena-goal-result">
          <span className="arena-eyebrow">VGV realizado · efetivo</span>
          <Numero valor={total.vgv} moeda />
          <div className="arena-goal-target">
            Meta de VGV{" "}
            <strong>{metas.vgv > 0 ? fmtBRLCompacto(metas.vgv) : "não cadastrada"}</strong>
          </div>
          <div className="arena-goal-track">
            <Progress value={Math.min(pct ?? 0, 100)} aria-label="Progresso da meta de VGV" />
            <div>
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="arena-goal-gap">
            <Target />
            <span>
              {pct === null ? (
                "Defina uma meta de VGV para acompanhar a distância."
              ) : pct >= 100 ? (
                "Meta de VGV conquistada. Vamos além!"
              ) : (
                <>
                  Faltam <strong>{fmtBRLCompacto(Math.max(metas.vgv - total.vgv, 0))}</strong> para
                  a meta.
                </>
              )}
            </span>
          </div>
        </div>
        <div className="arena-goal-percent">
          <span>
            {pct === null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          </span>
          <p>{pct === null ? "Meta de VGV não definida" : "da meta de VGV atingida"}</p>
          <Trophy weight="duotone" aria-hidden="true" />
        </div>
      </div>
      <div className="arena-goal-bottom">
        <div>
          <span className="arena-eyebrow">Vendas realizadas</span>
          <strong>
            {formatNum(total.vendas)}{" "}
            <small>/ {metas.vendas > 0 ? `${formatNum(metas.vendas)} de meta` : "sem meta"}</small>
          </strong>
          <p>
            {metas.vendas > 0
              ? `${((total.vendas / metas.vendas) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% atingido · faltam ${Math.max(metas.vendas - total.vendas, 0)}`
              : "Meta de quantidade não cadastrada"}
          </p>
        </div>
        <div className="arena-projection">
          <span className="arena-eyebrow">
            <ChartLineUp /> Projeção · estimativa
          </span>
          <strong>
            {podeProjetar && proj.valor !== null ? fmtBRLCompacto(proj.valor) : "Aguardando base"}
          </strong>
          <p>
            {podeProjetar
              ? `Ritmo linear: VGV ÷ ${proj.diasUteisPassados} dias úteis × ${proj.diasUteis}. Não é resultado realizado.`
              : proj.posicao === "passado"
                ? "Mês encerrado: confira o resultado efetivo acima."
                : "Disponível após 3 dias úteis e 3 vendas, com calendário carregado."}
          </p>
        </div>
        <div>
          <span className="arena-eyebrow">
            <Clock /> Tempo de jogo
          </span>
          <strong>
            {restantes} <small>dias restantes</small>
          </strong>
          <p>
            {proj.diasUteis - proj.diasUteisPassados} dias úteis restantes
            {snapshot.calendario == null
              ? " · calendário padrão (seg–sáb)"
              : " no calendário do time"}
          </p>
        </div>
      </div>
      <p className="arena-footnote">
        {metas.nivel
          ? `Base da meta: ${NIVEL_META_LABEL[metas.nivel]}. Níveis não são somados entre si.`
          : "Nenhuma meta cadastrada para este escopo e mês."}{" "}
        Valores efetivos líquidos de estornos.
      </p>
    </div>
  );
}

const ATIVIDADES = [
  { key: "ligacoes", peso: "ligacao", label: "Ligações", icon: Phone },
  { key: "whatsapp", peso: "whatsapp", label: "WhatsApp", icon: WhatsappLogo },
  { key: "agendamentos", peso: "agendamento", label: "Agendamentos", icon: CalendarCheck },
  { key: "visitas", peso: "visita", label: "Visitas", icon: MapPin },
  { key: "documentacoes", peso: "documentacao", label: "Documentações", icon: FileText },
  { key: "vendas", peso: "venda", label: "Vendas", icon: Trophy },
] as const;
export function ProdutividadeCampeonato({
  snapshot,
  tv = false,
  pagina = 0,
  onSelect,
}: {
  snapshot: RankingSnapshot;
  tv?: boolean;
  pagina?: number;
  onSelect?: (id: string) => void;
}) {
  const all = participantes(snapshot);
  const total = somarTotais(all);
  const pesos = pesosDeConfig(snapshot.pesos);
  const rows = classificacaoCompleta(
    all.filter((r) => r.categoria === "corretor"),
    "pontos",
  );
  const visiveis = tv ? rows.slice(pagina * LINHAS_TV, (pagina + 1) * LINHAS_TV) : rows;
  return (
    <div className="arena-productivity-view">
      <CabecalhoVisao
        indice="05 / Construindo resultado"
        titulo="Produtividade do time"
        detalhe={
          tv
            ? `Grupo ${pagina + 1} de ${Math.max(1, Math.ceil(rows.length / LINHAS_TV))}`
            : "Pontuação oficial do CRM"
        }
      />
      <div className="arena-activities">
        {ATIVIDADES.map((a) => (
          <div key={a.key}>
            <a.icon weight="duotone" />
            <span>{a.label}</span>
            <strong>{formatNum(total[a.key])}</strong>
            <small>
              {pesos ? `${formatNum(pesos[a.peso])} pts / evento` : "Peso indisponível"}
            </small>
          </div>
        ))}
      </div>
      <div
        className="arena-productivity-table"
        role="table"
        aria-label="Produtividade por corretor"
      >
        <div className="arena-productivity-row arena-productivity-head" role="row">
          <span role="columnheader">Corretor</span>
          {ATIVIDADES.map((a) => (
            <span role="columnheader" key={a.key} title={a.label}>
              <a.icon aria-hidden="true" />
              <span className="sr-only">{a.label}</span>
            </span>
          ))}
          <span role="columnheader">Pontos</span>
        </div>
        {visiveis.map((r) => (
          <div className="arena-productivity-row" role="row" key={r.corretorId}>
            <div className="arena-ranking-person" role="cell">
              <span className="arena-productivity-pos">
                {snapshot.escopo === "individual" ? "—" : r.pos || "—"}
              </span>
              <Foto nome={r.nome} foto={r.foto} />
              <button type="button" disabled={!onSelect} onClick={() => onSelect?.(r.corretorId)}>
                {r.nome}
              </button>
            </div>
            {ATIVIDADES.map((a) => (
              <span
                role="cell"
                key={a.key}
                data-label={a.label}
                aria-label={`${a.label}: ${formatNum(r[a.key])}`}
                className={r[a.key] > 0 ? "arena-cell-active" : "arena-cell-zero"}
              >
                {formatNum(r[a.key])}
              </span>
            ))}
            <strong role="cell">{formatNum(r.pontos)}</strong>
          </div>
        ))}
      </div>
      {!rows.length && (
        <Vazio
          titulo="Nenhum corretor neste escopo"
          texto="A produtividade aparecerá com os perfis ativos do time."
        />
      )}
      <p className="arena-footnote">
        {pesosDivergem(all, pesos)
          ? "Os pesos vigentes não reproduzem parte do histórico. Prevalece a pontuação oficial registrada no CRM."
          : "Pontuação = soma de quantidade × peso de cada atividade. Os pesos exibidos são os vigentes."}{" "}
        As seis atividades permanecem visíveis, inclusive quando valem zero.
      </p>
    </div>
  );
}

export function AnaliseCorretor({
  id,
  snapshot,
  hoje,
  onClose,
}: {
  id: string | null;
  snapshot: RankingSnapshot;
  hoje: Date;
  onClose: () => void;
}) {
  const all = participantes(snapshot);
  const row = all.find((r) => r.corretorId === id);
  const conversao = id ? conversaoCorretor(snapshot, id) : null;
  const meta = id ? metasPorCorretor(snapshot.metas).get(id) : undefined;
  const vendas = snapshot.vendas
    .filter((v) => v.corretor_id === id)
    .slice()
    .reverse();
  const pesos = pesosDeConfig(snapshot.pesos);
  const [ano, mes] = snapshot.inicio.split("-").map(Number);
  const posicao = row
    ? classificacaoCompleta(all.filter((r) => r.categoria === "corretor")).find(
        (r) => r.corretorId === id,
      )
    : undefined;
  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="arena-detail dark max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <div className="arena-detail-person">
                <Foto nome={row.nome} foto={row.foto} />
                <div>
                  <DialogTitle>{row.nome}</DialogTitle>
                  <DialogDescription>
                    {snapshot.inicio.slice(5, 7)}/{ano} ·{" "}
                    {snapshot.escopo === "individual"
                      ? "Escopo individual · sem classificação global"
                      : posicao?.pos
                        ? `${posicao.pos}º lugar${posicao.empatado ? " · posição compartilhada" : ""}`
                        : "Sem posição comercial"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="arena-detail-stats">
              <div>
                <span>VGV aprovado</span>
                <strong>{fmtBRL(row.vgv)}</strong>
              </div>
              <div>
                <span>Vendas</span>
                <strong>{row.vendas}</strong>
              </div>
              <div>
                <span>Ticket médio</span>
                <strong>{row.vendas > 0 ? fmtBRL(row.vgv / row.vendas) : "—"}</strong>
              </div>
            </div>
            <h3>Progresso das metas</h3>
            {[
              { label: "VGV", atual: row.vgv, meta: meta?.vgv ?? 0, moeda: true },
              { label: "Vendas", atual: row.vendas, meta: meta?.vendas ?? 0, moeda: false },
              { label: "Visitas", atual: row.visitas, meta: meta?.visitas ?? 0, moeda: false },
            ].map((m) => (
              <div className="arena-detail-goal" key={m.label}>
                <div>
                  <span>{m.label}</span>
                  <strong>
                    {m.meta > 0
                      ? `${((m.atual / m.meta) * 100).toFixed(0)}% · ${m.moeda ? fmtBRLCompacto(m.atual) : m.atual} de ${m.moeda ? fmtBRLCompacto(m.meta) : m.meta}`
                      : "Meta não cadastrada"}
                  </strong>
                </div>
                <Progress
                  value={m.meta > 0 ? Math.min((m.atual / m.meta) * 100, 100) : 0}
                  aria-label={`Meta individual de ${m.label}`}
                />
              </div>
            ))}
            <div className="arena-conversion">
              <ChartLineUp />
              <div>
                <h3>
                  {conversao
                    ? `${conversao.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de conversão da coorte`
                    : "Conversão ainda não apurada"}
                </h3>
                <p>
                  {conversao
                    ? `${conversao.convertidos} de ${conversao.leads} leads criados no mês e hoje nesta carteira têm venda aprovada atribuída ao corretor até esta leitura. A carteira e os desfechos podem mudar.`
                    : "Sem uma coorte válida de leads acompanhados até a aprovação, eventos independentes do mês não comprovam conversão."}
                </p>
                <span>
                  {row.leads} leads recebidos · {row.visitas} visitas · {row.vendas} vendas
                </span>
              </div>
            </div>
            <h3>Vendas aprovadas no mês</h3>
            {vendas.length ? (
              <ul className="arena-detail-sales">
                {vendas.map((v) => (
                  <li key={v.id}>
                    <span>
                      <CheckCircle /> {v.dia.split("-").reverse().join("/")}
                    </span>
                    <strong>{fmtBRL(v.valor)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="arena-footnote">Nenhuma aprovação válida neste período.</p>
            )}
            {pesos && (
              <details className="arena-points-detail">
                <summary>Como os {formatNum(row.pontos)} pontos foram registrados</summary>
                {decomporPontos(row, pesos).map((p) => (
                  <p key={p.chave}>
                    <span>{p.label}</span>
                    <span>
                      {p.quantidade} × {p.peso} = {formatNum(p.pontos)}
                    </span>
                  </p>
                ))}
                <small>
                  {pesosDivergem([row], pesos)
                    ? "Pesos atuais divergem do histórico; a pontuação oficial é preservada."
                    : "Pesos atuais conferem com a pontuação oficial."}
                </small>
              </details>
            )}
            <p className="arena-footnote">
              {posicaoDoMes(ano, mes, hoje) === "passado"
                ? "Ciclo encerrado."
                : "Ciclo em andamento."}{" "}
              Aprovações pelo dia de efetivação em São Paulo; estornos são descontados.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
