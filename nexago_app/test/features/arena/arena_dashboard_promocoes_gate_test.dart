// Finding 2 (revisão final RBAC equipe/arena): o botão "Promoções" do card
// de Seguidores (`arena_dashboard_followers_card.dart`) abre
// `ArenaPromotionsSheet`, que cria, pausa/ativa e exclui promoção — escrita
// de `promocoes` (`firestore.rules:1109-1116`). O card mora no Painel, rota
// sem área que todo cargo alcança, e `recepcao`/`manutencao` não escrevem
// `promocoes` (só `gestor` e `financeiro` escrevem).
//
// Copiado o padrão `overridesForRole` de `arena_dashboard_money_test.dart`
// (Task 9), sem importar do outro arquivo de teste.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_followers_card.dart';
import 'package:nexago_app/features/athlete/domain/favorites_providers.dart';

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
  const insights = ArenaFollowersInsights(
    totalFollowers: 10,
    growthLastWeek: 1,
    qualityBookedPercent: 0,
    activeRecentlyPercent: 0,
  );

  Future<void> pumpFollowersCard(
    WidgetTester tester,
    List<Override> overrides,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(
            body: ArenaDashboardFollowersCard(
              insightsAsync: AsyncValue<ArenaFollowersInsights>.data(insights),
              arenaId: 'a1',
            ),
          ),
        ),
      ),
    );
    // Sem pumpAndSettle: telas do painel tem indicador "AO VIVO" cuja
    // animacao nunca assenta e trava o teste no timeout (mesma regra
    // documentada nos outros arquivos de teste de arena, mesmo este card não
    // tendo o indicador — mantém o padrão do módulo).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('manutencao nao ve o botao de Promocoes', (tester) async {
    await pumpFollowersCard(
        tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.text('Promoções'), findsNothing);
    // "Criar torneio" nao depende de `promocoes`; continua visivel.
    expect(find.text('Criar torneio'), findsOneWidget);
  });

  testWidgets('recepcao nao ve o botao de Promocoes', (tester) async {
    await pumpFollowersCard(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.text('Promoções'), findsNothing);
  });

  testWidgets('financeiro ve o botao de Promocoes (escreve a area)',
      (tester) async {
    await pumpFollowersCard(
        tester, overridesForRole(ArenaStaffRole.financeiro));
    expect(find.text('Promoções'), findsOneWidget);
  });

  testWidgets('gestor ve o botao de Promocoes', (tester) async {
    await pumpFollowersCard(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.text('Promoções'), findsOneWidget);
  });

  testWidgets('dono ve o botao de Promocoes', (tester) async {
    await pumpFollowersCard(tester, overridesForRole(null, owner: true));
    expect(find.text('Promoções'), findsOneWidget);
  });
}
