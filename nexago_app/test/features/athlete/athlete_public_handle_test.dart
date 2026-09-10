import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

void main() {
  test('sem apelido não inventa handle', () {
    final profile = AthleteProfile.fromMap('u1', {'fullName': 'João Silva'});
    expect(athletePublicHandle(profile), isNull);
  });

  test('com apelido devolve @apelido em minúsculas', () {
    final profile = AthleteProfile.fromMap('u1', {
      'fullName': 'Ana Paula',
      'nickname': 'AnaP',
    });
    expect(athletePublicHandle(profile), '@anap');
  });

  test('apelido já com @ não duplica o prefixo', () {
    final profile = AthleteProfile.fromMap('u1', {
      'fullName': 'Ana Paula',
      'nickname': '@anap',
    });
    expect(athletePublicHandle(profile), '@anap');
  });
}
