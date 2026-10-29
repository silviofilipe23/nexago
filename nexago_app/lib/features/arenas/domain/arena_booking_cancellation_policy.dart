/// O que "Cancelar reserva" pode fazer agora no app do atleta. Regra única
/// de Minhas reservas e de Detalhes da reserva (aberto pela Agenda).
enum AthleteBookingCancellation {
  /// Ainda no prazo grátis: o atleta cancela pelo app, depois de confirmar.
  allowed,

  /// A reserva não começou, mas o prazo grátis acabou: o botão fica
  /// desligado e o cancelamento é combinado com a arena.
  deadlinePassed,

  /// Nada a cancelar pelo app: a reserva já não vale, já começou, é de
  /// horário fixo (gerida pela arena) ou é de outro atleta.
  unavailable,
}

/// Política padrão de cancelamento de reservas de arena no app do atleta.
class ArenaBookingCancellationPolicy {
  const ArenaBookingCancellationPolicy._();

  static const int freeCancellationHoursBeforeStart = 6;
  static const int lateCancellationRetentionPercent = 50;

  /// Reserva que já não vale: cancelada, PIX expirado ou recusada.
  static const Set<String> _voidStatuses = {
    'canceled',
    'cancelled',
    'expired',
    'rejected',
  };

  /// Cancelamento grátis permitido enquanto faltar mais de [freeCancellationHoursBeforeStart] horas.
  static bool canCancelBookingForFree(
    DateTime bookingStart,
    DateTime now,
  ) {
    final deadline =
        bookingStart.subtract(const Duration(hours: freeCancellationHoursBeforeStart));
    return now.isBefore(deadline);
  }

  /// O atleta só cancela pelo app dentro do prazo grátis. Depois dele não há
  /// retenção automática (o app não estorna nada), então o botão desliga.
  static AthleteBookingCancellation athleteCancellation({
    required DateTime? bookingStart,
    required DateTime now,
    required String rawStatus,
    bool isRecurring = false,
    bool isGuest = false,

    /// A arena liberou o horário por chuva e o atleta ainda não escolheu:
    /// cancelar pelo caminho comum faria ele perder a opção de crédito.
    bool weatherChoicePending = false,
  }) {
    if (bookingStart == null ||
        isRecurring ||
        isGuest ||
        weatherChoicePending ||
        _voidStatuses.contains(rawStatus.trim().toLowerCase()) ||
        !now.isBefore(bookingStart)) {
      return AthleteBookingCancellation.unavailable;
    }
    return canCancelBookingForFree(bookingStart, now)
        ? AthleteBookingCancellation.allowed
        : AthleteBookingCancellation.deadlinePassed;
  }

  static String freeCancellationTitle() =>
      'Cancelamento grátis até ${freeCancellationHoursBeforeStart}h antes';

  static String freeCancellationSubtitle(String arenaName) {
    final name = arenaName.trim().isEmpty ? 'a arena' : arenaName.trim();
    return 'Depois disso, a $name retém '
        '$lateCancellationRetentionPercent% do valor pago.';
  }

  /// Texto da confirmação antes de cancelar: a política, sem prometer
  /// estorno (o app só marca a reserva como cancelada).
  static String confirmCancellationMessage(String arenaName) =>
      '${freeCancellationTitle()} do horário. '
      '${freeCancellationSubtitle(arenaName)}';

  static String blockedCancellationMessage({String? arenaName}) {
    final retention = lateCancellationRetentionPercent;
    final name = arenaName?.trim() ?? '';
    final contact = name.isEmpty ? 'a arena' : name;
    return 'O cancelamento pelo app vai só até '
        '${freeCancellationHoursBeforeStart}h antes do horário. '
        'Para cancelar agora, fale com $contact: depois do prazo, '
        'a arena retém $retention% do valor pago.';
  }
}
