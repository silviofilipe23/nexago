import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_logic.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_settings_page.dart';
import 'package:nexago_app/features/athlete/domain/favorites_providers.dart';

/// Overrides das duas fontes-folha: nenhuma ida ao Firestore.
///
/// Copiado de `arena_shell_tabs_test.dart` (Task 7) — mesmo padrão, sem
/// importar do outro arquivo de teste.
List<Override> overridesForRole(ArenaStaffRole? role, {bool owner = false}) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [membership] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [membership]),
    ),
  ];
}

void main() {
  Future<void> pumpSettings(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          // Providers de dados da tela: fixados para o teste não ficar preso
          // em `loading` (sem Firestore fake neste app) — o que importa aqui
          // é o filtro por cargo, não o carregamento desses dados.
          managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
          arenaFollowersCountProvider('a1').overrideWith((ref) => Stream.value(0)),
          arenaSettingsTemplateProvider.overrideWith(
            (ref) async => ArenaSettingsScheduleState.initial(),
          ),
          arenaManagedCourtsProvider.overrideWith((ref) => Stream.value(const [])),
          managedArenaProductSummaryProvider.overrideWith(
            (ref) => const ArenaProductSummary(
              activeCount: 0,
              lowCount: 0,
              outCount: 0,
              inventoryValueCents: 0,
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ArenaSettingsPage()),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao nao ve Quadras, Relatorios, Plano nem Pagamentos',
      (tester) async {
    await pumpSettings(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Disponibilidade na agenda'), findsOneWidget);
    expect(find.text('Produtos e estoque'), findsOneWidget);
    expect(find.text('Quadras'), findsNothing);
    expect(find.text('Relatórios'), findsNothing);
    expect(find.text('Plano'), findsNothing);
    expect(find.text('Pagamentos'), findsNothing);
    expect(find.text('Equipe'), findsNothing);
  });

  testWidgets('manutencao ve Quadras e Produtos, sem agenda de escrita',
      (tester) async {
    await pumpSettings(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Quadras'), findsOneWidget);
    expect(find.text('Produtos e estoque'), findsOneWidget);
    expect(find.text('Disponibilidade na agenda'), findsNothing);
    expect(find.text('Pagamentos'), findsNothing);
  });

  testWidgets('dono ve tudo, inclusive Plano e Equipe', (tester) async {
    await pumpSettings(tester, overridesForRole(null, owner: true));
    for (final t in ['Quadras', 'Relatórios', 'Plano', 'Pagamentos', 'Equipe']) {
      expect(find.text(t), findsOneWidget);
    }
  });
}
