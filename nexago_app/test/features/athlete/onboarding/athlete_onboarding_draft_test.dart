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
    phoneNumber: '(11) 98765-4321',
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

    test('telefone é obrigatório pra concluir o cadastro', () {
      // O contato é o que o organizador usa pra falar com o atleta — sem ele
      // a inscrição fica sem canal. O SMS é que deixou de ser exigido.
      final semTelefone = _completeProfileDraft().copyWith(phoneNumber: '');
      expect(semTelefone.isProfileValid, isFalse);
      expect(
        semTelefone.canContinueFrom(AthleteOnboardingStep.profile),
        isFalse,
      );
    });

    test('telefone digitado conclui o cadastro sem passar pelo SMS', () {
      // SMS não chega pra parte dos atletas e travava o cadastro inteiro.
      // O número declarado basta: sai com phoneNumber e SEM phoneVerified.
      final draft = _completeProfileDraft();
      expect(draft.isProfileValid, isTrue);
      expect(draft.canContinueFrom(AthleteOnboardingStep.profile), isTrue);

      final profile = draft.toAthleteProfile(uid: 'uid-1');
      expect(profile.phoneNumber, '(11) 98765-4321');
      expect(profile.phoneVerified, isFalse);
      expect(profile.onboardingCompleted, isTrue);
    });

    test('verificar por SMS marca phoneVerified no perfil', () {
      final draft = _completeProfileDraft()
          .copyWith(phoneNumber: '+5511987654321', phoneVerified: true);

      final profile = draft.toAthleteProfile(uid: 'uid-1');
      expect(profile.phoneNumber, '+5511987654321');
      expect(profile.phoneVerified, isTrue);
    });

    test('cidade, UF e foto são obrigatórias pra concluir o cadastro', () {
      // Cada um sozinho derruba o passo: o atleta precisa ser identificável
      // (foto) e localizável (cidade/UF) — o gate de torneios do servidor
      // (athlete-tournament-access.ts) já exigia os dois depois do cadastro.
      expect(
          _completeProfileDraft().copyWith(city: '').isProfileValid, isFalse);
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

      // Número digitado vale sem SMS, mas o formato ainda é conferido —
      // telefone quebrado não serve de contato pro organizador.
      const celular = AthleteOnboardingDraft(phoneNumber: '(62) 99999-9999');
      expect(celular.isPhoneValid, isTrue);
      const quebrado = AthleteOnboardingDraft(phoneNumber: '123');
      expect(quebrado.isPhoneValid, isFalse);

      // Data fora do formato continua inválida.
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
        phoneNumber: '+5511987654321',
        phoneVerified: true,
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

    test('telefone digitado destrava o gate de torneios, sem SMS', () {
      // Espelho de `athlete-tournament-access.ts`: o número declarado basta.
      // Se o client divergir do servidor, o atleta passa no banner e leva
      // failed-precondition no meio da inscrição (ou o contrário).
      final semSms = _completeProfileDraft()
          .toAthleteProfile(uid: 'uid-1', avatarUrl: 'https://cdn/a.jpg');

      expect(semSms.phoneVerified, isFalse);
      expect(isTournamentProfileReady(semSms), isTrue);
      expect(canAccessOfficialTournaments(profile: semSms), isTrue);
      expect(tournamentProfileMissingTitles(semSms), isEmpty);
    });

    test('concluir sem telefone nenhum NÃO destrava o gate de torneios', () {
      final semTelefone = _completeProfileDraft()
          .copyWith(phoneNumber: '')
          .toAthleteProfile(uid: 'uid-1', avatarUrl: 'https://cdn/a.jpg');

      expect(semTelefone.onboardingCompleted, isTrue);
      expect(isTournamentProfileReady(semTelefone), isFalse);
      expect(canAccessOfficialTournaments(profile: semTelefone), isFalse);
      // WhatsApp é a ÚNICA pendência: cidade/UF/foto já saíram do onboarding.
      expect(tournamentProfileMissingTitles(semTelefone), ['WhatsApp']);
    });

    test('o passo WhatsApp da gamificação continua exigindo o SMS', () {
      // "Perfil 100%" (gamificação, profile-completion-shared.ts) segue
      // premiando a verificação — é a recompensa que sobrou pro SMS. Só o
      // gate de torneios afrouxou.
      final semSms = _completeProfileDraft()
          .toAthleteProfile(uid: 'uid-1', avatarUrl: 'https://cdn/a.jpg');

      final completion = ProfileCompletionState.fromProfile(semSms);
      expect(
        completion.steps
            .firstWhere((s) => s.step == ProfileCompletionStep.whatsapp)
            .isDone,
        isFalse,
      );
      expect(completion.canUnlockTournaments, isTrue);
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
