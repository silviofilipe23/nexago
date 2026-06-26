import 'package:flutter/material.dart';

import '../theme/app_theme_colors.dart';

/// Header de topo que desliza para fora ao rolar o conteúdo para baixo e
/// reaparece imediatamente ao rolar para cima (comportamento estilo iOS).
///
/// Use como primeiro sliver de um [CustomScrollView]. O fundo é opaco para que,
/// ao reaparecer sobre o conteúdo já rolado, não haja vazamento visual; o padding
/// superior já inclui a safe area do dispositivo.
class NexaFloatingHeaderSliver extends StatelessWidget {
  const NexaFloatingHeaderSliver({
    super.key,
    required this.child,
    this.padding = EdgeInsets.zero,
    this.topGap = 16,
    this.backgroundColor,
    this.snapMode = FloatingHeaderSnapMode.overlay,
  });

  /// Conteúdo do header (título, ícones, etc.).
  final Widget child;

  /// Espaçamento horizontal/inferior do header. O topo é calculado a partir da
  /// safe area somada a [topGap].
  final EdgeInsets padding;

  /// Folga adicionada abaixo da safe area no topo do header.
  final double topGap;

  /// Fundo opaco atrás do header. Quando nulo, usa `themeColors.canvas`.
  final Color? backgroundColor;

  /// Como o header parcialmente visível se anima ao fim do gesto de scroll.
  final FloatingHeaderSnapMode snapMode;

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;
    final background = backgroundColor ?? context.themeColors.canvas;

    return SliverFloatingHeader(
      snapMode: snapMode,
      child: ColoredBox(
        color: background,
        child: Padding(
          padding: padding.copyWith(top: topInset + topGap),
          child: child,
        ),
      ),
    );
  }
}
