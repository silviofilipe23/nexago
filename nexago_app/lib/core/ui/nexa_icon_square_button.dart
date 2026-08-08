import 'package:flutter/material.dart';

import '../theme/app_borders.dart';
import '../theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Botão quadrado de ícone (voltar, fechar, compartilhar, calendário).
class NexaIconSquareButton extends StatelessWidget {
  const NexaIconSquareButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.size = 40,
    this.tooltip,
    this.iconColor,
    this.background,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double size;
  final String? tooltip;
  final Color? iconColor;

  /// Fundo customizado (ex.: translúcido escuro sobre capa). `null` mantém
  /// o padrão `surfaceRaised`.
  final Color? background;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final button = Material(
      color: background ?? colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.mdAll,
        side: AppBorders.subtleSide(colors),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: size,
          height: size,
          child: Icon(icon, size: 20, color: iconColor ?? colors.onSurface),
        ),
      ),
    );
    if (tooltip == null) return button;
    return Tooltip(message: tooltip!, child: button);
  }
}
