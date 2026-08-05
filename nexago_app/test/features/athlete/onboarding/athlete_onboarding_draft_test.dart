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
        verifiedPhoneNumber: '+5511987654321',
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

      // Telefone não verificado e data fora do formato continuam inválidos.
      // Digitar o número não basta mais: sem passar pelo SMS o gate de
      // torneios do servidor recusaria a inscrição depois.
      const partial = AthleteOnboardingDraft(
        name: 'Ana',
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
        verifiedPhoneNumber: '+5511987654321',
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
      expect(profile.phoneNumber, '+5511987654321');
      expect(profile.phoneVerified, isTrue);
      expect(profile.birthDate, '1990-03-15');
      expect(profile.gender, 'Feminino');
      expect(profile.primarySportFirestoreId, 'VOLEI_PRAIA');
      expect(profile.onboardingCompleted, isTrue);
      expect(profile.city, '');
    });

    test('referralCode defaults to empty and is preserved by copyWith', () {
      const draft = AthleteOnboardingDraft();
      expect(draft.referralCode, '');

      final withCode = draft.copyWith(referralCode: 'referrer-uid');
      expect(withCode.referralCode, 'referrer-uid');

      // copyWith sem argumento mantém o valor atual (não reseta pro default).
      expect(withCode.copyWith().referralCode, 'referrer-uid');
    });
  });
}
