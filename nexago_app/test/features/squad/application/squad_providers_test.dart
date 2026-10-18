import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';

import '../squad_test_support.dart';

/// Container com a sessão [signedIn] e o [repo] no lugar das callables. A
/// flag pode vir do próprio repositório (`watchEnabled`) ou forçada.
ProviderContainer _container(
  FakeSquadRepository repo, {
  bool signedIn = true,
  bool? flag,
}) {
  final container = ProviderContainer(
    overrides: [
      firebaseAuthProvider.overrideWithValue(
        MockFirebaseAuth(
          signedIn: signedIn,
          mockUser: MockUser(uid: 'atleta-1'),
        ),
      ),
      squadRepositoryProvider.overrideWithValue(repo),
      if (flag != null)
        squadFlagProvider.overrideWith((ref) => Stream.value(flag)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Mantém [provider] vivo e deixa streams e futures assentarem.
Future<T> _settle<T>(
  ProviderContainer container,
  ProviderListenable<T> provider,
) async {
  container.listen(provider, (_, __) {});
  for (var i = 0; i < 5; i++) {
    await Future<void>.delayed(Duration.zero);
  }
  return container.read(provider);
}

void main() {
  group('squadFlagProvider', () {
    test(
      'deslogado: desligado sem ler appConfig (a rule exige sessão)',
      () async {
        final repo = FakeSquadRepository(enabled: true);
        final container = _container(repo, signedIn: false);

        final flag = await _settle(container, squadFlagProvider);

        expect(flag.valueOrNull, isFalse);
        expect(container.read(squadEnabledProvider), isFalse);
        expect(repo.watchEnabledCalls, 0);
      },
    );

    test('logado: segue appConfig/squad.enabled', () async {
      final on = _container(FakeSquadRepository(enabled: true));
      final off = _container(FakeSquadRepository(enabled: false));

      await _settle(on, squadFlagProvider);
      await _settle(off, squadFlagProvider);

      expect(await _settle(on, squadEnabledProvider), isTrue);
      expect(await _settle(off, squadEnabledProvider), isFalse);
    });
  });

  group('mySquadProvider', () {
    test('deslogado: MySquad.none sem chamar getMySquad', () async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      final container = _container(repo, signedIn: false);

      final squad = await _settle(container, mySquadProvider);

      expect(squad.valueOrNull?.member, isNull);
      expect(repo.fetchMySquadCalls, 0);
    });

    test('logado: uma chamada, lida por todas as telas', () async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      final container = _container(repo);

      await _settle(container, mySquadProvider);
      container.read(mySquadProvider);
      await _settle(container, mySquadProvider);

      expect(repo.fetchMySquadCalls, 1);
      expect(
        container.read(mySquadProvider).valueOrNull?.member?.code,
        'JOAO10',
      );
    });
  });

  group('squadEntryProvider (home e perfil)', () {
    test('flag desligada: nada, e a callable nem é chamada', () async {
      final repo = FakeSquadRepository(mySquad: memberSquad());
      final container = _container(repo, flag: false);

      final entry = await _settle(container, squadEntryProvider);

      expect(entry.member, isNull);
      expect(entry.invite, isNull);
      expect(repo.fetchMySquadCalls, 0);
    });

    test('flag ligada: o membro ou o convite', () async {
      final member = _container(
        FakeSquadRepository(mySquad: memberSquad()),
        flag: true,
      );
      final invite = _container(
        FakeSquadRepository(mySquad: inviteSquad()),
        flag: true,
      );

      expect(
        (await _settle(member, squadEntryProvider)).member?.code,
        'JOAO10',
      );
      expect((await _settle(invite, squadEntryProvider)).invite?.id, 'inv-1');
    });

    test('erro na callable: some (não ocupa espaço nem mostra erro)', () async {
      final repo = FakeSquadRepository(mySquadError: StateError('offline'));
      final container = _container(repo, flag: true);

      final entry = await _settle(container, squadEntryProvider);

      expect(repo.fetchMySquadCalls, 1);
      expect(entry.member, isNull);
      expect(entry.invite, isNull);
    });
  });

  group('squadInviteProvider', () {
    test('busca o convite pelo id da rota', () async {
      final repo = FakeSquadRepository();
      final container = _container(repo);

      final invite = await _settle(container, squadInviteProvider('inv-7'));

      expect(repo.viewInviteCalls, ['inv-7']);
      expect(invite.valueOrNull?.suggestedCode, 'JOAO10');
    });
  });

  test('MySquad.none é o vazio compartilhado', () {
    expect(MySquad.none.member, isNull);
    expect(MySquad.none.invite, isNull);
  });
}
