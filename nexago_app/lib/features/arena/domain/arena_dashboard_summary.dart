import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import 'arena_date_utils.dart';

/// Agregado do painel da arena (streams → [ArenaDashboardService.summarize]).
@immutable
class ArenaDashboardSummary {
  const ArenaDashboardSummary({
    required this.bookingsToday,
    required this.availableSlots,
    required this.activeCourts,
    required this.revenueToday,
    required this.occupancyRatePercent,
    required this.peakHour,
    required this.futureBookings,
    required this.revenueLast7Days,
    required this.chartDayLabels,
    required this.todaySlotsTotal,
    required this.bestWeekdayLabel,
    required this.bestWeekdayRevenue,
  }) : assert(revenueLast7Days.length == 7),
       assert(chartDayLabels.length == 7);

  final int bookingsToday;
  final int availableSlots;
  final int activeCourts;

  /// Soma de valores (hoje) considerando reservas válidas para faturamento.
  final double revenueToday;

  /// Ocupação do dia: reservados / total de slots exibidos na grade (0–100).
  final double occupancyRatePercent;

  /// Hora de início (0–23) com mais reservas hoje.
  final int? peakHour;

  /// Reservas com data civil após hoje (não canceladas).
  final int futureBookings;

  /// Faturamento por dia civil, **do mais antigo ao mais recente** (7 posições; último = hoje).
  final List<double> revenueLast7Days;

  /// Rótulos curtos para o eixo X do gráfico (alinhados a [revenueLast7Days]).
  final List<String> chartDayLabels;

  /// Total de slots na grade do dia (para insights de ocupação).
  final int todaySlotsTotal;

  /// Dia da semana com maior faturamento histórico na amostra (pt-BR), ou null.
  final String? bestWeekdayLabel;

  /// Faturamento agregado nesse melhor dia da semana (amostra atual).
  final double bestWeekdayRevenue;

  /// Estado vazio / sem arena: gráfico zerado com eixo coerente.
  factory ArenaDashboardSummary.placeholder() {
    final today = arenaTodayDateOnly();
    final labels = List.generate(7, (i) {
      final d = today.subtract(Duration(days: 6 - i));
      return DateFormat.E('pt_BR').format(d);
    });
    return ArenaDashboardSummary(
      bookingsToday: 0,
      availableSlots: 0,
      activeCourts: 0,
      revenueToday: 0,
      occupancyRatePercent: 0,
      peakHour: null,
      futureBookings: 0,
      revenueLast7Days: List<double>.filled(7, 0),
      chartDayLabels: labels,
      todaySlotsTotal: 0,
      bestWeekdayLabel: null,
      bestWeekdayRevenue: 0,
    );
  }
}
