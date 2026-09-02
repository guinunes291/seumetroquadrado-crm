// Saneamento de leitura dos projetos — decisões de 2026-09-02
// (docs/revisao-projetos-foco.md, §4 itens 1, 2 e 5).
//
// A base de projetos nasce de tabelões heterogêneos das construtoras. Dois
// defeitos sistemáticos chegam até a prateleira do corretor e até o resumo que
// ele cola no WhatsApp do cliente:
//
//   1. METRAGEM com vírgula decimal perdida: "24,0 m²" virou 240. Um studio
//      MCMV de R$ 175 mil aparece com 240 m². A regra aprovada: metragem acima
//      de 150 m² em produto abaixo de R$ 600 mil (ou sem preço) é dividida por
//      10 — desde que o resultado seja plausível para apartamento. É idempotente:
//      depois de corrigida (24), a regra não dispara mais.
//   2. BAIRRO com a cidade colada: "Vila das Belezas - Sao Paulo", "Ponte Grande
//      (Guarulhos)", ou só "Sao Paulo" no lugar do bairro. Separar bairro e
//      cidade evita "Vila das Belezas - Sao Paulo, São Paulo" no chip e permite
//      reconhecer Grande SP pela cidade.
//
// Tudo puro e testado (tests/projetos-saneamento.test.ts). A mesma regra roda no
// importador (preview + gravação) e na leitura, e existe em SQL na migration
// 20260902120000_prateleira_projetos.sql para corrigir o que já está no banco.

import { ehGrandeSP } from "@/lib/zonas";

/** Acima disso, metragem em produto MCMV é vírgula perdida, não apartamento. */
export const METRAGEM_SUSPEITA_ACIMA_DE = 150;

/** Produto com preço a partir deste valor pode ter metragem grande de verdade. */
export const PRECO_TETO_SANEAMENTO = 600_000;

/** Faixa plausível para a metragem corrigida (studio compacto até cobertura). */
export const METRAGEM_PLAUSIVEL = { min: 12, max: 250 } as const;

export type MetragemSaneada = {
  metragem_min: number | null;
  metragem_max: number | null;
  /** true quando a regra dividiu por 10 — a UI pode sinalizar "corrigido". */
  corrigida: boolean;
};

const numeroValido = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

const suspeita = (v: number | null | undefined): boolean =>
  numeroValido(v) && v > METRAGEM_SUSPEITA_ACIMA_DE;

const plausivel = (v: number | null): boolean =>
  v == null || (v >= METRAGEM_PLAUSIVEL.min && v <= METRAGEM_PLAUSIVEL.max);

/** Divide por 10 mantendo uma casa decimal (24,5 m² continua 24,5). */
const dividePorDez = (v: number | null): number | null => (v == null ? null : Math.round(v) / 10);

/**
 * Aplica a regra de sanidade da metragem. Só mexe quando há valor suspeito,
 * o preço permite e o resultado é plausível; caso contrário devolve o dado
 * original intocado — corrigir errado é pior do que não corrigir.
 */
export function saneiaMetragem(
  metragemMin: number | null | undefined,
  metragemMax: number | null | undefined,
  precoAPartir: number | null | undefined,
): MetragemSaneada {
  const min = numeroValido(metragemMin) ? metragemMin : null;
  const max = numeroValido(metragemMax) ? metragemMax : null;
  const original: MetragemSaneada = { metragem_min: min, metragem_max: max, corrigida: false };

  if (!suspeita(min) && !suspeita(max)) return original;
  if (numeroValido(precoAPartir) && precoAPartir >= PRECO_TETO_SANEAMENTO) return original;

  const novoMin = suspeita(min) ? dividePorDez(min) : min;
  const novoMax = suspeita(max) ? dividePorDez(max) : max;
  if (!plausivel(novoMin) || !plausivel(novoMax)) return original;
  // Uma faixa invertida (mín > máx) diz que a hipótese está errada.
  if (novoMin != null && novoMax != null && novoMin > novoMax) return original;

  return { metragem_min: novoMin, metragem_max: novoMax, corrigida: true };
}

// ---------------------------------------------------------------------------
// Bairro e cidade
// ---------------------------------------------------------------------------

export type LocalSaneado = { bairro: string | null; cidade: string | null };

const CIDADE_SP = "São Paulo";

/** Sem acento, minúsculo, espaços normalizados — chave de comparação. */
export function chaveTexto(s: string | null | undefined): string {
  if (!s) return "";
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const ehSaoPaulo = (s: string | null | undefined): boolean => {
  const k = chaveTexto(s).replace(/[.]/g, "");
  return k === "sao paulo" || k === "sp" || k === "sao paulo sp";
};

/** Só separa quando o sufixo é uma cidade que conhecemos: capital ou Grande SP. */
const cidadeReconhecida = (s: string): string | null => {
  if (ehSaoPaulo(s)) return CIDADE_SP;
  if (ehGrandeSP(s)) return s.trim();
  return null;
};

const limpa = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  return t.length > 0 ? t : null;
};

/**
 * Separa bairro e cidade quando a planilha colou os dois. Só desmonta o texto
 * quando o pedaço da direita é uma cidade conhecida — "Lapa/Perdizes" é um par
 * de bairros e fica inteiro. A cidade informada na coluna própria sempre vence;
 * o sufixo só preenche o que estava vazio.
 *
 *   "Vila das Belezas - Sao Paulo" → { bairro: "Vila das Belezas", cidade: "São Paulo" }
 *   "Ponte Grande (Guarulhos)"     → { bairro: "Ponte Grande", cidade: "Guarulhos" }
 *   "Sao Paulo"                    → { bairro: null, cidade: "São Paulo" }
 */
export function saneiaLocal(
  bairroBruto: string | null | undefined,
  cidadeBruta: string | null | undefined,
): LocalSaneado {
  let bairro = limpa(bairroBruto);
  let cidade = limpa(cidadeBruta);

  if (bairro) {
    // "Bairro - Cidade" / "Bairro – Cidade" / "Bairro / Cidade"
    const comSufixo = bairro.match(/^(.*?)\s*[-–/]\s*([^-–/]+)$/);
    if (comSufixo && comSufixo[1].trim()) {
      const cidadeDoSufixo = cidadeReconhecida(comSufixo[2]);
      if (cidadeDoSufixo) {
        bairro = comSufixo[1].trim();
        cidade = cidade ?? cidadeDoSufixo;
      }
    }
    // "Bairro (Cidade)"
    const comParenteses = bairro.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (comParenteses && comParenteses[1].trim()) {
      const cidadeDoParentese = cidadeReconhecida(comParenteses[2]);
      if (cidadeDoParentese) {
        bairro = comParenteses[1].trim();
        cidade = cidade ?? cidadeDoParentese;
      }
    }
    // Só a cidade no lugar do bairro: não há bairro.
    if (ehSaoPaulo(bairro)) {
      bairro = null;
      cidade = cidade ?? CIDADE_SP;
    }
  }

  if (cidade && ehSaoPaulo(cidade)) cidade = CIDADE_SP;

  return { bairro, cidade };
}
