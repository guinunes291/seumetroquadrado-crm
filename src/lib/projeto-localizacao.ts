// Localização do empreendimento na página de produto — endereço legível e
// links de mapa. Puro: a tela só renderiza o que sai daqui.
//
// O projeto guarda o endereço de três jeitos, herança das importações:
// logradouro + numero (planilha nova), endereco (texto livre antigo) e
// lat/lng (geocodificação). O texto para o cliente prefere o par
// estruturado; o link do Google Maps prefere a coordenada, que não depende
// de o endereço estar bem escrito.

export type LocalizacaoProjeto = {
  nome: string;
  endereco: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao?: string | null;
  zona_smq?: string | null;
  lat?: number | null;
  lng?: number | null;
};

function limpo(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

/** "Rua X, 123 · Vila Mariana · São Paulo" (só as partes que existem). */
export function enderecoLegivel(p: LocalizacaoProjeto): string | null {
  const logradouro = limpo(p.logradouro);
  const numero = limpo(p.numero);
  const via = logradouro ? [logradouro, numero].filter(Boolean).join(", ") : limpo(p.endereco);
  const partes = [via, limpo(p.bairro), limpo(p.cidade)].filter((x): x is string => !!x);
  // Evita "São Paulo · São Paulo" quando bairro veio igual à cidade.
  const unicas = partes.filter(
    (x, i) => partes.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i,
  );
  return unicas.length > 0 ? unicas.join(" · ") : null;
}

export function temCoordenada(p: Pick<LocalizacaoProjeto, "lat" | "lng">): p is {
  lat: number;
  lng: number;
} {
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/** O que vai na busca do Google Maps: coordenada quando há; senão endereço + nome. */
function alvoDeBusca(p: LocalizacaoProjeto): string | null {
  if (temCoordenada(p)) return `${p.lat},${p.lng}`;
  const endereco = enderecoLegivel(p);
  if (endereco) return `${p.nome}, ${endereco.replace(/ · /g, ", ")}`;
  return null;
}

export function urlGoogleMaps(p: LocalizacaoProjeto): string | null {
  const alvo = alvoDeBusca(p);
  if (!alvo) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`;
}

export function urlComoChegar(p: LocalizacaoProjeto): string | null {
  const alvo = alvoDeBusca(p);
  if (!alvo) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(alvo)}`;
}

/** Texto para colar no WhatsApp: nome, endereço e o link do mapa. */
export function textoLocalizacao(p: LocalizacaoProjeto): string | null {
  const endereco = enderecoLegivel(p);
  const mapa = urlGoogleMaps(p);
  if (!endereco && !mapa) return null;
  const linhas = [`📍 *${p.nome}*`];
  if (endereco) linhas.push(endereco.replace(/ · /g, ", "));
  if (mapa) linhas.push(mapa);
  return linhas.join("\n");
}
