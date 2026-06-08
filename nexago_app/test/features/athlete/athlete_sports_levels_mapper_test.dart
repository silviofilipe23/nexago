import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_draft.dart';
import 'package:nexago_app/features/athlete/domain/athlete_sports_levels_mapper.dart';

void main() {
  group('AthleteSportsLevelsMapper', () {
    test('fromProfile with primary only uses legacy level', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Test',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: 'Goiânia',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario'},
      );

      final enrollments = AthleteSportsLevelsMapper.fromProfile(profile);
      expect(enrollments, hasLength(1));
      expect(enrollments.first.isPrimary, isTrue);
      expect(enrollments.first.appSportId, 'beach_volleyball');
      expect(enrollments.first.levelLabel, 'Intermediário');
    });

    test('fromProfile defaults missing secondary level to Iniciante', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Test',
        sport: 'Vôlei de praia',
        level: 'Básico',
        city: 'Goiânia',
        sports: ['Beach tennis'],
        primarySportFirestoreId: 'VOLEI_PRAIA',
        secondarySportFirestoreIds: ['BEACH_TENNIS'],
        levelsBySportFirestore: {'VOLEI_PRAIA': 'basico'},
      );

      final enrollments = AthleteSportsLevelsMapper.fromProfile(profile);
      expect(enrollments, hasLength(2));
      expect(enrollments[0].levelLabel, 'Iniciante');
      expect(enrollments[1].appSportId, 'beach_tennis');
      expect(enrollments[1].levelLabel, 'Iniciante');
    });

    test('toProfile round-trip writes all levelsBySport keys', () {
      const base = AthleteProfile(
        id: 'u1',
        name: 'Test',
        sport: 'Vôlei de praia',
        level: 'Iniciante',
        city: 'Goiânia',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        onboardingCompleted: true,
      );

      final draft = AthleteSportsLevelsDraft(
        primaryAppSportId: 'beach_volleyball',
        otherAppSportIds: {'beach_tennis'},
        levelByAppSportId: {
          'beach_volleyball': 'Pro',
          'beach_tennis': 'Iniciante',
        },
      );

      final updated = AthleteSportsLevelsMapper.toProfile(
        draft: draft,
        base: base,
      );
      final firestore = updated.toFirestore();
      final onboarding = firestore['sportOnboarding'] as Map<String, dynamic>;
      final levels = onboarding['levelsBySport'] as Map<String, dynamic>;

      expect(levels['VOLEI_PRAIA'], 'pro');
      expect(levels['BEACH_TENNIS'], 'iniciante');
      expect(updated.sport, 'Vôlei de praia');
      expect(updated.level, 'Pro');
      expect(updated.sports, ['Beach tennis']);
    });
  });
}
