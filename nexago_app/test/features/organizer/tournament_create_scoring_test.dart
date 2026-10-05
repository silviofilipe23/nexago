import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/features/organizer/data/tournament_create_mapper.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';

TournamentCreateDraft _draft(List<TournamentCategoryDraft> categories) =>
    TournamentCreateDraft(
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

  test('sugestão por esporte: 21/15, 25/15, 18/15 e games', () {
    final bv = suggestedScoringProfile(
      TournamentSport.beachVolleyball,
      TournamentBestOf.bestOf3,
    );
    expect(
      [bv['kind'], bv['setTarget'], bv['decidingSetTarget'], bv['bestOf']],
      ['sets_points', 21, 15, 3],
    );
    expect(
      suggestedScoringProfile(
        TournamentSport.indoorVolleyball,
        TournamentBestOf.bestOf3,
      )['setTarget'],
      25,
    );
    final fv = suggestedScoringProfile(
      TournamentSport.footvolley,
      TournamentBestOf.singleSet,
    );
    expect([fv['setTarget'], fv['bestOf']], [18, 1]);
    final bt = suggestedScoringProfile(
      TournamentSport.beachTennis,
      TournamentBestOf.bestOf3,
    );
    expect(
      [bt['kind'], bt['decidingSet'], bt['noAd']],
      ['sets_games', 'super_tiebreak', true],
    );
    // O mapa sugerido é um perfil válido para o núcleo.
    expect(ScoringRules.profileFromRaw(bt), isA<SetsGamesProfile>());
  });

  test(
    'categoria sem perfil: a visão é a regra histórica; editar parte dela',
    () {
      const legacy = TournamentCategoryDraft(
        id: 'c1',
        bestOf: TournamentBestOf.bestOf3,
      );
      final view = categoryScoringView(
        legacy,
        TournamentSport.indoorVolleyball,
      );
      expect(view, isA<SetsPointsProfile>());
      expect((view as SetsPointsProfile).setTarget, 21);
      final edited = patchCategoryScoring(
        legacy,
        TournamentSport.indoorVolleyball,
        decidingSetTarget: 11,
      );
      expect(
        [
          edited.scoringProfileRaw!['setTarget'],
          edited.scoringProfileRaw!['decidingSetTarget'],
        ],
        [21, 11],
      );
      final bt = patchCategoryScoring(
        const TournamentCategoryDraft(
          id: 'c2',
          bestOf: TournamentBestOf.bestOf3,
        ),
        TournamentSport.beachTennis,
        noAd: false,
        decidingSet: DecidingSet.full,
      );
      expect(
        [bt.scoringProfileRaw!['noAd'], bt.scoringProfileRaw!['decidingSet']],
        [false, 'full'],
      );
    },
  );

  test(
    'troca de esporte: só refaz perfil de outro tipo; sem perfil segue sem',
    () {
      final edited = patchCategoryScoring(
        const TournamentCategoryDraft(
          id: 'c1',
          bestOf: TournamentBestOf.bestOf3,
        ),
        TournamentSport.beachVolleyball,
        decidingSetTarget: 11,
      );
      const without = TournamentCategoryDraft(id: 'c2');
      final indoor = withSportScoring([
        edited,
        without,
      ], TournamentSport.indoorVolleyball);
      expect(indoor[0].scoringProfileRaw!['decidingSetTarget'], 11);
      expect(indoor[1].scoringProfileRaw, isNull);
      final bt = withSportScoring([edited], TournamentSport.beachTennis);
      expect(bt[0].scoringProfileRaw!['kind'], 'sets_games');
    },
  );

  test(
    'trocar beach tennis → tênis: sugestão intacta vira a do tênis; editada fica (3c1)',
    () {
      final untouched = TournamentCategoryDraft(
        id: 'c1',
        bestOf: TournamentBestOf.bestOf3,
        scoringProfileRaw: suggestedScoringProfile(
          TournamentSport.beachTennis,
          TournamentBestOf.bestOf3,
        ),
      );
      final edited = patchCategoryScoring(
        untouched,
        TournamentSport.beachTennis,
        decidingSet: DecidingSet.full,
      );
      final out = withSportScoring(
        [untouched, edited],
        TournamentSport.tennis,
        previousSport: TournamentSport.beachTennis,
      );
      expect(out[0].scoringProfileRaw!['noAd'], false);
      expect(out[0].scoringProfileRaw!['decidingSet'], 'full');
      // Editada pelo organizador: no-ad do beach tennis + 3º set completo fica.
      expect(out[1].scoringProfileRaw!['noAd'], true);
      expect(out[1].scoringProfileRaw!['decidingSet'], 'full');
    },
  );

  test('o bestOf gravado no perfil acompanha o da categoria', () {
    final c = TournamentCategoryDraft(
      id: 'c1',
      name: 'Open',
      spots: 16,
      priceCents: 100,
      bestOf: TournamentBestOf.singleSet,
      scoringProfileRaw: suggestedScoringProfile(
        TournamentSport.beachTennis,
        TournamentBestOf.bestOf3,
      ),
    );
    final map = TournamentCreateMapper.toFirestore(
      draft: _draft([c]),
      managerId: 'm1',
      publish: false,
    );
    final cat = (map['categories'] as List).single as Map<String, dynamic>;
    expect((cat['scoringProfile'] as Map)['bestOf'], 1);
  });

  test('esporte desconhecido (sportRaw): sem esporte de placar', () {
    expect(
      scoringSportOf(TournamentSport.beachVolleyball, null),
      TournamentSport.beachVolleyball,
    );
    expect(scoringSportOf(TournamentSport.beachVolleyball, 'tennis'), isNull);
  });
}

