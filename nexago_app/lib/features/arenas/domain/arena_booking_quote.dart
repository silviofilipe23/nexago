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
    this.athletePricingTier,
    this.athletePricingLabel,
    this.athletePricingDiscountReais = 0,
    this.weatherCreditAvailableReais = 0,
    this.weatherCreditNextExpiresAt,
    this.weatherCreditAppliedReais = 0,
    this.amountAfterCreditReais,
    this.memberHoursWeeklyMinutes = 0,
    this.memberHoursAvailableMinutes = 0,
    this.memberHoursMinutes = 0,
    this.memberHoursDiscountReais = 0,
    this.memberHoursPlanName,
    this.memberHoursBlockedReason,
    this.schedulePlanName,
    this.schedulePlanTimesPerWeek = 0,
    this.schedulePlanUsesLeft = 0,
    this.scheduleFlexMinutes = 0,
    this.scheduleFlexDiscountReais = 0,
    this.schedulePlanBlockedReason,
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

  /// Preço por perfil da arena (`student` | `professor`) — `null` quando o
  /// atleta paga o avulso ou o perfil não venceu promoção/cupom. Servidor
  /// antigo não devolve o campo.
  final String? athletePricingTier;

  /// Nome do perfil dado pela arena ("Aluno", "Professor de outro esporte").
  final String? athletePricingLabel;

  /// Quanto o preço do perfil tirou do preço cheio.
  final double athletePricingDiscountReais;

  /// Saldo de crédito de chuva do atleta nesta arena (0 sem crédito ou com
  /// servidor antigo, que não devolve o campo).
  final double weatherCreditAvailableReais;

  /// Vencimento mais próximo do saldo (`null` = sem validade).
  final DateTime? weatherCreditNextExpiresAt;

  /// Quanto do crédito entra nesta reserva (cotação com `useWeatherCredit`).
  final double weatherCreditAppliedReais;

  /// Total depois do crédito; `null` quando o servidor não devolve.
  final double? amountAfterCreditReais;

  /// Banco de horas da semana do contrato de mensalista (0 = não é
  /// mensalista nesta arena, ou a arena não liga o banco). Servidor antigo
  /// não devolve os campos `memberHours*`.
  final int memberHoursWeeklyMinutes;

  /// Saldo da semana ANTES desta reserva.
  final int memberHoursAvailableMinutes;

  /// Minutos desta reserva cobertos pelo banco.
  final int memberHoursMinutes;

  /// Quanto o banco tirou do preço ([amountReais] já vem com ele aplicado).
  final double memberHoursDiscountReais;

  /// Nome do plano do contrato (`null` sem contrato ou sem nome).
  final String? memberHoursPlanName;

  /// Por que o banco não entrou: `overdue`, `exhausted` ou `coupon_cheaper`.
  final String? memberHoursBlockedReason;

  /// Plano de horário livre do atleta nesta arena (`null` sem plano livre).
  /// Servidor antigo não devolve os campos `schedule*`.
  final String? schedulePlanName;

  /// Vezes por semana do plano (0 = sem plano livre).
  final int schedulePlanTimesPerWeek;

  /// Usos que sobravam na semana ANTES desta reserva.
  final int schedulePlanUsesLeft;

  /// Minutos desta reserva cobertos pelo plano (0 = o plano não cobriu).
  final int scheduleFlexMinutes;

  /// Quanto o plano tirou do preço ([amountReais] já vem com ele aplicado).
  final double scheduleFlexDiscountReais;

  /// Por que o plano não cobriu: `exhausted`, `outside_window` ou
  /// `coupon_cheaper`.
  final String? schedulePlanBlockedReason;

  static const String schedulePlanOutsideWindow = 'outside_window';

  /// Atleta com plano de horário livre nesta arena.
  bool get isSchedulePlanMember => schedulePlanTimesPerWeek > 0;

  /// O plano de horário cobriu ao menos parte desta reserva (um uso).
  bool get hasSchedulePlan => scheduleFlexMinutes > 0;

  /// Banco de horas ou plano de horário cobriu ao menos parte da reserva.
  bool get hasPlanCoverage => hasMemberHours || hasSchedulePlan;

  /// Coberta inteira pelo banco de horas ou pelo plano: nada a pagar.
  bool get coveredByPlanCoverage => hasPlanCoverage && amountReais <= 0;

  /// O que o plano/banco tirou do preço (só um dos dois entra por reserva).
  double get planCoverageDiscountReais =>
      memberHoursDiscountReais + scheduleFlexDiscountReais;

  /// "Plano Manhã · 1h" ou "Banco de horas · 1h" — `null` sem cobertura.
  String? get planCoverageLineLabel => hasSchedulePlan
      ? '${schedulePlanName ?? 'Plano de horário'} · '
          '${formatMemberHours(scheduleFlexMinutes)}'
      : memberHoursLineLabel;

  /// "−R$ 80,00" — `null` sem cobertura.
  String? get planCoverageValueLabel => hasSchedulePlan
      ? '\u2212${formatBRL(scheduleFlexDiscountReais)}'
      : memberHoursValueLabel;

  /// O plano não cobriu por um motivo que muda o preço: o aviso tem destaque.
  bool get schedulePlanNoticeIsWarning =>
      schedulePlanBlockedReason == memberHoursExhausted ||
      schedulePlanBlockedReason == schedulePlanOutsideWindow;

  /// Texto do plano de horário livre na confirmação — `null` sem plano.
  String? get schedulePlanNotice {
    if (!isSchedulePlanMember) return null;
    if (hasSchedulePlan) {
      final after = schedulePlanUsesLeft - 1;
      return after <= 0
          ? 'Usa o último horário do plano nesta semana.'
          : 'Usa 1 dos $schedulePlanTimesPerWeek horários da semana: '
              'depois desta, ${after == 1 ? 'resta 1' : 'restam $after'}.';
    }
    switch (schedulePlanBlockedReason) {
      case memberHoursExhausted:
        return 'Seus horários do plano nesta semana acabaram: esta reserva '
            'sai pelo preço normal.';
      case schedulePlanOutsideWindow:
        return 'Este horário fica fora do seu plano: sai pelo preço normal. '
            'Escolha um horário dentro do plano para usar a vaga da semana.';
      case memberHoursCouponCheaper:
        return 'O cupom deixou esta reserva mais barata: seu horário do plano '
            'fica guardado.';
    }
    return null;
  }

  static const String memberHoursOverdue = 'overdue';
  static const String memberHoursExhausted = 'exhausted';
  static const String memberHoursCouponCheaper = 'coupon_cheaper';

  /// Atleta mensalista com banco de horas nesta arena.
  bool get isMember => memberHoursWeeklyMinutes > 0;

  /// O banco cobriu ao menos parte desta reserva.
  bool get hasMemberHours => memberHoursMinutes > 0;

  /// O banco cobriu a reserva inteira: nada a pagar.
  bool get coveredByMemberHours => hasMemberHours && amountReais <= 0;

  /// Preço antes do banco de horas (total + desconto do banco).
  double get amountBeforeMemberHoursReais =>
      ((amountReais + planCoverageDiscountReais) * 100).roundToDouble() / 100;

  /// "Banco de horas · 1h" — `null` sem horas do banco nesta reserva.
  String? get memberHoursLineLabel => hasMemberHours
      ? 'Banco de horas · ${formatMemberHours(memberHoursMinutes)}'
      : null;

  /// "−R$ 150,00" — `null` sem horas do banco nesta reserva.
  String? get memberHoursValueLabel =>
      hasMemberHours ? '\u2212${formatBRL(memberHoursDiscountReais)}' : null;

  /// Saldo da semana depois desta reserva.
  int get memberHoursRemainingMinutes {
    final left = memberHoursAvailableMinutes - memberHoursMinutes;
    return left < 0 ? 0 : left;
  }

  /// "Restam 2h de 3h nesta semana" — `null` quando não é mensalista.
  String? get memberHoursBalanceLabel {
    if (!isMember) return null;
    final weekly = formatMemberHours(memberHoursWeeklyMinutes);
    final left = memberHoursRemainingMinutes;
    if (left <= 0) return 'Sem horas restantes de $weekly nesta semana';
    return 'Restam ${formatMemberHours(left)} de $weekly nesta semana';
  }

  /// O banco não entrou por um motivo que muda o preço (atraso ou semana
  /// esgotada): o aviso merece destaque.
  bool get memberHoursNoticeIsWarning =>
      memberHoursBlockedReason == memberHoursOverdue ||
      memberHoursBlockedReason == memberHoursExhausted;

  /// Aviso do porquê o banco não entrou — `null` sem motivo.
  String? get memberHoursNotice {
    if (!isMember) return null;
    switch (memberHoursBlockedReason) {
      case memberHoursOverdue:
        return 'Mensalidade em aberto: esta reserva sai pelo preço normal até você pagar.';
      case memberHoursExhausted:
        return 'Suas horas desta semana acabaram: esta reserva sai pelo preço normal.';
      case memberHoursCouponCheaper:
        return 'O cupom deixou esta reserva mais barata: suas horas da semana ficam guardadas.';
    }
    return null;
  }

  /// 90 → "1h30", 60 → "1h", 30 → "30min".
  static String formatMemberHours(int minutes) {
    final m = minutes < 0 ? 0 : minutes;
    final h = m ~/ 60;
    final rest = m % 60;
    if (h == 0) return '${rest}min';
    if (rest == 0) return '${h}h';
    return '${h}h${rest.toString().padLeft(2, '0')}';
  }

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

  bool get hasAthletePricing =>
      athletePricingTier != null && athletePricingDiscountReais > 0;

  /// Preço cheio antes do preço do perfil (total + desconto + banco de horas,
  /// que o servidor aplica por cima do preço do perfil).
  double get amountBeforeAthletePricingReais =>
      ((amountReais + athletePricingDiscountReais + planCoverageDiscountReais) *
              100)
          .roundToDouble() /
      100;

  /// "Preço Aluno" — `null` sem preço de perfil.
  String? get athletePricingLineLabel {
    if (!hasAthletePricing) return null;
    final label = athletePricingLabel?.trim();
    return 'Preço ${label == null || label.isEmpty ? 'especial' : label}';
  }

  /// "−R$ 50,00" — `null` sem preço de perfil.
  String? get athletePricingValueLabel => hasAthletePricing
      ? '\u2212${formatBRL(athletePricingDiscountReais)}'
      : null;

  /// Preço cheio antes do desconto do professor (total + desconto + banco de
  /// horas, aplicado por cima).
  double get amountBeforeProfessorDiscountReais =>
      ((amountReais + professorDiscountReais + planCoverageDiscountReais) * 100)
          .roundToDouble() /
      100;

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
