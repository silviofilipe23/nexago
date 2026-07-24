import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

void main() {
  group('levelSegmentsFromCode (escada única de 5)', () {
    test('cada degrau preenche um segmento a mais', () {
      expect(athleteLevelSegmentCount, 5);
      expect(levelSegmentsFromCode('iniciante_1'), 1);
      expect(levelSegmentsFromCode('iniciante_2'), 2);
      expect(levelSegmentsFromCode('intermediario_1'), 3);
      expect(levelSegmentsFromCode('intermediario_2'), 4);
      expect(levelSegmentsFromCode('open'), 5);
    });

    test('labels e legados resolvem pelo mesmo rank', () {
      expect(levelSegmentsFromCode('Intermediário 2'), 4);
      expect(levelSegmentsFromCode('iniciante'), 1);
      expect(levelSegmentsFromCode('intermediario'), 3);
      expect(levelSegmentsFromCode('livre'), 5);
    });

    test('desconhecido/ausente cai no mínimo', () {
      expect(levelSegmentsFromCode(null), 1);
      expect(levelSegmentsFromCode(''), 1);
      expect(levelSegmentsFromCode('xpto'), 1);
    });
  });

  group('discoverLevelDisplayLabel', () {
    test('usa o label da escada de 5 (sem escala numérica paralela)', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: '',
        city: 'Goiânia',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_1'},
      );
      expect(discoverLevelDisplayLabel(profile), 'Nível Intermediário 1');
    });

    test('cai no nível global quando falta o por esporte', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Open',
        city: 'Goiânia',
        primarySportFirestoreId: 'VOLEI_QUADRA',
        levelsBySportFirestore: {},
      );
      expect(discoverLevelDisplayLabel(profile), 'Nível Open');
    });
  });
}
