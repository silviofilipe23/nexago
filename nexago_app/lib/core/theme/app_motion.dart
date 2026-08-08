import 'package:flutter/animation.dart';

/// Durações e curvas padrão de animação NexaGO.
abstract final class AppMotion {
  AppMotion._();

  static const Duration fast = Duration(milliseconds: 150);
  static const Duration base = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 420);

  static const Curve curve = Curves.easeOutCubic;
  static const Curve emphasized = Curves.easeInOutCubic;
}
