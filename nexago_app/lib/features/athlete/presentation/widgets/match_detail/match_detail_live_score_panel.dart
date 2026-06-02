import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_section_header.dart';

class MatchDetailLiveScorePanel extends StatelessWidget {
  const MatchDetailLiveScorePanel({super.key, required this.detail});

  final AthleteMatchDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final setNum = (detail.currentSetIndex ?? detail.sets.length - 1) + 1;
    final our = detail.currentSetOurPoints ?? 0;
    final opp = detail.currentSetOpponentPoints ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MatchDetailSectionHeader(
          eyebrow: 'PLACAR AO VIVO',
          title: 'Set $setNum',
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.surfaceRaised),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppColors.brand,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            detail.ourTeam.label,
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: AppColors.onSurface,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Text(
                      detail.opponentTeam.label,
                      textAlign: TextAlign.end,
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.onSurfaceMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$our',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: AppColors.brand,
                      height: 1,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      ':',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: AppColors.onSurfaceMuted,
                        fontWeight: FontWeight.w300,
                      ),
                    ),
                  ),
                  Text(
                    '$opp',
                    style: theme.textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: AppColors.onSurface,
                      height: 1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _PointButton(
                      label: '+ ${detail.ourTeam.label}',
                      accent: AppColors.brand,
                      onTap: () => showAppSnackBar(
                        context,
                        'DEMO • placar atualizado pela organização.',
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _PointButton(
                      label: '+ ${detail.opponentTeam.label}',
                      accent: AppColors.onSurfaceMuted,
                      onTap: () => showAppSnackBar(
                        context,
                        'DEMO • placar atualizado pela organização.',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'DEMO • ATUALIZA PELO PLACAR DA ORGANIZAÇÃO',
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: AppColors.onSurfaceMuted,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PointButton extends StatelessWidget {
  const _PointButton({
    required this.label,
    required this.accent,
    required this.onTap,
  });

  final String label;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isBrand = accent == AppColors.brand;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isBrand
                  ? AppColors.brand.withValues(alpha: 0.7)
                  : AppColors.onSurfaceMuted.withValues(alpha: 0.35),
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: isBrand ? AppColors.brand : AppColors.onSurface,
              height: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}
