// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

const List<(String, String)> kSportNormalizeVectors = [
  ('Vôlei de praia', 'voleidepraia'),
  ('beach_tennis', 'beachtennis'),
  ('  BEACH-TENNIS ', 'beachtennis'),
  ('Futevôlei', 'futevolei'),
  ('AÇÃO ñ', 'acaon'),
  ('', ''),
];

const List<(String, String?)> kSportResolveVectors = [
  ('beachVolleyball', 'beachVolleyball'),
  ('VOLEI_PRAIA', 'beachVolleyball'),
  ('beach_volleyball', 'beachVolleyball'),
  ('Vôlei de praia', 'beachVolleyball'),
  ('beach_tennis', 'beachTennis'),
  ('Beach tênis', 'beachTennis'),
  ('Vôlei indoor', 'indoorVolleyball'),
  ('futevolei', 'footvolley'),
  ('TENIS', 'tennis'),
  ('padel', null),
  ('', null),
];

const List<(String, String)> kSportTitleCaseVectors = [
  ('padel', 'Padel'),
  ('curling', 'Curling'),
  ('FUTEVOLEI_MISTO', 'Futevolei Misto'),
  ('beachTennisPro', 'Beach Tennis Pro'),
  ('  ', ''),
];
