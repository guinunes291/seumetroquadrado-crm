/** Percentuais do imóvel, arredondados como a regra financeira no banco. */
export function comissaoDaRegra(total: number, share: number): number {
  return Math.round(total * share * 100) / 10000;
}

export function validarAjusteComissao(total: number, share: number, corretor: number, justificativa: string): string | null {
  if (![total, share, corretor].every(Number.isFinite) || total < 0 || total > 100 || corretor < 0 || corretor > 100) {
    return "Percentuais inválidos — use números entre 0 e 100.";
  }
  if (Math.abs(corretor - comissaoDaRegra(total, share)) > 0.0000001 && !justificativa.trim()) {
    return "Informe a justificativa da alteração da comissão do corretor.";
  }
  if (justificativa.trim().length > 1000) return "Justificativa excede 1000 caracteres.";
  return null;
}