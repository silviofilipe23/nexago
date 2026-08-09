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

  // Regressão: labelMedium não pode ser mesclado com AppTypography.labelS —
  // isso encolheria de 12 (default Material) para 11 em ~41 telas fora da
  // jornada. labelSmall (default Material já é 11) é o alvo correto.
  //
  // A geometria default do Material (fontSize/weight/height) só é mesclada
  // em tempo real por Theme.of(context) -> ThemeData.localize(...), não por
  // um ThemeData construído direto (ver theme.dart, Theme.of). Por isso este
  // teste sobe uma árvore de widgets em vez de inspecionar AppTheme.dark
  // isoladamente — senão labelMedium?.fontSize seria sempre null aqui,
  // independente do bug estar corrigido ou não.
  testWidgets(
      'TextTheme resolvido: labelMedium preserva tamanho Material; '
      'labelSmall recebe a marca', (tester) async {
    late TextTheme resolved;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Builder(
          builder: (context) {
            resolved = Theme.of(context).textTheme;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(resolved.labelMedium?.fontSize, 12);
    expect(resolved.labelSmall?.fontSize, 11);
    expect(resolved.labelSmall?.fontWeight, FontWeight.w600);
  });
}
