import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_navigation.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_success_args.dart';

void main() {
  Future<({Object? extra, Map<String, String> query})> navegar(
    WidgetTester tester, {
    String? paymentId,
  }) async {
    Object? extra;
    var query = <String, String>{};
    final router = GoRouter(
      initialLocation: '/inicio',
      routes: [
        GoRoute(
          path: '/inicio',
          builder: (_, _) => Consumer(
            builder: (context, ref, _) => TextButton(
              onPressed: () => navigateToTournamentRegistrationSuccess(
                context,
                ref: ref,
                tournamentId: 't1',
                registrationId: 'r1',
                tournamentName: 'Copa',
                categoryName: 'Dupla Masculina',
                paymentId: paymentId,
              ),
              child: const Text('ir'),
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.tournamentRegistrationSuccess,
          name: AppRouteNames.tournamentRegistrationSuccess,
          builder: (_, state) {
            extra = state.extra;
            query = state.uri.queryParameters;
            return const Text('sucesso');
          },
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        // Sem sessão: o "já vistas" vira memória pura (não lê preferências).
        overrides: [authProvider.overrideWith((ref) => Stream.value(null))],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('ir'));
    await tester.pumpAndSettle();
    return (extra: extra, query: query);
  }

  testWidgets('o paymentId do PIX segue na extra e na query', (tester) async {
    final result = await navegar(tester, paymentId: 'pay_9');

    expect(
      (result.extra! as TournamentRegistrationSuccessArgs).paymentId,
      'pay_9',
    );
    expect(result.query['paymentId'], 'pay_9');
  });

  testWidgets('sem pagamento nesta sessão: nada de paymentId', (tester) async {
    final result = await navegar(tester);

    expect(
      (result.extra! as TournamentRegistrationSuccessArgs).paymentId,
      isNull,
    );
    expect(result.query.containsKey('paymentId'), isFalse);
  });
}
