import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import 'athlete_cancel_policy.dart';

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
    final deadline = bookingStart
        .subtract(const Duration(hours: freeCancellationHoursBeforeStart));
    return now.isBefore(deadline);
  }

  /// O atleta só cancela pelo app dentro do prazo grátis, com estorno integral
  /// feito pelo servidor (`cancelMyArenaBooking`). Depois dele não há retenção
  /// automática, então o botão desliga e o acerto é com a arena.
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

  /// Título da regra do prazo conforme a política da arena: "grátis" só
  /// quando o valor volta inteiro.
  static String cancellationTitle(
    AthleteCancelPolicy policy,
  ) =>
      policy == AthleteCancelPolicy.full
          ? freeCancellationTitle()
          : 'Cancelamento até ${freeCancellationHoursBeforeStart}h antes';

  /// O que acontece com o valor pago quando o atleta cancela no prazo.
  static String _policyOutcome(AthleteCancelPolicy policy, String name) {
    if (policy.credit) {
      return 'o valor pago vira crédito para usar em outra reserva na $name';
    }
    if (policy.partial) {
      return '${policy.refundPercent}% do valor pago volta pelo mesmo meio '
          '(Pix ou cartão); a $name fica com o resto';
    }
    return 'o valor pago pelo app volta inteiro, pelo mesmo meio (Pix ou '
        'cartão)';
  }

  static String _arenaLabel(String arenaName) =>
      arenaName.trim().isEmpty ? 'arena' : arenaName.trim();

  /// Linha de apoio da regra (card da reserva e confirmação da reserva):
  /// o que volta no prazo e que, depois dele, é com a arena.
  static String cancellationSubtitle(
    String arenaName,
    AthleteCancelPolicy policy,
  ) {
    final name = _arenaLabel(arenaName);
    final outcome = _policyOutcome(policy, name);
    return '${outcome[0].toUpperCase()}${outcome.substring(1)}. '
        'Depois disso, o cancelamento é combinado com a $name.';
  }

  /// Fim do prazo do cancelamento grátis.
  static DateTime freeCancellationDeadline(DateTime bookingStart) =>
      bookingStart
          .subtract(const Duration(hours: freeCancellationHoursBeforeStart));

  static final _deadlineDayFmt = DateFormat('EEE, dd/MM', 'pt_BR');
  static final _deadlineTimeFmt = DateFormat('HH:mm', 'pt_BR');

  /// "hoje às 13:00", "amanhã às 13:00" ou "ter, 25/11 às 13:00".
  static String deadlineLabel(DateTime deadline, DateTime now) {
    final time = _deadlineTimeFmt.format(deadline);
    final day = DateTime(deadline.year, deadline.month, deadline.day);
    final today = DateTime(now.year, now.month, now.day);
    final days = day.difference(today).inHours ~/ 24;
    if (days == 0) return 'hoje às $time';
    if (days == 1) return 'amanhã às $time';
    final weekday = _deadlineDayFmt.format(deadline).replaceAll('.', '');
    return '$weekday às $time';
  }

  /// Título da regra na tela de confirmar reserva: o prazo como data e hora,
  /// não "6h antes". Pagando na arena nada foi cobrado pelo app, então
  /// cancelar no prazo é grátis seja qual for a política; pagando pelo app,
  /// "grátis" só quando o valor volta inteiro.
  static String checkoutCancellationTitle({
    required DateTime bookingStart,
    required DateTime now,
    required AthleteCancelPolicy policy,
    required bool paysOnline,
  }) {
    if (!canCancelBookingForFree(bookingStart, now)) {
      return 'Sem cancelamento pelo app';
    }
    final label = deadlineLabel(freeCancellationDeadline(bookingStart), now);
    final free = !paysOnline || policy == AthleteCancelPolicy.full;
    return free ? 'Cancelamento grátis até $label' : 'Cancelamento até $label';
  }

  /// Linha de apoio na confirmação, conforme a forma de pagamento: o estorno
  /// só é assunto de quem paga pelo app.
  static String checkoutCancellationSubtitle(
    String arenaName,
    AthleteCancelPolicy policy, {
    required DateTime bookingStart,
    required DateTime now,
    required bool paysOnline,
  }) {
    final name = _arenaLabel(arenaName);
    if (!canCancelBookingForFree(bookingStart, now)) {
      return 'Falta menos de ${freeCancellationHoursBeforeStart}h para o '
          'horário: depois de confirmar, o cancelamento é combinado com a '
          '$name.';
    }
    if (!paysOnline) {
      return 'Cancele pelo app até lá. Depois disso, o cancelamento é '
          'combinado com a $name.';
    }
    return cancellationSubtitle(arenaName, policy);
  }

  /// Texto da confirmação antes de cancelar (só aparece dentro do prazo),
  /// pela política copiada na reserva.
  static String confirmCancellationMessage(
    String arenaName, {
    AthleteCancelPolicy policy = AthleteCancelPolicy.full,
  }) =>
      '${cancellationTitle(policy)} do horário: '
      '${_policyOutcome(policy, _arenaLabel(arenaName))}.';

  /// Aviso depois do cancelamento: o estorno feito pelo servidor ou o
  /// crédito que ficou na arena.
  static String canceledMessage(
    double refundedReais, {
    double creditedReais = 0,
  }) {
    if (creditedReais > 0) {
      return 'Reserva cancelada. ${formatBRL(creditedReais)} viraram crédito '
          'para a sua próxima reserva nesta arena.';
    }
    if (refundedReais <= 0) return 'Reserva cancelada.';
    return 'Reserva cancelada. Estorno de ${formatBRL(refundedReais)} a '
        'caminho: no Pix cai em instantes; no cartão, aparece na fatura.';
  }

  static String blockedCancellationMessage({String? arenaName}) {
    final name = arenaName?.trim() ?? '';
    final contact = name.isEmpty ? 'a arena' : name;
    return 'O cancelamento pelo app vai só até '
        '${freeCancellationHoursBeforeStart}h antes do horário. '
        'Para cancelar agora, fale com $contact.';
  }
}
