import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/profile_access.dart';
import 'package:nexago_app/features/athlete/domain/profile_completion_models.dart';
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

    test(
      'canContinueFrom requires an explicitly chosen level on step 2 — sem '
      'default silencioso (escolha obrigatória)',
      () {
        const draft = AthleteOnboardingDraft();
        expect(draft.level, isNull);
        expect(
          draft.canContinueFrom(AthleteOnboardingStep.level),
          isFalse,
        );

        final withLevel = draft.copyWith(level: 'Iniciante 1');
        expect(
          withLevel.canContinueFrom(AthleteOnboardingStep.level),
          isTrue,
        );
      },
    );

    test('otherSportLabels excludes primary sport', () {
      const draft = AthleteOnboardingDraft(
        primarySportId: 'beach_volleyball',
        otherSportIds: {'beach_volleyball', 'football'},
      );
      expect(draft.primarySportLabel, 'Vôlei de praia');
      expect(draft.otherSportLabels, ['Futebol']);
    });

    test('isProfileValid requires name birth gender city state photo', () {
      const invalid = AthleteOnboardingDraft();
      expect(invalid.isProfileValid, isFalse);

      expect(_completeProfileDraft().isProfileValid, isTrue);
    });

    test('telefone verificado NÃO é mais obrigatório pra concluir o cadastro', () {
      // SMS não chega pra parte dos atletas e travava o cadastro inteiro.
      // Sem verificar, o atleta conclui com onboardingCompleted e SEM
      // phoneVerified — o gate de torneios do servidor continua exigindo a
      // verificação na hora da inscrição (athlete-tournament-access.ts).
      final semTelefone =
          _completeProfileDraft().copyWith(verifiedPhoneNumber: '');
      expect(semTelefone.isProfileValid, isTrue);
      expect(
        semTelefone.canContinueFrom(AthleteOnboardingStep.profile),
        isTrue,
      );

      final profile = semTelefone.toAthleteProfile(uid: 'uid-1');
      expect(profile.phoneVerified, isFalse);
      expect(profile.phoneNumber, isNull);
      expect(profile.onboardingCompleted, isTrue);
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

    test('concluir sem telefone NÃO destrava o gate de torneios', () {
      // A regra que não pode quebrar: destravar o funil de cadastro não pode
      // destravar torneios. O perfil que sai do onboarding sem SMS precisa
      // continuar barrado no client (profile_access.dart), espelho do servidor
      // (athlete-tournament-access.ts) — senão o atleta passa no banner e leva
      // failed-precondition no meio da inscrição.
      final semTelefone = _completeProfileDraft()
          .copyWith(verifiedPhoneNumber: '')
          .toAthleteProfile(uid: 'uid-1', avatarUrl: 'https://cdn/a.jpg');

      expect(semTelefone.onboardingCompleted, isTrue);
      expect(isTournamentProfileReady(semTelefone), isFalse);
      expect(canAccessOfficialTournaments(profile: semTelefone), isFalse);
      // WhatsApp é a ÚNICA pendência: cidade/UF/foto já saíram do onboarding.
      expect(tournamentProfileMissingTitles(semTelefone), ['WhatsApp']);

      final completion = ProfileCompletionState.fromProfile(semTelefone);
      expect(
        completion.steps
            .firstWhere((s) => s.step == ProfileCompletionStep.whatsapp)
            .isDone,
        isFalse,
      );
      expect(completion.canUnlockTournaments, isFalse);

      // Mesmo perfil COM o SMS verificado destrava — prova que o bloqueio
      // acima é só o telefone, não outro campo esquecido.
      final comTelefone = _completeProfileDraft()
          .toAthleteProfile(uid: 'uid-1', avatarUrl: 'https://cdn/a.jpg');
      expect(isTournamentProfileReady(comTelefone), isTrue);
      expect(canAccessOfficialTournaments(profile: comTelefone), isTrue);
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
