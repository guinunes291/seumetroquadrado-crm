// "Vendo a base de Fulano · voltar para a minha": quando a gestão abre a tela
// de um corretor por `?corretor=`, a tela diz de quem é e oferece voltar.
// Nasceu no topo da Fila Única (o bloco `fila-de-outro`) e vale para as três
// seções da Central que abrem a carteira de outro: a fila, os 65 e a base.

import { Link } from "@tanstack/react-router";

export function VendoDeOutro({
  oQue,
  nome,
  voltarPara,
  voltarRotulo = "voltar para a minha",
  "data-testid": testId,
}: {
  /** "a fila", "a base", "os 65". */
  oQue: string;
  /** Nome do corretor dono da tela. */
  nome: string;
  /** A própria seção, sem `?corretor=`. */
  voltarPara: "/fila" | "/reserva" | "/meus-65";
  voltarRotulo?: string;
  "data-testid"?: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs md:text-sm" data-testid={testId}>
      <span>
        Vendo {oQue} de <b>{nome}</b>
      </span>
      <Link to={voltarPara} className="text-primary hover:underline">
        {voltarRotulo}
      </Link>
    </p>
  );
}
