/// Política da arena para o cancelamento feito pelo atleta no prazo grátis
/// (`arenas/{id}.athleteCancelPolicy`, copiada em `arenaBookings.cancelPolicy` na
/// criação). Espelha `functions/src/arena-athlete-cancel-policy.ts`.
class AthleteCancelPolicy {
  const AthleteCancelPolicy._(
      {required this.credit, required this.refundPercent});

  /// Estorno integral: o padrão, e o que vale para reservas sem cópia da política.
  static const full = AthleteCancelPolicy._(credit: false, refundPercent: 100);

  static const _refundPercents = {100, 75, 50, 25};

  /// O valor pago vira crédito na arena em vez de voltar em dinheiro.
  final bool credit;

  /// No estorno: quanto do valor pago volta (100 = integral). 0 no crédito.
  final int refundPercent;

  bool get partial => !credit && refundPercent < 100;

  /// Lê o mapa da política; qualquer coisa estranha vira estorno integral.
  factory AthleteCancelPolicy.fromRaw(Object? raw) {
    if (raw is! Map) return full;
    if (raw['mode'] == 'credit') {
      return const AthleteCancelPolicy._(credit: true, refundPercent: 0);
    }
    final pct = raw['refundPercent'];
    final value = pct is num ? pct.toInt() : 100;
    if (!_refundPercents.contains(value) || value == 100) return full;
    return AthleteCancelPolicy._(credit: false, refundPercent: value);
  }

  /// Política de uma reserva (a cópia gravada na criação).
  factory AthleteCancelPolicy.fromBooking(Map<String, dynamic>? booking) =>
      AthleteCancelPolicy.fromRaw(booking?['cancelPolicy']);

  @override
  bool operator ==(Object other) =>
      other is AthleteCancelPolicy &&
      other.credit == credit &&
      other.refundPercent == refundPercent;

  @override
  int get hashCode => Object.hash(credit, refundPercent);
}
