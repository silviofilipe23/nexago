import 'dart:async';

import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';

AthleteProfile _profile({String? primary, String? bio}) => AthleteProfile(
  id: 'u1',
  name: 'Atleta',
  sport: '',
  level: '',
  city: 'Goiânia',
  primarySportFirestoreId: primary,
  bio: bio,
);

void main() {
  late StreamController<AthleteProfile?> profiles;
  late ProviderContainer container;

  setUp(() {
    profiles = StreamController<AthleteProfile?>();
    container = ProviderContainer(
      overrides: [
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
        athleteProfileProvider.overrideWith((ref) => profiles.stream),
      ],
    );
    addTearDown(container.dispose);
    addTearDown(profiles.close);
  });

  test('abre no esporte principal; escolha manual vence', () async {
    final sub = container.listen(rankingSportProvider, (_, __) {});
    addTearDown(sub.close);
    profiles.add(_profile(primary: 'FUTEVOLEI'));
    expect(await container.read(rankingSportProvider.future), 'FUTEVOLEI');

    container.read(rankingPageFilterProvider.notifier).state = container
        .read(rankingPageFilterProvider)
        .copyWith(sport: () => 'BEACH_TENNIS');
    expect(await container.read(rankingSportProvider.future), 'BEACH_TENNIS');
  });

  test(
    'mudança no perfil que não é o esporte principal não recarrega',
    () async {
      var builds = 0;
      final sub = container.listen(rankingSportProvider, (_, next) {
        if (next is AsyncData) builds++;
      });
      addTearDown(sub.close);

      profiles.add(_profile(primary: 'FUTEVOLEI'));
      await container.read(rankingSportProvider.future);
      await Future<void>.delayed(Duration.zero);
      final before = builds;

      profiles.add(_profile(primary: 'FUTEVOLEI', bio: 'nova bio'));
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(container.read(rankingSportProvider).isLoading, isFalse);
      expect(builds, before);
    },
  );
}
