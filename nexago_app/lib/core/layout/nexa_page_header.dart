import 'package:flutter/material.dart';

import '../theme/app_theme_colors.dart';

/// Header fixo no topo da página — irmão da lista, nunca um sliver dela.
///
/// Mora FORA do [Scrollable] de propósito: o Flutter embrulha o viewport num
/// `IgnorePointer` enquanto a lista está sendo arrastada ou deslizando por
/// inércia. Um header montado como sliver herda essa janela morta e fica sem
/// resposta exatamente no instante em que o atleta vai tocar nele — logo
/// depois de rolar. Fora da lista, o toque sempre chega.
///
/// O fundo é opaco e o padding superior já inclui a safe area do dispositivo.
class NexaPageHeader extends StatelessWidget {
  const NexaPageHeader({
    super.key,
    required this.header,
    required this.child,
    this.padding = EdgeInsets.zero,
    this.topGap = 16,
    this.backgroundColor,
  });

  /// Conteúdo do header (título, ícones, etc.).
  final Widget header;

  /// O corpo da página — normalmente a `CustomScrollView`.
  final Widget child;

  /// Espaçamento horizontal/inferior do header. O topo é calculado a partir da
  /// safe area somada a [topGap].
  final EdgeInsets padding;

  /// Folga adicionada abaixo da safe area no topo do header.
  final double topGap;

  /// Fundo opaco atrás do header. Quando nulo, usa `themeColors.canvas`.
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    final background = backgroundColor ?? context.themeColors.canvas;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ColoredBox(
          color: background,
          child: Padding(
            padding: padding.copyWith(top: topInset + topGap),
            child: header,
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
