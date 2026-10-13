// "Incluir minha localização" (pedido do dono, 13/10/2026) — a PRÉVIA das
// distâncias, pura. Só vai nos chunks lazy (diálogo e card), nunca no shell.
//
// A tela é PRÉVIA, quem decide é o banco. Aqui mora um espelho, termo a termo,
// da regra de presenca_checkin (0082, 20261021120000_presenca_exigida_
// fallback_velocidade.sql) e de public._distancia_metros (20261013120000_
// presenca_por_filial.sql):
//   _dist := round(_distancia_metros(aparelho, filial))
//   _prec := CASE WHEN _precisao_m IS NULL OR _precisao_m < 0 THEN NULL ELSE round(_precisao_m) END
//   confirmada ⇔ _dist <= raio_metros + least(coalesce(_prec, 0), 150)
// O espelho serve só para mostrar "você está aqui" e "a 6,1 km" antes da
// escolha, e para pular a pergunta quando a mesma leitura que vai à RPC já
// está folgadamente dentro. A aptidão continua sendo o que o banco devolve.
//
// Por que `rint`: o round(double precision) do Postgres arredonda o empate
// (x,5) para o PAR; Math.round sobe sempre. Na borda, 312,5 m de precisão
// viram 312 no banco e 313 no Math.round — e a tela prometeria um "dentro"
// que o banco barra.
//
// Por que a margem de 1 m: a libm do aparelho e a do Postgres podem divergir
// no último bit de sin/cos/asin; na borda exata, isso muda o arredondamento.
// O check-in direto (sem a pergunta) só sai com 1 m de folga sobre o limite;
// na borda, a pergunta de sempre — e o banco decide. (A paridade é conferida
// no CI: tests/db/presenca-previa-paridade.test.ts.)

import type { Intent } from "@/lib/status-tones";
import {
  AVISO_COMPUTADOR,
  distanciaLabel,
  horaSaoPaulo,
  mensagemSemLocalizacao,
  precisaoAproximada,
  rotuloLocal,
  type CheckinAtual,
  type FalhaLocalizacao,
  type FilialOpcao,
} from "./presenca-derive";
import type { FilialRow, LeituraIncluida } from "./presenca-client";
import type { EstadoLocalizacao } from "./use-localizacao-incluida";

export const RAIO_TERRA_M = 6_371_000;
/** A precisão do aparelho alarga o raio até 150 m (least(..., 150) no banco). */
export const TOLERANCIA_PRECISAO_MAX_M = 150;
/** O check-in direto exige 1 m de folga sobre o limite (libm do aparelho ≠ do Postgres). */
export const MARGEM_DIRETO_M = 1;
// radians(x) do Postgres = x * (π/180), nessa ordem (RADIANS_PER_DEGREE).
const RADIANOS_POR_GRAU = Math.PI / 180;

/** round(double precision) do Postgres = rint: x,5 vai para o PAR. */
export function arredondarComoBanco(x: number): number {
  if (!Number.isFinite(x)) return x;
  const piso = Math.floor(x);
  const resto = x - piso;
  if (resto > 0.5) return piso + 1;
  if (resto < 0.5) return piso;
  return piso % 2 === 0 ? piso : piso + 1;
}

/** A precisão como o banco grava: null/negativa/não finita → null; senão rint. */
export function precisaoComoBanco(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p) || p < 0) return null;
  return arredondarComoBanco(p);
}

/**
 * public._distancia_metros, na mesma ordem dos termos (lat1/lng1 = aparelho;
 * lat2/lng2 = filial, como presenca_checkin chama).
 */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return (
    2 *
    RAIO_TERRA_M *
    Math.asin(
      Math.sqrt(
        Math.sin(((lat2 - lat1) * RADIANOS_POR_GRAU) / 2) ** 2 +
          Math.cos(lat1 * RADIANOS_POR_GRAU) *
            Math.cos(lat2 * RADIANOS_POR_GRAU) *
            Math.sin(((lng2 - lng1) * RADIANOS_POR_GRAU) / 2) ** 2,
      ),
    )
  );
}

/** A regra do presenca_checkin com os arredondamentos do banco. */
export function dentroDoRaio(
  distanciaBruta: number,
  precisaoBruta: number | null,
  raio: number,
): { distancia_m: number; precisao_m: number | null; limite_m: number; dentro: boolean } {
  const distancia_m = arredondarComoBanco(distanciaBruta);
  const precisao_m = precisaoComoBanco(precisaoBruta);
  const limite_m = raio + Math.min(precisao_m ?? 0, TOLERANCIA_PRECISAO_MAX_M);
  return { distancia_m, precisao_m, limite_m, dentro: distancia_m <= limite_m };
}

export type CoordenadasFilial = Pick<
  FilialRow,
  "slug" | "latitude" | "longitude" | "raio_metros" | "ativa"
>;

export type ConferenciaFilial =
  { tipo: "sem_coordenadas" } | { tipo: "dentro" | "fora"; distancia_m: number; limite_m: number };

/** Uma filial contra a leitura. Sem pino, o banco libera (filial_sem_coordenadas). */
export function conferirFilial(
  l: Pick<LeituraIncluida, "lat" | "lng" | "precisao">,
  f: CoordenadasFilial,
): ConferenciaFilial {
  if (f.latitude == null || f.longitude == null) return { tipo: "sem_coordenadas" };
  const r = dentroDoRaio(
    distanciaMetros(l.lat, l.lng, f.latitude, f.longitude),
    l.precisao,
    f.raio_metros,
  );
  return { tipo: r.dentro ? "dentro" : "fora", distancia_m: r.distancia_m, limite_m: r.limite_m };
}

export type Previa = {
  /** A precisão como o banco gravaria (rint). */
  precisao_m: number | null;
  /** Acima de 1 km (Wi-Fi ou IP): a distância não prova onde a pessoa está. */
  aproximada: boolean;
  /** Só os slugs das opções com linha ATIVA na tabela de filiais. */
  porFilial: Record<string, ConferenciaFilial>;
  /** A "dentro" de menor distância (empate: a ordem das opções); sempre null se aproximada. */
  aqui: string | null;
  /** A de menor distância entre as conferidas (dentro ou fora). */
  maisPerto: { slug: string; distancia_m: number } | null;
};

/** A prévia de todas as opções do check-in com uma leitura. */
export function previaDasFiliais(
  l: Pick<LeituraIncluida, "lat" | "lng" | "precisao">,
  opcoes: Pick<FilialOpcao, "slug">[],
  coordenadas: CoordenadasFilial[],
): Previa {
  const aproximada = precisaoAproximada(l.precisao);
  const porFilial: Record<string, ConferenciaFilial> = {};
  let aqui: { slug: string; distancia_m: number } | null = null;
  let maisPerto: { slug: string; distancia_m: number } | null = null;
  for (const o of opcoes) {
    const linha = coordenadas.find((f) => f.slug === o.slug && f.ativa);
    if (!linha) continue;
    const conf = conferirFilial(l, linha);
    porFilial[o.slug] = conf;
    if (conf.tipo === "sem_coordenadas") continue;
    // "<" estrito: no empate, fica a que veio antes nas opções.
    if (!maisPerto || conf.distancia_m < maisPerto.distancia_m) {
      maisPerto = { slug: o.slug, distancia_m: conf.distancia_m };
    }
    if (conf.tipo === "dentro" && (!aqui || conf.distancia_m < aqui.distancia_m)) {
      aqui = { slug: o.slug, distancia_m: conf.distancia_m };
    }
  }
  return {
    precisao_m: precisaoComoBanco(l.precisao),
    aproximada,
    porFilial,
    aqui: aproximada ? null : (aqui?.slug ?? null),
    maisPerto,
  };
}

export type RotuloPrevia = { texto: string; intent: Intent; aqui: boolean };

/**
 * O rótulo da opção com a prévia. null = sem dado: a opção mantém o endereço
 * curto (como antes). A ordem das filiais nunca muda — nada sai de baixo do
 * dedo.
 */
export function rotuloDaFilialNaPrevia(previa: Previa | null, slug: string): RotuloPrevia | null {
  const conf = previa?.porFilial[slug];
  if (!previa || !conf || conf.tipo === "sem_coordenadas") return null;
  const d = distanciaLabel(conf.distancia_m);
  if (previa.aproximada) return { texto: `≈ ${d}`, intent: "neutral", aqui: false };
  if (slug === previa.aqui) return { texto: "Você está aqui", intent: "success", aqui: true };
  if (conf.tipo === "dentro") {
    return { texto: `Dentro do raio (a ${d})`, intent: "success", aqui: false };
  }
  return { texto: `a ${d}`, intent: "neutral", aqui: false };
}

/**
 * O que o toque numa filial faz (com a prévia):
 * - direto: check-in sem a pergunta, com a mesma leitura;
 * - confirmar: a pergunta de sempre ("Você está dentro da loja…?");
 * - aviso_fora / aviso_sem_localizacao: o aviso ANTES do check-in, sem RPC
 *   (com a mesma leitura, o banco barraria).
 */
export type DecisaoToque = "direto" | "confirmar" | "aviso_fora" | "aviso_sem_localizacao";

/** Nesta ordem, a primeira que bater. */
export function decidirToqueFilial(i: {
  exige: boolean;
  filial: Pick<FilialOpcao, "slug" | "tem_coordenadas">;
  /** O chamador já passou por leituraValida(agora). */
  leitura: LeituraIncluida | null;
  /** Falha do Incluir há ≤ VALIDADE_LEITURA_MS. */
  falhaRecente: FalhaLocalizacao | null;
  previa: Previa | null;
}): DecisaoToque {
  // 1. Exigência desligada: nada a perder (com a leitura, se houver; sem
  // ela, a RPC lê o GPS como antes).
  if (!i.exige) return "direto";
  // 2. Filial sem pino: o banco libera com filial_sem_coordenadas.
  if (!i.filial.tem_coordenadas) return "confirmar";
  // 3. O Incluir acabou de falhar: o check-in iria sem localização.
  if (!i.leitura && i.falhaRecente) return "aviso_sem_localizacao";
  // 4. Sem leitura ou sem prévia (distâncias não carregaram): como antes.
  if (!i.leitura || !i.previa) return "confirmar";
  const conf = i.previa.porFilial[i.filial.slug];
  // 5. Filial fora da tabela lida ou sem pino na tabela.
  if (!conf || conf.tipo === "sem_coordenadas") return "confirmar";
  // 6. Fora (com ou sem leitura aproximada): o banco barraria.
  if (conf.tipo === "fora") return "aviso_fora";
  // 7. "Dentro" com leitura aproximada não prova nada.
  if (i.previa.aproximada) return "confirmar";
  // 8. Dentro com folga: direto.
  if (conf.distancia_m + MARGEM_DIRETO_M <= conf.limite_m) return "direto";
  // 9. Borda exata: a pergunta, e o banco decide.
  return "confirmar";
}

/** O check-in que vale agora e que um check-in novo encerraria. */
export type EncerraValido =
  | { tipo: "gestao_loja"; filial: string }
  | { tipo: "liberado" }
  | { tipo: "valendo"; local: string };

/** Só com o check-in de hoje aberto e apto (o barrado e o encerrado não contam). */
export function encerraDoVisto(c: CheckinAtual | null): EncerraValido | null {
  if (!c || c.encerrado_em !== null || !c.apto_roleta) return null;
  if (c.modo === "loja" && c.origem === "gestao") {
    return { tipo: "gestao_loja", filial: c.filial_nome ?? "filial" };
  }
  if (c.modo === "liberado_gestao") return { tipo: "liberado" };
  return { tipo: "valendo", local: rotuloLocal(c.modo, c.filial_nome) };
}

/**
 * "Isso também encerra o plantão na Barra Funda confirmado pela gestão." — o
 * custo de um check-in novo com outro valendo. O aviso antes do check-in e a
 * pergunta "Estou na loja" (diálogo e card) dizem a MESMA frase: sem leitura
 * incluída, a troca passa pela pergunta, e a confirmação da gestão sumiria
 * sem aviso nenhum antes do toque.
 */
export function fraseEncerra(e: EncerraValido | null): string | null {
  switch (e?.tipo) {
    case "gestao_loja":
      return `Isso também encerra o plantão na ${e.filial} confirmado pela gestão.`;
    case "liberado":
      return "Isso também encerra a liberação da gestão de hoje.";
    case "valendo":
      return `Isso também encerra o seu check-in de agora (${e.local}), que está valendo.`;
    default:
      return null;
  }
}

export type TextosAviso = {
  titulo: string;
  orientacao: string | null;
  consequencia: string;
  encerra: string | null;
  dica: string | null;
  resgate: string | null;
};

const LIGUE_A_PRECISA = "Ligue a localização precisa do celular e inclua de novo.";

/** Os textos do aviso antes do check-in (diálogo e card). */
export function avisoAntesDoCheckin(i: {
  variante: "fora" | "sem_localizacao";
  /** O nome da filial tocada. */
  filial: string;
  /** Variante fora: a conferência da filial tocada. */
  conferencia: ConferenciaFilial | null;
  previa: Previa | null;
  /** Variante sem_localizacao: por que o Incluir falhou. */
  falha: FalhaLocalizacao | null;
  computador: boolean;
  jaBarrado: boolean;
  encerra: EncerraValido | null;
  /** Já filtrado: ≠ desta filial e leitura não aproximada. */
  aqui: { slug: string; nome: string } | null;
}): TextosAviso {
  const fora = i.variante === "fora";
  const aproximada = fora && !!i.previa?.aproximada;
  const distancia =
    i.conferencia && i.conferencia.tipo !== "sem_coordenadas" ? i.conferencia.distancia_m : null;
  const titulo = !fora
    ? `Sem a localização, o check-in na filial ${i.filial} fica barrado`
    : aproximada
      ? `A localização deste aparelho é aproximada (±${distanciaLabel(i.previa?.precisao_m ?? 0)})`
      : distancia != null
        ? `Você está a ${distanciaLabel(distancia)} da filial ${i.filial}`
        : `Você está longe da filial ${i.filial}`;
  const orientacao = !fora
    ? mensagemSemLocalizacao(i.falha, { computador: i.computador })
    : aproximada
      ? i.computador
        ? AVISO_COMPUTADOR
        : LIGUE_A_PRECISA
      : null;
  const consequencia = i.jaBarrado
    ? `Se fizer o check-in na filial ${i.filial} agora, ele também fica barrado: você continua fora das roletas e do reforço hoje.`
    : `Se fizer o check-in na filial ${i.filial} agora, ele fica barrado: você fica fora das roletas e do reforço hoje. ` +
      "O reforço só volta com um check-in na loja que valha (ou se a gestão liberar você); escolher Em casa depois não devolve. " +
      "As visitas marcadas pelo SDR continuam chegando.";
  return {
    titulo,
    orientacao,
    consequencia,
    encerra: fraseEncerra(i.encerra),
    dica:
      fora && !aproximada
        ? "Está dentro da loja e o celular não confirma? Peça ao gestor para confirmar no plantão."
        : null,
    resgate: i.aqui ? `Pela localização, você está na filial ${i.aqui.nome}.` : null,
  };
}

/** O título de quando o "Incluir minha localização" não conseguiu a posição. */
export function tituloFalhaLeitura(falha: FalhaLocalizacao, computador: boolean): string {
  if (computador) return "Este computador não informou a localização";
  switch (falha) {
    case "negada":
      return "O navegador bloqueou a localização";
    case "indisponivel":
    case "tempo":
      return "O celular não informou a localização";
    case "sem_suporte":
      return "Este navegador não informa a localização";
  }
}

/**
 * "2ª tentativa às 09:42: o navegador bloqueou a localização." — o "Incluir
 * localização" do barrado que falhou de novo (nada gravado): sem esta linha, a
 * mesma falha deixa a tela igual e parece que o toque não fez nada. `n` conta
 * o check-in barrado como a 1ª tentativa, então sempre muda a cada toque.
 */
export function textoNovaTentativa(
  n: number,
  em: number,
  falha: FalhaLocalizacao,
  computador: boolean,
): string {
  const titulo = tituloFalhaLeitura(falha, computador);
  const motivo = titulo.charAt(0).toLowerCase() + titulo.slice(1);
  return `${n}ª tentativa às ${horaSaoPaulo(em) ?? "agora"}: ${motivo}.`;
}

const SEM_DISTANCIAS = "mas as distâncias não carregaram agora: escolha normalmente.";

/**
 * A linha enquanto o GPS lê: ocupa o lugar da linha de antes e da que vem
 * depois (nada pula embaixo do dedo no instante em que as opções destravam).
 */
export const TEXTO_LENDO = "Esperando o aparelho informar a localização…";

/** "(±40 m)" — a convenção de distanciaLabel (±15 → "±20 m", ±5000 → "±5 km"). */
const maisMenos = (precisao: number | null) =>
  precisao == null ? "" : ` (±${distanciaLabel(precisao)})`;

/** A linha sob o botão "Incluir minha localização" (lendo: uma linha neutra). */
export function textoDaLeitura(
  e: EstadoLocalizacao,
  _previa: Previa | null,
  o: { computador: boolean },
): { titulo: string; detalhe: string | null; intent: Intent } {
  switch (e.fase) {
    case "vazia":
      return {
        titulo:
          "Mostra a que distância você está de cada filial antes de escolher. Nada é registrado.",
        detalhe: null,
        intent: "neutral",
      };
    case "lendo":
      return { titulo: TEXTO_LENDO, detalhe: null, intent: "neutral" };
    case "incluida": {
      const precisao = e.leitura.precisao;
      if (e.coordenadas === null) {
        return {
          titulo: `Localização incluída${maisMenos(precisao)}, ${SEM_DISTANCIAS}`,
          detalhe: null,
          intent: "warning",
        };
      }
      if (precisaoAproximada(precisao)) {
        return {
          titulo: `Localização aproximada${maisMenos(precisao)}: não dá para saber em que filial você está.`,
          detalhe: o.computador ? AVISO_COMPUTADOR : LIGUE_A_PRECISA,
          intent: "warning",
        };
      }
      return {
        titulo: `Localização incluída${maisMenos(precisao)}`,
        detalhe: null,
        intent: "success",
      };
    }
    case "vencida":
      return {
        titulo: `A localização das ${horaSaoPaulo(e.lidaEm) ?? "agora há pouco"} venceu: inclua de novo para ver as distâncias.`,
        detalhe: null,
        intent: "neutral",
      };
    case "falhou":
      return {
        titulo: tituloFalhaLeitura(e.falha, o.computador),
        detalhe: mensagemSemLocalizacao(e.falha, { computador: o.computador }),
        intent: "warning",
      };
  }
}

/** O que a região viva anuncia sobre a leitura ("" = nada a anunciar). */
export function anuncioDaLeitura(
  e: EstadoLocalizacao,
  previa: Previa | null,
  nomes: Record<string, string>,
  o: { computador: boolean },
): string {
  switch (e.fase) {
    case "lendo":
      return "Lendo a localização…";
    case "incluida": {
      if (e.coordenadas === null) return `Localização incluída, ${SEM_DISTANCIAS}`;
      if (precisaoAproximada(e.leitura.precisao)) {
        return `Localização aproximada${maisMenos(e.leitura.precisao)}: não dá para saber em que filial você está.`;
      }
      if (previa?.aqui) {
        return `Localização incluída: você está na filial ${nomes[previa.aqui] ?? previa.aqui}.`;
      }
      if (previa?.maisPerto) {
        const { slug, distancia_m } = previa.maisPerto;
        return `Localização incluída: a filial mais perto é ${nomes[slug] ?? slug}, a ${distanciaLabel(distancia_m)}.`;
      }
      return "Localização incluída.";
    }
    case "falhou":
      return tituloFalhaLeitura(e.falha, o.computador);
    case "vazia":
    case "vencida":
      return "";
  }
}
