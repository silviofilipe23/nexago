import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

class PartnerInviteMetricsRow extends StatelessWidget {
  const PartnerInviteMetricsRow({
    super.key,
    required this.prizeLabel,
    required this.shareFeeLabel,
  });

  final String prizeLabel;
  final String shareFeeLabel;

  static const _eyebrowStyle = TextStyle(
    fontSize: 9,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.4,
    height: 1.2,
  );

  static const _valueStyle = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w900,
    height: 1.05,
  );

  static const _footnoteStyle = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w500,
    height: 1.2,
  );

  @override
  Widget build(BuildContext context) {
    final onSurface = context.themeColors.onSurface;
    final onSurfaceMuted = context.themeColors.onSurfaceMuted;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _MetricCard(
              borderColor: AppColors.brand.withValues(alpha: 0.45),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    height: 14,
                    child: Row(
                      children: [
                        Icon(
                          Icons.emoji_events_outlined,
                          size: 14,
                          color: AppColors.brand,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'EM DISPUTA',
                          style: AppTypography.mono(
                            color: AppColors.brand,
                          ).merge(_eyebrowStyle),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    prizeLabel,
                    style: AppTypography.soraRegular(
                      color: onSurface,
                    ).merge(_valueStyle),
                  ),
                  const SizedBox(height: 4),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _MetricCard(
              borderColor: onSurfaceMuted.withValues(alpha: 0.22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    height: 14,
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'SUA PARTE',
                        style: AppTypography.mono(
                          color: onSurfaceMuted,
                        ).merge(_eyebrowStyle),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    shareFeeLabel,
                    style: AppTypography.soraRegular(
                      color: onSurface,
                    ).merge(_valueStyle),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'cada um paga só a sua',
                    style: AppTypography.soraRegular(
                      color: onSurfaceMuted,
                    ).merge(_footnoteStyle),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.borderColor, required this.child});

  final Color borderColor;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
      ),
      child: child,
    );
  }
}
