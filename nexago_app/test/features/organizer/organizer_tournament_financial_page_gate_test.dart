import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/tournament_staff_models.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/organizer_tournament_financial_page.dart';

/// `/organizer/tournaments/:id/financial` carrega o maior número do app: a
/// arrecadação, a taxa e o repasse líquido do evento inteiro. A entrada para
/// esta tela é escondida de quem não é dono, mas a ROTA fica sob
/// `/organizer/tournaments/...`, que `isOrganizerStaffOperablePath` abre para
/// staff — link direto ou push entregava o número ao administrador do evento.
/// Esconder o atalho não é fronteira; a verificação de papel é.
const _tournamentId = 't1';

const _summary = OrganizerTournamentSummary(
  tournamentId: _tournamentId,
  name: 'Etapa Aurora',
  enrolledCount: 12,
  pendingCount: 2,
  categoryCount: 2,
  paymentsBreakdown: OrganizerPaymentsBreakdown(
    viaAppCents: 36000,
    expectedCents: 96000,
    paidCount: 3,
    totalSlots: 8,
  ),
);

const _detail = OrganizerTournamentDetailState(
  tournament: <String, dynamic>{'managerId': 'dono'},
  summary: _summary,
  isLoading: false,
);

Future<void> abrirTela(
  WidgetTester tester, {
  required TournamentStaffRole? role,
  bool isOwner = false,
  bool roleLoaded = true,
}) async {
  final espelho = StreamController<List<MyTournamentStaffEntry>>();
  addTearDown(espelho.close);
  if (roleLoaded) espelho.add(const []);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        organizerTournamentDetailProvider(_tournamentId)
            .overrideWith((ref) => Stream.value(_detail)),
        isOrganizerTournamentOwnerProvider(_tournamentId)
            .overrideWithValue(isOwner),
        myTournamentStaffEntriesProvider.overrideWith((ref) => espelho.stream),
        myStaffRoleForTournamentProvider(_tournamentId).overrideWithValue(role),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const OrganizerTournamentFinancialPage(
          tournamentId: _tournamentId,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('administrador do evento recebe a tela de acesso negado',
      (tester) async {
    await abrirTela(tester, role: TournamentStaffRole.eventAdmin);

    expect(find.byType(AppEmptyView), findsOneWidget);
    expect(
      find.text('O caixa é de quem responde pelo dinheiro'),
      findsOneWidget,
    );
    expect(find.textContaining('Repasse líquido'), findsNothing);
    // Nenhum número de dinheiro do evento sobra na tela.
    expect(find.textContaining(r'R$'), findsNothing);
  });

  testWidgets('gestor da equipe continua vendo o financeiro do evento',
      (tester) async {
    await abrirTela(tester, role: TournamentStaffRole.manager);

    expect(find.textContaining('Repasse líquido'), findsOneWidget);
    expect(find.byType(AppEmptyView), findsNothing);
  });

  testWidgets('dono do evento continua vendo o financeiro do evento',
      (tester) async {
    await abrirTela(tester, role: null, isOwner: true);

    expect(find.textContaining('Repasse líquido'), findsOneWidget);
    expect(find.byType(AppEmptyView), findsNothing);
  });

  testWidgets('papel ainda carregando e sem ser dono não abre o financeiro',
      (tester) async {
    // Primeiros frames de um link direto: o espelho de staff não emitiu
    // ainda. Antes desta rodada, papel desconhecido valia como "pode ver".
    await abrirTela(tester, role: null, roleLoaded: false);

    expect(find.byType(AppEmptyView), findsOneWidget);
    expect(find.textContaining('Repasse líquido'), findsNothing);
  });
}
