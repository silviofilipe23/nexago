/// Cálculo local de valores PIX (50% sinal ou 100%).
abstract final class ArenaBookingPixAmounts {
  ArenaBookingPixAmounts._();

  static double payNowReais(double totalReais, double fraction) {
    return ((_round(totalReais * fraction) * 100).roundToDouble()) / 100;
  }

  static double dueOnsiteReais(double totalReais, double fraction) {
    final pay = payNowReais(totalReais, fraction);
    return ((_round(totalReais - pay) * 100).roundToDouble()) / 100;
  }

  static double _round(double n) => (n * 100).roundToDouble() / 100;
}
