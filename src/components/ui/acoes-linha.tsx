// O menu "…" de uma linha (identidade Lançamento, regra 5): a linha mostra no
// máximo UMA ação; as secundárias moram aqui. A ação destrutiva pede
// confirmação num AlertDialog — nunca `confirm()` do navegador. Nasceu no menu
// de cada comissão (features/comissoes/comissoes-page.tsx).

import { useState, type ReactNode } from "react";
import { DotsThree, DotsThreeVertical, type Icon as IconComponent } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AcaoDaLinha = {
  rotulo: string;
  icone?: IconComponent;
  onSelect: () => void;
  /** Some do menu (ex.: "Reverter" só para a comissão paga). */
  oculta?: boolean;
  desabilitada?: boolean;
  /** Ação destrutiva: vai para o fim do menu e pede confirmação. */
  destrutiva?: { titulo: string; descricao?: ReactNode; confirmar?: string };
};

export function AcoesLinha({
  acoes,
  rotulo = "Mais ações",
  horizontal = false,
}: {
  acoes: AcaoDaLinha[];
  /** Nome acessível do botão (e tooltip): "Ações da comissão". */
  rotulo?: string;
  /** "…" deitado; o padrão é o vertical das tabelas. */
  horizontal?: boolean;
}) {
  const [confirmando, setConfirmando] = useState<AcaoDaLinha | null>(null);
  const visiveis = acoes.filter((a) => !a.oculta);
  if (visiveis.length === 0) return null;
  const comuns = visiveis.filter((a) => !a.destrutiva);
  const destrutivas = visiveis.filter((a) => a.destrutiva);
  const Pontos = horizontal ? DotsThree : DotsThreeVertical;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" title={rotulo} aria-label={rotulo}>
            <Pontos className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {comuns.map((a) => (
            <DropdownMenuItem key={a.rotulo} disabled={a.desabilitada} onClick={a.onSelect}>
              {a.icone && <a.icone className="mr-2 h-4 w-4" />}
              {a.rotulo}
            </DropdownMenuItem>
          ))}
          {comuns.length > 0 && destrutivas.length > 0 && <DropdownMenuSeparator />}
          {destrutivas.map((a) => (
            <DropdownMenuItem
              key={a.rotulo}
              disabled={a.desabilitada}
              className="text-destructive focus:text-destructive"
              // Abre a confirmação depois que o menu fecha: o foco volta ao
              // botão "…" e o diálogo não briga com o menu pelo foco.
              onSelect={() => setConfirmando(a)}
            >
              {a.icone && <a.icone className="mr-2 h-4 w-4" />}
              {a.rotulo}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!confirmando} onOpenChange={(o) => !o && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmando?.destrutiva?.titulo}</AlertDialogTitle>
            {confirmando?.destrutiva?.descricao && (
              <AlertDialogDescription>{confirmando.destrutiva.descricao}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                confirmando?.onSelect();
                setConfirmando(null);
              }}
            >
              {confirmando?.destrutiva?.confirmar ?? confirmando?.rotulo}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
