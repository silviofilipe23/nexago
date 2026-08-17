import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_draft.dart';

/// Rascunho com todos os obrigatórios do passo de perfil preenchidos — os
/// testes derivam dele com `copyWith` pra isolar UM campo faltando.
AthleteOnboardingDraft _completeProfileDraft() {
  return AthleteOnboardingDraft(
    name: 'Marcelo Antunes',
    verifiedPhoneNumber: '+5511987654321',
    birthDate: '15/03/1990',
    gender: 'Masculino',
    city: 'Goiânia',
    state: 'GO',
    avatarBytes: Uint8List.fromList(const [1, 2, 3]),
    avatarContentType: 'image/jpeg',
  );
}

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

    test('isProfileValid requires name phone birth gender city state photo', () {
      const invalid = AthleteOnboardingDraft();
      expect(invalid.isProfileValid, isFalse);

      expect(_completeProfileDraft().isProfileValid, isTrue);
    });

    test('cidade, UF e foto são obrigatórias pra concluir o cadastro', () {
      // Cada um sozinho derruba o passo: o atleta precisa ser identificável
      // (foto) e localizável (cidade/UF) — o gate de torneios do servidor
      // (athlete-tournament-access.ts) já exigia os dois depois do cadastro.
      expect(_completeProfileDraft().copyWith(city: '').isProfileValid, isFalse);
      expect(
        _completeProfileDraft().copyWith(state: '').isProfileValid,
        isFalse,
      );
      expect(
        _completeProfileDraft().copyWith(clearAvatar: true).isProfileValid,
        isFalse,
      );
    });

    test('per-field validators isolate what is missing', () {
      const empty = AthleteOnboardingDraft();
      expect(empty.isNameValid, isFalse);
      expect(empty.isPhoneValid, isFalse);
      expect(empty.isBirthDateValid, isFalse);
      expect(empty.isGenderValid, isFalse);
      expect(empty.isCityValid, isFalse);
      expect(empty.isStateValid, isFalse);
      expect(empty.isPhotoValid, isFalse);

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
        city: '  Aparecida de Goiânia  ',
        state: 'go',
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
      // A cidade sai limpa e a UF em caixa alta: é o formato que
      // `AthleteProfile.toFirestore` grava e que o gate de torneios lê.
      expect(profile.city, 'Aparecida de Goiânia');
      expect(profile.state, 'GO');
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
