/// Reserva de balcão (gestor no app): modelos e regras puras.
///
/// Espelha o portal (`painel/bookings/manual-booking-form.ts`) e o servidor
/// (`functions/src/arena-manual-booking.ts`), que segue sendo a autoridade.
library;

/// Banco de horas do atleta escolhido (mensalista), devolvido por
/// `quoteArenaManualBooking` com `athleteId`. Ausente = não é mensalista ou a
/// arena não ligou o banco de horas.
class ArenaMemberHours {
  const ArenaMemberHours({
    required this.weeklyMinutes,
    required this.availableMinutes,
    required this.coverMinutes,
    required this.planName,
    required this.blocked,
  });

  final int weeklyMinutes;
  final int availableMinutes;

  /// Quanto desta reserva o banco cobre (0 se atrasado ou sem saldo).
  final int coverMinutes;
  final String planName;

  /// Mensalidade atrasada: paga a reserva até quitar.
  final bool blocked;

  bool get canCover => !blocked && coverMinutes > 0;

  static ArenaMemberHours? fromMap(Object? raw) {
    if (raw is! Map) return null;
    int minutes(String key) {
      final v = raw[key];
      return v is num ? v.round() : 0;
    }

    final plan = raw['planName'];
    return ArenaMemberHours(
      weeklyMinutes: minutes('weeklyMinutes'),
      availableMinutes: minutes('availableMinutes'),
      coverMinutes: minutes('coverMinutes'),
      planName: plan is String && plan.trim().isNotEmpty ? plan.trim() : 'Plano',
      blocked: raw['blocked'] == true,
    );
  }
}

/// Cotação: preço sugerido (quadra + promoções) e, com atleta, o banco dele.
class ArenaManualBookingQuote {
  const ArenaManualBookingQuote({this.amountReais, this.memberHours});

  final double? amountReais;
  final ArenaMemberHours? memberHours;

  factory ArenaManualBookingQuote.fromData(Object? data) {
    if (data is! Map) return const ArenaManualBookingQuote();
    final amount = data['amountReais'];
    return ArenaManualBookingQuote(
      amountReais: amount is num ? amount.toDouble() : null,
      memberHours: ArenaMemberHours.fromMap(data['memberHours']),
    );
  }
}

int? _minutesOf(String time) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(time.trim());
  if (m == null) return null;
  return int.parse(m.group(1)!) * 60 + int.parse(m.group(2)!);
}

/// O que sobra a cobrar depois do banco de horas (espelha
/// `manualAmountAfterMemberHours` no servidor). Fim 00:00 = meia-noite.
double amountAfterMemberHours(
  double amountReais,
  String startTime,
  String endTime,
  int coverMinutes,
) {
  final start = _minutesOf(startTime);
  var end = _minutesOf(endTime);
  if (start == null || end == null || coverMinutes <= 0) return amountReais;
  if (end == 0 && start > 0) end = 24 * 60;
  final total = end - start;
  if (total <= 0) return amountReais;
  final left = (total - coverMinutes).clamp(0, total);
  return (amountReais * left / total * 100).roundToDouble() / 100;
}

/// 45 → "45min"; 60 → "1h"; 90 → "1h30".
String formatMemberMinutes(int minutes) {
  final m = minutes < 0 ? 0 : minutes;
  final h = m ~/ 60;
  final rest = m % 60;
  if (h == 0) return '${rest}min';
  return rest == 0 ? '${h}h' : '${h}h${rest.toString().padLeft(2, '0')}';
}

/// "120", "120,50", "R$ 1.200,00", "1.200" → valor; vazio, negativo ou lixo →
/// `null`. Zero vale (cortesia), como no servidor. Sem vírgula, ponto seguido de
/// grupos de 3 dígitos é milhar ("1.200" = 1200), como no portal.
double? parseManualBookingAmount(String raw) {
  var t = raw.replaceAll(RegExp(r'[R$\s]'), '');
  if (t.isEmpty) return null;
  if (t.contains(',')) {
    t = t.replaceAll('.', '').replaceAll(',', '.');
  } else if (RegExp(r'\.\d{3}(\.\d{3})*$').hasMatch(t)) {
    t = t.replaceAll('.', '');
  }
  final value = double.tryParse(t);
  if (value == null || value.isNaN || value < 0) return null;
  return value;
}
