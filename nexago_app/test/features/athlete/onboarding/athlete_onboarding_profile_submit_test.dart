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
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_providers.dart';
import 'package:nexago_app/features/athlete/onboarding/presentation/steps/athlete_onboarding_profile_step.dart';
import 'package:nexago_app/features/auth/widgets/auth_form_widgets.dart';

/// "Concluir cadastro" é uma cadeia de rede (foto → papel → perfil). Em campo
/// o atleta ficava "processando" sem limite e, ao tentar de novo, a foto subia
/// outra vez. Estes testes cobrem o que a tela faz quando cada elo falha.
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
  _FakeProfileRepository({this.upload, this.save})
      : super(_NoopFirestore(), functions: _NoopFunctions());

  Future<String> Function(Duration? timeout)? upload;
  Future<void> Function()? save;
  int uploads = 0;
  int saves = 0;
  int roleGrants = 0;

  @override
  Future<void> grantAthleteRole({Duration? timeout}) async {
    roleGrants++;
  }

  @override
  Future<String> uploadAvatar({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    Duration? timeout,
  }) {
    uploads++;
    return upload?.call(timeout) ?? Future.value('https://cdn.test/avatar.jpg');
  }

  @override
  Future<void> saveProfile(AthleteProfile profile) {
    saves++;
    return save?.call() ?? Future<void>.value();
  }
}

/// PNG 1×1 transparente: o `CircleAvatar` da tela decodifica os bytes, e um
/// blob inválido viraria erro de imagem reportado no teste.
Uint8List _pngBytes() => Uint8List.fromList(const [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]);

class _Harness {
  _Harness(this.container, this.repo);
  final ProviderContainer container;
  final _FakeProfileRepository repo;
}

Future<_Harness> _pumpFilledProfileStep(
  WidgetTester tester, {
  required _FakeProfileRepository repo,
}) async {
  final user = MockUser(uid: 'u1', email: 'ana@nexago.test');
  final mockAuth = MockFirebaseAuth(signedIn: true, mockUser: user);
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const AthleteOnboardingProfileStep()),
      GoRoute(path: '/discover', builder: (_, __) => const Text('DESCOBRIR')),
    ],
  );
  final container = ProviderContainer(
    overrides: [
      firebaseAuthProvider.overrideWithValue(mockAuth),
      authProvider.overrideWith((ref) => Stream.value(user)),
      analyticsServiceProvider.overrideWithValue(_FakeAnalyticsService()),
      athleteProfileRepositoryProvider.overrideWithValue(repo),
      goRouterProvider.overrideWithValue(router),
    ],
  );
  addTearDown(container.dispose);
  await container.read(authProvider.future);

  // Rascunho válido ANTES do primeiro frame: a tela copia o rascunho para os
  // controllers no initState e os sincroniza de volta no submit.
  final draft = container.read(athleteOnboardingDraftProvider.notifier)
    ..setPrimarySport('beach_volleyball')
    ..setLevel('Iniciante 1')
    ..setName('Ana')
    ..setPhoneNumber('(62) 99999-8888')
    ..setBirthDate('01/01/2000')
    ..setGender('Feminino')
    ..setUf('GO')
    ..setCity('Goiânia')
    ..setAvatar(bytes: _pngBytes(), contentType: 'image/png');
  expect(container.read(athleteOnboardingDraftProvider).isProfileValid, isTrue);
  expect(draft, isNotNull);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  return _Harness(container, repo);
}

Future<void> _tapConcluir(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Concluir cadastro'));
  await tester.tap(find.text('Concluir cadastro'));
  await tester.pump();
}

bool _primaryEnabled(WidgetTester tester) {
  final button = tester.widget<AuthContinueButton>(
    find.byType(AuthContinueButton),
  );
  return !button.loading && button.onPressed != null;
}

void main() {
  testWidgets(
    'upload da foto que nunca responde: mostra o que está fazendo, respeita '
    'o tempo limite, explica e devolve o botão',
    (tester) async {
      final h = await _pumpFilledProfileStep(
        tester,
        repo: _FakeProfileRepository(
          // O notifier não passa `timeout`: o repositório aplica o padrão. O
          // fake imita o contrato (estoura TimeoutException no prazo).
          upload: (timeout) {
            final limit = timeout ?? kAvatarUploadTimeout;
            return Future<String>.delayed(
              limit,
              () => throw TimeoutException('upload', limit),
            );
          },
        ),
      );

      await _tapConcluir(tester);
      expect(_primaryEnabled(tester), isFalse);
      expect(find.text('Enviando foto…'), findsOneWidget);

      await tester.pump(kAvatarUploadTimeout + const Duration(seconds: 1));
      await tester.pump();

      expect(h.repo.uploads, 1);
      expect(h.repo.saves, 0);
      expect(find.text(kOnboardingPhotoUploadFailedMessage), findsOneWidget);
      expect(_primaryEnabled(tester), isTrue);
      expect(find.text('Enviando foto…'), findsNothing);
    },
  );

  testWidgets(
    'perfil falha por rede depois da foto: a próxima tentativa NÃO sobe a '
    'foto de novo e conclui',
    (tester) async {
      var attempt = 0;
      final h = await _pumpFilledProfileStep(
        tester,
        repo: _FakeProfileRepository(
          save: () async {
            attempt++;
            if (attempt == 1) {
              throw FirebaseFunctionsException(
                code: 'unavailable',
                message: 'A TLS error caused the secure connection to fail.',
              );
            }
          },
        ),
      );

      await _tapConcluir(tester);
      await tester.pump(const Duration(milliseconds: 50));

      expect(h.repo.uploads, 1);
      expect(h.repo.saves, 1);
      expect(find.text(kOnboardingSaveNetworkFailedMessage), findsOneWidget);
      expect(_primaryEnabled(tester), isTrue);

      await _tapConcluir(tester);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 400));

      expect(h.repo.uploads, 1, reason: 'a foto já tinha subido');
      expect(h.repo.saves, 2);
      expect(find.text('DESCOBRIR'), findsOneWidget);
    },
  );

  testWidgets(
    'trocar a foto depois de uma falha volta a subir a nova imagem',
    (tester) async {
      var attempt = 0;
      final h = await _pumpFilledProfileStep(
        tester,
        repo: _FakeProfileRepository(
          save: () async {
            attempt++;
            if (attempt == 1) throw TimeoutException('firestore');
          },
        ),
      );

      await _tapConcluir(tester);
      await tester.pump(const Duration(milliseconds: 50));
      expect(h.repo.uploads, 1);

      h.container.read(athleteOnboardingDraftProvider.notifier).setAvatar(
            bytes: _pngBytes(),
            contentType: 'image/png',
          );
      await tester.pump();

      await _tapConcluir(tester);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 400));

      expect(h.repo.uploads, 2);
      expect(h.repo.saves, 2);
      expect(find.text('DESCOBRIR'), findsOneWidget);
    },
  );
}
