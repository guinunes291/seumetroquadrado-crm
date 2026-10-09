// Coordenadas da filial a partir do endereço — só a tela de Filiais (gestão)
// usa, por isso mora fora de presenca-derive (que a faixa do topo carrega em
// todo o CRM) e pode reaproveitar o normalizador do Mapa de Lojas.

import { normalizarEndereco } from "@/lib/lojas/lojas";

/**
 * Busca do endereço da filial no Nominatim (OpenStreetMap), feita NO
 * NAVEGADOR da gestão — o mesmo serviço do Mapa de Lojas. "Av." vira
 * "Avenida" e o bairro/CEP saem (o Nominatim acha melhor só rua, número e
 * cidade).
 */
export function urlGeocodificacaoFilial(endereco: string): string {
  const q = `${normalizarEndereco(endereco)}, São Paulo`;
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
}

/** Cidade de São Paulo com folga: fora disso é homônimo de outra cidade. */
const LIMITES_SAO_PAULO = { latMin: -24.1, latMax: -23.3, lngMin: -46.9, lngMax: -46.3 };

export type PontoGeocodificado = { lat: number; lng: number; exato: boolean };

/**
 * Lê a resposta do Nominatim. `exato` = achou o NÚMERO (prédio/casa); falso
 * quando só achou a avenida — o ponto pode estar a centenas de metros da
 * loja, e a tela pede para conferir no mapa antes de salvar.
 */
export function lerGeocodificacao(json: unknown): PontoGeocodificado | null {
  const r = Array.isArray(json) ? (json[0] as Record<string, unknown> | undefined) : undefined;
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const b = LIMITES_SAO_PAULO;
  if (lat < b.latMin || lat > b.latMax || lng < b.lngMin || lng > b.lngMax) return null;
  const soARua = r.addresstype === "road" || r.category === "highway";
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), exato: !soARua };
}

/** Link para conferir o ponto no Google Maps. */
export function linkMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
