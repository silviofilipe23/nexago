import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/active_role_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena_contract/application/arena_contract_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_home/athlete_account_sheet.dart';
import 'package:nexago_app/features/athlete_billing/application/athlete_billing_providers.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';

Widget _harness({
  required bool multipleRoles,
  AthleteChargesSummary? billing = const AthleteChargesSummary(),
  bool hasContract = false,
}) {
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
        path: AppRoutes.athleteBilling,
        name: AppRouteNames.athleteBilling,
        builder: (_, __) => const Text('COBRANCAS'),
      ),
      GoRoute(
        path: AppRoutes.myArenaContract,
        name: AppRouteNames.myArenaContract,
        builder: (_, __) => const Text('MEU CONTRATO'),
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
      athleteChargesSummaryProvider.overrideWith((ref) => billing),
      hasArenaContractProvider
          .overrideWith((ref) => Stream.value(hasContract)),
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
      'athlete-account-billing',
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

  testWidgets('Cobranças abre a lista e diz o que está vencido', (
    tester,
  ) async {
    await tester.pumpWidget(
      _harness(
        multipleRoles: false,
        billing: const AthleteChargesSummary(
          total: 130,
          overdueCount: 1,
          overdueTotal: 30,
          dueCount: 1,
        ),
      ),
    );
    await _open(tester);

    expect(find.textContaining('1 vencida ·'), findsOneWidget);
    await tester.tap(find.byKey(const Key('athlete-account-billing')));
    await tester.pumpAndSettle();
    expect(find.text('COBRANCAS'), findsOneWidget);
  });

  testWidgets('sem contrato de mensalista: sem "Meu contrato"', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(multipleRoles: false));
    await _open(tester);

    expect(find.byKey(const Key('athlete-account-contract')), findsNothing);
    expect(find.text('Meu contrato'), findsNothing);
  });

  testWidgets('mensalista: "Meu contrato" logo abaixo de Cobranças e abre a '
      'tela', (tester) async {
    await tester.pumpWidget(_harness(multipleRoles: false, hasContract: true));
    await _open(tester);

    final row = find.byKey(const Key('athlete-account-contract'));
    expect(row, findsOneWidget);
    expect(find.text('Meu contrato'), findsOneWidget);
    expect(find.text('Plano, parcelas e banco de horas'), findsOneWidget);
    final billing =
        tester.getRect(find.byKey(const Key('athlete-account-billing')));
    final contract = tester.getRect(row);
    final settings =
        tester.getRect(find.byKey(const Key('athlete-account-settings')));
    expect(contract.top - billing.bottom, 12);
    expect(settings.top - contract.bottom, 12);

    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(find.text('MEU CONTRATO'), findsOneWidget);
    expect(row, findsNothing);
  });

  test('linha de apoio de Cobranças no menu', () {
    expect(
      athleteBillingMenuSubtitle(null),
      'Aulas, horário fixo, reservas e torneios',
    );
    expect(
      athleteBillingMenuSubtitle(const AthleteChargesSummary()),
      'Aulas, horário fixo, reservas e torneios',
    );
    expect(
      athleteBillingMenuSubtitle(
        const AthleteChargesSummary(total: 200, dueCount: 2),
      ),
      contains('em aberto'),
    );
    expect(
      athleteBillingMenuSubtitle(
        const AthleteChargesSummary(total: 90, overdueCount: 3),
      ),
      startsWith('3 vencidas · '),
    );
  });
}
