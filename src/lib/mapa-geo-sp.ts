// Camadas de referência dos mapas do CRM: as zonas de São Paulo e as linhas de
// metrô/CPTM. Servem ao Mapa de Mercado (Vitrine) e ao Mapa de Lojas.
//
// São ~50 KB de coordenadas: ficam em public/ e são buscadas UMA vez por
// sessão, na primeira vez que alguma camada é ligada em qualquer um dos mapas.

export type GeoLinha = { nome: string; cor: string; coords: [number, number][] };
export type GeoSP = { zonas: GeoLinha[]; metro: GeoLinha[] };

let geoPromise: Promise<GeoSP> | null = null;

export function carregarGeoSP(): Promise<GeoSP> {
  geoPromise ??= fetch("/mercado-geo.json")
    .then((r) => {
      if (!r.ok) throw new Error(`geo_status_${r.status}`);
      return r.json() as Promise<GeoSP>;
    })
    .catch((erro) => {
      geoPromise = null; // deixa tentar de novo no próximo toggle
      throw erro;
    });
  return geoPromise;
}
