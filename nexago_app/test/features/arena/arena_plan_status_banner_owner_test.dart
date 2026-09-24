// Finding 3 (revisão final RBAC equipe/arena): `ArenaPlanStatusBanner`
// (Painel) navegava para `/arena/settings/plan` ao tocar, rota que
// `isArenaOwnerOnlyPath` bloqueia — membro tocava e o guard devolvia ao
// Painel sem explicação. O banner também aparece em `canceling`/`overdue`
// dentro da carência (`entitled: true`), estados em que o membro está
// trabalhando normalmente — não é só "plano vencido, fora de escopo".
//
// Escolha: esconder o banner inteiro para quem não é dono, em vez de manter
// o aviso sem `onTap`. Mesmo motivo do menu de Ajustes, que já esconde
// "Plano" de quem não é dono (`arena_settings_page.dart`) — status de
// cobrança da assinatura é assunto do titular, e um aviso sem ação nenhuma é
// pior do que não aparecer.
//
// Copiado o padrão `overridesForRole` de `arena_dashboard_money_test.dart`
// (Task 9), sem importar do outro arquivo de teste.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/domain/arena_plan_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/plan/widgets/arena_plan_status_banner.dart';

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
  // `overdue` dentro da carência: `entitled: true` — a arena continua
  // trabalhando normalmente, exatamente o estado em que o achado da revisão
  // insiste para não tratarmos isto como "fora de escopo".
  final overdueWithinGrace = ArenaPlanStatus(
    tier: ArenaPlanTier.pro,
    status: 'overdue',
    activeUntil: DateTime.now().subtract(const Duration(days: 1)),
  );

  Future<void> pumpBanner(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...overrides,
          managedArenaPlanStatusProvider.overrideWith(
            (ref) => Stream.value(overdueWithinGrace),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(body: ArenaPlanStatusBanner()),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout (regra do módulo,
    // mesmo este widget nao tendo o indicador).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('dono ve o banner de plano em atraso', (tester) async {
    await pumpBanner(tester, overridesForRole(null, owner: true));
    expect(find.text('Pagamento em atraso'), findsOneWidget);
  });

  testWidgets('gestor nao ve o banner de plano', (tester) async {
    await pumpBanner(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.text('Pagamento em atraso'), findsNothing);
    expect(find.byType(ArenaPlanStatusBanner), findsOneWidget);
  });
}
