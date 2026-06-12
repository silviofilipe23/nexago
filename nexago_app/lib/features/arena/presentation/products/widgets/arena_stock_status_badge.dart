import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';

class ArenaStockStatusBadge extends StatelessWidget {
  const ArenaStockStatusBadge({
    super.key,
    required this.label,
    required this.color,
  });

  const ArenaStockStatusBadge.outOfStock()
      : label = 'Esgotado',
        color = AppColors.live;

  const ArenaStockStatusBadge.lowStock()
      : label = 'Estoque baixo',
        color = AppColors.pending;

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
