import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/nexa_bottom_action_bar.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class TournamentDetailBottomBar extends StatelessWidget {
  const TournamentDetailBottomBar({
    super.key,
    required this.enabled,
    required this.priceLabel,
    required this.spotsSubtitle,
    required this.onPressed,
  });

  final bool enabled;
  final String priceLabel;
  final String spotsSubtitle;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return NexaBottomActionBar(
      hint: spotsSubtitle,
      leading: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'a partir de',
            style: AppTypography.soraRegular(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
          Text(
            priceLabel,
            style: AppTypography.soraRegular(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: context.themeColors.onSurface,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
      action: SizedBox(
        height: 48,
        child: FilledButton(
          onPressed: enabled ? onPressed : null,
          style: FilledButton.styleFrom(
            disabledBackgroundColor:
                context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
            foregroundColor: AppColors.black,
            disabledForegroundColor: context.themeColors.onSurfaceMuted,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: Text(
            'Inscrever minha dupla',
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: enabled
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}
