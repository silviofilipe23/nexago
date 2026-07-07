import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_draft.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_providers.dart';

void main() {
  group('AthleteProfileOptions.levelRank', () {
    test('rankeia labels, códigos e legados', () {
      // Escada de 5 níveis (espelho de LEVEL_RANK nas functions): legados
      // caem no degrau inferior do split — iniciante→0, intermediario→2,
      // open→5 (ranks 1 e 4 reservados à escada D/C/B/A).
      expect(AthleteProfileOptions.levelRank('Iniciante'), 0);
      expect(AthleteProfileOptions.levelRank('iniciante'), 0);
      expect(AthleteProfileOptions.levelRank('Básico'), 0);
      expect(AthleteProfileOptions.levelRank('Iniciante 1'), 0);
      expect(AthleteProfileOptions.levelRank('Iniciante 2'), 1);
      expect(AthleteProfileOptions.levelRank('iniciante_2'), 1);
      expect(AthleteProfileOptions.levelRank('Intermediário'), 2);
      expect(AthleteProfileOptions.levelRank('intermediario'), 2);
      expect(AthleteProfileOptions.levelRank('Intermediário 1'), 2);
      expect(AthleteProfileOptions.levelRank('intermediario_1'), 2);
      expect(AthleteProfileOptions.levelRank('Intermediário 2'), 3);
      expect(AthleteProfileOptions.levelRank('intermediario_2'), 3);
      expect(AthleteProfileOptions.levelRank('Open'), 5);
      expect(AthleteProfileOptions.levelRank('open'), 5);
      expect(AthleteProfileOptions.levelRank('Open / federado'), 5);
      expect(AthleteProfileOptions.levelRank('livre'), 5);
    });

    test('ausente/desconhecido → null', () {
      expect(AthleteProfileOptions.levelRank(null), isNull);
      expect(AthleteProfileOptions.levelRank(''), isNull);
      expect(AthleteProfileOptions.levelRank('xpto'), isNull);
    });

    test('hierarquia é crescente', () {
      expect(
        AthleteProfileOptions.levelRank('Iniciante')! <
            AthleteProfileOptions.levelRank('Intermediário')!,
        isTrue,
      );
      expect(
        AthleteProfileOptions.levelRank('Intermediário')! <
            AthleteProfileOptions.levelRank('Open')!,
        isTrue,
      );
    });
  });

  group('AthleteSportsLevelsUiState.lockedLevelRankFor', () {
    AthleteSportsLevelsUiState stateWithBaseline(Map<String, String> levels) {
      return AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.ready,
        baseline: AthleteSportsLevelsDraft(
          primaryAppSportId: 'beach_volleyball',
          levelByAppSportId: levels,
        ),
      );
    }

    test('retorna o rank do nível salvo por esporte', () {
      final state = stateWithBaseline({
        'beach_volleyball': 'Intermediário',
        'beach_tennis': 'Open',
      });
      expect(state.lockedLevelRankFor('beach_volleyball'), 2);
      expect(state.lockedLevelRankFor('beach_tennis'), 5);
    });

    test('esporte sem nível salvo → null (primeira definição livre)', () {
      final state = stateWithBaseline({'beach_volleyball': 'Iniciante'});
      expect(state.lockedLevelRankFor('tennis'), isNull);
    });
  });
}
