import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

void main() {
  test('escala nomeada: tamanhos e famílias', () {
    expect(AppTypography.displayL.fontSize, 32);
    expect(AppTypography.titleL.fontSize, 22);
    expect(AppTypography.titleM.fontSize, 16);
    expect(AppTypography.bodyM.fontSize, 14);
    expect(AppTypography.eyebrow.fontFamily, AppTypography.monoFontFamily);
    expect(AppTypography.monoStat.fontFamily, AppTypography.monoFontFamily);
    expect(AppTypography.titleL.fontFamily, AppTypography.fontFamily);
    expect(AppTypography.titleL.color, isNull);
  });

  test('TextTheme do app deriva da escala nomeada', () {
    final theme = AppTheme.dark;
    expect(theme.textTheme.titleLarge?.fontWeight, FontWeight.w800);
    expect(theme.textTheme.titleLarge?.fontSize, 22);
    expect(theme.textTheme.titleMedium?.fontWeight, FontWeight.w700);
    expect(theme.textTheme.bodyMedium?.fontSize, 14);
    expect(theme.textTheme.titleLarge?.fontFamily, AppTypography.fontFamily);
  });
}
