import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart'
    show FirebaseAuthException, UserCredential;
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/auth/role_preferences_repository.dart';
import 'package:nexago_app/core/biometric/biometric_app_gate.dart';
import 'package:nexago_app/core/observability/analytics_service.dart';
import 'package:nexago_app/core/router/app_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Reprodução do fluxo REAL de cadastro por e-mail/senha, com a árvore de
/// produção: `BiometricAppGate` fora do `MaterialApp.router` e o router de
/// verdade — porque o bug relatado (tela "pisca" e nada acontece, mas a conta
/// nasce no Firebase) só existe na interação entre os três.
///
/// Cada teste imita uma intercalação possível do dispositivo entre três
/// eventos que correm em paralelo após `createUserWithEmailAndPassword`:
///  - `authStateChanges` emite o usuário (o gate troca a raiz da árvore);
///  - o snapshot de `users/{uid}` responde (não existe / erro de permissão);
///  - `sendEmailVerification` conclui e o `_submit` retoma.
class _FakeAnalyticsService implements AnalyticsService {
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Latência de rede no envio do e-mail de verificação: mantém o `_submit`
/// suspenso enquanto o estado de auth (e a árvore de widgets) muda.
class _DelayedAuthService extends AuthService {
  _DelayedAuthService(super.auth);

  @override
  Future<void> sendEmailVerification() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    await super.sendEmailVerification();
  }
}

/// Como [_DelayedAuthService], mas o envio do e-mail de verificação FALHA —
/// o soluço pós-criação mais provável num dispositivo real (rede de celular,
/// too-many-requests). A conta já existe; o atleta não pode ficar preso.
class _FailingVerificationAuthService extends AuthService {
  _FailingVerificationAuthService(super.auth);

  @override
  Future<void> sendEmailVerification() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    throw FirebaseAuthException(code: 'network-request-failed');
  }
}

/// Assinatura do bug histórico do firebase_auth no Android (PigeonUserDetails):
/// a conta É criada e a sessão fica ativa, mas a chamada lança exceção.
class _CreateThrowsAfterSigningInAuthService extends AuthService {
  _CreateThrowsAfterSigningInAuthService(this._mock) : super(_mock);

  final MockFirebaseAuth _mock;

  @override
  Future<UserCredential> registerWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    await _mock.createUserWithEmailAndPassword(
      email: email,
      password: password,
    );
    throw StateError('erro de parsing do SDK pós-criação');
  }
}

class _Harness {
  _Harness(this.mockAuth, this.profile, this.container);

  final MockFirebaseAuth mockAuth;
  final StreamController<AthleteProfile?> profile;
  final ProviderContainer container;
}

Future<_Harness> _pumpFilledRegisterForm(
  WidgetTester tester, {
  AuthService Function(MockFirebaseAuth auth)? authService,
}) async {
  SharedPreferences.setMockInitialValues({});
  final rolePrefs = await RolePreferencesRepository.create();
  final mockAuth = MockFirebaseAuth();
  final profile = StreamController<AthleteProfile?>();
  addTearDown(profile.close);

  final container = ProviderContainer(
    overrides: [
      firebaseAuthProvider.overrideWithValue(mockAuth),
      authServiceProvider.overrideWith(
        (ref) => authService != null
            ? authService(mockAuth)
            : _DelayedAuthService(mockAuth),
      ),
      athleteProfileProvider.overrideWith((ref) => profile.stream),
      analyticsServiceProvider.overrideWithValue(_FakeAnalyticsService()),
      rolePreferencesRepositoryProvider.overrideWithValue(rolePrefs),
    ],
  );
  addTearDown(container.dispose);

  // Resolve o estado inicial (deslogado) antes do primeiro frame para o
  // redirect não construir o shell logado em `/descobrir`.
  await container.read(authProvider.future);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: Consumer(
        builder: (context, ref, _) {
          return BiometricAppGate(
            child: MaterialApp.router(
              theme: AppTheme.light,
              routerConfig: ref.watch(goRouterProvider),
            ),
          );
        },
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));

  container.read(goRouterProvider).go(AppRoutes.register);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  expect(find.text('Criar conta.'), findsOneWidget);

  // Escopado à página: a transição pode manter a LoginPage viva por
  // alguns frames e os finders globais ficariam ambíguos.
  final page = find.byWidgetPredicate(
    (w) => w.runtimeType.toString() == 'RegisterPage',
  );
  final fields = find.descendant(of: page, matching: find.byType(TextField));
  expect(fields, findsNWidgets(3));
  await tester.enterText(fields.at(0), 'atleta.novo@nexago.test');
  await tester.enterText(fields.at(1), 'SenhaForte1!');
  await tester.enterText(fields.at(2), 'SenhaForte1!');
  final checkbox = find.descendant(of: page, matching: find.byType(Checkbox));
  await tester.ensureVisible(checkbox);
  await tester.tap(checkbox);
  await tester.pump();

  final submitButton = find.descendant(
    of: page,
    matching: find.widgetWithText(FilledButton, 'Criar conta'),
  );
  await tester.ensureVisible(submitButton);
  await tester.tap(submitButton);

  // createUser resolve nos microtasks; o próximo frame já vê o usuário
  // logado e o BiometricAppGate troca a raiz (child → barreira branca).
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));

  return _Harness(mockAuth, profile, container);
}

void _expectSuccessScreen(WidgetTester tester, _Harness h) {
  // A conta nasceu no Firebase — como visto no console.
  expect(h.mockAuth.currentUser, isNotNull);

  // O que o atleta DEVERIA ver: a tela de sucesso do cadastro.
  expect(
    find.text('Conta criada!'),
    findsOneWidget,
    reason: 'após criar a conta, a tela de sucesso deve aparecer — '
        'se falhou, o fluxo foi engolido no meio (bug da "piscada")',
  );
}

void main() {
  testWidgets(
    'cadastro chega ao sucesso quando o perfil resolve ANTES do e-mail '
    'de verificação',
    (tester) async {
      final h = await _pumpFilledRegisterForm(tester);

      // Firestore responde: `users/{uid}` não existe → gate volta ao child.
      h.profile.add(null);
      await tester.pump(const Duration(milliseconds: 100));

      // `sendEmailVerification` conclui e o `_submit` retoma.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      _expectSuccessScreen(tester, h);
    },
  );

  testWidgets(
    'cadastro chega ao sucesso quando o perfil só resolve DEPOIS do '
    'e-mail de verificação (navegação sob a barreira do gate)',
    (tester) async {
      final h = await _pumpFilledRegisterForm(tester);

      // `sendEmailVerification` conclui com o gate ainda em loading: o
      // `context.go` para o sucesso acontece por baixo da barreira branca.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      // Só então o Firestore responde e o gate troca a raiz de volta.
      h.profile.add(null);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));

      _expectSuccessScreen(tester, h);
    },
  );

  testWidgets(
    'cadastro chega ao sucesso quando a leitura do perfil FALHA '
    '(ex.: permission-denied nas rules)',
    (tester) async {
      final h = await _pumpFilledRegisterForm(tester);

      h.profile.addError(Exception('permission-denied'));
      await tester.pump(const Duration(milliseconds: 100));

      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      _expectSuccessScreen(tester, h);
    },
  );

  testWidgets(
    'conta criada + e-mail de verificação FALHOU: o atleta ainda chega '
    'na tela de sucesso (a conta existe; nada pós-criação pode prendê-lo)',
    (tester) async {
      final h = await _pumpFilledRegisterForm(
        tester,
        authService: _FailingVerificationAuthService.new,
      );

      h.profile.add(null);
      await tester.pump(const Duration(milliseconds: 100));

      // A exceção do sendEmailVerification estoura aqui.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      _expectSuccessScreen(tester, h);
    },
  );

  testWidgets(
    'SDK lança exceção DEPOIS de criar e logar (bug histórico do Android): '
    'a conta existe, então o atleta chega na tela de sucesso',
    (tester) async {
      final h = await _pumpFilledRegisterForm(
        tester,
        authService: _CreateThrowsAfterSigningInAuthService.new,
      );

      h.profile.add(null);
      await tester.pump(const Duration(milliseconds: 100));

      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));

      _expectSuccessScreen(tester, h);
    },
  );
}
