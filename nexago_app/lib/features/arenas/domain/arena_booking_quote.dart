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
    this.weatherCreditAvailableReais = 0,
    this.weatherCreditNextExpiresAt,
    this.weatherCreditAppliedReais = 0,
    this.amountAfterCreditReais,
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

  /// Saldo de crédito de chuva do atleta nesta arena (0 sem crédito ou com
  /// servidor antigo, que não devolve o campo).
  final double weatherCreditAvailableReais;

  /// Vencimento mais próximo do saldo (`null` = sem validade).
  final DateTime? weatherCreditNextExpiresAt;

  /// Quanto do crédito entra nesta reserva (cotação com `useWeatherCredit`).
  final double weatherCreditAppliedReais;

  /// Total depois do crédito; `null` quando o servidor não devolve.
  final double? amountAfterCreditReais;

  bool get hasWeatherCredit => weatherCreditAvailableReais > 0;

  /// O que sobra para pagar depois do crédito aplicado.
  double get amountDueAfterWeatherCreditReais {
    final after = amountAfterCreditReais;
    if (after != null) return after < 0 ? 0 : after;
    final net = ((amountReais - weatherCreditAppliedReais) * 100).round() / 100;
    return net < 0 ? 0 : net;
  }

  bool get hasProfessorDiscount =>
      professorDiscountPercent > 0 && professorDiscountReais > 0;

  /// Preço cheio antes do desconto do professor (total + desconto).
  double get amountBeforeProfessorDiscountReais =>
      ((amountReais + professorDiscountReais) * 100).roundToDouble() / 100;

  /// O desconto cobriu só parte dos horários (faixa do vínculo, ex.:
  /// 08:00–17:00): tirou menos que o % sobre o preço cheio de todas as linhas.
  /// Sem linhas, não dá para saber — conta como inteiro.
  bool get professorDiscountIsPartial {
    if (!hasProfessorDiscount || lineItems.isEmpty) return false;
    final fullBase =
        lineItems.fold<double>(0, (sum, l) => sum + l.baseSlotPriceReais);
    final fullDiscount = fullBase * professorDiscountPercent / 100;
    // Cada linha arredonda em centavos: folga de 1 centavo por linha.
    return professorDiscountReais < fullDiscount - 0.01 * lineItems.length;
  }

  /// "Desconto de professor (20%)" ou, quando só parte dos horários entrou
  /// na faixa do desconto, "Desconto de professor (20% em parte dos
  /// horários)" — `null` sem desconto.
  String? get professorDiscountLabel {
    if (!hasProfessorDiscount) return null;
    final scope = professorDiscountIsPartial ? ' em parte dos horários' : '';
    return 'Desconto de professor ($professorDiscountPercent%$scope)';
  }

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
