import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arenas/domain/pelada.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/pelada/pelada_widgets.dart';

import 'state_tone_contrast.dart';

void main() {
  final dark = AppThemeColors.ofBrightness(Brightness.dark);
  final light = AppThemeColors.ofBrightness(Brightness.light);

  // O tema escuro é o visual de referência: os tons de estado dele são os
  // crus do AppColors, sem mudança nenhuma.
  test('tema escuro: tons de estado idênticos aos crus', () {
    expect(dark.win, AppColors.win);
    expect(dark.live, AppColors.live);
    expect(dark.pending, AppColors.pending);
    for (final tone in [
      AppColors.win,
      AppColors.live,
      AppColors.pending,
      AppColors.brand,
    ]) {
      expect(dark.readableTone(tone), tone);
    }
  });

  test('tema claro: o mesmo matiz escurecido', () {
    expect(light.win, AppColors.winLight);
    expect(light.live, AppColors.liveLight);
    expect(light.pending, AppColors.pendingLight);
    expect(light.readableTone(AppColors.win), AppColors.winLight);
    expect(light.readableTone(AppColors.live), AppColors.liveLight);
    expect(light.readableTone(AppColors.pending), AppColors.pendingLight);
    expect(light.readableTone(AppColors.brand), AppColors.brandTextLight);
  });

  test('readableTone devolve igual o que não é tom de estado nem marca', () {
    for (final colors in [dark, light]) {
      for (final other in [
        AppColors.brandHover,
        AppColors.onSurfaceMuted,
        AppColors.win.withValues(alpha: 0.12),
      ]) {
        expect(colors.readableTone(other), other);
      }
    }
  });

  test('Peladas usam os tons do tema', () {
    for (final colors in [dark, light]) {
      expect(PeladaStyle.win(colors), colors.win);
      expect(PeladaStyle.live(colors), colors.live);
      expect(
        PeladaStyle.toneColor(PeladaStatusTone.confirmed,
            isDark: colors.isDark),
        colors.win,
      );
      expect(
        PeladaStyle.toneColor(PeladaStatusTone.pending, isDark: colors.isDark),
        colors.pending,
      );
      expect(
        PeladaStyle.toneColor(PeladaStatusTone.disputed, isDark: colors.isDark),
        colors.live,
      );
    }
  });

  group('tema claro: contraste dos tons como texto', () {
    for (final (name, tone, raw) in [
      ('win', light.win, AppColors.win),
      ('live', light.live, AppColors.live),
      ('pending', light.pending, AppColors.pending),
    ]) {
      test('$name: ≥ 5:1 no canvas e no card, ≥ 4,5:1 no resto', () {
        for (final (where, bg) in [
          ('canvas', light.canvas),
          ('card', light.surfaceCard),
        ]) {
          expect(
            contrastRatio(tone, bg),
            greaterThanOrEqualTo(5.0),
            reason: '$name sobre $where',
          );
        }
        for (final (where, bg) in [
          ('canvas', light.canvas),
          ('card', light.surfaceCard),
          ('raised', light.surfaceRaised),
        ]) {
          // Selo, aviso e ícone em círculo: o cru translúcido por baixo.
          for (final alpha in [0.12, 0.15, 0.16]) {
            final tint = Color.alphaBlend(raw.withValues(alpha: alpha), bg);
            expect(
              contrastRatio(tone, tint),
              greaterThanOrEqualTo(4.5),
              reason: '$name sobre $where com o tom a $alpha',
            );
          }
        }
        // A folha (#E8E4DE) é o fundo mais escuro do claro.
        expect(
          contrastRatio(tone, light.surfaceSheet),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('$name cru reprova no card branco (por isso a troca)', () {
        expect(contrastRatio(raw, light.surfaceCard), lessThan(4.5));
      });
    }
  });
}
