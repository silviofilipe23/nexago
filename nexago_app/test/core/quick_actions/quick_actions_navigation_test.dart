import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/deep_link/deep_link_providers.dart';
import 'package:nexago_app/core/quick_actions/athlete_quick_actions_logic.dart';
import 'package:nexago_app/core/quick_actions/quick_actions_channel.dart';
import 'package:nexago_app/core/quick_actions/quick_actions_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_shell_providers.dart';
import 'package:nexago_app/features/auth/domain/post_login_bootstrap.dart';

final _now = DateTime(2026, 11, 20, 10);

/// Mesmo redirect do app: carregando não decide; resolvido sem usuário, cai
/// no login. É o caso que engolia o destino do push no cold start.
GoRouter _buildRouter(ProviderContainer container, Listenable refresh) {
  Widget stub(String label) => Scaffold(body: Text(label));
  return GoRouter(
    initialLocation: AppRoutes.discover,
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = container.read(authProvider);
      if (auth.isLoading) return null;
      if (auth.valueOrNull == null && state.uri.path != AppRoutes.login) {
        return AppRoutes.login;
      }
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.discover, builder: (_, __) => stub('descobrir')),
      GoRoute(path: AppRoutes.login, builder: (_, __) => stub('login')),
      GoRoute(
        path: AppRoutes.authLoading,
        builder: (_, __) => stub('carregando'),
      ),
      GoRoute(
        path: AppRoutes.bookingDetailsById,
        builder: (_, __) => stub('reserva'),
      ),
    ],
  );
}

String _location(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.toString();

class _AuthRefresh extends ChangeNotifier {
  void bump() => notifyListeners();
}

Future<(WidgetRef, GoRouter)> _pumpApp(
  WidgetTester tester, {
  required Stream<User?> authStream,
}) async {
  final container = ProviderContainer(
    overrides: [authProvider.overrideWith((ref) => authStream)],
  );
  addTearDown(container.dispose);

  final refresh = _AuthRefresh();
  addTearDown(refresh.dispose);
  container.listen<AsyncValue<User?>>(
    authProvider,
    (_, __) => refresh.bump(),
    fireImmediately: true,
  );

  final router = _buildRouter(container, refresh);
  addTearDown(router.dispose);

  late WidgetRef capturedRef;
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: Consumer(
        builder: (context, ref, _) {
          capturedRef = ref;
          return MaterialApp.router(routerConfig: router);
        },
      ),
    ),
  );
  return (capturedRef, router);
}

Stream<User?> _sessionRestoredLater(User? user) => Stream<User?>.fromFuture(
      Future<User?>.delayed(const Duration(milliseconds: 120), () => user),
    );

Future<void> _tap(
  WidgetTester tester,
  WidgetRef ref,
  GoRouter router,
  QuickActionTap tap,
) async {
  final navigation = navigateFromQuickAction(
    tap,
    router,
    ref: ref,
    clock: () => _now,
  );
  await tester.pump(const Duration(milliseconds: 200));
  await navigation;
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('cold start com sessão: a reserva abre o detalhe', (
    tester,
  ) async {
    final (ref, router) = await _pumpApp(
      tester,
      authStream: _sessionRestoredLater(MockUser(uid: 'atleta-1')),
    );

    await _tap(
      tester,
      ref,
      router,
      QuickActionTap(
        type: AthleteQuickAction.booking.type,
        payload: {
          quickActionBookingIdKey: 'bk-1',
          quickActionValidUntilKey: _now
              .add(const Duration(hours: 3))
              .millisecondsSinceEpoch
              .toString(),
        },
      ),
    );

    expect(_location(router), '/booking/bk-1/details');
    expect(ref.read(pendingDeepLinkPathProvider), isNull);
  });

  testWidgets('aba do atleta: troca a aba da casca e abre o discover', (
    tester,
  ) async {
    final (ref, router) = await _pumpApp(
      tester,
      authStream: Stream<User?>.value(MockUser(uid: 'atleta-1')),
    );

    await _tap(
      tester,
      ref,
      router,
      QuickActionTap(type: AthleteQuickAction.reservar.type),
    );

    expect(_location(router), '/discover?tab=reservar');
    expect(
      ref.read(athleteShellTabIndexProvider),
      athleteShellReservarTabIndex,
    );
  });

  testWidgets('sessão expirada: guarda o destino e vai para o login', (
    tester,
  ) async {
    final (ref, router) = await _pumpApp(
      tester,
      authStream: _sessionRestoredLater(null),
    );

    await _tap(
      tester,
      ref,
      router,
      QuickActionTap(type: AthleteQuickAction.reservar.type),
    );

    expect(_location(router), AppRoutes.login);
    expect(ref.read(pendingDeepLinkPathProvider), '/discover?tab=reservar');
  });

  testWidgets('login recém-feito: guarda o destino para depois do loading', (
    tester,
  ) async {
    final (ref, router) = await _pumpApp(
      tester,
      authStream: Stream<User?>.value(MockUser(uid: 'atleta-1')),
    );
    await tester.pump();
    ref.read(sessionBootstrapProvider.notifier).reset();

    await _tap(
      tester,
      ref,
      router,
      QuickActionTap(type: AthleteQuickAction.reservar.type),
    );

    expect(_location(router), AppRoutes.authLoading);
    expect(ref.read(pendingDeepLinkPathProvider), '/discover?tab=reservar');
  });

  testWidgets('tipo desconhecido não navega', (tester) async {
    final (ref, router) = await _pumpApp(
      tester,
      authStream: Stream<User?>.value(MockUser(uid: 'atleta-1')),
    );

    await _tap(
      tester,
      ref,
      router,
      const QuickActionTap(type: 'outro.app.acao'),
    );

    expect(_location(router), AppRoutes.discover);
  });
}
