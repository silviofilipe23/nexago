import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_draft.dart';

void main() {
  group('AthleteProfileOptions', () {
    test('normalizeLevel maps legacy federado label', () {
      expect(
        AthleteProfileOptions.normalizeLevel('Competitivo / federado'),
        'Competitivo',
      );
    });

    test('normalizeSport maps legacy labels', () {
      expect(AthleteProfileOptions.normalizeSport('Futevôlei'), 'Futebol');
      expect(AthleteProfileOptions.normalizeSport('Beach tênis'), 'Beach tennis');
    });
  });

  group('AthleteProfile.toFirestore', () {
    test('persists canonical user document with goals array', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: '',
        sports: ['Beach tennis'],
        goals: ['RESERVAR_ARENA', 'COMPETIR'],
        nickname: 'Aninha',
        birthDate: '2000-01-01',
        gender: 'Feminino',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        secondarySportFirestoreIds: ['BEACH_TENNIS'],
        onboardingCompleted: true,
      );

      final data = profile.toFirestore();
      expect(data['fullName'], 'Ana');
      expect(data['isProfileComplete'], isTrue);
      expect(data['birthDate'], '2000-01-01');
      expect(data['sportProfile'], {'level': 'intermediario'});

      final onboarding = data['sportOnboarding'] as Map<String, dynamic>;
      expect(onboarding['version'], 1);
      expect(onboarding['primarySportId'], 'VOLEI_PRAIA');
      expect(onboarding['secondarySportIds'], ['BEACH_TENNIS']);
      expect(onboarding['levelsBySport'], {'VOLEI_PRAIA': 'intermediario'});
      expect(onboarding['goals'], ['RESERVAR_ARENA', 'COMPETIR']);
      expect(onboarding.containsKey('completedAt'), isTrue);
    });
  });

  group('AthleteOnboardingDraft.toAthleteProfile', () {
    test('maps draft to firestore sport codes and goal array', () {
      const draft = AthleteOnboardingDraft(
        primarySportId: 'beach_volleyball',
        otherSportIds: {'beach_tennis'},
        level: 'Intermediário',
        goalIds: {'book_arena', 'compete'},
        name: 'Marcelo',
        phoneDigits: '(11) 98765-4321',
        birthDate: '15/03/1990',
        gender: 'Feminino',
      );

      final profile = draft.toAthleteProfile(uid: 'uid-1');
      expect(profile.primarySportFirestoreId, 'VOLEI_PRAIA');
      expect(profile.secondarySportFirestoreIds, ['BEACH_TENNIS']);
      expect(profile.goals, ['RESERVAR_ARENA', 'COMPETIR']);
      expect(profile.birthDate, '1990-03-15');
      expect(
        AthleteFirestoreCodes.levelLabelToFirestore(profile.level),
        'intermediario',
      );
    });
  });
}
