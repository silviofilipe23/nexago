// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

export const SPORT_NORMALIZE_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["Vôlei de praia", "voleidepraia"],
  ["beach_tennis", "beachtennis"],
  ["  BEACH-TENNIS ", "beachtennis"],
  ["Futevôlei", "futevolei"],
  ["AÇÃO ñ", "acaon"],
  ["", ""],
];

export const SPORT_RESOLVE_VECTORS: ReadonlyArray<readonly [string, string | null]> = [
  ["beachVolleyball", "beachVolleyball"],
  ["VOLEI_PRAIA", "beachVolleyball"],
  ["beach_volleyball", "beachVolleyball"],
  ["Vôlei de praia", "beachVolleyball"],
  ["beach_tennis", "beachTennis"],
  ["Beach tênis", "beachTennis"],
  ["Vôlei indoor", "indoorVolleyball"],
  ["futevolei", "footvolley"],
  ["TENIS", "tennis"],
  ["padel", null],
  ["", null],
];

export const SPORT_TITLE_CASE_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["padel", "Padel"],
  ["curling", "Curling"],
  ["FUTEVOLEI_MISTO", "Futevolei Misto"],
  ["beachTennisPro", "Beach Tennis Pro"],
  ["  ", ""],
];
