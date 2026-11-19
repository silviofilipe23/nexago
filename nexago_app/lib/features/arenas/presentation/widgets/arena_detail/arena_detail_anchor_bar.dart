import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Um atalho da barra de seções do perfil.
class ArenaDetailAnchor {
  const ArenaDetailAnchor({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;
}

/// Atalhos para as seções do perfil ("Horários · Quadras · Sobre…"). Fica no
/// conteúdo e, quando sai pelo topo, uma cópia gruda abaixo da barra de
/// status (ver `ArenaDetailPage`).
class ArenaDetailAnchorBar extends StatelessWidget {
  const ArenaDetailAnchorBar({
    super.key,
    required this.anchors,
    this.horizontalPadding = 20,
  });

  /// Altura da fileira (sem a barra de status).
  static const double height = 52;

  final List<ArenaDetailAnchor> anchors;
  final double horizontalPadding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(
          horizontal: horizontalPadding,
          vertical: 8,
        ),
        itemCount: anchors.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final anchor = anchors[i];
          return ActionChip(
            label: Text(anchor.label),
            onPressed: anchor.onTap,
            labelStyle: TextStyle(
              fontWeight: FontWeight.w700,
              color: colors.onSurface,
            ),
            backgroundColor: colors.surfaceCard,
            side: BorderSide(color: colors.outline.withValues(alpha: 0.45)),
            shape: const StadiumBorder(),
          );
        },
      ),
    );
  }
}
