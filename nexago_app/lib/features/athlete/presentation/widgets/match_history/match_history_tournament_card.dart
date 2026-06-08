import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';

class MatchHistoryTournamentCard extends StatelessWidget {
  const MatchHistoryTournamentCard({
    super.key,
    required this.tournament,
    this.onTap,
  });

  final AthleteTournamentHistoryItem tournament;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final rankStyle = _rankStyle(tournament.medal, tournament.placement);
    final venue = tournament.venue.trim();
    final period = tournament.periodLabel.trim();
    final categoryTag = _categoryTag();
    final record = '${tournament.wins}V ${tournament.losses}D';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.surfaceRaised),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _RankBadge(
                  label: rankStyle.label,
                  background: rankStyle.background,
                  foreground: rankStyle.foreground,
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tournament.name,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: AppColors.onSurface,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (venue.isNotEmpty) ...[
                        SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(
                              Icons.location_on_outlined,
                              size: 14,
                              color: AppColors.onSurfaceMuted.withValues(
                                alpha: 0.85,
                              ),
                            ),
                            SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                venue,
                                style: AppTypography.soraRegular(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.onSurfaceMuted,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                      SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (period.isNotEmpty)
                            _MetaPill(
                              label: period,
                              foreground: AppColors.onSurface,
                            ),
                          if (categoryTag.isNotEmpty)
                            _MetaPill(
                              label: categoryTag,
                              foreground: AppColors.onSurface,
                            ),
                          _MetaPill(
                            label: record,
                            background: AppColors.win.withValues(alpha: 0.12),
                            foreground: AppColors.win,
                            borderColor: AppColors.win.withValues(alpha: 0.22),
                            mono: true,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 4),
                Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.55),
                  size: 22,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _categoryTag() {
    final category = tournament.categoryLabel.trim().toUpperCase();
    final gender = tournament.genderLabel.trim().toUpperCase();
    if (category.isEmpty && gender.isEmpty) return '';
    if (gender.isEmpty) return category;
    if (category.isEmpty) return gender;
    return '$category · $gender';
  }
}

class _RankBadge extends StatelessWidget {
  const _RankBadge({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 16,
          fontWeight: FontWeight.w900,
          color: foreground,
        ),
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill({
    required this.label,
    required this.foreground,
    this.background,
    this.borderColor,
    this.mono = false,
  });

  final String label;
  final Color foreground;
  final Color? background;
  final Color? borderColor;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background ?? AppColors.surfaceRaised.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(6),
        border: borderColor != null ? Border.all(color: borderColor!) : null,
      ),
      child: Text(
        label,
        style: mono
            ? AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: foreground,
                letterSpacing: 0.4,
              )
            : AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: foreground,
                letterSpacing: 0.3,
              ),
      ),
    );
  }
}

class _RankStyle {
  const _RankStyle({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;
}

_RankStyle _rankStyle(TournamentPlacement medal, int placement) {
  final label = placement > 0 ? '$placementº' : '—';

  return switch (medal) {
    TournamentPlacement.gold => _RankStyle(
      label: label,
      background: const Color(0xFFE5B82E),
      foreground: Colors.black,
    ),
    TournamentPlacement.silver => _RankStyle(
      label: label,
      background: const Color(0xFFB8BEC8),
      foreground: Colors.black,
    ),
    TournamentPlacement.bronze => _RankStyle(
      label: label,
      background: const Color(0xFFCD7F32),
      foreground: Colors.black,
    ),
    TournamentPlacement.other => _RankStyle(
      label: label,
      background: AppColors.surfaceRaised,
      foreground: AppColors.onSurfaceMuted,
    ),
  };
}
