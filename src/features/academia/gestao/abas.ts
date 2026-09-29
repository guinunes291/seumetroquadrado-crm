// Lista das abas do hub de gestão. Fica num arquivo só dela porque o
// `validateSearch` da rota roda no chunk principal do app: se a rota importar
// esta lista de gestao-page.tsx, o bundler leva a página e as 7 abas junto
// para o chunk principal (medido: +20 KB gzip, estourando o budget de 250 KB).

export const ABAS_GESTAO = [
  "agora",
  "praticas",
  "time",
  "participantes",
  "recomendacoes",
  "efeito",
  "encontros",
] as const;
export type AbaGestao = (typeof ABAS_GESTAO)[number];
