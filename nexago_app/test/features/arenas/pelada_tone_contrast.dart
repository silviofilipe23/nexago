import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arenas/domain/pelada.dart';
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

/// Tons de estado do tema ativo, com o nome que sai na mensagem de falha. Os
/// crus do [AppColors] entram também: no claro eles só aparecem se alguém
/// pulou o [PeladaStyle], e aí reprovam.
Map<Color, String> _tones(AppThemeColors colors) => {
      AppColors.win: 'win cru',
      AppColors.live: 'live cru',
      AppColors.pending: 'pending cru',
      for (final tone in PeladaStatusTone.values)
        PeladaStyle.toneColor(tone, isDark: colors.isDark): tone.name,
    };

AppThemeColors _colorsOf(WidgetTester tester, Finder within) =>
    AppThemeColors(Theme.of(tester.element(within.first)).colorScheme);

/// Confere cada trecho pintado com [PeladaStyle.dim], [PeladaStyle.mute] ou
/// um tom de estado ([PeladaStyle.toneColor]: vitória, pendente, contestado)
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
  final colors = _colorsOf(tester, within);
  final mute = PeladaStyle.mute(colors);
  final palette = {
    ..._tones(colors),
    PeladaStyle.dim(colors): 'dim',
    mute: 'mute',
  };
  final checked = <String>[];

  for (final rich in find
      .descendant(of: within, matching: find.byType(RichText))
      .evaluate()) {
    final bg = _backdropOf(rich);
    void visit(InlineSpan span, Color? inherited) {
      final color = span.style?.color ?? inherited;
      if (span is! TextSpan) return;
      final text = span.text ?? '';
      if (text.trim().isNotEmpty && palette.containsKey(color)) {
        final decorative = _decorative(rich, text);
        final min = decorative || (color == mute && colors.isDark) ? 3.0 : 4.5;
        expect(
          _contrastRatio(color!, bg),
          greaterThanOrEqualTo(min),
          reason: '"$text" (${palette[color]}) sobre $bg',
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

/// Marcas sem texto sob [within], a 3:1 (WCAG 1.4.11): a faixa colorida do
/// jogo ganho/perdido contra o card e, no claro, a borda da pelada pendente
/// contra o card e contra o fundo de fora. Devolve o que conferiu
/// (`'faixa'`, `'borda pendente'`).
///
/// No escuro a borda segue amarela a 25% (~1,8:1), como a spec 10b pede: o
/// escuro é a referência e não muda aqui, então ela não entra na conta.
List<String> expectPeladaMarksVisible(WidgetTester tester, Finder within) {
  final colors = _colorsOf(tester, within);
  final tones = _tones(colors);
  final checked = <String>[];

  for (final box in find
      .descendant(of: within, matching: find.byType(ColoredBox))
      .evaluate()) {
    final color = (box.widget as ColoredBox).color;
    if (!tones.containsKey(color)) continue;
    final bg = _backdropOf(box);
    expect(
      _contrastRatio(color, bg),
      greaterThanOrEqualTo(3.0),
      reason: 'Faixa (${tones[color]}) sobre $bg',
    );
    checked.add('faixa');
  }

  if (colors.isDark) return checked;
  final border = PeladaStyle.pendingBorder(colors);
  for (final material in find
      .descendant(of: within, matching: find.byType(Material))
      .evaluate()) {
    final widget = material.widget as Material;
    final shape = widget.shape;
    if (shape is! OutlinedBorder || shape.side.color != border) continue;
    final outside = _backdropOf(material);
    final inside = Color.alphaBlend(widget.color!, outside);
    final stroke = Color.alphaBlend(border, inside);
    for (final (where, bg) in [('card', inside), ('fundo', outside)]) {
      expect(
        _contrastRatio(stroke, bg),
        greaterThanOrEqualTo(3.0),
        reason: 'Borda pendente ($stroke) contra o $where $bg',
      );
    }
    checked.add('borda pendente');
  }
  return checked;
}
