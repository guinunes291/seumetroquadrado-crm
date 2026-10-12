// Presença por filial (migration 20261013120000) — regras de TELA, puras.
//
// A regra de verdade mora no banco (presenca_checkin): check-in na filial
// libera a roleta; em casa só libera com o mínimo de vendas aprovadas no MÊS
// ANTERIOR (presenca_casa_min_vendas_mes_anterior, hoje 3). Aqui só traduzimos
// o que o banco devolveu em frases, estados e colunas — nada de decidir
// aptidão no cliente.

import type { Intent } from "@/lib/status-tones";

export type ModoPresenca = "loja" | "casa" | "liberado_gestao";
export type MotivoPresenca = "casa_abaixo_minimo_vendas" | "fora_da_filial" | "sem_localizacao";
/**
 * Por que o celular não deu a localização no check-in na filial (só a tela
 * sabe: para o banco é tudo "sem coordenada" → `sem_localizacao`).
 * negada = code 1 (o corretor ou o navegador bloqueou), indisponivel = code 2,
 * tempo = code 3 (ou o aparelho não respondeu), sem_suporte = navegador sem
 * geolocalização.
 */
export type FalhaLocalizacao = "negada" | "indisponivel" | "tempo" | "sem_suporte";
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
  /** Primeiro dia do mês que a meta conta (o anterior), YYYY-MM-DD. */
  mes_referencia: string;
  vendas_mes_anterior: number;
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
  vendas_mes_anterior: number;
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
    mes_referencia: String(o.mes_referencia ?? ""),
    vendas_mes_anterior: num(o.vendas_mes_anterior),
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

/** "setembro" a partir de "2026-09-01" (sem fuso: a data já é BRT). */
export function nomeDoMes(dia: string): string {
  const [a, m] = dia.split("-").map(Number);
  if (!a || !m) return "o mês anterior";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, 1)),
  );
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

/** "da filial Barra Funda" · "da filial" (sem nome). */
const daFilial = (nome: string | null | undefined) => (nome ? `da filial ${nome}` : "da filial");

/**
 * O que fazer quando o celular não deu a localização, pelo tipo de falha.
 * Sem o tipo (o card relido depois, outro aparelho), a orientação geral.
 */
export function mensagemSemLocalizacao(falha: FalhaLocalizacao | null | undefined): string {
  switch (falha) {
    case "negada":
      return (
        "O navegador está bloqueando a localização para o CRM. Para liberar: toque no cadeado " +
        "(ou no ícone) ao lado do endereço do site → Localização → Permitir. Depois, tente de novo."
      );
    case "indisponivel":
    case "tempo":
      return (
        "O celular não conseguiu informar a localização. Ligue a localização do celular e " +
        "tente de novo, de preferência perto de uma janela."
      );
    case "sem_suporte":
      return (
        "Este navegador não informa a localização. Abra o CRM no navegador do celular " +
        "(Chrome ou Safari) e tente de novo."
      );
    default:
      return (
        "Sem a localização do celular não dá para confirmar que você está na filial. " +
        "Ligue a localização, permita o acesso para o CRM no navegador e tente de novo de dentro da loja."
      );
  }
}

/** Por que o check-in não liberou a roleta, em linguagem de corretor. */
export function motivoPresencaLabel(
  motivo: MotivoPresenca | null,
  ctx: {
    vendas_mes_anterior: number;
    vendas_minimas: number;
    mes?: string;
    /** Check-in na filial: qual filial e a distância que o banco calculou. */
    filial_nome?: string | null;
    distancia_m?: number | null;
    /** Só a tela do check-in sabe por que a localização faltou. */
    falha_localizacao?: FalhaLocalizacao | null;
  },
): string | null {
  switch (motivo) {
    case "casa_abaixo_minimo_vendas": {
      const mes = ctx.mes ? ` em ${ctx.mes}` : " no mês anterior";
      return (
        `Em casa, a roleta só libera com ${ctx.vendas_minimas} venda${ctx.vendas_minimas === 1 ? "" : "s"} ` +
        `aprovada${ctx.vendas_minimas === 1 ? "" : "s"}${mes} — você teve ${ctx.vendas_mes_anterior}. ` +
        "Para receber leads da roleta hoje, é preciso estar numa filial: vá até a loja e faça o check-in de lá."
      );
    }
    case "fora_da_filial": {
      const onde =
        ctx.distancia_m == null
          ? `Você está longe ${daFilial(ctx.filial_nome)}.`
          : `Você está a ${distanciaLabel(ctx.distancia_m)} ${daFilial(ctx.filial_nome)}.`;
      return (
        `${onde} O check-in na filial só vale de dentro da loja. ` +
        "Se você está na loja, peça ao gestor para confirmar no plantão."
      );
    }
    case "sem_localizacao":
      return mensagemSemLocalizacao(ctx.falha_localizacao);
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

/**
 * O cabeçalho do card de check-in: onde estou e se recebo lead. `falhaLocalizacao`:
 * por que o celular não deu a localização no último check-in feito NESTA tela
 * (o banco não sabe; sem ela, a orientação geral).
 */
export function situacaoHoje(
  p: MinhaPresenca,
  opts: { falhaLocalizacao?: FalhaLocalizacao | null } = {},
): SituacaoHoje {
  const c = p.checkin;
  const mes = nomeDoMes(p.mes_referencia);
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
          ? `Você teve ${p.vendas_mes_anterior} venda${p.vendas_mes_anterior === 1 ? "" : "s"} aprovada${p.vendas_mes_anterior === 1 ? "" : "s"} em ${mes}: pode receber leads trabalhando de casa.`
          : "Você está apto a receber leads das roletas hoje.",
      intent: "success",
    };
  }
  return {
    estado: "fora_da_roleta",
    titulo: `${local} — fora da roleta`,
    detalhe: motivoPresencaLabel(c.motivo, {
      ...p,
      mes,
      filial_nome: c.filial_nome,
      distancia_m: c.distancia_m,
      falha_localizacao: opts.falhaLocalizacao,
    }),
    intent: "warning",
  };
}

/** O aviso de localização sob as opções do check-in (card e diálogo obrigatório). */
export function avisoLocalizacao(exige: boolean): string {
  return exige
    ? "Na filial, a localização do celular é conferida no momento do check-in: o check-in só vale de dentro da loja. Em casa, a localização nunca é pedida."
    : "Na filial, o celular informa a localização só no momento do check-in, para confirmar o plantão. Em casa, a localização nunca é pedida.";
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

/**
 * Check-in na filial que a localização barrou (exigência ligada): fora do
 * raio ou sem localização. Fica fora da roleta — e, por decisão do dono
 * (12/10/2026), também fora do reforço quando a roleta esvazia.
 */
export function barradoPelaLocalizacao(
  r: Pick<PresencaHojeRow, "modo" | "encerrado_em" | "apto_roleta" | "motivo">,
): boolean {
  return (
    r.modo === "loja" &&
    r.encerrado_em === null &&
    r.apto_roleta === false &&
    (r.motivo === "fora_da_filial" || r.motivo === "sem_localizacao")
  );
}

/**
 * O selo da linha do corretor no quadro: "Na roleta", "Fora da roleta" ou,
 * para quem a localização barrou, o porquê ("Barrado: a 5,8 km da filial").
 * null = sem check-in aberto (a linha diz a hora da saída, se houver).
 */
export function statusRoletaLinha(
  r: Pick<
    PresencaHojeRow,
    "modo" | "encerrado_em" | "apto_roleta" | "motivo" | "presente" | "distancia_m"
  >,
): { texto: string; intent: Intent } | null {
  if (r.modo === null || r.encerrado_em !== null) return null;
  if (barradoPelaLocalizacao(r)) {
    if (r.motivo === "sem_localizacao")
      return { texto: "Barrado: sem localização", intent: "danger" };
    return {
      texto:
        r.distancia_m == null
          ? "Barrado: longe da filial"
          : `Barrado: a ${distanciaLabel(r.distancia_m)} da filial`,
      intent: "danger",
    };
  }
  return r.presente
    ? { texto: "Na roleta", intent: "success" }
    : { texto: "Fora da roleta", intent: "warning" };
}

export type ResumoQuadro = {
  naRoleta: number;
  /** Check-in aberto numa filial que vale (sem os barrados pela localização). */
  naFilial: number;
  /** Escolheram uma filial e a localização barrou (fora da conta do plantão). */
  barradosLocalizacao: number;
  emCasaForaDaRoleta: number;
  semCheckin: number;
};

export function resumoQuadro(rows: PresencaHojeRow[]): ResumoQuadro {
  const ativo = (r: PresencaHojeRow) => r.modo !== null && r.encerrado_em === null;
  return {
    naRoleta: rows.filter((r) => r.presente).length,
    naFilial: rows.filter((r) => ativo(r) && r.modo === "loja" && !barradoPelaLocalizacao(r))
      .length,
    barradosLocalizacao: rows.filter(barradoPelaLocalizacao).length,
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

/** "Av. Marquês de São Vicente, 1619" — o endereço sem bairro, cidade e CEP. */
export function enderecoCurto(endereco: string | null): string | null {
  if (!endereco) return null;
  return endereco.split(/\s+[–—-]\s+/)[0].trim() || null;
}
