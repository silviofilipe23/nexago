// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

export type SportSupport = "profile" | "competition";

export interface SportCatalogEntry {
  readonly code: string;
  readonly profileCode: string;
  readonly appId: string;
  readonly label: string;
  readonly art: string | null;
  readonly support: SportSupport;
}

export const SPORT_CATALOG: readonly SportCatalogEntry[] = [
  {code: "beachVolleyball", profileCode: "VOLEI_PRAIA", appId: "beach_volleyball", label: "Vôlei de praia", art: "volei_praia", support: "competition"},
  {code: "indoorVolleyball", profileCode: "VOLEI_QUADRA", appId: "indoor_volleyball", label: "Vôlei de quadra", art: "volei_quadra", support: "competition"},
  {code: "footvolley", profileCode: "FUTEVOLEI", appId: "footvolley", label: "Futevôlei", art: "futevolei", support: "competition"},
  {code: "football", profileCode: "FUTEBOL", appId: "football", label: "Futebol", art: "futebol", support: "profile"},
  {code: "basketball", profileCode: "BASQUETE", appId: "basketball", label: "Basquete", art: "basquete", support: "profile"},
  {code: "tennis", profileCode: "TENIS", appId: "tennis", label: "Tênis", art: "tenis", support: "profile"},
  {code: "beachTennis", profileCode: "BEACH_TENNIS", appId: "beach_tennis", label: "Beach tennis", art: "beach_tennis", support: "profile"},
  {code: "running", profileCode: "CORRIDA", appId: "running", label: "Corrida", art: "corrida", support: "profile"},
  {code: "other", profileCode: "OUTROS", appId: "other", label: "Outros", art: null, support: "profile"},
];

/** Chave normalizada (`normalizeSportKey`) → `code`. */
export const SPORT_INDEX: Readonly<Record<string, string>> = {
  "beachvolleyball": "beachVolleyball",
  "voleipraia": "beachVolleyball",
  "voleidepraia": "beachVolleyball",
  "indoorvolleyball": "indoorVolleyball",
  "voleiquadra": "indoorVolleyball",
  "voleidequadra": "indoorVolleyball",
  "voleiindoor": "indoorVolleyball",
  "footvolley": "footvolley",
  "futevolei": "footvolley",
  "football": "football",
  "futebol": "football",
  "basketball": "basketball",
  "basquete": "basketball",
  "tennis": "tennis",
  "tenis": "tennis",
  "beachtennis": "beachTennis",
  "beachtenis": "beachTennis",
  "running": "running",
  "corrida": "running",
  "other": "other",
  "outros": "other",
};

export const SPORT_UNKNOWN_LABEL = "Esporte não informado";
