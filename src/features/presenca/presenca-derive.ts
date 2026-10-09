// Presença por filial (migration 20261013120000) — regras de TELA, puras.
//
// A regra de verdade mora no banco (presenca_checkin): check-in na filial
// libera a roleta; em casa só libera com o mínimo de vendas aprovadas no mês
// (presenca_casa_min_vendas_mes, hoje 3). Aqui só traduzimos o que o banco
// devolveu em frases, estados e colunas — nada de decidir aptidão no cliente.

import type { Intent } from "@/lib/status-tones";

export type ModoPresenca = "loja" | "casa" | "liberado_gestao";
export type MotivoPresenca = "casa_abaixo_minimo_vendas" | "fora_da_filial" | "sem_localizacao";
export type LocalizacaoCheckin =
  | "confirmada"
  | "fora_do_raio"
  | "sem_localizacao"
  | "filial_sem_coordenadas"
  | "confirmada_gestao";

export type FilialOpcao = {
  slug: string;
  nome: string;
  endereco: string | null;
  tem_coordenadas: boolean;
  raio_metros: number;
};

export type CheckinAtual = {
  id: string;
  modo: ModoPresenca;
  filial_slug: string | null;
  filial_nome: string | null;
  apto_roleta: boolean;
  motivo: MotivoPresenca | null;
  localizacao: LocalizacaoCheckin | null;
  distancia_m: number | null;
  precisao_m: number | null;
  origem: "corretor" | "gestao";
  criado_em: string;
  encerrado_em: string | null;
};

/** O que `presenca_minha_v1()` devolve. */
export type MinhaPresenca = {
  /** Dia de hoje em BRT (YYYY-MM-DD). */
  dia: string;
  /** Na roleta agora (a chave que os motores leem). */
  presente: boolean;
  vendas_mes: number;
  vendas_minimas: number;
  casa_liberada: boolean;
  exige_localizacao: boolean;
  /** Último check-in de HOJE (aberto ou encerrado), ou null. */
  checkin: CheckinAtual | null;
  filiais: FilialOpcao[];
};

/** Linha de `presenca_hoje_v1()` (quadro da gestão). */
export type PresencaHojeRow = {
  corretor_id: string;
  nome: string;
  avatar_url: string | null;
  presente: boolean;
  modo: ModoPresenca | null;
  filial_slug: string | null;
  filial_nome: string | null;
  apto_roleta: boolean | null;
  motivo: MotivoPresenca | null;
  localizacao: LocalizacaoCheckin | null;
  distancia_m: number | null;
  origem: "corretor" | "gestao" | null;
  checkin_em: string | null;
  encerrado_em: string | null;
  vendas_mes: number;
  vendas_minimas: number;
};

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Lê o JSON da RPC sem confiar cegamente no formato (coluna nova, nulos). */
export function parseMinhaPresenca(json: unknown): MinhaPresenca {
  const o = (json ?? {}) as Record<string, unknown>;
  const c = o.checkin as Record<string, unknown> | null | undefined;
  return {
    dia: String(o.dia ?? ""),
    presente: o.presente === true,
    vendas_mes: num(o.vendas_mes),
    vendas_minimas: num(o.vendas_minimas, 3),
    casa_liberada: o.casa_liberada === true,
    exige_localizacao: o.exige_localizacao === true,
    checkin: c
      ? {
          id: String(c.id),
          modo: c.modo as ModoPresenca,
          filial_slug: (c.filial_slug as string | null) ?? null,
          filial_nome: (c.filial_nome as string | null) ?? null,
          apto_roleta: c.apto_roleta === true,
          motivo: (c.motivo as MotivoPresenca | null) ?? null,
          localizacao: (c.localizacao as LocalizacaoCheckin | null) ?? null,
          distancia_m: c.distancia_m == null ? null : num(c.distancia_m),
          precisao_m: c.precisao_m == null ? null : num(c.precisao_m),
          origem: c.origem === "gestao" ? "gestao" : "corretor",
          criado_em: String(c.criado_em ?? ""),
          encerrado_em: (c.encerrado_em as string | null) ?? null,
        }
      : null,
    filiais: Array.isArray(o.filiais) ? (o.filiais as FilialOpcao[]) : [],
  };
}

/** "outubro" a partir de "2026-10-13" (sem fuso: a data já é BRT). */
export function nomeDoMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  if (!a || !m) return "este mês";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, 1)),
  );
}

export function faltamVendas(p: Pick<MinhaPresenca, "vendas_mes" | "vendas_minimas">): number {
  return Math.max(0, p.vendas_minimas - p.vendas_mes);
}

/** "Barra Funda" · "Em casa" · "Liberado pela gestão". */
export function rotuloLocal(modo: ModoPresenca | null, filialNome: string | null): string {
  if (modo === "loja") return filialNome ?? "Filial";
  if (modo === "casa") return "Em casa";
  if (modo === "liberado_gestao") return "Liberado pela gestão";
  return "Sem check-in";
}

export function distanciaLabel(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`;
}

/** Evidência de localização do check-in na filial, para a gestão e o corretor. */
export function localizacaoLabel(
  loc: LocalizacaoCheckin | null,
  distancia: number | null,
): { texto: string; intent: Intent } | null {
  switch (loc) {
    case "confirmada":
      return {
        texto: distancia == null ? "Na filial" : `Na filial (${distanciaLabel(distancia)})`,
        intent: "success",
      };
    case "fora_do_raio":
      return {
        texto: distancia == null ? "Longe da filial" : `A ${distanciaLabel(distancia)} da filial`,
        intent: "danger",
      };
    case "sem_localizacao":
      return { texto: "Sem localização", intent: "warning" };
    case "filial_sem_coordenadas":
      return { texto: "Filial sem coordenadas", intent: "neutral" };
    case "confirmada_gestao":
      return { texto: "Confirmado pela gestão", intent: "info" };
    default:
      return null;
  }
}

/** Por que o check-in não liberou a roleta, em linguagem de corretor. */
export function motivoPresencaLabel(
  motivo: MotivoPresenca | null,
  ctx: { vendas_mes: number; vendas_minimas: number; mes?: string },
): string | null {
  switch (motivo) {
    case "casa_abaixo_minimo_vendas": {
      const mes = ctx.mes ? ` em ${ctx.mes}` : " no mês";
      return (
        `Em casa, a roleta só libera com ${ctx.vendas_minimas} venda${ctx.vendas_minimas === 1 ? "" : "s"} ` +
        `aprovada${ctx.vendas_minimas === 1 ? "" : "s"}${mes} — você tem ${ctx.vendas_mes}. ` +
        "Para receber leads hoje, faça o check-in numa filial."
      );
    }
    case "fora_da_filial":
      return "A localização do celular ficou fora do raio da filial. Tente de novo já dentro da loja ou peça para a gestão confirmar.";
    case "sem_localizacao":
      return "Sem a localização do celular não dá para confirmar o plantão. Libere a localização no navegador e tente de novo.";
    default:
      return null;
  }
}

export type SituacaoHoje = {
  estado: "sem_checkin" | "na_roleta" | "fora_da_roleta" | "encerrado";
  titulo: string;
  detalhe: string | null;
  intent: Intent;
};

/** O cabeçalho do card de check-in: onde estou e se recebo lead. */
export function situacaoHoje(p: MinhaPresenca): SituacaoHoje {
  const c = p.checkin;
  const mes = nomeDoMes(p.dia);
  if (!c) {
    return {
      estado: "sem_checkin",
      titulo: "Você ainda não fez o check-in de hoje",
      detalhe: "Sem check-in, você não recebe leads das roletas. Escolha onde está trabalhando.",
      intent: "warning",
    };
  }
  const local = rotuloLocal(c.modo, c.filial_nome);
  if (c.encerrado_em) {
    return {
      estado: "encerrado",
      titulo: `Presença encerrada (${local})`,
      detalhe: "Você saiu da roleta. Faça o check-in de novo para voltar a receber.",
      intent: "neutral",
    };
  }
  if (c.apto_roleta && p.presente) {
    return {
      estado: "na_roleta",
      titulo: c.modo === "casa" ? "Em casa — na roleta" : `${local} — na roleta`,
      detalhe:
        c.modo === "casa"
          ? `Você tem ${p.vendas_mes} venda${p.vendas_mes === 1 ? "" : "s"} aprovada${p.vendas_mes === 1 ? "" : "s"} em ${mes}: pode receber leads trabalhando de casa.`
          : "Você está apto a receber leads das roletas hoje.",
      intent: "success",
    };
  }
  return {
    estado: "fora_da_roleta",
    titulo: `${local} — fora da roleta`,
    detalhe: motivoPresencaLabel(c.motivo, { ...p, mes }),
    intent: "warning",
  };
}

/** Faixa no topo do CRM: só para corretor sem check-in aberto hoje. */
export function precisaCheckin(p: MinhaPresenca | null | undefined): boolean {
  if (!p) return false;
  return !p.checkin || p.checkin.encerrado_em !== null;
}

// ---------------------------------------------------------------------------
// Quadro da gestão
// ---------------------------------------------------------------------------

export type ColunaQuadro = {
  chave: string;
  titulo: string;
  corretores: PresencaHojeRow[];
};

/**
 * Colunas do quadro do dia: uma por filial (na ordem das filiais, mesmo
 * vazia), depois Em casa, Liberados pela gestão e Sem check-in (quem não fez
 * ou encerrou). Dentro da coluna: quem está na roleta primeiro, depois nome.
 */
export function agruparQuadro(
  rows: PresencaHojeRow[],
  filiais: Pick<FilialOpcao, "slug" | "nome">[],
): ColunaQuadro[] {
  const ativo = (r: PresencaHojeRow) => r.modo !== null && r.encerrado_em === null;
  const ordenar = (lista: PresencaHojeRow[]) =>
    [...lista].sort(
      (a, b) => Number(b.presente) - Number(a.presente) || a.nome.localeCompare(b.nome, "pt-BR"),
    );

  const colunas: ColunaQuadro[] = filiais.map((f) => ({
    chave: `filial:${f.slug}`,
    titulo: f.nome,
    corretores: ordenar(
      rows.filter((r) => ativo(r) && r.modo === "loja" && r.filial_slug === f.slug),
    ),
  }));
  // Filial desativada hoje, mas com gente que fez check-in antes: não some.
  const conhecidas = new Set(filiais.map((f) => f.slug));
  const orfas = new Map<string, PresencaHojeRow[]>();
  for (const r of rows) {
    if (ativo(r) && r.modo === "loja" && r.filial_slug && !conhecidas.has(r.filial_slug)) {
      orfas.set(r.filial_slug, [...(orfas.get(r.filial_slug) ?? []), r]);
    }
  }
  for (const [slug, lista] of orfas) {
    colunas.push({
      chave: `filial:${slug}`,
      titulo: lista[0].filial_nome ?? slug,
      corretores: ordenar(lista),
    });
  }
  colunas.push(
    {
      chave: "casa",
      titulo: "Em casa",
      corretores: ordenar(rows.filter((r) => ativo(r) && r.modo === "casa")),
    },
    {
      chave: "liberado_gestao",
      titulo: "Liberados pela gestão",
      corretores: ordenar(rows.filter((r) => ativo(r) && r.modo === "liberado_gestao")),
    },
    {
      chave: "sem_checkin",
      titulo: "Sem check-in",
      corretores: ordenar(rows.filter((r) => !ativo(r))),
    },
  );
  return colunas;
}

export type ResumoQuadro = {
  naRoleta: number;
  naFilial: number;
  emCasaForaDaRoleta: number;
  semCheckin: number;
};

export function resumoQuadro(rows: PresencaHojeRow[]): ResumoQuadro {
  const ativo = (r: PresencaHojeRow) => r.modo !== null && r.encerrado_em === null;
  return {
    naRoleta: rows.filter((r) => r.presente).length,
    naFilial: rows.filter((r) => ativo(r) && r.modo === "loja").length,
    emCasaForaDaRoleta: rows.filter((r) => ativo(r) && r.modo === "casa" && !r.apto_roleta).length,
    semCheckin: rows.filter((r) => !ativo(r)).length,
  };
}

// ---------------------------------------------------------------------------
// Cadastro de filial
// ---------------------------------------------------------------------------

/**
 * Coordenadas coladas do Google Maps ("-23.5260, -46.6660"), também com
 * vírgula decimal ("-23,5260 -46,6660"). Exatamente dois números; null =
 * inválido.
 */
export function parseCoordenadas(texto: string): { lat: number; lng: number } | null {
  const partes = texto.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  if (partes.length !== 2) return null;
  const [lat, lng] = partes.map((p) => Number(p.replace(",", ".")));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function coordenadasTexto(lat: number | null, lng: number | null): string {
  return lat == null || lng == null ? "" : `${lat}, ${lng}`;
}
