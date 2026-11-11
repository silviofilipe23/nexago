import 'dart:async';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/app_router.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/data/athlete_profile_repository.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/onboarding/data/account_photo_fetcher.dart';
import 'package:nexago_app/features/athlete/onboarding/data/twin_account_check_service.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_providers.dart';
import 'package:nexago_app/features/athlete/onboarding/presentation/steps/athlete_onboarding_profile_step.dart';

/// Cadastro parado no último passo: quem entra com Google já tem foto, mas o
/// onboarding exigia escolher outra e o atleta desistia no "Escolha uma foto
/// pra concluir". A foto da conta agora entra como ponto de partida.

const _googlePhoto =
    'https://lh3.googleusercontent.com/a/ACg8ocKabc123=s96-c';

/// PNG 1×1: o `CircleAvatar` decodifica os bytes de verdade.
Uint8List _pngBytes() => Uint8List.fromList(const [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]);

Uint8List _jpegBytes() =>
    Uint8List.fromList(const [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);

class _FakeAnalyticsService implements AnalyticsService {
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _NoopFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoopFunctions implements FirebaseFunctions {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeProfileRepository extends AthleteProfileRepository {
  _FakeProfileRepository() : super(_NoopFirestore(), functions: _NoopFunctions());

  final uploaded = <Uint8List>[];
  final uploadedTypes = <String>[];
  int saves = 0;

  @override
  Future<void> grantAthleteRole({Duration? timeout}) async {}

  @override
  Future<String> uploadAvatar({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    Duration? timeout,
  }) async {
    uploaded.add(bytes);
    uploadedTypes.add(contentType);
    return 'https://cdn.test/avatar.jpg';
  }

  @override
  Future<void> saveProfile(AthleteProfile profile) async => saves++;
}

class _FakeTwinCheck extends TwinAccountCheckService {
  @override
  Future<PhoneInOtherAccount?> findOtherAccount({
    required String phoneNumber,
    required String birthDate,
  }) async =>
      null;
}

ProviderContainer _container({
  String? photoUrl = _googlePhoto,
  required AccountPhotoFetcher fetcher,
}) {
  final user = MockUser(uid: 'u1', email: 'ana@nexago.test', photoURL: photoUrl);
  final container = ProviderContainer(
    overrides: [
      firebaseAuthProvider.overrideWithValue(
        MockFirebaseAuth(signedIn: true, mockUser: user),
      ),
      authProvider.overrideWith((ref) => Stream.value(user)),
      accountPhotoFetcherProvider.overrideWithValue(fetcher),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('accountPhotoUri', () {
    test('pede a foto do Google em 512 px em vez de 96', () {
      expect(
        accountPhotoUri(_googlePhoto).toString(),
        'https://lh3.googleusercontent.com/a/ACg8ocKabc123=s512-c',
      );
      expect(
        accountPhotoUri('https://lh3.googleusercontent.com/a/x=s96').toString(),
        'https://lh3.googleusercontent.com/a/x=s512-c',
      );
    });

    test('outra origem passa como veio; vazio ou sem https não serve', () {
      expect(
        accountPhotoUri('https://cdn.example.com/p.jpg').toString(),
        'https://cdn.example.com/p.jpg',
      );
      expect(accountPhotoUri(null), isNull);
      expect(accountPhotoUri('  '), isNull);
      expect(accountPhotoUri('http://lh3.googleusercontent.com/a/x=s96-c'), isNull);
    });
  });

  test('imageContentTypeOf reconhece JPEG e PNG pelos bytes', () {
    expect(imageContentTypeOf(_jpegBytes()), 'image/jpeg');
    expect(imageContentTypeOf(_pngBytes()), 'image/png');
    expect(imageContentTypeOf(Uint8List.fromList('<html>'.codeUnits)), isNull);
    expect(imageContentTypeOf(Uint8List(0)), isNull);
  });

  group('prefillAvatarFromAccount', () {
    test('foto do Google vira a foto do rascunho, marcada como da conta',
        () async {
      Uri? asked;
      final c = _container(fetcher: (uri) async {
        asked = uri;
        return _jpegBytes();
      });
      await c.read(authProvider.future);

      await c
          .read(athleteOnboardingDraftProvider.notifier)
          .prefillAvatarFromAccount();

      final draft = c.read(athleteOnboardingDraftProvider);
      expect(asked.toString(), endsWith('=s512-c'));
      expect(draft.avatarBytes, _jpegBytes());
      expect(draft.avatarContentType, 'image/jpeg');
      expect(draft.avatarFromAccount, isTrue);
      expect(draft.isPhotoValid, isTrue);
    });

    test('nunca troca a foto que o atleta já escolheu', () async {
      var calls = 0;
      final c = _container(fetcher: (_) async {
        calls++;
        return _jpegBytes();
      });
      await c.read(authProvider.future);
      final notifier = c.read(athleteOnboardingDraftProvider.notifier)
        ..setAvatar(bytes: _pngBytes(), contentType: 'image/png');

      await notifier.prefillAvatarFromAccount();

      expect(calls, 0);
      expect(c.read(athleteOnboardingDraftProvider).avatarContentType, 'image/png');
    });

    test('escolha feita durante o download vence a foto da conta', () async {
      final gate = Completer<Uint8List?>();
      final c = _container(fetcher: (_) => gate.future);
      await c.read(authProvider.future);
      final notifier = c.read(athleteOnboardingDraftProvider.notifier);

      final pending = notifier.prefillAvatarFromAccount();
      notifier.setAvatar(bytes: _pngBytes(), contentType: 'image/png');
      gate.complete(_jpegBytes());
      await pending;

      final draft = c.read(athleteOnboardingDraftProvider);
      expect(draft.avatarContentType, 'image/png');
      expect(draft.avatarFromAccount, isFalse);
    });

    test('download falho, vazio ou que não é imagem deixa o passo pedindo foto',
        () async {
      for (final fetcher in <AccountPhotoFetcher>[
        (_) async => null,
        (_) async => Uint8List(0),
        (_) async => Uint8List.fromList('<html>'.codeUnits),
        (_) async => throw Exception('rede'),
      ]) {
        final c = _container(fetcher: fetcher);
        await c.read(authProvider.future);
        await c
            .read(athleteOnboardingDraftProvider.notifier)
            .prefillAvatarFromAccount();
        expect(c.read(athleteOnboardingDraftProvider).isPhotoValid, isFalse);
      }
    });

    test('conta sem foto (e-mail e senha) nem tenta baixar', () async {
      var calls = 0;
      // `MockUser` inventa uma foto quando `photoURL` é nulo; vazio é "sem foto".
      final c = _container(
        photoUrl: '',
        fetcher: (_) async {
          calls++;
          return _jpegBytes();
        },
      );
      await c.read(authProvider.future);
      await c
          .read(athleteOnboardingDraftProvider.notifier)
          .prefillAvatarFromAccount();
      expect(calls, 0);
      expect(c.read(athleteOnboardingDraftProvider).isPhotoValid, isFalse);
    });

    test('trocar a foto tira a marca de "da conta"', () async {
      final c = _container(fetcher: (_) async => _jpegBytes());
      await c.read(authProvider.future);
      final notifier = c.read(athleteOnboardingDraftProvider.notifier);
      await notifier.prefillAvatarFromAccount();
      notifier.setAvatar(bytes: _pngBytes(), contentType: 'image/png');
      expect(c.read(athleteOnboardingDraftProvider).avatarFromAccount, isFalse);
      notifier.clearAvatar();
      expect(c.read(athleteOnboardingDraftProvider).avatarFromAccount, isFalse);
    });
  });

  testWidgets(
    'passo Perfil básico: chega com a foto do Google, avisa de onde ela veio '
    'e o "Concluir" sobe essa foto pro Storage',
    (tester) async {
      final repo = _FakeProfileRepository();
      final user = MockUser(uid: 'u1', email: 'ana@nexago.test', photoURL: _googlePhoto);
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(path: '/', builder: (_, __) => const AthleteOnboardingProfileStep()),
          GoRoute(path: '/discover', builder: (_, __) => const Text('DESCOBRIR')),
        ],
      );
      final container = ProviderContainer(
        overrides: [
          firebaseAuthProvider.overrideWithValue(
            MockFirebaseAuth(signedIn: true, mockUser: user),
          ),
          authProvider.overrideWith((ref) => Stream.value(user)),
          analyticsServiceProvider.overrideWithValue(_FakeAnalyticsService()),
          athleteProfileRepositoryProvider.overrideWithValue(repo),
          goRouterProvider.overrideWithValue(router),
          twinAccountCheckServiceProvider.overrideWithValue(_FakeTwinCheck()),
          appSignOutProvider.overrideWithValue(() async {}),
          accountPhotoFetcherProvider.overrideWithValue((_) async => _pngBytes()),
        ],
      );
      addTearDown(container.dispose);
      await container.read(authProvider.future);

      // Tudo preenchido MENOS a foto: é o caso da atleta que parou no passo.
      container.read(athleteOnboardingDraftProvider.notifier)
        ..setPrimarySport('beach_volleyball')
        ..setLevel('Iniciante 1')
        ..setName('Ana')
        ..setPhoneNumber('(62) 99999-8888')
        ..setBirthDate('01/01/2000')
        ..setGender('Feminino')
        ..setUf('GO')
        ..setCity('Goiânia');
      expect(container.read(athleteOnboardingDraftProvider).isPhotoValid, isFalse);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
        ),
      );
      await tester.pump();
      await tester.pump();

      expect(find.text('Foto da sua conta Google · pode trocar'), findsOneWidget);
      expect(find.text('Trocar'), findsOneWidget);
      expect(container.read(athleteOnboardingDraftProvider).isProfileValid, isTrue);

      await tester.ensureVisible(find.text('Concluir cadastro'));
      await tester.tap(find.text('Concluir cadastro'));
      await tester.pumpAndSettle();

      expect(repo.uploaded, hasLength(1));
      expect(repo.uploaded.single, _pngBytes());
      expect(repo.uploadedTypes.single, 'image/png');
      expect(repo.saves, 1);
    },
  );
}
