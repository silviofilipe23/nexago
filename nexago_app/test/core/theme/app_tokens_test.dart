import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_motion.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_tokens.dart';

void main() {
  test('escala de espaçamento é crescente e múltipla de 4', () {
    const scale = [AppSpacing.xs, AppSpacing.sm, AppSpacing.md, AppSpacing.lg,
        AppSpacing.xl, AppSpacing.xxl, AppSpacing.xxxl];
    for (var i = 1; i < scale.length; i++) {
      expect(scale[i], greaterThan(scale[i - 1]));
      expect(scale[i] % 4, 0);
    }
    expect(AppSpacing.screenH, 20);
    expect(AppSpacing.sectionGap, 28);
  });

  test('raios colapsam nos 5 valores canônicos', () {
    expect(AppRadii.sm, 8);
    expect(AppRadii.md, 12);
    expect(AppRadii.lg, 16);
    expect(AppRadii.xl, 24);
    expect(AppRadii.pill, 999);
  });

  test('ArenaDashboardTokens delega para os tokens novos sem mudar valor', () {
    expect(ArenaDashboardTokens.horizontalPadding, AppSpacing.screenH);
    expect(ArenaDashboardTokens.sectionGap, AppSpacing.sectionGap);
    expect(ArenaDashboardTokens.cardRadius, AppRadii.lg);
    expect(ArenaDashboardTokens.chipRadius, AppRadii.pill);
  });

  test('durações de movimento', () {
    expect(AppMotion.fast.inMilliseconds, 150);
    expect(AppMotion.base.inMilliseconds, 220);
    expect(AppMotion.slow.inMilliseconds, 420);
  });
}
