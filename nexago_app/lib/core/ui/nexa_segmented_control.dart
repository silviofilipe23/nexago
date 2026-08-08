import 'package:flutter/material.dart';

import '../theme/app_motion.dart';
import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class NexaSegment<T> {
  const NexaSegment({required this.value, required this.label});

  final T value;
  final String label;
}

/// Segmented control padrão NexaGO — substitui as variantes locais de
/// descoberta, ranking e inscrição.
class NexaSegmentedControl<T> extends StatelessWidget {
  const NexaSegmentedControl({
    super.key,
    required this.segments,
    required this.selected,
    required this.onChanged,
  });

  final List<NexaSegment<T>> segments;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: AppRadii.xlAll,
      ),
      child: Row(
        children: [
          for (final segment in segments)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (segment.value != selected) onChanged(segment.value);
                },
                child: AnimatedContainer(
                  duration: AppMotion.base,
                  curve: AppMotion.curve,
                  padding:
                      const EdgeInsets.symmetric(vertical: AppSpacing.sm + 2),
                  decoration: BoxDecoration(
                    color: segment.value == selected
                        ? colors.brand
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppRadii.xl - 4),
                  ),
                  child: Text(
                    segment.label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.labelL.copyWith(
                      color: segment.value == selected
                          ? colors.black
                          : colors.onSurfaceMuted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
