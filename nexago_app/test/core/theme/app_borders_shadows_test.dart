import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_borders.dart';
import 'package:nexago_app/core/theme/app_shadows.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

void main() {
  final dark = AppThemeColors.ofBrightness(Brightness.dark);
  final light = AppThemeColors.ofBrightness(Brightness.light);

  test('bordas usam onSurfaceMuted com alphas canônicos', () {
    expect(AppBorders.subtleSide(dark).color.a, closeTo(0.08, 0.001));
    expect(AppBorders.baseSide(dark).color.a, closeTo(0.12, 0.001));
    expect(AppBorders.strongSide(dark).color.a, closeTo(0.22, 0.001));
    expect(AppBorders.base(dark).top.color.a, closeTo(0.12, 0.001));
  });

  test('sombras são mais suaves no light', () {
    expect(AppShadows.floating(dark).single.color.a,
        greaterThan(AppShadows.floating(light).single.color.a));
    expect(AppShadows.card(dark).single.blurRadius, 16);
    expect(AppShadows.floating(dark).single.blurRadius, 20);
  });
}
