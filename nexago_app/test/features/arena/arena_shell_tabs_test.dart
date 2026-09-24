import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_shell_page.dart';

/// Overrides das duas fontes-folha: nenhuma ida ao Firestore.
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
  Future<void> pumpShell(WidgetTester tester, List<Override> overrides) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          // `flutter_test` forca `debugDefaultTargetPlatformOverride` para
          // Android, e a NexaBottomNavBar fica sempre minimizada (sem
          // rotulos) nessa plataforma por design (ver
          // `nexa_bottom_nav_bar_inset_test.dart`). Sem fixar iOS aqui os
          // `find.text` abaixo nunca encontram nada.
          theme: AppTheme.dark.copyWith(platform: TargetPlatform.iOS),
          // O shell real precisa do StatefulNavigationShell do go_router; aqui
          // exercitamos so a barra, montando a pagina com um shell de teste.
          home: Scaffold(
            bottomNavigationBar: ArenaShellTabBar(
              currentBranchIndex: 0,
              onSelectBranch: (_) {},
            ),
          ),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja animacao
    // nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve a aba Comandas', (tester) async {
    await pumpShell(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('AGENDA'), findsOneWidget);
    expect(find.text('COMANDAS'), findsNothing);
  });

  testWidgets('financeiro nao ve Agenda nem Reservas', (tester) async {
    await pumpShell(tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('COMANDAS'), findsOneWidget);
    expect(find.text('AGENDA'), findsNothing);
    expect(find.text('RESERVAS'), findsNothing);
  });

  testWidgets('dono ve as cinco', (tester) async {
    await pumpShell(tester, overridesForRole(null, owner: true));
    for (final label in ['PAINEL', 'AGENDA', 'COMANDAS', 'RESERVAS', 'AJUSTES']) {
      expect(find.text(label), findsOneWidget);
    }
  });
}
