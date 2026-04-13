import 'package:flutter/material.dart';

/// Paleta inspirada no estilo Airbnb: vermelho coral, branco e preto.
abstract final class AppColors {
  AppColors._();

  /// Vermelho marca (#FF385C).
  static const Color brand = Color(0xFFFF385C);

  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);

  /// Texto secundário sobre fundo claro.
  static const Color onSurfaceMuted = Color(0xFF6A6A6A);
}
