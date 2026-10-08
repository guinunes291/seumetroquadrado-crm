// Onboarding prático do corretor (outubro/2026) — lógica PURA.
//
// O corretor percorre telas de TREINO (réplicas com clientes fictícios) e
// precisa clicar no botão certo de cada ação. Nada é gravado no banco além
// da conclusão, guardada como preferência do usuário (PREF_ONBOARDING_PRATICO).
// Trocar a versão da chave reabre a trilha para todos os corretores.

export const PREF_ONBOARDING_PRATICO = "onboarding:pratico:v1";

export type EstadoPasso = {
  /** Índice do alvo atual dentro da sequência do passo. */
  alvo: number;
  /** Todos os cliques obrigatórios foram feitos: mostra o card explicativo. */
  feito: boolean;
  /** Último clique fora do alvo (para o aviso "clique no botão destacado"). */
  errou: boolean;
};

export const ESTADO_INICIAL: EstadoPasso = { alvo: 0, feito: false, errou: false };

/** Avança só quando o clique é no alvo esperado; clique errado só marca o aviso. */
export function clicar(estado: EstadoPasso, sequencia: string[], id: string): EstadoPasso {
  if (estado.feito) return estado;
  if (sequencia[estado.alvo] !== id) return { ...estado, errou: true };
  const proximo = estado.alvo + 1;
  return { alvo: proximo, feito: proximo >= sequencia.length, errou: false };
}

/** Conclusão gravada: qualquer valor com `concluido_em`. */
export function praticoConcluido(valor: unknown): boolean {
  return (
    !!valor &&
    typeof valor === "object" &&
    typeof (valor as { concluido_em?: unknown }).concluido_em === "string"
  );
}
