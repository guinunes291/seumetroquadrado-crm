// Card "Sua próxima aula" no /inicio. É a ÚNICA mudança de tela fora de
// /academia nesta fatia, e por isso mora atrás da flag academia_card_inicio
// E da participação ativa: flag desligada ou pessoa fora da trilha, o card
// não renderiza nada e o /inicio fica idêntico ao de hoje.

import { Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppFlag } from "@/hooks/use-app-flags";
import { useEhParticipante, useModulo, useTrilha } from "./academia-client";
import { continueDeOndeParou, primeiraAulaPendente } from "./estado-modulo";

export function CardProximaAula() {
  const flag = useAppFlag("academia_card_inicio");
  const { participa } = useEhParticipante();
  const habilitado = flag.ligada && participa;

  const trilha = useTrilha();
  const alvo = habilitado && trilha.data ? continueDeOndeParou(trilha.data.modulos) : null;
  const modulo = useModulo(alvo?.codigo ?? "");

  if (!habilitado || !alvo) return null;

  const aula = modulo.data
    ? primeiraAulaPendente(modulo.data.aulas, modulo.data.aulasFeitas)
    : null;

  return (
    <Card className="mb-4 border-primary/40">
      <CardContent className="flex items-center gap-3 py-4">
        <GraduationCap className="h-6 w-6 shrink-0 text-primary" weight="duotone" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Sua próxima aula</p>
          <p className="truncate text-sm font-medium">{aula ? aula.titulo : alvo.titulo}</p>
          <p className="truncate text-xs text-muted-foreground">{alvo.titulo}</p>
        </div>
        <Button asChild size="sm">
          {aula ? (
            <Link
              to="/academia/modulo/$codigo/aula/$ordem"
              params={{ codigo: alvo.codigo, ordem: String(aula.ordem) }}
              aria-label="Abrir a próxima aula"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              to="/academia/modulo/$codigo"
              params={{ codigo: alvo.codigo }}
              aria-label="Abrir o módulo"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
