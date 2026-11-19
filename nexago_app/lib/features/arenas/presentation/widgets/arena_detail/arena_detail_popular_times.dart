import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_popular_times.dart';

/// "Movimento" do dia escolhido na agenda: barras por hora (relativas à hora
/// mais cheia da semana), a frase do pico e, com horário escolhido, como ele
/// costuma estar. A barra do horário escolhido fica laranja.
class ArenaDetailPopularTimes extends StatelessWidget {
  const ArenaDetailPopularTimes({
    super.key,
    required this.view,
    required this.weekdayLabel,
  });

  static const double barsHeight = 56;
  static const int labelEvery = 3;

  final PopularDayView view;

  /// Ex.: "sexta".
  final String weekdayLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final selected = view.selectedHour;

    return Semantics(
      container: true,
      label: [
        'Movimento de $weekdayLabel',
        view.headline,
        if (view.selectedLabel != null) view.selectedLabel!,
      ].join('. '),
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'MOVIMENTO DE ${weekdayLabel.toUpperCase()}',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
              color: colors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            view.headline,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: barsHeight,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < view.values.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 1.5),
                      child: _Bar(
                        value: view.values[i],
                        highlighted: selected == view.firstHour + i,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              for (var i = 0; i < view.values.length; i++)
                Expanded(
                  child: Text(
                    (view.firstHour + i) % labelEvery == 0
                        ? '${view.firstHour + i}h'
                        : '',
                    maxLines: 1,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.visible,
                    softWrap: false,
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w500,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ),
            ],
          ),
          if (view.selectedLabel != null) ...[
            const SizedBox(height: 8),
            Text(
              view.selectedLabel!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: colors.brandText,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            'Média das últimas semanas, pelas reservas feitas.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: colors.onSurfaceMuted,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.value, required this.highlighted});

  final int value;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final height = value <= 0
        ? 2.0
        : (ArenaDetailPopularTimes.barsHeight * value / 100).clamp(4.0, 56.0);
    final busy = value >= kPopularBusyThreshold;
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: highlighted
            ? AppColors.brand
            : colors.onSurfaceMuted.withValues(alpha: busy ? 0.55 : 0.3),
        borderRadius: BorderRadius.circular(3),
      ),
    );
  }
}
