import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';

class MatchDetailXpCard extends StatelessWidget {
  const MatchDetailXpCard({super.key, required this.xp});

  final MatchDetailXpInfo xp;

  static const _radius = 16.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ClipRRect(
      borderRadius: BorderRadius.circular(_radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.brand.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(_radius),
            border: Border.all(
              color: AppColors.brand.withValues(alpha: 0.45),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.brand.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.brand.withValues(alpha: 0.35),
                      ),
                    ),
                    child: const Icon(
                      Icons.bolt_rounded,
                      color: AppColors.brand,
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        RichText(
                          text: TextSpan(
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: Colors.white.withValues(alpha: 0.92),
                            ),
                            children: [
                              if (xp.xpGained != null)
                                TextSpan(
                                  text: '+${xp.xpGained} XP • você subiu para ',
                                )
                              else
                                const TextSpan(
                                  text: 'Vitória • você está em ',
                                ),
                              TextSpan(
                                text: xp.rankLabel,
                                style: const TextStyle(color: AppColors.brand),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          xp.levelProgressLabel != null
                              ? '${xp.streakLabel} • ${xp.levelProgressLabel}'
                              : xp.streakLabel,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.white.withValues(alpha: 0.55),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (xp.progress != null) ...[
                const SizedBox(height: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: xp.progress!.clamp(0.0, 1.0),
                    minHeight: 6,
                    backgroundColor: Colors.white.withValues(alpha: 0.10),
                    color: AppColors.brand,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
