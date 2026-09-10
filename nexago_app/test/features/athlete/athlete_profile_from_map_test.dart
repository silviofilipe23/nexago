import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';

void main() {
  test('fromMap lê id e campos sem depender de snapshot', () {
    final profile = AthleteProfile.fromMap('uid-1', {
      'fullName': 'João Silva',
      'nickname': 'jo',
      'city': 'Goiânia',
      'state': 'GO',
    });

    expect(profile.id, 'uid-1');
    expect(profile.name, 'João Silva');
    expect(profile.nickname, 'jo');
    expect(profile.city, 'Goiânia');
    expect(profile.state, 'GO');
  });
}
