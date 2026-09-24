import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/data/review_reply_service.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period_metrics.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_summary.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/review_reply_providers.dart';
import 'package:nexago_app/features/arena/presentation/arena_dashboard_page.dart';

/// Overrides das duas fontes-folha: nenhuma ida ao Firestore.
///
/// Copiado de `arena_shell_tabs_test.dart` (Task 7) / `arena_settings_access_test.dart`
/// (Task 8) — mesmo padrão, sem importar do outro arquivo de teste.
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

/// Fake mínimo de [FirebaseFirestore]: nenhum método é chamado nos testes
/// abaixo, ele só existe para `reviewReplyServiceProvider` poder ser
/// sobrescrito sem tocar Firestore de verdade — a seção de reputação do
/// Painel monta um `ReviewReplyService` incondicionalmente.
class _FakeFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Resumo fixo. `bestWeekdayLabel`/`bestWeekdayRevenue` são propositalmente
/// não-zero (fix round 1 da Task 9): um valor zerado escondia o vazamento de
/// dinheiro pela linha "Melhor dia" de `ArenaDashboardInsights.lines()` — a
/// única das três linhas de insight que declara uma soma em R$. Os outros
/// gatilhos (baixa ocupação, ótimo desempenho) continuam zerados porque as
/// mensagens deles não expõem valor nenhum e não fazem parte do que este
/// arquivo testa.
final _summary = ArenaDashboardSummary(
  bookingsToday: 0,
  availableSlots: 0,
  activeCourts: 0,
  revenueToday: 0,
  occupancyRatePercent: 50,
  peakHour: 19,
  futureBookings: 0,
  revenueLast7Days: <double>[0, 0, 0, 0, 0, 0, 0],
  chartDayLabels: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
  todaySlotsTotal: 0,
  bestWeekdayLabel: 'Sábado',
  bestWeekdayRevenue: 400,
);

const _metrics = ArenaDashboardPeriodMetrics(
  period: ArenaDashboardPeriod.today,
  revenue: 250,
  bookingsCount: 3,
  occupancyRatePercent: 50,
  peakHour: 19,
  revenueBadge: null,
  occupancyBadge: null,
  bookingsBadge: null,
  peakBadge: null,
  chartTotal7Days: 250,
  chartTrendPercent: null,
);

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  Future<void> pumpDashboard(
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
          arenaDashboardSummaryProvider.overrideWith(
            (ref) => Stream.value(_summary),
          ),
          arenaDashboardPeriodMetricsProvider.overrideWith(
            (ref) => const AsyncValue<ArenaDashboardPeriodMetrics>.data(
              _metrics,
            ),
          ),
          reviewReplyServiceProvider.overrideWith(
            (ref) => ReviewReplyService(_FakeFirestore()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const ArenaDashboardPage(),
        ),
      ),
    );
    // Sem pumpAndSettle: o Painel tem indicador "AO VIVO" cuja animação
    // nunca assenta e trava o teste no timeout.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('recepcao nao ve faturamento no Painel', (tester) async {
    await pumpDashboard(tester, overridesForRole(ArenaStaffRole.recepcao));
    expect(find.textContaining('R\$'), findsNothing);
  });

  testWidgets('gestor ve faturamento', (tester) async {
    await pumpDashboard(tester, overridesForRole(ArenaStaffRole.gestor));
    expect(find.textContaining('R\$'), findsWidgets);
  });

  testWidgets('manutencao nao ve o atalho de abrir comanda', (tester) async {
    await pumpDashboard(tester, overridesForRole(ArenaStaffRole.manutencao));
    expect(find.textContaining('comanda'), findsNothing);
    expect(find.textContaining('Bloquear'), findsNothing);
  });
}
