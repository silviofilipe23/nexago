import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';

class MatchHistoryMatchCard extends StatelessWidget {
  const MatchHistoryMatchCard({
    super.key,
    required this.match,
    this.compact = false,
    this.onTap,
  });

  final AthleteMatchHistoryItem match;
  final bool compact;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isWin = match.isWin;
    final accent = isWin ? AppColors.win : AppColors.live;
    final resultLabel = isWin ? 'V' : 'D';
    final dateStr =
        DateFormat('d MMM', 'pt_BR').format(toNexagoEventLocal(match.playedAt));
    final radius = compact ? 12.0 : 14.0;

    return Padding(
      padding: EdgeInsets.only(bottom: compact ? 8 : 10),
      child: Material(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(color: context.themeColors.surfaceRaised),
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 4,
                    decoration: BoxDecoration(
                      color: accent,
                      borderRadius: BorderRadius.horizontal(
                        left: Radius.circular(radius),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.all(compact ? 12 : 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: compact ? 28 : 32,
                                height: compact ? 28 : 32,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: accent.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  resultLabel,
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w900,
                                    color: accent,
                                  ),
                                ),
                              ),
                              SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      match.opponentLabel,
                                      style: theme.textTheme.titleSmall
                                          ?.copyWith(
                                            fontWeight: FontWeight.w800,
                                            color:
                                                context.themeColors.onSurface,
                                          ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      match.competitionLabel,
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                            color: context
                                                .themeColors
                                                .onSurfaceMuted,
                                          ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    match.scoreDisplay,
                                    style: theme.textTheme.titleSmall?.copyWith(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 10,
                                      color: context.themeColors.onSurface,
                                    ),
                                  ),
                                  Text(
                                    dateStr,
                                    style: AppTypography.mono(
                                      fontWeight: FontWeight.w600,
                                      color: context.themeColors.onSurfaceMuted,
                                      fontSize: 10,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          if (!compact && match.setsDisplay != null) ...[
                            SizedBox(height: 8),
                            Text(
                              match.setsDisplay!,
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            ),
                          ],
                          if (match.isMvp) ...[
                            SizedBox(height: 8),
                            Row(
                              children: [
                                Icon(
                                  Icons.star_rounded,
                                  size: compact ? 14 : 16,
                                  color: AppColors.pending,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  'MVP',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.pending,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
