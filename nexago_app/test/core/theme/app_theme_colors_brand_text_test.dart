import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import 'state_tone_contrast.dart';

void main() {
  final dark = AppThemeColors.ofBrightness(Brightness.dark);
  final light = AppThemeColors.ofBrightness(Brightness.light);

  // O tema escuro é o visual de referência: o laranja de texto dele é o
  // próprio brand, sem mudança nenhuma.
  test('tema escuro: brandText é o brand', () {
    expect(dark.brandText, AppColors.brand);
    expect(dark.brand, AppColors.brand);
  });

  test('tema claro: brandText é o laranja profundo', () {
    expect(light.brandText, AppColors.brandTextLight);
    // Fundo e botão cheio seguem no brand cru nos dois temas.
    expect(light.brand, AppColors.brand);
  });

  group('tema claro: contraste do brandText', () {
    test('≥ 5:1 no canvas e no card, ≥ 4,5:1 no resto', () {
      for (final (where, bg) in [
        ('canvas', light.canvas),
        ('card', light.surfaceCard),
      ]) {
        expect(
          contrastRatio(light.brandText, bg),
          greaterThanOrEqualTo(5.0),
          reason: 'brandText sobre $where',
        );
      }
      for (final (where, bg) in [
        ('canvas', light.canvas),
        ('card', light.surfaceCard),
        ('raised', light.surfaceRaised),
      ]) {
        // Selo, chip e ícone em círculo: o brand translúcido por baixo.
        for (final alpha in [0.08, 0.10, 0.12, 0.14, 0.15, 0.16]) {
          final tint = Color.alphaBlend(
            AppColors.brand.withValues(alpha: alpha),
            bg,
          );
          expect(
            contrastRatio(light.brandText, tint),
            greaterThanOrEqualTo(4.5),
            reason: 'brandText sobre $where com o brand a $alpha',
          );
        }
      }
      // Card elevado a 85% no canvas (Meu perfil) e a folha (#E8E4DE), o
      // fundo mais escuro do claro.
      expect(
        contrastRatio(
          light.brandText,
          Color.alphaBlend(
            light.surfaceRaised.withValues(alpha: 0.85),
            light.canvas,
          ),
        ),
        greaterThanOrEqualTo(4.5),
      );
      expect(
        contrastRatio(light.brandText, light.surfaceSheet),
        greaterThanOrEqualTo(4.5),
      );
    });

    // A contagem do chip das Peladas usa o laranja a 85% no escuro; no claro
    // ela vai cheia, porque a 85% sobre o chip laranja não chega a 4,5:1.
    test('a 85% sobre o chip laranja reprova (por isso cheio no claro)', () {
      final chip = Color.alphaBlend(
        AppColors.brand.withValues(alpha: 0.12),
        light.canvas,
      );
      expect(
        contrastRatio(light.brandText.withValues(alpha: 0.85), chip),
        lessThan(4.5),
      );
    });

    test('brand cru reprova no card branco (por isso a troca)', () {
      expect(contrastRatio(AppColors.brand, light.surfaceCard), lessThan(3));
    });

    // O #C2410C do site, sugerido de início, não chega lá na superfície
    // elevada: por isso o tom é um pouco mais fundo.
    test('#C2410C do site reprova na superfície elevada', () {
      expect(
        contrastRatio(const Color(0xFFC2410C), light.surfaceRaised),
        lessThan(4.5),
      );
    });
  });
}
