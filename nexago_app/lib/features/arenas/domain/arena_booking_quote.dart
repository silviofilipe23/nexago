import '../../../core/formatting/app_currency_format.dart';

/// Linha de preço retornada por `quoteArenaBooking`.
class ArenaBookingQuoteLine {
  const ArenaBookingQuoteLine({
    required this.startTime,
    required this.endTime,
    required this.finalSlotPriceReais,
    required this.baseSlotPriceReais,
  });

  final String startTime;
  final String endTime;
  final double finalSlotPriceReais;
  final double baseSlotPriceReais;
}

/// Cotação autoritativa do servidor para a confirmação.
class ArenaBookingQuote {
  const ArenaBookingQuote({
    required this.amountReais,
    required this.lineItems,
    this.couponApplied = false,
    this.couponId,
    this.couponDiscountReais = 0,
    this.professorDiscountPercent = 0,
    this.professorDiscountReais = 0,
  });

  final double amountReais;
  final List<ArenaBookingQuoteLine> lineItems;

  /// `true` quando o código digitado foi aplicado (mais vantajoso que a
  /// promoção automática já em vigor na quadra). Igual ao web
  /// (`ArenaBookingQuote.couponApplied`).
  final bool couponApplied;
  final String? couponId;
  final double couponDiscountReais;

  /// Desconto do professor no aluguel (`asProfessor`) — 0 quando não se
  /// aplicou (sem vínculo, sem desconto ou promoção/cupom mais barato). Não
  /// soma com promoção nem cupom: incide sobre o preço cheio.
  final int professorDiscountPercent;
  final double professorDiscountReais;

  bool get hasProfessorDiscount =>
      professorDiscountPercent > 0 && professorDiscountReais > 0;

  /// Preço cheio antes do desconto do professor (total + desconto).
  double get amountBeforeProfessorDiscountReais =>
      ((amountReais + professorDiscountReais) * 100).roundToDouble() / 100;

  /// "Desconto de professor (20%)" — `null` sem desconto.
  String? get professorDiscountLabel => hasProfessorDiscount
      ? 'Desconto de professor ($professorDiscountPercent%)'
      : null;

  /// "−R$ 20,00" — `null` sem desconto.
  String? get professorDiscountValueLabel => hasProfessorDiscount
      ? '\u2212${formatBRL(professorDiscountReais)}'
      : null;

  /// Preço horário médio (soma dos slots ÷ horas cobradas).
  double? get impliedHourlyRateReais {
    if (lineItems.isEmpty) return null;
    var slotMinutes = 0;
    var total = 0.0;
    for (final line in lineItems) {
      final start = _minutes(line.startTime);
      var end = _minutes(line.endTime);
      if (start == null || end == null) continue;
      if (end <= start) end += 24 * 60;
      final mins = end - start;
      if (mins <= 0) continue;
      slotMinutes += mins;
      total += line.finalSlotPriceReais;
    }
    if (slotMinutes <= 0) return null;
    return ((total / (slotMinutes / 60)) * 100).roundToDouble() / 100;
  }

  String? get pricingSummary {
    final hourly = impliedHourlyRateReais;
    if (hourly == null) return null;
    final n = lineItems.length;
    if (n <= 1) return '${formatBRL(hourly)}/h';
    return '${formatBRL(hourly)}/h × $n horários';
  }

  static int? _minutes(String hm) {
    final parts = hm.trim().split(':');
    if (parts.isEmpty) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    return h * 60 + m;
  }
}
