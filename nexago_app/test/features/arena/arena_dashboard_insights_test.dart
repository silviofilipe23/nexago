import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/data/arena_dashboard_insights.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_summary.dart';

/// Fix round 1 da Task 9: a linha "Melhor dia" é a única de
/// `ArenaDashboardInsights.lines()` que declara um valor de faturamento
/// (`Soma R$ ...`) — quem não lê a área `financeiro` não pode recebê-la.
/// As outras duas linhas (baixa ocupação / ótimo desempenho) não expõem
/// número de dinheiro nenhum e continuam para todos, com ou sem
/// `includeMoney`.
void main() {
  final summaryComMelhorDia = ArenaDashboardSummary(
    bookingsToday: 0,
    availableSlots: 0,
    activeCourts: 0,
    revenueToday: 0,
    occupancyRatePercent: 80,
    peakHour: null,
    futureBookings: 0,
    revenueLast7Days: const <double>[0, 0, 0, 0, 0, 0, 0],
    chartDayLabels: const ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
    todaySlotsTotal: 0,
    bestWeekdayLabel: 'Sábado',
    bestWeekdayRevenue: 1200,
  );

  test(
    'includeMoney: false — nenhuma linha contém R\$, mesmo com melhor dia com receita',
    () {
      final lines = ArenaDashboardInsights.lines(
        summaryComMelhorDia,
        includeMoney: false,
      );
      expect(lines.any((l) => l.message.contains(r'R$')), isFalse);
    },
  );

  test(
    'includeMoney: true — a linha "Melhor dia" aparece com a soma em R\$',
    () {
      final lines = ArenaDashboardInsights.lines(
        summaryComMelhorDia,
        includeMoney: true,
      );
      expect(
        lines.any(
          (l) => l.message.contains('Melhor dia') && l.message.contains(r'R$'),
        ),
        isTrue,
      );
    },
  );
}
