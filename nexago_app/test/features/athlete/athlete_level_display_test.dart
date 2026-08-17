import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

void main() {
  group('levelSegmentsFromCode (escada única de 7)', () {
    test('cada degrau preenche um segmento a mais', () {
      expect(athleteLevelSegmentCount, 7);
      expect(levelSegmentsFromCode('iniciante_1'), 1);
      expect(levelSegmentsFromCode('iniciante_2'), 2);
      expect(levelSegmentsFromCode('intermediario_1'), 3);
      expect(levelSegmentsFromCode('intermediario_2'), 4);
      expect(levelSegmentsFromCode('avancado_1'), 5);
      expect(levelSegmentsFromCode('avancado_2'), 6);
      expect(levelSegmentsFromCode('open'), 7);
    });

    test('labels e legados resolvem pelo mesmo rank', () {
      expect(levelSegmentsFromCode('Intermediário 2'), 4);
      expect(levelSegmentsFromCode('Avançado 1'), 5);
      expect(levelSegmentsFromCode('iniciante'), 1);
      expect(levelSegmentsFromCode('intermediario'), 3);
      expect(levelSegmentsFromCode('livre'), 7);
    });

    test('desconhecido/ausente cai no mínimo', () {
      expect(levelSegmentsFromCode(null), 1);
      expect(levelSegmentsFromCode(''), 1);
      expect(levelSegmentsFromCode('xpto'), 1);
    });
  });

  group('AthleteProfileOptions (escada de 7): rank e label', () {
    test('levelRank reconhece Avançado 1/2 e Open no topo', () {
      expect(AthleteProfileOptions.levelRank('avancado_1'), 4);
      expect(AthleteProfileOptions.levelRank('Avançado 1'), 4);
      expect(AthleteProfileOptions.levelRank('avancado_2'), 5);
      expect(AthleteProfileOptions.levelRank('open'), 6);
    });

    test('labelForRank resolve os 3 degraus superiores da escada', () {
      expect(AthleteProfileOptions.labelForRank(4), 'Avançado 1');
      expect(AthleteProfileOptions.labelForRank(5), 'Avançado 2');
      expect(AthleteProfileOptions.labelForRank(6), 'Open');
    });
  });

  group('discoverLevelDisplayLabel', () {
    test('usa o label da escada de 7 (sem escala numérica paralela)', () {
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
