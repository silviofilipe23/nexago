import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';

/// Três números do topo do perfil: nota dos atletas, preço de entrada por
/// hora e quadras (com quantas têm horário livre hoje).
class ArenaDetailMetricsBar extends StatelessWidget {
  const ArenaDetailMetricsBar({
    super.key,
    required this.rating,
    required this.reviewsCount,
    required this.entryPricePerHour,
    required this.totalCourts,
    required this.freeCourtsToday,
  });

  final double rating;
  final int reviewsCount;

  /// Menor preço/h da arena; `null` quando nenhuma quadra tem preço.
  final double? entryPricePerHour;
  final int totalCourts;
  final int freeCourtsToday;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hasReviews = reviewsCount > 0 && rating > 0;
    final ratingValue =
        hasReviews ? rating.toStringAsFixed(1).replaceAll('.', ',') : 'Nova';
    final ratingLabel = hasReviews
        ? '$reviewsCount ${reviewsCount == 1 ? 'avaliação' : 'avaliações'}'
        : 'Sem avaliações';
    final price = entryPricePerHour;
    final courtsLabel = freeCourtsToday > 0
        ? 'Quadras · $freeCourtsToday com vaga hoje'
        : 'Quadras';
    final divider = VerticalDivider(
      width: 1,
      color: colors.outline.withValues(alpha: 0.35),
    );

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(
              child: _MetricColumn(
                value: ratingValue,
                label: ratingLabel,
                icon: hasReviews ? Icons.star_rounded : null,
              ),
            ),
            divider,
            Expanded(
              child: _MetricColumn(
                value: price == null ? '—' : formatBRLWhole(price),
                label: 'A partir de /h',
              ),
            ),
            divider,
            Expanded(
              child: _MetricColumn(
                value: '$totalCourts',
                label: courtsLabel,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricColumn extends StatelessWidget {
  const _MetricColumn({required this.value, required this.label, this.icon});

  final String value;
  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final valueStyle = AppTypography.mono(
      fontWeight: FontWeight.w900,
      color: colors.brandText,
      fontSize: 20,
      height: 1,
    );
    return Semantics(
      label: '$value, $label',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 18, color: colors.pending),
                  const SizedBox(width: 3),
                ],
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(value, maxLines: 1, style: valueStyle),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
