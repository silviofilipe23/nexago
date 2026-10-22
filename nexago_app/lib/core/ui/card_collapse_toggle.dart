import 'package:flutter/material.dart';

import '../theme/app_theme_colors.dart';

/// Seta de expandir/recolher dos cartões compactáveis (Início: próximo treino
/// e próxima reserva).
class CardCollapseToggle extends StatelessWidget {
  const CardCollapseToggle({
    super.key,
    required this.expanded,
    required this.onTap,
  });

  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      tooltip: expanded ? 'Recolher' : 'Expandir',
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
      padding: EdgeInsets.zero,
      icon: Icon(
        expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
        size: 22,
        color: context.themeColors.onSurfaceMuted,
      ),
    );
  }
}
