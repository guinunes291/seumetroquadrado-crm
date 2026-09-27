// Para onde o corretor travado pode ir. Puro, para ser testável.
//
// Decisão do dono: enquanto houver pendência obrigatória, só a tela do
// processo, a ficha dos leads que estão na lista e o hub de projetos (para
// consultar o empreendimento com o cliente na linha). Todo o resto redireciona
// para /obrigatorio.

export const ROTA_OBRIGATORIO = "/obrigatorio";

/** Prefixos sempre liberados: o processo e a consulta de projetos. */
const PREFIXOS_LIVRES = ["/obrigatorio", "/projetos", "/vitrine"];

function casaPrefixo(pathname: string, prefixo: string): boolean {
  return (
    pathname === prefixo ||
    pathname.startsWith(`${prefixo}/`) ||
    // /projetos-foco e /projetos-materiais são o mesmo hub.
    (prefixo === "/projetos" && pathname.startsWith("/projetos-"))
  );
}

export function rotaPermitidaTravado(pathname: string, leadIds: readonly string[]): boolean {
  const limpo = pathname.replace(/\/+$/, "") || "/";
  if (PREFIXOS_LIVRES.some((p) => casaPrefixo(limpo, p))) return true;
  const ficha = /^\/leads\/([^/]+)$/.exec(limpo);
  return ficha !== null && leadIds.includes(ficha[1]);
}
