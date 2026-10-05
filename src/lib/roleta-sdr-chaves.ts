// Chaves da permanência semanal na roleta do SDR em distribuicao_settings
// (migration 20261011120000), na ordem da Central → Política. Módulo à parte
// para a aba Política (chunk principal) não puxar as regras da roleta inteiras.
export const CHAVES_ROLETA_SDR = [
  "roleta_sdr_regra_ativa",
  "roleta_sdr_modo_sombra",
  "roleta_sdr_peso_visita",
  "roleta_sdr_peso_pasta",
  "roleta_sdr_meta_pontos",
  "roleta_sdr_minimo_aptos",
  "roleta_sdr_venda_janela_dias",
] as const;
