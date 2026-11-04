import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart'
    show FirebaseAuthException, IdTokenResult;
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/auth/auth_service.dart';
import 'package:nexago_app/core/auth/post_login_destination.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/auth/domain/post_login_bootstrap.dart';
import 'package:nexago_app/features/auth/presentation/auth_loading_page.dart';

/// Renovar o token (rede) falha ou nunca responde; o token em cache segue ok.
// MockUser é @immutable só no papel (tem campos mutáveis internos).
// ignore: must_be_immutable
class _OfflineRefreshUser extends MockUser {
  _OfflineRefreshUser({required this.hangs})
      : super(uid: 'u1', email: 'ana@nexago.test');

  final bool hangs;

  @override
  Future<IdTokenResult> getIdTokenResult([bool forceRefresh = false]) {
    if (!forceRefresh) return super.getIdTokenResult(false);
    if (hangs) return Completer<IdTokenResult>().future;
    return Future.error(
      FirebaseAuthException(code: 'network-request-failed'),
    );
  }
}

Future<ProviderContainer> _container(
  List<Override> overrides, {
  MockUser? user,
}) async {
  final auth = MockFirebaseAuth(signedIn: true, mockUser: user ?? MockUser());
  final container = ProviderContainer(
    overrides: [
      firebaseAuthProvider.overrideWithValue(auth),
      authServiceProvider.overrideWith((ref) => AuthService(auth)),
      ...overrides,
    ],
  );
  await container.read(authProvider.future);
  return container;
}

Future<void> _pumpLoading(WidgetTester tester, ProviderContainer container) {
  final router = GoRouter(
    initialLocation: AppRoutes.authLoading,
    routes: [
      GoRoute(
        path: AppRoutes.authLoading,
        builder: (_, __) => const AuthLoadingPage(),
      ),
      GoRoute(
        path: AppRoutes.discover,
        builder: (_, __) => const Text('home'),
      ),
    ],
  );
  return tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
}

/// A tela tem animações contínuas: avança o relógio em vez de `pumpAndSettle`.
Future<void> _advance(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 100);
  for (var t = Duration.zero; t < total; t += step) {
    await tester.pump(step);
  }
}

/// O texto de status gira com `Future.delayed`: desmonta e drena o timer.
Future<void> _unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(seconds: 2));
}

Future<PostLoginBootstrapResult> _bootstrapOk({
  PostLoginBootstrapProgress? onProgress,
}) async =>
    const PostLoginBootstrapResult(success: true);

void main() {
  group('AuthLoadingPage', () {
    testWidgets(
      'erro ao escolher o destino mostra "Tentar novamente" em vez de travar',
      (tester) async {
        var calls = 0;
        final container = await _container([
          runPostLoginBootstrapProvider.overrideWithValue(_bootstrapOk),
          resolvePostLoginDestinationProvider.overrideWithValue(() async {
            calls++;
            if (calls == 1) throw StateError('rede caiu');
            return AppRoutes.discover;
          }),
        ]);
        addTearDown(container.dispose);

        await _pumpLoading(tester, container);
        await _advance(tester, const Duration(seconds: 1));

        expect(find.text('Tentar novamente'), findsOneWidget);

        await tester.tap(find.text('Tentar novamente'));
        await _advance(tester, const Duration(seconds: 1));

        expect(calls, 2);
        expect(find.text('home'), findsOneWidget);
        await _unmount(tester);
      },
    );

    testWidgets(
      'destino que nunca responde vira o painel de recuperação',
      (tester) async {
        final container = await _container([
          runPostLoginBootstrapProvider.overrideWithValue(_bootstrapOk),
          resolvePostLoginDestinationProvider.overrideWithValue(
            () => Completer<String>().future,
          ),
        ]);
        addTearDown(container.dispose);

        await _pumpLoading(tester, container);
        await _advance(tester, const Duration(seconds: 5));
        expect(find.text('Tentar novamente'), findsNothing);

        await _advance(tester, const Duration(seconds: 20));
        expect(find.text('Tentar novamente'), findsOneWidget);
        await _unmount(tester);
      },
    );
  });

  group('resolvePostLoginDestination', () {
    testWidgets('renovação do token falhando usa o token em cache',
        (tester) async {
      final container = await _container(
        const [],
        user: _OfflineRefreshUser(hangs: false),
      );
      addTearDown(container.dispose);

      final destination =
          await container.read(resolvePostLoginDestinationProvider)();

      expect(destination, AppRoutes.discover);
    });

    testWidgets('renovação do token sem resposta cai no cache após o teto',
        (tester) async {
      final container = await _container(
        const [],
        user: _OfflineRefreshUser(hangs: true),
      );
      addTearDown(container.dispose);

      String? destination;
      unawaited(container
          .read(resolvePostLoginDestinationProvider)()
          .then((d) => destination = d));

      await tester.pump(kPostLoginTokenRefreshTimeout ~/ 2);
      expect(destination, isNull);

      await tester.pump(kPostLoginTokenRefreshTimeout);
      expect(destination, AppRoutes.discover);
    });
  });
}
