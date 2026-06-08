import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_public_profile_models.dart';

class PublicProfileSportsSection extends StatelessWidget {
  const PublicProfileSportsSection({super.key, required this.sports});

  final List<AthletePublicSportEntry> sports;

  @override
  Widget build(BuildContext context) {
    if (sports.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Esportes',
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              Spacer(),
              Text(
                'COMPETIR',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          SizedBox(height: 12),
          for (final sport in sports) ...[
            _SportCard(entry: sport),
            SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _SportCard extends StatelessWidget {
  const _SportCard({required this.entry});

  static const _levelLabelWidth = 92.0;

  final AthletePublicSportEntry entry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: entry.isPrimary
                  ? AppColors.brand.withValues(alpha: 0.12)
                  : context.themeColors.surfaceRaised,
              border: Border.all(
                color: entry.isPrimary
                    ? AppColors.brand.withValues(alpha: 0.25)
                    : context.themeColors.surfaceRaised,
              ),
            ),
            child: Icon(
              Icons.bolt_rounded,
              size: 22,
              color: entry.isPrimary ? AppColors.brand : context.themeColors.onSurfaceMuted,
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        entry.label,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    if (entry.isPrimary) ...[
                      SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.brand,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'PRINCIPAL',
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: _LevelBar(segments: entry.levelSegments),
                    ),
                    SizedBox(width: 10),
                    SizedBox(
                      width: _levelLabelWidth,
                      child: Text(
                        entry.levelLabel,
                        textAlign: TextAlign.end,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LevelBar extends StatelessWidget {
  const _LevelBar({required this.segments});

  final int segments;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < athleteLevelSegmentCount; i++)
          Expanded(
            child: Container(
              height: 5,
              margin: EdgeInsets.only(
                right: i < athleteLevelSegmentCount - 1 ? 4 : 0,
              ),
              decoration: BoxDecoration(
                color: i < segments
                    ? AppColors.brand
                    : context.themeColors.surfaceRaised,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
      ],
    );
  }
}
