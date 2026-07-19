/**
 * Decisão do guard de conta ativa (rota autenticada).
 *
 * Distingue NEGAÇÃO REAL (o banco respondeu que a conta está inativa/bloqueada)
 * de FALHA DE INFRAESTRUTURA (RPC ausente, timeout, 5xx, rede). Só a negação
 * real pode encerrar a sessão: um soluço de banco não pode deslogar todo mundo
 * — a RLS continua sendo a barreira real no servidor enquanto isso.
 *
 * Regressão protegida: P1-1 da auditoria de 2026-07-11 (o guard antigo tratava
 * erro transitório como conta inativa e fazia signOut global).
 */
export type ResultadoContaAtiva = "ativa" | "inativa" | "indisponivel";

export type RespostaRpcContaAtiva = {
  data: boolean | null;
  error: unknown;
};

export async function verificarContaAtiva(
  chamarRpc: () => Promise<RespostaRpcContaAtiva>,
  opts: { tentativas?: number; esperaMs?: number } = {},
): Promise<ResultadoContaAtiva> {
  const tentativas = opts.tentativas ?? 2;
  const esperaMs = opts.esperaMs ?? 400;

  let contaAtiva: boolean | null = null;
  let erro: unknown = null;
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    const res = await chamarRpc();
    erro = res.error;
    contaAtiva = res.data;
    if (!res.error) break;
    if (tentativa < tentativas - 1) {
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }

  if (erro) return "indisponivel";
  return contaAtiva ? "ativa" : "inativa";
}
