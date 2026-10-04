// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

enum SportSupport { profile, competition }

class SportCatalogEntry {
  const SportCatalogEntry({
    required this.code,
    required this.profileCode,
    required this.appId,
    required this.label,
    required this.art,
    required this.support,
  });

  final String code;
  final String profileCode;
  final String appId;
  final String label;
  final String? art;
  final SportSupport support;
}

const List<SportCatalogEntry> kSportCatalog = [
  SportCatalogEntry(
    code: 'beachVolleyball',
    profileCode: 'VOLEI_PRAIA',
    appId: 'beach_volleyball',
    label: 'Vôlei de praia',
    art: 'volei_praia',
    support: SportSupport.competition,
  ),
  SportCatalogEntry(
    code: 'indoorVolleyball',
    profileCode: 'VOLEI_QUADRA',
    appId: 'indoor_volleyball',
    label: 'Vôlei de quadra',
    art: 'volei_quadra',
    support: SportSupport.competition,
  ),
  SportCatalogEntry(
    code: 'footvolley',
    profileCode: 'FUTEVOLEI',
    appId: 'footvolley',
    label: 'Futevôlei',
    art: 'futevolei',
    support: SportSupport.competition,
  ),
  SportCatalogEntry(
    code: 'football',
    profileCode: 'FUTEBOL',
    appId: 'football',
    label: 'Futebol',
    art: 'futebol',
    support: SportSupport.profile,
  ),
  SportCatalogEntry(
    code: 'basketball',
    profileCode: 'BASQUETE',
    appId: 'basketball',
    label: 'Basquete',
    art: 'basquete',
    support: SportSupport.profile,
  ),
  SportCatalogEntry(
    code: 'tennis',
    profileCode: 'TENIS',
    appId: 'tennis',
    label: 'Tênis',
    art: 'tenis',
    support: SportSupport.profile,
  ),
  SportCatalogEntry(
    code: 'beachTennis',
    profileCode: 'BEACH_TENNIS',
    appId: 'beach_tennis',
    label: 'Beach tennis',
    art: 'beach_tennis',
    support: SportSupport.profile,
  ),
  SportCatalogEntry(
    code: 'running',
    profileCode: 'CORRIDA',
    appId: 'running',
    label: 'Corrida',
    art: 'corrida',
    support: SportSupport.profile,
  ),
  SportCatalogEntry(
    code: 'other',
    profileCode: 'OUTROS',
    appId: 'other',
    label: 'Outros',
    art: null,
    support: SportSupport.profile,
  ),
];

/// Chave normalizada (`SportCatalog.normalizeKey`) → `code`.
const Map<String, String> kSportIndex = {
  'beachvolleyball': 'beachVolleyball',
  'voleipraia': 'beachVolleyball',
  'voleidepraia': 'beachVolleyball',
  'indoorvolleyball': 'indoorVolleyball',
  'voleiquadra': 'indoorVolleyball',
  'voleidequadra': 'indoorVolleyball',
  'voleiindoor': 'indoorVolleyball',
  'footvolley': 'footvolley',
  'futevolei': 'footvolley',
  'football': 'football',
  'futebol': 'football',
  'basketball': 'basketball',
  'basquete': 'basketball',
  'tennis': 'tennis',
  'tenis': 'tennis',
  'beachtennis': 'beachTennis',
  'beachtenis': 'beachTennis',
  'running': 'running',
  'corrida': 'running',
  'other': 'other',
  'outros': 'other',
};

const String kSportUnknownLabel = 'Esporte não informado';
