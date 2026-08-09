/// Escala de espaçamento NexaGO (grid de 4pt).
abstract final class AppSpacing {
  AppSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;

  /// Padding horizontal padrão de tela.
  static const double screenH = 20;

  /// Respiro vertical entre seções de uma tela.
  static const double sectionGap = 28;
}
