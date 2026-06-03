import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class ArenaSearchFlexibleBanner extends StatelessWidget {
  const ArenaSearchFlexibleBanner({
    super.key,
    required this.boostPercent,
    required this.flexibleTime,
    required this.onToggle,
  });

  final int boostPercent;
  final bool flexibleTime;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.pending.withValues(alpha: 0.35),
          style: BorderStyle.solid,
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.bolt_rounded,
            color: AppColors.pending,
            size: 22,
          ),
          SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.35,
                ),
                children: [
                  const TextSpan(
                    text: 'Solte o horário para ver ',
                  ),
                  TextSpan(
                    text: '+$boostPercent% opções',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.pending,
                    ),
                  ),
                  const TextSpan(text: ' nas arenas próximas.'),
                ],
              ),
            ),
          ),
          SizedBox(width: 8),
          OutlinedButton(
            onPressed: onToggle,
            style: OutlinedButton.styleFrom(
              foregroundColor:
                  flexibleTime ? AppColors.black : AppColors.pending,
              backgroundColor:
                  flexibleTime ? AppColors.pending : Colors.transparent,
              side: BorderSide(color: AppColors.pending),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            child: Text(
              'Flexível',
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
