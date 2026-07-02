/// Pré-preenchimento do formulário de horário fixo a partir de um slot da
/// agenda (quadra + dia da semana + horário do slot tocado).
class ArenaRecurringFormArgs {
  const ArenaRecurringFormArgs({
    this.courtId,
    this.weekday,
    this.startTime,
    this.endTime,
    this.priceReais,
  });

  final String? courtId;

  /// ISO: 1 = segunda … 7 = domingo ([DateTime.weekday]).
  final int? weekday;

  final String? startTime;
  final String? endTime;
  final double? priceReais;
}
