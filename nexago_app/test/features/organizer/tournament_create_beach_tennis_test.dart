import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/organizer/data/tournament_create_mapper.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';

const _bt = {
  'kind': 'sets_games',
  'bestOf': 3,
  'gamesPerSet': 6,
  'winByGames': 2,
  'tiebreakAtGames': 6,
  'tiebreakTo': 7,
  'noAd': true,
  'decidingSet': 'super_tiebreak',
  'superTiebreakTo': 10,
};

TournamentCreateDraft _draft({
  TournamentSport sport = TournamentSport.beachVolleyball,
  List<TournamentCategoryDraft> categories = const [
    TournamentCategoryDraft(id: 'c1', name: 'Open', spots: 16, priceCents: 100),
  ],
}) => TournamentCreateDraft(
  sport: sport,
  name: 'Copa',
  city: 'Goiânia',
  state: 'GO',
  locationName: 'Arena',
  startAt: DateTime(2026, 3, 28),
  endAt: DateTime(2026, 3, 30),
  registrationOpensAt: DateTime(2026, 3, 1),
  registrationClosesAt: DateTime(2026, 3, 26),
  categories: categories,
);

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  test('beach tennis é esporte conhecido, sem raw', () {
    final parsed = parseTournamentSport('beachTennis');
    expect(parsed.sport, TournamentSport.beachTennis);
    expect(parsed.raw, isNull);
    expect(sportLabel(TournamentSport.beachTennis), 'Beach tennis');
  });

  test('scoringProfile da categoria faz ida e volta pelo mapper', () {
    final load = TournamentCreateMapper.fromFirestore({
      'name': 'Copa BT',
      'sport': 'beachTennis',
      'categories': [
        {
          'id': 'c1',
          'categoryName': 'Open',
          'bracketFormat': 'single_elimination',
          'maxTeams': 16,
          'scoringProfile': _bt,
        },
      ],
    }, 't1');
    final category = load.draft.categories.single;
    expect(category.scoringProfileRaw, _bt);
    final map = TournamentCreateMapper.toFirestore(
      draft: _draft(sport: TournamentSport.beachTennis, categories: [category]),
      managerId: 'm1',
      publish: false,
    );
    final cats = map['categories'] as List<dynamic>;
    expect((cats.single as Map<String, dynamic>)['scoringProfile'], _bt);
  });

  test('categoria sem perfil continua sem perfil', () {
    final map = TournamentCreateMapper.toFirestore(
      draft: _draft(),
      managerId: 'm1',
      publish: false,
    );
    final cats = map['categories'] as List<dynamic>;
    expect(
      (cats.single as Map<String, dynamic>).containsKey('scoringProfile'),
      isFalse,
    );
  });

  test('KOTC só aparece e só publica em vôlei de praia', () {
    expect(
      bracketSystemsForSport(TournamentSport.beachVolleyball),
      contains(TournamentBracketSystem.kingOfCourt),
    );
    expect(
      bracketSystemsForSport(TournamentSport.beachTennis),
      isNot(contains(TournamentBracketSystem.kingOfCourt)),
    );
    const koc = TournamentCategoryDraft(
      id: 'c1',
      name: 'Rei',
      bracketSystem: TournamentBracketSystem.kingOfCourt,
    );
    expect(
      publishBlockReasonForUnsupportedBrackets(
        _draft(sport: TournamentSport.beachTennis, categories: [koc]),
      ),
      'A categoria "Rei" usa King of the Court, que por enquanto é só para '
      'vôlei de praia.',
    );
    expect(
      publishBlockReasonForUnsupportedBrackets(_draft(categories: [koc])),
      '',
    );
  });
}
