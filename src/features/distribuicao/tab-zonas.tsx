// Aba "Roletas por Zona" — as 4 roletas geográficas (Norte · Sul · Leste ·
// Oeste), modelo de 2026-08-16: a roleta É a zona. O gestor monta o time de
// cada zona aqui (participação manual) e o motor roteia zona-primeiro
// (roleta_da_zona): lead com zona resolvida cai na roleta da zona; lead sem
// zona (ou zona sem roleta pronta) segue o fluxo por origem de sempre.
//
// Reusa a tabela padrão de participantes (RoletaTab) com um seletor de zona
// em cima — mesma mecânica de incluir/pausar/limite/remover das outras abas.

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ZONA_ROLETAS, type ZonaRoletaSlug } from "@/lib/distribuicao";
import { RoletaTab } from "./roleta-tab";

const ZONA_CHIP: Record<ZonaRoletaSlug, string> = {
  "zona-norte": "Norte",
  "zona-sul": "Sul",
  "zona-leste": "Leste",
  "zona-oeste": "Oeste",
};

export function TabZonas({ somenteLeitura }: { somenteLeitura: boolean }) {
  const [zona, setZona] = useState<ZonaRoletaSlug>("zona-norte");

  return (
    <div className="space-y-4">
      <Tabs value={zona} onValueChange={(v) => setZona(v as ZonaRoletaSlug)}>
        <TabsList>
          {ZONA_ROLETAS.map((slug) => (
            <TabsTrigger key={slug} value={slug}>
              {ZONA_CHIP[slug]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        A participação na roleta é o próprio corte geográfico: quem está aqui recebe os leads desta
        zona. Zona sem corretor ativo não trava lead — ele volta para o fluxo por origem (Marquinhos
        / Landing / Plantão).
      </p>
      <RoletaTab slug={zona} somenteLeitura={somenteLeitura} />
    </div>
  );
}
