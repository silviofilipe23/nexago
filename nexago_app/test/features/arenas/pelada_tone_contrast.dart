import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/pelada/pelada_widgets.dart';

/// Razão de contraste WCAG entre o texto [fg] (composto sobre [bg]) e [bg].
double _contrastRatio(Color fg, Color bg) {
  final a = Color.alphaBlend(fg, bg).computeLuminance();
  final b = bg.computeLuminance();
  final (hi, lo) = a > b ? (a, b) : (b, a);
  return (hi + 0.05) / (lo + 0.05);
}

/// Fundo opaco por trás de [element]: compõe, de fora para dentro, o que os
/// ancestrais pintam (Material, DecoratedBox, ColoredBox). Do gradiente vale
/// a primeira cor, a ponta mais forte nos cartões das Peladas.
Color _backdropOf(Element element) {
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

/// Separadores (`·`, `–`) e ícones só enfeitam: 3:1 basta.
bool _decorative(Element rich, String text) =>
    rich.findAncestorWidgetOfExactType<Icon>() != null ||
    const {'·', '–'}.contains(text.trim());

/// Confere cada trecho pintado com [PeladaStyle.dim] ou [PeladaStyle.mute]
/// sob [within] contra o fundo em que ele está: 4,5:1 para texto e 3:1 para
/// separador ou ícone. Devolve os textos conferidos, para o teste provar que
/// cobriu o que queria.
///
/// No escuro o `mute` segue em 40% (~3,5:1): o tema escuro é a referência
/// visual e não muda aqui, então ali ele só precisa de 3:1.
List<String> expectPeladaTonesLegible(
  WidgetTester tester,
  Finder within,
) {
  final colors = AppThemeColors(
    Theme.of(tester.element(within.first)).colorScheme,
  );
  final dim = PeladaStyle.dim(colors);
  final mute = PeladaStyle.mute(colors);
  final checked = <String>[];

  for (final rich in find
      .descendant(of: within, matching: find.byType(RichText))
      .evaluate()) {
    final bg = _backdropOf(rich);
    void visit(InlineSpan span, Color? inherited) {
      final color = span.style?.color ?? inherited;
      if (span is! TextSpan) return;
      final text = span.text ?? '';
      if (text.trim().isNotEmpty && (color == dim || color == mute)) {
        final decorative = _decorative(rich, text);
        final min = decorative || (color == mute && colors.isDark) ? 3.0 : 4.5;
        expect(
          _contrastRatio(color!, bg),
          greaterThanOrEqualTo(min),
          reason: '"$text" (${color == dim ? 'dim' : 'mute'}) sobre $bg',
        );
        if (!decorative) checked.add(text);
      }
      for (final child in span.children ?? const <InlineSpan>[]) {
        visit(child, color);
      }
    }

    visit((rich.widget as RichText).text, null);
  }
  return checked;
}
