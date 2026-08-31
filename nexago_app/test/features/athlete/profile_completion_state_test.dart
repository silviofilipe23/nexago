import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/profile_access.dart';
import 'package:nexago_app/features/athlete/domain/profile_completion_models.dart';

void main() {
  AthleteProfile baseProfile({
    bool onboarding = true,
    bool isProfileComplete = false,
    String? avatar,
    String sport = 'Vôlei de praia',
    String level = 'Iniciante',
    String city = 'Goiânia',
    String? state = 'GO',
    String? phone = '(62) 99999-9999',
    // O passo de WhatsApp exige posse comprovada por SMS, não só formato
    // válido — o default espelha "tem telefone porque verificou".
    bool? phoneVerified,
    List<String> goals = const ['RESERVAR_ARENA'],
  }) {
    return AthleteProfile(
      id: 'u1',
      name: 'Test',
      avatarUrl: avatar,
      sport: sport,
      level: level,
      city: city,
      state: state,
      phoneNumber: phone,
      phoneVerified: phoneVerified ?? phone != null,
      goals: goals,
      onboardingCompleted: onboarding,
      isProfileComplete: isProfileComplete,
    );
  }

  test('percent and remainingXp for partial profile', () {
    final state = ProfileCompletionState.fromProfile(
      baseProfile(avatar: null, phone: null, goals: [], city: '', state: null),
    );

    expect(state.completedCount, lessThan(ProfileCompletionState.totalSteps));
    expect(state.percent, greaterThan(0));
    expect(state.percent, lessThan(100));
    expect(state.remainingXp, greaterThan(0));
    expect(state.allComplete, isFalse);
  });

  test('allComplete when every step is satisfied', () {
    final state = ProfileCompletionState.fromProfile(
      baseProfile(avatar: 'https://example.com/a.jpg'),
    );

    expect(state.completedCount, ProfileCompletionState.totalSteps);
    expect(state.percent, 100);
    expect(state.remainingXp, 0);
    expect(state.allComplete, isTrue);
  });

  test('tournament access requires onboarding, whatsapp and city only', () {
    final incomplete = baseProfile(onboarding: true, goals: [], phone: null);
    expect(isTournamentProfileReady(incomplete), isFalse);
    expect(canAccessOfficialTournaments(profile: incomplete), isFalse);

    final tournamentReady = baseProfile(
      onboarding: true,
      avatar: null,
      goals: [],
      phone: '(62) 99999-9999',
      city: 'Goiânia',
    );
    expect(isTournamentProfileReady(tournamentReady), isTrue);
    expect(canAccessOfficialTournaments(profile: tournamentReady), isTrue);

    final gamificationIncomplete = ProfileCompletionState.fromProfile(
      tournamentReady,
    );
    expect(gamificationIncomplete.allComplete, isFalse);
    expect(gamificationIncomplete.canUnlockTournaments, isTrue);
  });

  test('phone with valid format unlocks tournaments without SMS', () {
    // Espelho do gate: o servidor aceita o número declarado em
    // `athlete-tournament-access.ts`. Se o client exigir mais que o servidor,
    // o atleta fica barrado no banner por uma regra que não existe.
    final typedOnly = baseProfile(
      onboarding: true,
      goals: [],
      phone: '(62) 99999-9999',
      phoneVerified: false,
    );

    expect(isTournamentProfileReady(typedOnly), isTrue);
    expect(canAccessOfficialTournaments(profile: typedOnly), isTrue);
    expect(
        tournamentProfileMissingTitles(typedOnly), isNot(contains('WhatsApp')));
    // Mas o passo da gamificação continua exigindo o SMS: "perfil 100%" é a
    // recompensa que sobrou pra verificação.
    expect(
      ProfileCompletionState.fromProfile(typedOnly)
          .steps
          .firstWhere((s) => s.step == ProfileCompletionStep.whatsapp)
          .isDone,
      isFalse,
    );
  });

  test('malformed phone still does not unlock tournaments', () {
    final broken = baseProfile(
      onboarding: true,
      goals: [],
      phone: '123',
      phoneVerified: false,
    );

    expect(isTournamentProfileReady(broken), isFalse);
    expect(tournamentProfileMissingTitles(broken), contains('WhatsApp'));
  });

  test('whatsapp validation accepts 10-11 digits', () {
    expect(
        ProfileCompletionValidators.isValidWhatsApp('(62) 99999-9999'), isTrue);
    expect(ProfileCompletionValidators.isValidWhatsApp('123'), isFalse);
  });

  test('whatsapp validation accepts country code 55', () {
    expect(
      ProfileCompletionValidators.isValidWhatsApp('+55 62 99999-9999'),
      isTrue,
    );
  });

  test('isProfileComplete flag unlocks tournaments without gamification steps',
      () {
    final profile = baseProfile(
      onboarding: false,
      goals: [],
      phone: null,
      city: '',
      isProfileComplete: true,
    );
    final completion = ProfileCompletionState.fromProfile(profile);
    expect(completion.allComplete, isFalse);
    expect(canAccessOfficialTournaments(profile: profile), isTrue);
  });

  test('block message lists pending tournament requirements', () {
    final profile = baseProfile(onboarding: true, goals: [], phone: null);

    expect(tournamentProfileMissingTitles(profile), isNotEmpty);
    expect(
      tournamentAccessBlockMessageForProfile(profile),
      contains('WhatsApp'),
    );
  });

  test('sport level step counts levelsBySportFirestore', () {
    final profile = AthleteProfile(
      id: 'u1',
      name: 'Test',
      sport: '',
      level: '',
      city: 'Goiânia',
      state: 'GO',
      primarySportFirestoreId: 'VOLEI_PRAIA',
      levelsBySportFirestore: const {'VOLEI_PRAIA': 'INTERMEDIARIO'},
    );
    final state = ProfileCompletionState.fromProfile(profile);
    expect(
      state.steps
          .firstWhere((s) => s.step == ProfileCompletionStep.sportLevel)
          .isDone,
      isTrue,
    );
  });
}
