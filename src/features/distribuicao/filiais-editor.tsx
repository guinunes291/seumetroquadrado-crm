// O editor de filial do corretor (a "região de atuação" é por FILIAL
// inteira desde 12/10/2026) — usado pelo quadro "Quem está em qual roleta".
// Escrita SEMPRE pela RPC auditada atualizar_corretor_distribuicao, que inclui
// ou remove o corretor da roleta da filial inteira; mandar só parte das zonas
// de uma filial o banco recusa ("a região é por filial").

import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  filiaisDaRegiao,
  rotuloFilial,
  uniaoDasZonas,
  zonasSoltas,
  type FilialRoleta,
} from "@/lib/distribuicao";

/** As FILIAIS em que o corretor está inteiro (todas as zonas da filial na
 *  região — o banco espelha as roletas em profiles.zonas). Zona solta sem
 *  filial completa não deve acontecer; se vier, aparece a zona. Sem filial =
 *  não recebe lead de roleta de filial (nem o rodízio do lead sem zona). */
export function FiliaisBadges({ zonas, filiais }: { zonas: string[]; filiais: FilialRoleta[] }) {
  if (zonas.length === 0) return <StatusBadge intent="warning">Sem filial</StatusBadge>;
  const minhas = filiaisDaRegiao(filiais, zonas);
  const soltas = zonasSoltas(filiais, zonas);
  return (
    <div className="flex flex-wrap gap-1">
      {minhas.map((f) => (
        <Badge key={f.slug} variant="secondary">
          {rotuloFilial(f, " · ")}
        </Badge>
      ))}
      {soltas.map((z) => (
        <Badge key={z} variant="outline">
          {z}
        </Badge>
      ))}
    </div>
  );
}

/** Filial do corretor — rascunho + Salvar (padrão da casa), gravando pela
 *  RPC auditada, que inclui/remove o corretor da roleta da filial inteira (a
 *  aba Roletas mostra o mesmo time). A caixa vem marcada quando todas as
 *  zonas da filial estão na região; salvar manda a UNIÃO das zonas das
 *  filiais marcadas. Quem atende a Leste pode estar em duas (Liberdade e
 *  Belém). */
export function FiliaisEditor({
  corretor,
  filiais,
  onSalvar,
  pending,
}: {
  corretor: { nome: string; zonas: string[] };
  filiais: FilialRoleta[];
  onSalvar: (zonas: string[]) => void;
  pending: boolean;
}) {
  const [rascunho, setRascunho] = useState<Set<string> | null>(null);
  const atual = new Set(filiaisDaRegiao(filiais, corretor.zonas).map((f) => f.slug));
  const marcadas = rascunho ?? atual;
  const mudou =
    rascunho !== null && (rascunho.size !== atual.size || [...rascunho].some((f) => !atual.has(f)));
  const soltas = zonasSoltas(filiais, corretor.zonas);

  const toggle = (slug: string) => {
    const next = new Set(marcadas);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setRascunho(next);
  };

  const resumo = [...filiais.filter((f) => atual.has(f.slug)).map((f) => f.nome), ...soltas].join(
    ", ",
  );

  return (
    <Popover onOpenChange={(o) => !o && setRascunho(null)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-[120px] justify-start gap-1"
          aria-label={`Filial de ${corretor.nome}`}
        >
          {corretor.zonas.length === 0 ? (
            <span className="text-warning">Sem filial</span>
          ) : (
            <span className="truncate">{resumo || corretor.zonas.join(", ")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Entra no time da filial: recebe os leads das zonas dela (de qualquer origem) e entra no
          rodízio do lead sem zona. Sem filial, não recebe lead de filial.
        </p>
        {filiais.length === 0 && (
          <p className="px-1 py-1.5 text-xs text-muted-foreground">
            Nenhuma roleta de filial ativa.
          </p>
        )}
        {filiais.map((f) => (
          <label
            key={f.slug}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={marcadas.has(f.slug)}
              onCheckedChange={() => toggle(f.slug)}
              aria-label={rotuloFilial(f)}
            />
            {rotuloFilial(f)}
          </label>
        ))}
        {soltas.length > 0 && (
          <p className="px-1 pt-1 text-xs text-warning">
            Zona sem filial completa: {soltas.join(", ")}. Salvar refaz a região pelas filiais
            marcadas.
          </p>
        )}
        {mudou && (
          <div className="pt-2">
            <Button
              size="sm"
              className="w-full"
              disabled={pending}
              onClick={() => {
                onSalvar(uniaoDasZonas(filiais, marcadas));
                setRascunho(null);
              }}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
