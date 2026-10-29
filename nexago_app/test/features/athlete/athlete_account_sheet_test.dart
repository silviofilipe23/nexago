import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_account_sheet.dart';

Widget _harness({required bool multipleRoles}) {
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Consumer(
          builder: (context, ref, _) => Scaffold(
            body: Center(
              child: TextButton(
                key: const Key('open'),
                onPressed: () =>
                    openAthleteAccountMenu(context, ref, origin: 'inicio'),
                child: const Text('avatar'),
              ),
            ),
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.athleteProfile,
        name: AppRouteNames.athleteProfile,
        builder: (_, __) => const Text('PERFIL'),
      ),
      GoRoute(
        path: AppRoutes.athleteSettings,
        name: AppRouteNames.athleteSettings,
        builder: (_, __) => const Text('AJUSTES'),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      hasMultipleMobileRolesProvider.overrideWithValue(multipleRoles),
    ],
    child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
  );
}

Future<void> _open(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('open')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('mostra perfil, configurações e trocar papel com 2+ papéis', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(multipleRoles: true));
    await _open(tester);

    expect(find.byKey(const Key('athlete-account-profile')), findsOneWidget);
    expect(find.byKey(const Key('athlete-account-settings')), findsOneWidget);
    expect(
      find.byKey(const Key('athlete-account-switch-role')),
      findsOneWidget,
    );
  });

  testWidgets('itens a 12 entre si (sem espaçador dobrado)', (tester) async {
    await tester.pumpWidget(_harness(multipleRoles: true));
    await _open(tester);

    final keys = [
      'athlete-account-profile',
      'athlete-account-settings',
      'athlete-account-switch-role',
    ];
    for (var i = 1; i < keys.length; i++) {
      final above = tester.getRect(find.byKey(Key(keys[i - 1])));
      final below = tester.getRect(find.byKey(Key(keys[i])));
      expect(below.top - above.bottom, 12, reason: keys[i]);
    }
  });

  testWidgets('esconde trocar papel com um papel só', (tester) async {
    await tester.pumpWidget(_harness(multipleRoles: false));
    await _open(tester);

    expect(find.byKey(const Key('athlete-account-switch-role')), findsNothing);
  });

  testWidgets('Meu perfil fecha a folha e abre o perfil', (tester) async {
    await tester.pumpWidget(_harness(multipleRoles: false));
    await _open(tester);
    await tester.tap(find.byKey(const Key('athlete-account-profile')));
    await tester.pumpAndSettle();

    expect(find.text('PERFIL'), findsOneWidget);
    expect(find.byKey(const Key('athlete-account-profile')), findsNothing);
  });

  testWidgets('Configurações abre os ajustes do atleta', (tester) async {
    await tester.pumpWidget(_harness(multipleRoles: false));
    await _open(tester);
    await tester.tap(find.byKey(const Key('athlete-account-settings')));
    await tester.pumpAndSettle();

    expect(find.text('AJUSTES'), findsOneWidget);
  });
}
