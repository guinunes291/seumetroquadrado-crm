export const SOCIO_PERCENTUAL = 0.3;
export const SOCIOS_PERCENTUAL_TOTAL = SOCIO_PERCENTUAL * 2;
export const GUILHERME_SOCIO_ID = "43866728-4cde-4f74-a5de-bbbecec10198";
export const FABIO_SOCIO_IDS = [
  "5531c08f-e0dc-4289-90f3-b6105eab4c4c",
] as const;

export function comissaoIndividualSocio(valorVenda: number) {
  return Math.round((valorVenda * SOCIO_PERCENTUAL / 100 + Number.EPSILON) * 100) / 100;
}