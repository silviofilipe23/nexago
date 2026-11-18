import 'package:flutter/foundation.dart';

import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';
import 'arena_now.dart';

/// Progresso do mês corrente rumo à meta de faturamento.
@immutable
class ArenaMonthGoalProgress {
  const ArenaMonthGoalProgress({
    required this.goalReais,
    required this.realizedReais,
    required this.bookedAheadReais,
    required this.projectionReais,
    required this.month,
    required this.dayOfMonth,
    required this.daysInMonth,
  });

  /// Primeiro dia do mês medido.
  final DateTime month;

  /// Meta do mês; `null` quando o dono ainda não definiu.
  final double? goalReais;

  /// Reservas do dia 1 até hoje (o dia de hoje inteiro).
  final double realizedReais;

  /// Reservas já marcadas de amanhã até o fim do mês.
  final double bookedAheadReais;

  /// Onde o mês fecha mantendo o ritmo dos dias que já passaram — nunca
  /// abaixo do que já está reservado.
  final double projectionReais;

  final int dayOfMonth;
  final int daysInMonth;

  bool get hasGoal => (goalReais ?? 0) > 0;

  /// Fração da meta já feita (0–1, pode passar de 1).
  double get realizedFraction => hasGoal ? realizedReais / goalReais! : 0;

  /// Fração da meta que a projeção alcança.
  double get projectedFraction => hasGoal ? projectionReais / goalReais! : 0;

  /// A projeção alcança a meta?
  bool get onTrack => hasGoal && projectionReais >= goalReais!;

  /// Quanto falta por dia, nos dias que restam, para bater a meta.
  double? get neededPerDay {
    if (!hasGoal) return null;
    final remainingDays = daysInMonth - dayOfMonth;
    final missing = goalReais! - realizedReais - bookedAheadReais;
    if (missing <= 0) return 0;
    if (remainingDays <= 0) return null;
    return missing / remainingDays;
  }
}

/// Monta o progresso do mês de [today]. Função pura.
///
/// A janela de reservas do gestor olha 30 dias para trás, o que sempre cobre
/// o dia 1 do mês corrente (o mês tem no máximo 31 dias).
ArenaMonthGoalProgress buildArenaMonthGoalProgress({
  required List<ArenaManagerBooking> bookings,
  required DateTime today,
  required double? goalReais,
}) {
  final day = arenaDateOnly(today);
  final daysInMonth = DateTime(day.year, day.month + 1, 0).day;
  final firstKey = arenaDateKey(DateTime(day.year, day.month, 1));
  final todayKey = arenaDateKey(day);
  final lastKey = arenaDateKey(DateTime(day.year, day.month, daysInMonth));

  final active = bookings.where(arenaNowBookingIsActive);
  final realized = arenaRevenueReais(
    active.where(
      (b) =>
          b.dateKey.compareTo(firstKey) >= 0 &&
          b.dateKey.compareTo(todayKey) <= 0,
    ),
  );
  final ahead = arenaRevenueReais(
    active.where(
      (b) =>
          b.dateKey.compareTo(todayKey) > 0 &&
          b.dateKey.compareTo(lastKey) <= 0,
    ),
  );

  final pace = realized / day.day;
  final remaining = daysInMonth - day.day;
  final byPace = realized + pace * remaining;
  final booked = realized + ahead;

  return ArenaMonthGoalProgress(
    goalReais: goalReais,
    realizedReais: realized,
    bookedAheadReais: ahead,
    projectionReais: byPace > booked ? byPace : booked,
    month: DateTime(day.year, day.month),
    dayOfMonth: day.day,
    daysInMonth: daysInMonth,
  );
}

/// Teto da meta, igual ao da regra do Firestore (R$ 10 milhões/mês).
const double arenaMonthGoalMaxReais = 10000000;

/// Lê a meta digitada em reais inteiros ("38.000", "R$ 38000", "38000,00").
/// Devolve `null` quando vazia, zero ou acima de [arenaMonthGoalMaxReais].
double? parseArenaGoalInput(String raw) {
  var text = raw.trim();
  // Centavos digitados com vírgula ficam de fora: a meta é em reais inteiros.
  final comma = text.indexOf(',');
  if (comma >= 0) text = text.substring(0, comma);
  final digits = text.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty || digits.length > 9) return null;
  final value = double.parse(digits);
  if (value <= 0 || value > arenaMonthGoalMaxReais) return null;
  return value;
}
