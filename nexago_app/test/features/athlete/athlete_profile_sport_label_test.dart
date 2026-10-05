import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

void main() {
  test('todo rótulo de esporte do perfil resolve para um código do Firestore',
      () {
    for (final label in AthleteProfileOptions.sports) {
      final profile = AthleteProfile(
        id: 'u1',
        name: 'Atleta',
        sport: label,
        level: 'Iniciante 1',
        city: 'Goiânia',
      );
      final onboarding =
          profile.toFirestore()['sportOnboarding'] as Map<String, dynamic>;
      final levels = onboarding['levelsBySport'] as Map<String, dynamic>;
      expect(levels, isNotEmpty, reason: 'rótulo "$label" não virou código');
    }
  });

  test('Futevôlei vira FUTEVOLEI', () {
    final profile = AthleteProfile(
      id: 'u1',
      name: 'Atleta',
      sport: 'Futevôlei',
      level: 'Iniciante 1',
      city: 'Goiânia',
    );
    final onboarding =
        profile.toFirestore()['sportOnboarding'] as Map<String, dynamic>;
    final levels = onboarding['levelsBySport'] as Map<String, dynamic>;
    expect(levels.keys, contains('FUTEVOLEI'));
  });
}
