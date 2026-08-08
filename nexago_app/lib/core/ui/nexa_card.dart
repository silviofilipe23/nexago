import 'package:flutter/material.dart';

import '../theme/app_borders.dart';
import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Superfície de card padrão: fundo `surfaceCard`, borda sutil, raio `lg`,
/// ink de toque quando [onTap] é fornecido. Dark/light-safe.
class NexaCard extends StatelessWidget {
  const NexaCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.radius = AppRadii.lg,
    this.color,
    this.side,
    this.shadows,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;
  final BorderSide? side;
  final List<BoxShadow>? shadows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: side ?? AppBorders.baseSide(colors),
    );

    final Widget content = Padding(padding: padding, child: child);

    final card = Material(
      color: color ?? colors.surfaceCard,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : InkWell(onTap: onTap, child: content),
    );

    final boxShadows = shadows;
    if (boxShadows == null) return card;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: boxShadows,
      ),
      child: card,
    );
  }
}
