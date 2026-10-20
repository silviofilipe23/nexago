import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Razão de contraste WCAG entre [fg] (composto sobre [bg]) e [bg].
double contrastRatio(Color fg, Color bg) {
  final a = Color.alphaBlend(fg, bg).computeLuminance();
  final b = bg.computeLuminance();
  final (hi, lo) = a > b ? (a, b) : (b, a);
  return (hi + 0.05) / (lo + 0.05);
}

/// Fundo opaco por trás de [element]: compõe, de fora para dentro, o que os
/// ancestrais pintam (Material, DecoratedBox, ColoredBox). Do gradiente vale
/// a primeira cor, a ponta mais forte nos cartões das Peladas.
Color backdropOf(Element element) {
  final fills = <Color>[];
  element.visitAncestorElements((e) {
    final fill = switch (e.widget) {
      Material(:final type, :final color?)
          when type != MaterialType.transparency =>
        color,
      DecoratedBox(
        position: DecorationPosition.background,
        decoration: BoxDecoration(:final color?),
      ) =>
        color,
      DecoratedBox(
        position: DecorationPosition.background,
        decoration: BoxDecoration(gradient: Gradient(:final colors)),
      ) =>
        colors.first,
      ColoredBox(:final color) => color,
      _ => null,
    };
    if (fill != null) fills.add(fill);
    return true;
  });
  return fills.reversed.reduce((bg, fill) => Color.alphaBlend(fill, bg));
}

AppThemeColors themeColorsOf(WidgetTester tester, Finder within) =>
    AppThemeColors(Theme.of(tester.element(within.first)).colorScheme);

/// Tons de estado do tema ativo, com o nome que sai na mensagem de falha. Os
/// crus do [AppColors] entram também: no claro eles só aparecem como texto
/// se alguém pulou o [AppThemeColors], e aí reprovam.
Map<Color, String> stateTonesOf(AppThemeColors colors) => {
      AppColors.win: 'win cru',
      AppColors.live: 'live cru',
      AppColors.pending: 'pending cru',
      colors.win: 'win',
      colors.live: 'live',
      colors.pending: 'pending',
    };

/// Confere tudo o que [within] pinta com um tom de estado (vitória, ao
/// vivo/erro, pendente) contra o fundo em que está: texto a 4,5:1; ícone e
/// marca (o ponto de status: [DecoratedBox] opaco do tom, de até 16 px) a
/// 3:1 (WCAG 1.4.11). Fundo translúcido do tom e preenchimento maior, com
/// conteúdo por cima (botão, disco do ícone de sucesso), não são marca.
///
/// Devolve o que conferiu, para o teste provar que cobriu o que queria: o
/// texto de cada trecho, o [IconData] de cada ícone e `'marca'` por ponto.
List<Object> expectStateTonesLegible(WidgetTester tester, Finder within) {
  final tones = stateTonesOf(themeColorsOf(tester, within));
  final checked = <Object>[];

  for (final rich in find
      .descendant(of: within, matching: find.byType(RichText))
      .evaluate()) {
    final bg = backdropOf(rich);
    final icon = rich.findAncestorWidgetOfExactType<Icon>();
    void visit(InlineSpan span, Color? inherited) {
      final color = span.style?.color ?? inherited;
      if (span is! TextSpan) return;
      final text = span.text ?? '';
      if (text.trim().isNotEmpty && tones.containsKey(color)) {
        expect(
          contrastRatio(color!, bg),
          greaterThanOrEqualTo(icon != null ? 3.0 : 4.5),
          reason: '${icon?.icon ?? '"$text"'} (${tones[color]}) sobre $bg',
        );
        checked.add(icon?.icon ?? text);
      }
      for (final child in span.children ?? const <InlineSpan>[]) {
        visit(child, color);
      }
    }

    visit((rich.widget as RichText).text, null);
  }

  for (final box in find
      .descendant(of: within, matching: find.byType(DecoratedBox))
      .evaluate()) {
    final decoration = (box.widget as DecoratedBox).decoration;
    if (decoration is! BoxDecoration) continue;
    final color = decoration.color;
    if (!tones.containsKey(color)) continue;
    if ((box.renderObject! as RenderBox).size.shortestSide > 16) continue;
    final bg = backdropOf(box);
    expect(
      contrastRatio(color!, bg),
      greaterThanOrEqualTo(3.0),
      reason: 'Marca (${tones[color]}) sobre $bg',
    );
    checked.add('marca');
  }
  return checked;
}
