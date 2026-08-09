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

  // ── Escala nomeada (design system 04 — Type) ────────────────────────────
  // Sem cor de propósito: cor vem do TextTheme ou de context.themeColors.

  static TextStyle get displayL => soraRegular(
      fontSize: 32,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.8,
      height: 1.1);

  static TextStyle get titleL => soraRegular(
      fontSize: 22,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.4,
      height: 1.2);

  static TextStyle get titleM => soraRegular(
      fontSize: 16,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.2,
      height: 1.3);

  static TextStyle get titleS =>
      soraRegular(fontSize: 14, fontWeight: FontWeight.w700, height: 1.35);

  static TextStyle get bodyL =>
      soraRegular(fontSize: 16, fontWeight: FontWeight.w400, height: 1.5);

  static TextStyle get bodyM =>
      soraRegular(fontSize: 14, fontWeight: FontWeight.w400, height: 1.45);

  static TextStyle get bodyS =>
      soraRegular(fontSize: 12, fontWeight: FontWeight.w400, height: 1.4);

  static TextStyle get labelL => soraRegular(
      fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 0.1);

  static TextStyle get labelS => soraRegular(
      fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4);

  static TextStyle get monoMeta =>
      mono(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4);

  static TextStyle get monoStat => mono(
      fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 0.2, height: 1);

  /// Rótulo "eyebrow" acima de títulos — usar com texto em CAIXA ALTA.
  static TextStyle get eyebrow =>
      mono(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2);
}
