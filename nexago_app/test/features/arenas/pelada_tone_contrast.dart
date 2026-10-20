import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/arenas/domain/pelada.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/pelada/pelada_widgets.dart';

import '../../core/theme/state_tone_contrast.dart';

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
  final colors = themeColorsOf(tester, within);
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
    final bg = backdropOf(rich);
    void visit(InlineSpan span, Color? inherited) {
      final color = span.style?.color ?? inherited;
      if (span is! TextSpan) return;
      final text = span.text ?? '';
      if (text.trim().isNotEmpty && palette.containsKey(color)) {
        final decorative = _decorative(rich, text);
        final min = decorative || (color == mute && colors.isDark) ? 3.0 : 4.5;
        expect(
          contrastRatio(color!, bg),
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
  final colors = themeColorsOf(tester, within);
  final tones = _tones(colors);
  final checked = <String>[];

  for (final box in find
      .descendant(of: within, matching: find.byType(ColoredBox))
      .evaluate()) {
    final color = (box.widget as ColoredBox).color;
    if (!tones.containsKey(color)) continue;
    final bg = backdropOf(box);
    expect(
      contrastRatio(color, bg),
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
    final outside = backdropOf(material);
    final inside = Color.alphaBlend(widget.color!, outside);
    final stroke = Color.alphaBlend(border, inside);
    for (final (where, bg) in [('card', inside), ('fundo', outside)]) {
      expect(
        contrastRatio(stroke, bg),
        greaterThanOrEqualTo(3.0),
        reason: 'Borda pendente ($stroke) contra o $where $bg',
      );
    }
    checked.add('borda pendente');
  }
  return checked;
}
