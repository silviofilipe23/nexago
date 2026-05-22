import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/profile_access.dart';
import 'package:nexago_app/features/athlete/domain/profile_completion_models.dart';

void main() {
  AthleteProfile baseProfile({
    bool onboarding = true,
    String? avatar,
    String sport = 'Vôlei de praia',
    String level = 'Iniciante',
    String city = 'Goiânia',
    String? state = 'GO',
    String? phone = '(62) 99999-9999',
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
      goals: goals,
      onboardingCompleted: onboarding,
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

  test('canUnlockTournaments requires onboarding and all steps', () {
    final incomplete = ProfileCompletionState.fromProfile(
      baseProfile(onboarding: true, goals: []),
    );
    expect(incomplete.canUnlockTournaments, isFalse);

    final noOnboarding = ProfileCompletionState.fromProfile(
      baseProfile(
        onboarding: false,
        avatar: 'https://example.com/a.jpg',
      ),
    );
    expect(noOnboarding.canUnlockTournaments, isFalse);

    final ok = ProfileCompletionState.fromProfile(
      baseProfile(avatar: 'https://example.com/a.jpg', onboarding: true),
    );
    expect(ok.canUnlockTournaments, isTrue);
    expect(
      canAccessOfficialTournaments(
        onboardingCompleted: true,
        profileStepsComplete: true,
      ),
      isTrue,
    );
  });

  test('whatsapp validation accepts 10-11 digits', () {
    expect(ProfileCompletionValidators.isValidWhatsApp('(62) 99999-9999'), isTrue);
    expect(ProfileCompletionValidators.isValidWhatsApp('123'), isFalse);
  });
}
