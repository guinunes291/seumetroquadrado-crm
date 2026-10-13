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
const FALHAS: readonly FalhaLocalizacao[] = ["negada", "indisponivel", "tempo", "sem_suporte"];

/** O porquê gravado pelo banco (_falha_localizacao), só se for um dos conhecidos. */
export function parseFalhaLocalizacao(v: unknown): FalhaLocalizacao | null {
  return FALHAS.find((f) => f === v) ?? null;
}
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
  /**
   * Por que o aparelho não deu a localização (gravado desde a 0082 pelo
   * parâmetro _falha_localizacao; null antes dela ou quando não faltou).
   */
  falha_localizacao: FalhaLocalizacao | null;
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
  /** Desde a 0082 (pode faltar em produção antes dela). */
  falha_localizacao?: string | null;
  /**
   * A precisão que o aparelho informou (desde a 0082; pode faltar antes
   * dela). Acima de 1 km, o quadro diz "localização imprecisa" em vez de
   * acusar a distância.
   */
  precisao_m?: number | null;
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
    // Sem a chave na resposta, assume ligada (o mais seguro para o corretor:
    // a tela avisa da conferência antes do toque).
    exige_localizacao: typeof o.exige_localizacao === "boolean" ? o.exige_localizacao : true,
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
          falha_localizacao: parseFalhaLocalizacao(c.falha_localizacao),
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
  return km < 10
    ? `${km.toFixed(1).replace(".", ",").replace(/,0$/, "")} km`
    : `${Math.round(km)} km`;
}

/**
 * Leitura que o aparelho mesmo diz ser aproximada (Wi-Fi ou IP, típico de
 * computador): acima de 1 km, a distância não prova onde a pessoa está.
 */
export function precisaoAproximada(precisao: number | null | undefined): boolean {
  return precisao != null && precisao > 1000;
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

const PELO_CELULAR =
  "faça o check-in pelo celular, de dentro da loja, ou peça ao gestor para confirmar no plantão.";

/**
 * O que fazer quando o aparelho não deu a localização, pelo tipo de falha.
 * No computador (sem tela de toque), a orientação é usar o celular. Sem o
 * tipo (dado antigo), a orientação geral.
 */
export function mensagemSemLocalizacao(
  falha: FalhaLocalizacao | null | undefined,
  opts: { computador?: boolean } = {},
): string {
  if (opts.computador) return `No computador a localização costuma falhar: ${PELO_CELULAR}`;
  switch (falha) {
    case "negada":
      return (
        "O navegador está bloqueando a localização para o CRM. Para liberar no Android (Chrome): " +
        "toque no cadeado (ou no ícone) ao lado do endereço do site → Localização → Permitir. " +
        "No iPhone (Safari): toque em aA ao lado do endereço → Ajustes do Site → Localização → " +
        "Permitir; se não aparecer, vá em Ajustes → Privacidade e Segurança → Serviços de " +
        "Localização → Sites do Safari → Durante o Uso do App. Depois, tente de novo."
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
    /** A precisão que o aparelho informou (acima de 1 km, a distância não prova nada). */
    precisao_m?: number | null;
    /** Por que a localização faltou (a tela do check-in ou, desde a 0082, o banco). */
    falha_localizacao?: FalhaLocalizacao | null;
    /** Este aparelho é um computador (sem tela de toque)? */
    computador?: boolean;
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
      if (precisaoAproximada(ctx.precisao_m)) {
        return `A localização deste aparelho é aproximada (±${distanciaLabel(ctx.precisao_m ?? 0)}): ${PELO_CELULAR}`;
      }
      const onde =
        ctx.distancia_m == null
          ? `A localização deste aparelho ficou longe ${daFilial(ctx.filial_nome)}.`
          : `A localização deste aparelho ficou a ${distanciaLabel(ctx.distancia_m)} ${daFilial(ctx.filial_nome)}.`;
      return (
        `${onde} O check-in na filial só vale de dentro da loja. ` +
        "Se você está na loja, peça ao gestor para confirmar no plantão."
      );
    }
    case "sem_localizacao":
      return mensagemSemLocalizacao(ctx.falha_localizacao, { computador: ctx.computador });
    default:
      return null;
  }
}

/**
 * Barrado pela localização hoje e trocou para "Em casa": a roleta pode voltar
 * (com a meta), mas o reforço não — só um check-in na loja que valha (GPS ou
 * a gestão confirmando no plantão) ou a liberação da gestão o devolvem.
 */
export const AVISO_FORA_DO_REFORCO =
  "Como o check-in na filial foi barrado hoje, você também fica fora do reforço até um check-in na loja que valha (ou a gestão liberar você).";

export type SituacaoHoje = {
  estado: "sem_checkin" | "na_roleta" | "fora_da_roleta" | "encerrado";
  titulo: string;
  detalhe: string | null;
  intent: Intent;
};

/**
 * O cabeçalho do card de check-in: onde estou e se recebo lead.
 * - `falhaLocalizacao`: por que o aparelho não deu a localização no último
 *   check-in feito NESTA tela (sem ela, o que o banco gravou, ou a geral);
 * - `computador`: este aparelho não tem tela de toque (orienta usar o celular);
 * - `barradoHoje`: houve um check-in na filial barrado hoje, sem destrave
 *   depois — em casa, avisa que o reforço não volta.
 */
export function situacaoHoje(
  p: MinhaPresenca,
  opts: {
    falhaLocalizacao?: FalhaLocalizacao | null;
    computador?: boolean;
    barradoHoje?: boolean;
  } = {},
): SituacaoHoje {
  const c = p.checkin;
  const mes = nomeDoMes(p.mes_referencia);
  if (!c) {
    return {
      estado: "sem_checkin",
      titulo: "Você ainda não fez o check-in de hoje",
      detalhe:
        "Sem check-in, você não recebe leads das roletas nem do reforço (as visitas marcadas pelo SDR continuam chegando). Escolha onde está trabalhando.",
      intent: "warning",
    };
  }
  const local = rotuloLocal(c.modo, c.filial_nome);
  if (c.encerrado_em) {
    return {
      estado: "encerrado",
      titulo: `Presença encerrada (${local})`,
      detalhe: "Você saiu das roletas e do reforço. Faça o check-in de novo para voltar a receber.",
      intent: "neutral",
    };
  }
  const reforco = opts.barradoHoje && c.modo === "casa" ? ` ${AVISO_FORA_DO_REFORCO}` : "";
  if (c.apto_roleta && p.presente) {
    return {
      estado: "na_roleta",
      titulo: c.modo === "casa" ? "Em casa — na roleta" : `${local} — na roleta`,
      detalhe:
        c.modo === "casa"
          ? `Você teve ${p.vendas_mes_anterior} venda${p.vendas_mes_anterior === 1 ? "" : "s"} aprovada${p.vendas_mes_anterior === 1 ? "" : "s"} em ${mes}: pode receber leads trabalhando de casa.${reforco}`
          : "Você está apto a receber leads das roletas hoje.",
      intent: "success",
    };
  }
  const motivo = motivoPresencaLabel(c.motivo, {
    ...p,
    mes,
    filial_nome: c.filial_nome,
    distancia_m: c.distancia_m,
    precisao_m: c.precisao_m,
    falha_localizacao: opts.falhaLocalizacao ?? c.falha_localizacao,
    computador: opts.computador,
  });
  return {
    estado: "fora_da_roleta",
    titulo: `${local} — fora da roleta`,
    detalhe: motivo ? `${motivo}${reforco}` : reforco.trim() || null,
    intent: "warning",
  };
}

/**
 * O aviso de localização sob as opções do check-in (card e diálogo). Desde
 * 13/10/2026 o celular também lê a posição quando o corretor toca "Incluir
 * minha localização" — só na tela, como prévia; quem decide é o banco.
 */
export function avisoLocalizacao(exige: boolean): string {
  return exige
    ? "Na filial, a localização do celular é conferida quando você toca em Incluir minha localização e no momento do check-in: o check-in só vale de dentro da loja. Em casa, a localização nunca é pedida."
    : "Na filial, o celular informa a localização só quando você toca em Incluir minha localização ou faz o check-in, para confirmar o plantão. Em casa, a localização nunca é pedida.";
}

/** A dica sob as opções: quem não está numa filial não tem por que escolher uma. */
export const DICA_FORA_DA_FILIAL = "Fora de uma filial (casa, visita, estande)? Escolha Em casa.";

/** O passo de confirmação antes do check-in na filial (com a exigência ligada). */
export function perguntaConfirmarFilial(nome: string): { titulo: string; detalhe: string } {
  return {
    titulo: `Você está dentro da loja ${nome} agora?`,
    detalhe:
      "O celular vai conferir. Se não confirmar, o check-in fica barrado e você fica fora das roletas e do reforço hoje.",
  };
}

/**
 * O aviso do card quando o toque não refaz o check-in porque o de hoje já
 * liberou a roleta: "Você já está na roleta hoje: Barra Funda (plantão
 * confirmado pela gestão)." — diz de onde veio, para o corretor que via um
 * barrado entender por que nada foi refeito.
 */
export function avisoJaNaRoleta(c: Pick<CheckinAtual, "modo" | "filial_nome" | "origem">): string {
  if (c.modo === "liberado_gestao") return "Você já está na roleta hoje: liberado pela gestão.";
  if (c.modo === "casa") return "Você já está na roleta hoje: Em casa.";
  const nome = c.filial_nome ?? "nesta filial";
  return c.origem === "gestao"
    ? `Você já está na roleta hoje: ${nome} (plantão confirmado pela gestão).`
    : `Você já está na roleta hoje: ${nome}.`;
}

/** Check-in de hoje aberto e que liberou a roleta (nada a refazer). */
export function checkinAptoAberto(p: MinhaPresenca | null | undefined): boolean {
  const c = p?.checkin;
  return !!c && c.encerrado_em === null && c.apto_roleta;
}

/** O check-in de hoje que o corretor via na tela quando tocou a opção. */
export type Visto = Pick<CheckinAtual, "id" | "apto_roleta" | "encerrado_em"> | null;

/**
 * A presença relida agora traz um check-in de hoje que liberou a roleta e que
 * o corretor NÃO estava vendo quando tocou? Então ele decidiu por uma tela
 * velha (o barrado, o "Em casa" fora da roleta): nada a refazer. Se ele já
 * via esse mesmo check-in valendo, a troca é de propósito (mudou de filial,
 * foi para casa) e segue. (Movida do card: o diálogo voluntário usa a mesma.)
 */
export function jaNaRoletaSemSaber(
  fresca: MinhaPresenca | null,
  visto: Visto,
): CheckinAtual | null {
  const c = fresca?.checkin ?? null;
  if (!c || !checkinAptoAberto(fresca)) return null;
  const via = !!visto && visto.id === c.id && visto.apto_roleta && visto.encerrado_em === null;
  return via ? null : c;
}

/** No computador, a localização costuma vir do Wi-Fi ou do IP (km de erro). */
export const AVISO_COMPUTADOR =
  "No computador a localização costuma falhar: se puder, faça o check-in pelo celular.";

// ---------------------------------------------------------------------------
// "Incluir minha localização" e o bloco de check-in da barra lateral
// (13/10/2026). Só o pequeno mora aqui (este arquivo vai no chunk do shell);
// a prévia das distâncias fica em localizacao-previa.ts, nos chunks lazy.
// ---------------------------------------------------------------------------

/**
 * Quanto vale a leitura do "Incluir minha localização": o mesmo maximumAge
 * que o check-in já aceita. Vencida, a tela só volta ao fluxo de antes (a
 * pergunta e a leitura na hora) — nunca bloqueia.
 */
export const VALIDADE_LEITURA_MS = 60_000;

/** Vale agora? Relógio que volta (agora < lidaEm) = vencida. */
export function leituraValida(l: { lidaEm: number } | null | undefined, agora: number): boolean {
  return !!l && agora >= l.lidaEm && agora - l.lidaEm <= VALIDADE_LEITURA_MS;
}

const fmtHoraSaoPaulo = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "09:31" em São Paulo; inválida → null. Aceita ISO ou epoch ms. */
export function horaSaoPaulo(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return fmtHoraSaoPaulo.format(d);
}

/** O que o bloco da barra lateral e a faixa pedem ao diálogo. */
export type AcaoPedidoCheckin = "abrir" | "incluir-localizacao";

/** O bloco de check-in da barra lateral: onde e como está hoje, e a ação. */
export type BlocoCheckin = {
  chave:
    | "erro"
    | "carregando"
    | "sem_checkin"
    | "encerrado"
    | "na_roleta"
    | "fora_vendas"
    | "fora_roleta"
    | "barrado_sem_localizacao"
    | "barrado_fora";
  /** "Barra Funda · 09:31". */
  linha: string | null;
  /** "Nas roletas". Sempre texto: a cor nunca é a única pista. */
  estado: string;
  intent: Intent;
  acao:
    | {
        tipo: "pedido";
        acao: AcaoPedidoCheckin;
        rotulo: "Fazer check-in" | "Trocar" | "Refazer check-in" | "Incluir localização";
      }
    // Erro na leitura: o link para /presenca (o card tenta de novo).
    | { tipo: "link"; rotulo: "Abrir check-in" }
    | null;
};

/**
 * O bloco de check-in da barra lateral, avaliado NESTA ordem (a primeira que
 * bater). `pendente === null` cobre a virada do dia: o cache é de ontem e a
 * releitura ainda não voltou — "Lendo o check-in…" em vez do check-in velho.
 */
export function blocoCheckinLateral(i: {
  presenca: MinhaPresenca | undefined;
  pendente: boolean | null;
  erro: boolean;
}): BlocoCheckin {
  if (i.erro) {
    return {
      chave: "erro",
      linha: null,
      estado: "Não deu para ler o check-in",
      intent: "neutral",
      acao: { tipo: "link", rotulo: "Abrir check-in" },
    };
  }
  const p = i.presenca;
  if (!p || i.pendente === null) {
    return {
      chave: "carregando",
      linha: null,
      estado: "Lendo o check-in…",
      intent: "neutral",
      acao: null,
    };
  }
  const c = p.checkin;
  if (!c) {
    return {
      chave: "sem_checkin",
      linha: "Sem check-in hoje",
      estado: "Fora das roletas",
      intent: "warning",
      acao: { tipo: "pedido", acao: "abrir", rotulo: "Fazer check-in" },
    };
  }
  const local = rotuloLocal(c.modo, c.filial_nome);
  const hh = horaSaoPaulo(c.criado_em);
  const linha = hh ? `${local} · ${hh}` : local;
  if (c.encerrado_em) {
    const saiu = horaSaoPaulo(c.encerrado_em);
    return {
      chave: "encerrado",
      linha: saiu ? `${local} · saiu às ${saiu}` : local,
      estado: "Presença encerrada",
      intent: "neutral",
      acao: { tipo: "pedido", acao: "abrir", rotulo: "Fazer check-in" },
    };
  }
  if (precisaRefazerCheckin(p) && c.motivo === "sem_localizacao") {
    return {
      chave: "barrado_sem_localizacao",
      linha,
      estado: "Barrado: sem localização",
      intent: "danger",
      acao: { tipo: "pedido", acao: "incluir-localizacao", rotulo: "Incluir localização" },
    };
  }
  if (precisaRefazerCheckin(p)) {
    return {
      chave: "barrado_fora",
      linha,
      estado: precisaoAproximada(c.precisao_m)
        ? "Barrado: localização aproximada"
        : c.distancia_m != null
          ? `Barrado: a ${distanciaLabel(c.distancia_m)} da loja`
          : "Barrado: longe da loja",
      intent: "danger",
      acao: { tipo: "pedido", acao: "abrir", rotulo: "Refazer check-in" },
    };
  }
  if (c.apto_roleta && p.presente) {
    return {
      chave: "na_roleta",
      // "Liberado pela gestão · 09:31" (rotuloLocal já diz isso para o liberado).
      linha,
      estado:
        c.modo === "loja" && c.origem === "gestao"
          ? "Nas roletas · confirmado pela gestão"
          : "Nas roletas",
      intent: "success",
      acao: { tipo: "pedido", acao: "abrir", rotulo: "Trocar" },
    };
  }
  if (c.modo === "casa" && c.motivo === "casa_abaixo_minimo_vendas") {
    return {
      chave: "fora_vendas",
      linha,
      estado: `Fora das roletas: ${p.vendas_mes_anterior} de ${p.vendas_minimas} vendas`,
      intent: "warning",
      acao: { tipo: "pedido", acao: "abrir", rotulo: "Trocar" },
    };
  }
  return {
    chave: "fora_roleta",
    linha,
    estado: "Fora das roletas",
    intent: "warning",
    acao: { tipo: "pedido", acao: "abrir", rotulo: "Trocar" },
  };
}

/**
 * A caixa do diálogo voluntário quando o check-in que vale veio da gestão:
 * trocar substitui a confirmação (ou a liberação) — o corretor precisa saber
 * antes de tocar. null nos outros casos (inclusive barrado ou encerrado).
 */
export function avisoTrocaDoValido(c: CheckinAtual | null): string | null {
  if (!c || c.encerrado_em !== null || !c.apto_roleta) return null;
  if (c.modo === "loja" && c.origem === "gestao") {
    return `Seu plantão na ${c.filial_nome ?? "filial"} foi confirmado pela gestão. Um check-in novo substitui essa confirmação.`;
  }
  if (c.modo === "liberado_gestao") {
    return "Você foi liberado pela gestão hoje. Um check-in novo substitui essa liberação.";
  }
  return null;
}

/** Faixa no topo do CRM: só para corretor sem check-in aberto hoje. */
export function precisaCheckin(p: MinhaPresenca | null | undefined): boolean {
  if (!p) return false;
  return !p.checkin || p.checkin.encerrado_em !== null;
}

/**
 * Faixa do barrado: o check-in aberto de hoje é numa filial e a localização
 * barrou (fora do raio ou sem localização). Sem ela, quem tocou "Continuar
 * fora das roletas" ficaria sem aviso nenhum fora de /presenca.
 */
export function precisaRefazerCheckin(p: MinhaPresenca | null | undefined): boolean {
  const c = p?.checkin;
  return (
    !!c &&
    c.encerrado_em === null &&
    c.modo === "loja" &&
    !c.apto_roleta &&
    (c.motivo === "fora_da_filial" || c.motivo === "sem_localizacao")
  );
}

// ---------------------------------------------------------------------------
// Quadro da gestão
// ---------------------------------------------------------------------------

export type ColunaQuadro = {
  chave: string;
  titulo: string;
  corretores: PresencaHojeRow[];
  /**
   * Na coluna da filial: quantos valem (o número do cabeçalho) e quantos a
   * localização barrou (o selo ao lado). A soma das filiais bate com o tile
   * "No plantão (filiais)" e com o "fora da conta". Nas outras colunas,
   * válidos = todos e barrados = 0.
   */
  validos: number;
  barrados: number;
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

  const coluna = (chave: string, titulo: string, lista: PresencaHojeRow[]): ColunaQuadro => {
    const barrados = lista.filter(barradoPelaLocalizacao).length;
    return {
      chave,
      titulo,
      corretores: ordenar(lista),
      validos: lista.length - barrados,
      barrados,
    };
  };

  const colunas: ColunaQuadro[] = filiais.map((f) =>
    coluna(
      `filial:${f.slug}`,
      f.nome,
      rows.filter((r) => ativo(r) && r.modo === "loja" && r.filial_slug === f.slug),
    ),
  );
  // Filial desativada hoje, mas com gente que fez check-in antes: não some.
  const conhecidas = new Set(filiais.map((f) => f.slug));
  const orfas = new Map<string, PresencaHojeRow[]>();
  for (const r of rows) {
    if (ativo(r) && r.modo === "loja" && r.filial_slug && !conhecidas.has(r.filial_slug)) {
      orfas.set(r.filial_slug, [...(orfas.get(r.filial_slug) ?? []), r]);
    }
  }
  for (const [slug, lista] of orfas) {
    colunas.push(coluna(`filial:${slug}`, lista[0].filial_nome ?? slug, lista));
  }
  colunas.push(
    coluna(
      "casa",
      "Em casa",
      rows.filter((r) => ativo(r) && r.modo === "casa"),
    ),
    coluna(
      "liberado_gestao",
      "Liberados pela gestão",
      rows.filter((r) => ativo(r) && r.modo === "liberado_gestao"),
    ),
    coluna(
      "sem_checkin",
      "Sem check-in",
      rows.filter((r) => !ativo(r)),
    ),
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
const FALHA_ROTULO: Record<FalhaLocalizacao, string> = {
  negada: "permissão negada",
  indisponivel: "GPS indisponível",
  tempo: "o aparelho não respondeu",
  sem_suporte: "navegador sem suporte",
};

export function statusRoletaLinha(
  r: Pick<
    PresencaHojeRow,
    | "modo"
    | "encerrado_em"
    | "apto_roleta"
    | "motivo"
    | "presente"
    | "distancia_m"
    | "falha_localizacao"
    | "precisao_m"
  >,
): { texto: string; intent: Intent } | null {
  if (r.modo === null || r.encerrado_em !== null) return null;
  if (barradoPelaLocalizacao(r)) {
    if (r.motivo === "sem_localizacao") {
      const falha = parseFalhaLocalizacao(r.falha_localizacao);
      return {
        texto: falha
          ? `Barrado: sem localização (${FALHA_ROTULO[falha]})`
          : "Barrado: sem localização",
        intent: "danger",
      };
    }
    if (precisaoAproximada(r.precisao_m)) {
      return {
        texto: `Barrado: localização imprecisa (±${distanciaLabel(r.precisao_m ?? 0)})`,
        intent: "danger",
      };
    }
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

/** Uma linha de presenca_checkins de hoje (o que o quadro e o card leem). */
export type CheckinDoDia = {
  corretor_id: string;
  modo: string;
  apto_roleta: boolean;
  motivo: string | null;
  created_at: string;
};

/**
 * Quem a localização barrou hoje e ainda não destravou — fica fora do reforço
 * no dia (decisão do dono 4, 12/10/2026), mesmo depois de trocar para "Em
 * casa". Destrava só um check-in POSTERIOR que liberou a roleta na filial
 * (GPS confirmado ou a gestão confirmando no plantão) ou a liberação da
 * gestão (interruptor). A regra é do banco (fallback_velocidade_ranking);
 * aqui só o sinal para a tela.
 */
export function barradosSemDestrave(checkins: CheckinDoDia[]): Set<string> {
  const barrado = (c: CheckinDoDia) =>
    c.modo === "loja" &&
    !c.apto_roleta &&
    (c.motivo === "fora_da_filial" || c.motivo === "sem_localizacao");
  const destrava = (c: CheckinDoDia) =>
    c.apto_roleta && (c.modo === "loja" || c.modo === "liberado_gestao");
  const fora = new Set<string>();
  for (const b of checkins) {
    if (!barrado(b) || fora.has(b.corretor_id)) continue;
    const t = Date.parse(b.created_at);
    const destravou = checkins.some(
      (d) => d.corretor_id === b.corretor_id && destrava(d) && Date.parse(d.created_at) > t,
    );
    if (!destravou) fora.add(b.corretor_id);
  }
  return fora;
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
