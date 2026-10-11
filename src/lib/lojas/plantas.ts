// Plantas dos stands — o que o cliente vai ver no decorado, com a metragem.
//
// Vieram embutidas no mapa standalone (19 imagens em base64, 1,5 MB num HTML
// só). Aqui cada uma virou arquivo em public/lojas/plantas/: o navegador baixa
// só a planta que o corretor abre, e o mesmo arquivo serve ao CRM e ao
// standalone público (public/mapa-lojas.html aponta para cá).
//
// O vínculo com o stand é por "Construtora|Nome do stand", a mesma chave do
// standalone — ela sobrevive à troca da base pela planilha, desde que a
// planilha mantenha o nome do stand. Uma planta pode servir a vários stands
// (os decorados da Econ são os mesmos nas quatro lojas).
//
// Para incluir uma planta: salve o JPG em public/lojas/plantas/<id>.jpg,
// registre em PLANTAS e ligue o id ao stand em PLANTAS_POR_STAND.

export type Planta = {
  /** Também é o nome do arquivo em public/lojas/plantas. */
  id: string;
  /** Tipologia como a construtora descreve ("Decorado Best · 2 dorms"). */
  tipo: string;
  /** Metragem em texto livre ("27,32 m² a 28,22 m²") — é o que se mostra. */
  area: string;
};

export const PASTA_PLANTAS = "/lojas/plantas";

export const PLANTAS: Readonly<Record<string, Planta>> = {
  rb_b: { id: "rb_b", tipo: "Planta Tipo B · 1 dorm + office", area: "27,32 m² a 28,22 m²" },
  tuc_g: { id: "tuc_g", tipo: "Planta Tipo G · studio", area: "24,30 m² a 24,79 m²" },
  rubi_meio: { id: "rubi_meio", tipo: "Planta Tipo Meio · 2 dorms", area: "40 m²" },
  rubi_ponta: { id: "rubi_ponta", tipo: "Planta Tipo Ponta · 2 dorms", area: "42 m²" },
  hm_40: { id: "hm_40", tipo: "Smart Freguesia · 2 dorms", area: "40,64 m²" },
  hm_36: { id: "hm_36", tipo: "Smart Marquês · 2 dorms", area: "36 m²" },
  e_best: { id: "e_best", tipo: "Decorado Best · 2 dorms (tipo meio, Torre A)", area: "38,81 m²" },
  e_class: {
    id: "e_class",
    tipo: "Decorado Class · 2 dorms com terraço (ponta)",
    area: "37,04 m²",
  },
  e_hype: {
    id: "e_hype",
    tipo: "Decorado Hype Style · 2 dorms (ponta, living ampliado)",
    area: "58,45 m² (finais 1 e 7) · 58,49 m² (finais 2 e 8)",
  },
  e_gran: {
    id: "e_gran",
    tipo: "Decorado Gran Sky · 2 dorms (tipo meio)",
    area: "34,97 m² (Torre 01) · 35,08 m² (Torres 02 e 03)",
  },
  e_verdi: {
    id: "e_verdi",
    tipo: "Decorado Verdi · 2 dorms (ponta, versão ampliada)",
    area: "41,85 m²",
  },
  e_vibe: { id: "e_vibe", tipo: "Decorado Vibe · 1 dorm (opção ampliada)", area: "60 m²" },
  e_liv4: {
    id: "e_liv4",
    tipo: "Decorado Liv · 1 dorm com terraço, sala ampliada (final 04, Torres B e C)",
    area: "37,17 m²",
  },
  e_liv3: {
    id: "e_liv3",
    tipo: "Decorado Liv · 1 dorm com terraço, sala ampliada (final 03, Torre A)",
    area: "37,17 m²",
  },
  vb37: { id: "vb37", tipo: "2 quartos com varanda", area: "37 m² (36,67 a 37,38 m²)" },
  vb42: { id: "vb42", tipo: "2 quartos com varanda", area: "42 m² (42,10 m²)" },
  vb45: { id: "vb45", tipo: "2 quartos com varanda", area: "45 m² (45,20 m²)" },
  hm_356: { id: "hm_356", tipo: "Planta 2 dorms", area: "35,60 m²" },
  hm_3618: { id: "hm_3618", tipo: "Planta 2 dorms", area: "36,18 m²" },
};

/** "Construtora|Nome do stand" → ids das plantas, na ordem do standalone. */
export const PLANTAS_POR_STAND: Readonly<Record<string, readonly string[]>> = {
  "Longitude Incorporadora|Centro": ["rb_b", "tuc_g"],
  "A confirmar|Rubi Condomínio Clube": ["rubi_meio", "rubi_ponta"],
  "HM Engenharia|HM Smart Freguesia e Marquês": ["hm_40", "hm_36"],
  "Econ|Vila Moraes": [
    "e_best",
    "e_class",
    "e_hype",
    "e_gran",
    "e_verdi",
    "e_vibe",
    "e_liv4",
    "e_liv3",
  ],
  "Econ|Jurubatuba": [
    "e_best",
    "e_class",
    "e_hype",
    "e_gran",
    "e_verdi",
    "e_vibe",
    "e_liv4",
    "e_liv3",
  ],
  "Econ|Vila Emir": [
    "e_best",
    "e_class",
    "e_hype",
    "e_gran",
    "e_verdi",
    "e_vibe",
    "e_liv4",
    "e_liv3",
  ],
  "Econ|Interlagos": [
    "e_best",
    "e_class",
    "e_hype",
    "e_gran",
    "e_verdi",
    "e_vibe",
    "e_liv4",
    "e_liv3",
  ],
  "Vibra|Alcântara Machado": ["vb37", "vb42"],
  "Vibra|Nossa Senhora do Sabará": ["vb37"],
  "Vibra|Laudo Ferreira de Camargo": ["vb37", "vb42"],
  "Vibra|Vila Romana": ["vb45"],
  "HM Engenharia|HM Smart Vila das Belezas": ["hm_356"],
  "HM Engenharia|HM Smart Zike Tuma (Interlagos)": ["hm_3618"],
};

export function urlPlanta(planta: Pick<Planta, "id">): string {
  return `${PASTA_PLANTAS}/${planta.id}.jpg`;
}
