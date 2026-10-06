// GERADO por sports/codegen.mjs a partir de sports/catalog.json — não editar.

import 'scoring_profile.dart';

enum SportSupport { profile, competition }

class SportCatalogEntry {
  const SportCatalogEntry({
    required this.code,
    required this.profileCode,
    required this.appId,
    required this.label,
    required this.art,
    required this.support,
    required this.allowedTeamSizes,
    required this.arenaCourtTypes,
    required this.scoringProfile,
  });

  final String code;
  final String profileCode;
  final String appId;
  final String label;
  final String? art;
  final SportSupport support;

  /// Tamanhos de equipe que o wizard oferece (1 = individual); `null` em
  /// esporte só de perfil.
  final List<int>? allowedTeamSizes;

  /// Rótulos de quadra legados (`courts.types`, `arenas.courtTypes`); vazio =
  /// esporte sem quadra na aba Reservar.
  final List<String> arenaCourtTypes;
  final ScoringProfile? scoringProfile;
}

const List<SportCatalogEntry> kSportCatalog = [
  SportCatalogEntry(
    code: 'beachVolleyball',
    profileCode: 'VOLEI_PRAIA',
    appId: 'beach_volleyball',
    label: 'Vôlei de praia',
    art: 'volei_praia',
    support: SportSupport.competition,
    allowedTeamSizes: [2, 3, 4, 5],
    arenaCourtTypes: ['Vôlei de praia'],
    scoringProfile: SetsPointsProfile(bestOf: 3, setTarget: 21, decidingSetTarget: 15, winBy: 2, pointCap: null),
  ),
  SportCatalogEntry(
    code: 'indoorVolleyball',
    profileCode: 'VOLEI_QUADRA',
    appId: 'indoor_volleyball',
    label: 'Vôlei de quadra',
    art: 'volei_quadra',
    support: SportSupport.competition,
    allowedTeamSizes: [2, 3, 4, 5],
    arenaCourtTypes: ['Vôlei indoor'],
    scoringProfile: SetsPointsProfile(bestOf: 3, setTarget: 25, decidingSetTarget: 15, winBy: 2, pointCap: null),
  ),
  SportCatalogEntry(
    code: 'footvolley',
    profileCode: 'FUTEVOLEI',
    appId: 'footvolley',
    label: 'Futevôlei',
    art: 'futevolei',
    support: SportSupport.competition,
    allowedTeamSizes: [2, 3, 4, 5],
    arenaCourtTypes: ['Futevôlei'],
    scoringProfile: SetsPointsProfile(bestOf: 3, setTarget: 18, decidingSetTarget: 15, winBy: 2, pointCap: null),
  ),
  SportCatalogEntry(
    code: 'football',
    profileCode: 'FUTEBOL',
    appId: 'football',
    label: 'Futebol',
    art: 'futebol',
    support: SportSupport.profile,
    allowedTeamSizes: null,
    arenaCourtTypes: ['Futebol'],
    scoringProfile: null,
  ),
  SportCatalogEntry(
    code: 'basketball',
    profileCode: 'BASQUETE',
    appId: 'basketball',
    label: 'Basquete',
    art: 'basquete',
    support: SportSupport.profile,
    allowedTeamSizes: null,
    arenaCourtTypes: [],
    scoringProfile: null,
  ),
  SportCatalogEntry(
    code: 'tennis',
    profileCode: 'TENIS',
    appId: 'tennis',
    label: 'Tênis',
    art: 'tenis',
    support: SportSupport.competition,
    allowedTeamSizes: [1, 2],
    arenaCourtTypes: ['Tênis'],
    scoringProfile: SetsGamesProfile(bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: false, decidingSet: DecidingSet.full, superTiebreakTo: 10),
  ),
  SportCatalogEntry(
    code: 'beachTennis',
    profileCode: 'BEACH_TENNIS',
    appId: 'beach_tennis',
    label: 'Beach tennis',
    art: 'beach_tennis',
    support: SportSupport.competition,
    allowedTeamSizes: [2, 3, 4, 5],
    arenaCourtTypes: ['Beach tennis'],
    scoringProfile: SetsGamesProfile(bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: DecidingSet.superTiebreak, superTiebreakTo: 10),
  ),
  SportCatalogEntry(
    code: 'running',
    profileCode: 'CORRIDA',
    appId: 'running',
    label: 'Corrida',
    art: 'corrida',
    support: SportSupport.profile,
    allowedTeamSizes: null,
    arenaCourtTypes: [],
    scoringProfile: null,
  ),
  SportCatalogEntry(
    code: 'padel',
    profileCode: 'PADEL',
    appId: 'padel',
    label: 'Padel',
    art: null,
    support: SportSupport.competition,
    allowedTeamSizes: [2],
    arenaCourtTypes: ['Padel'],
    scoringProfile: SetsGamesProfile(bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: DecidingSet.full, superTiebreakTo: 10),
  ),
  SportCatalogEntry(
    code: 'other',
    profileCode: 'OUTROS',
    appId: 'other',
    label: 'Outros',
    art: null,
    support: SportSupport.profile,
    allowedTeamSizes: null,
    arenaCourtTypes: [],
    scoringProfile: null,
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
  'padel': 'padel',
  'other': 'other',
  'outros': 'other',
};

const String kSportUnknownLabel = 'Esporte não informado';
