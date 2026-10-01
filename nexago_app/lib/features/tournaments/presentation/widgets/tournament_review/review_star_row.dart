import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Cinco estrelas tocáveis. Com [allowClear], tocar de novo na estrela marcada limpa a nota —
/// é como o atleta desfaz um aspecto opcional.
class ReviewStarRow extends StatelessWidget {
  const ReviewStarRow({
    super.key,
    required this.value,
    required this.onChanged,
    required this.keyPrefix,
    this.size = 40,
    this.allowClear = false,
    this.enabled = true,
  });

  final int? value;
  final ValueChanged<int?> onChanged;

  /// Prefixo das chaves das estrelas (`overall-4`, `schedule-2`): a tela tem várias fileiras.
  final String keyPrefix;
  final double size;
  final bool allowClear;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final star = index + 1;
        final filled = (value ?? 0) >= star;
        return Semantics(
          button: true,
          selected: value == star,
          label: '$star de 5',
          child: IconButton(
            key: ValueKey('$keyPrefix-$star'),
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints:
                BoxConstraints.tightFor(width: size + 8, height: size + 8),
            onPressed: enabled
                ? () => onChanged(allowClear && value == star ? null : star)
                : null,
            icon: Icon(
              filled ? Icons.star_rounded : Icons.star_outline_rounded,
              size: size,
              color: filled ? AppColors.brand : muted,
            ),
          ),
        );
      }),
    );
  }
}
