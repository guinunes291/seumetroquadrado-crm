/**
 * Mantém o retorno pós-login estritamente na mesma origem. Barras invertidas
 * são rejeitadas porque navegadores as normalizam como barras em URLs HTTP,
 * transformando caminhos como `/\\evil.example` em navegação externa.
 */
export function safeSameOriginPath(next: string, origin: string): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    /%5c/i.test(next)
  ) {
    return "/";
  }

  try {
    const base = new URL(origin);
    const target = new URL(next, base);
    if (target.origin !== base.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Destino após autenticação. Nunca devolve o usuário à própria tela de login,
 * inclusive quando um `next` antigo contém outro `/auth?next=...` aninhado.
 */
export function safePostLoginPath(next: string, origin: string): string {
  const path = safeSameOriginPath(next, origin);
  if (path === "/" || path === "/auth" || path.startsWith("/auth?")) {
    return "/inicio";
  }
  return path;
}
