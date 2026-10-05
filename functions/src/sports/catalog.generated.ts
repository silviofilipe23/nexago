// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

import type {ScoringProfile} from "./scoring-profile";

export type SportSupport = "profile" | "competition";

export interface SportCatalogEntry {
  readonly code: string;
  readonly profileCode: string;
  readonly appId: string;
  readonly label: string;
  readonly art: string | null;
  readonly support: SportSupport;
  readonly scoringProfile: ScoringProfile | null;
}

export const SPORT_CATALOG: readonly SportCatalogEntry[] = [
  {code: "beachVolleyball", profileCode: "VOLEI_PRAIA", appId: "beach_volleyball", label: "Vôlei de praia", art: "volei_praia", support: "competition", scoringProfile: {"kind":"sets_points","bestOf":3,"setTarget":21,"decidingSetTarget":15,"winBy":2,"pointCap":null}},
  {code: "indoorVolleyball", profileCode: "VOLEI_QUADRA", appId: "indoor_volleyball", label: "Vôlei de quadra", art: "volei_quadra", support: "competition", scoringProfile: {"kind":"sets_points","bestOf":3,"setTarget":25,"decidingSetTarget":15,"winBy":2,"pointCap":null}},
  {code: "footvolley", profileCode: "FUTEVOLEI", appId: "footvolley", label: "Futevôlei", art: "futevolei", support: "competition", scoringProfile: {"kind":"sets_points","bestOf":3,"setTarget":18,"decidingSetTarget":15,"winBy":2,"pointCap":null}},
  {code: "football", profileCode: "FUTEBOL", appId: "football", label: "Futebol", art: "futebol", support: "profile", scoringProfile: null},
  {code: "basketball", profileCode: "BASQUETE", appId: "basketball", label: "Basquete", art: "basquete", support: "profile", scoringProfile: null},
  {code: "tennis", profileCode: "TENIS", appId: "tennis", label: "Tênis", art: "tenis", support: "competition", scoringProfile: {"kind":"sets_games","bestOf":3,"gamesPerSet":6,"winByGames":2,"tiebreakAtGames":6,"tiebreakTo":7,"noAd":false,"decidingSet":"full","superTiebreakTo":10}},
  {code: "beachTennis", profileCode: "BEACH_TENNIS", appId: "beach_tennis", label: "Beach tennis", art: "beach_tennis", support: "competition", scoringProfile: {"kind":"sets_games","bestOf":3,"gamesPerSet":6,"winByGames":2,"tiebreakAtGames":6,"tiebreakTo":7,"noAd":true,"decidingSet":"super_tiebreak","superTiebreakTo":10}},
  {code: "running", profileCode: "CORRIDA", appId: "running", label: "Corrida", art: "corrida", support: "profile", scoringProfile: null},
  {code: "padel", profileCode: "PADEL", appId: "padel", label: "Padel", art: null, support: "profile", scoringProfile: {"kind":"sets_games","bestOf":3,"gamesPerSet":6,"winByGames":2,"tiebreakAtGames":6,"tiebreakTo":7,"noAd":true,"decidingSet":"full","superTiebreakTo":10}},
  {code: "other", profileCode: "OUTROS", appId: "other", label: "Outros", art: null, support: "profile", scoringProfile: null},
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
  "padel": "padel",
  "other": "other",
  "outros": "other",
};

export const SPORT_UNKNOWN_LABEL = "Esporte não informado";
