import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

class PartnerInviteBottomActions extends StatelessWidget {
  const PartnerInviteBottomActions({
    super.key,
    required this.primaryLabel,
    required this.onPrimary,
    required this.onDecline,
    this.primarySubtitle = 'Leva 30s · você paga sua parte depois',
    this.primaryLoading = false,
    this.declineLoading = false,
    this.enabled = true,
  });

  final String primaryLabel;
  final String primarySubtitle;
  final VoidCallback? onPrimary;
  final VoidCallback? onDecline;
  final bool primaryLoading;
  final bool declineLoading;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final busy = primaryLoading || declineLoading;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppColors.brand.withValues(alpha: 0.25),
                blurRadius: 20,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: FilledButton(
            onPressed: !enabled || busy ? null : onPrimary,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.35),
              disabledForegroundColor: AppColors.black.withValues(alpha: 0.45),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: primaryLoading
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            primaryLabel,
                            style: AppTypography.soraRegular(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              color: AppColors.black,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(
                            Icons.arrow_forward_rounded,
                            size: 18,
                            color: AppColors.black,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        primarySubtitle,
                        style: AppTypography.soraRegular(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.black.withValues(alpha: 0.65),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 14),
        TextButton(
          onPressed: busy ? null : onDecline,
          child: declineLoading
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(
                  'Agora não, recusar convite',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
        ),
      ],
    );
  }
}
