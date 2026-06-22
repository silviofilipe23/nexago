import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/category_level_eligibility.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer _offer(String level) => TournamentCategoryOffer(
      id: 'c-$level',
      name: level.isEmpty ? 'Livre' : level,
      entryFee: 0,
      level: level,
    );

AthleteProfile _athlete(
  String level, {
  Map<String, String> levelsBySportFirestore = const {},
}) =>
    AthleteProfile(
      id: 'a',
      name: 'Atleta',
      sport: 'Vôlei de praia',
      level: level,
      city: 'Goiânia',
      levelsBySportFirestore: levelsBySportFirestore,
    );

void main() {
  group('levelRank', () {
    test('labels, códigos e legados', () {
      expect(CategoryLevelEligibility.levelRank('Iniciante'), 0);
      expect(CategoryLevelEligibility.levelRank('iniciante'), 0);
      expect(CategoryLevelEligibility.levelRank('Intermediário'), 1);
      expect(CategoryLevelEligibility.levelRank('intermediario'), 1);
      expect(CategoryLevelEligibility.levelRank('Open'), 2);
      expect(CategoryLevelEligibility.levelRank('open'), 2);
      expect(CategoryLevelEligibility.levelRank('Básico'), 0);
      expect(CategoryLevelEligibility.levelRank('livre'), 2);
      expect(CategoryLevelEligibility.levelRank(''), isNull);
      expect(CategoryLevelEligibility.levelRank('xpto'), isNull);
    });

    test('hierarquia crescente', () {
      expect(
        CategoryLevelEligibility.levelRank('iniciante')! <
            CategoryLevelEligibility.levelRank('intermediario')!,
        isTrue,
      );
      expect(
        CategoryLevelEligibility.levelRank('intermediario')! <
            CategoryLevelEligibility.levelRank('open')!,
        isTrue,
      );
    });
  });

  group('categoryLevelRank', () {
    test('lê o nível da categoria', () {
      expect(CategoryLevelEligibility.categoryLevelRank(_offer('Iniciante')), 0);
      expect(
        CategoryLevelEligibility.categoryLevelRank(_offer('Intermediário')),
        1,
      );
      expect(CategoryLevelEligibility.categoryLevelRank(_offer('Open')), 2);
    });

    test('categoria sem nível → Open', () {
      expect(CategoryLevelEligibility.categoryLevelRank(_offer('')), 2);
    });
  });

  group('athleteLevelRank', () {
    test('usa o nível do perfil', () {
      expect(CategoryLevelEligibility.athleteLevelRank(_athlete('Open')), 2);
      expect(
        CategoryLevelEligibility.athleteLevelRank(_athlete('Intermediário')),
        1,
      );
    });

    test('sem perfil/nível → Iniciante (permissivo)', () {
      expect(CategoryLevelEligibility.athleteLevelRank(null), 0);
      expect(CategoryLevelEligibility.athleteLevelRank(_athlete('')), 0);
    });

    test('usa nível por esporte do torneio quando disponível', () {
      final a = _athlete(
        'iniciante',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(
        CategoryLevelEligibility.athleteLevelRank(
          a,
          tournamentSport: 'beachVolleyball',
        ),
        2,
      );
      // Esporte diferente cai no nível global.
      expect(
        CategoryLevelEligibility.athleteLevelRank(
          a,
          tournamentSport: 'indoorVolleyball',
        ),
        0,
      );
    });

    test('footvolley (sem equivalente) usa nível global', () {
      final a = _athlete(
        'open',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'iniciante'},
      );
      expect(
        CategoryLevelEligibility.athleteLevelRank(
          a,
          tournamentSport: 'footvolley',
        ),
        2,
      );
    });
  });

  group('tournamentSportToLevelSportCode', () {
    test('mapeia esportes de vôlei', () {
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode(
          'beachVolleyball',
        ),
        'VOLEI_PRAIA',
      );
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode(
          'indoorVolleyball',
        ),
        'VOLEI_QUADRA',
      );
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode('footvolley'),
        isNull,
      );
    });
  });

  group('isCategoryEligibleForAthlete por esporte', () {
    test('atleta Open no vôlei de praia não pode categoria Intermediário', () {
      final a = _athlete(
        'iniciante',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Intermediário'),
          a,
          tournamentSport: 'beachVolleyball',
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
          tournamentSport: 'beachVolleyball',
        ),
        isTrue,
      );
    });
  });

  group('isCategoryEligibleForAthlete', () {
    test('atleta Iniciante pode tudo', () {
      final a = _athlete('Iniciante');
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Iniciante'),
          a,
        ),
        isTrue,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
        ),
        isTrue,
      );
    });

    test('atleta Intermediário não pode Iniciante', () {
      final a = _athlete('Intermediário');
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Iniciante'),
          a,
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Intermediário'),
          a,
        ),
        isTrue,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
        ),
        isTrue,
      );
    });

    test('atleta Open só pode Open', () {
      final a = _athlete('Open');
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Iniciante'),
          a,
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Intermediário'),
          a,
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
        ),
        isTrue,
      );
    });
  });

  group('blockMessage', () {
    test('cita o nível do atleta', () {
      expect(
        CategoryLevelEligibility.blockMessage(_athlete('Open')),
        contains('Open'),
      );
    });
  });
}
