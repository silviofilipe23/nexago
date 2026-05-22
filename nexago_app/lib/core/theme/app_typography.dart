import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Tipografia NexaGO — Sora (UI) + JetBrains Mono (números, XP, código).
abstract final class AppTypography {
  AppTypography._();

  /// Família principal (títulos, corpo, botões).
  static const String fontFamily = 'Sora';

  /// Família monoespaçada (XP, stats, valores tabulares).
  static const String monoFontFamily = 'JetBrains Mono';

  /// Estilo monoespaçado para métricas e recompensas (+XP, níveis, contadores).
  static TextStyle mono({
    double? fontSize,
    FontWeight fontWeight = FontWeight.w700,
    Color? color,
    double? letterSpacing,
    double? height,
  }) {
    return TextStyle(
      fontFamily: monoFontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  static TextStyle soraRegular({
    double? fontSize,
    FontWeight fontWeight = FontWeight.w700,
    Color? color,
    double? letterSpacing,
    double? height,
  }) {
    return TextStyle(
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  /// XP / gamificação (verde de vitória por padrão).
  static TextStyle xpReward({
    double fontSize = 14,
    FontWeight fontWeight = FontWeight.w800,
    Color color = AppColors.win,
  }) {
    return mono(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: 0.3,
      height: 1,
    );
  }
}
