import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_draft.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_providers.dart';

void main() {
  group('AthleteProfileOptions.levelRank', () {
    test('rankeia labels, códigos e legados', () {
      expect(AthleteProfileOptions.levelRank('Iniciante'), 0);
      expect(AthleteProfileOptions.levelRank('iniciante'), 0);
      expect(AthleteProfileOptions.levelRank('Básico'), 0);
      expect(AthleteProfileOptions.levelRank('Intermediário'), 1);
      expect(AthleteProfileOptions.levelRank('intermediario'), 1);
      expect(AthleteProfileOptions.levelRank('Open'), 2);
      expect(AthleteProfileOptions.levelRank('open'), 2);
      expect(AthleteProfileOptions.levelRank('Open / federado'), 2);
      expect(AthleteProfileOptions.levelRank('livre'), 2);
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
      expect(state.lockedLevelRankFor('beach_volleyball'), 1);
      expect(state.lockedLevelRankFor('beach_tennis'), 2);
    });

    test('esporte sem nível salvo → null (primeira definição livre)', () {
      final state = stateWithBaseline({'beach_volleyball': 'Iniciante'});
      expect(state.lockedLevelRankFor('tennis'), isNull);
    });
  });
}
