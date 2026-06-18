import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_draft.dart';

void main() {
  group('AthleteOnboardingDraft', () {
    test('canContinueFrom requires primary sport on step 1', () {
      const draft = AthleteOnboardingDraft();
      expect(
        draft.canContinueFrom(AthleteOnboardingStep.primarySport),
        isFalse,
      );

      final withSport = draft.copyWith(primarySportId: 'beach_volleyball');
      expect(
        withSport.canContinueFrom(AthleteOnboardingStep.primarySport),
        isTrue,
      );
    });

    test('primarySport step requires a selected sport', () {
      const empty = AthleteOnboardingDraft();
      expect(
        empty.canContinueFrom(AthleteOnboardingStep.primarySport),
        isFalse,
      );
      const withSport =
          AthleteOnboardingDraft(primarySportId: 'beach_volleyball');
      expect(
        withSport.canContinueFrom(AthleteOnboardingStep.primarySport),
        isTrue,
      );
    });

    test('otherSportLabels excludes primary sport', () {
      const draft = AthleteOnboardingDraft(
        primarySportId: 'beach_volleyball',
        otherSportIds: {'beach_volleyball', 'football'},
      );
      expect(draft.primarySportLabel, 'Vôlei de praia');
      expect(draft.otherSportLabels, ['Futebol']);
    });

    test('isProfileValid requires name phone birth gender', () {
      const invalid = AthleteOnboardingDraft();
      expect(invalid.isProfileValid, isFalse);

      const valid = AthleteOnboardingDraft(
        name: 'Marcelo Antunes',
        phoneDigits: '(11) 98765-4321',
        birthDate: '15/03/1990',
        gender: 'Masculino',
      );
      expect(valid.isProfileValid, isTrue);
    });

    test('per-field validators isolate what is missing', () {
      const empty = AthleteOnboardingDraft();
      expect(empty.isNameValid, isFalse);
      expect(empty.isPhoneValid, isFalse);
      expect(empty.isBirthDateValid, isFalse);
      expect(empty.isGenderValid, isFalse);

      const onlyName = AthleteOnboardingDraft(name: '  Ana  ');
      expect(onlyName.isNameValid, isTrue);
      expect(onlyName.isPhoneValid, isFalse);

      // Telefone curto e data fora do formato continuam inválidos.
      const partial = AthleteOnboardingDraft(
        name: 'Ana',
        phoneDigits: '1198',
        birthDate: '31/13/2050',
        gender: 'Feminino',
      );
      expect(partial.isPhoneValid, isFalse);
      expect(partial.isBirthDateValid, isFalse);
      expect(partial.isGenderValid, isTrue);
      expect(partial.isProfileValid, isFalse);
    });

    test('toAthleteProfile maps fields for Firestore', () {
      const draft = AthleteOnboardingDraft(
        primarySportId: 'beach_volleyball',
        otherSportIds: {'football'},
        level: 'Intermediário',
        goalIds: {'compete', 'play_fun'},
        name: 'Marcelo',
        nickname: 'Marcelão',
        phoneDigits: '(11) 98765-4321',
        birthDate: '15/03/1990',
        gender: 'Feminino',
      );

      final profile = draft.toAthleteProfile(uid: 'uid-1');
      expect(profile.id, 'uid-1');
      expect(profile.sport, 'Vôlei de praia');
      expect(profile.sports, ['Futebol']);
      expect(profile.level, 'Intermediário');
      expect(profile.goals, containsAll(['COMPETIR', 'JOGAR_DIVERSAO']));
      expect(profile.name, 'Marcelo');
      expect(profile.nickname, 'Marcelão');
      expect(profile.phoneNumber, '(11) 98765-4321');
      expect(profile.birthDate, '1990-03-15');
      expect(profile.gender, 'Feminino');
      expect(profile.primarySportFirestoreId, 'VOLEI_PRAIA');
      expect(profile.onboardingCompleted, isTrue);
      expect(profile.city, '');
    });
  });
}
