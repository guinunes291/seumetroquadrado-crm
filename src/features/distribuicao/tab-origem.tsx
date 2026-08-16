// Aba "Roletas de Origem" — Plantão, Marquinhos e Landing numa aba só, com
// seletor (mesmo padrão da aba de zonas). Com o modelo por zona (2026-08-16)
// essas roletas viraram o FALLBACK de quem não tem zona resolvida; três abas
// de primeira classe davam a elas um peso que não têm mais.
//
// Mesclar/desativar é operação de dados: o mapeamento origem→roleta (inclusive
// o da landing page, via origem "site") é editável em Configurações, e roleta
// de origem desativada ou sem time cai automaticamente no Plantão pronto —
// nenhum lead fica represado por causa de um switch.

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { roletaLabel, type RoletaSlug } from "@/lib/distribuicao";
import { RoletaTab } from "./roleta-tab";

const ORIGEM_ROLETAS = ["plantao", "marquinhos", "landing"] as const;
type OrigemRoletaSlug = (typeof ORIGEM_ROLETAS)[number];

export function TabOrigem({ somenteLeitura }: { somenteLeitura: boolean }) {
  const [slug, setSlug] = useState<OrigemRoletaSlug>("plantao");

  return (
    <div className="space-y-4">
      <Tabs value={slug} onValueChange={(v) => setSlug(v as OrigemRoletaSlug)}>
        <TabsList>
          {ORIGEM_ROLETAS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {roletaLabel(s satisfies RoletaSlug)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Fallback de quem não tem zona: lead sem zona resolvida (ou com zona sem roleta montada) cai
        aqui pelo mapeamento origem → roleta das Configurações. Roleta desativada ou sem time não
        segura lead — a triagem desvia para o Plantão.
      </p>
      <RoletaTab slug={slug} somenteLeitura={somenteLeitura} />
    </div>
  );
}
