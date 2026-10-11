// Política de fluxo da MUNDO APTO (inclui a marca Elevato), copiada do
// "Tabelão Promocional Outubro 2026" da Mundo Apto Parcerias: páginas
// "Modalidades de pagamento" e "Vencimentos e regras gerais" da Política de
// Análise de Crédito, versão de 09/04/2026.
//
// COMO ATUALIZAR quando vier Tabelão novo: confira as duas páginas da
// política. Mudou a versão da política ou algum vencimento? Atualize as
// constantes abaixo e suba a `versao` da Mundo Apto em construtoras.ts.
// As regras de cada modalidade (os percentuais) moram em mundo-apto.ts.

/** Vencimento padrão das parcelas por empreendimento. */
export interface VencimentosMundoApto {
  /** Aceita parcelas semestrais ("Livre" na política). */
  semestral: boolean;
  /** Aceita anuais (em dezembro). */
  anual: boolean;
  /** Mês da parcela única (YYYY-MM). Cai no habite-se. null = "—". */
  unica: string | null;
  /** Mês em que começa a mensal pós (YYYY-MM). null = "—". */
  mensalPos: string | null;
}

export const VERSAO_POLITICA = "2026-04-09";
export const TABELAO = "2026-10";
/** Dia em que esta cópia foi conferida com o Tabelão. */
export const CONFERIDA_EM_MA = "2026-10-11";
export const FONTE_POLITICA_MA =
  "Tabelão Promocional out/2026 da Mundo Apto Parcerias, política de crédito de 09/04/2026";

const sem: VencimentosMundoApto = { semestral: false, anual: false, unica: null, mensalPos: null };
const livre = (unica: string, mensalPos: string): VencimentosMundoApto => ({
  semestral: true,
  anual: true,
  unica,
  mensalPos,
});

// Mesma ordem e mesmos nomes da tabela "Vencimento padrão das parcelas".
// prettier-ignore
export const VENCIMENTOS_MUNDO_APTO: Record<string, VencimentosMundoApto> = {
  "MA Praça da Sé":              sem,
  "MA Pacaembu":                 sem,
  "MA Vila Matilde":             sem,
  "MA Jabaquara":                sem,
  "MA Freguesia":                sem,
  "MA Inajar":                   sem,
  "MA Campo Belo":               livre("2026-03", "2026-04"),
  "MA Mooca":                    livre("2026-12", "2027-01"),
  "MA Brooklin":                 livre("2027-06", "2027-07"),
  "MA Santa Cecília":            livre("2027-04", "2027-05"),
  "MA Piqueri":                  livre("2027-05", "2027-06"),
  "MA Estação Lapa":             livre("2027-08", "2027-09"),
  "Estação Aricanduva":          livre("2028-02", "2028-03"),
  "Elevato Brooklin":            livre("2028-05", "2028-06"),
  "Elevato Bosque da Saúde":     livre("2028-06", "2028-07"),
  "MA Alto do Ipiranga (F1/F2)": livre("2028-09", "2028-10"),
  "Estação Conceição":           livre("2028-08", "2028-09"),
  "Elevato Pinheiros":           livre("2028-05", "2028-06"),
  "Estação SP Morumbi (F1/F2)":  livre("2029-02", "2029-03"),
  "Estação Borba Gato":          livre("2028-12", "2029-01"),
  "Essência Vila Prudente":      livre("2029-01", "2029-02"),
};
