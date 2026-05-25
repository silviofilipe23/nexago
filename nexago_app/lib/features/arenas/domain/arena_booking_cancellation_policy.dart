/// Política padrão de cancelamento de reservas de arena no app do atleta.
class ArenaBookingCancellationPolicy {
  const ArenaBookingCancellationPolicy._();

  static const int freeCancellationHoursBeforeStart = 6;
  static const int lateCancellationRetentionPercent = 50;

  /// Cancelamento grátis permitido enquanto faltar mais de [freeCancellationHoursBeforeStart] horas.
  static bool canCancelBookingForFree(
    DateTime bookingStart,
    DateTime now,
  ) {
    final deadline =
        bookingStart.subtract(const Duration(hours: freeCancellationHoursBeforeStart));
    return now.isBefore(deadline);
  }

  static String freeCancellationTitle() =>
      'Cancelamento grátis até ${freeCancellationHoursBeforeStart}h antes';

  static String freeCancellationSubtitle(String arenaName) {
    final name = arenaName.trim().isEmpty ? 'a arena' : arenaName.trim();
    return 'Depois disso, a $name retém '
        '$lateCancellationRetentionPercent% do valor pago.';
  }

  static String blockedCancellationMessage({String? arenaName}) {
    final retention = lateCancellationRetentionPercent;
    if (arenaName != null && arenaName.trim().isNotEmpty) {
      return 'Cancelamento disponível apenas até '
          '${freeCancellationHoursBeforeStart}h antes do horário. '
          'Depois disso, ${arenaName.trim()} retém $retention% do valor pago.';
    }
    return 'Cancelamento disponível apenas até '
        '${freeCancellationHoursBeforeStart}h antes do horário. '
        'Depois disso, a arena retém $retention% do valor pago.';
  }
}
