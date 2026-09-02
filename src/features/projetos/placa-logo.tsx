// PlacaLogo — a logo da construtora sempre legível (decisão 13 de 2026-09-02).
//
// Logo é arte de terceiro: umas são escuras/coloridas (Cyrela, Conx, Lavvi),
// outras só existem em branco (Tenda, Emccamp, Vitta). Jogar todas no mesmo
// gradiente navy apagava metade delas. A placa resolve: fundo claro para as
// escuras, navy para as brancas — quem decide é o manifesto (lib/logos-
// construtoras) ou, para a logo subida pela gestão, o padrão "claro".

import { cn } from "@/lib/utils";
import type { LogoPrateleira } from "@/lib/prateleira";

type Tamanho = "sm" | "md" | "lg" | "xl";

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-7 w-12 rounded-md p-1",
  md: "h-10 w-[4.5rem] rounded-lg p-1.5",
  lg: "h-14 w-32 rounded-xl p-2",
  xl: "h-20 w-44 rounded-2xl p-3",
};

export function PlacaLogo({
  logo,
  nome,
  tamanho = "md",
  className,
}: {
  logo: LogoPrateleira;
  /** Nome da construtora, para o title (o texto visível fica por conta do pai). */
  nome: string;
  tamanho?: Tamanho;
  className?: string;
}) {
  const escuro = logo.fundo === "escuro";
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden shadow-elev-1",
        escuro ? "bg-gradient-command ring-1 ring-white/15" : "bg-white ring-1 ring-black/5",
        TAMANHOS[tamanho],
        className,
      )}
      title={nome}
      aria-hidden="true"
    >
      <img
        src={logo.url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  );
}
