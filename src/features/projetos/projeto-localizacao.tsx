// Localização na ficha do empreendimento: endereço legível, mapa com um pino
// (Leaflet/OpenStreetMap, como a Vitrine) e os três gestos que o corretor faz
// na frente do cliente — abrir no Google Maps, traçar rota e copiar o
// endereço para o WhatsApp.
//
// Leaflet entra por `import()` dentro do efeito: a biblioteca toca `window`
// no topo do módulo e um import estático quebraria o SSR (mesma decisão do
// mercado-map). Sem coordenada, a seção fica só com endereço e links; sem
// nenhum dado, não renderiza nada — "Endereço: —" não ajuda ninguém.

import { useEffect, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { Copy, MapPinLine, NavigationArrow, ArrowSquareOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import {
  enderecoLegivel,
  temCoordenada,
  textoLocalizacao,
  urlComoChegar,
  urlGoogleMaps,
  type LocalizacaoProjeto,
} from "@/lib/projeto-localizacao";

/** Dourado da marca no pino — o mesmo do "fecha" no mapa de mercado. */
const COR_PINO = "#E0A646";
const ZOOM_PINO = 15;

function MapaDoProjeto({ lat, lng, nome }: { lat: number; lng: number; nome: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<LeafletNS.Map | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const L = await import("leaflet");
        if (cancelado || !containerRef.current || mapaRef.current) return;
        const mapa = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false, // a página rola por cima do mapa sem "prender" a roda
        }).setView([lat, lng], ZOOM_PINO);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapa);
        mapa.attributionControl.setPrefix(false);
        L.circleMarker([lat, lng], {
          radius: 9,
          color: "#1b2a4a",
          weight: 2,
          fillColor: COR_PINO,
          fillOpacity: 0.95,
        })
          .addTo(mapa)
          .bindTooltip(nome, { direction: "top", offset: [0, -10] });
        mapaRef.current = mapa;
      } catch {
        if (!cancelado) setErro(true);
      }
    })();
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, [lat, lng, nome]);

  if (erro) return null;
  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Mapa com a localização de ${nome}`}
      className="h-56 w-full overflow-hidden rounded-lg border border-border-subtle bg-muted md:h-64"
    />
  );
}

export function ProjetoLocalizacao({
  projeto,
  className,
}: {
  projeto: LocalizacaoProjeto;
  className?: string;
}) {
  const endereco = enderecoLegivel(projeto);
  const mapa = urlGoogleMaps(projeto);
  const rota = urlComoChegar(projeto);
  const comCoordenada = temCoordenada(projeto);
  if (!endereco && !comCoordenada) return null;

  // zona_smq é texto livre ("Sul", "Grande SP"): o mesmo chip do hero.
  const contexto = [projeto.zona_smq ? `Zona ${projeto.zona_smq}` : null, projeto.regiao]
    .filter(Boolean)
    .join(" · ");

  const copiarEndereco = async () => {
    const texto = textoLocalizacao(projeto);
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Localização copiada — cole no WhatsApp do cliente.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <section aria-label="Localização do empreendimento" className={className}>
      <SectionHeader eyebrow="Onde fica" title="Localização" />
      <div className="space-y-3 rounded-xl border border-border-subtle bg-card p-4 shadow-elev-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <MapPinLine
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <div className="text-sm font-medium">{endereco ?? "Endereço não cadastrado"}</div>
                {contexto && <div className="text-xs text-muted-foreground">{contexto}</div>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {mapa && (
              <Button size="sm" variant="outline" asChild>
                <a href={mapa} target="_blank" rel="noopener noreferrer">
                  <ArrowSquareOut className="mr-1 h-4 w-4" /> Google Maps
                </a>
              </Button>
            )}
            {rota && (
              <Button size="sm" variant="outline" asChild>
                <a href={rota} target="_blank" rel="noopener noreferrer">
                  <NavigationArrow className="mr-1 h-4 w-4" /> Como chegar
                </a>
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void copiarEndereco()}>
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
          </div>
        </div>
        {comCoordenada && <MapaDoProjeto lat={projeto.lat} lng={projeto.lng} nome={projeto.nome} />}
      </div>
    </section>
  );
}
