import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_theme.dart';

/// Cores de UI derivadas do [ColorScheme] ativo.
///
/// Em widgets, prefira [BuildContext.themeColors] em vez de
/// `AppColors.canvas`, `AppColors.onSurface`, etc.
class AppThemeColors {
  const AppThemeColors(this._scheme);

  final ColorScheme _scheme;

  bool get isDark => _scheme.brightness == Brightness.dark;

  Color get canvas => _scheme.surfaceContainerLowest;
  Color get surfaceCard => _scheme.surface;
  Color get surfaceRaised => _scheme.surfaceContainerHigh;
  Color get surfaceSheet => _scheme.surfaceContainerHighest;
  Color get onSurface => _scheme.onSurface;
  Color get onSurfaceMuted => _scheme.onSurfaceVariant;
  Color get outline => _scheme.outline;

  Color get brand => AppColors.brand;
  Color get brandHover => AppColors.brandHover;
  Color get brandPressed => AppColors.brandPressed;

  /// Laranja da marca para texto e ícone sobre as superfícies do tema. No
  /// escuro é o [brand]; no claro, um laranja profundo: o [brand] dá 2,9:1 no
  /// branco e 2,5:1 na superfície elevada, e o #C2410C do site ainda fica em
  /// 4,4:1 nela. Este dá ≥ 5:1 no canvas e no card e ≥ 4,5:1 no resto, como
  /// os tons de estado abaixo. Botão cheio e fundo laranja seguem no [brand].
  Color get brandText => isDark ? AppColors.brand : AppColors.brandTextLight;

  // Tons de estado para texto, ícone e marca sobre as superfícies do tema.
  // No escuro são os do [AppColors]; no claro, o mesmo matiz escurecido: no
  // branco o verde cru dá ~1,9:1, o vermelho ~3,5:1 e o âmbar ~1,6:1. Os do
  // claro dão ≥ 5:1 no canvas e no card e ≥ 4,5:1 no resto: superfície
  // elevada, folha, fundo translúcido do próprio tom (selo, aviso) e o
  // gradiente laranja a 10% do topo das Peladas.
  //
  // Fundo sólido com texto por cima (botão, pílula cheia) segue com o cru do
  // [AppColors]: o texto de cima foi escolhido para ele. O fundo translúcido
  // do tom (selo, aviso) também pode ficar no cru.

  /// Ao vivo, erro, cancelado, derrota.
  Color get live => isDark ? AppColors.live : AppColors.liveLight;

  /// Vitória, confirmado, livre.
  Color get win => isDark ? AppColors.win : AppColors.winLight;

  /// Pendente, aguardando, atenção.
  Color get pending => isDark ? AppColors.pending : AppColors.pendingLight;

  /// [tone] na versão de [win], [live], [pending] ou [brandText] do tema
  /// ativo quando é um desses tons crus do [AppColors]; qualquer outra cor
  /// volta igual. Para a cor que chega pronta de um modelo e pinta texto ou
  /// ícone.
  Color readableTone(Color tone) {
    if (tone == AppColors.win) return win;
    if (tone == AppColors.live) return live;
    if (tone == AppColors.pending) return pending;
    if (tone == AppColors.brand) return brandText;
    return tone;
  }

  Color get white => AppColors.white;
  Color get black => AppColors.black;

  static AppThemeColors ofBrightness(Brightness brightness) {
    final theme =
        brightness == Brightness.dark ? AppTheme.dark : AppTheme.light;
    return AppThemeColors(theme.colorScheme);
  }
}

extension AppThemeColorsContext on BuildContext {
  AppThemeColors get themeColors =>
      AppThemeColors(Theme.of(this).colorScheme);
}
