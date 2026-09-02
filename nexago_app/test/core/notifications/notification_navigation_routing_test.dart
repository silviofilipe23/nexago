import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/deep_link/deep_link_providers.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Payload real do push de convite de dupla (`sendTournamentPartnerInvite`).
const _partnerInvitePayload = <String, dynamic>{
  'type': 'tournament_partner_invite',
  'inviteId': 'inv-9',
  'tournamentId': 't1',
  'categoryId': 'masc-a',
};

const _invitePath = '/torneios-convite/inv-9';

/// Router mínimo, mas com o mesmo redirect do app: enquanto o auth carrega
/// nada é decidido; resolvido sem usuário, tudo cai no login. É esse redirect
/// que engolia o destino da notificação.
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
        path: AppRoutes.tournamentPartnerInvite,
        builder: (_, __) => stub('convite'),
      ),
    ],
  );
}

String _location(GoRouter router) {
  return router.routerDelegate.currentConfiguration.uri.toString();
}

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

void main() {
  testWidgets(
    'cold start com sessão: o toque abre a tela de convite de dupla',
    (tester) async {
      // A sessão só é restaurada depois do toque — é o cold start real.
      final (ref, router) = await _pumpApp(
        tester,
        authStream: Stream<User?>.fromFuture(
          Future<User?>.delayed(
            const Duration(milliseconds: 120),
            () => MockUser(uid: 'atleta-1'),
          ),
        ),
      );

      final navigation = navigateFromNotificationData(
        _partnerInvitePayload,
        router,
        ref: ref,
      );
      await tester.pump(const Duration(milliseconds: 200));
      await navigation;
      await tester.pumpAndSettle();

      expect(_location(router), _invitePath);
      expect(ref.read(pendingDeepLinkPathProvider), isNull);
    },
  );

  testWidgets(
    'cold start sem sessão: o convite fica pendente e o atleta vai ao login',
    (tester) async {
      // Sessão expirada: o auth ainda carrega no instante do toque e só
      // depois resolve sem usuário. Navegar direto mandava para o login sem
      // guardar nada — o atleta caía na home e o convite sumia.
      final (ref, router) = await _pumpApp(
        tester,
        authStream: Stream<User?>.fromFuture(
          Future<User?>.delayed(const Duration(milliseconds: 120), () => null),
        ),
      );

      final navigation = navigateFromNotificationData(
        _partnerInvitePayload,
        router,
        ref: ref,
      );
      await tester.pump(const Duration(milliseconds: 200));
      await navigation;
      await tester.pumpAndSettle();

      expect(_location(router), AppRoutes.login);
      // Consumido pelo router em `leavingAuthRoute`, logo após o login.
      expect(ref.read(pendingDeepLinkPathProvider), _invitePath);
    },
  );

  testWidgets('payload sem rota conhecida não navega', (tester) async {
    final (ref, router) = await _pumpApp(
      tester,
      authStream: Stream<User?>.value(MockUser(uid: 'atleta-1')),
    );

    final navigation = navigateFromNotificationData(
      const {'type': 'tipo_desconhecido'},
      router,
      ref: ref,
    );
    await tester.pump();
    await navigation;
    await tester.pumpAndSettle();

    expect(_location(router), AppRoutes.discover);
    expect(ref.read(pendingDeepLinkPathProvider), isNull);
  });
}
